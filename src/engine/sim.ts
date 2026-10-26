import { BALANCE } from '../data/balance';
import { CITIES, CITY_BY_ID, HOME_BASE } from '../data/cities';
import { CARGO, CLIENTS, COMPANY_START, DAILY_FLAVOR, FEMALE_NAMES, LAST_NAMES, MALE_NAMES, NICKNAMES, QUIRKS, TRUCK_MODELS } from '../data/flavor';
import { FRESH_DUTY, planTrip, type Leg } from './drivingRules';
import { clamp, driverSpeedKmh, rollIncidents, tripCosts } from './effects';
import { createQueue, qPeek, qPop, qPush } from './queue';
import { chance, createRng, pick, pickWeighted, rand, randInt, randRange, type RngState } from './rng';
import { roadKm } from './routes';
import { MIN_PER_HOUR, dayIndex, formatDuration, formatGameTime, nextMidnight } from './time';
import { SAVE_VERSION, type CostCategory, type Driver, type GameEvent, type GameState, type Job, type LogTone, type Trip, type Truck } from './types';

// ─── Pomocnicze ──────────────────────────────────────────────────────────────

export const fmtPLN = (v: number) => `${Math.round(v).toLocaleString('pl-PL')} zł`;

function newId(s: GameState, prefix: string): string {
  return `${prefix}${s.nextId++}`;
}

export function log(s: GameState, tone: LogTone, text: string): void {
  s.log.push({ t: s.now, tone, text });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

function earn(s: GameState, amount: number) {
  s.cash += amount;
  s.today.revenue += amount;
  s.totals.revenue += amount;
}

function spend(s: GameState, amount: number, cat: CostCategory) {
  s.costsByCategory[cat] += amount;
  s.cash -= amount;
  s.today.costs += amount;
  s.totals.costs += amount;
}

/** Końcówka czasownika w czasie przeszłym: g(d) → '' lub 'a'. */
export const g = (d: Driver) => (d.female ? 'a' : '');

export const driverName = (d: Driver) => `${d.firstName} „${d.nickname}” ${d.lastName}`;

// ─── Generatory ──────────────────────────────────────────────────────────────

function randomPlate(r: RngState): string {
  const letters = 'ABCDEFGHJKLMNPRSTUWXYZ';
  const l = () => letters[Math.floor(rand(r) * letters.length)];
  return `WX ${randInt(r, 10, 99)}${l()}${l()}${randInt(r, 1, 9)}`;
}

export function generateDriver(s: GameState): Driver {
  const r = s.rng;
  const female = chance(r, 0.18);
  let last = pick(r, LAST_NAMES);
  if (female) last = last.replace(/ski$/, 'ska').replace(/cki$/, 'cka');
  const stat = () => randInt(r, 25, 85);
  const stats = { experience: stat(), eco: stat(), reliability: stat(), stamina: stat(), morale: randInt(r, 55, 80) };
  return {
    id: newId(s, 'd'),
    firstName: pick(r, female ? FEMALE_NAMES : MALE_NAMES),
    lastName: last,
    female,
    nickname: pick(r, NICKNAMES),
    quirk: pick(r, QUIRKS),
    stats,
    salaryPerDay: Math.round(330 + stats.experience * 2 + randInt(r, 0, 50)),
    hiredAt: s.now,
    kmDriven: 0,
    jobsDone: 0,
    lateJobs: 0,
    duty: FRESH_DUTY(s.now - 24 * 60),
  };
}

export function generateTruck(s: GameState, driverId: string, cityId: string): Truck {
  const r = s.rng;
  const m = pick(r, TRUCK_MODELS);
  const odometerKm = randInt(r, 25, 85) * 10_000;
  const euro: 5 | 6 = chance(r, 0.2) ? 5 : 6;
  return {
    id: newId(s, 't'),
    plate: randomPlate(r),
    brand: m.brand,
    model: m.model,
    euro,
    fuelL100: Math.round((m.fuelL100 + randRange(r, -1, 1.5)) * 10) / 10,
    odometerKm,
    wear: clamp(odometerKm / 1_400_000 + randRange(r, 0, 0.1), 0, 0.95),
    leasePerDay: Math.round((euro === 5 ? 170 : 215) + (850_000 - odometerKm) / 12_000 + randInt(r, 0, 30)),
    cityId,
    driverId,
    tripId: null,
    serviceUntil: null,
  };
}

function generateJob(s: GameState): Job {
  const r = s.rng;
  // Połowa zleceń startuje tam, gdzie stoją nasze wolne ciągniki — giełda „widzi” okolicę.
  const idleCities = s.trucks.filter(isAvailable).map((t) => t.cityId);
  const fromId = idleCities.length > 0 && chance(r, 0.5) ? pick(r, idleCities) : pickWeighted(r, CITIES, (c) => c.weight).id;
  let to = pickWeighted(r, CITIES, (c) => c.weight);
  let guard = 0;
  while ((to.id === fromId || roadKm(fromId, to.id) < BALANCE.minJobKm) && guard++ < 50) {
    to = pickWeighted(r, CITIES, (c) => c.weight);
  }
  const km = roadKm(fromId, to.id);
  const cargo = pick(r, CARGO);
  const urgent = chance(r, 0.15);
  const ratePerKm = randRange(r, BALANCE.rateMinPerKm, BALANCE.rateMaxPerKm) * cargo.rateMul * (urgent ? 1.2 : 1);
  // Krótkie trasy mają wyższą stawkę za km (realnie tak jest: załadunek kosztuje tyle samo).
  const shortBonus = km < 250 ? 1 + (250 - km) / 600 : 1;
  const payment = Math.round((km * ratePerKm * shortBonus) / 10) * 10;
  const driveH = km / BALANCE.baseSpeedKmh;
  const estMin = (driveH + Math.floor(driveH / 4.5) * 0.75 + Math.floor(driveH / 9) * 11) * 60 + BALANCE.loadMin + BALANCE.unloadMin;
  const slack = urgent ? randRange(r, 1.1, 1.3) : randRange(r, 1.35, 2.2);
  return {
    id: newId(s, 'j'),
    fromId,
    toId: to.id,
    cargo: cargo.name + (urgent ? ' · PILNE' : ''),
    client: pick(r, CLIENTS),
    weightT: randInt(r, cargo.minT, cargo.maxT),
    km,
    payment,
    deadline: Math.round(s.now + 180 + estMin * slack),
    penaltyPerHour: Math.round((payment * randRange(r, 0.03, 0.06)) / 10) * 10,
    postedAt: s.now,
    expiresAt: s.now + randInt(r, BALANCE.jobLifetimeMin[0], BALANCE.jobLifetimeMin[1]),
  };
}

function refillMarket(s: GameState) {
  s.market = s.market.filter((j) => j.expiresAt > s.now);
  while (s.market.length < BALANCE.marketSize) s.market.push(generateJob(s));
}

// ─── Nowa gra ────────────────────────────────────────────────────────────────

export function newGame(seed: number): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: createRng(seed),
    now: 6 * MIN_PER_HOUR,
    cash: BALANCE.startCash,
    companyName: BALANCE.companyName,
    trucks: [],
    drivers: [],
    market: [],
    trips: {},
    queue: createQueue<GameEvent>(),
    log: [],
    days: [],
    today: { revenue: 0, costs: 0 },
    totals: { revenue: 0, costs: 0, jobsDone: 0, km: 0, lateJobs: 0, penalties: 0 },
    costsByCategory: { fuel: 0, toll: 0, salaries: 0, lease: 0, repairs: 0, fines: 0, fleet: 0, bonuses: 0 },
    nextId: 1,
  };
  const d = generateDriver(s);
  // Pierwszy kierowca jest trochę lepszy, żeby start nie był karą.
  d.stats.reliability = Math.max(d.stats.reliability, 60);
  d.stats.stamina = Math.max(d.stats.stamina, 55);
  s.drivers.push(d);
  const first = generateTruck(s, d.id, HOME_BASE);
  first.wear = Math.min(first.wear, 0.3);
  s.trucks.push(first);
  refillMarket(s);
  for (const line of COMPANY_START) log(s, 'funny', line.replace('{company}', s.companyName).replace('{cash}', fmtPLN(s.cash)));
  log(s, 'info', `Zatrudniono: ${driverName(d)}. ${d.quirk}`);
  qPush(s.queue, nextMidnight(s.now), { type: 'DAILY' });
  qPush(s.queue, s.now + BALANCE.marketRefreshMin, { type: 'MARKET_REFRESH' });
  return s;
}

// ─── Akcje gracza ────────────────────────────────────────────────────────────

export interface JobPreview {
  truckId: string;
  emptyKm: number;
  eta: number;
  durationMin: number;
  fuelCost: number;
  tollCost: number;
  profit: number;
  onTime: boolean;
  /** Zapas czasu do terminu przy planie bez zdarzeń (minuty, ujemny = nie zdąży). */
  bufferMin: number;
  /** Na czas, ale z małym zapasem: korek albo kontrola mogą przesądzić. */
  tight: boolean;
  tooFar: boolean;
}

function legsFor(job: Job, emptyKm: number): Leg[] {
  const legs: Leg[] = [];
  if (emptyKm > 0) legs.push({ kind: 'drive_empty', km: emptyKm });
  legs.push({ kind: 'load', min: BALANCE.loadMin }, { kind: 'drive', km: job.km }, { kind: 'unload', min: BALANCE.unloadMin });
  return legs;
}

/** Podgląd kursu bez losowych zdarzeń. Nie zużywa RNG, więc można go liczyć ile się chce. */
export function previewJob(s: GameState, job: Job, truck: Truck): JobPreview {
  const driver = s.drivers.find((d) => d.id === truck.driverId)!;
  const emptyKm = roadKm(truck.cityId, job.fromId);
  const { phases } = planTrip(s.now, legsFor(job, emptyKm), driverSpeedKmh(driver), [], driver.duty);
  const eta = phases[phases.length - 1].end;
  const { fuelCost, tollCost } = tripCosts(truck, driver, job, emptyKm);
  return {
    truckId: truck.id,
    emptyKm,
    eta,
    durationMin: eta - s.now,
    fuelCost,
    tollCost,
    profit: job.payment - fuelCost - tollCost,
    onTime: eta <= job.deadline,
    bufferMin: job.deadline - eta,
    tight: eta <= job.deadline && job.deadline - eta < BALANCE.tightBufferMin,
    tooFar: emptyKm > BALANCE.maxEmptyRunKm,
  };
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export function acceptJob(s: GameState, jobId: string, truckId: string): ActionResult {
  const job = s.market.find((j) => j.id === jobId);
  if (!job || job.expiresAt <= s.now) return { ok: false, error: 'Zlecenie już nieaktualne. Ktoś był szybszy.' };
  const truck = s.trucks.find((t) => t.id === truckId);
  if (!truck) return { ok: false, error: 'Nie ma takiego ciągnika.' };
  if (truck.tripId) return { ok: false, error: 'Ten zestaw jest w trasie.' };
  if (truck.serviceUntil !== null) return { ok: false, error: 'Ciągnik stoi w serwisie. Mechanik mówi „jeszcze chwilka”.' };
  const driver = s.drivers.find((d) => d.id === truck.driverId)!;
  const emptyKm = roadKm(truck.cityId, job.fromId);
  if (emptyKm > BALANCE.maxEmptyRunKm) return { ok: false, error: `Dojazd na pusto ${emptyKm} km. Księgowa zemdlała.` };

  const incidents = rollIncidents(s.rng, truck, driver, emptyKm + job.km);
  const { phases, duty } = planTrip(s.now, legsFor(job, emptyKm), driverSpeedKmh(driver), incidents, driver.duty);
  const costs = tripCosts(truck, driver, job, emptyKm);
  const trip: Trip = {
    id: newId(s, 'r'),
    job,
    truckId: truck.id,
    driverId: driver.id,
    originId: truck.cityId,
    emptyKm,
    phases,
    dutyAfter: duty,
    ...costs,
    startedAt: s.now,
    eta: phases[phases.length - 1].end,
  };
  s.trips[trip.id] = trip;
  truck.tripId = trip.id;
  s.market = s.market.filter((j) => j.id !== jobId);
  qPush(s.queue, trip.eta, { type: 'TRIP_DONE', tripId: trip.id });
  phases.forEach((p, i) => {
    if (p.kind === 'incident') qPush(s.queue, p.start, { type: 'TRIP_INCIDENT', tripId: trip.id, phaseIdx: i });
  });
  const from = CITY_BY_ID[job.fromId].name;
  const to = CITY_BY_ID[job.toId].name;
  const via = emptyKm > 0 ? ` (najpierw ${emptyKm} km na pusto z ${CITY_BY_ID[truck.cityId].gen})` : '';
  const msg = `${driver.nickname} rusza: ${from} → ${to}${via}. ${job.cargo}.`;
  log(s, 'info', msg);
  return { ok: true, message: msg };
}

export function leaseTruck(s: GameState): ActionResult {
  if (s.trucks.length >= BALANCE.maxFleet) return { ok: false, error: 'Plac jest pełny. Sąsiad już dzwonił.' };
  const need = BALANCE.hireFee + BALANCE.leaseDeposit;
  if (s.cash < need) return { ok: false, error: `Potrzeba ${fmtPLN(need)} na kaucję i rekrutację.` };
  spend(s, need, 'fleet');
  const d = generateDriver(s);
  const t = generateTruck(s, d.id, HOME_BASE);
  s.drivers.push(d);
  s.trucks.push(t);
  const msg = `Nowy zestaw: ${t.brand} ${t.model} (${t.plate}) + ${driverName(d)}. ${d.quirk}`;
  log(s, 'good', msg);
  return { ok: true, message: msg };
}

export const isAvailable = (t: Truck) => !t.tripId && t.serviceUntil === null;

export function serviceQuote(t: Truck) {
  const floor = agingFloor(t);
  const cost = Math.round((1500 + Math.max(0, t.wear - floor) * 12_000) / 10) * 10;
  return { cost, durationMin: BALANCE.serviceMin, wearAfter: floor };
}

/** Część zużycia, której serwis nie cofnie: starzenie od przebiegu. */
function agingFloor(t: Truck) {
  return clamp(t.odometerKm / 2_500_000, 0, 0.6);
}

export function serviceTruck(s: GameState, truckId: string): ActionResult {
  const t = s.trucks.find((x) => x.id === truckId);
  if (!t) return { ok: false, error: 'Nie ma takiego ciągnika.' };
  if (!isAvailable(t)) return { ok: false, error: 'Ciągnik jest zajęty.' };
  const q = serviceQuote(t);
  if (s.cash < q.cost) return { ok: false, error: `Serwis kosztuje ${fmtPLN(q.cost)}. Nie stać nas nawet na olej.` };
  spend(s, q.cost, 'repairs');
  t.serviceUntil = s.now + q.durationMin;
  qPush(s.queue, t.serviceUntil, { type: 'SERVICE_DONE', truckId: t.id });
  const msg = `${t.brand} ${t.model} (${t.plate}) jedzie do serwisu. Koszt ${fmtPLN(q.cost)}.`;
  log(s, 'info', msg);
  return { ok: true, message: msg };
}

export function bonusAvailableAt(d: Driver): number {
  return d.lastBonusAt === undefined ? 0 : d.lastBonusAt + BALANCE.bonusCooldownDays * 24 * 60;
}

const BONUS_LINES = [
  '{nick} dostał{a} premię. Podobno już planuje nowe dywaniki do kabiny.',
  '{nick} dostał{a} premię i obiecał{a}, że od jutra tylko eco-driving. Zobaczymy.',
  'Premia dla kierowcy „{nick}”. Na CB od razu lepszy humor.',
];

export function giveBonus(s: GameState, driverId: string): ActionResult {
  const d = s.drivers.find((x) => x.id === driverId);
  if (!d) return { ok: false, error: 'Nie ma takiego kierowcy.' };
  if (s.now < bonusAvailableAt(d)) return { ok: false, error: `${d.nickname} dostał${g(d)} premię niedawno. Następna od ${formatGameTime(bonusAvailableAt(d))}.` };
  if (s.cash < BALANCE.bonusCost) return { ok: false, error: 'Nie stać nas nawet na premię. Może pochwała?' };
  spend(s, BALANCE.bonusCost, 'bonuses');
  d.stats.morale = clamp(d.stats.morale + BALANCE.bonusMorale);
  d.lastBonusAt = s.now;
  const msg = pick(s.rng, BONUS_LINES).replaceAll('{nick}', d.nickname).replaceAll('{a}', g(d));
  log(s, 'good', `${msg} (−${fmtPLN(BALANCE.bonusCost)}, morale +${BALANCE.bonusMorale})`);
  return { ok: true, message: msg };
}

// ─── Obsługa zdarzeń ─────────────────────────────────────────────────────────

function onTripIncident(s: GameState, tripId: string, phaseIdx: number) {
  const trip = s.trips[tripId];
  const info = trip?.phases[phaseIdx]?.incident;
  if (!trip || !info) return;
  if (info.cost > 0) spend(s, info.cost, info.kind === 'breakdown' ? 'repairs' : 'fines');
  const delay = formatDuration(trip.phases[phaseIdx].end - trip.phases[phaseIdx].start);
  log(s, info.tone, `${info.text} (+${delay}${info.cost > 0 ? `, −${fmtPLN(info.cost)}` : ''})`);
}

function onTripDone(s: GameState, tripId: string) {
  const trip = s.trips[tripId];
  if (!trip) return;
  const truck = s.trucks.find((t) => t.id === trip.truckId)!;
  const driver = s.drivers.find((d) => d.id === trip.driverId)!;
  const job = trip.job;
  const totalKm = trip.emptyKm + job.km;
  const overMin = Math.max(0, trip.eta - job.deadline);
  // Do godziny po terminie klient zwykle przymyka oko; kara liczy się od pierwszej minuty po tolerancji.
  const lateMin = overMin > BALANCE.lateGraceMin ? overMin : 0;
  const penalty = lateMin > 0 ? Math.min(job.payment * 0.5, Math.ceil(lateMin / 60) * job.penaltyPerHour) : 0;

  earn(s, job.payment - penalty);
  spend(s, trip.fuelCost, 'fuel');
  spend(s, trip.tollCost, 'toll');
  s.totals.penalties += penalty;

  truck.cityId = job.toId;
  truck.odometerKm += totalKm;
  truck.wear = clamp(truck.wear + totalKm * BALANCE.wearPerKm, 0, 1);
  truck.tripId = null;

  driver.duty = trip.dutyAfter;
  driver.kmDriven += totalKm;
  driver.jobsDone += 1;
  driver.stats.experience = clamp(driver.stats.experience + ((100 - driver.stats.experience) * totalKm) / 60_000);
  driver.stats.morale = clamp(driver.stats.morale + (lateMin > 0 ? -BALANCE.lateMoraleHit : BALANCE.onTimeMoraleGain));

  s.totals.jobsDone += 1;
  s.totals.km += totalKm;

  const city = CITY_BY_ID[job.toId].gen;
  const net = job.payment - penalty - trip.fuelCost - trip.tollCost;
  if (lateMin > 0) {
    driver.lateJobs += 1;
    s.totals.lateJobs += 1;
    log(s, 'bad', `${driver.nickname} spóźnił${g(driver)} się ${formatDuration(lateMin)} do ${city}. Kara ${fmtPLN(penalty)}. „Korki były”. Na czysto: ${fmtPLN(net)}.`);
  } else if (overMin > 0) {
    log(s, 'funny', `${driver.nickname} ${driver.female ? 'dojechała' : 'dojechał'} do ${city} ${formatDuration(overMin)} po terminie. Magazynier westchnął, ale podpisał bez kary. Na czysto: ${fmtPLN(net)}.`);
  } else {
    log(s, 'good', `${driver.nickname} ${driver.female ? 'dowiozła' : 'dowiózł'} do ${city}: ${job.cargo.toLowerCase()}. Fracht ${fmtPLN(job.payment)}, paliwo i myto ${fmtPLN(trip.fuelCost + trip.tollCost)}. Na czysto: ${fmtPLN(net)}.`);
  }
  delete s.trips[tripId];
}

function onDaily(s: GameState) {
  const salaries = s.drivers.reduce((sum, d) => sum + d.salaryPerDay, 0);
  const leases = s.trucks.reduce((sum, t) => sum + t.leasePerDay, 0);
  spend(s, salaries, 'salaries');
  spend(s, leases, 'lease');
  // Morale wraca powoli do normy: dobra passa i kryzys mijają, jeśli nic ich nie podtrzymuje.
  for (const d of s.drivers) {
    d.stats.morale = clamp(d.stats.morale + (BALANCE.moraleBaseline - d.stats.morale) * BALANCE.moraleReversion);
  }
  for (const t of s.trucks) {
    if (!t.tripId) {
      const d = s.drivers.find((x) => x.id === t.driverId)!;
      d.stats.morale = clamp(d.stats.morale + BALANCE.idleMoraleDrift);
    }
  }
  s.days.push({ day: dayIndex(s.now) - 1, cash: Math.round(s.cash), revenue: Math.round(s.today.revenue), costs: Math.round(s.today.costs) });
  if (s.days.length > 730) s.days.shift();
  s.today = { revenue: 0, costs: 0 };
  if (s.cash < 0) log(s, 'bad', `Konto na minusie (${fmtPLN(s.cash)}). Bank dzwoni i nie brzmi wesoło.`);
  else if (chance(s.rng, 0.25)) log(s, 'funny', pick(s.rng, DAILY_FLAVOR));
  qPush(s.queue, nextMidnight(s.now), { type: 'DAILY' });
}

function handle(s: GameState, ev: GameEvent) {
  switch (ev.type) {
    case 'TRIP_DONE':
      return onTripDone(s, ev.tripId);
    case 'TRIP_INCIDENT':
      return onTripIncident(s, ev.tripId, ev.phaseIdx);
    case 'SERVICE_DONE': {
      const t = s.trucks.find((x) => x.id === ev.truckId);
      if (!t) return;
      t.serviceUntil = null;
      t.wear = agingFloor(t);
      log(s, 'good', `${t.plate} wraca z serwisu. Mechanik: „Teraz pojedzie jak nowa. No, prawie”.`);
      return;
    }
    case 'MARKET_REFRESH':
      refillMarket(s);
      qPush(s.queue, s.now + BALANCE.marketRefreshMin, { type: 'MARKET_REFRESH' });
      return;
    case 'DAILY':
      return onDaily(s);
  }
}

/** Przesuwa zegar do `target`, wykonując po drodze wszystkie zaplanowane zdarzenia. */
export function advanceTo(s: GameState, target: number): number {
  let processed = 0;
  for (let next = qPeek(s.queue); next && next.at <= target; next = qPeek(s.queue)) {
    qPop(s.queue);
    s.now = Math.max(s.now, next.at);
    handle(s, next.ev);
    processed++;
  }
  s.now = Math.max(s.now, target);
  return processed;
}

export interface CatchUpReport {
  gameMinutes: number;
  capped: boolean;
  cashDelta: number;
  jobsDone: number;
  events: number;
}

/** Postęp offline: nadrabia czas nieobecności w tempie bazowym, z limitem. */
export function catchUp(s: GameState, realElapsedMs: number, pace: number): CatchUpReport {
  const wanted = Math.max(0, (realElapsedMs / 1000) * pace);
  const gameMinutes = Math.min(wanted, BALANCE.offlineCapMin);
  const cash0 = s.cash;
  const jobs0 = s.totals.jobsDone;
  const events = advanceTo(s, s.now + gameMinutes);
  return { gameMinutes, capped: wanted > gameMinutes, cashDelta: s.cash - cash0, jobsDone: s.totals.jobsDone - jobs0, events };
}

export { formatGameTime };
