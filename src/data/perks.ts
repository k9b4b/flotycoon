/**
 * Perki: cechy specjalne kierowców, obok statystyk.
 * Każdy kierowca ma 1–3 perki. Im lepszy kierowca, tym więcej perków i większa szansa, że są pozytywne.
 * Mnożniki działają w engine/effects.ts, a niektóre perki zmieniają też wybory w zdarzeniach na trasie.
 */

export interface PerkMods {
  /** Mnożnik średniej prędkości. */
  speedMul?: number;
  /** Mnożnik spalania. */
  fuelMul?: number;
  /** Mnożnik zużycia auta na kilometr. */
  wearMul?: number;
  /** Mnożniki szans zdarzeń drogowych. */
  trafficMul?: number;
  breakdownMul?: number;
  /** Mnożnik szansy, że kontrola ITD skończy się mandatem. */
  itdMul?: number;
  oversleptMul?: number;
  /** Przesunięcie poziomu, do którego wraca morale (domyślnie 65). */
  moraleTarget?: number;
  /** Mnożnik spadku morale po spóźnieniu. */
  lateMoraleMul?: number;
  /** Dodatkowa reputacja za terminowy kurs. */
  repOnTime?: number;
  /** Dodatkowa reputacja (ujemna) za spóźnienie. */
  repLate?: number;
}

export type PerkTone = 'good' | 'bad' | 'mixed';

export interface Perk {
  id: PerkId;
  name: string;
  desc: string;
  tone: PerkTone;
  /** Rzadkie perki pojawiają się tylko u dobrych kierowców. */
  rare?: boolean;
  mods: PerkMods;
  /** Perki, które się wykluczają (nie może być naraz „Złota rączka” i „Pechowiec”). */
  excludes?: PerkId[];
}

export type PerkId =
  | 'zlota_raczka'
  | 'zna_skroty'
  | 'teczka'
  | 'czuje_maszyne'
  | 'nocny_marek'
  | 'optymista'
  | 'ulubieniec'
  | 'stoik'
  | 'skapiec'
  | 'rajdowiec'
  | 'ciezka_noga'
  | 'zapominalski'
  | 'pechowiec'
  | 'mop'
  | 'maruda'
  | 'narwany'
  | 'pirat'
  | 'cb_radio';

export const PERKS: readonly Perk[] = [
  // ─── Pozytywne ───
  { id: 'zlota_raczka', name: 'Złota rączka', tone: 'good', desc: 'Naprawi wszystko taśmą i drutem. Awarie o połowę rzadziej, a z kontrolką silnika radzi sobie sam.', mods: { breakdownMul: 0.5 }, excludes: ['pechowiec'] },
  { id: 'zna_skroty', name: 'Zna skróty', tone: 'good', desc: 'Korek? Jaki korek. Korki łapie o połowę rzadziej, a objazd wybiera bez błądzenia.', mods: { trafficMul: 0.5 }, excludes: ['pechowiec'] },
  { id: 'teczka', name: 'Teczka z papierami', tone: 'good', desc: 'Dokumenty w komplecie, ułożone kolorami. Mandat z ITD o połowę rzadziej.', mods: { itdMul: 0.5 }, excludes: ['zapominalski', 'pirat'] },
  { id: 'czuje_maszyne', name: 'Czuje maszynę', tone: 'good', desc: 'Jeździ, jakby auto było własne. Zużycie o 30% wolniej.', mods: { wearMul: 0.7 }, excludes: ['ciezka_noga'] },
  { id: 'nocny_marek', name: 'Nocny marek', tone: 'good', desc: 'Najlepiej jedzie po zmroku. Praktycznie nie zasypia na MOP-ach.', mods: { oversleptMul: 0.2 }, excludes: ['mop'] },
  { id: 'optymista', name: 'Wieczny optymista', tone: 'good', desc: 'Po spóźnieniu mówi, że mogło być gorzej. Morale wyżej, a spóźnienia bolą o połowę mniej.', mods: { moraleTarget: 12, lateMoraleMul: 0.5 }, excludes: ['maruda'] },
  { id: 'ulubieniec', name: 'Ulubieniec magazynierów', tone: 'good', desc: 'Przywozi pączki na rozładunek. +1 reputacji za terminowy kurs i lepiej idą negocjacje.', mods: { repOnTime: 1 }, excludes: ['narwany'] },
  { id: 'stoik', name: 'Stoik', tone: 'good', desc: 'W kryzysie nie panikuje. Gdy decyduje sam, wybiera rozsądnie, a ryzykowne zagrania częściej wychodzą.', mods: {}, excludes: ['narwany'] },
  { id: 'skapiec', name: 'Liczy każdy litr', tone: 'good', desc: 'Tankuje tylko tam, gdzie taniej o 3 grosze. Paliwo o 4% taniej.', mods: { fuelMul: 0.96 }, excludes: ['ciezka_noga'] },
  { id: 'rajdowiec', name: 'Były rajdowiec', tone: 'good', rare: true, desc: 'Ostro, ale czysto. Średnio 4% szybciej, bez dodatkowych mandatów.', mods: { speedMul: 1.04 }, excludes: ['pirat'] },
  // ─── Negatywne ───
  { id: 'ciezka_noga', name: 'Ciężka noga', tone: 'bad', desc: 'Gaz do dechy, hamulec do dechy. Zużycie +30%, spalanie +4%.', mods: { wearMul: 1.3, fuelMul: 1.04 } },
  { id: 'zapominalski', name: 'Zapominalski', tone: 'bad', desc: 'Kiedyś CMR został na stacji w Kutnie. Mandat z ITD o 60% częściej.', mods: { itdMul: 1.6 } },
  { id: 'pechowiec', name: 'Pechowiec', tone: 'bad', desc: 'Jeśli coś może się zepsuć, zepsuje się na tej zmianie. Awarie i korki częściej.', mods: { breakdownMul: 1.5, trafficMul: 1.3 } },
  { id: 'mop', name: 'Kocha MOP-y', tone: 'bad', desc: 'Odpoczynek 11 h? Czemu nie 13. Zasypia dwa razy częściej.', mods: { oversleptMul: 2 } },
  { id: 'maruda', name: 'Maruda', tone: 'bad', desc: 'Narzeka na pogodę, stawki i kawę z automatu. Morale wraca do niższego poziomu.', mods: { moraleTarget: -12 } },
  { id: 'narwany', name: 'Narwany', tone: 'bad', desc: 'Z klientem dyskutuje głośno. −1 reputacji więcej za spóźnienie, a ryzykowne zagrania częściej się mszczą.', mods: { repLate: -1 } },
  // ─── Mieszane ───
  { id: 'pirat', name: 'Pirat drogowy', tone: 'mixed', desc: 'Jeździ szybko jak mało kto, ale fotoradary go kochają. +5% prędkości, mandat z ITD dwa razy częściej.', mods: { speedMul: 1.05, itdMul: 2 } },
  { id: 'cb_radio', name: 'Król CB-radia', tone: 'mixed', desc: 'Wie o każdym korku i kontroli, ale gada do drugiej w nocy. Mniej korków i mandatów, częściej zasypia.', mods: { trafficMul: 0.75, itdMul: 0.8, oversleptMul: 1.4 } },
];

export const PERK_BY_ID: Record<PerkId, Perk> = Object.fromEntries(PERKS.map((p) => [p.id, p])) as Record<PerkId, Perk>;

/** Wpływ perków na oczekiwaną pensję (zł/dzień). */
export const PERK_SALARY = { good: 25, mixed: 5, bad: -20 } as const;
