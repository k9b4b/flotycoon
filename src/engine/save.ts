import { YARD } from '../data/progression';
import { rollPerks } from './company';
import { newTruckOffer, trailerOffer, usedTruckOffer } from './assets';
import { TRUCK_MODELS } from '../data/flavor';
import { TRAILERS } from '../data/trailers';
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
    // Rynek pracy i rynek sprzętu zapełnią się przy pierwszym zdarzeniu.
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
  // 4 → 5: rynek ciągników i naczep (kupno albo leasing), naczepy jako osobny sprzęt.
  4: (s) => {
    // Dawne raty naczep specjalnych zostają takie, jakie gracz znał; plandeka była „w pakiecie”, więc dostaje ją na własność.
    const oldLease: Record<string, number> = { reefer: 90, adr: 130, lowbed: 115 };
    const trailers: any[] = [];
    const trucks = s.trucks.map((t: any, i: number) => {
      const type = t.trailer ?? 'curtain';
      const special = type !== 'curtain';
      const id = `n${s.nextId++}`;
      trailers.push({
        id,
        label: `N-${String(i + 1).padStart(2, '0')}`,
        type,
        condition: 'used',
        ownership: special ? 'lease' : 'own',
        leasePerDay: special ? oldLease[type] : 0,
        deposit: 0,
        newPrice: TRAILERS[type as keyof typeof TRAILERS].newPrice,
        wear: 0.3,
        km: 0,
        truckId: t.id,
      });
      const model = TRUCK_MODELS.find((m) => m.brand === t.brand && m.model === t.model);
      return { ...t, ownership: 'lease', newPrice: model?.newPrice ?? 170_000, trailerId: id, trailer: type };
    });
    const out = { ...s, version: 5, trucks, trailers, truckOffers: [], trailerOffers: [] };
    // Nowe oferty od razu (kolejka odświeżania rynku już istnieje, więc bez dokładania drugiej).
    out.truckOffers = [newTruckOffer(out), usedTruckOffer(out), usedTruckOffer(out), usedTruckOffer(out), newTruckOffer(out)];
    out.trailerOffers = [trailerOffer(out, 'curtain', 'used'), trailerOffer(out, 'curtain', 'new'), trailerOffer(out), trailerOffer(out)];
    return out;
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
