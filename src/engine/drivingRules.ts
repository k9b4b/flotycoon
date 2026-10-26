import type { IncidentInfo, Phase } from './types';

/**
 * Uproszczone przepisy czasu jazdy (rozporządzenie UE 561/2006):
 * - maks. 4,5 h jazdy ciągłej, potem 45 min przerwy,
 * - maks. 9 h jazdy dziennie, potem 11 h odpoczynku dobowego.
 * Pominięte na razie: 10 h dwa razy w tygodniu, dzielona przerwa 15+30,
 * limit tygodniowy 56 h / dwutygodniowy 90 h, odpoczynek tygodniowy.
 * Stan „licznika” kierowcy (DutyState) przechodzi między kursami: postój na bazie
 * liczy się jako przerwa (≥45 min) albo odpoczynek dobowy (≥11 h).
 */
export const RULES = {
  maxContinuousMin: 270,
  breakMin: 45,
  maxDailyDriveMin: 540,
  dailyRestMin: 660,
} as const;

export type Leg =
  | { kind: 'drive' | 'drive_empty'; km: number }
  | { kind: 'load' | 'unload'; min: number };

export interface PlannedIncident {
  /** Kilometr skumulowany kursu, na którym zdarzenie wystąpi. */
  atKm: number;
  min: number;
  info: IncidentInfo;
}

const EPS = 1e-6;

export interface DutyState {
  /** Minuty jazdy od ostatniej przerwy. */
  sinceBreak: number;
  /** Minuty jazdy od ostatniego odpoczynku dobowego. */
  today: number;
  /** Czas gry, w którym kierowca skończył ostatnią czynność. */
  at: number;
}

export const FRESH_DUTY = (at: number): DutyState => ({ sinceBreak: 0, today: 0, at });

/** Postój między kursami zalicza się jako przerwa lub odpoczynek. */
export function dutyAfterIdle(d: DutyState, now: number): DutyState {
  const gap = now - d.at;
  if (gap >= RULES.dailyRestMin) return FRESH_DUTY(now);
  if (gap >= RULES.breakMin) return { sinceBreak: 0, today: d.today, at: now };
  return { ...d, at: now };
}

export interface TripPlan {
  phases: Phase[];
  duty: DutyState;
}

/**
 * Liczy cały harmonogram kursu z góry. To serce symulacji zdarzeniowej:
 * zamiast przeliczać ciężarówkę co klatkę, znamy każdą fazę z czasem start/koniec.
 */
export function planTrip(
  start: number,
  legs: Leg[],
  speedKmh: number,
  incidents: PlannedIncident[] = [],
  duty: DutyState = FRESH_DUTY(start),
): TripPlan {
  const phases: Phase[] = [];
  const inc = [...incidents].sort((a, b) => a.atKm - b.atKm);
  let ii = 0;
  let t = start;
  let km = 0;
  const d0 = dutyAfterIdle(duty, start);
  let sinceBreak = d0.sinceBreak;
  let today = d0.today;

  const push = (kind: Phase['kind'], dur: number, km0: number, km1: number, incident?: IncidentInfo) => {
    if (dur <= 0) return;
    phases.push({ kind, start: t, end: t + dur, km0, km1, ...(incident ? { incident } : {}) });
    t += dur;
  };

  for (const leg of legs) {
    if ('min' in leg) {
      push(leg.kind, leg.min, km, km);
      continue;
    }
    let remaining = leg.km;
    while (remaining > EPS) {
      while (ii < inc.length && inc[ii].atKm <= km + EPS) {
        push('incident', inc[ii].min, km, km, inc[ii].info);
        ii++;
      }
      if (today >= RULES.maxDailyDriveMin - EPS) {
        push('rest', RULES.dailyRestMin, km, km);
        today = 0;
        sinceBreak = 0;
        continue;
      }
      if (sinceBreak >= RULES.maxContinuousMin - EPS) {
        push('break', RULES.breakMin, km, km);
        sinceBreak = 0;
        continue;
      }
      const allowMin = Math.min(RULES.maxContinuousMin - sinceBreak, RULES.maxDailyDriveMin - today);
      let segKm = Math.min(remaining, (allowMin / 60) * speedKmh);
      if (ii < inc.length && inc[ii].atKm < km + segKm) segKm = inc[ii].atKm - km;
      const dur = (segKm / speedKmh) * 60;
      push(leg.kind, dur, km, km + segKm);
      km += segKm;
      remaining -= segKm;
      sinceBreak += dur;
      today += dur;
    }
  }
  return { phases, duty: { sinceBreak, today, at: t } };
}

type TimedPhase = Pick<Phase, 'start' | 'end' | 'km0' | 'km1'>;

export function phaseAt<P extends TimedPhase>(phases: P[], t: number): P | undefined {
  for (const p of phases) if (t >= p.start && t < p.end) return p;
  return undefined;
}

export function kmAt(phases: TimedPhase[], t: number): number {
  if (phases.length === 0) return 0;
  if (t >= phases[phases.length - 1].end) return phases[phases.length - 1].km1;
  const p = phaseAt(phases, t);
  if (!p) return 0;
  if (p.km1 === p.km0) return p.km0;
  return p.km0 + ((p.km1 - p.km0) * (t - p.start)) / (p.end - p.start);
}
