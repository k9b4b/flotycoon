import { createRng, pick, pickWeighted, rand, type RngState } from '../engine/rng';
import type { Driver } from '../engine/types';

/**
 * Generator pikselowych portretów kierowców (32×32), w duchu portretów z ETS2:
 * dorosłe proporcje, szczęka, zarost, zakola, zmarszczki, robocze ciuchy.
 * Wszystko z kodu, bez plików graficznych. Wygląd jest stały dla osoby (ziarno z imienia,
 * nazwiska i ksywki), a mina, brwi i cienie pod oczami zmieniają się z morale.
 * Światło pada z lewej góry: prawa strona i spód kształtów są w cieniu.
 */

const S = 32;
const CX = 16; // twarz rozciąga się od CX - hw do CX + hw - 1
const OUTLINE = '#15120f';

type Skin = { base: string; shade: string; deep: string; hi: string };
type Hair = { base: string; shade: string; hi: string };

const SKINS: { s: Skin; w: number }[] = [
  { s: { base: '#f0c6a2', shade: '#d69f7b', deep: '#b27a5b', hi: '#f8dcc2' }, w: 40 },
  { s: { base: '#e3ae88', shade: '#c78d69', deep: '#a26b4c', hi: '#efc6a6' }, w: 34 },
  { s: { base: '#c68b60', shade: '#a56d48', deep: '#835138', hi: '#d8a37a' }, w: 14 },
  { s: { base: '#a56e48', shade: '#875436', deep: '#683d27', hi: '#ba845e' }, w: 8 },
  { s: { base: '#78492f', shade: '#5d3723', deep: '#432619', hi: '#8d5b3d' }, w: 4 },
];

const HAIRS: Hair[] = [
  { base: '#2b2522', shade: '#1a1614', hi: '#4a433d' },
  { base: '#4a3023', shade: '#331f17', hi: '#6c4936' },
  { base: '#6e4a30', shade: '#4f3422', hi: '#906548' },
  { base: '#9c7c50', shade: '#79603e', hi: '#bb9a6b' },
  { base: '#c4a168', shade: '#9e804e', hi: '#dcbd8a' },
  { base: '#94462a', shade: '#72331c', hi: '#b5603d' },
];
const GRAY_HAIRS: Hair[] = [
  { base: '#9c9a97', shade: '#77746f', hi: '#c2c0bb' },
  { base: '#c9c7c2', shade: '#a19e98', hi: '#e6e4df' },
  { base: '#6f6a66', shade: '#504c49', hi: '#8f8a85' },
];
const IRIS = ['#3b2a20', '#3e5d73', '#4b5c3a', '#2a2522', '#5a4630'];
const SCLERA = '#e9e3d8';

type Top = 'tshirt' | 'polo' | 'flannel' | 'hivis' | 'jacket' | 'hoodie';
const TSHIRT = ['#2c3e63', '#5f6670', '#8e2a2a', '#2f5d3a', '#22252b', '#cfcfc8', '#7a5a2a'];
const FLANNEL = [
  ['#a3322c', '#4f1512'],
  ['#2f4f86', '#16264a'],
  ['#3c6b3a', '#1d361d'],
  ['#8a6a2c', '#3f2f12'],
];
const HIVIS = ['#ff7a1a', '#cddc1e'];
const JACKET = ['#1f2a44', '#1c1d21', '#4a5233', '#5b3a25', '#3b4148'];
const CAP = ['#1f2a44', '#8e2a2a', '#2f5d3a', '#22252b', '#c9a227', '#5f6670'];

// ─── Narzędzia ───────────────────────────────────────────────────────────────

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
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

class Grid {
  px: (string | null)[] = new Array(S * S).fill(null);
  set(x: number, y: number, c: string) {
    if (x >= 0 && y >= 0 && x < S && y < S) this.px[y * S + x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < S && y < S ? this.px[y * S + x] : null;
  }
  row(y: number, x0: number, x1: number, c: string | ((x: number) => string)) {
    for (let x = x0; x <= x1; x++) this.set(x, y, typeof c === 'string' ? c : c(x));
  }
}

// ─── Kształt twarzy ─────────────────────────────────────────────────────────

interface FaceShape {
  /** Połowa szerokości dla wiersza y (0 = brak twarzy). */
  hw: (y: number) => number;
  W: number;
}

function faceShape(W: number, J: number, C: number): FaceShape {
  const rows: Record<number, number> = { 8: W - 3, 9: W - 2, 10: W - 1, 20: W - 1, 21: J + 1, 22: J + 1, 23: J, 24: C };
  for (let y = 11; y <= 19; y++) rows[y] = W;
  return { W, hw: (y) => rows[y] ?? 0 };
}

// ─── Portret ────────────────────────────────────────────────────────────────

type HairStyle = 'crew' | 'sidepart' | 'receding' | 'bald' | 'buzz' | 'mullet' | 'curly' | 'long' | 'bob' | 'pony' | 'bun';
type Mood = 'happy' | 'smile' | 'neutral' | 'tired' | 'sad' | 'angry';

export function portraitSvg(d: Driver): string {
  const seed = hash(`${d.firstName}|${d.lastName}|${d.nickname}|${d.quirk}`);
  const r = createRng(seed);
  const perks = d.perks ?? [];
  const female = d.female;
  const old = d.stats.experience >= 80 || d.nickname === 'Dziadek' || rand(r) < 0.15;
  const skin = pickWeighted(r, SKINS, (x) => x.w).s;
  const hairC = old ? pick(r, GRAY_HAIRS) : pick(r, HAIRS);
  const iris = pick(r, IRIS);
  const W = female ? (rand(r) < 0.6 ? 6 : 7) : 7;
  const J = female ? 4 : pick(r, [4, 5, 5, 6]);
  const face = faceShape(W, J, female ? 2 : J >= 5 ? 3 : 2);

  const hairStyle: HairStyle = female
    ? pick(r, ['long', 'long', 'bob', 'pony', 'bun', 'sidepart'] as const)
    : old
      ? pick(r, ['receding', 'receding', 'bald', 'crew', 'sidepart', 'buzz'] as const)
      : pick(r, ['crew', 'crew', 'sidepart', 'buzz', 'mullet', 'curly', 'receding'] as const);
  const facial = female
    ? 'none'
    : pickWeighted(
        r,
        [
          { v: 'none', w: 18 },
          { v: 'stubble', w: 30 },
          { v: 'moustache', w: 26 },
          { v: 'beard', w: 14 },
          { v: 'goatee', w: 8 },
          { v: 'moustache+stubble', w: 14 },
        ],
        (x) => x.w,
      ).v;
  const hat = rand(r) < (old ? 0.3 : 0.22) ? (rand(r) < 0.65 ? 'cap' : 'beanie') : null;
  const capColor = pick(r, CAP);
  const top: Top = pickWeighted(
    r,
    [
      { v: 'tshirt' as Top, w: 18 },
      { v: 'polo' as Top, w: 14 },
      { v: 'flannel' as Top, w: 22 },
      { v: 'hivis' as Top, w: 16 },
      { v: 'jacket' as Top, w: 18 },
      { v: 'hoodie' as Top, w: 12 },
    ],
    (x) => x.w,
  ).v;
  const topColor = pick(r, TSHIRT);
  const flannel = pick(r, FLANNEL);
  const hivis = pick(r, HIVIS);
  const jacket = pick(r, JACKET);
  const glassesRoll = rand(r);
  const glasses = perks.includes('pirat') && glassesRoll < 0.7 ? 'shades' : (perks.includes('teczka') && glassesRoll < 0.8) || glassesRoll < 0.12 ? 'glasses' : null;
  const chain = !female && rand(r) < 0.12;
  const earring = female && rand(r) < 0.5;
  const bigNose = rand(r) < 0.35;
  const mood = moodFor(d, createRng(seed ^ 0x9e3779b9));

  const g = new Grid();
  drawTorso(g, top, { topColor, flannel, hivis, jacket }, skin);
  drawNeck(g, skin, top);
  if (chain) for (let x = 13; x <= 18; x++) if ((x + 1) % 2 === 0 || x === 13 || x === 18) g.set(x, 26, x % 2 ? '#d9a521' : '#a87a12');
  if (hairStyle === 'long' || hairStyle === 'mullet') drawBackHair(g, hairStyle, hairC, face);
  drawFace(g, face, skin, old);
  drawEars(g, face, skin, earring);
  drawEyes(g, iris, mood, female, skin, old);
  drawBrows(g, female ? hairC.shade : shift(hairC.shade, -0.15), mood, female);
  drawNose(g, skin, bigNose);
  drawFacialHair(g, facial, hairC, skin, face);
  drawMouth(g, mood, skin, female, facial);
  drawHair(g, hairStyle, hairC, face, skin, !!hat, female);
  if (hat) drawHat(g, hat, capColor, face);
  if (glasses) drawGlasses(g, glasses);
  outline(g);
  return toSvg(g);
}

function moodFor(d: Driver, r: RngState): Mood {
  const perks = d.perks ?? [];
  const m = d.stats.morale + (perks.includes('optymista') ? 10 : 0) - (perks.includes('maruda') ? 10 : 0);
  if (m < 35) return perks.includes('narwany') ? 'angry' : pick(r, ['sad', 'tired'] as const);
  if (m < 50) return pick(r, ['tired', 'neutral', perks.includes('narwany') ? 'angry' : 'neutral'] as const);
  if (m < 70) return pick(r, ['neutral', 'smile'] as const);
  return pick(r, ['smile', 'happy'] as const);
}

// ─── Warstwy ────────────────────────────────────────────────────────────────

function drawTorso(
  g: Grid,
  top: Top,
  c: { topColor: string; flannel: string[]; hivis: string; jacket: string },
  skin: Skin,
) {
  const spans: Record<number, [number, number]> = { 26: [10, 21], 27: [6, 25], 28: [4, 27], 29: [2, 29], 30: [2, 29], 31: [2, 29] };
  const base =
    top === 'flannel' ? c.flannel[0] : top === 'hivis' ? '#3d434b' : top === 'jacket' ? c.jacket : top === 'hoodie' ? shift(c.topColor, -0.05) : c.topColor;
  for (const [ys, [x0, x1]] of Object.entries(spans)) {
    const y = Number(ys);
    g.row(y, x0, x1, (x) => {
      let col = base;
      if (top === 'flannel') {
        const v = x % 4 === 0;
        const h = y % 4 === 1;
        col = v && h ? shift(c.flannel[1], -0.2) : v || h ? c.flannel[1] : c.flannel[0];
      }
      if (x >= x1 - 4) col = shift(col, -0.22); // cień z prawej
      else if (x <= x0 + 2 && y <= 28) col = shift(col, 0.12); // światło na lewym ramieniu
      return col;
    });
  }
  if (top === 'hivis') {
    for (let y = 27; y <= 31; y++) {
      const [x0, x1] = spans[y];
      g.row(y, x0, 12, (x) => (y === 30 ? '#d9dee2' : x === 12 ? shift(c.hivis, -0.2) : c.hivis));
      g.row(y, 19, x1, (x) => (y === 30 ? '#b9bfc4' : x >= x1 - 4 ? shift(c.hivis, -0.22) : x === 19 ? shift(c.hivis, -0.1) : c.hivis));
    }
    g.row(26, 9, 11, c.hivis);
    g.row(26, 20, 22, shift(c.hivis, -0.15));
  }
  if (top === 'polo') {
    g.row(26, 11, 13, shift(c.topColor, 0.25));
    g.row(26, 18, 20, shift(c.topColor, 0.1));
    for (let y = 27; y <= 29; y++) g.set(16, y, shift(c.topColor, -0.3));
    g.set(16, 28, shift(c.topColor, 0.35));
  }
  if (top === 'jacket') {
    for (let y = 27; y <= 31; y++) g.set(16, y, '#9aa0a6');
    g.row(25, 11, 12, shift(c.jacket, 0.15));
    g.row(25, 19, 20, shift(c.jacket, -0.1));
    g.row(26, 10, 12, shift(c.jacket, 0.15));
    g.row(26, 19, 21, shift(c.jacket, -0.1));
  }
  if (top === 'hoodie') {
    g.row(25, 10, 12, shift(c.topColor, 0.08));
    g.row(25, 19, 21, shift(c.topColor, -0.2));
    for (let y = 27; y <= 29; y++) {
      g.set(14, y, '#e6e2da');
      g.set(17, y, '#c9c5bd');
    }
  }
  void skin;
}

function drawNeck(g: Grid, skin: Skin, top: Top) {
  for (let y = 21; y <= 25; y++) g.row(y, 12, 19, (x) => (x >= 18 ? skin.deep : skin.shade));
  // Dekolt: U przy koszulce, V przy flaneli i polo, prawie nic przy kurtce.
  const open: Record<Top, [number, number][]> = {
    tshirt: [[13, 18], [14, 17]],
    polo: [[14, 17], [15, 15]],
    flannel: [[13, 18], [14, 17], [15, 16]],
    hivis: [[13, 18], [14, 17]],
    jacket: [[14, 17]],
    hoodie: [[13, 18]],
  };
  open[top].forEach(([x0, x1], i) => g.row(26 + i, x0, x1, (x) => (x >= 17 ? skin.shade : skin.base)));
}

function drawFace(g: Grid, f: FaceShape, skin: Skin, old: boolean) {
  for (let y = 8; y <= 24; y++) {
    const hw = f.hw(y);
    if (!hw) continue;
    const x0 = CX - hw;
    const x1 = CX + hw - 1;
    g.row(y, x0, x1, (x) => {
      if (x >= x1 - 1 || y >= 23) return skin.shade; // prawa strona i spód szczęki
      if (y === 22 && x >= x1 - 3) return skin.shade;
      return skin.base;
    });
  }
  // Światło: czoło i lewy policzek.
  g.row(10, 11, 13, skin.hi);
  g.set(10, 17, skin.hi);
  g.set(10, 18, skin.hi);
  // Cień pod szczęką na szyi.
  g.row(25, 13, 18, skin.deep);
  if (old) {
    g.row(11, 13, 17, skin.shade); // zmarszczka na czole
    g.set(13, 19, skin.shade);
    g.set(13, 20, skin.shade);
    g.set(18, 19, skin.deep);
    g.set(18, 20, skin.deep);
    g.set(10, 15, skin.shade); // kurze łapki
    g.set(21, 15, skin.deep);
  }
}

function drawEars(g: Grid, f: FaceShape, skin: Skin, earring: boolean) {
  const l = CX - f.W - 1;
  const rgt = CX + f.W;
  for (let y = 15; y <= 18; y++) {
    g.set(l, y, y === 16 || y === 17 ? skin.shade : skin.base);
    g.set(rgt, y, y === 16 || y === 17 ? skin.deep : skin.shade);
  }
  if (earring) {
    g.set(l, 19, '#e0b23a');
    g.set(rgt, 19, '#b88d22');
  }
}

function drawEyes(g: Grid, iris: string, mood: Mood, female: boolean, skin: Skin, old: boolean) {
  const lid = mood === 'tired' || mood === 'sad';
  // Lewe oko: białko na zewnątrz, tęczówka bliżej nosa; prawe lustrzanie.
  g.set(12, 15, lid ? skin.shade : SCLERA);
  g.set(13, 15, iris);
  g.set(18, 15, iris);
  g.set(19, 15, lid ? skin.deep : SCLERA);
  // Powieka i cień oczodołu.
  g.row(14, 12, 13, skin.shade);
  g.row(14, 18, 19, skin.deep);
  if (female) {
    g.set(11, 14, '#2a2522');
    g.set(20, 14, '#2a2522');
    g.set(11, 15, '#2a2522');
    g.set(20, 15, '#2a2522');
  }
  if (lid || old) {
    g.row(16, 12, 13, skin.shade);
    g.row(16, 18, 19, skin.deep);
  }
}

function drawBrows(g: Grid, color: string, mood: Mood, female: boolean) {
  const len = female ? 2 : 3;
  const yL = (x: number) => {
    if (mood === 'angry') return x === 13 ? 14 : 13;
    if (mood === 'sad' || mood === 'tired') return x === 13 ? 12 : 13;
    return 13;
  };
  for (let i = 0; i < len; i++) {
    const xl = 13 - i;
    const xr = 18 + i;
    g.set(xl, yL(xl), color);
    g.set(xr, yL(13 - i), color);
  }
}

function drawNose(g: Grid, skin: Skin, big: boolean) {
  g.set(16, 16, skin.shade);
  g.set(16, 17, skin.shade);
  g.set(15, 17, skin.hi);
  g.set(big ? 13 : 14, 18, skin.deep);
  g.set(big ? 18 : 17, 18, skin.deep);
  if (big) {
    g.set(14, 18, skin.shade);
    g.set(17, 18, skin.shade);
  }
  g.row(18, 15, 16, skin.base);
  g.row(19, 15, 16, skin.shade);
}

function drawFacialHair(g: Grid, kind: string, hair: Hair, skin: Skin, f: FaceShape) {
  if (kind === 'none') return;
  const stubble = mix(skin.shade, hair.shade, 0.55);
  const stubbleR = mix(skin.deep, hair.shade, 0.55);
  if (kind.includes('stubble') || kind === 'beard') {
    for (let y = 19; y <= 24; y++) {
      const hw = f.hw(y);
      for (let x = CX - hw; x <= CX + hw - 1; x++) {
        const right = x >= CX + hw - 2;
        if (kind === 'beard') g.set(x, y, right ? hair.shade : (x + y) % 3 === 0 ? hair.hi : hair.base);
        else if ((x + y) % 2 === 0 && y >= 20) g.set(x, y, right ? stubbleR : stubble);
      }
    }
    if (kind === 'beard') {
      // Policzki i baki.
      for (let y = 16; y <= 18; y++) {
        g.set(CX - f.W, y, hair.base);
        g.set(CX + f.W - 1, y, hair.shade);
      }
    }
  }
  if (kind.includes('moustache') || kind === 'beard') {
    g.row(20, 13, 18, (x) => (x >= 17 ? hair.shade : hair.base));
    g.set(13, 21, hair.base);
    g.set(18, 21, hair.shade);
  }
  if (kind === 'goatee') {
    g.row(20, 14, 17, (x) => (x >= 17 ? hair.shade : hair.base));
    g.row(23, 14, 17, hair.base);
    g.row(24, 15, 16, hair.shade);
    g.set(14, 22, hair.base);
    g.set(17, 22, hair.shade);
  }
}

function drawMouth(g: Grid, mood: Mood, skin: Skin, female: boolean, facial: string) {
  const lip = female ? mix(skin.deep, '#b04848', 0.45) : skin.deep;
  const y = 21;
  if (mood === 'happy') {
    g.row(y, 14, 17, '#efe9df');
    g.set(13, y, lip);
    g.set(18, y, lip);
    g.row(22, 14, 17, lip);
  } else if (mood === 'smile') {
    g.row(y, 14, 17, lip);
    g.set(13, 20, facial.includes('moustache') || facial === 'beard' ? g.get(13, 20)! : lip);
    g.set(18, 20, facial.includes('moustache') || facial === 'beard' ? g.get(18, 20)! : lip);
  } else if (mood === 'sad' || mood === 'angry') {
    g.row(y, 14, 17, lip);
    g.set(13, 22, lip);
    g.set(18, 22, lip);
  } else {
    g.row(y, 14, 17, lip);
  }
  if (female) g.row(22, 15, 16, mix(lip, skin.base, 0.4));
}

function drawBackHair(g: Grid, style: HairStyle, h: Hair, f: FaceShape) {
  const l = CX - f.W - 2;
  const rgt = CX + f.W + 1;
  const bottom = style === 'long' ? 29 : 23;
  for (let y = 12; y <= bottom; y++) {
    g.row(y, l, l + 1, (x) => (x === l ? h.base : h.hi));
    g.row(y, rgt - 1, rgt, h.shade);
  }
}

function drawHair(g: Grid, style: HairStyle, h: Hair, f: FaceShape, skin: Skin, hat: boolean, female: boolean) {
  const W = f.W;
  const L = CX - W;
  const R = CX + W - 1;
  const put = (x: number, y: number, edgeRight: boolean, bottom: boolean) =>
    g.set(x, y, edgeRight || bottom ? h.shade : y <= 7 && x >= CX - 4 && x <= CX - 2 ? h.hi : h.base);

  // Czaszka nad czołem: wspólna dla prawie wszystkich fryzur.
  const skullHw: Record<number, number> = { 5: W - 4, 6: W - 2, 7: W - 1, 8: W, 9: W, 10: W };
  const dome = (yTop: number, yBottom: number, extra = 0) => {
    for (let y = yTop; y <= yBottom; y++) {
      const hw = (skullHw[y] ?? W) + extra;
      for (let x = CX - hw; x <= CX + hw - 1; x++) put(x, y, x >= CX + hw - 2, y === yBottom);
    }
  };
  const sideburns = (to: number) => {
    for (let y = 11; y <= to; y++) {
      put(L, y, false, false);
      put(R, y, true, false);
    }
  };

  if (hat) {
    // Pod czapką widać tylko boki.
    if (style !== 'bald') sideburns(style === 'long' || style === 'bob' ? 20 : 14);
    if (style === 'long' || style === 'bob') for (let y = 11; y <= 20; y++) put(L + 1, y, false, false);
    return;
  }

  switch (style) {
    case 'crew':
      dome(5, 10, 0);
      sideburns(14);
      break;
    case 'sidepart':
      dome(5, 10, 0);
      g.row(11, L, CX - 1, (x) => (x === CX - 1 ? h.shade : h.base)); // grzywka na bok
      g.set(CX + 2, 6, h.shade);
      g.set(CX + 2, 7, h.shade);
      sideburns(female ? 19 : 14);
      break;
    case 'buzz':
      for (let y = 6; y <= 10; y++) {
        const hw = skullHw[y] ?? W;
        for (let x = CX - hw; x <= CX + hw - 1; x++) g.set(x, y, (x + y) % 2 ? mix(skin.shade, h.shade, 0.6) : mix(skin.base, h.base, 0.5));
      }
      sideburns(13);
      break;
    case 'mullet':
      dome(5, 10, 0);
      sideburns(15);
      break;
    case 'curly':
      for (let y = 4; y <= 10; y++) {
        const hw = (skullHw[y] ?? W) + (y >= 6 && y <= 9 ? 1 : 0);
        for (let x = CX - hw; x <= CX + hw - 1; x++) {
          const edge = x === CX - hw || x === CX + hw - 1 || y === 4;
          if (edge && (x + y) % 2) continue; // poszarpany brzeg
          g.set(x, y, (x * 3 + y) % 4 === 0 ? h.hi : x >= CX + hw - 2 || y === 10 ? h.shade : h.base);
        }
      }
      sideburns(14);
      break;
    case 'receding': {
      // Zakola: włosy z tyłu i po bokach, czubek głowy łysieje.
      for (let y = 6; y <= 10; y++) {
        const hw = skullHw[y] ?? W;
        for (let x = CX - hw; x <= CX + hw - 1; x++) {
          const fromEdge = Math.min(x - (CX - hw), CX + hw - 1 - x);
          const bald = y >= 8 && fromEdge >= 2 && !(x >= CX - 1 && x <= CX && y === 8);
          if (bald) g.set(x, y, y === 8 ? skin.hi : skin.base);
          else put(x, y, x >= CX + hw - 2, false);
        }
      }
      g.set(CX - 3, 9, skin.hi);
      sideburns(14);
      break;
    }
    case 'bald':
      for (let y = 6; y <= 10; y++) {
        const hw = skullHw[y] ?? W;
        g.row(y, CX - hw, CX + hw - 1, (x) => (x >= CX + hw - 2 ? skin.shade : y <= 7 && x <= CX - 2 ? skin.hi : skin.base));
      }
      for (let y = 11; y <= 14; y++) {
        g.set(L, y, mix(skin.shade, h.base, 0.6));
        g.set(R, y, mix(skin.deep, h.shade, 0.6));
      }
      break;
    case 'long':
    case 'bob':
      dome(5, 10, 1);
      g.row(11, L, L + 3, h.base); // grzywka
      g.row(12, L, L + 1, h.base);
      for (let y = 11; y <= (style === 'long' ? 22 : 19); y++) {
        put(L - 1, y, false, false);
        put(R + 1, y, true, false);
        if (y <= 18) {
          put(L, y, false, false);
          put(R, y, true, false);
        }
      }
      break;
    case 'pony':
      dome(5, 10, 0);
      sideburns(14);
      for (let y = 9; y <= 19; y++) put(R + 2, y, true, false); // kucyk z tyłu
      put(R + 1, 9, true, false);
      break;
    case 'bun':
      dome(5, 10, 0);
      sideburns(15);
      g.row(2, CX - 2, CX + 1, h.base);
      g.row(3, CX - 3, CX + 2, (x) => (x >= CX + 1 ? h.shade : h.base));
      g.row(4, CX - 2, CX + 1, h.shade);
      break;
  }
}

function drawHat(g: Grid, kind: string, color: string, f: FaceShape) {
  const W = f.W;
  const hwAt: Record<number, number> = { 4: W - 4, 5: W - 2, 6: W - 1, 7: W, 8: W, 9: W };
  const shade = shift(color, -0.3);
  if (kind === 'cap') {
    for (let y = 4; y <= 9; y++) {
      const hw = hwAt[y];
      g.row(y, CX - hw, CX + hw - 1, (x) => (x >= CX + hw - 2 ? shade : y === 5 && x <= CX - 2 ? shift(color, 0.2) : color));
    }
    g.row(7, CX - 1, CX, '#e8e2d6'); // logo
    g.row(10, CX - W - 1, CX + W, (x) => (x >= CX + W - 2 ? shift(color, -0.45) : shift(color, -0.15))); // daszek
    for (let x = CX - W + 1; x <= CX + W - 2; x++) {
      const c = g.get(x, 11);
      if (c) g.set(x, 11, shift(c, -0.18)); // cień daszka na czole
    }
  } else {
    for (let y = 4; y <= 10; y++) {
      const hw = y >= 9 ? W + 1 : hwAt[y];
      g.row(y, CX - hw, CX + hw - 1, (x) => {
        if (y >= 9) return x % 2 ? shade : shift(color, -0.1); // ściągacz
        return x >= CX + hw - 2 ? shade : y === 5 && x <= CX - 2 ? shift(color, 0.2) : color;
      });
    }
  }
}

function drawGlasses(g: Grid, kind: string) {
  const frame = kind === 'shades' ? '#1b1d22' : '#3a3530';
  for (const [x0, x1] of [
    [11, 14],
    [17, 20],
  ]) {
    g.row(14, x0, x1, frame);
    g.row(16, x0, x1, frame);
    g.set(x0, 15, frame);
    g.set(x1, 15, frame);
    if (kind === 'shades') {
      g.row(15, x0 + 1, x1 - 1, '#23262e');
      g.set(x0 + 1, 15, '#5a6472');
    }
  }
  g.row(15, 15, 16, frame);
}

/** Ciemny kontur wokół postaci: klasyczny wygląd pixel artu. */
function outline(g: Grid) {
  const add: [number, number][] = [];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (g.get(x, y)) continue;
      if (g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1)) add.push([x, y]);
    }
  for (const [x, y] of add) g.set(x, y, OUTLINE);
}

function toSvg(g: Grid): string {
  let rects = '';
  for (let y = 0; y < S; y++) {
    let x = 0;
    while (x < S) {
      const c = g.get(x, y);
      if (!c) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < S && g.get(x + run, y) === c) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${c}"/>`;
      x += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges">${rects}</svg>`;
}
