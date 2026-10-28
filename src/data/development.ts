import type { PerkId } from './perks';

/** Kontrakty ze stałymi klientami i rozwój kierowców. Same liczby i teksty. */

export const CONTRACTS = {
  /** Co ile dni gry odświeżają się oferty kontraktów. */
  offersEveryDays: 7,
  offers: 2,
  /** Biuro spedycji przynosi dodatkową ofertę i jeden kontrakt więcej. */
  officeExtra: 1,
  /** Od której rangi klienci w ogóle chcą podpisywać umowy. */
  minRank: 1,
  /** Ile godzin przed terminem załadunku kurs pojawia się na giełdzie. */
  postAheadH: 24,
  /** Ile godzin po planowanym załadunku można jeszcze przyjąć kurs. */
  acceptGraceH: 6,
  /** Premia stawki względem giełdy: pewny przewoźnik jest wart więcej. */
  rateMul: 1.12,
  /** Kara za kurs, którego nikt nie wziął (część stawki). */
  missPenalty: 0.4,
  /** Premia za dokończenie całej umowy (część sumy stawek). */
  completionBonus: 0.08,
  /** Tyle wpadek (spóźnienie albo przepadnięty kurs) i klient zrywa umowę. */
  maxStrikes: 3,
  repComplete: 5,
  repMiss: -3,
  repBroken: -8,
};

export interface Course {
  id: CourseId;
  name: string;
  stat: 'experience' | 'eco' | 'reliability' | 'stamina';
  /** Bazowy przyrost statystyki (maleje z poziomem i kolejnymi powtórkami). */
  gain: number;
  cost: number;
  days: number;
  desc: string;
  /** Zły perk, który kurs może wyleczyć. */
  fixes?: PerkId;
  /** Perk, który kurs może zamienić w lepszy. */
  converts?: [PerkId, PerkId];
  /** Uprawnienia, które daje kurs (wtedy wystarczy go zdać raz). */
  cert?: 'adr';
  /** Od której rangi kurs jest dostępny. */
  rank?: number;
}

export type CourseId = 'eco' | 'law' | 'odtj' | 'health' | 'adr';

export const COURSES: readonly Course[] = [
  {
    id: 'eco',
    name: 'Kurs eco-drivingu',
    stat: 'eco',
    gain: 14,
    cost: 3500,
    days: 2,
    desc: 'Instruktor z tabletem i miną „ja tu tylko liczę litry”. Może oduczyć ciężkiej nogi.',
    fixes: 'ciezka_noga',
  },
  {
    id: 'law',
    name: 'Szkolenie: tachograf i przepisy',
    stat: 'reliability',
    gain: 14,
    cost: 2800,
    days: 1,
    desc: 'Osiem godzin o pauzach, z jedną pauzą. Zapominalskim czasem przechodzi zapominanie.',
    fixes: 'zapominalski',
  },
  {
    id: 'odtj',
    name: 'Doskonalenie techniki jazdy (ODTJ)',
    stat: 'experience',
    gain: 12,
    cost: 4500,
    days: 2,
    desc: 'Płyta poślizgowa i kurtyna wodna. Z pirata drogowego bywa potem były rajdowiec.',
    converts: ['pirat', 'rajdowiec'],
  },
  {
    id: 'health',
    name: 'Warsztaty „zdrowy sen i kręgosłup”',
    stat: 'stamina',
    gain: 14,
    cost: 2200,
    days: 1,
    desc: 'Pani fizjoterapeutka i poduszka ortopedyczna gratis. Miłośnicy MOP-ów śpią potem krócej.',
    fixes: 'mop',
  },
  {
    id: 'adr',
    name: 'Kurs ADR (towary niebezpieczne)',
    stat: 'reliability',
    gain: 5,
    cost: 3200,
    days: 3,
    desc: 'Trzy dni o klasach, tablicach i gaśnicach. Pomarańczowa tabliczka do portfela i wstęp do cystern.',
    cert: 'adr',
    rank: 2,
  },
];

export const COURSE_BY_ID: Record<CourseId, Course> = Object.fromEntries(COURSES.map((c) => [c.id, c])) as Record<CourseId, Course>;

export const TRAINING = {
  /** Ile razy można przejść ten sam kurs. */
  maxRepeats: 3,
  /** Mnożnik przyrostu dla kolejnych powtórek. */
  repeatMul: [1, 0.6, 0.35],
  fixChance: 0.5,
  convertChance: 0.4,
  moraleAfter: 6,
};

/** Perki zdobywane i tracone z doświadczeniem (sprawdzane po każdym kursie). */
export const MILESTONES = {
  maxPerks: 4,
  /** „Zna skróty”: od 50 tys. km, przy każdych kolejnych 25 tys. */
  shortcutsFromKm: 50_000,
  shortcutsChance: 0.35,
  /** „Ulubieniec magazynierów”: co 20 kursów od 40, przy mniej niż 5% spóźnień. */
  favoriteFromJobs: 40,
  favoriteEvery: 20,
  favoriteMaxLate: 0.05,
  favoriteChance: 0.4,
  /** „Teczka z papierami”: od 75 tys. km bez żadnego mandatu. */
  folderFromKm: 75_000,
  folderChance: 0.3,
  /** Pechowiec przestaje być pechowcem: od 100 tys. km. */
  unluckyFromKm: 100_000,
  unluckyFixChance: 0.3,
  stepKm: 25_000,
  /** Maruda przy świetnym humorze czasem się poprawia. */
  grumpyFixMorale: 90,
  grumpyFixChance: 0.08,
};
