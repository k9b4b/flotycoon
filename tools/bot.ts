/**
 * Prosty „bot spedytor” do testów i symulacji balansu.
 * Gra rozsądnie, ale bez finezji: dobry gracz powinien go wyraźnie pokonać.
 */
import { RANKS, UPGRADES, YARD } from '../src/data/progression';
import {
  acceptJob,
  bestSafeJob,
  buyUpgrade,
  driverCap,
  fleetCap,
  hireDriver,
  isAvailable,
  leaseOffer,
  rankIndex,
  serviceQuote,
  serviceTruck,
  truckOfDriver,
  upgradeYard,
} from '../src/engine/sim';
import type { GameState } from '../src/engine/types';

const fixedPerDay = (s: GameState) => s.drivers.reduce((a, d) => a + d.salaryPerDay, 0) + s.trucks.reduce((a, t) => a + t.leasePerDay, 0);

/** Jeden „obchód” bota: zlecenia, serwisy, rozwój. Wołać co godzinę gry. */
export function botTick(s: GameState, opts: { grow?: boolean } = {}) {
  for (const t of s.trucks.filter(isAvailable)) {
    const q = serviceQuote(s, t);
    if (t.wear > 0.45 && s.cash > q.cost + 20_000) {
      serviceTruck(s, t.id);
      continue;
    }
    const job = bestSafeJob(s, t, true);
    if (job) acceptJob(s, job.id, t.id);
  }
  if (opts.grow === false) return;

  const reserve = 20_000 + fixedPerDay(s) * 14;
  const rank = rankIndex(s.reputation);
  // Inwestycje w bazę, gdy stać i ranga pozwala.
  const nextYard = YARD[s.base.yard + 1];
  if (nextYard && rank >= nextYard.rank && s.trucks.length >= fleetCap(s) && s.cash > nextYard.cost + 10_000 + fixedPerDay(s) * 7) upgradeYard(s);
  for (const u of UPGRADES) {
    if (u.id === 'dispatcher') continue; // bot sam przydziela, dyspozytor by go tylko kosztował
    if (!s.base[u.id] && rank >= u.rank && s.cash > u.cost + reserve * 2) buyUpgrade(s, u.id);
  }
  // Nowe auto + kierowca, gdy jest zapas na ~2 tygodnie kosztów stałych.
  if (s.trucks.length < fleetCap(s) && s.drivers.length < driverCap(s) && s.cash > reserve) {
    const offer = [...s.truckOffers].sort((a, b) => a.leasePerDay * (1 + a.wear) - b.leasePerDay * (1 + b.wear))[0];
    const value = (c: GameState['candidates'][number]) =>
      (c.stats.experience + c.stats.eco + c.stats.reliability + c.stats.stamina) / c.salaryPerDay;
    const cand = [...s.candidates].sort((a, b) => value(b) - value(a))[0];
    if (offer && cand) {
      leaseOffer(s, offer.id);
      hireDriver(s, cand.id);
    }
  }
  // Kierowca bez auta? Przy pełnym placu po prostu czeka (bot go nie zwalnia).
  void s.drivers.filter((d) => !truckOfDriver(s, d));
  void RANKS;
}
