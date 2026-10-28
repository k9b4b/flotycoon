import { CARGO } from '../data/flavor';
import { LOCKED_TEASER_WEIGHT, TRAILER_LIST, TRAILER_WEIGHT, type TrailerType } from '../data/trailers';
import { rankIndex } from './company';
import { pick, pickWeighted } from './rng';
import type { GameState } from './types';

/**
 * Rodzaj ładunku: najpierw typ naczepy, potem towar.
 * Typy zablokowane rangą pojawiają się na giełdzie rzadko, jako zachęta do awansu;
 * onlyUnlocked (kontrakty) bierze tylko to, co firma może już wozić.
 */
export function pickCargo(s: GameState, onlyUnlocked = false, special?: boolean) {
  const rank = rankIndex(s.reputation);
  const types = TRAILER_LIST.filter(
    (t) => (!onlyUnlocked || t.rank <= rank) && (special === undefined || (special ? t.id !== 'curtain' : t.id === 'curtain')),
  );
  const type: TrailerType = pickWeighted(s.rng, types, (t) => (t.rank <= rank ? TRAILER_WEIGHT[t.id] : LOCKED_TEASER_WEIGHT)).id;
  return pick(s.rng, CARGO.filter((c) => (c.trailer ?? 'curtain') === type));
}
