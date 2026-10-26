# FloTycoon

Przeglądarkowa gra o prowadzeniu firmy transportowej od zera. Start w Polsce, docelowo cała Europa. Głęboka symulacja, ale z humorem. Interfejs to pulpit spedytora: mapa, giełda zleceń, flota, wykresy, dziennik.

## Uruchomienie

```bash
npm install
npm run dev        # gra na http://localhost:5173
npm test           # testy silnika (Vitest)
npm run sim:year   # bot prowadzi firmę przez rok gry, wypisuje bilans
npm run build      # typecheck + build produkcyjny do dist/
```

## Zagraj online

Gra jest wystawiona na GitHub Pages: **https://k9b4b.github.io/flotycoon/** (działa na telefonie i komputerze, bez logowania). Workflow `.github/workflows/pages.yml` buduje ją przy każdym pushu na `main`. Zapis gry trzyma przeglądarka, więc każdy gracz ma swoją firmę.

## Zakładanie firmy

Przy pierwszym uruchomieniu (albo po „Zacznij od nowa z inną firmą” pod „?”) kreator prowadzi przez 4 kroki (`ui/components/SetupWizard.tsx`): nazwa firmy (z humorystycznymi podpowiedziami), siedziba (jedno z 13 miast z własnymi plusami i minusami w `data/hq.ts`: liczba ofert na giełdzie, stawki zleceń z siedziby, pensje lokalnego rynku pracy, koszt rozbudowy bazy i dotacja na start; tu odbiera się auta z salonu i stąd częściej startują zlecenia. Bot w każdym mieście kończy pół roku w przedziale ok. ±15–20% wartości firmy), pierwszy ciągnik z trzech ofert (od najtańszej raty po najwyższą) i pierwszy kierowca z trzech kandydatów (od najtańszego po najlepszego z ogłoszeń). Propozycje liczy silnik (`setupOptions(seed)`), wybory trafiają do `newGame(seed, setup)`.

## Samouczek

Nową grę prowadzi Zdzisiek, stary spedytor (`ui/components/Tutorial.tsx`): 8 kroków przez pierwszy kurs (giełda, zapas, „Bierzemy”, tempo gry, mapa, ładunek powrotny, flota, cel). Kroki przechodzą same, gdy gracz zrobi to, o co chodzi, a element jest podświetlony (na telefonie gra sama przełącza zakładkę). Potem Zdzisiek wpada z jedną radą naraz, gdy dzieje się coś nowego: telefon od kierowcy, pierwsze spóźnienie, stać nas na drugie auto, auto bez kierowcy, długi postój, zużycie, morale, awans i kontrakty, pełny plac, szkolenia. Pod „?” w górnym pasku jest ściągawka i ponowne uruchomienie samouczka. Postęp jest częścią zapisu gry.

## Architektura

```
src/
  engine/   silnik symulacji: czysty TypeScript, zero UI, zero DOM
  data/     miasta, balans, treści z humorem (same dane)
  worker/   Web Worker: trzyma stan, kręci zegarem, zapisuje w IndexedDB
  ui/       React: dashboard, który tylko wyświetla widok i woła akcje
tools/      skrypty: symulator roku do balansowania
tests/      testy silnika
```

**Symulacja zdarzeniowa.** Przyjęcie zlecenia liczy z góry cały harmonogram kursu (`engine/drivingRules.ts`): dojazd na pusto, załadunek, jazda, pauzy 45 min, odpoczynki dobowe, zdarzenia losowe, rozładunek. Do kolejki zdarzeń (`engine/queue.ts`) trafiają tylko momenty, w których coś się zmienia. Pozycję ciężarówki na mapie interpoluje się z harmonogramu. Dlatego rok gry liczy się w ~200 ms.

**Czas.** Czas gry to minuty od 4.01.2027. Tempo bazowe: 1 minuta realna = 1 godzina gry. Gracz może pauzować i przyspieszać (5×, 30×, 120×). W ukrytej karcie i podczas nieobecności gra idzie w tempie bazowym. Po powrocie silnik nadrabia zaległy czas (`catchUp`), z limitem 7 dni gry.

**Determinizm.** Losowość idzie przez generator z ziarnem (`engine/rng.ts`), a jego stan jest częścią zapisu. Ten sam seed i te same akcje dają identyczny przebieg. Test to sprawdza.

**Zapis.** Cały `GameState` to zwykły JSON w IndexedDB. Zmieniając jego kształt, podbij `SAVE_VERSION` i dopisz migrację w `engine/save.ts`.

**Wątek.** Symulacja działa w Web Workerze, UI dostaje widok (`engine/view.ts`) 4 razy na sekundę przez typowane RPC (`worker/protocol.ts`).

## Mapa

MapLibre GL z własnym stylem „dyspozytorskim” (`src/ui/map/style.ts`). Bez serwera kafelków i bez kluczy API: granice krajów i główne drogi Europy pochodzą z Natural Earth (domena publiczna) i są częścią paczki gry (`src/data/geo/`, ok. 450 KB).

- Ciężarówki to znaczniki HTML; ich pozycję UI liczy co klatkę z harmonogramu kursu (`engine/paths.ts`), więc ruch jest płynny niezależnie od tempa workera.
- Linie kursów: przejechana część przygaszona, dojazd na pusto przerywany, trasa z ładunkiem pełna.
- Najechanie (lub stuknięcie) zlecenia na giełdzie rysuje podgląd trasy dla wybranego zestawu.
- Cień nocy przesuwa się według zegara gry (`ui/map/night.ts`).
- Kraje spoza `ACTIVE_COUNTRIES` są przygaszone, pod przyszłą ekspansję.

Odświeżenie danych mapy:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector ne
(cd ne && git sparse-checkout set --no-cone /geojson/ne_50m_admin_0_countries.geojson /geojson/ne_10m_roads.geojson)
npm run geo -- ne/geojson
```

Sieć dróg z Natural Earth jest uproszczona i nie zawiera wszystkich nowych ekspresówek. Dokładne drogi pokazują dopiero linie tras z GraphHoppera.

## Realne trasy (GraphHopper)

Workflow `.github/workflows/routes.yml` liczy trasy dla każdej pary miast i zapisuje `src/data/routes.json` z powrotem do repozytorium. Silnik bierze z niego dystanse, mapa geometrię dróg. Do gry trafia tylko ten plik (dziesiątki KB), nie dane OSM.

1. Wypchnij projekt na GitHuba.
2. Zakładka **Actions** → **Trasy (GraphHopper)** → **Run workflow** (domyślnie `europe/poland`). Działa też z aplikacji GitHub na telefonie.
3. Po kilkunastu minutach w repozytorium pojawi się commit z trasami.

Lokalnie (Java 17+, ok. 6 GB RAM dla Polski): pobierz `graphhopper-web-<wersja>.jar` i `poland-latest.osm.pbf` z Geofabrik do `data/`, uruchom `java -Xmx6g -jar data/graphhopper.jar server tools/routes/config.yml`, a potem `npm run routes`.

Profil ciężarówki (`tools/routes/flotruck.json`) omija drogi z ograniczeniem masy poniżej 40 t i wysokości poniżej 4 m oraz limituje prędkość do 85 km/h. Silnik gry nadal liczy czas przejazdu po swojemu (statystyki kierowcy, przepisy); z GraphHoppera bierze tylko dystans i przebieg drogi.

## Progresja

Firma awansuje dzięki **reputacji**: terminowy kurs daje punkt (pilny dwa), spóźnienie zabiera 4, mandat z ITD 2. Rangi (`data/progression.ts`): „Jeden gość z Iveco” → „Firma krzak” → „Lokalny przewoźnik” → „Przewoźnik krajowy” → „Spedycja z ambicjami” → „Gracz z prawdziwego zdarzenia” → „Potentat ze Strykowa”.

Ranga odblokowuje rozbudowę bazy, a im wyższa, tym lepsi kandydaci na kierowców i szersza oferta salonu:

- **Plac**: limit aut (3 → 6 → 12 → 25 → 50); kierowców może być o 3 więcej.
- **Własny warsztat**: serwis 40% taniej i dwa razy krócej.
- **Biuro spedycji**: więcej ofert i ładunków powrotnych.
- **Dyspozytorka Halina**: sama przydziela bezpieczne ładunki wolnym zestawom i wysyła zużyte auta do serwisu (można ją wstrzymać).

**Kierowcy i auta są osobno.** Rynek pracy pokazuje kandydatów (zmiana co 2 dni) z oczekiwaną pensją rosnącą ze statystykami. Salon oferuje auta w leasingu (zmiana co 3 dni): używane z kaucją 6 000 zł, a od rangi „Lokalny przewoźnik” także nowe, oszczędniejsze i bez zużycia, ale z dwa razy wyższą ratą. Gra nie łączy par sama: kto czym jeździ, decyduje gracz. Przesadzenie kierowcy do zajętego auta zamienia kierowców miejscami (gdy żaden nie jest w trasie), a listy wyboru pokazują ocenę kierowcy (średnia umiejętności) i parametry aut. Kierowcę można zwolnić (odprawa 5 dniówek), a auto zwrócić (kara 5 rat, kaucja przepada).

**Kontrakty** (`engine/contracts.ts`, liczby w `data/development.ts`): od rangi „Firma krzak” klienci proponują stałe trasy (np. co 3 dni, 6–12 kursów) za stawkę o ok. 12% lepszą od giełdy. Każdy kurs pojawia się na giełdzie dobę przed załadunkiem i wisi na górze listy. Kurs, którego nikt nie weźmie, kosztuje karę; spóźnienie albo przepadnięty kurs to wpadka, a po 3 wpadkach klient zrywa umowę. Dokończona umowa daje premię i reputację. Limit kontraktów rośnie z rangą (biuro +1), Halina bierze kursy kontraktowe w pierwszej kolejności.

**Rozwój kierowców** (`engine/training.ts`): cztery szkolenia (eco-driving, tachograf i przepisy, ODTJ, „zdrowy sen i kręgosłup”) podnoszą statystykę, coraz mniej przy wysokim poziomie i kolejnych powtórkach (maks. 3). Kursy mogą wyleczyć zły perk („Ciężka noga”, „Zapominalski”, „Kocha MOP-y”), a ODTJ zamienia czasem „Pirata drogowego” w „Byłego rajdowca”. Na czas szkolenia auto zostaje bez kierowcy. Perki przychodzą też z doświadczeniem: „Zna skróty” po 50 tys. km, „Ulubieniec magazynierów” przy wielu kursach bez spóźnień, „Teczka z papierami” po długim przebiegu bez mandatów; „Pechowiec” i „Maruda” mogą zniknąć.

Przy obecnym balansie prosty bot dochodzi do „Przewoźnika krajowego” po ok. 3 miesiącach gry, a po roku ma 12 aut.

## Co już jest w symulacji

- **Kierowca:** doświadczenie (prędkość), eco-driving (spalanie), niezawodność (kontrole ITD), kondycja (ryzyko zaspania), morale (mnożnik niezawodności, spada przy spóźnieniach i bezczynności). Pensja dzienna, przebieg, licznik czasu jazdy przechodzący między kursami.
- **Perki kierowców** (`data/perks.ts`): 1–3 cechy specjalne obok statystyk, np. „Złota rączka” (awarie o połowę rzadziej), „Zna skróty”, „Ulubieniec magazynierów” (+1 reputacji za terminowy kurs), „Ciężka noga”, „Zapominalski”, „Pirat drogowy” (szybciej, ale więcej mandatów). Im lepszy kierowca, tym więcej perków i większa szansa, że są pozytywne; perki zmieniają też oczekiwaną pensję. Działają w `engine/effects.ts` (`perkMods`).
- **Zdarzenia z decyzją** (`engine/roadEvents.ts`): karambol, kontrola ITD bez papierów, kontrolka silnika, zmęczenie, dodatkowy rozładunek, grzechot w naczepie, tania stacja, pies na MOP-ie. Gdy gracz patrzy, kierowca „dzwoni”, a zegar gry czeka na wybór. W tle i podczas nieobecności kierowca decyduje sam według swoich perków i statystyk (to samo można włączyć na stałe w zakładce Firma). Wynik wstawia postój do harmonogramu kursu (`delayTrip`), a zdarzenia w kolejce same się przeplanowują.
- **Ciągnik:** marka i model, norma Euro (myto), spalanie, przebieg, zużycie (awarie, spalanie), leasing, serwis.
- **Przepisy:** 4,5 h jazdy / 45 min przerwy, 9 h jazdy / 11 h odpoczynku. Uproszczenia opisane w `drivingRules.ts`.
- **Ekonomia:** fracht, paliwo, myto, pensje, leasing, naprawy, mandaty, kary za spóźnienie. Struktura kosztów na dashboardzie.
- **Giełda:** zlecenia generowane proceduralnie, z terminami i wyceną dla wybranego zestawu (dojazd, ETA, zysk, czy zdąży).
- **Portrety kierowców** (`ui/portrait.ts`): własny generator pikselowych portretów 32×32 w duchu ETS2, bez plików graficznych. Kształt twarzy i szczęki, fryzury (także zakola i łysina), zarost (wąs, broda, kilkudniowy zarost), czapki, okulary, robocze ciuchy (flanela, kamizelka odblaskowa, kurtka, bluza). Wygląd jest stały dla osoby (ziarno z imienia, nazwiska i ksywki) i podąża za kierowcą: siwizna i zmarszczki u doświadczonych, okulary u „Teczki z papierami”, ciemne okulary u pirata; mina, brwi i cienie pod oczami zmieniają się z morale.
- **Pikselowe ciągniki** (`ui/truckSprite.ts`): generator ciągników siodłowych z boku (44×28) do floty i salonu. Sylwetka kabiny zależy od marki (wysokość dachu, pochylenie przodu, zaokrąglenie, spojler DAFF-a, osłony boczne), lakier, pas i wydech od tablicy rejestracyjnej (stałe dla auta). Zużycie płowi lakier, dodaje rdzę i brud, nowe auta błyszczą.
- **Humor:** parodie marek, klienci, ładunki, zdarzenia drogowe i biurowe w `data/flavor.ts`, oparte na gwarze CB-radia i realiach z trasy (misie z suszarką, nabita puszka, Kaśka, wahadełko, maślanka, lemoniada, „szerokości”, awizacje, wymiana palet, dziadtransy). Kierowcy czasem odzywają się na CB przy wyjeździe, mają wymówki przy spóźnieniach, a zdarzenia z decyzją obejmują też kolejkę pod rampą, wymianę palet i autostopowicza.

Wszystkie liczby balansu są w `data/balance.ts`. Wartości rynkowe (diesel, e-TOLL, stawki) to robocze przybliżenia do kalibracji. Obecnie prosty bot z `sim:year` (logika w `tools/bot.ts`) rośnie w rok do 12 aut, więc rozsądny gracz zarabia więcej, a nieuważny bankrutuje.

**Giełda:** oferty pojawiają się głównie tam, gdzie stoją albo dojeżdżają nasze auta, a po każdym rozładunku dochodzą 3 ładunki powrotne z tego miasta. Każda oferta ma okno załadunku (potem znika) i termin dostawy liczony z przerwami i ewentualnym odpoczynkiem dobowym.

## Świadome uproszczenia prototypu

- Trasy są policzone tylko między 13 miastami MVP. Nowe miasta wymagają ponownego uruchomienia workflow tras (do tego czasu: linia prosta × 1,15).
- Brak naczep, ADR, chłodni.
- Brak bankructwa, kredytu i limitów tygodniowych czasu jazdy.

## Następne kroki

1. Kontrakty ze stałymi klientami (regularne trasy, pewna stawka, kary za zawalenie).
2. Licencje: międzynarodowa (otwiera Europę), ADR, chłodnie.
3. Naczepy (plandeka, chłodnia, ADR) i dopasowanie do ładunków.
4. Finanse: kredyt, faktury z terminem płatności (zatory płatnicze!), bankructwo.
5. Europa: kraje, waluty, myto, ceny paliwa, kabotaż, zakazy weekendowe, języki kierowców. Razem z Europą **podwójna obsada**: drugi kierowca w zestawie (pauza 45 min w jadącym aucie, 9 h odpoczynku na postoju w ciągu 30 h, ok. 1,7× więcej km na dobę), ekspresy z wyższą stawką i dopasowanie charakterów w parze (morale).
6. Osiągnięcia i więcej zdarzeń.
