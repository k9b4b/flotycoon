/**
 * Buduje dane mapy z Natural Earth (domena publiczna): kraje + główne drogi Europy.
 * Przycina do prostokąta Europy, upraszcza linie (Douglas–Peucker) i zaokrągla współrzędne.
 *
 * Użycie:
 *   git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector ne
 *   (cd ne && git sparse-checkout set --no-cone /geojson/ne_50m_admin_0_countries.geojson /geojson/ne_10m_roads.geojson)
 *   node tools/build-geo.mjs ne/geojson
 *
 * Wynik: src/data/geo/countries.json i src/data/geo/roads.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) {
  console.error('Podaj folder z plikami Natural Earth (geojson).');
  process.exit(1);
}
const OUT = new URL('../src/data/geo/', import.meta.url).pathname;
// [zachód, południe, wschód, północ] — Europa z zapasem
const BBOX = [-25, 33, 45, 72];
const PRECISION = 1e3; // ~100 m, w zupełności wystarcza

const round = (v) => Math.round(v * PRECISION) / PRECISION;

// ── Upraszczanie ────────────────────────────────────────────────────────────
function sqSegDist(p, a, b) {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = b;
    else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplify(points, tol) {
  if (points.length <= 2) return points;
  const sq = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let max = 0;
    let idx = 0;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > sq) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ── Przycinanie wielokątów do prostokąta (Sutherland–Hodgman) ───────────────
function clipRing(ring, [w, s, e, n]) {
  const edges = [
    (p) => p[0] >= w,
    (p) => p[0] <= e,
    (p) => p[1] >= s,
    (p) => p[1] <= n,
  ];
  const cut = [
    (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])],
    (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s],
    (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n],
  ];
  let out = ring;
  for (let k = 0; k < 4; k++) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const inCur = edges[k](cur);
      const inPrev = edges[k](prev);
      if (inCur) {
        if (!inPrev) out.push(cut[k](prev, cur));
        out.push(cur);
      } else if (inPrev) out.push(cut[k](prev, cur));
    }
    if (out.length === 0) return [];
  }
  if (out.length > 0) out.push(out[0]);
  return out;
}

function bboxOf(coords) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]);
      s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else c.forEach(walk);
  };
  walk(coords);
  return [w, s, e, n];
}

const intersects = (b) => b[0] <= BBOX[2] && b[2] >= BBOX[0] && b[1] <= BBOX[3] && b[3] >= BBOX[1];

function cleanLine(points, tol) {
  const simple = simplify(points, tol).map(([x, y]) => [round(x), round(y)]);
  return simple.filter((p, i) => i === 0 || p[0] !== simple[i - 1][0] || p[1] !== simple[i - 1][1]);
}

// ── Kraje ────────────────────────────────────────────────────────────────────
const countriesRaw = JSON.parse(readFileSync(join(SRC, 'ne_50m_admin_0_countries.geojson'), 'utf8'));
const countries = [];
for (const f of countriesRaw.features) {
  const g = f.geometry;
  if (!g || !intersects(bboxOf(g.coordinates))) continue;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const out = [];
  for (const poly of polys) {
    if (!intersects(bboxOf(poly))) continue;
    const rings = poly.map((r) => cleanLine(clipRing(r, BBOX), 0.03)).filter((r) => r.length >= 4);
    if (rings.length) out.push(rings);
  }
  if (!out.length) continue;
  const p = f.properties;
  countries.push({
    type: 'Feature',
    properties: { code: p.ADM0_A3, name: p.NAME, namePl: p.NAME_PL ?? p.NAME },
    geometry: { type: 'MultiPolygon', coordinates: out },
  });
}

// ── Drogi ────────────────────────────────────────────────────────────────────
const roadsRaw = JSON.parse(readFileSync(join(SRC, 'ne_10m_roads.geojson'), 'utf8'));
const roads = [];
for (const f of roadsRaw.features) {
  const p = f.properties;
  if (p.continent !== 'Europe') continue;
  const motorway = p.expressway === 1;
  const trunk = !motorway && (p.type === 'Major Highway' || p.type === 'Secondary Highway');
  if (!motorway && !trunk) continue;
  const g = f.geometry;
  if (!g || !intersects(bboxOf(g.coordinates))) continue;
  const lines = (g.type === 'LineString' ? [g.coordinates] : g.coordinates).map((l) => cleanLine(l, 0.01)).filter((l) => l.length >= 2);
  if (!lines.length) continue;
  roads.push({
    type: 'Feature',
    properties: { cls: motorway ? 'motorway' : 'trunk' },
    geometry: { type: 'MultiLineString', coordinates: lines },
  });
}

mkdirSync(OUT, { recursive: true });
const write = (name, features) => {
  const json = JSON.stringify({ type: 'FeatureCollection', features });
  writeFileSync(join(OUT, name), json);
  console.log(`${name}: ${features.length} obiektów, ${(json.length / 1024).toFixed(0)} KB`);
};
write('countries.json', countries);
// Scalamy w dwa obiekty (autostrady / główne drogi): mniej narzutu JSON i szybsze renderowanie.
const merged = ['motorway', 'trunk'].map((cls) => ({
  type: 'Feature',
  properties: { cls },
  geometry: { type: 'MultiLineString', coordinates: roads.filter((r) => r.properties.cls === cls).flatMap((r) => r.geometry.coordinates) },
}));
write('roads.json', merged);
