import { routeGeometry, type LngLat } from './routes';

/**
 * Ścieżka kursu na mapie: dojazd na pusto + trasa z ładunkiem.
 * Każdy odcinek jest skalowany do kilometrów z silnika, więc „km przejechane”
 * z harmonogramu mapują się 1:1 na punkt na linii.
 */
export interface TripPath {
  coords: LngLat[];
  /** Skumulowany kilometr kursu dla każdego punktu `coords`. */
  km: number[];
}

function geoLen(a: LngLat, b: LngLat): number {
  const kx = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((b[0] - a[0]) * kx, b[1] - a[1]);
}

function appendLeg(path: TripPath, line: LngLat[], startKm: number, legKm: number) {
  const seg: number[] = [0];
  for (let i = 1; i < line.length; i++) seg.push(seg[i - 1] + geoLen(line[i - 1], line[i]));
  const total = seg[seg.length - 1] || 1;
  line.forEach((p, i) => {
    if (path.coords.length && i === 0) return; // wspólny punkt z poprzednim odcinkiem
    path.coords.push(p);
    path.km.push(startKm + (seg[i] / total) * legKm);
  });
}

export function buildTripPath(originId: string, fromId: string, toId: string, emptyKm: number, jobKm: number): TripPath {
  const path: TripPath = { coords: [], km: [] };
  if (originId !== fromId && emptyKm > 0) appendLeg(path, routeGeometry(originId, fromId), 0, emptyKm);
  appendLeg(path, routeGeometry(fromId, toId), emptyKm, jobKm);
  return path;
}

export function pointAtKm(path: TripPath, km: number): LngLat {
  const { coords, km: cum } = path;
  if (km <= cum[0]) return coords[0];
  for (let i = 1; i < coords.length; i++) {
    if (km <= cum[i]) {
      const f = (km - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f];
    }
  }
  return coords[coords.length - 1];
}

/** Część ścieżki od `km0` do `km1` (do rysowania przejechanej i pozostałej trasy). */
export function slicePath(path: TripPath, km0: number, km1: number): LngLat[] {
  const out: LngLat[] = [pointAtKm(path, km0)];
  path.coords.forEach((p, i) => {
    if (path.km[i] > km0 && path.km[i] < km1) out.push(p);
  });
  out.push(pointAtKm(path, km1));
  return out;
}
