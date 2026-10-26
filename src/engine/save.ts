import { SAVE_VERSION, type GameState } from './types';

/**
 * Migracje zapisów: każda podnosi wersję o 1.
 * Dodając pole do GameState, podbij SAVE_VERSION i dopisz tu migrację,
 * żeby stare zapisy graczy dalej działały.
 */
const MIGRATIONS: Record<number, (s: any) => any> = {
  // 1: (s) => ({ ...s, nowePole: domyślna, version: 2 }),
};

export function migrate(raw: any): GameState | null {
  if (!raw || typeof raw.version !== 'number') return null;
  let s = raw;
  while (s.version < SAVE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) return null;
    s = step(s);
  }
  return s.version === SAVE_VERSION ? (s as GameState) : null;
}
