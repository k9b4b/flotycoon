/**
 * Prosty „bot spedytor” do testów i symulacji balansu.
 * Gra rozsądnie, ale bez finezji: dobry gracz powinien go wyraźnie pokonać.
 */
import { RANKS, UPGRADES, YARD } from '../src/data/progression';
import {
  acceptJob,
  buildCost,
  activeContracts,
  assignDriver,
  maxContracts,
  signContract,
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
  if (nextYard && rank >= nextYard.rank && s.trucks.length >= fleetCap(s) && s.cash > buildCost(s, nextYard.cost) + 10_000 + fixedPerDay(s) * 7) upgradeYard(s);
  for (const u of UPGRADES) {
    if (u.id === 'dispatcher') continue; // bot sam przydziela, dyspozytor by go tylko kosztował
    if (!s.base[u.id] && rank >= u.rank && s.cash > buildCost(s, u.cost) + reserve * 2) buyUpgrade(s, u.id);
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
  // Kontrakty: bierze stałe trasy, gdy ma zapas aut (jeden kontrakt na trzy zestawy).
  for (const o of [...s.contractOffers]) {
    if (s.trucks.length < 4 || activeContracts(s).length >= Math.min(maxContracts(s), Math.floor(s.trucks.length / 3))) break;
    signContract(s, o.id);
  }
  // Gra nie łączy par sama: bot sadza wolnych kierowców w puste auta na placu.
  const freeDrivers = s.drivers.filter((d) => !truckOfDriver(s, d));
  for (const t of s.trucks.filter((x) => !x.driverId && !x.tripId)) {
    const d = freeDrivers.shift();
    if (!d) break;
    assignDriver(s, t.id, d.id);
  }
  void RANKS;
}
