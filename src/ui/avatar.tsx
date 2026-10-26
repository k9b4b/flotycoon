import { createRng, pick, pickWeighted, rand, type RngState } from '../engine/rng';
import type { Driver } from '../engine/types';
import { accessories } from '../vendor/pixel-art/accessories';
import { beard } from '../vendor/pixel-art/beard';
import { clothing } from '../vendor/pixel-art/clothing';
import { eyes } from '../vendor/pixel-art/eyes';
import { glasses } from '../vendor/pixel-art/glasses';
import { hair } from '../vendor/pixel-art/hair';
import { hat } from '../vendor/pixel-art/hat';
import { mouth } from '../vendor/pixel-art/mouth';
import type { ComponentGroup } from '../vendor/shim';

/**
 * Pikselowe twarze kierowców (DiceBear Pixel Art, CC0).
 * Wygląd jest stały dla osoby (ziarno z imienia, nazwiska i ksywki), a mina zmienia się z morale.
 * Dobór podąża za kierowcą: siwizna u doświadczonych, wąsy i brody, okulary u „Teczki z papierami”,
 * ciemne okulary u pirata, czapka u części kierowców.
 */

const SKIN = ['#ffdbac', '#f5cfa0', '#eac393', '#e0b687', '#cb9e6e', '#b68655', '#a26d3d', '#8d5524'];
const SKIN_W = [22, 22, 18, 14, 10, 7, 4, 3];
const HAIR = ['#cab188', '#603a14', '#83623b', '#a78961', '#611c17', '#603015', '#612616', '#28150a'];
const GRAY_HAIR = ['#b9b9b9', '#d6d6d6', '#9e9e9e'];
const CLOTHING = ['#5bc0de', '#428bca', '#03396c', '#88d8b0', '#44c585', '#00b159', '#ff6f69', '#d11141', '#ae0001', '#ffd969', '#ffc425'];
const HAT = ['#2e1e05', '#2663a3', '#989789', '#3d8a6b', '#614f8a', '#a62116'];
const EYES = ['#76778b', '#697b94', '#647b90', '#5b7c8b', '#588387', '#876658'];
const MOUTH = ['#d29985', '#c98276', '#e35d6a'];
const GLASS_LIGHT = ['light01', 'light02', 'light03', 'light04', 'light05', 'light06', 'light07'];
const GLASS_DARK = ['dark01', 'dark02', 'dark03', 'dark04', 'dark05', 'dark06', 'dark07'];
const SHORT = Array.from({ length: 24 }, (_, i) => `short${String(i + 1).padStart(2, '0')}`);
const LONG = Array.from({ length: 21 }, (_, i) => `long${String(i + 1).padStart(2, '0')}`);
const HAPPY = Array.from({ length: 13 }, (_, i) => `happy${String(i + 1).padStart(2, '0')}`);
const SAD = Array.from({ length: 10 }, (_, i) => `sad${String(i + 1).padStart(2, '0')}`);
const variants = (n: number) => Array.from({ length: n }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Usta z morale: wysokie = uśmiech, niskie = smutek. Perki przesuwają nastrój. */
function mouthFor(d: Driver, r: RngState): string {
  const perks = d.perks ?? [];
  const m = d.stats.morale + (perks.includes('optymista') ? 10 : 0) - (perks.includes('maruda') ? 10 : 0);
  if (m < 40) return pick(r, SAD);
  if (m < 55) return pick(r, rand(r) < 0.6 ? SAD : HAPPY);
  return pick(r, HAPPY);
}

const identity = (d: Driver) => `${d.firstName}|${d.lastName}|${d.nickname}|${d.quirk}`;

export function avatarSvg(d: Driver): string {
  const seed = hash(identity(d));
  const r = createRng(seed);
  const perks = d.perks ?? [];
  const old = d.stats.experience >= 85 || d.nickname === 'Dziadek' || rand(r) < 0.12;
  const colors = {
    skin: pickWeighted(r, SKIN.map((c, i) => ({ c, w: SKIN_W[i] })), (x) => x.w).c,
    hair: old ? pick(r, GRAY_HAIR) : pick(r, HAIR),
    clothing: pick(r, CLOTHING),
    hat: pick(r, HAT),
    eyes: pick(r, EYES),
    mouth: pick(r, MOUTH),
    glasses: '#323232',
    accessories: '#daa520',
  };
  // Panowie najczęściej krótko (czasem łysina u starszych), panie częściej długie włosy.
  const hairId = d.female ? pick(r, rand(r) < 0.8 ? LONG : SHORT) : old && rand(r) < 0.35 ? null : pick(r, SHORT);
  // Wąs albo broda: klasyka polskiej kabiny.
  const beardId = !d.female && rand(r) < 0.55 ? pick(r, variants(8)) : null;
  const glassesRoll = rand(r);
  const glassesId = perks.includes('pirat') && glassesRoll < 0.7
    ? pick(r, GLASS_DARK)
    : (perks.includes('teczka') && glassesRoll < 0.8) || glassesRoll < 0.1
      ? pick(r, GLASS_LIGHT)
      : null;
  const hatId = rand(r) < 0.15 ? pick(r, variants(10)) : null;
  const accId = rand(r) < 0.08 ? pick(r, variants(4)) : null;
  const clothingId = pick(r, variants(23));
  const eyesId = pick(r, variants(12));
  // Mina: osobne ziarno, żeby zmiana morale nie przestawiała reszty twarzy.
  const mouthId = mouthFor(d, createRng(seed ^ 0x9e3779b9));

  const part = (group: ComponentGroup, id: string | null) =>
    id ? (group[id]?.({}, colors) ?? '') : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" shape-rendering="crispEdges">` +
    `<path d="M4 2h8v1h1v3h1v2h-1v3h-1v1H9v1h4v1h1v2H2v-2h1v-1h4v-1H4v-1H3V8H2V6h1V3h1V2Z" fill="${colors.skin}"/>` +
    `<path d="M4 2h8v1h1v3h1v2h-1v3h-1v1H4v-1H3V8H2V6h1V3h1V2Z" fill="#fff" fill-opacity=".1"/>` +
    part(accessories, accId) +
    part(clothing, clothingId) +
    part(eyes, eyesId) +
    part(glasses, glassesId) +
    part(beard, beardId) +
    part(mouth, mouthId) +
    part(hair, hairId) +
    part(hat, hatId) +
    `</svg>`
  );
}

const cache = new Map<string, string>();

export function DriverAvatar({ d, size = 44 }: { d: Driver; size?: number }) {
  // Mina zależy od morale, więc przedział morale jest częścią klucza.
  const key = `${identity(d)}|${(d.perks ?? []).join(',')}|${Math.floor(d.stats.morale / 5)}|${d.stats.experience >= 85}`;
  let svg = cache.get(key);
  if (!svg) {
    svg = avatarSvg(d);
    if (cache.size > 400) cache.clear();
    cache.set(key, svg);
  }
  return <span className="avatar" style={{ width: size, height: size }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
