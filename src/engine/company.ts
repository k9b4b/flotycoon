import { BALANCE } from '../data/balance';
import { HOME_BASE } from '../data/cities';
import { FEMALE_NAMES, LAST_NAMES, MALE_NAMES, NICKNAMES, QUIRKS, TRUCK_MODELS } from '../data/flavor';
import { PERKS, PERK_BY_ID, PERK_SALARY, type PerkId } from '../data/perks';
import { EXTRA_DRIVERS, MARKETS, RANKS, UPGRADES, WORKSHOP, YARD, type UpgradeId } from '../data/progression';
import { driverName, fmtPLN, g, log, newId, spend, type ActionResult } from './core';
import { FRESH_DUTY } from './drivingRules';
import { clamp } from './effects';
import { qPush } from './queue';
import { chance, pick, rand, randInt, randRange, type RngState } from './rng';
import type { Driver, GameState, Truck, TruckOffer } from './types';

/**
 * Firma jako całość: ranga z reputacji, baza, rynek pracy i salon aut.
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

function randomPlate(r: RngState): string {
  const letters = 'ABCDEFGHJKLMNPRSTUWXYZ';
  const l = () => letters[Math.floor(rand(r) * letters.length)];
  return `WX ${randInt(r, 10, 99)}${l()}${l()}${randInt(r, 1, 9)}`;
}

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
    salaryPerDay: Math.round(300 + quality * 2.6 + perkPay + randInt(r, 0, 40)),
    hiredAt: s.now,
    kmDriven: 0,
    jobsDone: 0,
    lateJobs: 0,
    duty: FRESH_DUTY(s.now - 24 * 60),
  };
}

export function usedOffer(s: GameState): TruckOffer {
  const r = s.rng;
  const m = pick(r, TRUCK_MODELS);
  const odometerKm = randInt(r, 20, 90) * 10_000;
  const euro: 5 | 6 = odometerKm > 600_000 && chance(r, 0.4) ? 5 : 6;
  return {
    id: newId(s, 'o'),
    plate: randomPlate(r),
    brand: m.brand,
    model: m.model,
    euro,
    fuelL100: Math.round((m.fuelL100 + randRange(r, -0.5, 2)) * 10) / 10,
    odometerKm,
    wear: clamp(odometerKm / 1_400_000 + randRange(r, 0, 0.12), 0, 0.95),
    leasePerDay: Math.round((euro === 5 ? 160 : 205) + (900_000 - odometerKm) / 11_000 + randInt(r, 0, 30)),
    deposit: 6_000,
    condition: 'used',
  };
}

function newOffer(s: GameState): TruckOffer {
  const r = s.rng;
  const m = pick(r, TRUCK_MODELS);
  return {
    id: newId(s, 'o'),
    plate: randomPlate(r),
    brand: m.brand,
    model: m.model,
    euro: 6,
    // Nowe auto pali mniej: nowszy silnik i aerodynamika.
    fuelL100: Math.round((m.fuelL100 - randRange(r, 1, 2.2)) * 10) / 10,
    odometerKm: randInt(r, 0, 5) * 1_000,
    wear: 0,
    leasePerDay: Math.round(430 + randInt(r, 0, 90)),
    deposit: 15_000,
    condition: 'new',
  };
}

export function refreshCandidates(s: GameState) {
  const n = MARKETS.candidatesBase + Math.min(4, rankIndex(s.reputation));
  s.candidates = Array.from({ length: n }, () => generateDriver(s, 'c'));
  qPush(s.queue, s.now + MARKETS.candidatesRefreshMin, { type: 'CANDIDATES_REFRESH' });
}

export function refreshTruckOffers(s: GameState) {
  const rank = rankIndex(s.reputation);
  const n = MARKETS.truckOffersBase + Math.floor(rank / 2);
  const newShare = rank >= MARKETS.newTrucksRank ? 0.25 + 0.05 * rank : 0;
  s.truckOffers = Array.from({ length: n }, () => (chance(s.rng, newShare) ? newOffer(s) : usedOffer(s)));
  qPush(s.queue, s.now + MARKETS.truckOffersRefreshMin, { type: 'OFFERS_REFRESH' });
}

/** Zamienia ofertę salonu na auto stojące na bazie, bez kierowcy. */
export function truckFromOffer(o: TruckOffer, cityId: string, driverId: string | null): Truck {
  return { ...o, cityId, driverId, tripId: null, serviceUntil: null };
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

export function leaseOffer(s: GameState, offerId: string): ActionResult {
  const o = s.truckOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, error: 'Oferta nieaktualna. Handlarz sprzedał komuś „od ręki”.' };
  if (s.trucks.length >= fleetCap(s)) return { ok: false, error: `Plac mieści ${fleetCap(s)} aut. Czas na większy.` };
  if (s.cash < o.deposit) return { ok: false, error: `Kaucja to ${fmtPLN(o.deposit)}.` };
  spend(s, o.deposit, 'fleet');
  s.truckOffers = s.truckOffers.filter((x) => x.id !== offerId);
  // Bez automatycznego przydziału: kluczyki wręcza gracz.
  const t = truckFromOffer({ ...o, id: newId(s, 't') }, HOME_BASE, null);
  s.trucks.push(t);
  const msg = `${o.condition === 'new' ? 'Nowiutki' : 'Używany'} ${t.brand} ${t.model} (${t.plate}) na placu. Czeka na kierowcę.`;
  log(s, 'good', msg);
  return { ok: true, message: msg };
}

export function returnTruck(s: GameState, truckId: string): ActionResult {
  const t = s.trucks.find((x) => x.id === truckId);
  if (!t) return { ok: false, error: 'Nie ma takiego auta.' };
  if (t.tripId || t.serviceUntil !== null) return { ok: false, error: 'Auto jest zajęte. Zwrot po powrocie na plac.' };
  if (s.trucks.length <= 1) return { ok: false, error: 'To ostatnie auto. Bez niego zostaje tylko rower.' };
  const penalty = t.leasePerDay * MARKETS.returnPenaltyDays;
  spend(s, penalty, 'lease');
  s.trucks = s.trucks.filter((x) => x.id !== t.id);
  const msg = `${t.brand} ${t.model} (${t.plate}) wraca do leasingodawcy. Kara ${fmtPLN(penalty)}, kaucja przepada.`;
  log(s, 'info', msg);
  return { ok: true, message: msg };
}

// ─── Akcje gracza: baza ─────────────────────────────────────────────────────

export function upgradeYard(s: GameState): ActionResult {
  const next = YARD[s.base.yard + 1];
  if (!next) return { ok: false, error: 'Większego placu w okolicy nie ma.' };
  if (rankIndex(s.reputation) < next.rank) return { ok: false, error: `Wymaga rangi „${RANKS[next.rank].name}”.` };
  if (s.cash < next.cost) return { ok: false, error: `${next.name} kosztuje ${fmtPLN(next.cost)}.` };
  spend(s, next.cost, 'fleet');
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
  if (s.cash < u.cost) return { ok: false, error: `${u.name} kosztuje ${fmtPLN(u.cost)}.` };
  spend(s, u.cost, 'fleet');
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
