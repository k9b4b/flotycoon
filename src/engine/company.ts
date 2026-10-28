import { BALANCE } from '../data/balance';
import { FEMALE_NAMES, LAST_NAMES, MALE_NAMES, NICKNAMES, QUIRKS } from '../data/flavor';
import { hqProfile } from '../data/hq';
import { PERKS, PERK_BY_ID, PERK_SALARY, type PerkId } from '../data/perks';
import { EXTRA_DRIVERS, MARKETS, RANKS, UPGRADES, WORKSHOP, YARD, type UpgradeId } from '../data/progression';
import { driverName, fmtPLN, g, log, newId, spend, type ActionResult } from './core';
import { FRESH_DUTY } from './drivingRules';
import { clamp } from './effects';
import { qPush } from './queue';
import { chance, pick, randInt, type RngState } from './rng';
import type { Driver, GameState, Truck } from './types';

/**
 * Firma jako całość: ranga z reputacji, baza, rynek pracy.
 * Ranga podnosi jakość kandydatów i ofert, a baza decyduje o limitach.
 */

// ─── Ranga i reputacja ──────────────────────────────────────────────────────

export function rankIndex(rep: number): number {
  let i = 0;
  while (i + 1 < RANKS.length && rep >= RANKS[i + 1].minRep) i++;
  return i;
}

export function addReputation(s: GameState, delta: number) {
  const before = rankIndex(s.reputation);
  s.reputation = Math.max(0, s.reputation + delta);
  const after = rankIndex(s.reputation);
  if (after > before) {
    log(s, 'good', `Awans! ${s.companyName} to teraz „${RANKS[after].name}”. ${RANKS[after].perk}`);
  } else if (after < before) {
    log(s, 'bad', `Spadek rangi do „${RANKS[after].name}”. Na giełdzie już szepczą.`);
  }
}

export const fleetCap = (s: GameState) => YARD[s.base.yard].cap;
export const driverCap = (s: GameState) => fleetCap(s) + EXTRA_DRIVERS;

/** Koszt dzienny ulepszeń (pensja dyspozytora, utrzymanie warsztatu i biura). */
export function upgradesPerDay(s: GameState): number {
  return UPGRADES.filter((u) => s.base[u.id]).reduce((a, u) => a + u.perDay, 0);
}

// ─── Generatory kierowców i aut ─────────────────────────────────────────────

/**
 * Perki zależą od jakości kierowcy (średnia statystyk 0–100):
 * słaby ma 1–2 perki, głównie negatywne; świetny 2–3, głównie pozytywne, czasem rzadkie.
 */
export function rollPerks(r: RngState, quality: number): PerkId[] {
  const count = 1 + (chance(r, 0.5) ? 1 : 0) + (quality >= 70 && chance(r, 0.5) ? 1 : 0);
  const pGood = clamp(0.15 + ((quality - 20) / 75) * 0.75, 0.1, 0.9);
  const out: PerkId[] = [];
  for (let i = 0; i < count; i++) {
    const tone = chance(r, 0.15) ? 'mixed' : chance(r, pGood) ? 'good' : 'bad';
    const pool = PERKS.filter(
      (p) =>
        p.tone === tone &&
        (!p.rare || quality >= 65) &&
        !out.includes(p.id) &&
        !out.some((o) => p.excludes?.includes(o) || PERK_BY_ID[o].excludes?.includes(p.id)),
    );
    if (pool.length > 0) out.push(pick(r, pool).id);
  }
  return out;
}

/** Kandydat na kierowcę. Wyższa ranga = lepszy przekrój statystyk na rynku. */
export function generateDriver(s: GameState, prefix = 'd'): Driver {
  const r = s.rng;
  const rank = rankIndex(s.reputation);
  const female = chance(r, 0.18);
  let last = pick(r, LAST_NAMES);
  if (female) last = last.replace(/ski$/, 'ska').replace(/cki$/, 'cka');
  const lo = Math.min(55, 20 + rank * 5);
  const hi = Math.min(95, 75 + rank * 4);
  const stat = () => randInt(r, lo, hi);
  const stats = { experience: stat(), eco: stat(), reliability: stat(), stamina: stat(), morale: randInt(r, 55, 80) };
  // Dobry kierowca wie, ile jest wart: oczekiwania płacowe rosną ze statystykami.
  const quality = (stats.experience + stats.eco + stats.reliability + stats.stamina) / 4;
  const perks = rollPerks(r, quality);
  const perkPay = perks.reduce((a, id) => a + PERK_SALARY[PERK_BY_ID[id].tone], 0);
  return {
    id: newId(s, prefix),
    firstName: pick(r, female ? FEMALE_NAMES : MALE_NAMES),
    lastName: last,
    female,
    nickname: pick(r, NICKNAMES),
    quirk: pick(r, QUIRKS),
    stats,
    perks,
    // Lokalny rynek pracy: w stolicy drożej, na wschodzie taniej.
    salaryPerDay: Math.round((300 + quality * 2.6 + perkPay + randInt(r, 0, 40)) * hqProfile(s.hqCityId).salaryMul),
    hiredAt: s.now,
    kmDriven: 0,
    jobsDone: 0,
    lateJobs: 0,
    duty: FRESH_DUTY(s.now - 24 * 60),
  };
}

export function refreshCandidates(s: GameState) {
  const n = MARKETS.candidatesBase + Math.min(4, rankIndex(s.reputation));
  s.candidates = Array.from({ length: n }, () => generateDriver(s, 'c'));
  qPush(s.queue, s.now + MARKETS.candidatesRefreshMin, { type: 'CANDIDATES_REFRESH' });
}

// ─── Akcje gracza: ludzie ───────────────────────────────────────────────────

export const driverOfTruck = (s: GameState, t: Truck) => (t.driverId ? s.drivers.find((d) => d.id === t.driverId) ?? null : null);
export const truckOfDriver = (s: GameState, d: Driver) => s.trucks.find((t) => t.driverId === d.id) ?? null;

export function hireDriver(s: GameState, candidateId: string): ActionResult {
  const c = s.candidates.find((x) => x.id === candidateId);
  if (!c) return { ok: false, error: 'Ten kandydat już znalazł inną robotę.' };
  if (s.drivers.length >= driverCap(s)) return { ok: false, error: `Limit kierowców to ${driverCap(s)}. Większy plac, więcej ludzi.` };
  if (s.cash < BALANCE.hireFee) return { ok: false, error: `Rekrutacja kosztuje ${fmtPLN(BALANCE.hireFee)}.` };
  spend(s, BALANCE.hireFee, 'fleet');
  s.candidates = s.candidates.filter((x) => x.id !== candidateId);
  const d: Driver = { ...c, id: newId(s, 'd'), hiredAt: s.now, duty: FRESH_DUTY(s.now - 24 * 60) };
  s.drivers.push(d);
  // Bez automatycznego przydziału: gracz sam decyduje, kto czym jeździ.
  const msg = `Zatrudniono: ${driverName(d)}. Czeka na przydział auta. ${d.quirk}`;
  log(s, 'good', msg);
  return { ok: true, message: msg };
}

export function fireDriver(s: GameState, driverId: string): ActionResult {
  const d = s.drivers.find((x) => x.id === driverId);
  if (!d) return { ok: false, error: 'Nie ma takiego kierowcy.' };
  const t = truckOfDriver(s, d);
  if (t?.tripId) return { ok: false, error: `${d.nickname} jest w trasie. Zwolnić można po rozładunku.` };
  const severance = d.salaryPerDay * MARKETS.severanceDays;
  spend(s, severance, 'salaries');
  if (t) t.driverId = null;
  s.drivers = s.drivers.filter((x) => x.id !== d.id);
  const msg = `${d.nickname} odchodzi z firmy. Odprawa ${fmtPLN(severance)}. Zabrał${g(d)} kubek i magnes z lodówki.`;
  log(s, 'info', msg);
  return { ok: true, message: msg };
}

/**
 * Przesadza kierowcę do auta (albo zdejmuje go z auta, gdy driverId = null).
 * Jeśli auto ma już kierowcę, a przesadzany kierowca siedział w innym aucie, zamieniają się miejscami.
 * Jeśli przesadzany nie miał auta, dotychczasowy kierowca zostaje bez auta.
 */
export function assignDriver(s: GameState, truckId: string, driverId: string | null): ActionResult {
  const t = s.trucks.find((x) => x.id === truckId);
  if (!t) return { ok: false, error: 'Nie ma takiego auta.' };
  if (t.tripId) return { ok: false, error: 'Auto jest w trasie. Zmiana kierowcy po rozładunku.' };
  if (driverId === null) {
    t.driverId = null;
    return { ok: true, message: `${t.brand} ${t.model} stoi bez kierowcy.` };
  }
  const d = s.drivers.find((x) => x.id === driverId);
  if (!d) return { ok: false, error: 'Nie ma takiego kierowcy.' };
  if (d.training) return { ok: false, error: `${d.nickname} jest na szkoleniu. Wróci i usiądzie za kółkiem.` };
  const current = truckOfDriver(s, d);
  if (current === t) return { ok: true, message: `${d.nickname} już jeździ tym autem.` };
  if (current?.tripId) return { ok: false, error: `${d.nickname} jest w trasie innym autem.` };
  const other = driverOfTruck(s, t);
  if (current) current.driverId = other ? other.id : null;
  t.driverId = d.id;
  let msg = `${d.nickname} przesiada się do ${t.brand} ${t.model} (${t.plate}).`;
  if (other && current) msg += ` ${other.nickname} bierze ${current.brand} ${current.model} (${current.plate}).`;
  else if (other) msg += ` ${other.nickname} zostaje bez auta.`;
  log(s, 'info', msg);
  return { ok: true, message: msg };
}

// ─── Akcje gracza: auta ─────────────────────────────────────────────────────

// ─── Akcje gracza: baza ─────────────────────────────────────────────────────

/** Koszt budowy w siedzibie (ceny gruntu). Dyspozytorka to pensja, nie budowa, więc jej nie dotyczy. */
export const buildCost = (s: GameState, base: number) => Math.round((base * hqProfile(s.hqCityId).landMul) / 100) * 100;

export function upgradeYard(s: GameState): ActionResult {
  const next = YARD[s.base.yard + 1];
  if (!next) return { ok: false, error: 'Większego placu w okolicy nie ma.' };
  if (rankIndex(s.reputation) < next.rank) return { ok: false, error: `Wymaga rangi „${RANKS[next.rank].name}”.` };
  const cost = buildCost(s, next.cost);
  if (s.cash < cost) return { ok: false, error: `${next.name} kosztuje ${fmtPLN(cost)}.` };
  spend(s, cost, 'fleet');
  s.base.yard += 1;
  const msg = `${next.name}: miejsce na ${next.cap} aut. Szwagier w końcu odzyskał swoje podwórko.`;
  log(s, 'good', msg);
  return { ok: true, message: msg };
}

export function buyUpgrade(s: GameState, id: UpgradeId): ActionResult {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return { ok: false, error: 'Nieznane ulepszenie.' };
  if (s.base[id]) return { ok: false, error: `${u.name} już jest.` };
  if (rankIndex(s.reputation) < u.rank) return { ok: false, error: `Wymaga rangi „${RANKS[u.rank].name}”.` };
  const cost = buildCost(s, u.cost);
  if (s.cash < cost) return { ok: false, error: `${u.name} kosztuje ${fmtPLN(cost)}.` };
  spend(s, cost, 'fleet');
  s.base[id] = true;
  if (id === 'dispatcher') {
    s.base.autoDispatch = true;
    qPush(s.queue, s.now + MARKETS.dispatchEveryMin, { type: 'DISPATCH' });
  }
  const msg = `${u.name}: gotowe. ${u.description}`;
  log(s, 'good', msg);
  return { ok: true, message: msg };
}

export function setAutoDispatch(s: GameState, on: boolean): ActionResult {
  if (!s.base.dispatcher) return { ok: false, error: 'Najpierw trzeba zatrudnić dyspozytorkę.' };
  s.base.autoDispatch = on;
  return { ok: true, message: on ? 'Halina przejmuje stery.' : 'Halina odkłada słuchawkę. Przydzielasz ładunki sam.' };
}

/** Serwis z uwzględnieniem warsztatu. */
export function serviceModifiers(s: GameState) {
  return s.base.workshop ? WORKSHOP : { costMul: 1, timeMul: 1 };
}
