import { CITY_BY_ID } from '../data/cities';
import { kmAt, phaseAt } from './drivingRules';
import { isAvailable, previewJob, serviceQuote, type JobPreview } from './sim';
import type { DayRecord, Driver, GameState, Job, LogEntry, Phase, PhaseKind, Truck } from './types';

/**
 * Widok stanu dla UI. Worker wysyła go kilka razy na sekundę,
 * więc zawiera tylko to, co dashboard pokazuje (bez kolejki zdarzeń).
 */

export type TruckStatus = PhaseKind | 'idle' | 'service';

export const PHASE_LABEL: Record<TruckStatus, string> = {
  idle: 'Wolny',
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
  driver: Driver;
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
    phases: Pick<Phase, 'kind' | 'start' | 'end' | 'km0' | 'km1'>[];
  };
}

export interface JobView extends Job {
  previews: JobPreview[];
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
}

function lerp(a: number, b: number, f: number) {
  return a + (b - a) * f;
}

function truckView(s: GameState, truck: Truck): TruckView {
  const driver = s.drivers.find((d) => d.id === truck.driverId)!;
  const here = CITY_BY_ID[truck.cityId];
  const serviceQuoteNow = serviceQuote(truck);
  if (truck.serviceUntil !== null) {
    return { truck, driver, status: 'service', statusLabel: PHASE_LABEL.service, lat: here.lat, lon: here.lon, serviceUntil: truck.serviceUntil, serviceQuote: serviceQuoteNow };
  }
  if (!truck.tripId) {
    return { truck, driver, status: 'idle', statusLabel: PHASE_LABEL.idle, lat: here.lat, lon: here.lon, serviceQuote: serviceQuoteNow };
  }
  const trip = s.trips[truck.tripId];
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
  return {
    truck,
    driver,
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
      eta: trip.eta,
      deadline: trip.job.deadline,
      late: trip.eta > trip.job.deadline,
      phaseEnd: phase?.end ?? trip.eta,
      incidentText: phase?.incident?.text,
      startedAt: trip.startedAt,
      emptyKm: trip.emptyKm,
      jobKm: trip.job.km,
      phases: trip.phases.map((p) => ({ kind: p.kind, start: p.start, end: p.end, km0: p.km0, km1: p.km1 })),
    },
  };
}

export function buildSnapshot(s: GameState): Snapshot {
  const idle = s.trucks.filter(isAvailable);
  return {
    now: s.now,
    cash: s.cash,
    companyName: s.companyName,
    fleet: s.trucks.map((t) => truckView(s, t)),
    market: s.market
      .filter((j) => j.expiresAt > s.now)
      .map((j) => ({ ...j, previews: idle.map((t) => previewJob(s, j, t)) })),
    log: s.log.slice(-80),
    days: s.days.slice(-60),
    today: s.today,
    totals: s.totals,
    costsByCategory: s.costsByCategory,
    dailyFixedCosts: s.drivers.reduce((a, d) => a + d.salaryPerDay, 0) + s.trucks.reduce((a, t) => a + t.leasePerDay, 0),
  };
}
