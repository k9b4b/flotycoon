/**
 * Naczepy. Każdy zestaw ma jedną naczepę; plandeka jest w pakiecie z ciągnikiem,
 * pozostałe kosztują ratę dzienną i jednorazową opłatę za podpięcie.
 * Ładunki specjalne płacą lepiej, ale mają swoje wymagania i minusy.
 */
export type TrailerType = 'curtain' | 'reefer' | 'adr' | 'lowbed';

export interface TrailerSpec {
  id: TrailerType;
  name: string;
  /** Krótko, do etykiet: „chłodnia”, „ADR”. */
  short: string;
  leasePerDay: number;
  swapFee: number;
  /** Od której rangi dealer w ogóle z nami rozmawia. */
  rank: number;
  fuelMul: number;
  speedMul: number;
  /** Mnożnik szansy na kontrolę ITD (cysterny są częściej kontrolowane). */
  itdMul: number;
  /** Uprawnienia kierowcy wymagane do jazdy. */
  cert?: 'adr';
  /** Minimalne doświadczenie kierowcy. */
  minExperience?: number;
  desc: string;
}

export const TRAILERS: Record<TrailerType, TrailerSpec> = {
  curtain: {
    id: 'curtain',
    name: 'Plandeka',
    short: 'plandeka',
    leasePerDay: 0,
    swapFee: 0,
    rank: 0,
    fuelMul: 1,
    speedMul: 1,
    itdMul: 1,
    desc: 'Firanka, czyli standard: większość ładunków na giełdzie. W pakiecie z ciągnikiem.',
  },
  reefer: {
    id: 'reefer',
    name: 'Chłodnia',
    short: 'chłodnia',
    leasePerDay: 90,
    swapFee: 2000,
    rank: 1,
    fuelMul: 1.06,
    speedMul: 1,
    itdMul: 1,
    desc: 'Mrożonki, owoce, wędliny. Płacą o ok. 25% lepiej, ale agregat pali swoje (+6% paliwa).',
  },
  adr: {
    id: 'adr',
    name: 'Cysterna ADR',
    short: 'ADR',
    leasePerDay: 130,
    swapFee: 3000,
    rank: 2,
    fuelMul: 1.02,
    speedMul: 1,
    itdMul: 1.4,
    cert: 'adr',
    desc: 'Paliwa i chemia: najlepsze stawki (ok. +45%), ale kierowca musi mieć ADR, a kontrole są częstsze.',
  },
  lowbed: {
    id: 'lowbed',
    name: 'Niskopodwozie',
    short: 'gabaryt',
    leasePerDay: 115,
    swapFee: 2500,
    rank: 3,
    fuelMul: 1.08,
    speedMul: 0.88,
    itdMul: 1.1,
    minExperience: 55,
    desc: 'Koparki, kombajny, transformatory. Dobrze płatne (ok. +40%), ale wolno i nie dla świeżaka (doświadczenie min. 55).',
  },
};

export const TRAILER_LIST = Object.values(TRAILERS);
/** Jak często na giełdzie pojawiają się ładunki danego typu (gdy typ jest odblokowany). */
export const TRAILER_WEIGHT: Record<TrailerType, number> = { curtain: 72, reefer: 14, adr: 8, lowbed: 6 };
/** Zablokowane typy pojawiają się rzadko, jako zachęta do awansu. */
export const LOCKED_TEASER_WEIGHT = 2;
