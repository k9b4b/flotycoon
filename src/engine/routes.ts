import { CITY_BY_ID } from '../data/cities';
import { BALANCE } from '../data/balance';
import routesData from '../data/routes.json';

/**
 * Trasy między miastami.
 * Gdy src/data/routes.json zawiera trasę (wygenerowaną przez GraphHoppera,
 * patrz tools/routes/), silnik bierze z niej realny dystans, a mapa geometrię drogi.
 * W przeciwnym razie: linia prosta × roadFactor.
 */
export type LngLat = [number, number];

interface RouteEntry {
  km: number;
  coords: LngLat[];
}

// JSON importuje współrzędne jako number[][], więc rzutujemy przez unknown na krotki [lon, lat].
const ROUTES = (routesData as unknown as { routes: Record<string, RouteEntry> }).routes;

export const routeKey = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export const hasRealRoutes = () => Object.keys(ROUTES).length > 0;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function roadKm(fromId: string, toId: string): number {
  if (fromId === toId) return 0;
  const known = ROUTES[routeKey(fromId, toId)];
  if (known) return Math.round(known.km);
  const a = CITY_BY_ID[fromId];
  const b = CITY_BY_ID[toId];
  if (!a || !b) throw new Error(`Nieznane miasto: ${fromId} / ${toId}`);
  return Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon) * BALANCE.roadFactor);
}

/** Geometria drogi z `fromId` do `toId` (w tym kierunku). */
export function routeGeometry(fromId: string, toId: string): LngLat[] {
  const a = CITY_BY_ID[fromId];
  const b = CITY_BY_ID[toId];
  if (fromId === toId) return [[a.lon, a.lat]];
  const known = ROUTES[routeKey(fromId, toId)];
  if (!known) return [[a.lon, a.lat], [b.lon, b.lat]];
  return fromId < toId ? known.coords : [...known.coords].reverse();
}
