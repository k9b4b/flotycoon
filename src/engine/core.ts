import type { CostCategory, Driver, GameState, LogTone } from './types';

/** Wspólne operacje na stanie gry, używane przez sim.ts i company.ts (bez zależności cyklicznych). */

export const fmtPLN = (v: number) => `${Math.round(v).toLocaleString('pl-PL')} zł`;

export function newId(s: GameState, prefix: string): string {
  return `${prefix}${s.nextId++}`;
}

export function log(s: GameState, tone: LogTone, text: string): void {
  s.log.push({ t: s.now, tone, text });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

export function earn(s: GameState, amount: number) {
  s.cash += amount;
  s.today.revenue += amount;
  s.totals.revenue += amount;
}

export function spend(s: GameState, amount: number, cat: CostCategory) {
  s.costsByCategory[cat] += amount;
  s.cash -= amount;
  s.today.costs += amount;
  s.totals.costs += amount;
}

/** Końcówka czasownika w czasie przeszłym: g(d) → '' lub 'a'. */
export const g = (d: Driver) => (d.female ? 'a' : '');

export const driverName = (d: Driver) => `${d.firstName} „${d.nickname}” ${d.lastName}`;

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };
