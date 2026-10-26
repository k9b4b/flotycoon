import { COURSE_BY_ID, MILESTONES, TRAINING, type CourseId } from '../data/development';
import { PERK_BY_ID, type PerkId } from '../data/perks';
import { truckOfDriver } from './company';
import { fmtPLN, g, log, spend, type ActionResult } from './core';
import { clamp } from './effects';
import { qPush } from './queue';
import { chance } from './rng';
import { formatGameTime } from './time';
import type { Driver, GameState } from './types';

/**
 * Rozwój kierowców: płatne szkolenia (statystyka w górę, czasem znika zły perk)
 * i perki zdobywane albo tracone z doświadczeniem na trasie.
 */

export const timesTaken = (d: Driver, id: CourseId) => d.courses?.[id] ?? 0;

/** Ile kurs da teraz temu kierowcy: mniej przy wysokiej statystyce i przy kolejnych powtórkach. */
export function courseGain(d: Driver, id: CourseId): number {
  const c = COURSE_BY_ID[id];
  const n = timesTaken(d, id);
  if (n >= TRAINING.maxRepeats) return 0;
  const v = d.stats[c.stat];
  return Math.max(2, Math.round(c.gain * ((100 - v) / 100 + 0.25) * TRAINING.repeatMul[n]));
}

export function trainDriver(s: GameState, driverId: string, courseId: CourseId): ActionResult {
  const d = s.drivers.find((x) => x.id === driverId);
  const c = COURSE_BY_ID[courseId];
  if (!d || !c) return { ok: false, error: 'Nie ma takiego kierowcy albo kursu.' };
  if (d.training) return { ok: false, error: `${d.nickname} już siedzi na szkoleniu.` };
  const t = truckOfDriver(s, d);
  if (t?.tripId) return { ok: false, error: `${d.nickname} jest w trasie. Szkolenie po rozładunku.` };
  if (timesTaken(d, courseId) >= TRAINING.maxRepeats) return { ok: false, error: `${d.nickname} zna ten kurs na pamięć. Instruktor prosi, żeby już nie przychodzić.` };
  if (s.cash < c.cost) return { ok: false, error: `Kurs kosztuje ${fmtPLN(c.cost)}.` };
  spend(s, c.cost, 'training');
  // Na czas szkolenia auto zostaje bez kierowcy: może je wziąć zmiennik.
  if (t) t.driverId = null;
  const until = s.now + c.days * 24 * 60;
  d.training = { course: courseId, until, truckId: t?.id ?? null };
  qPush(s.queue, until, { type: 'TRAINING_DONE', driverId: d.id });
  const msg = `${d.nickname} jedzie na „${c.name}” do ${formatGameTime(until)}. Koszt ${fmtPLN(c.cost)}.${t ? ` ${t.brand} ${t.model} czeka na zmiennika.` : ''}`;
  log(s, 'info', msg);
  return { ok: true, message: msg };
}

export function onTrainingDone(s: GameState, driverId: string) {
  const d = s.drivers.find((x) => x.id === driverId);
  if (!d?.training) return;
  const { course, truckId } = d.training;
  const c = COURSE_BY_ID[course];
  const gain = courseGain(d, course);
  d.stats[c.stat] = clamp(d.stats[c.stat] + gain);
  d.courses = { ...d.courses, [course]: timesTaken(d, course) + 1 };
  d.stats.morale = clamp(d.stats.morale + TRAINING.moraleAfter);
  d.training = null;
  const extra: string[] = [];
  if (c.fixes && d.perks.includes(c.fixes) && chance(s.rng, TRAINING.fixChance)) {
    d.perks = d.perks.filter((p) => p !== c.fixes);
    extra.push(`Pożegnał${g(d)} się z cechą „${PERK_BY_ID[c.fixes].name}”!`);
  }
  if (c.converts && d.perks.includes(c.converts[0]) && chance(s.rng, TRAINING.convertChance)) {
    d.perks = d.perks.map((p) => (p === c.converts![0] ? c.converts![1] : p));
    extra.push(`Z „${PERK_BY_ID[c.converts[0]].name}” zrobił${g(d)} się „${PERK_BY_ID[c.converts[1]].name}”.`);
  }
  // Wraca do swojego auta, jeśli nikt go nie zajął.
  const t = truckId ? s.trucks.find((x) => x.id === truckId) : null;
  let back = '';
  if (t && !t.driverId && !t.tripId) {
    t.driverId = d.id;
    back = ` Wraca do ${t.brand} ${t.model}.`;
  } else back = ' Czeka na przydział auta.';
  log(s, 'good', `${d.nickname} kończy „${c.name}”: ${STAT_NAMES[c.stat]} +${gain}.${extra.length ? ` ${extra.join(' ')}` : ''}${back}`);
}

const STAT_NAMES = { experience: 'doświadczenie', eco: 'eco-driving', reliability: 'niezawodność', stamina: 'kondycja' } as const;

/** Czy przebieg przekroczył próg `from` albo kolejny krok `step` za nim. */
function crossed(before: number, after: number, from: number, step: number) {
  const bucket = (v: number) => (v < from ? -1 : Math.floor((v - from) / step));
  return bucket(after) > bucket(before);
}

function gainPerk(s: GameState, d: Driver, id: PerkId, why: string) {
  if (d.perks.includes(id) || d.perks.length >= MILESTONES.maxPerks) return;
  const p = PERK_BY_ID[id];
  if (d.perks.some((o) => p.excludes?.includes(o) || PERK_BY_ID[o].excludes?.includes(id))) return;
  d.perks = [...d.perks, id];
  log(s, 'good', `${d.nickname} ${why} Nowa cecha: „${p.name}”.`);
}

function losePerk(s: GameState, d: Driver, id: PerkId, why: string) {
  if (!d.perks.includes(id)) return;
  d.perks = d.perks.filter((p) => p !== id);
  log(s, 'good', `${d.nickname} ${why} Koniec z cechą „${PERK_BY_ID[id].name}”.`);
}

/** Po każdym kursie: czy kierowca czegoś się nauczył albo czegoś oduczył. */
export function checkMilestones(s: GameState, d: Driver, kmBefore: number) {
  const km = d.kmDriven;
  const M = MILESTONES;
  if (crossed(kmBefore, km, M.shortcutsFromKm, M.stepKm) && chance(s.rng, M.shortcutsChance)) {
    gainPerk(s, d, 'zna_skroty', `ma już ${Math.round(km / 1000)} tys. km za kółkiem i zna objazdy, których nie ma na mapach.`);
  }
  if (crossed(kmBefore, km, M.folderFromKm, M.stepKm) && (d.fines ?? 0) === 0 && chance(s.rng, M.folderChance)) {
    if (d.perks.includes('zapominalski')) losePerk(s, d, 'zapominalski', `od ${Math.round(km / 1000)} tys. km nie dostał${g(d)} żadnego mandatu.`);
    else gainPerk(s, d, 'teczka', `od ${Math.round(km / 1000)} tys. km nie dostał${g(d)} żadnego mandatu.`);
  }
  if (crossed(kmBefore, km, M.unluckyFromKm, M.stepKm) && chance(s.rng, M.unluckyFixChance)) {
    losePerk(s, d, 'pechowiec', 'chyba wyczerpał{a} limit pecha.'.replace('{a}', g(d)));
  }
  if (d.jobsDone >= M.favoriteFromJobs && d.jobsDone % M.favoriteEvery === 0 && d.lateJobs / d.jobsDone < M.favoriteMaxLate && chance(s.rng, M.favoriteChance)) {
    gainPerk(s, d, 'ulubieniec', `ma ${d.jobsDone} kursów i prawie zero spóźnień. Magazynierzy odkładają kawę na każdy rozładunek.`);
  }
  if (d.stats.morale >= M.grumpyFixMorale && chance(s.rng, M.grumpyFixChance)) {
    losePerk(s, d, 'maruda', `od tygodnia się uśmiecha. W biurze podejrzewają, że to podróbka.`);
  }
}
