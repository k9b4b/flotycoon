import { describe, expect, it } from 'vitest';
import { dutyAfterIdle, planTrip, RULES } from '../src/engine/drivingRules';
import { createQueue, qPop, qPush } from '../src/engine/queue';
import { acceptJob, advanceTo, catchUp, newGame, previewJob } from '../src/engine/sim';
import { botTick } from '../tools/bot';
import { roadKm } from '../src/engine/routes';
import { BALANCE } from '../src/data/balance';
import type { GameState } from '../src/engine/types';

describe('kolejka zdarzeń', () => {
  it('zwraca zdarzenia po czasie, remisy w kolejności dodania', () => {
    const q = createQueue<string>();
    qPush(q, 50, 'c');
    qPush(q, 10, 'a1');
    qPush(q, 30, 'b');
    qPush(q, 10, 'a2');
    const out: string[] = [];
    for (let e = qPop(q); e; e = qPop(q)) out.push(e.ev);
    expect(out).toEqual(['a1', 'a2', 'b', 'c']);
  });
});

describe('przepisy czasu jazdy', () => {
  it('Warszawa → Poznań: jedna pauza 45 min, bez odpoczynku dobowego', () => {
    const km = roadKm('WAW', 'POZ');
    const { phases } = planTrip(0, [{ kind: 'drive', km }], 64);
    expect(phases.filter((p) => p.kind === 'break')).toHaveLength(1);
    expect(phases.filter((p) => p.kind === 'rest')).toHaveLength(0);
    expect(phases[phases.length - 1].km1).toBeCloseTo(km, 6);
  });

  it('nigdy nie przekracza 4,5 h ciągłej jazdy ani 9 h dziennie', () => {
    const { phases } = planTrip(0, [{ kind: 'drive_empty', km: 300 }, { kind: 'load', min: 60 }, { kind: 'drive', km: 1400 }], 70);
    let cont = 0;
    let daily = 0;
    for (const p of phases) {
      if (p.kind === 'drive' || p.kind === 'drive_empty') {
        cont += p.end - p.start;
        daily += p.end - p.start;
      }
      if (p.kind === 'break' || p.kind === 'rest') cont = 0;
      if (p.kind === 'rest') daily = 0;
      expect(cont).toBeLessThanOrEqual(RULES.maxContinuousMin + 1e-6);
      expect(daily).toBeLessThanOrEqual(RULES.maxDailyDriveMin + 1e-6);
    }
    expect(phases.filter((p) => p.kind === 'rest').length).toBeGreaterThanOrEqual(2);
  });

  it('licznik jazdy przechodzi między kursami: bez postoju nie ma „resetu”', () => {
    const first = planTrip(0, [{ kind: 'drive', km: 400 }], 64);
    expect(first.duty.today).toBeGreaterThan(300);
    const next = planTrip(first.duty.at + 10, [{ kind: 'drive', km: 400 }], 64, [], first.duty);
    expect(next.phases.some((p) => p.kind === 'rest')).toBe(true);
    expect(dutyAfterIdle(first.duty, first.duty.at + RULES.dailyRestMin).today).toBe(0);
  });

  it('fazy są ciągłe w czasie, a zdarzenie wstrzymuje jazdę na swoim kilometrze', () => {
    const info = { kind: 'traffic' as const, text: 'korek', cost: 0, tone: 'funny' as const };
    const { phases } = planTrip(100, [{ kind: 'drive', km: 200 }], 60, [{ atKm: 50, min: 90, info }]);
    for (let i = 1; i < phases.length; i++) expect(phases[i].start).toBeCloseTo(phases[i - 1].end, 9);
    const inc = phases.find((p) => p.kind === 'incident')!;
    expect(inc.km0).toBeCloseTo(50, 6);
    expect(inc.end - inc.start).toBe(90);
  });
});

function playScript(seed: number): GameState {
  const s = newGame(seed);
  for (let h = 0; h < 24 * 30; h++) {
    advanceTo(s, s.now + 60);
    botTick(s);
  }
  return s;
}

describe('symulacja', () => {
  it('jest deterministyczna: ten sam seed i akcje dają ten sam stan', () => {
    expect(JSON.stringify(playScript(42))).toBe(JSON.stringify(playScript(42)));
  });

  it('stan da się zapisać i wczytać (JSON) bez zmiany przebiegu', () => {
    const a = newGame(7);
    advanceTo(a, a.now + 600);
    const b: GameState = JSON.parse(JSON.stringify(a));
    advanceTo(a, a.now + 5000);
    advanceTo(b, b.now + 5000);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('kurs kończy się w mieście docelowym i rozlicza fracht oraz koszty', () => {
    const s = newGame(1);
    const truck = s.trucks[0];
    const job = s.market.find((j) => previewJob(s, j, truck).emptyKm === 0) ?? s.market[0];
    const r = acceptJob(s, job.id, truck.id);
    expect(r.ok).toBe(true);
    const trip = s.trips[truck.tripId!];
    const revenue0 = s.totals.revenue;
    advanceTo(s, trip.eta + 1);
    expect(truck.tripId).toBeNull();
    expect(truck.cityId).toBe(job.toId);
    expect(s.totals.revenue).toBeGreaterThan(revenue0);
    expect(s.totals.jobsDone).toBe(1);
  });

  it('nadrabianie offline ma limit 7 dni gry', () => {
    const s = newGame(3);
    const t0 = s.now;
    const rep = catchUp(s, 30 * 24 * 3600 * 1000, 1);
    expect(rep.capped).toBe(true);
    expect(s.now - t0).toBe(BALANCE.offlineCapMin);
    expect(s.days.length).toBeGreaterThanOrEqual(6);
  });
});

describe('spóźnienia', () => {
  it('plan dyspozytora ukrywa zdarzenia, które jeszcze nie nastąpiły', async () => {
    const { plannedPhases } = await import('../src/engine/view');
    const info = { kind: 'traffic' as const, text: 'korek', cost: 0, tone: 'funny' as const };
    const { phases } = planTrip(0, [{ kind: 'drive', km: 200 }], 60, [{ atKm: 100, min: 90, info }]);
    const realEnd = phases[phases.length - 1].end;
    const before = plannedPhases(phases, 10);
    expect(before.some((p) => p.kind === 'incident')).toBe(false);
    expect(before[before.length - 1].end).toBe(realEnd - 90);
    // Po wystąpieniu zdarzenia plan zgadza się z rzeczywistością.
    const inc = phases.find((p) => p.kind === 'incident')!;
    const after = plannedPhases(phases, inc.start + 1);
    expect(after[after.length - 1].end).toBe(realEnd);
  });

  it('do godziny po terminie klient nie nalicza kary', () => {
    const s = newGame(11);
    const truck = s.trucks[0];
    const job = s.market.find((j) => previewJob(s, j, truck).emptyKm === 0) ?? s.market[0];
    expect(acceptJob(s, job.id, truck.id).ok).toBe(true);
    const trip = s.trips[truck.tripId!];
    trip.job.deadline = trip.eta - 30; // 30 min po terminie
    advanceTo(s, trip.eta + 1);
    expect(s.totals.penalties).toBe(0);
    expect(s.totals.lateJobs).toBe(0);
  });
});

describe('morale', () => {
  it('wraca do normy i nie przykleja się do 100', () => {
    const s = newGame(5);
    const d = s.drivers[0];
    d.stats.morale = 100;
    advanceTo(s, s.now + 10 * 24 * 60);
    expect(d.stats.morale).toBeLessThan(90);
    d.stats.morale = 10;
    advanceTo(s, s.now + 10 * 24 * 60);
    expect(d.stats.morale).toBeGreaterThan(20);
  });

  it('premia podnosi morale, kosztuje i ma przerwę', async () => {
    const { giveBonus } = await import('../src/engine/sim');
    const s = newGame(5);
    const d = s.drivers[0];
    d.stats.morale = 30;
    const cash = s.cash;
    expect(giveBonus(s, d.id).ok).toBe(true);
    expect(d.stats.morale).toBe(30 + BALANCE.bonusMorale);
    expect(s.cash).toBe(cash - BALANCE.bonusCost);
    expect(giveBonus(s, d.id).ok).toBe(false);
  });
});

describe('giełda', () => {
  it('po rozładunku są ładunki powrotne z tego miasta, wykonalne na czas', () => {
    const s = newGame(21);
    const truck = s.trucks[0];
    const job = s.market.find((j) => previewJob(s, j, truck).onTime)!;
    expect(acceptJob(s, job.id, truck.id).ok).toBe(true);
    advanceTo(s, s.trips[truck.tripId!].eta + 1);
    const local = s.market.filter((j) => j.fromId === job.toId && j.expiresAt > s.now);
    expect(local.length).toBeGreaterThanOrEqual(BALANCE.backloadOffers);
    // Wypoczęty kierowca zdąży z każdym z nich (dojazd 0 km, okno załadunku i zapas w terminie).
    truck.cityId = job.toId;
    s.drivers[0].duty = { sinceBreak: 0, today: 0, at: s.now - 24 * 60 };
    expect(local.every((j) => previewJob(s, j, truck).onTime)).toBe(true);
  });
});

describe('progresja i rynek', () => {
  it('kierowcy i auta są osobno: zwolnienie zostawia auto bez kierowcy, obsadza je dopiero gracz', async () => {
    const E = await import('../src/engine/sim');
    const s = newGame(31);
    const t = s.trucks[0];
    const d = s.drivers[0];
    expect(E.fireDriver(s, d.id).ok).toBe(true);
    expect(t.driverId).toBeNull();
    expect(E.isAvailable(t)).toBe(false);
    expect(E.acceptJob(s, s.market[0].id, t.id).ok).toBe(false);
    const c = s.candidates[0];
    expect(E.hireDriver(s, c.id).ok).toBe(true);
    expect(t.driverId).toBeNull(); // bez automatu
    const nd = s.drivers.at(-1)!;
    expect(E.assignDriver(s, t.id, nd.id).ok).toBe(true);
    expect(E.isAvailable(t)).toBe(true);
  });

  it('przesadzenie kierowcy do obsadzonego auta zamienia kierowców miejscami', async () => {
    const E = await import('../src/engine/sim');
    const s = newGame(36);
    s.cash = 1_000_000;
    expect(E.leaseOffer(s, s.truckOffers[0].id).ok).toBe(true);
    const [t1, t2] = s.trucks;
    expect(t2.driverId).toBeNull(); // leasing nie przydziela kierowcy
    const d1 = s.drivers[0];
    expect(E.hireDriver(s, s.candidates[0].id).ok).toBe(true);
    const d2 = s.drivers.at(-1)!;
    expect(E.assignDriver(s, t2.id, d2.id).ok).toBe(true);
    // zamiana
    expect(E.assignDriver(s, t2.id, d1.id).ok).toBe(true);
    expect(t2.driverId).toBe(d1.id);
    expect(t1.driverId).toBe(d2.id);
    // kierowca bez auta wypycha obecnego
    expect(E.hireDriver(s, s.candidates[0].id).ok).toBe(true);
    const d3 = s.drivers.at(-1)!;
    expect(E.assignDriver(s, t1.id, d3.id).ok).toBe(true);
    expect(t1.driverId).toBe(d3.id);
    expect(E.truckOfDriver(s, d2)).toBeNull();
    // auto w trasie: zmiana zablokowana
    t1.tripId = 'x';
    expect(E.assignDriver(s, t1.id, d2.id).ok).toBe(false);
    expect(E.assignDriver(s, t2.id, d3.id).ok).toBe(false);
  });

  it('limit placu blokuje leasing, rozbudowa wymaga rangi', async () => {
    const E = await import('../src/engine/sim');
    const s = newGame(32);
    s.cash = 1_000_000;
    while (s.trucks.length < E.fleetCap(s)) expect(E.leaseOffer(s, s.truckOffers[0].id).ok).toBe(true);
    expect(E.leaseOffer(s, s.truckOffers[0].id).ok).toBe(false);
    expect(E.upgradeYard(s).ok).toBe(false); // ranga 0
    s.reputation = 30;
    expect(E.upgradeYard(s).ok).toBe(true);
    expect(E.leaseOffer(s, s.truckOffers[0].id).ok).toBe(true);
  });

  it('dyspozytorka sama wysyła wolne zestawy w trasę', async () => {
    const E = await import('../src/engine/sim');
    const s = newGame(33);
    s.cash = 1_000_000;
    s.reputation = 450;
    expect(E.buyUpgrade(s, 'dispatcher').ok).toBe(true);
    advanceTo(s, s.now + 60);
    expect(s.trucks[0].tripId).not.toBeNull();
  });

  it('awans po terminowych kursach, spadek po spóźnieniu', async () => {
    const E = await import('../src/engine/sim');
    const s = newGame(34);
    E.addReputation(s, 29);
    expect(E.rankIndex(s.reputation)).toBe(0);
    E.addReputation(s, 1);
    expect(E.rankIndex(s.reputation)).toBe(1);
    expect(s.log.at(-1)!.text).toContain('Awans');
  });

  it('zapis z wersji 1 migruje się z reputacją z historii i placem mieszczącym flotę', async () => {
    const { migrate } = await import('../src/engine/save');
    const s = newGame(35);
    const old: any = JSON.parse(JSON.stringify(s));
    old.version = 1;
    delete old.reputation;
    delete old.base;
    delete old.candidates;
    delete old.truckOffers;
    old.totals.jobsDone = 50;
    old.totals.lateJobs = 5;
    old.trucks = [old.trucks[0], { ...old.trucks[0], id: 'tX' }, { ...old.trucks[0], id: 'tY' }, { ...old.trucks[0], id: 'tZ' }];
    const m = migrate(old)!;
    expect(m.version).toBe(2);
    expect(m.reputation).toBe(30);
    expect(m.base.yard).toBe(1); // 4 auta nie mieszczą się na placu na 3
    advanceTo(m, m.now + 1);
    expect(m.candidates.length).toBeGreaterThan(0);
    expect(m.truckOffers.length).toBeGreaterThan(0);
  });
});
