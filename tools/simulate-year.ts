/**
 * Symulator balansu: prosty „bot spedytor” prowadzi firmę przez rok gry w kilka sekund.
 * Uruchom: npm run sim:year [seed]
 * Zmieniaj src/data/balance.ts i patrz, czy krzywa gotówki ma sens.
 */
import { acceptJob, advanceTo, fmtPLN, isAvailable, leaseTruck, newGame, previewJob, serviceTruck } from '../src/engine/sim';
import { MIN_PER_DAY } from '../src/engine/time';

const seed = Number(process.argv[2] ?? 2027);
const s = newGame(seed);
const started = performance.now();

console.log(`Seed ${seed}. Start: ${fmtPLN(s.cash)}\n`);
console.log('Mies.  Gotówka        Flota  Kursy  Spóźn.  km');

for (let day = 1; day <= 365; day++) {
  for (let h = 0; h < 24; h++) {
    advanceTo(s, s.now + 60);
    for (const t of s.trucks.filter(isAvailable)) {
      if (t.wear > 0.45 && s.cash > 20_000) {
        serviceTruck(s, t.id);
        continue;
      }
      const best = s.market
        .map((j) => ({ j, p: previewJob(s, j, t) }))
        .filter((x) => x.p.onTime && !x.p.tooFar && x.p.profit > 0)
        .sort((a, b) => b.p.profit / b.p.durationMin - a.p.profit / a.p.durationMin)[0];
      if (best) acceptJob(s, best.j.id, t.id);
    }
    // Bot kupuje zestaw, gdy ma zapas na ~2 tygodnie kosztów stałych floty.
    const fixed = s.drivers.reduce((a, d) => a + d.salaryPerDay, 0) + s.trucks.reduce((a, t) => a + t.leasePerDay, 0);
    if (s.cash > 20_000 + fixed * 14) leaseTruck(s);
  }
  if (day % 30 === 0) {
    const m = String(day / 30).padStart(3);
    const cash = fmtPLN(s.cash).padStart(14);
    console.log(`${m}  ${cash}  ${String(s.trucks.length).padStart(5)}  ${String(s.totals.jobsDone).padStart(5)}  ${String(s.totals.lateJobs).padStart(6)}  ${s.totals.km.toLocaleString('pl-PL')}`);
  }
}

const days = (s.now - 6 * 60) / MIN_PER_DAY;
console.log(`\nPrzychody ${fmtPLN(s.totals.revenue)}, koszty ${fmtPLN(s.totals.costs)}.`);
console.table(Object.fromEntries(Object.entries(s.costsByCategory).map(([k, v]) => [k, Math.round(v)])));
console.log(`Kary za spóźnienia: ${fmtPLN(s.totals.penalties)}.`);
console.log(`Średnio na zestaw: ${Math.round(s.totals.km / s.trucks.length / days)} km/dzień.`);
console.log(`Policzone w ${Math.round(performance.now() - started)} ms.`);
