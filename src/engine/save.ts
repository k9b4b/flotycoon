import { YARD } from '../data/progression';
import { rollPerks } from './company';
import { qPush } from './queue';
import { SAVE_VERSION, type GameState } from './types';

/**
 * Migracje zapisów: każda podnosi wersję o 1.
 * Dodając pole do GameState, podbij SAVE_VERSION i dopisz tu migrację,
 * żeby stare zapisy graczy dalej działały.
 */
const MIGRATIONS: Record<number, (s: any) => any> = {
  // 1 → 2: progresja (reputacja, baza), rynek kierowców i aut.
  1: (s) => {
    // Dotychczasowa praca się liczy: reputacja z historii kursów.
    const reputation = Math.max(0, (s.totals?.jobsDone ?? 0) - 4 * (s.totals?.lateJobs ?? 0));
    // Plac musi pomieścić auta, które gracz już ma.
    let yard = 0;
    while (yard + 1 < YARD.length && YARD[yard].cap < s.trucks.length) yard++;
    const out = {
      ...s,
      version: 2,
      reputation,
      base: { yard, workshop: false, office: false, dispatcher: false, autoDispatch: false },
      candidates: [],
      truckOffers: [],
      costsByCategory: { bonuses: 0, base: 0, training: 0, ...s.costsByCategory },
    };
    // Rynek pracy i salon zapełnią się przy pierwszym zdarzeniu.
    qPush(out.queue, s.now, { type: 'CANDIDATES_REFRESH' });
    qPush(out.queue, s.now, { type: 'OFFERS_REFRESH' });
    return out;
  },
  // 2 → 3: perki kierowców i zdarzenia z decyzją gracza.
  2: (s) => {
    const withPerks = (d: any) => ({
      ...d,
      perks: d.perks ?? rollPerks(s.rng, (d.stats.experience + d.stats.eco + d.stats.reliability + d.stats.stamina) / 4),
    });
    return {
      ...s,
      version: 3,
      drivers: s.drivers.map(withPerks),
      candidates: s.candidates.map(withPerks),
      settings: { askDecisions: true },
      decisions: [],
    };
  },
  // 3 → 4: kontrakty ze stałymi klientami i szkolenia kierowców.
  3: (s) => {
    const out = { ...s, version: 4, contracts: [], contractOffers: [] };
    qPush(out.queue, s.now, { type: 'CONTRACT_OFFERS' });
    return out;
  },
};

export function migrate(raw: any): GameState | null {
  if (!raw || typeof raw.version !== 'number') return null;
  let s = raw;
  while (s.version < SAVE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) return null;
    s = step(s);
  }
  if (s.version !== SAVE_VERSION) return null;
  // Uzupełnienia pól dodanych bez podbijania wersji (bezpieczne domyślne wartości).
  s.costsByCategory = { bonuses: 0, base: 0, training: 0, ...s.costsByCategory };
  // Starsze zapisy: kto już trochę pograł, nie dostaje samouczka od zera (porady zostają).
  if (!s.settings.tutorial) s.settings.tutorial = { step: (s.totals?.jobsDone ?? 0) > 5 ? 99 : 0, seen: [], off: false };
  return s as GameState;
}
