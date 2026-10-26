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
  Merceles: { top: 3, slope: 3, round: 3, spoiler: false, skirt: true },
  Iweko: { top: 4, slope: 3, round: 2, spoiler: false, skirt: false },
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

class Grid {
  px: (string | null)[] = new Array(W * H).fill(null);
  set(x: number, y: number, c: string) {
    if (x >= 0 && y >= 0 && x < W && y < H) this.px[y * W + x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < W && y < H ? this.px[y * W + x] : null;
  }
}

export function truckSvg(t: TruckLook): string {
  const r = createRng(hash(`${t.plate}|${t.brand}|${t.model}`));
  const base = SHAPES[t.brand] ?? SHAPES.MEN;
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
  const g = new Grid();

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
  const wheel = (cx: number) => {
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
  };
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

  // ── Kontur ──
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
  rects += `<rect x="4" y="${GROUND + 1}" width="38" height="1" fill="#000" fill-opacity=".28"/>`;
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
