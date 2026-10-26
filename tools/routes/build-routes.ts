/**
 * Pyta lokalny serwer GraphHoppera o trasę dla każdej pary miast gry
 * i zapisuje wynik do src/data/routes.json (dystans + uproszczona geometria).
 *
 * Uruchamiane w GitHub Actions (.github/workflows/routes.yml) albo lokalnie:
 *   java -Xmx6g -jar graphhopper-web.jar server tools/routes/config.yml
 *   npx tsx tools/routes/build-routes.ts
 */
import { writeFileSync } from 'node:fs';
import { CITIES } from '../../src/data/cities';

const GH = process.env.GH_URL ?? 'http://localhost:8989';
const OUT = new URL('../../src/data/routes.json', import.meta.url);
const SIMPLIFY_DEG = 0.002; // ~150–200 m: wystarcza do mapy, plik zostaje mały

type LngLat = [number, number];

function decodePolyline(str: string, multiplier: number): LngLat[] {
  const out: LngLat[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / multiplier, lat / multiplier]);
  }
  return out;
}

function simplify(points: LngLat[], tol: number): LngLat[] {
  if (points.length <= 2) return points;
  const sq = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let max = 0, idx = 0;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i], [x1, y1] = points[a], [x2, y2] = points[b];
      const dx = x2 - x1, dy = y2 - y1;
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0;
      const d = (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2;
      if (d > max) { max = d; idx = i; }
    }
    if (max > sq) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

async function route(a: (typeof CITIES)[number], b: (typeof CITIES)[number]) {
  const url = `${GH}/route?profile=truck&instructions=false&points_encoded=true&point=${a.lat},${a.lon}&point=${b.lat},${b.lon}`;
  const res = await fetch(url);
  const body = (await res.json()) as any;
  if (!res.ok || !body.paths?.length) throw new Error(body.message ?? `HTTP ${res.status}`);
  const p = body.paths[0];
  const coords = simplify(decodePolyline(p.points, body.points_encoded_multiplier ?? 1e5), SIMPLIFY_DEG).map(([x, y]) => [r4(x), r4(y)] as LngLat);
  return { km: Math.round(p.distance / 100) / 10, coords };
}

const ids = [...CITIES].sort((x, y) => (x.id < y.id ? -1 : 1));
const routes: Record<string, { km: number; coords: LngLat[] }> = {};
let failed = 0;
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    const key = `${a.id}-${b.id}`; // klucz zawsze w porządku alfabetycznym, geometria od a do b
    try {
      routes[key] = await route(a, b);
      console.log(`${key.padEnd(8)} ${String(routes[key].km).padStart(7)} km  ${routes[key].coords.length} pkt`);
    } catch (e) {
      failed++;
      console.error(`${key}: ${(e as Error).message}`);
    }
  }
}

const json = JSON.stringify({ source: 'GraphHopper, dane © OpenStreetMap contributors (ODbL)', generatedAt: new Date().toISOString(), routes });
writeFileSync(OUT, json);
console.log(`\nZapisano ${Object.keys(routes).length} tras (${(json.length / 1024).toFixed(0)} KB), błędów: ${failed}.`);
if (failed > 0) process.exit(1);
