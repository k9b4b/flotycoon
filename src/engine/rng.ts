/**
 * Deterministyczny generator losowy (mulberry32) z serializowalnym stanem.
 * Ten sam seed + te same akcje gracza = identyczny przebieg gry.
 * Dzięki temu da się debugować, testować i balansować symulację.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed | 0 };
}

/** Liczba z przedziału [0, 1). Mutuje stan. */
export function rand(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) | 0;
  let t = Math.imul(r.s ^ (r.s >>> 15), 1 | r.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(r: RngState, min: number, max: number): number {
  return min + rand(r) * (max - min);
}

/** Liczba całkowita z przedziału [min, max] (włącznie). */
export function randInt(r: RngState, min: number, max: number): number {
  return Math.floor(randRange(r, min, max + 1));
}

export function chance(r: RngState, p: number): boolean {
  return rand(r) < p;
}

export function pick<T>(r: RngState, items: readonly T[]): T {
  return items[Math.floor(rand(r) * items.length)];
}

export function pickWeighted<T>(r: RngState, items: readonly T[], weight: (t: T) => number): T {
  const total = items.reduce((sum, it) => sum + weight(it), 0);
  let x = rand(r) * total;
  for (const it of items) {
    x -= weight(it);
    if (x < 0) return it;
  }
  return items[items.length - 1];
}
