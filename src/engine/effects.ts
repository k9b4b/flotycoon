import { BALANCE } from '../data/balance';
import { INCIDENTS } from '../data/flavor';
import { PERK_BY_ID, type PerkId, type PerkMods } from '../data/perks';
import { TRAILERS } from '../data/trailers';
import type { PlannedIncident } from './drivingRules';
import { chance, pick, randInt, randRange, type RngState } from './rng';
import type { Driver, Job, Truck } from './types';

/** Tu żyją wszystkie zależności „statystyka → efekt”. Jedno miejsce do balansu. */

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

type Mods = Required<PerkMods>;

/** Łączny wpływ perków kierowcy: mnożniki się mnożą, przesunięcia sumują. */
export function perkMods(d: Driver): Mods {
  const m: Mods = {
    speedMul: 1, fuelMul: 1, wearMul: 1, trafficMul: 1, breakdownMul: 1, itdMul: 1, oversleptMul: 1,
    moraleTarget: 0, lateMoraleMul: 1, repOnTime: 0, repLate: 0,
  };
  for (const id of d.perks ?? []) {
    const p = PERK_BY_ID[id]?.mods;
    if (!p) continue;
    for (const k of Object.keys(p) as (keyof PerkMods)[]) {
      const v = p[k]!;
      if (k === 'moraleTarget' || k === 'repOnTime' || k === 'repLate') m[k] += v;
      else m[k] *= v;
    }
  }
  return m;
}

export const hasPerk = (d: Driver, id: PerkId) => (d.perks ?? []).includes(id);

export const trailerOf = (t: Truck) => TRAILERS[t.trailer ?? 'curtain'];

/** Prędkość zestawu: kierowca i naczepa (z gabarytem jedzie się wolniej). */
export function rigSpeedKmh(t: Truck, d: Driver): number {
  return driverSpeedKmh(d) * trailerOf(t).speedMul;
}

/** Doświadczenie: +/- kilka km/h średniej. Perki mogą dodać kilka procent. */
export function driverSpeedKmh(d: Driver): number {
  return BALANCE.baseSpeedKmh * (0.93 + 0.12 * (d.stats.experience / 100)) * perkMods(d).speedMul;
}

/** Morale mnoży niezawodność: zdemotywowany kierowca jest mniej skrupulatny. */
export function effectiveReliability(d: Driver): number {
  return d.stats.reliability * (0.7 + 0.3 * (d.stats.morale / 100));
}

/** Litry na 100 km dla danego zestawu i masy ładunku. */
export function fuelL100(truck: Truck, d: Driver, weightT: number, empty: boolean): number {
  const eco = 1.12 - 0.22 * (d.stats.eco / 100); // dobry eco-driver: do −10%
  const wear = 1 + truck.wear * 0.15;
  const load = empty ? BALANCE.emptyFuelMul : 0.86 + 0.0075 * weightT;
  return truck.fuelL100 * eco * wear * load * perkMods(d).fuelMul * trailerOf(truck).fuelMul;
}

export function tripCosts(truck: Truck, d: Driver, job: Job, emptyKm: number) {
  const fuelL = (emptyKm * fuelL100(truck, d, 0, true) + job.km * fuelL100(truck, d, job.weightT, false)) / 100;
  const fuelCost = fuelL * BALANCE.fuelPricePerL;
  const tollCost = (emptyKm + job.km) * BALANCE.tollPerKm * (truck.euro === 5 ? BALANCE.tollEuro5Mul : 1);
  return { fuelL, fuelCost, tollCost };
}

function fill(text: string, d: Driver): string {
  return text.replaceAll('{nick}', d.nickname).replaceAll('{a}', d.female ? 'a' : '');
}

/** Losuje zdarzenia drogowe dla kursu z góry. Wynik trafia do harmonogramu. */
export function rollIncidents(r: RngState, truck: Truck, d: Driver, totalKm: number): PlannedIncident[] {
  const out: PlannedIncident[] = [];
  const at = () => randRange(r, 0.1, 0.9) * totalKm;
  const longTrip = Math.min(1.5, totalKm / 350);
  const m = perkMods(d);

  if (chance(r, 0.3 * longTrip * m.trafficMul)) {
    out.push({ atKm: at(), min: randInt(r, 20, 100), info: { kind: 'traffic', text: fill(pick(r, INCIDENTS.traffic), d), cost: 0, tone: 'funny' } });
  }
  if (chance(r, (0.02 + truck.wear * truck.wear * 0.35) * longTrip * m.breakdownMul)) {
    const cost = Math.round(randInt(r, 600, 2800) * (1 + truck.wear));
    out.push({ atKm: at(), min: randInt(r, 90, 240), info: { kind: 'breakdown', text: fill(pick(r, INCIDENTS.breakdown), d), cost, tone: 'bad' } });
  }
  if (chance(r, 0.07 * longTrip * trailerOf(truck).itdMul)) {
    const caught = chance(r, clamp((0.75 - 0.7 * (effectiveReliability(d) / 100)) * m.itdMul, 0, 0.95));
    out.push(
      caught
        ? { atKm: at(), min: randInt(r, 40, 90), info: { kind: 'itd', text: fill(pick(r, INCIDENTS.itdFine), d), cost: randInt(r, 3, 20) * 100, tone: 'bad' } }
        : { atKm: at(), min: randInt(r, 20, 45), info: { kind: 'itd', text: fill(pick(r, INCIDENTS.itdOk), d), cost: 0, tone: 'funny' } },
    );
  }
  if (totalKm > 250 && chance(r, 0.14 * (1 - d.stats.stamina / 100) * m.oversleptMul)) {
    out.push({ atKm: at(), min: randInt(r, 45, 120), info: { kind: 'overslept', text: fill(pick(r, INCIDENTS.overslept), d), cost: 0, tone: 'funny' } });
  }
  return out;
}
