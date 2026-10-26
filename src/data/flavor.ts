/** Treści „z humorkiem”. Czyste dane: dopisuj śmiało, logika ich nie zna. */

export const TRUCK_MODELS = [
  { brand: 'Skania', model: 'R 450', fuelL100: 30.5 },
  { brand: 'Skania', model: 'S 500', fuelL100: 31.5 },
  { brand: 'Wolwo', model: 'FH 460', fuelL100: 30.0 },
  { brand: 'MEN', model: 'TGX 18.470', fuelL100: 31.0 },
  { brand: 'DAFF', model: 'XF 480', fuelL100: 29.5 },
  { brand: 'Merceles', model: 'Actros 1845', fuelL100: 29.0 },
  { brand: 'Iweko', model: 'S-Way 490', fuelL100: 32.0 },
  { brand: 'Renolt', model: 'Premium 450 DXi', fuelL100: 30.5 },
  // Legenda z płaską podłogą. Nie produkują jej od lat, więc trafia się tylko używana.
  { brand: 'Renolt', model: 'Magnum 480', fuelL100: 32.5, usedOnly: true },
] as const;

export const MALE_NAMES = ['Zbigniew', 'Mirosław', 'Krzysztof', 'Janusz', 'Mariusz', 'Dariusz', 'Tadeusz', 'Sławomir', 'Henryk', 'Ryszard', 'Waldemar', 'Grzegorz'];
export const FEMALE_NAMES = ['Grażyna', 'Bożena', 'Agnieszka', 'Danuta', 'Renata', 'Halina'];
export const LAST_NAMES = ['Kowalczyk', 'Nowak', 'Wiśniewski', 'Zieliński', 'Kamiński', 'Lewandowski', 'Dąbrowski', 'Szymański', 'Wójcik', 'Kaczmarek', 'Mazur', 'Jabłoński'];
export const NICKNAMES = ['Turbo', 'Kierownik', 'Cichy', 'Szeryf', 'Kawa', 'Radio', 'Profesor', 'Pączek', 'Dziadek', 'Gaz', 'Mapa', 'Bizon', 'Mrówka', 'Hrabia'];

export const QUIRKS = [
  'Zna każdy MOP między Strykowem a Świeckiem.',
  'Na CB mówi wyłącznie przysłowiami.',
  'Twierdzi, że ciągnik ma na imię Halina.',
  'Wozi własny ekspres do kawy. I młynek.',
  'Disco polo tylko na pauzach. Zasady to zasady.',
  'Nie ufa nawigacji od 2011 roku.',
  'Każdy korek komentuje jak mecz.',
  'Zbiera magnesy z każdej stacji paliw.',
];

export interface CargoType {
  name: string;
  minT: number;
  maxT: number;
  rateMul: number;
}

export const CARGO: readonly CargoType[] = [
  { name: 'Ogórki kiszone w beczkach', minT: 12, maxT: 24, rateMul: 1.0 },
  { name: 'Papier toaletowy (lekki, ale dużo)', minT: 5, maxT: 9, rateMul: 0.95 },
  { name: 'Krasnale ogrodowe', minT: 4, maxT: 12, rateMul: 1.05 },
  { name: 'Kostka brukowa', minT: 22, maxT: 24, rateMul: 1.05 },
  { name: 'Części do pralek', minT: 8, maxT: 18, rateMul: 1.0 },
  { name: 'Meble z płyty (instrukcja osobno)', minT: 10, maxT: 18, rateMul: 1.0 },
  { name: 'Pierogi mrożone', minT: 18, maxT: 22, rateMul: 1.15 },
  { name: 'Piwo regionalne', minT: 20, maxT: 24, rateMul: 1.05 },
  { name: 'Jabłka grójeckie', minT: 18, maxT: 24, rateMul: 0.98 },
  { name: 'Opony zimowe', minT: 6, maxT: 12, rateMul: 1.0 },
  { name: 'Bombki choinkowe (OSTROŻNIE)', minT: 3, maxT: 6, rateMul: 1.25 },
  { name: 'Węgiel (podobno ostatni)', minT: 24, maxT: 24, rateMul: 0.92 },
];

export const CLIENTS = [
  'Kiszonex Sp. z o.o.',
  'Krasnal-Pol',
  'Meblex Bis',
  'Pierogi Babci Hani S.A.',
  'Transpaper',
  'Brukmax',
  'Jabłkowo Grójec',
  'Bombkarnia Złota Gwiazda',
  'AGD-Serwis Janusz i Syn',
  'Browar Pod Kozą',
  'Hurtownia Wszystkiego',
];

export const INCIDENTS = {
  traffic: [
    'Korek na A2. Podobno ktoś rozsypał ładunek arbuzów.',
    'Roboty drogowe na S7. Pan z chorągiewką pozdrawia.',
    'Zator przed bramkami. {nick} opowiada przez CB historię swojego życia.',
    'Wypadek dwóch osobówek. {nick} stoi i komentuje jak mecz.',
  ],
  breakdown: [
    'Złapana guma. {nick}: „To nie ja, to droga”.',
    'Kontrolka silnika świeci od rana. {nick} uznał, że to dekoracja. Serwis się nie zgodził.',
    'Pękł przewód powietrza. {nick} naprawił{a} go taśmą i modlitwą, ale serwis i tak policzył.',
  ],
  itdFine: [
    'Kontrola ITD. Tachograf miał inne zdanie niż {nick}.',
    'Kontrola ITD. Okazało się, że „krótka pauza” to nie jest pojęcie prawne.',
  ],
  itdOk: [
    'Kontrola ITD. Wszystko gra, {nick} poczęstował{a} inspektorów kawą z ekspresu.',
    'Kontrola ITD. Papiery idealne. Inspektor wyglądał na rozczarowanego.',
  ],
  overslept: [
    '{nick} zaspał{a} na MOP-ie. Twierdzi, że to „regeneracja strategiczna”.',
    '{nick} przedłużył{a} pauzę, bo „film się jeszcze nie skończył”.',
  ],
};

export const DAILY_FLAVOR = [
  'Księgowa pyta, czy paragon z MOP-u za trzy hot-dogi to koszt uzyskania przychodu.',
  'Ktoś zostawił w biurze kartkę: „KTO ZNOWU WYPIŁ MOJE MLEKO”.',
  'Konkurencja z sąsiedniej działki kupiła nową naczepę. Udajemy, że nas to nie obchodzi.',
  'Na giełdzie ktoś oferuje 2,10 zł/km do Lizbony. Ludzie są niesamowici.',
  'Bank przysłał ulotkę o kredycie obrotowym. Z uśmiechniętą ciężarówką.',
  'Spedytor z konkurencji dzwonił „zapytać o pogodę”. Jasne.',
];

export const COMPANY_START = [
  'Założono firmę {company}, kapitał: {cash}, jeden używany ciągnik i dużo optymizmu.',
  'Księgowa: „Proszę nie wrzucać faktur do szuflady z ketchupem”. Zaczynamy.',
];
