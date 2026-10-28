/**
 * Typy naczep. Naczepa to osobny sprzęt (kupno albo leasing, nowa albo używana),
 * który podpina się do ciągnika; bez naczepy zestaw nie weźmie zlecenia.
 * Ładunki specjalne płacą lepiej, ale mają swoje wymagania i minusy.
 */
export type TrailerType = 'curtain' | 'reefer' | 'adr' | 'lowbed';

export interface TrailerSpec {
  id: TrailerType;
  name: string;
  /** Krótko, do etykiet: „chłodnia”, „ADR”. */
  short: string;
  /** Cena nowej naczepy (zł); używane i raty liczą się od niej. */
  newPrice: number;
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
    newPrice: 40000,
    name: 'Plandeka',
    short: 'plandeka',
    rank: 0,
    fuelMul: 1,
    speedMul: 1,
    itdMul: 1,
    desc: 'Firanka, czyli standard: większość ładunków na giełdzie.',
  },
  reefer: {
    id: 'reefer',
    newPrice: 110000,
    name: 'Chłodnia',
    short: 'chłodnia',
    rank: 1,
    fuelMul: 1.06,
    speedMul: 1,
    itdMul: 1,
    desc: 'Mrożonki, owoce, wędliny. Stawki ok. +25%, ale agregat pali swoje.',
  },
  adr: {
    id: 'adr',
    newPrice: 125000,
    name: 'Cysterna ADR',
    short: 'ADR',
    rank: 2,
    fuelMul: 1.02,
    speedMul: 1,
    itdMul: 1.4,
    cert: 'adr',
    desc: 'Paliwa i chemia. Najlepsze stawki (ok. +45%), ale kierowca musi mieć ADR, a kontrole są częstsze.',
  },
  lowbed: {
    id: 'lowbed',
    newPrice: 105000,
    name: 'Niskopodwozie',
    short: 'gabaryt',
    rank: 3,
    fuelMul: 1.08,
    speedMul: 0.88,
    itdMul: 1.1,
    minExperience: 55,
    desc: 'Koparki, kombajny, transformatory. Stawki ok. +40%, ale jedzie wolniej i wymaga doświadczonego kierowcy.',
  },
};

export const TRAILER_LIST = Object.values(TRAILERS);
/** Jak często na giełdzie pojawiają się ładunki danego typu (gdy typ jest odblokowany). */
export const TRAILER_WEIGHT: Record<TrailerType, number> = { curtain: 72, reefer: 14, adr: 8, lowbed: 6 };
/** Zablokowane typy pojawiają się rzadko, jako zachęta do awansu. */
export const LOCKED_TEASER_WEIGHT = 2;
