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
export const NICKNAMES = [
  'Turbo', 'Kierownik', 'Cichy', 'Szeryf', 'Kawa', 'Radio', 'Profesor', 'Pączek', 'Dziadek', 'Gaz', 'Mapa', 'Bizon', 'Mrówka', 'Hrabia',
  // Z gwary CB-radia i trasy.
  'Rogal', 'Szerokości', 'Lemoniada', 'Budzik', 'Firanka', 'Solówka', 'Margines', 'Lustereczko', 'Wahadełko', 'Maślanka', 'Kocioł', 'Skakanka', 'Dafik', 'Kopytko',
];

export const QUIRKS = [
  'Zna każdy MOP między Strykowem a Świeckiem.',
  'Na CB mówi wyłącznie przysłowiami.',
  'Twierdzi, że ciągnik ma na imię Halina.',
  'Wozi własny ekspres do kawy. I młynek.',
  'Disco polo tylko na pauzach. Zasady to zasady.',
  'Nie ufa nawigacji od 2011 roku.',
  'Każdy korek komentuje jak mecz.',
  'Zbiera magnesy z każdej stacji paliw.',
  'Na każde „dzięki” na CB odpowiada „lustereczko”.',
  'Mówi na nawigację „Kaśka” i regularnie się z nią kłóci.',
  'Kawę pije z energetykiem. Twierdzi, że to „mieszanka startowa”.',
  'W kabinie ma kuchenkę turystyczną i trzy rodzaje parówek.',
  'Wtuli zestaw w miejsce, o którym nie śnili projektanci parkingu.',
  'Każdą kontrolę zaczyna od „szerokości, panie władzo”.',
  'Rogala wywinie na każdym rondzie, nawet tam, gdzie się nie da.',
  'Prowadzi zeszyt z ocenami toalet na MOP-ach. Skala od 1 do „lepiej w krzakach”.',
  'Zna magazynierów z imienia, a ich psy z rasy.',
  'Wozi zapas palet „na wymianę”. Skąd je ma, nie mówi.',
  'Uważa, że Stryków to nie miejsce, tylko stan umysłu.',
  'Na pauzie ogląda filmiki innych kierowców i komentuje „tak się nie jeździ”.',
  'Ma w kabinie zasłonki w kratkę i doniczkę z bazylią.',
  'Rozpoznaje suszarkę po samym błysku zza zakrętu.',
  'Do spedytora mówi „szefuniu”, do szefa „panie spedytorze”. Zawsze na odwrót.',
  'Kanapki z domu liczy jako „zapas strategiczny na trzy dni”.',
  'W lusterku wisi zapach „nowe auto”. Auto ma 900 tysięcy na liczniku.',
  'Wysyła rodzinie zdjęcia zachodów słońca zza szyby. Codziennie. Każdemu osobno.',
  'Na kabinie naklejki z każdego odwiedzonego kraju. Są dwie.',
  'Na każdym rozładunku pyta, czy jest kawa. Czasem jest.',
  'Ma playlistę „Na wahadełko”: same ballady po 7 minut.',
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
  { name: 'Panele podłogowe (wszystkie „dąb”)', minT: 18, maxT: 24, rateMul: 1.0 },
  { name: 'Karma dla psów (pachnie jak obiad)', minT: 16, maxT: 22, rateMul: 0.98 },
  { name: 'Lodówki (puste, niestety)', minT: 6, maxT: 10, rateMul: 1.02 },
  { name: 'Kapusta na bigos', minT: 18, maxT: 24, rateMul: 0.95 },
  { name: 'Rowery (do złożenia przez klienta)', minT: 5, maxT: 9, rateMul: 1.08 },
  { name: 'Kabanosy (zapach w kabinie gratis)', minT: 14, maxT: 20, rateMul: 1.1 },
  { name: 'Choinki (igły wszędzie)', minT: 8, maxT: 14, rateMul: 1.08 },
  { name: 'Puste palety EPAL (ironia losu)', minT: 8, maxT: 12, rateMul: 0.9 },
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
  'Logistyka Pan Kaziu',
  'Panelex Dąb Sp. j.',
  'Kabanos-Pol',
  'Hurtownia „U Zdziśka”',
  'Magazyn Centralny Stryków',
  'Spedycja Szybko-Szybko',
  'Rowerex',
  'Paleciarnia Euro-Pal',
];

export const INCIDENTS = {
  traffic: [
    'Korek na A2. Podobno ktoś rozsypał ładunek arbuzów.',
    'Roboty drogowe na S7. Pan z chorągiewką pozdrawia.',
    'Zator przed bramkami. {nick} opowiada przez CB historię swojego życia.',
    'Wypadek dwóch osobówek. {nick} stoi i komentuje jak mecz.',
    'Wahadełko na S8. Pan z lizakiem ma dziś zły dzień i puszcza po trzy auta.',
    'Kocioł przed Strykowem. Na CB: „tu stoi wszystko, nawet czas”.',
    'Maślanka na A1, widać tylko światła poprzedzającego. {nick} jedzie „na pamięć”.',
    'Kaśka pokazała skrót przez pole. Dosłownie: był tam kombajn.',
    'Piątek po południu, słoiki jadą do domu. Wylotówka stoi.',
    'Na marginesie osobówka z otwartą maską. Wszyscy zwalniają, żeby popatrzeć.',
    'Remont mostu. Objazd przez trzy wsie i jeden odpust.',
  ],
  breakdown: [
    'Złapana guma. {nick}: „To nie ja, to droga”.',
    'Kontrolka silnika świeci od rana. {nick} uznał{a}, że to dekoracja. Serwis się nie zgodził.',
    'Pękł przewód powietrza. {nick} naprawił{a} go taśmą i modlitwą, ale serwis i tak policzył.',
    'Zgasła świeczka: przepalona żarówka i przy okazji pół instalacji. Elektryk przy trasie zaciera ręce.',
    'Strzelił pasek klinowy. Zapasowy też był, tylko ktoś kiedyś na nim stanął.',
    'Wyciek AdBlue. W kabinie pachnie jak w szpitalu, a komputer odmawia współpracy.',
    'Turbina gwiżdże jak czajnik. Mechanik: „To nie gwizd, to pożegnanie”.',
  ],
  itdFine: [
    'Kontrola ITD. Tachograf miał inne zdanie niż {nick}.',
    'Kontrola ITD. Okazało się, że „krótka pauza” to nie jest pojęcie prawne.',
    'Krokodyle na wjeździe na MOP. Waga pokazała więcej, niż było w CMR. I to nie waga się pomyliła.',
    'Kontrola ITD. „Pauza na skoczka” w kolejce do rampy nie przekonała inspektora.',
    'Misie z suszarką za wiaduktem. {nick} zapomniał{a}, że budzik ma nie tylko cyfry.',
    'Kontrola ITD. Zabrakło wydruku z tachografu, a {nick} dowodził{a}, że „papier się skończył w całej Polsce”.',
  ],
  itdOk: [
    'Kontrola ITD. Wszystko gra, {nick} poczęstował{a} inspektorów kawą z ekspresu.',
    'Kontrola ITD. Papiery idealne. Inspektor wyglądał na rozczarowanego.',
    'Krokodyle sprawdzili wszystko: tacho, wagę, apteczkę. {nick} dostał{a} pochwałę za porządek w kabinie.',
    'Na CB ostrzegali: „misie suszą przed zjazdem”. {nick} zwolnił{a} i przejechał{a} grzecznie jak na egzaminie.',
    'Kontrola ITD trwała dłużej niż rozładunek. Wszystko w porządku, tylko kawa wystygła.',
  ],
  overslept: [
    '{nick} zaspał{a} na MOP-ie. Twierdzi, że to „regeneracja strategiczna”.',
    '{nick} przedłużył{a} pauzę, bo „film się jeszcze nie skończył”.',
    'Pięć minut drzemki zamieniło się w dwie godziny. {nick} twierdzi, że budzik był po niemiecku.',
    '{nick} zaspał{a}, bo sąsiad z parkingu grzał silnik od czwartej i „to było kojące”.',
    'Pauza się przedłużyła: w budce z kebabem na MOP-ie leciał mecz.',
  ],
};

export const DAILY_FLAVOR = [
  'Księgowa pyta, czy paragon z MOP-u za trzy hot-dogi to koszt uzyskania przychodu.',
  'Ktoś zostawił w biurze kartkę: „KTO ZNOWU WYPIŁ MOJE MLEKO”.',
  'Konkurencja z sąsiedniej działki kupiła nową naczepę. Udajemy, że nas to nie obchodzi.',
  'Na giełdzie ktoś oferuje 2,10 zł/km do Lizbony. Ludzie są niesamowici.',
  'Bank przysłał ulotkę o kredycie obrotowym. Z uśmiechniętą ciężarówką.',
  'Spedytor z konkurencji dzwonił „zapytać o pogodę”. Jasne.',
  'Na grupie kierowców ktoś pyta, czy 2,90 zł/km do Hiszpanii to dobra stawka. 400 komentarzy, zero zgody.',
  'Dziadtrans z drugiej strony ulicy znowu ogłasza „super stawki”. Zatrudniają do jutra.',
  'Magazyn w Strykowie przysłał nowy regulamin awizacji. 14 stron, w tym 3 o kamizelkach.',
  'Na giełdzie klasyk: „ładunek na teraz, 800 km, termin na wczoraj, stawka do negocjacji w dół”.',
  'Na CB ktoś sprzedaje „oszczędności”. Wszyscy wiedzą, żeby nie pytać skąd.',
  'Księgowa znalazła fakturę za „kanapę do kabiny”. Kierowca twierdzi, że to leżanka ortopedyczna.',
  'Z magazynu wróciło 20 palet zamiast 33. Wszyscy udają, że tak miało być.',
  'Na lodówce w biurze wisi lista: „Rzeczy, których nie mówimy spedytorowi przed siódmą”.',
  'Kierowcy w socjalu kłócą się, co lepsze: Skania czy Wolwo. Trzecia godzina, bez rozstrzygnięcia.',
  'W sieci wiralem jest kierowca, który gotuje bigos na kuchence w kabinie. Nasi pytają o przepis.',
  'Pismo z gminy: „Prosimy nie zawracać zestawem na rondzie przy kościele”. Wiemy, kto to.',
  'Telefon do biura o 23:40: „Szefie, a ten rozładunek jutro to na pewno o szóstej?”. Na pewno.',
  'Pan Kaziu z firmy obok pyta, czy pożyczymy mu kierowcę „tylko na jeden kurs, do Gdańska i z powrotem”.',
];

export const COMPANY_START = [
  'Założono firmę {company}, kapitał: {cash}, jeden używany ciągnik i dużo optymizmu.',
  'Księgowa: „Proszę nie wrzucać faktur do szuflady z ketchupem”. Zaczynamy.',
  'Pierwszy wpis w zeszycie floty: „Szerokości!”.',
];

/** Gadka na CB przy wyjeździe (czasem dopisana do dziennika). */
export const CB_DEPART = [
  'Na CB: „Szerokości, {nick} melduje się na ścieżce”.',
  '{nick} pyta na CB, jak wylocik. Odpowiedź: „Czysto, tylko misie przy stacji”.',
  '{nick} pyta na CB o pogodę. Ktoś odpowiada: „Amba jak mleko, uważaj”.',
  'Na CB już ktoś pyta, czy {nick} jedzie z firanką, czy z lodówką.',
  '{nick} zatankował{a} lemoniadę do pełna i ruszył{a} z uśmiechem.',
  'Na CB: „Nabita puszka za Łodzią, nie szalejcie”. {nick} odpowiada: „Lustereczko”.',
];

/** Dopiski przy terminowym rozładunku. */
export const ARRIVE_FLAVOR = [
  '„Przyczepności!” rzuca ktoś na CB na pożegnanie.',
  'Magazynier nawet się uśmiechnął. Ktoś to nagrał.',
  'Palety wymienione bez kłótni. Cud logistyczny.',
  'Rozładunek w 40 minut. {nick} nie wierzy i trzy razy sprawdza CMR.',
];

/** Wymówki przy spóźnieniu. */
export const LATE_EXCUSES = [
  '„Korki były”.',
  '„Kaśka pokazała skrót”.',
  '„Wahadełko, szefie, wahadełko”.',
  '„Na poprzednim rozładunku magazynier miał przerwę na papierosa. Trzy godziny”.',
  '„Misie trzymały na kontroli”.',
  '„Maślanka na drodze, nic nie było widać”.',
];
