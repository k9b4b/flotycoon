/**
 * Symulator balansu: prosty „bot spedytor” prowadzi firmę przez rok gry w kilka sekund.
 * Uruchom: npm run sim:year [seed]
 * Zmieniaj src/data/balance.ts i patrz, czy krzywa gotówki ma sens.
 */
import { advanceTo, fmtPLN, newGame, rankIndex } from '../src/engine/sim';
import { RANKS } from '../src/data/progression';
import { botTick } from './bot';
import { MIN_PER_DAY } from '../src/engine/time';

const seed = Number(process.argv[2] ?? 2027);
const s = newGame(seed);
const started = performance.now();

console.log(`Seed ${seed}. Start: ${fmtPLN(s.cash)}\n`);
console.log('Mies.  Gotówka        Flota  Kursy  Spóźn.  km          Reputacja / ranga');

for (let day = 1; day <= 365; day++) {
  for (let h = 0; h < 24; h++) {
    advanceTo(s, s.now + 60);
    botTick(s);
  }
  if (day % 30 === 0) {
    const m = String(day / 30).padStart(3);
    const cash = fmtPLN(s.cash).padStart(14);
    console.log(`${m}  ${cash}  ${String(s.trucks.length).padStart(5)}  ${String(s.totals.jobsDone).padStart(5)}  ${String(s.totals.lateJobs).padStart(6)}  ${s.totals.km.toLocaleString('pl-PL').padEnd(11)} ${String(s.reputation).padStart(4)} ${RANKS[rankIndex(s.reputation)].name}`);
  }
}

const days = (s.now - 6 * 60) / MIN_PER_DAY;
console.log(`\nPrzychody ${fmtPLN(s.totals.revenue)}, koszty ${fmtPLN(s.totals.costs)}.`);
console.table(Object.fromEntries(Object.entries(s.costsByCategory).map(([k, v]) => [k, Math.round(v)])));
console.log(`Kary za spóźnienia: ${fmtPLN(s.totals.penalties)}.`);
console.log(`Średnio na zestaw: ${Math.round(s.totals.km / s.trucks.length / days)} km/dzień.`);
console.log(`Baza: plac ${s.base.yard}, warsztat ${s.base.workshop ? 'tak' : 'nie'}, biuro ${s.base.office ? 'tak' : 'nie'}.`);
console.log(`Policzone w ${Math.round(performance.now() - started)} ms.`);
