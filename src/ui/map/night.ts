import { toDate } from '../../engine/time';
import type { LngLat } from '../../engine/routes';

/**
 * Cień nocy według czasu gry. Zegar gry to czas polski (CET, UTC+1).
 * Przybliżenie astronomiczne (bez równania czasu) w zupełności wystarcza do gry.
 */
const RAD = Math.PI / 180;
const CET_OFFSET_H = 1;

export function sunPosition(gameMin: number): { lon: number; decl: number } {
  const d = toDate(gameMin);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (d.getTime() - start) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 - CET_OFFSET_H;
  const lon = -15 * (utcHours - 12);
  return { lon, decl };
}

/** Wielokąt nocnej półkuli (do warstwy fill). */
export function nightPolygon(gameMin: number): LngLat[] {
  const { lon: sunLon, decl } = sunPosition(gameMin);
  const d = Math.abs(decl) < 0.1 ? 0.1 * Math.sign(decl || 1) : decl;
  const tanD = Math.tan(d * RAD);
  const ring: LngLat[] = [];
  for (let lon = -180; lon <= 180; lon += 3) {
    const lat = Math.atan(-Math.cos((lon - sunLon) * RAD) / tanD) / RAD;
    ring.push([lon, Math.max(-85, Math.min(85, lat))]);
  }
  // Latem (decl > 0) ciemno jest od linii terminatora na południe, zimą na północ.
  const pole = d > 0 ? -85 : 85;
  ring.push([180, pole], [-180, pole], ring[0]);
  return ring;
}

/** Czy w danym miejscu jest noc (do ikonek, ewentualnie do mechaniki). */
export function isNight(gameMin: number, lon: number, lat: number): boolean {
  const { lon: sunLon, decl } = sunPosition(gameMin);
  const cosZ = Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos((lon - sunLon) * RAD);
  return cosZ < 0;
}
