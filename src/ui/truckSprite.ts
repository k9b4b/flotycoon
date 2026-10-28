import { createRng, pick, pickWeighted, rand } from '../engine/rng';

/**
 * Generator pikselowych ciągników siodłowych z boku (44×28), w parze z portretami kierowców.
 * Sylwetka kabiny zależy od marki (wysokość dachu, pochylenie przodu, zaokrąglenie, spojler),
 * lakier i dodatki od tablicy rejestracyjnej (stałe dla auta), a rdza, brud i wyblakły lakier od zużycia.
 * Nowe auta dostają połysk. Światło z lewej góry, ciągnik jedzie w prawo.
 */

export interface TruckLook {
  brand: string;
  model: string;
  plate: string;
  wear: number;
  condition?: 'new' | 'used';
}

const W = 44;
const H = 28;
const GROUND = 26;
const OUTLINE = '#15120f';
const TIRE = '#1d1f22';
const RIM = '#a7adb3';
const CHASSIS = '#2b2e33';
const GLASS = '#2c3e50';
const GLINT = '#8fb3cc';
const CHROME = '#c3c9cf';
const CHROME_SH = '#858c93';

interface CabShape {
  /** Górna krawędź dachu (y). */
  top: number;
  /** O ile pikseli cofa się przód na wysokości szyby. */
  slope: number;
  /** Zaokrąglenie przedniego narożnika dachu. */
  round: number;
  /** Wysoki spojler dachowy za kabiną. */
  spoiler: boolean;
  /** Osłony boczne między osiami. */
  skirt: boolean;
}

const SHAPES: Record<string, CabShape> = {
  Skania: { top: 3, slope: 1, round: 1, spoiler: false, skirt: false },
  Wolwo: { top: 2, slope: 2, round: 2, spoiler: false, skirt: false },
  MEN: { top: 4, slope: 2, round: 1, spoiler: false, skirt: false },
  DAFF: { top: 1, slope: 1, round: 0, spoiler: true, skirt: true },
  // Actros: wysoka, prawie pionowa kabina z płaską podłogą, lekko zaokrąglony dach, osłony boczne.
  Merceles: { top: 1, slope: 1, round: 2, spoiler: false, skirt: true },
  Iweko: { top: 4, slope: 3, round: 2, spoiler: false, skirt: false },
  Renolt: { top: 4, slope: 2, round: 1, spoiler: false, skirt: false },
  // Magnum: wysoka, prawie pionowa „szafa” z płaską podłogą.
  'Renolt Magnum': { top: 0, slope: 0, round: 0, spoiler: false, skirt: true },
};

const PAINTS = [
  { c: '#e6e6e1', w: 26 },
  { c: '#b8312f', w: 12 },
  { c: '#2f5d9e', w: 11 },
  { c: '#1f2f55', w: 9 },
  { c: '#2f6b45', w: 8 },
  { c: '#e0b52a', w: 6 },
  { c: '#d9661f', w: 6 },
  { c: '#26282c', w: 9 },
  { c: '#9aa3ab', w: 8 },
  { c: '#6e2230', w: 5 },
];
const ACCENTS = ['#b8312f', '#2f5d9e', '#e0b52a', '#26282c', '#d9661f', '#e6e6e1'];

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function shift(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `#${((1 << 24) | (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1)}`;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

/** Siatka pikseli; ox przesuwa rysowanie (ciągnik w zestawie stoi za naczepą). */
class Grid {
  px: (string | null)[];
  ox = 0;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: string) {
    x += this.ox;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  get(x: number, y: number) {
    x += this.ox;
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null;
  }
}

function wheelAt(g: Grid, cx: number, wear: number) {
  const rows = [
    [-1, 1],
    [-2, 2],
    [-3, 3],
    [-3, 3],
    [-3, 3],
    [-2, 2],
    [-1, 1],
  ];
  rows.forEach(([a, b], i) => {
    const y = GROUND - 6 + i;
    for (let x = cx + a; x <= cx + b; x++) g.set(x, y, TIRE);
  });
  for (let y = GROUND - 4; y <= GROUND - 2; y++) for (let x = cx - 1; x <= cx + 1; x++) g.set(x, y, wear > 0.6 ? '#7d746a' : RIM);
  g.set(cx, GROUND - 3, '#3a3e44');
  g.set(cx - 1, GROUND - 4, '#dfe3e6');
}

export function truckSvg(t: TruckLook): string {
  const g = new Grid(W, H);
  drawTruck(t, g);
  return finish(g, 4, 38);
}

function drawTruck(t: TruckLook, g: Grid) {
  const r = createRng(hash(`${t.plate}|${t.brand}|${t.model}`));
  const base = SHAPES[`${t.brand} ${t.model.split(' ')[0]}`] ?? SHAPES[t.brand] ?? SHAPES.MEN;
  // Wersje „S”, „XF”, „FH” i podobne mają wyższe kabiny; liczba w modelu nie zmienia sylwetki.
  const tall = /^S\b|XF|FH|S-Way/.test(t.model);
  const shape: CabShape = { ...base, top: Math.max(1, base.top - (tall ? 1 : 0)) };
  const fresh = t.condition === 'new';
  const wear = Math.max(0, Math.min(1, t.wear));
  let paint = pickWeighted(r, PAINTS, (p) => p.w).c;
  paint = mix(paint, '#8a8a84', wear * 0.35); // lakier płowieje
  const accent = pick(r, ACCENTS.filter((a) => a !== paint));
  const stripe = rand(r) < 0.5;
  const stack = rand(r) < 0.3; // pionowy wydech za kabiną

  const FRONT = 41; // przód kabiny (zderzak)
  const CAB_L = 24; // tył kabiny (z leżanką)
  const CAB_B = 20; // spód kabiny
  const FRONT_AXLE = 35;
  const REAR_AXLE = 12;

  // ── Rama, siodło, błotnik tylny ──
  for (let x = 3; x <= 40; x++) {
    g.set(x, 19, CHASSIS);
    g.set(x, 20, shift(CHASSIS, -0.2));
  }
  for (let x = 5; x <= 16; x++) g.set(x, 18, x <= 7 ? '#4a4f56' : '#3a3e44'); // siodło
  for (let x = 7; x <= 17; x++) g.set(x, 17, x === 7 ? '#23262b' : '#33373d'); // błotnik
  // ── Zbiornik albo osłona boczna ──
  for (let x = 17; x <= 24; x++)
    for (let y = 19; y <= 22; y++) {
      if (shape.skirt) g.set(x, y, y === 22 ? shift(paint, -0.35) : shift(paint, -0.15));
      else g.set(x, y, y === 19 ? CHROME : y === 22 ? CHROME_SH : x === 17 ? CHROME : '#a8afb6');
    }

  // ── Kabina ──
  const top = shape.top;
  for (let y = top; y <= CAB_B; y++) {
    const fromTop = y - top;
    // Przód: zaokrąglony narożnik dachu, potem pochylona szyba, niżej pionowy przód.
    let fx = FRONT;
    if (fromTop < shape.round) fx -= shape.round - fromTop + shape.slope;
    else if (fromTop < shape.round + 8) fx -= Math.max(0, shape.slope - Math.floor(((fromTop - shape.round) * shape.slope) / 8));
    let bx = CAB_L;
    if (fromTop === 0 && shape.round > 0) bx += 1; // lekko zaokrąglony tył dachu
    for (let x = bx; x <= fx; x++) {
      let c = paint;
      if (fromTop === 0) c = shift(paint, 0.25);
      else if (y >= 17) c = shift(paint, -0.18);
      if (x === fx) c = shift(c, -0.15);
      if (stripe && (y === top + 11 || y === top + 12)) c = y === top + 11 ? accent : shift(accent, -0.2);
      g.set(x, y, c);
    }
    // Szyba przednia widoczna z boku na pochyleniu.
    if (fromTop >= 1 && fromTop <= 7) g.set(fx, y, fromTop === 1 ? GLINT : GLASS);
  }
  // Spojler / wysoki dach za kabiną.
  if (shape.spoiler) {
    for (let y = top; y <= top + 5; y++) for (let x = CAB_L - 4; x < CAB_L; x++) if (x - (CAB_L - 4) >= Math.floor((top + 5 - y) * 0.8) - 1) g.set(x, y, shift(paint, y === top ? 0.2 : -0.12));
  }
  // Okno w drzwiach.
  const winX0 = FRONT - shape.slope - 8;
  const winX1 = FRONT - shape.slope - 2;
  for (let y = top + 2; y <= top + 7; y++)
    for (let x = winX0; x <= winX1; x++) g.set(x, y, (x === winX0 + 1 && y === top + 3) || (x === winX0 + 2 && y === top + 3) ? GLINT : y === top + 2 || x === winX0 ? '#3c5268' : GLASS);
  // Linia drzwi, klamka, stopnie.
  const doorL = winX0 - 1;
  for (let y = top + 2; y <= 18; y++) g.set(doorL, y, shift(paint, -0.3));
  g.set(winX1 - 1, top + 9, shift(paint, -0.45));
  g.set(winX1 - 2, top + 9, shift(paint, -0.45));
  for (let x = doorL + 1; x <= winX1; x++) g.set(x, 19, '#3a3e44');
  for (let x = doorL + 2; x <= doorL + 4; x++) g.set(x, 20, '#2b2e33');
  // Lusterko i daszek przeciwsłoneczny.
  for (let y = top + 2; y <= top + 5; y++) g.set(FRONT - shape.slope + 1, y, y === top + 5 ? '#3a3e44' : '#26282c');
  if (shape.round <= 1) for (let x = FRONT - 2; x <= FRONT; x++) g.set(x, top, shift(paint, -0.35));
  // Zderzak i reflektor.
  for (let y = 18; y <= 20; y++) {
    g.set(FRONT, y, '#2b2e33');
    g.set(FRONT - 1, y, y === 20 ? '#2b2e33' : '#3a3e44');
  }
  g.set(FRONT, 16, '#ffe9a8');
  g.set(FRONT, 17, '#f2c75c');
  g.set(FRONT - 1, 16, '#f2c75c');
  // Znaczek marki na kabinie.
  g.set(CAB_L + 2, top + 3, shift(paint, paint === '#e6e6e1' ? -0.5 : 0.5));
  g.set(CAB_L + 3, top + 3, shift(paint, paint === '#e6e6e1' ? -0.4 : 0.4));
  // Wydech.
  if (stack) for (let y = top + 1; y <= 18; y++) g.set(CAB_L - 1, y, y === top + 1 ? '#555b62' : y % 3 === 0 ? CHROME_SH : CHROME);

  // ── Rdza i brud ──
  const rust = Math.round(wear * wear * 30);
  for (let i = 0; i < rust; i++) {
    const x = CAB_L + Math.floor(rand(r) * (FRONT - CAB_L));
    const y = top + 9 + Math.floor(rand(r) * (CAB_B - top - 9));
    const c = g.get(x, y);
    if (c && c !== GLASS && c !== GLINT) g.set(x, y, rand(r) < 0.5 ? '#8a4b22' : '#a8602b');
  }
  if (wear > 0.4)
    for (let x = CAB_L; x <= FRONT; x++) {
      const c = g.get(x, CAB_B);
      if (c) g.set(x, CAB_B, mix(c, '#6b5a45', 0.5));
    }

  // ── Koła (z wnęką nad przednim) ──
  const wheel = (cx: number) => wheelAt(g, cx, wear);

  for (let x = FRONT_AXLE - 4; x <= FRONT_AXLE + 4; x++) for (let y = 18; y <= 20; y++) if (!(y === 18 && (x === FRONT_AXLE - 4 || x === FRONT_AXLE + 4))) g.set(x, y, '#121316');
  wheel(FRONT_AXLE);
  wheel(REAR_AXLE);

  // ── Połysk nowego auta ──
  if (fresh) {
    g.set(CAB_L + 3, top + 1, '#ffffff');
    g.set(CAB_L + 4, top + 1, '#ffffff');
    g.set(CAB_L + 1, top + 1, shift(paint, 0.5));
    const sx = CAB_L - 3;
    const sy = top + 1;
    g.set(sx, sy - 1, '#fff6c8');
    g.set(sx - 1, sy, '#fff6c8');
    g.set(sx, sy, '#ffffff');
    g.set(sx + 1, sy, '#fff6c8');
    g.set(sx, sy + 1, '#fff6c8');
  }

}

/** Kontur, cień i zamiana siatki na SVG (pasy pikseli w jednym kolorze to jeden prostokąt). */
function finish(g: Grid, shadowX: number, shadowW: number): string {
  g.ox = 0;
  const W = g.w;
  const add: [number, number][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (g.get(x, y)) continue;
      const near = [g.get(x - 1, y), g.get(x + 1, y), g.get(x, y - 1), g.get(x, y + 1)].some((c) => c && c !== '#fff6c8' && c !== '#ffffff');
      if (near) add.push([x, y]);
    }
  for (const [x, y] of add) g.set(x, y, OUTLINE);

  let rects = '';
  // Cień na drodze.
  rects += `<rect x="${shadowX}" y="${GROUND + 1}" width="${shadowW}" height="1" fill="#000" fill-opacity=".28"/>`;
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = g.get(x, y);
      if (!c) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < W && g.get(x + run, y) === c) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${c}"/>`;
      x += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects}</svg>`;
}

// ─── Zestaw: naczepa za ciągnikiem ──────────────────────────────────────────

export type RigTrailer = { type: 'curtain' | 'reefer' | 'adr' | 'lowbed'; wear: number; label: string };

/** Naczepa jest skrócona względem prawdziwej (ok. 1,5× ciągnika zamiast 2,2×), żeby karta nie była za szeroka. */
const TRAILER_L = 64;
/** Przesunięcie ciągnika: przód naczepy (x = 64) wypada tuż za kabiną (x ciągnika 24). */
const RIG_OX = 43;
export const RIG_W = RIG_OX + W;

const CURTAIN_PAINTS = ['#3f6496', '#2f6b45', '#8a2b2b', '#5b6670', '#c9a227', '#2b3a55', '#d4d7da'];

function drawTrailer(g: Grid, tr: RigTrailer) {
  const r = createRng(hash(tr.label + tr.type));
  const wear = Math.max(0, Math.min(1, tr.wear));
  const FRAME = '#2a2e35';
  const F = TRAILER_L; // przód
  const axles = [9, 16, 23];
  const chassis = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x++) g.set(x, y, CHASSIS);
  };
  const legs = () => {
    for (let y = 19; y <= 23; y++) g.set(46, y, '#3a3e44');
    for (let x = 45; x <= 47; x++) g.set(x, 24, '#2b2e33');
  };
  const tail = () => {
    for (let x = 1; x <= 4; x++) g.set(x, 20, '#3a3e44');
    g.set(0, 15, '#e0533f');
    g.set(0, 16, '#b8312f');
  };
  const guards = () => {
    for (let x = 4; x <= 28; x++) g.set(x, 19, x % 7 === 5 ? '#121316' : '#26282c');
  };

  if (tr.type === 'curtain' || tr.type === 'reefer') {
    const reefer = tr.type === 'reefer';
    const paint = reefer ? '#e6ebf0' : mix(pick(r, CURTAIN_PAINTS), '#8a8a84', wear * 0.3);
    const top = 3;
    for (let y = top; y <= 17; y++)
      for (let x = 0; x <= F; x++) {
        let c = paint;
        if (y === top) c = reefer ? '#b7c0c8' : FRAME;
        else if (y === 17) c = reefer ? '#9aa3ac' : FRAME;
        else if (x === 0 || x === F) c = reefer ? '#b7c0c8' : FRAME;
        else if (!reefer && x % 4 === 2) c = shift(paint, -0.16); // fałdy firanki
        else if (!reefer && y === top + 1) c = shift(paint, 0.15);
        else if (reefer && x % 8 === 4) c = '#d3dae0'; // przetłoczenia izotermy
        g.set(x, y, c);
      }
    if (reefer) {
      const acc = pick(r, ['#4f8fd6', '#2f9e6b', '#d9661f', '#b8312f']);
      for (let x = 6; x <= F - 6; x++) {
        g.set(x, 9, acc);
        g.set(x, 10, shift(acc, -0.2));
      }
      // agregat na ścianie czołowej
      for (let y = 5; y <= 12; y++) for (let x = F + 1; x <= F + 2; x++) g.set(x, y, y % 2 ? '#8d969f' : '#5d646c');
    } else {
      // napinacze firanki przy dole
      for (let x = 3; x <= F - 2; x += 4) g.set(x, 16, shift(paint, -0.3));
    }
    chassis(2, F - 2, 18);
    guards();
    legs();
    tail();
  } else if (tr.type === 'adr') {
    const rows: [number, number, number, string][] = [
      [4, 10, F - 10, '#8b929c'], // pomost
      [5, 4, F - 4, '#eef1f5'],
      [6, 3, F - 3, '#dde2e8'],
      [7, 2, F - 2, '#cdd2d9'],
      [8, 2, F - 2, '#c9ced6'],
      [9, 2, F - 2, '#c9ced6'],
      [10, 2, F - 2, '#c4c9d1'],
      [11, 2, F - 2, '#bfc5cd'],
      [12, 2, F - 2, '#b8bec7'],
      [13, 2, F - 2, '#b0b7c0'],
      [14, 2, F - 2, '#a6adb7'],
      [15, 3, F - 3, '#9aa2ac'],
      [16, 4, F - 4, '#8b929c'],
    ];
    for (const [y, x0, x1, c] of rows) for (let x = x0; x <= x1; x++) g.set(x, y, c);
    for (const bx of [17, 32, 47]) for (let y = 5; y <= 16; y++) g.set(bx, y, '#a2a9b3');
    for (let x = 12; x <= F - 12; x += 6) g.set(x, 3, '#8b929c'); // barierki
    for (let x = 2; x <= F - 2; x++) g.set(x, 17, FRAME);
    for (let y = 9; y <= 11; y++) for (let x = 3; x <= 6; x++) g.set(x, y, y === 9 || y === 11 ? '#c96a12' : '#f28c28'); // tablica ADR
    for (let x = 22; x <= 27; x++) g.set(x, 17, '#3a3e44'); // skrzynka zaworów
    chassis(2, F - 2, 18);
    guards();
    legs();
    tail();
  } else {
    const Y = '#d9a520';
    const YH = '#f0c24a';
    // łabędzia szyja nad siodłem
    for (let y = 12; y <= 17; y++) for (let x = 46; x <= F; x++) g.set(x, y, y === 12 ? YH : y === 17 ? shift(Y, -0.25) : Y);
    for (let y = 14; y <= 19; y++) for (let x = 42; x <= 45; x++) if (x - 42 >= (19 - y) * 0.6) g.set(x, y, y === 14 ? YH : Y);
    // niski pokład
    for (let x = 1; x <= 45; x++) {
      g.set(x, 18, YH);
      g.set(x, 19, Y);
    }
    for (let x = 6; x <= 40; x += 5) g.set(x, 19, shift(Y, -0.3));
    for (let y = 15; y <= 17; y++) g.set(1, y, y % 2 ? '#e0533f' : '#f2f2f2'); // oznakowanie gabarytu
    g.set(0, 16, '#e0533f');
  }
  for (const a of axles) wheelAt(g, a, wear);
  // brud i rdza z wiekiem
  if (wear > 0.4)
    for (let x = 1; x < F; x++) {
      const c = g.get(x, 16);
      if (c && rand(r) < wear - 0.2) g.set(x, 16, mix(c, '#6b5a45', 0.45));
    }
  const rust = Math.round(wear * wear * 18);
  for (let i = 0; i < rust; i++) {
    const x = 2 + Math.floor(rand(r) * (F - 4));
    const y = 13 + Math.floor(rand(r) * 4);
    if (g.get(x, y)) g.set(x, y, rand(r) < 0.5 ? '#8a4b22' : '#a8602b');
  }
}

/** Cały zestaw z boku: naczepa i ciągnik (RIG_W×28). Bez naczepy sam ciągnik na tej samej szerokości. */
export function rigSvg(t: TruckLook, tr: RigTrailer | null): string {
  const g = new Grid(RIG_W, H);
  if (tr) drawTrailer(g, tr);
  g.ox = RIG_OX;
  drawTruck(t, g);
  const svg = finish(g, tr ? 1 : RIG_OX + 4, tr ? RIG_W - 3 : 38);
  if (tr) return svg;
  // Pusty zestaw: przerywany zarys naczepy, żeby brak był widoczny na pierwszy rzut oka.
  let ghost = '';
  for (let x = 1; x <= TRAILER_L; x += 3) ghost += `<rect x="${x}" y="3" width="2" height="1"/><rect x="${x}" y="17" width="2" height="1"/>`;
  for (let y = 3; y <= 17; y += 3) ghost += `<rect x="0" y="${y}" width="1" height="2"/><rect x="${TRAILER_L}" y="${y}" width="1" height="2"/>`;
  return svg.replace('</svg>', `<g fill="#8a919b" fill-opacity=".45">${ghost}</g></svg>`);
}

export const TRAILER_W = TRAILER_L + 3;

/** Sama naczepa w tym samym stylu co zestaw (na rynek i listę naczep). */
export function trailerOnlySvg(tr: RigTrailer): string {
  const g = new Grid(TRAILER_W, H);
  drawTrailer(g, tr);
  return finish(g, 1, TRAILER_W - 2);
}
