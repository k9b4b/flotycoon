/**
 * Miasta MVP (tylko Polska). `weight` = jak często pojawiają się w zleceniach.
 * Kolejny etap: Europa + macierz realnych dystansów z GraphHoppera (tools/).
 */
export interface City {
  id: string;
  name: string;
  /** Dopełniacz, do komunikatów: „do Katowic”, „z Warszawy”. */
  gen: string;
  country: 'PL';
  lat: number;
  lon: number;
  weight: number;
}

export const CITIES: readonly City[] = [
  { id: 'WAW', name: 'Warszawa', gen: 'Warszawy', country: 'PL', lat: 52.2297, lon: 21.0122, weight: 10 },
  { id: 'KRK', name: 'Kraków', gen: 'Krakowa', country: 'PL', lat: 50.0647, lon: 19.945, weight: 7 },
  { id: 'LDZ', name: 'Łódź', gen: 'Łodzi', country: 'PL', lat: 51.7592, lon: 19.456, weight: 6 },
  { id: 'STR', name: 'Stryków', gen: 'Strykowa', country: 'PL', lat: 51.901, lon: 19.6047, weight: 5 },
  { id: 'WRO', name: 'Wrocław', gen: 'Wrocławia', country: 'PL', lat: 51.1079, lon: 17.0385, weight: 7 },
  { id: 'POZ', name: 'Poznań', gen: 'Poznania', country: 'PL', lat: 52.4064, lon: 16.9252, weight: 7 },
  { id: 'GDN', name: 'Gdańsk', gen: 'Gdańska', country: 'PL', lat: 54.352, lon: 18.6466, weight: 6 },
  { id: 'SZZ', name: 'Szczecin', gen: 'Szczecina', country: 'PL', lat: 53.4285, lon: 14.5528, weight: 4 },
  { id: 'BYD', name: 'Bydgoszcz', gen: 'Bydgoszczy', country: 'PL', lat: 53.1235, lon: 18.0084, weight: 4 },
  { id: 'LUB', name: 'Lublin', gen: 'Lublina', country: 'PL', lat: 51.2465, lon: 22.5684, weight: 4 },
  { id: 'KTW', name: 'Katowice', gen: 'Katowic', country: 'PL', lat: 50.2649, lon: 19.0238, weight: 7 },
  { id: 'BIA', name: 'Białystok', gen: 'Białegostoku', country: 'PL', lat: 53.1325, lon: 23.1688, weight: 3 },
  { id: 'RZE', name: 'Rzeszów', gen: 'Rzeszowa', country: 'PL', lat: 50.0412, lon: 21.9991, weight: 3 },
];

export const CITY_BY_ID: Record<string, City> = Object.fromEntries(CITIES.map((c) => [c.id, c]));

export const HOME_BASE = 'WAW';
