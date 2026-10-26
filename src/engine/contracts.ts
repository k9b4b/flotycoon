import { BALANCE } from '../data/balance';
import { CITIES, CITY_BY_ID } from '../data/cities';
import { CONTRACTS } from '../data/development';
import { CARGO, CLIENTS } from '../data/flavor';
import { addReputation, rankIndex } from './company';
import { earn, fmtPLN, log, newId, spend, type ActionResult } from './core';
import { planTrip } from './drivingRules';
import { qPush } from './queue';
import { chance, pick, pickWeighted, randInt, randRange } from './rng';
import { roadKm } from './routes';
import { formatGameTime, nextMidnight } from './time';
import type { Contract, ContractOffer, GameState, Job } from './types';

/**
 * Kontrakty ze stałymi klientami: ta sama trasa co kilka dni, za lepszą stawkę niż na giełdzie.
 * Każdy kurs pojawia się na giełdzie z wyprzedzeniem i czeka na gracza. Kurs, którego nikt nie weźmie,
 * kosztuje karę; spóźnienie albo przepadnięty kurs to wpadka, a po trzech wpadkach klient zrywa umowę.
 * Dokończona umowa daje premię i reputację.
 */

const DAY = 24 * 60;

export function maxContracts(s: GameState): number {
  const rank = rankIndex(s.reputation);
  if (rank < CONTRACTS.minRank) return 0;
  return Math.min(6, rank) + (s.base.office ? CONTRACTS.officeExtra : 0);
}

export const activeContracts = (s: GameState) => s.contracts.filter((c) => c.status === 'active');

function makeOffer(s: GameState): ContractOffer {
  const r = s.rng;
  const from = pickWeighted(r, CITIES, (c) => c.weight);
  let to = pickWeighted(r, CITIES, (c) => c.weight);
  let guard = 0;
  while ((to.id === from.id || roadKm(from.id, to.id) < 120 || roadKm(from.id, to.id) > 560) && guard++ < 80) to = pickWeighted(r, CITIES, (c) => c.weight);
  const km = roadKm(from.id, to.id);
  const cargo = pick(r, CARGO);
  const rate = ((BALANCE.rateMinPerKm + BALANCE.rateMaxPerKm) / 2) * cargo.rateMul * CONTRACTS.rateMul * randRange(r, 0.97, 1.05);
  const shortBonus = km < 250 ? 1 + (250 - km) / 600 : 1;
  const paymentPerRun = Math.round((km * rate * shortBonus) / 10) * 10;
  const rank = rankIndex(s.reputation);
  const everyDays = pick(r, rank >= 3 ? [1, 2, 2, 3, 4] : [2, 3, 3, 4]);
  const runsTotal = randInt(r, 6, 12);
  return {
    id: newId(s, 'k'),
    client: pick(r, CLIENTS),
    fromId: from.id,
    toId: to.id,
    cargo: cargo.name,
    weightT: randInt(r, cargo.minT, cargo.maxT),
    km,
    paymentPerRun,
    everyDays,
    runsTotal,
    penaltyPerMiss: Math.round((paymentPerRun * CONTRACTS.missPenalty) / 10) * 10,
    bonus: Math.round((paymentPerRun * runsTotal * CONTRACTS.completionBonus) / 10) * 10,
    expiresAt: s.now + CONTRACTS.offersEveryDays * DAY,
  };
}

export function refreshContractOffers(s: GameState) {
  const n = rankIndex(s.reputation) >= CONTRACTS.minRank ? CONTRACTS.offers + (s.base.office ? CONTRACTS.officeExtra : 0) : 0;
  s.contractOffers = Array.from({ length: n }, () => makeOffer(s));
}

export function signContract(s: GameState, offerId: string): ActionResult {
  const o = s.contractOffers.find((x) => x.id === offerId);
  if (!o) return { ok: false, error: 'Klient się rozmyślił. Albo podpisał z Dziadtransem.' };
  const limit = maxContracts(s);
  if (limit === 0) return { ok: false, error: 'Na razie nikt nie podpisze umowy z „jednym gościem z Iveco”. Potrzebna wyższa ranga.' };
  if (activeContracts(s).length >= limit) return { ok: false, error: `Przy tej randze obsłużymy najwyżej ${limit} kontrakt${limit === 1 ? '' : 'y'} naraz.` };
  s.contractOffers = s.contractOffers.filter((x) => x.id !== offerId);
  const { expiresAt: _, ...terms } = o;
  void _;
  // Pierwszy kurs: najbliższy poranek, przynajmniej pół doby od podpisania.
  let first = nextMidnight(s.now) + 6 * 60;
  if (first - s.now < CONTRACTS.postAheadH * 60) first += DAY;
  const c: Contract = { ...terms, signedAt: s.now, nextRunAt: first, runsPosted: 0, runsDone: 0, missed: 0, strikes: 0, pendingJobId: null, status: 'active' };
  s.contracts.push(c);
  qPush(s.queue, Math.max(s.now, first - CONTRACTS.postAheadH * 60), { type: 'CONTRACT_POST', contractId: c.id });
  const msg = `Podpisano kontrakt z ${o.client}: ${CITY_BY_ID[o.fromId].name} → ${CITY_BY_ID[o.toId].name} co ${o.everyDays === 1 ? 'dzień' : `${o.everyDays} dni`}, ${o.runsTotal} kursów po ${fmtPLN(o.paymentPerRun)}. Pierwszy załadunek ${formatGameTime(first)}.`;
  log(s, 'good', msg);
  return { ok: true, message: msg };
}

/** Kurs z kontraktu trafia na giełdę z wyprzedzeniem. */
export function onContractPost(s: GameState, contractId: string) {
  const c = s.contracts.find((x) => x.id === contractId);
  if (!c || c.status !== 'active' || c.runsPosted >= c.runsTotal) return;
  const est = planTrip(
    c.nextRunAt,
    [{ kind: 'load', min: BALANCE.loadMin }, { kind: 'drive', km: c.km }, { kind: 'unload', min: BALANCE.unloadMin }],
    BALANCE.baseSpeedKmh,
    [],
    { sinceBreak: 0, today: 270, at: c.nextRunAt },
  );
  const estMin = est.phases[est.phases.length - 1].end - c.nextRunAt;
  const job: Job = {
    id: newId(s, 'j'),
    fromId: c.fromId,
    toId: c.toId,
    cargo: c.cargo,
    client: c.client,
    weightT: c.weightT,
    km: c.km,
    payment: c.paymentPerRun,
    deadline: Math.round(c.nextRunAt + estMin * 1.3 + 120),
    penaltyPerHour: Math.round((c.paymentPerRun * 0.05) / 10) * 10,
    postedAt: s.now,
    expiresAt: c.nextRunAt + CONTRACTS.acceptGraceH * 60,
    contractId: c.id,
  };
  s.market.unshift(job);
  c.pendingJobId = job.id;
  c.runsPosted += 1;
  qPush(s.queue, job.expiresAt + 1, { type: 'CONTRACT_CHECK', contractId: c.id, jobId: job.id });
  if (c.runsPosted < c.runsTotal) {
    c.nextRunAt += c.everyDays * DAY;
    qPush(s.queue, c.nextRunAt - CONTRACTS.postAheadH * 60, { type: 'CONTRACT_POST', contractId: c.id });
  }
  log(s, 'info', `${c.client}: kurs kontraktowy ${CITY_BY_ID[c.fromId].name} → ${CITY_BY_ID[c.toId].name} czeka na giełdzie (załadunek do ${formatGameTime(job.expiresAt)}).`);
}

/** Termin przyjęcia minął: jeśli kurs wciąż wisi na giełdzie, przepadł. */
export function onContractCheck(s: GameState, contractId: string, jobId: string) {
  const c = s.contracts.find((x) => x.id === contractId);
  const idx = s.market.findIndex((j) => j.id === jobId);
  if (!c || idx < 0) return;
  s.market.splice(idx, 1);
  if (c.pendingJobId === jobId) c.pendingJobId = null;
  if (c.status !== 'active') return;
  c.missed += 1;
  spend(s, c.penaltyPerMiss, 'fines');
  addReputation(s, CONTRACTS.repMiss);
  log(s, 'bad', `${c.client}: nikt nie przyjechał po towar. Kara ${fmtPLN(c.penaltyPerMiss)}, a w ich magazynie mówią o nas brzydko.`);
  strike(s, c);
  maybeFinish(s, c);
}

/** Rozliczenie kursu kontraktowego po rozładunku (fracht i kary za spóźnienie liczy onTripDone). */
export function onContractRunDone(s: GameState, contractId: string, late: boolean) {
  const c = s.contracts.find((x) => x.id === contractId);
  if (!c) return;
  c.runsDone += 1;
  if (c.status !== 'active') return;
  if (late) {
    log(s, 'bad', `${c.client} odnotował spóźnienie w kontrakcie. Wpadka ${c.strikes + 1} z ${CONTRACTS.maxStrikes}.`);
    strike(s, c);
  }
  maybeFinish(s, c);
}

function strike(s: GameState, c: Contract) {
  c.strikes += 1;
  if (c.strikes < CONTRACTS.maxStrikes || c.status !== 'active') return;
  c.status = 'broken';
  c.endedAt = s.now;
  if (c.pendingJobId) s.market = s.market.filter((j) => j.id !== c.pendingJobId);
  c.pendingJobId = null;
  addReputation(s, CONTRACTS.repBroken);
  log(s, 'bad', `${c.client} zrywa kontrakt po ${CONTRACTS.maxStrikes} wpadkach. „Dziękujemy, poszukamy kogoś, kto ma zegarek”.`);
}

function maybeFinish(s: GameState, c: Contract) {
  if (c.status !== 'active' || c.runsDone + c.missed < c.runsTotal) return;
  c.status = 'done';
  c.endedAt = s.now;
  earn(s, c.bonus);
  addReputation(s, CONTRACTS.repComplete);
  log(s, 'good', `Kontrakt z ${c.client} zakończony: ${c.runsDone} z ${c.runsTotal} kursów. Premia ${fmtPLN(c.bonus)} i dobre słowo w branży.${chance(s.rng, 0.5) ? ' Przysłali też kosz kabanosów.' : ''}`);
}

export function onContractOffers(s: GameState) {
  refreshContractOffers(s);
  qPush(s.queue, s.now + CONTRACTS.offersEveryDays * DAY, { type: 'CONTRACT_OFFERS' });
}
