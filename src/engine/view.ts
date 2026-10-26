import { BALANCE } from '../data/balance';
import { CITY_BY_ID } from '../data/cities';
import { kmAt, phaseAt } from './drivingRules';
import { ROAD_EVENT_BY_ID, eventCtx, optionHint, optionLabel } from './roadEvents';
import { RANKS, UPGRADES, YARD, type Upgrade } from '../data/progression';
import { driverCap, driverOfTruck, fleetCap, isAvailable, previewJob, rankIndex, serviceQuote, truckOfDriver, upgradesPerDay, type JobPreview } from './sim';
import { maxContracts } from './contracts';
import type { BaseState, Contract, ContractOffer, DayRecord, Driver, GameState, Job, LogEntry, Phase, PhaseKind, Truck, TruckOffer } from './types';

/**
 * Widok stanu dla UI. Worker wysyła go kilka razy na sekundę,
 * więc zawiera tylko to, co dashboard pokazuje (bez kolejki zdarzeń).
 */

export type TruckStatus = PhaseKind | 'idle' | 'service' | 'nodriver';

export const PHASE_LABEL: Record<TruckStatus, string> = {
  idle: 'Wolny',
  nodriver: 'Bez kierowcy',
  service: 'W serwisie',
  drive_empty: 'Dojazd na pusto',
  load: 'Załadunek',
  drive: 'W trasie',
  break: 'Pauza 45 min',
  rest: 'Odpoczynek dobowy',
  unload: 'Rozładunek',
  incident: 'Zdarzenie',
};

export interface TruckView {
  truck: Truck;
  /** null = auto stoi na placu bez kierowcy. */
  driver: Driver | null;
  /** Numer zestawu w firmie (#1, #2…), stały: ten sam na karcie i na mapie. */
  fleetNo: number;
  /** Od kiedy zestaw stoi bez zlecenia (tylko gdy status = idle). */
  idleSince?: number;
  /** Koszt stały zestawu na godzinę: pensja + leasing. */
  costPerHour: number;
  status: TruckStatus;
  serviceUntil?: number;
  serviceQuote: { cost: number; durationMin: number; wearAfter: number };
  statusLabel: string;
  lat: number;
  lon: number;
  trip?: {
    fromId: string;
    toId: string;
    originId: string;
    cargo: string;
    progress: number;
    eta: number;
    deadline: number;
    late: boolean;
    phaseEnd: number;
    incidentText?: string;
    startedAt: number;
    emptyKm: number;
    jobKm: number;
    /** Prawdziwy harmonogram (ruch na mapie). */
    phases: Pick<Phase, 'kind' | 'start' | 'end' | 'km0' | 'km1'>[];
    /** Plan znany dyspozytorowi (bez przyszłych zdarzeń): oś czasu i ETA. */
    plan: Pick<Phase, 'kind' | 'start' | 'end'>[];
    /** Po terminie, ale w tolerancji klienta. */
    tight: boolean;
  };
}

export interface JobView extends Job {
  previews: JobPreview[];
}

export interface DriverView {
  driver: Driver;
  truckId: string | null;
  /** „#3 Skania R 450” albo null, gdy kierowca nie ma auta. */
  truckLabel: string | null;
  onTrip: boolean;
}

export interface UpgradeView extends Upgrade {
  owned: boolean;
  unlocked: boolean;
}

export interface CompanyView {
  reputation: number;
  rank: number;
  rankName: string;
  perk: string;
  nextRankName: string | null;
  nextRankPerk: string | null;
  /** Postęp do następnej rangi: od, do (punkty reputacji). */
  repFrom: number;
  repTo: number | null;
  base: BaseState;
  yardName: string;
  fleetCap: number;
  driverCap: number;
  nextYard: { name: string; cap: number; cost: number; unlocked: boolean; rankName: string } | null;
  upgrades: UpgradeView[];
  upkeepPerDay: number;
}

export interface Snapshot {
  now: number;
  cash: number;
  companyName: string;
  fleet: TruckView[];
  market: JobView[];
  log: LogEntry[];
  days: DayRecord[];
  today: { revenue: number; costs: number };
  totals: GameState['totals'];
  costsByCategory: GameState['costsByCategory'];
  dailyFixedCosts: number;
  company: CompanyView;
  drivers: DriverView[];
  candidates: Driver[];
  truckOffers: TruckOffer[];
  settings: GameState['settings'];
  /** Aktywne kontrakty i kilka ostatnio zakończonych. */
  contracts: Contract[];
  contractOffers: ContractOffer[];
  contractLimit: number;
  /** Zdarzenia czekające na decyzję gracza (zegar stoi). */
  decisions: DecisionView[];
}

export interface DecisionView {
  id: string;
  title: string;
  text: string;
  truckId: string;
  fleetNo: number;
  driver: Driver;
  route: string;
  /** Zapas czasu do terminu w chwili zdarzenia (min). */
  bufferMin: number;
  options: { id: string; label: string; hint: string }[];
  /** Co wybrałby kierowca, gdyby decydował sam. */
  driverPick: string;
}

/**
 * Plan kursu taki, jaki zna dyspozytor: zdarzenia, które jeszcze nie nastąpiły, są ukryte,
 * a kolejne fazy przesunięte o ich czas. Gra nie zdradza przyszłego korka.
 * Ruch ciężarówki na mapie nadal idzie po prawdziwym harmonogramie.
 */
export function plannedPhases(phases: Phase[], now: number): Phase[] {
  const out: Phase[] = [];
  let shift = 0;
  for (const p of phases) {
    if (p.kind === 'incident' && p.start > now) {
      shift += p.end - p.start;
      continue;
    }
    out.push(shift ? { ...p, start: p.start - shift, end: p.end - shift } : p);
  }
  return out;
}

function lerp(a: number, b: number, f: number) {
  return a + (b - a) * f;
}

function truckView(s: GameState, truck: Truck, fleetNo: number): TruckView {
  const driver = driverOfTruck(s, truck);
  const base = { truck, driver, fleetNo, costPerHour: ((driver?.salaryPerDay ?? 0) + truck.leasePerDay) / 24 };
  const here = CITY_BY_ID[truck.cityId];
  const serviceQuoteNow = serviceQuote(s, truck);
  if (truck.serviceUntil !== null) {
    return { ...base, status: 'service', statusLabel: PHASE_LABEL.service, lat: here.lat, lon: here.lon, serviceUntil: truck.serviceUntil, serviceQuote: serviceQuoteNow };
  }
  if (!truck.tripId && !driver) {
    return { ...base, status: 'nodriver', statusLabel: PHASE_LABEL.nodriver, lat: here.lat, lon: here.lon, serviceQuote: serviceQuoteNow };
  }
  if (!truck.tripId && driver) {
    return {
      ...base,
      // Koniec ostatniego kursu (licznik tachografu) albo dzień zatrudnienia.
      idleSince: Math.max(driver.duty.at, driver.hiredAt),
      status: 'idle',
      statusLabel: PHASE_LABEL.idle, lat: here.lat, lon: here.lon, serviceQuote: serviceQuoteNow };
  }
  const trip = s.trips[truck.tripId!];
  const km = kmAt(trip.phases, s.now);
  const total = trip.emptyKm + trip.job.km;
  const origin = CITY_BY_ID[trip.originId];
  const from = CITY_BY_ID[trip.job.fromId];
  const to = CITY_BY_ID[trip.job.toId];
  let lat: number;
  let lon: number;
  if (trip.emptyKm > 0 && km < trip.emptyKm) {
    const f = km / trip.emptyKm;
    lat = lerp(origin.lat, from.lat, f);
    lon = lerp(origin.lon, from.lon, f);
  } else {
    const f = trip.job.km > 0 ? (km - trip.emptyKm) / trip.job.km : 1;
    lat = lerp(from.lat, to.lat, f);
    lon = lerp(from.lon, to.lon, f);
  }
  const phase = phaseAt(trip.phases, s.now);
  const status = phase?.kind ?? 'unload';
  const plan = plannedPhases(trip.phases, s.now);
  const eta = plan[plan.length - 1].end;
  return {
    ...base,
    status,
    statusLabel: PHASE_LABEL[status],
    lat,
    lon,
    serviceQuote: serviceQuoteNow,
    trip: {
      fromId: trip.job.fromId,
      toId: trip.job.toId,
      originId: trip.originId,
      cargo: trip.job.cargo,
      progress: total > 0 ? km / total : 1,
      eta,
      deadline: trip.job.deadline,
      late: eta > trip.job.deadline + BALANCE.lateGraceMin,
      tight: eta > trip.job.deadline && eta <= trip.job.deadline + BALANCE.lateGraceMin,
      phaseEnd: phase?.end ?? trip.eta,
      incidentText: phase?.incident?.text,
      startedAt: trip.startedAt,
      emptyKm: trip.emptyKm,
      jobKm: trip.job.km,
      phases: trip.phases.map((p) => ({ kind: p.kind, start: p.start, end: p.end, km0: p.km0, km1: p.km1 })),
      plan: plan.map((p) => ({ kind: p.kind, start: p.start, end: p.end })),
    },
  };
}

function companyView(s: GameState): CompanyView {
  const rank = rankIndex(s.reputation);
  const next = RANKS[rank + 1];
  const ny = YARD[s.base.yard + 1];
  return {
    reputation: s.reputation,
    rank,
    rankName: RANKS[rank].name,
    perk: RANKS[rank].perk,
    nextRankName: next?.name ?? null,
    nextRankPerk: next?.perk ?? null,
    repFrom: RANKS[rank].minRep,
    repTo: next?.minRep ?? null,
    base: s.base,
    yardName: YARD[s.base.yard].name,
    fleetCap: fleetCap(s),
    driverCap: driverCap(s),
    nextYard: ny ? { name: ny.name, cap: ny.cap, cost: ny.cost, unlocked: rank >= ny.rank, rankName: RANKS[ny.rank].name } : null,
    upgrades: UPGRADES.map((u) => ({ ...u, owned: s.base[u.id], unlocked: rank >= u.rank })),
    upkeepPerDay: upgradesPerDay(s),
  };
}

export function buildSnapshot(s: GameState): Snapshot {
  const idle = s.trucks.filter(isAvailable);
  const fleetNo = new Map(s.trucks.map((t, i) => [t.id, i + 1]));
  return {
    now: s.now,
    cash: s.cash,
    companyName: s.companyName,
    fleet: s.trucks.map((t, i) => truckView(s, t, i + 1)),
    market: s.market
      .filter((j) => j.expiresAt > s.now)
      .map((j) => ({ ...j, previews: idle.map((t) => previewJob(s, j, t)) })),
    log: s.log.slice(-80),
    days: s.days.slice(-60),
    today: s.today,
    totals: s.totals,
    costsByCategory: s.costsByCategory,
    dailyFixedCosts: s.drivers.reduce((a, d) => a + d.salaryPerDay, 0) + s.trucks.reduce((a, t) => a + t.leasePerDay, 0) + upgradesPerDay(s),
    company: companyView(s),
    drivers: s.drivers.map((d) => {
      const t = truckOfDriver(s, d);
      return { driver: d, truckId: t?.id ?? null, truckLabel: t ? `#${fleetNo.get(t.id)} ${t.brand} ${t.model}` : null, onTrip: !!t?.tripId };
    }),
    candidates: s.candidates,
    truckOffers: s.truckOffers,
    settings: s.settings,
    contracts: [...s.contracts.filter((c) => c.status === 'active'), ...s.contracts.filter((c) => c.status !== 'active').slice(-4).reverse()],
    contractOffers: s.contractOffers,
    contractLimit: maxContracts(s),
    decisions: s.decisions.flatMap((dec): DecisionView[] => {
      const def = ROAD_EVENT_BY_ID[dec.eventId];
      const trip = s.trips[dec.tripId];
      const d = s.drivers.find((x) => x.id === dec.driverId);
      const t = s.trucks.find((x) => x.id === dec.truckId);
      if (!def || !trip || !d || !t) return [];
      const c = eventCtx(s, trip, d, t, dec.vars);
      return [
        {
          id: dec.id,
          title: def.title,
          text: def.text(c),
          truckId: t.id,
          fleetNo: fleetNo.get(t.id) ?? 0,
          driver: d,
          route: `${CITY_BY_ID[trip.job.fromId].name} → ${CITY_BY_ID[trip.job.toId].name}`,
          bufferMin: c.buffer,
          options: def.options.map((o) => ({ id: o.id, label: optionLabel(o, c), hint: optionHint(o, c) })),
          driverPick: def.auto(c),
        },
      ];
    }),
  };
}
