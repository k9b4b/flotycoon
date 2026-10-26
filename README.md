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

## Co już jest w symulacji

- **Kierowca:** doświadczenie (prędkość), eco-driving (spalanie), niezawodność (kontrole ITD), kondycja (ryzyko zaspania), morale (mnożnik niezawodności, spada przy spóźnieniach i bezczynności). Pensja dzienna, przebieg, licznik czasu jazdy przechodzący między kursami.
- **Ciągnik:** marka i model, norma Euro (myto), spalanie, przebieg, zużycie (awarie, spalanie), leasing, serwis.
- **Przepisy:** 4,5 h jazdy / 45 min przerwy, 9 h jazdy / 11 h odpoczynku. Uproszczenia opisane w `drivingRules.ts`.
- **Ekonomia:** fracht, paliwo, myto, pensje, leasing, naprawy, mandaty, kary za spóźnienie. Struktura kosztów na dashboardzie.
- **Giełda:** zlecenia generowane proceduralnie, z terminami i wyceną dla wybranego zestawu (dojazd, ETA, zysk, czy zdąży).
- **Humor:** parodie marek, klienci, ładunki, zdarzenia drogowe i biurowe w `data/flavor.ts`.

Wszystkie liczby balansu są w `data/balance.ts`. Wartości rynkowe (diesel, e-TOLL, stawki) to robocze przybliżenia do kalibracji. Obecnie bot z `sim:year` wychodzi mniej więcej na zero, więc rozsądny gracz zarabia, a nieuważny bankrutuje.

## Świadome uproszczenia prototypu

- Trasy są policzone tylko między 13 miastami MVP. Nowe miasta wymagają ponownego uruchomienia workflow tras (do tego czasu: linia prosta × 1,15).
- Zestaw = ciągnik + stały kierowca. Brak naczep, ADR, chłodni.
- Brak bankructwa, kredytu i limitów tygodniowych czasu jazdy.

## Następne kroki

1. Realne trasy: uruchomić workflow GraphHoppera (opis wyżej).
2. Rozdzielenie kierowców i ciągników, rekrutacja z listy kandydatów, zwolnienia.
3. Naczepy (plandeka, chłodnia, ADR) i dopasowanie do ładunków.
4. Finanse: kredyt, faktury z terminem płatności (zatory płatnicze!), bankructwo.
5. Europa: kraje, waluty, myto, ceny paliwa, kabotaż, zakazy weekendowe, języki kierowców.
6. Więcej zdarzeń i reputacja u klientów.
