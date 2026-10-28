/**
 * Progresja firmy: rangi z reputacji, rozbudowa bazy, jakość rynku kierowców i aut.
 * Same dane: logika jest w engine/company.ts. Balans sprawdzaj `npm run sim:year`.
 */

export interface Rank {
  name: string;
  minRep: number;
  /** Krótki opis, co ranga daje (do interfejsu). */
  perk: string;
}

export const RANKS: readonly Rank[] = [
  { name: 'Jeden gość z Iveco', minRep: 0, perk: 'Start. Plac u szwagra na 3 auta.' },
  { name: 'Firma krzak', minRep: 30, perk: 'Można powiększyć plac. Lepsi kandydaci. Chłodnie na rynku.' },
  { name: 'Lokalny przewoźnik', minRep: 150, perk: 'Warsztat, biuro spedycji, cysterny ADR.' },
  { name: 'Przewoźnik krajowy', minRep: 450, perk: 'Dyspozytor, niskopodwozia na gabaryty, więcej ofert na rynku.' },
  { name: 'Spedycja z ambicjami', minRep: 1100, perk: 'Centrum logistyczne na 25 aut.' },
  { name: 'Gracz z prawdziwego zdarzenia', minRep: 2500, perk: 'Terminal na 50 aut. Najlepsi kierowcy na rynku.' },
  { name: 'Potentat ze Strykowa', minRep: 5000, perk: 'Szacunek na każdym MOP-ie.' },
];

/** Reputacja za kurs: terminowość buduje, spóźnienia i mandaty niszczą szybciej. */
export const REPUTATION = {
  onTime: 1,
  urgentBonus: 1,
  longHaulBonus: 0, // kurs z ładunkiem powyżej 400 km (na razie bez premii)
  late: -4,
  itdFine: -2,
} as const;

export interface YardLevel {
  name: string;
  cap: number;
  cost: number;
  rank: number;
}

/** Plac decyduje o limicie aut; kierowców można mieć o kilku więcej (zmiennicy). */
export const YARD: readonly YardLevel[] = [
  { name: 'Kawałek placu u szwagra', cap: 3, cost: 0, rank: 0 },
  { name: 'Plac utwardzony', cap: 6, cost: 30_000, rank: 1 },
  { name: 'Baza z bramą i kamerą', cap: 12, cost: 90_000, rank: 2 },
  { name: 'Centrum logistyczne', cap: 25, cost: 250_000, rank: 4 },
  { name: 'Terminal w Strykowie', cap: 50, cost: 600_000, rank: 5 },
];

export const EXTRA_DRIVERS = 3;

export type UpgradeId = 'workshop' | 'office' | 'dispatcher';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
  cost: number;
  rank: number;
  /** Koszt dzienny (np. pensja dyspozytora). */
  perDay: number;
}

export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'workshop',
    name: 'Własny warsztat',
    description: 'Serwis o 40% tańszy i dwa razy krótszy. Mechanik Zdzisiu w pakiecie.',
    cost: 60_000,
    rank: 2,
    perDay: 120,
  },
  {
    id: 'office',
    name: 'Biuro spedycji',
    description: 'Więcej ofert na giełdzie i więcej ładunków powrotnych po rozładunku.',
    cost: 45_000,
    rank: 2,
    perDay: 150,
  },
  {
    id: 'dispatcher',
    name: 'Dyspozytorka Halina',
    description: 'Sama przydziela bezpieczne, opłacalne ładunki wolnym zestawom i wysyła zajechane auta do serwisu.',
    cost: 3_000,
    rank: 3,
    perDay: 520,
  },
];

export const WORKSHOP = { costMul: 0.6, timeMul: 0.5 } as const;
export const OFFICE = { extraOffers: 6, extraBackload: 2 } as const;

/** Rynek pracy i rynek sprzętu: liczba ofert i ich jakość rośnie z rangą. */
export const MARKETS = {
  candidatesBase: 4,
  candidatesRefreshMin: 2 * 24 * 60,
  truckOffersBase: 5,
  truckOffersRefreshMin: 3 * 24 * 60,
  dispatchEveryMin: 30,
  /** Odprawa przy zwolnieniu: tyle dniówek. */
  severanceDays: 5,
  /** Kara za wcześniejszy zwrot auta z leasingu: tyle rat dziennych. */
  returnPenaltyDays: 5,
} as const;
