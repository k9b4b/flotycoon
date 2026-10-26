import type { CourseId } from '../data/development';
import type { PerkId } from '../data/perks';
import type { DutyState } from './drivingRules';
import type { Queue } from './queue';
import type { RngState } from './rng';

export const SAVE_VERSION = 4;

/** Wszystkie statystyki 0–100. Każda na coś wpływa (patrz engine/effects.ts). */
export interface DriverStats {
  experience: number; // prędkość średnia
  eco: number; // spalanie
  reliability: number; // kontrole ITD, mandaty
  stamina: number; // ryzyko „zaspał na MOP-ie”
  morale: number; // mnożnik niezawodności, spada przy spóźnieniach i bezczynności
}

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  female: boolean;
  nickname: string;
  quirk: string;
  stats: DriverStats;
  /** Cechy specjalne (data/perks.ts). */
  perks: PerkId[];
  salaryPerDay: number;
  hiredAt: number;
  kmDriven: number;
  jobsDone: number;
  lateJobs: number;
  /** Licznik czasu jazdy (tachograf). */
  duty: DutyState;
  /** Czas gry ostatniej premii (pole opcjonalne: stare zapisy działają bez migracji). */
  lastBonusAt?: number;
  /** Mandaty z ITD na koncie (do perku „Teczka z papierami”). */
  fines?: number;
  /** Ile razy kierowca przeszedł dany kurs. */
  courses?: Partial<Record<CourseId, number>>;
  /** Trwające szkolenie: kierowca jest wtedy bez auta. */
  training?: { course: CourseId; until: number; truckId: string | null } | null;
}

export interface Truck {
  id: string;
  plate: string;
  brand: string;
  model: string;
  euro: 5 | 6;
  fuelL100: number;
  odometerKm: number;
  wear: number; // 0–1, wpływa na awarie i spalanie
  leasePerDay: number;
  cityId: string;
  /** Przypisany kierowca; null = auto stoi bez kierowcy. */
  driverId: string | null;
  tripId: string | null;
  /** Serwis do tej chwili (czas gry) albo null. */
  serviceUntil: number | null;
  /** Kaucja leasingowa wpłacona przy odbiorze (przepada przy wcześniejszym zwrocie). */
  deposit?: number;
  condition?: TruckCondition;
}

export type TruckCondition = 'new' | 'used';

/** Oferta z salonu: auto jeszcze bez lokalizacji i kierowcy. */
export type TruckOffer = Omit<Truck, 'cityId' | 'driverId' | 'tripId' | 'serviceUntil'> & {
  deposit: number;
  condition: TruckCondition;
};

export interface BaseState {
  /** Poziom placu (indeks w YARD). */
  yard: number;
  workshop: boolean;
  office: boolean;
  dispatcher: boolean;
  /** Dyspozytor może być zatrudniony, ale wstrzymany przez gracza. */
  autoDispatch: boolean;
}

export interface Job {
  id: string;
  fromId: string;
  toId: string;
  cargo: string;
  client: string;
  weightT: number;
  km: number;
  payment: number;
  deadline: number;
  penaltyPerHour: number;
  postedAt: number;
  expiresAt: number;
  /** Kurs z kontraktu: nie znika z giełdy sam, a przepadnięcie kosztuje. */
  contractId?: string;
}

export interface ContractTerms {
  id: string;
  client: string;
  fromId: string;
  toId: string;
  cargo: string;
  weightT: number;
  km: number;
  paymentPerRun: number;
  everyDays: number;
  runsTotal: number;
  penaltyPerMiss: number;
  bonus: number;
}

export interface ContractOffer extends ContractTerms {
  expiresAt: number;
}

export interface Contract extends ContractTerms {
  signedAt: number;
  /** Planowany załadunek najbliższego kursu. */
  nextRunAt: number;
  runsPosted: number;
  runsDone: number;
  missed: number;
  strikes: number;
  /** Kurs z tego kontraktu, który wisi teraz na giełdzie. */
  pendingJobId: string | null;
  status: 'active' | 'done' | 'broken';
  endedAt?: number;
}

export type PhaseKind = 'drive_empty' | 'load' | 'drive' | 'break' | 'rest' | 'unload' | 'incident';

export interface IncidentInfo {
  kind: 'traffic' | 'breakdown' | 'itd' | 'overslept' | 'event';
  /** Identyfikator do zdarzenia w kolejce (harmonogram może się przesunąć). */
  id?: string;
  text: string;
  cost: number;
  tone: LogTone;
}

export interface Phase {
  kind: PhaseKind;
  start: number;
  end: number;
  /** Kilometry skumulowane od początku kursu (łącznie z dojazdem na pusto). */
  km0: number;
  km1: number;
  incident?: IncidentInfo;
}

export interface Trip {
  id: string;
  job: Job;
  truckId: string;
  driverId: string;
  originId: string;
  emptyKm: number;
  phases: Phase[];
  /** Stan tachografu kierowcy po zakończeniu kursu. */
  dutyAfter: DutyState;
  fuelL: number;
  fuelCost: number;
  tollCost: number;
  startedAt: number;
  eta: number;
}

export type LogTone = 'info' | 'good' | 'bad' | 'funny';

export interface LogEntry {
  t: number;
  tone: LogTone;
  text: string;
}

export type CostCategory = 'fuel' | 'toll' | 'salaries' | 'lease' | 'repairs' | 'fines' | 'fleet' | 'bonuses' | 'base' | 'training';

export interface DayRecord {
  day: number;
  cash: number;
  revenue: number;
  costs: number;
}

export type GameEvent =
  | { type: 'TRIP_DONE'; tripId: string }
  | { type: 'TRIP_INCIDENT'; tripId: string; phaseIdx?: number; incId?: string }
  | { type: 'ROAD_EVENT'; tripId: string }
  | { type: 'CONTRACT_POST'; contractId: string }
  | { type: 'CONTRACT_CHECK'; contractId: string; jobId: string }
  | { type: 'CONTRACT_OFFERS' }
  | { type: 'TRAINING_DONE'; driverId: string }
  | { type: 'SERVICE_DONE'; truckId: string }
  | { type: 'MARKET_REFRESH' }
  | { type: 'DAILY' }
  | { type: 'CANDIDATES_REFRESH' }
  | { type: 'OFFERS_REFRESH' }
  | { type: 'DISPATCH' };

export interface GameState {
  version: number;
  seed: number;
  rng: RngState;
  now: number;
  cash: number;
  companyName: string;
  trucks: Truck[];
  drivers: Driver[];
  market: Job[];
  trips: Record<string, Trip>;
  queue: Queue<GameEvent>;
  log: LogEntry[];
  days: DayRecord[];
  today: { revenue: number; costs: number };
  totals: { revenue: number; costs: number; jobsDone: number; km: number; lateJobs: number; penalties: number };
  costsByCategory: Record<CostCategory, number>;
  nextId: number;
  reputation: number;
  base: BaseState;
  /** Kandydaci na kierowców (rynek pracy). */
  candidates: Driver[];
  /** Oferty salonu (leasing). */
  truckOffers: TruckOffer[];
  settings: GameSettings;
  /** Zdarzenia na trasie czekające na decyzję gracza (zegar stoi, dopóki ich nie rozstrzygnie). */
  decisions: PendingDecision[];
  contracts: Contract[];
  contractOffers: ContractOffer[];
}

export interface GameSettings {
  /** true: zdarzenia w trakcie gry zatrzymują zegar i pytają gracza; false: kierowcy decydują sami. */
  askDecisions: boolean;
  /** Postęp samouczka (pole opcjonalne: starsze zapisy dostają je przy pierwszym uruchomieniu). */
  tutorial?: TutorialState;
}

export interface TutorialState {
  /** Indeks kroku głównego samouczka. */
  step: number;
  /** Porady kontekstowe już pokazane. */
  seen: string[];
  /** Gracz wyłączył samouczek i porady. */
  off: boolean;
}

export interface PendingDecision {
  id: string;
  eventId: string;
  tripId: string;
  driverId: string;
  truckId: string;
  at: number;
  /** Liczby wylosowane przy zdarzeniu (np. miasto, stawka), żeby opis i wynik się zgadzały. */
  vars: Record<string, number | string>;
}
