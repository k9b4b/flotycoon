import { BALANCE } from '../data/balance';
import { CITIES, CITY_BY_ID, HOME_BASE } from '../data/cities';
import { ARRIVE_FLAVOR, CARGO, CB_DEPART, CLIENTS, COMPANY_START, DAILY_FLAVOR, LATE_EXCUSES } from '../data/flavor';
import { MARKETS, OFFICE, REPUTATION } from '../data/progression';
import {
  addReputation,
  driverOfTruck,
  generateDriver,
  rankIndex,
  refreshCandidates,
  refreshTruckOffers,
  serviceModifiers,
  truckFromOffer,
  truckOfDriver,
  upgradesPerDay,
  usedOffer,
} from './company';
import { driverName, earn, fmtPLN, g, log, newId, spend, type ActionResult } from './core';
import { planTrip, type Leg } from './drivingRules';
import { clamp, driverSpeedKmh, perkMods, rollIncidents, tripCosts } from './effects';
import { createQueue, qPeek, qPop, qPush } from './queue';
import { chance, createRng, pick, pickWeighted, rand, randInt, randRange } from './rng';
import { onContractCheck, onContractOffers, onContractPost, onContractRunDone, refreshContractOffers } from './contracts';
import { CONTRACTS } from '../data/development';
import { checkMilestones, onTrainingDone } from './training';
import { ALL_ROAD_EVENTS, ROAD_EVENT_BY_ID, eventCtx, optionLabel, type Outcome } from './roadEvents';
import { roadKm } from './routes';
import { MIN_PER_HOUR, dayIndex, formatDuration, formatGameTime, nextMidnight } from './time';
import { SAVE_VERSION, type Driver, type GameEvent, type GameState, type IncidentInfo, type Job, type PendingDecision, type Phase, type Trip, type Truck, type TutorialState } from './types';

// Ponowny eksport, żeby UI, worker i narzędzia miały jedno miejsce importu.
export { driverName, fmtPLN, g, log, type ActionResult };
export * from './company';
export { activeContracts, maxContracts, signContract } from './contracts';
export { courseGain, timesTaken, trainDriver } from './training';
export { ALL_ROAD_EVENTS as ROAD_EVENTS, ROAD_EVENT_BY_ID, eventCtx } from './roadEvents';

// ─── Dostępność ──────────────────────────────────────────────────────────────

/** Auto stoi na placu: nie jest w trasie ani w serwisie. */
export const isIdle = (t: Truck) => !t.tripId && t.serviceUntil === null;
/** Auto może wziąć zlecenie: stoi i ma kierowcę. */
export const isAvailable = (t: Truck) => isIdle(t) && t.driverId !== null;

// ─── Giełda ──────────────────────────────────────────────────────────────────

/**
 * Skąd biorą się ładunki: giełda pokazuje głównie okolice naszych aut, tak jak
 * prawdziwa giełda filtrowana po lokalizacji. Część ofert jest z miejsc, w których
 * stoją wolne zestawy, część z miast, do których właśnie jadą (ładunek powrotny).
 */
function pickOrigin(s: GameState): string {
  const r = s.rng;
  const idle = s.trucks.filter(isAvailable).map((t) => t.cityId);
  const heading = Object.values(s.trips).map((t) => t.job.toId);
  const x = rand(r);
  if (idle.length > 0 && x < 0.35) return pick(r, idle);
  if (heading.length > 0 && x < 0.6) return pick(r, heading);
  return pickWeighted(r, CITIES, (c) => c.weight).id;
}

export function generateJob(s: GameState, forcedFrom?: string): Job {
  const r = s.rng;
  const fromId = forcedFrom ?? pickOrigin(s);
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
  // Czas kursu dla typowego kierowcy w połowie dnia pracy: z przerwami i ewentualnym
  // odpoczynkiem dobowym, tak jak liczy go realny spedytor.
  const est = planTrip(
    s.now,
    [{ kind: 'load', min: BALANCE.loadMin }, { kind: 'drive', km }, { kind: 'unload', min: BALANCE.unloadMin }],
    BALANCE.baseSpeedKmh,
    [],
    { sinceBreak: 0, today: 270, at: s.now },
  );
  const estMin = est.phases[est.phases.length - 1].end - s.now;
  // Okno załadunku: tyle czasu jest, żeby dojechać i zacząć ładować. Potem oferta znika.
  const loadWindow = urgent ? randInt(r, 2, 4) * 60 : randInt(r, 4, 10) * 60;
  const slack = urgent ? randRange(r, 1.05, 1.2) : randRange(r, 1.15, 1.6);
  return {
    id: newId(s, 'j'),
    fromId,
    toId: to.id,
    cargo: cargo.name + (urgent ? ' · PILNE' : ''),
    client: pick(r, CLIENTS),
    weightT: randInt(r, cargo.minT, cargo.maxT),
    km,
    payment,
    deadline: Math.round(s.now + loadWindow + estMin * slack + 60),
    penaltyPerHour: Math.round((payment * randRange(r, 0.03, 0.06)) / 10) * 10,
    postedAt: s.now,
    expiresAt: s.now + loadWindow,
  };
}

const marketSize = (s: GameState) => BALANCE.marketSize + (s.base.office ? OFFICE.extraOffers : 0);

function refillMarket(s: GameState) {
  // Kursy kontraktowe zdejmuje z giełdy dopiero sprawdzenie kontraktu (przepadnięcie kosztuje).
  s.market = s.market.filter((j) => j.contractId || j.expiresAt > s.now);
  let open = s.market.filter((j) => !j.contractId).length;
  while (open++ < marketSize(s)) s.market.push(generateJob(s));
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
    costsByCategory: { fuel: 0, toll: 0, salaries: 0, lease: 0, repairs: 0, fines: 0, fleet: 0, bonuses: 0, base: 0, training: 0 },
    nextId: 1,
    reputation: 0,
    base: { yard: 0, workshop: false, office: false, dispatcher: false, autoDispatch: false },
    candidates: [],
    truckOffers: [],
    settings: { askDecisions: true, tutorial: { step: 0, seen: [], off: false } },
    decisions: [],
    contracts: [],
    contractOffers: [],
  };
  const d = generateDriver(s);
  // Pierwszy kierowca jest trochę lepszy, żeby start nie był karą.
  d.stats.reliability = Math.max(d.stats.reliability, 60);
  d.stats.stamina = Math.max(d.stats.stamina, 55);
  s.drivers.push(d);
  const first = truckFromOffer({ ...usedOffer(s), id: newId(s, 't') }, HOME_BASE, d.id);
  first.wear = Math.min(first.wear, 0.3);
  s.trucks.push(first);
  refillMarket(s);
  refreshCandidates(s);
  refreshTruckOffers(s);
  for (const line of COMPANY_START) log(s, 'funny', line.replace('{company}', s.companyName).replace('{cash}', fmtPLN(s.cash)));
  log(s, 'info', `Zatrudniono: ${driverName(d)}. ${d.quirk}`);
  qPush(s.queue, nextMidnight(s.now), { type: 'DAILY' });
  qPush(s.queue, s.now + BALANCE.marketRefreshMin, { type: 'MARKET_REFRESH' });
  qPush(s.queue, s.now + 7 * 24 * 60, { type: 'CONTRACT_OFFERS' });
  return s;
}

// ─── Akcje gracza: zlecenia i serwis ─────────────────────────────────────────

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
  /** Ile minut kursu to obowiązkowy odpoczynek dobowy (tachograf). */
  restMin: number;
  tooFar: boolean;
}

function legsFor(job: Job, emptyKm: number): Leg[] {
  const legs: Leg[] = [];
  if (emptyKm > 0) legs.push({ kind: 'drive_empty', km: emptyKm });
  legs.push({ kind: 'load', min: BALANCE.loadMin }, { kind: 'drive', km: job.km }, { kind: 'unload', min: BALANCE.unloadMin });
  return legs;
}

/** Podgląd kursu bez losowych zdarzeń. Nie zużywa RNG. Wymaga auta z kierowcą. */
export function previewJob(s: GameState, job: Job, truck: Truck): JobPreview {
  const driver = driverOfTruck(s, truck);
  if (!driver) throw new Error(`Auto ${truck.id} nie ma kierowcy`);
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
    restMin: phases.filter((p) => p.kind === 'rest').reduce((a, p) => a + p.end - p.start, 0),
    tooFar: emptyKm > BALANCE.maxEmptyRunKm,
  };
}

export function acceptJob(s: GameState, jobId: string, truckId: string): ActionResult {
  const job = s.market.find((j) => j.id === jobId);
  if (!job || job.expiresAt <= s.now) return { ok: false, error: 'Zlecenie już nieaktualne. Ktoś był szybszy.' };
  const truck = s.trucks.find((t) => t.id === truckId);
  if (!truck) return { ok: false, error: 'Nie ma takiego ciągnika.' };
  if (truck.tripId) return { ok: false, error: 'Ten zestaw jest w trasie.' };
  if (truck.serviceUntil !== null) return { ok: false, error: 'Ciągnik stoi w serwisie. Mechanik mówi „jeszcze chwilka”.' };
  const driver = driverOfTruck(s, truck);
  if (!driver) return { ok: false, error: 'To auto nie ma kierowcy. Samo nie pojedzie (jeszcze).' };
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
  if (job.contractId) {
    const c = s.contracts.find((x) => x.id === job.contractId);
    if (c?.pendingJobId === job.id) c.pendingJobId = null;
  }
  qPush(s.queue, trip.eta, { type: 'TRIP_DONE', tripId: trip.id });
  phases.forEach((p, i) => {
    if (p.kind !== 'incident' || !p.incident) return;
    p.incident.id = `${trip.id}:${i}`;
    qPush(s.queue, p.start, { type: 'TRIP_INCIDENT', tripId: trip.id, incId: p.incident.id });
  });
  scheduleRoadEvent(s, trip);
  const from = CITY_BY_ID[job.fromId].name;
  const to = CITY_BY_ID[job.toId].name;
  const via = emptyKm > 0 ? ` (najpierw ${emptyKm} km na pusto z ${CITY_BY_ID[truck.cityId].gen})` : '';
  const msg = `${driver.nickname} rusza: ${from} → ${to}${via}. ${job.cargo}.`;
  log(s, 'info', msg);
  if (chance(s.rng, 0.25)) log(s, 'funny', fillDriver(pick(s.rng, CB_DEPART), driver));
  return { ok: true, message: msg };
}

// ─── Zdarzenia z decyzją ────────────────────────────────────────────────────

/** Czasem coś się wydarzy w trakcie jazdy: losujemy moment w jednej z faz jazdy. */
function scheduleRoadEvent(s: GameState, trip: Trip) {
  const totalKm = trip.emptyKm + trip.job.km;
  if (!chance(s.rng, BALANCE.roadEventChance * Math.min(1.4, totalKm / 350))) return;
  const drives = trip.phases.filter((p) => (p.kind === 'drive' || p.kind === 'drive_empty') && p.end - p.start > 20);
  if (drives.length === 0) return;
  const ph = pickWeighted(s.rng, drives, (p) => p.end - p.start);
  qPush(s.queue, ph.start + randRange(s.rng, 0.15, 0.85) * (ph.end - ph.start), { type: 'ROAD_EVENT', tripId: trip.id });
}

/**
 * Wstawia postój do harmonogramu kursu w chwili `at`: bieżąca faza się dzieli,
 * a wszystko później przesuwa się o `min`. Zdarzenia w kolejce same się przeplanują.
 */
export function delayTrip(trip: Trip, at: number, min: number, info: IncidentInfo) {
  if (min <= 0) return;
  const out: Phase[] = [];
  let done = false;
  for (const p of trip.phases) {
    if (done) out.push({ ...p, start: p.start + min, end: p.end + min });
    else if (p.end <= at) out.push(p);
    else {
      const km = p.start < at ? p.km0 + ((p.km1 - p.km0) * (at - p.start)) / (p.end - p.start) : p.km0;
      if (p.start < at) out.push({ ...p, end: at, km1: km });
      out.push({ kind: 'incident', start: at, end: at + min, km0: km, km1: km, incident: info });
      out.push({ ...p, start: Math.max(p.start, at) + min, end: p.end + min, km0: km });
      done = true;
    }
  }
  if (!done) {
    const last = out[out.length - 1];
    out.push({ kind: 'incident', start: at, end: at + min, km0: last?.km1 ?? 0, km1: last?.km1 ?? 0, incident: info });
  }
  trip.phases = out;
  trip.eta = out[out.length - 1].end;
  trip.dutyAfter = { ...trip.dutyAfter, at: trip.dutyAfter.at + min };
}

function onRoadEvent(s: GameState, tripId: string, interactive: boolean) {
  const trip = s.trips[tripId];
  if (!trip) return;
  const d = s.drivers.find((x) => x.id === trip.driverId);
  const t = s.trucks.find((x) => x.id === trip.truckId);
  if (!d || !t) return;
  const def = pickWeighted(s.rng, ALL_ROAD_EVENTS, (e) => e.weight);
  const vars = def.init?.(eventCtx(s, trip, d, t, {})) ?? {};
  const dec: PendingDecision = { id: newId(s, 'e'), eventId: def.id, tripId, driverId: d.id, truckId: t.id, at: s.now, vars };
  if (interactive && s.settings.askDecisions) s.decisions.push(dec);
  else applyDecision(s, dec, null);
}

const effectSummary = (o: Outcome) =>
  [
    o.delayMin ? `+${formatDuration(o.delayMin)}` : '',
    o.cost ? `−${fmtPLN(o.cost)}` : '',
    o.payment ? `${o.payment > 0 ? '+' : '−'}${fmtPLN(Math.abs(o.payment))} frachtu` : '',
    o.fuelSaving ? `−${fmtPLN(o.fuelSaving)} na paliwie` : '',
    o.deadline ? `termin +${formatDuration(o.deadline)}` : '',
    o.morale ? `morale ${o.morale > 0 ? '+' : ''}${o.morale}` : '',
    o.rep ? `reputacja ${o.rep > 0 ? '+' : ''}${o.rep}` : '',
  ]
    .filter(Boolean)
    .join(', ');

/** Rozstrzyga zdarzenie: optionId od gracza albo null (kierowca decyduje sam). */
function applyDecision(s: GameState, dec: PendingDecision, optionId: string | null): ActionResult {
  s.decisions = s.decisions.filter((x) => x.id !== dec.id);
  const trip = s.trips[dec.tripId];
  const d = s.drivers.find((x) => x.id === dec.driverId);
  const t = s.trucks.find((x) => x.id === dec.truckId);
  const def = ROAD_EVENT_BY_ID[dec.eventId];
  if (!trip || !d || !t || !def) return { ok: false, error: 'To zdarzenie już się nie liczy.' };
  const c = eventCtx(s, trip, d, t, dec.vars);
  const byDriver = optionId === null;
  const opt = def.options.find((o) => o.id === (optionId ?? def.auto(c))) ?? def.options[0];
  const o = opt.resolve(c);
  if (o.delayMin) delayTrip(trip, s.now, o.delayMin, { kind: 'event', text: `${def.title}: ${o.text}`, cost: o.cost ?? 0, tone: o.tone });
  if (o.cost) spend(s, o.cost, o.costCat ?? 'repairs');
  if (o.costCat === 'fines') d.fines = (d.fines ?? 0) + 1;
  if (o.payment) trip.job = { ...trip.job, payment: Math.max(0, trip.job.payment + o.payment) };
  if (o.fuelSaving) trip.fuelCost = Math.max(0, trip.fuelCost - o.fuelSaving);
  if (o.deadline) trip.job = { ...trip.job, deadline: trip.job.deadline + o.deadline };
  if (o.morale) d.stats.morale = clamp(d.stats.morale + o.morale);
  if (o.wear) t.wear = clamp(t.wear + o.wear, 0, 1);
  if (o.rep) addReputation(s, o.rep);
  const who = byDriver ? ` ${d.nickname} zdecydował${g(d)} sam${g(d)}: „${optionLabel(opt, c)}”.` : '';
  const fx = effectSummary(o);
  const msg = `${def.title}${/[?!]$/.test(def.title) ? '' : '.'}${who} ${o.text}${fx ? ` (${fx})` : ''}`;
  log(s, o.tone, msg);
  return { ok: true, message: msg };
}

/** Gracz wybiera opcję w oknie zdarzenia. */
export function resolveDecision(s: GameState, decisionId: string, optionId: string): ActionResult {
  const dec = s.decisions.find((x) => x.id === decisionId);
  if (!dec) return { ok: false, error: 'To zdarzenie już się rozstrzygnęło.' };
  return applyDecision(s, dec, optionId);
}

/** Wszystkie czekające decyzje podejmują kierowcy (np. gracz zamknął kartę albo wyłączył pytania). */
export function autoResolveAll(s: GameState) {
  for (const dec of [...s.decisions]) applyDecision(s, dec, null);
}

export function setAskDecisions(s: GameState, on: boolean): ActionResult {
  s.settings.askDecisions = on;
  if (!on) autoResolveAll(s);
  return { ok: true, message: on ? 'Kierowcy będą dzwonić z każdą decyzją na trasie.' : 'Kierowcy decydują sami. Szef ma święty spokój (prawie).' };
}

/** Zapisuje postęp samouczka (bez wpisu w dzienniku). */
export function setTutorial(s: GameState, t: TutorialState): ActionResult {
  s.settings.tutorial = { step: t.step, seen: [...t.seen], off: t.off };
  return { ok: true, message: '' };
}

const fillDriver = (text: string, d: Driver) => text.replaceAll('{nick}', d.nickname).replaceAll('{a}', g(d));

export function serviceQuote(s: GameState, t: Truck) {
  const mod = serviceModifiers(s);
  const floor = agingFloor(t);
  const cost = Math.round(((1500 + Math.max(0, t.wear - floor) * 12_000) * mod.costMul) / 10) * 10;
  return { cost, durationMin: Math.round(BALANCE.serviceMin * mod.timeMul), wearAfter: floor };
}

/** Część zużycia, której serwis nie cofnie: starzenie od przebiegu. */
function agingFloor(t: Truck) {
  return clamp(t.odometerKm / 2_500_000, 0, 0.6);
}

export function serviceTruck(s: GameState, truckId: string): ActionResult {
  const t = s.trucks.find((x) => x.id === truckId);
  if (!t) return { ok: false, error: 'Nie ma takiego ciągnika.' };
  if (!isIdle(t)) return { ok: false, error: 'Ciągnik jest zajęty.' };
  const q = serviceQuote(s, t);
  if (s.cash < q.cost) return { ok: false, error: `Serwis kosztuje ${fmtPLN(q.cost)}. Nie stać nas nawet na olej.` };
  spend(s, q.cost, 'repairs');
  t.serviceUntil = s.now + q.durationMin;
  qPush(s.queue, t.serviceUntil, { type: 'SERVICE_DONE', truckId: t.id });
  const msg = `${t.brand} ${t.model} (${t.plate}) jedzie do serwisu${s.base.workshop ? ' (własny warsztat)' : ''}. Koszt ${fmtPLN(q.cost)}.`;
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

// ─── Dyspozytor ──────────────────────────────────────────────────────────────

/**
 * Najlepsze zlecenie dla auta: na czas, z zyskiem, wg zysku na godzinę.
 * Domyślnie tylko z zapasem czasu (tak gra dyspozytorka); allowTight bierze też „na styk”.
 */
export function bestSafeJob(s: GameState, t: Truck, allowTight = false): Job | null {
  let best: Job | null = null;
  let bestScore = -Infinity;
  for (const j of s.market) {
    if (j.expiresAt <= s.now) continue;
    const p = previewJob(s, j, t);
    if (!p.onTime || (p.tight && !allowTight) || p.tooFar || p.profit <= 0) continue;
    // Kurs z kontraktu ma pierwszeństwo: przepadnięcie kosztuje karę i reputację.
    const score = (p.profit / Math.max(60, p.durationMin)) * (j.contractId ? 3 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = j;
    }
  }
  return best;
}

/** Dyspozytorka Halina: przydziela ładunki wolnym zestawom i pilnuje serwisów. */
function dispatch(s: GameState) {
  for (const t of s.trucks.filter(isAvailable)) {
    const q = serviceQuote(s, t);
    if (t.wear > 0.5 && s.cash > q.cost * 3) {
      serviceTruck(s, t.id);
      continue;
    }
    const job = bestSafeJob(s, t);
    if (job) acceptJob(s, job.id, t.id);
  }
}

// ─── Obsługa zdarzeń ─────────────────────────────────────────────────────────

function onTripIncident(s: GameState, ev: Extract<GameEvent, { type: 'TRIP_INCIDENT' }>) {
  const trip = s.trips[ev.tripId];
  if (!trip) return;
  const phaseIdx = ev.incId ? trip.phases.findIndex((p) => p.incident?.id === ev.incId) : (ev.phaseIdx ?? -1);
  const info = trip.phases[phaseIdx]?.incident;
  if (!info) return;
  // Harmonogram przesunęła decyzja na trasie: zdarzenie wypadnie później.
  if (trip.phases[phaseIdx].start > s.now + 1e-6) {
    qPush(s.queue, trip.phases[phaseIdx].start, ev);
    return;
  }
  if (info.cost > 0) spend(s, info.cost, info.kind === 'breakdown' ? 'repairs' : 'fines');
  if (info.kind === 'itd' && info.cost > 0) {
    addReputation(s, REPUTATION.itdFine);
    const d = s.drivers.find((x) => x.id === trip.driverId);
    if (d) d.fines = (d.fines ?? 0) + 1;
  }
  const delay = formatDuration(trip.phases[phaseIdx].end - trip.phases[phaseIdx].start);
  log(s, info.tone, `${info.text} (+${delay}${info.cost > 0 ? `, −${fmtPLN(info.cost)}` : ''})`);
}

function onTripDone(s: GameState, tripId: string): boolean {
  const trip = s.trips[tripId];
  if (!trip) return false;
  if (trip.eta > s.now + 1e-6) {
    qPush(s.queue, trip.eta, { type: 'TRIP_DONE', tripId });
    return false;
  }
  const truck = s.trucks.find((t) => t.id === trip.truckId)!;
  const driver = s.drivers.find((d) => d.id === trip.driverId);
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
  truck.wear = clamp(truck.wear + totalKm * BALANCE.wearPerKm * (driver ? perkMods(driver).wearMul : 1), 0, 1);
  truck.tripId = null;

  const kmBefore = driver?.kmDriven ?? 0;
  if (driver) {
    driver.duty = trip.dutyAfter;
    driver.kmDriven += totalKm;
    driver.jobsDone += 1;
    driver.stats.experience = clamp(driver.stats.experience + ((100 - driver.stats.experience) * totalKm) / 60_000);
    driver.stats.morale = clamp(driver.stats.morale + (lateMin > 0 ? -BALANCE.lateMoraleHit * perkMods(driver).lateMoraleMul : BALANCE.onTimeMoraleGain));
  }

  s.totals.jobsDone += 1;
  s.totals.km += totalKm;

  const nick = driver?.nickname ?? 'Kierowca';
  const city = CITY_BY_ID[job.toId].gen;
  const net = job.payment - penalty - trip.fuelCost - trip.tollCost;
  if (lateMin > 0) {
    if (driver) driver.lateJobs += 1;
    s.totals.lateJobs += 1;
    log(s, 'bad', `${nick} spóźnił${driver ? g(driver) : ''} się ${formatDuration(lateMin)} do ${city}. Kara ${fmtPLN(penalty)}. ${pick(s.rng, LATE_EXCUSES)} Na czysto: ${fmtPLN(net)}.`);
    addReputation(s, REPUTATION.late + (driver ? perkMods(driver).repLate : 0));
  } else {
    if (overMin > 0) {
      log(s, 'funny', `${nick} ${driver?.female ? 'dojechała' : 'dojechał'} do ${city} ${formatDuration(overMin)} po terminie. Magazynier westchnął, ale podpisał bez kary. Na czysto: ${fmtPLN(net)}.`);
    } else {
      log(s, 'good', `${nick} ${driver?.female ? 'dowiozła' : 'dowiózł'} do ${city}: ${job.cargo.charAt(0).toLowerCase() + job.cargo.slice(1)}. Fracht ${fmtPLN(job.payment)}, paliwo i myto ${fmtPLN(trip.fuelCost + trip.tollCost)}. Na czysto: ${fmtPLN(net)}.${driver && chance(s.rng, 0.2) ? ` ${fillDriver(pick(s.rng, ARRIVE_FLAVOR), driver)}` : ''}`);
    }
    const urgent = job.cargo.includes('PILNE') ? REPUTATION.urgentBonus : 0;
    const long = job.km > 400 ? REPUTATION.longHaulBonus : 0;
    addReputation(s, REPUTATION.onTime + urgent + long + (driver ? perkMods(driver).repOnTime : 0));
  }
  delete s.trips[tripId];
  if (job.contractId) onContractRunDone(s, job.contractId, lateMin > 0);
  if (driver) checkMilestones(s, driver, kmBefore);
  // Spedytor od razu szuka ładunku powrotnego z miejsca rozładunku.
  const backloads = BALANCE.backloadOffers + (s.base.office ? OFFICE.extraBackload : 0);
  for (let i = 0; i < backloads; i++) s.market.push(generateJob(s, job.toId));
  return true;
}

function onDaily(s: GameState) {
  const salaries = s.drivers.reduce((sum, d) => sum + d.salaryPerDay, 0);
  const leases = s.trucks.reduce((sum, t) => sum + t.leasePerDay, 0);
  spend(s, salaries, 'salaries');
  spend(s, leases, 'lease');
  const base = upgradesPerDay(s);
  if (base > 0) spend(s, base, 'base');
  // Morale wraca powoli do normy: dobra passa i kryzys mijają, jeśli nic ich nie podtrzymuje.
  for (const d of s.drivers) {
    const target = clamp(BALANCE.moraleBaseline + perkMods(d).moraleTarget);
    d.stats.morale = clamp(d.stats.morale + (target - d.stats.morale) * BALANCE.moraleReversion);
    // Bezczynność (bez auta albo z autem na placu) nudzi.
    const t = truckOfDriver(s, d);
    if ((!t || !t.tripId) && !d.training) d.stats.morale = clamp(d.stats.morale + BALANCE.idleMoraleDrift);
  }
  s.days.push({ day: dayIndex(s.now) - 1, cash: Math.round(s.cash), revenue: Math.round(s.today.revenue), costs: Math.round(s.today.costs) });
  if (s.days.length > 730) s.days.shift();
  s.today = { revenue: 0, costs: 0 };
  // Po awansie klienci od razu chcą rozmawiać o umowach.
  if (s.contractOffers.length === 0 && rankIndex(s.reputation) >= CONTRACTS.minRank) refreshContractOffers(s);
  if (s.cash < 0) log(s, 'bad', `Konto na minusie (${fmtPLN(s.cash)}). Bank dzwoni i nie brzmi wesoło.`);
  else if (chance(s.rng, 0.25)) log(s, 'funny', pick(s.rng, DAILY_FLAVOR));
  qPush(s.queue, nextMidnight(s.now), { type: 'DAILY' });
}

function handle(s: GameState, ev: GameEvent, interactive: boolean) {
  switch (ev.type) {
    case 'TRIP_DONE':
      // Halina reaguje od razu, nie czeka na swój cykl.
      if (onTripDone(s, ev.tripId) && s.base.dispatcher && s.base.autoDispatch) dispatch(s);
      return;
    case 'TRIP_INCIDENT':
      return onTripIncident(s, ev);
    case 'ROAD_EVENT':
      return onRoadEvent(s, ev.tripId, interactive);
    case 'CONTRACT_POST':
      return onContractPost(s, ev.contractId);
    case 'CONTRACT_CHECK':
      return onContractCheck(s, ev.contractId, ev.jobId);
    case 'CONTRACT_OFFERS':
      return onContractOffers(s);
    case 'TRAINING_DONE':
      return onTrainingDone(s, ev.driverId);
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
    case 'CANDIDATES_REFRESH':
      return refreshCandidates(s);
    case 'OFFERS_REFRESH':
      return refreshTruckOffers(s);
    case 'DISPATCH':
      if (!s.base.dispatcher) return;
      if (s.base.autoDispatch) dispatch(s);
      qPush(s.queue, s.now + MARKETS.dispatchEveryMin, { type: 'DISPATCH' });
      return;
  }
}

/**
 * Przesuwa zegar do `target`, wykonując po drodze wszystkie zaplanowane zdarzenia.
 * interactive = gracz patrzy: zdarzenie z decyzją zatrzymuje zegar, dopóki gracz nie wybierze.
 * W przeciwnym razie (tło, nadrabianie, testy) decydują kierowcy.
 */
export function advanceTo(s: GameState, target: number, interactive = false): number {
  if (s.decisions.length > 0) {
    if (interactive) return 0;
    autoResolveAll(s);
  }
  let processed = 0;
  for (let next = qPeek(s.queue); next && next.at <= target; next = qPeek(s.queue)) {
    qPop(s.queue);
    s.now = Math.max(s.now, next.at);
    handle(s, next.ev, interactive);
    processed++;
    if (interactive && s.decisions.length > 0) return processed;
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
