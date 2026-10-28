import { HOME_BASE } from '../data/cities';
import { TRUCK_MODELS } from '../data/flavor';
import { MARKETS, RANKS } from '../data/progression';
import { TRAILERS, TRAILER_LIST, TRAILER_WEIGHT, type TrailerType } from '../data/trailers';
import { fleetCap, rankIndex } from './company';
import { fmtPLN, log, newId, spend, type ActionResult } from './core';
import { clamp } from './effects';
import { qPush } from './queue';
import { chance, pick, pickWeighted, rand, randInt, randRange, type RngState } from './rng';
import type { GameState, Ownership, Trailer, TrailerOffer, Truck, TruckOffer } from './types';

/**
 * Rynek ciągników i naczep: nowe i używane, kupno albo leasing.
 * Zasady są proste i takie same dla obu:
 * - wartość = cena nowego × utrata z przebiegu/zużycia,
 * - kupno = wartość + marża handlarza; sprzedaż = wartość − marża; własny sprzęt nie ma raty,
 * - leasing = kaucja + rata dzienna liczona od wartości; wcześniejszy zwrot = kara kilku rat, kaucja przepada.
 * Własny sprzęt ma leasePerDay = 0, więc koszty stałe liczą się tak samo dla wszystkich.
 */

const DAY = 24 * 60;

// ─── Wycena ─────────────────────────────────────────────────────────────────

const modelOf = (brand: string, model: string) => TRUCK_MODELS.find((m) => m.brand === brand && m.model === model);

/** Wartość rynkowa ciągnika. Nowy traci od razu ~22%, potem z każdym kilometrem i zużyciem. */
export function truckValue(t: { brand: string; model: string; odometerKm: number; wear: number; newPrice?: number }): number {
  const np = t.newPrice ?? modelOf(t.brand, t.model)?.newPrice ?? 170_000;
  if (t.odometerKm < 15_000 && t.wear < 0.03) return np;
  return np * Math.max(0.12, 0.78 - t.odometerKm / 1_700_000) * (1 - 0.25 * t.wear);
}

/** Wartość naczepy: liczy się głównie zużycie. */
export function trailerValue(t: { type: TrailerType; wear: number; newPrice?: number }): number {
  const np = t.newPrice ?? TRAILERS[t.type].newPrice;
  if (t.wear < 0.03) return np;
  return np * Math.max(0.25, 0.8 - t.wear * 0.8);
}

const round = (v: number, step: number) => Math.round(v / step) * step;
export const buyPriceFor = (value: number) => round(value * 1.04, 100);
export const sellPriceFor = (value: number) => round(value * 0.9, 100);
export const truckLeaseFor = (value: number) => Math.round(value / 520 + 55);
export const trailerLeaseFor = (value: number) => Math.round(value / 800 + 15);
export const depositFor = (value: number, min: number) => Math.max(min, round(value * 0.05, 500));

/** Ile dni rat leasingu kosztuje zakup: prosta miara „opłaca się kupić?”. */
export const paybackDays = (o: { buyPrice: number; leasePerDay: number }) => Math.round(o.buyPrice / Math.max(1, o.leasePerDay));

// ─── Oferty ─────────────────────────────────────────────────────────────────

function randomPlate(r: RngState): string {
  const letters = 'ABCDEFGHJKLMNPRSTUWXYZ';
  const l = () => letters[Math.floor(rand(r) * letters.length)];
  return `WX ${randInt(r, 10, 99)}${l()}${l()}${randInt(r, 1, 9)}`;
}

export function usedTruckOffer(s: GameState): TruckOffer {
  const r = s.rng;
  const m = pick(r, TRUCK_MODELS);
  const odometerKm = randInt(r, 20, 90) * 10_000;
  const euro: 5 | 6 = odometerKm > 600_000 && chance(r, 0.4) ? 5 : 6;
  const wear = clamp(odometerKm / 1_400_000 + randRange(r, 0, 0.12), 0, 0.95);
  const value = truckValue({ brand: m.brand, model: m.model, odometerKm, wear, newPrice: m.newPrice });
  return {
    id: newId(s, 'o'),
    plate: randomPlate(r),
    brand: m.brand,
    model: m.model,
    euro,
    fuelL100: Math.round((m.fuelL100 + randRange(r, -0.5, 2)) * 10) / 10,
    odometerKm,
    wear,
    leasePerDay: truckLeaseFor(value) + randInt(r, 0, 20),
    deposit: depositFor(value, 3000),
    newPrice: m.newPrice,
    buyPrice: buyPriceFor(value * randRange(r, 0.95, 1.05)),
    condition: 'used',
  };
}

export function newTruckOffer(s: GameState): TruckOffer {
  const r = s.rng;
  const m = pick(r, TRUCK_MODELS.filter((x) => !('usedOnly' in x)));
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
    leasePerDay: truckLeaseFor(m.newPrice) + randInt(r, 0, 30),
    deposit: depositFor(m.newPrice, 3000),
    newPrice: m.newPrice,
    buyPrice: buyPriceFor(m.newPrice),
    condition: 'new',
  };
}

export function trailerOffer(s: GameState, type?: TrailerType, condition?: 'new' | 'used'): TrailerOffer {
  const r = s.rng;
  const t = type ?? pickWeighted(r, TRAILER_LIST, (x) => TRAILER_WEIGHT[x.id] + 6).id;
  const cond = condition ?? (chance(r, 0.35) ? 'new' : 'used');
  const wear = cond === 'new' ? 0 : randRange(r, 0.15, 0.6);
  const np = TRAILERS[t].newPrice;
  const value = trailerValue({ type: t, wear, newPrice: np });
  return {
    id: newId(s, 'o'),
    type: t,
    condition: cond,
    wear,
    newPrice: np,
    leasePerDay: trailerLeaseFor(value) + randInt(r, 0, 10),
    deposit: depositFor(value, 1500),
    buyPrice: buyPriceFor(value * randRange(r, 0.95, 1.05)),
  };
}

/** Odświeżenie rynku: ciągniki (nowe i używane) i naczepy (zawsze kilka plandek). */
export function refreshVehicleOffers(s: GameState) {
  const rank = rankIndex(s.reputation);
  const nTrucks = MARKETS.truckOffersBase + Math.floor(rank / 2);
  s.truckOffers = Array.from({ length: nTrucks }, (_, i) => (i < 2 ? (i === 0 ? newTruckOffer(s) : usedTruckOffer(s)) : chance(s.rng, 0.35) ? newTruckOffer(s) : usedTruckOffer(s)));
  const nTrailers = MARKETS.truckOffersBase + Math.floor(rank / 2);
  s.trailerOffers = [trailerOffer(s, 'curtain', 'used'), trailerOffer(s, 'curtain', 'new'), ...Array.from({ length: nTrailers - 2 }, () => trailerOffer(s))];
  qPush(s.queue, s.now + MARKETS.truckOffersRefreshMin, { type: 'OFFERS_REFRESH' });
}

// ─── Sprzęt firmy ───────────────────────────────────────────────────────────

export const trailerCap = (s: GameState) => fleetCap(s) * 2;
export const trailerOfTruck = (s: GameState, t: Truck) => (t.trailerId ? (s.trailers.find((x) => x.id === t.trailerId) ?? null) : null);

function nextTrailerLabel(s: GameState): string {
  const used = new Set(s.trailers.map((t) => t.label));
  let n = s.trailers.length + 1;
  while (used.has(`N-${String(n).padStart(2, '0')}`)) n++;
  return `N-${String(n).padStart(2, '0')}`;
}

/** Zamienia ofertę na ciągnik stojący w siedzibie. */
export function truckFromOffer(o: TruckOffer, id: string, cityId: string, driverId: string | null, mode: Ownership): Truck {
  const { buyPrice: _b, ...rest } = o;
  void _b;
  return { ...rest, id, cityId, driverId, tripId: null, serviceUntil: null, trailerId: null, ownership: mode, leasePerDay: mode === 'own' ? 0 : o.leasePerDay, deposit: mode === 'own' ? 0 : o.deposit };
}

export function trailerFromOffer(s: GameState, o: TrailerOffer, mode: Ownership): Trailer {
  const { buyPrice: _b, id: _i, ...rest } = o;
  void _b;
  void _i;
  return { ...rest, id: newId(s, 'n'), label: nextTrailerLabel(s), ownership: mode, km: 0, truckId: null, leasePerDay: mode === 'own' ? 0 : o.leasePerDay, deposit: mode === 'own' ? 0 : o.deposit };
}

export function acquireTruck(s: GameState, offerId: string, mode: Ownership): ActionResult {
  const o = s.truckOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, error: 'Oferta nieaktualna. Handlarz sprzedał komuś „od ręki”.' };
  if (s.trucks.length >= fleetCap(s)) return { ok: false, error: `Plac mieści ${fleetCap(s)} ciągników. Czas na większy (zakładka Firma).` };
  const cost = mode === 'own' ? o.buyPrice : o.deposit;
  if (s.cash < cost) return { ok: false, error: mode === 'own' ? `Zakup to ${fmtPLN(cost)}. Na razie zostaje leasing.` : `Kaucja to ${fmtPLN(cost)}.` };
  spend(s, cost, 'fleet');
  s.truckOffers = s.truckOffers.filter((x) => x.id !== offerId);
  const t = truckFromOffer(o, newId(s, 't'), s.hqCityId ?? HOME_BASE, null, mode);
  s.trucks.push(t);
  const how = mode === 'own' ? `kupiony za ${fmtPLN(cost)}` : `w leasingu (${fmtPLN(o.leasePerDay)}/dzień)`;
  const msg = `${o.condition === 'new' ? 'Nowiutki' : 'Używany'} ${t.brand} ${t.model} (${t.plate}) ${how}. Stoi na placu: potrzebuje kierowcy i naczepy.`;
  log(s, 'good', msg);
  return { ok: true, message: msg };
}

export function acquireTrailer(s: GameState, offerId: string, mode: Ownership): ActionResult {
  const o = s.trailerOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, error: 'Oferta nieaktualna.' };
  const spec = TRAILERS[o.type];
  if (rankIndex(s.reputation) < spec.rank) return { ok: false, error: `${spec.name}: dealer rozmawia dopiero z rangą „${RANKS[spec.rank].name}”.` };
  if (s.trailers.length >= trailerCap(s)) return { ok: false, error: `Na placu zmieści się najwyżej ${trailerCap(s)} naczep.` };
  const cost = mode === 'own' ? o.buyPrice : o.deposit;
  if (s.cash < cost) return { ok: false, error: mode === 'own' ? `Zakup to ${fmtPLN(cost)}.` : `Kaucja to ${fmtPLN(cost)}.` };
  spend(s, cost, 'fleet');
  s.trailerOffers = s.trailerOffers.filter((x) => x.id !== offerId);
  const tr = trailerFromOffer(s, o, mode);
  s.trailers.push(tr);
  const how = mode === 'own' ? `kupiona za ${fmtPLN(cost)}` : `w leasingu (${fmtPLN(o.leasePerDay)}/dzień)`;
  const msg = `${spec.name} ${tr.label} (${o.condition === 'new' ? 'nowa' : 'używana'}) ${how}. Stoi na placu, podepnij ją do ciągnika.`;
  log(s, 'good', msg);
  return { ok: true, message: msg };
}

/** Sprzedaż własnego albo zwrot leasingowanego ciągnika. Kierowca i naczepa zostają w firmie. */
export function disposeTruck(s: GameState, truckId: string): ActionResult {
  const t = s.trucks.find((x) => x.id === truckId);
  if (!t) return { ok: false, error: 'Nie ma takiego auta.' };
  if (t.tripId || t.serviceUntil !== null) return { ok: false, error: 'Auto jest zajęte. Najpierw niech wróci z trasy albo serwisu.' };
  if (s.trucks.length <= 1) return { ok: false, error: 'To ostatnie auto. Bez niego zostaje tylko rower.' };
  const tr = trailerOfTruck(s, t);
  if (tr) tr.truckId = null;
  s.trucks = s.trucks.filter((x) => x.id !== t.id);
  let msg: string;
  if (t.ownership === 'own') {
    const price = sellPriceFor(truckValue(t));
    s.cash += price;
    msg = `${t.brand} ${t.model} (${t.plate}) sprzedany za ${fmtPLN(price)}. Kupiec obiecał, że „będzie o niego dbał”.`;
  } else {
    const penalty = t.leasePerDay * MARKETS.returnPenaltyDays;
    spend(s, penalty, 'lease');
    msg = `${t.brand} ${t.model} (${t.plate}) wraca do leasingodawcy. Kara ${fmtPLN(penalty)}, kaucja przepada.`;
  }
  log(s, 'info', msg);
  return { ok: true, message: msg };
}

export function disposeTrailer(s: GameState, trailerId: string): ActionResult {
  const tr = s.trailers.find((x) => x.id === trailerId);
  if (!tr) return { ok: false, error: 'Nie ma takiej naczepy.' };
  const truck = tr.truckId ? s.trucks.find((x) => x.id === tr.truckId) : null;
  if (truck?.tripId) return { ok: false, error: 'Naczepa jest w trasie.' };
  if (truck) setTruckTrailer(truck, null);
  s.trailers = s.trailers.filter((x) => x.id !== tr.id);
  const spec = TRAILERS[tr.type];
  let msg: string;
  if (tr.ownership === 'own') {
    const price = sellPriceFor(trailerValue(tr));
    s.cash += price;
    msg = `${spec.name} ${tr.label} sprzedana za ${fmtPLN(price)}.`;
  } else {
    const penalty = tr.leasePerDay * MARKETS.returnPenaltyDays;
    spend(s, penalty, 'lease');
    msg = `${spec.name} ${tr.label} wraca z leasingu. Kara ${fmtPLN(penalty)}, kaucja przepada.`;
  }
  log(s, 'info', msg);
  return { ok: true, message: msg };
}

function setTruckTrailer(t: Truck, tr: Trailer | null) {
  t.trailerId = tr?.id ?? null;
  t.trailer = tr?.type;
}

/** Opłata za podstawienie naczepy, gdy ciągnik stoi poza siedzibą. */
export const TRAILER_DELIVERY_FEE = 300;

/**
 * Podpina naczepę do stojącego ciągnika (albo odpina, gdy trailerId = null).
 * Jeśli naczepa wisi na innym stojącym ciągniku, naczepy zamieniają się miejscami.
 */
export function attachTrailer(s: GameState, truckId: string, trailerId: string | null): ActionResult {
  const t = s.trucks.find((x) => x.id === truckId);
  if (!t) return { ok: false, error: 'Nie ma takiego auta.' };
  if (t.tripId) return { ok: false, error: 'Zestaw jest w trasie. Naczepę zmienisz po rozładunku.' };
  const current = trailerOfTruck(s, t);
  if (trailerId === null) {
    if (current) current.truckId = null;
    setTruckTrailer(t, null);
    return { ok: true, message: `${t.brand} ${t.model} jeździ teraz solo. Na giełdzie nic nie weźmie.` };
  }
  const tr = s.trailers.find((x) => x.id === trailerId);
  if (!tr) return { ok: false, error: 'Nie ma takiej naczepy.' };
  if (tr.truckId === t.id) return { ok: true, message: 'Ta naczepa już jest podpięta.' };
  const other = tr.truckId ? s.trucks.find((x) => x.id === tr.truckId) : null;
  if (other?.tripId) return { ok: false, error: 'Ta naczepa jest w trasie z innym ciągnikiem.' };
  const away = t.cityId !== (s.hqCityId ?? HOME_BASE);
  if (away && s.cash < TRAILER_DELIVERY_FEE) return { ok: false, error: `Podstawienie naczepy poza siedzibę kosztuje ${fmtPLN(TRAILER_DELIVERY_FEE)}.` };
  if (away) spend(s, TRAILER_DELIVERY_FEE, 'fleet');
  // Zamiana: druga maszyna dostaje naszą dotychczasową naczepę.
  if (other) {
    if (current) current.truckId = other.id;
    setTruckTrailer(other, current);
  } else if (current) current.truckId = null;
  tr.truckId = t.id;
  setTruckTrailer(t, tr);
  const spec = TRAILERS[tr.type];
  const msg = `${spec.name} ${tr.label} podpięta do ${t.brand} ${t.model} (${t.plate})${away ? `, podstawienie ${fmtPLN(TRAILER_DELIVERY_FEE)}` : ''}.${other ? ` ${other.brand} ${other.model} dostaje ${current ? `${TRAILERS[current.type].name.toLowerCase()} ${current.label}` : 'wolne siodło'}.` : ''}`;
  log(s, 'info', msg);
  return { ok: true, message: msg };
}

/** Naczepa na start: używana plandeka po wujku, własna. */
export function starterTrailer(s: GameState): Trailer {
  const o = trailerOffer(s, 'curtain', 'used');
  return trailerFromOffer(s, { ...o, wear: Math.min(o.wear, 0.35) }, 'own');
}

export { DAY as MIN_PER_DAY };
