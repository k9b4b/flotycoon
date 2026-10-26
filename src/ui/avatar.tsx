import { createRng, pick, pickWeighted, rand, type RngState } from '../engine/rng';
import type { Driver } from '../engine/types';
import { accessories } from '../vendor/open-peeps/accessories';
import { body } from '../vendor/open-peeps/body';
import { face } from '../vendor/open-peeps/face';
import { facialHair } from '../vendor/open-peeps/facialHair';
import { head } from '../vendor/open-peeps/head';
import type { ColorPickCollection } from '../vendor/shim';

/**
 * Twarze kierowców z rysunków Open Peeps (Pablo Stanley, CC0).
 * Wygląd jest stały dla osoby (ziarno z imienia, nazwiska i ksywki), a mina zmienia się z morale.
 * Dobór elementów podąża za kierowcą: siwizna u doświadczonych, okulary u „Teczki z papierami”, ciemne okulary u pirata.
 */

const SKIN = ['#ffdbb4', '#edb98a', '#d08b5b', '#ae5d29', '#694d3d'];
const SKIN_W = [40, 35, 15, 6, 4];
const CLOTHING = ['#3b5b92', '#c0392b', '#2e7d4f', '#e0a526', '#5d6d7e', '#1f2a36', '#e67e22', '#7d3c98'];
const HAIR = ['#2c1b18', '#4a312c', '#724133', '#a55728', '#b58143', '#d6b370'];
const GRAY = '#cfcfcf';

const MALE_HEAD = ['short1', 'short2', 'short3', 'short4', 'short5', 'noHair1', 'noHair2', 'noHair3', 'shaved1', 'shaved2', 'shaved3', 'flatTop', 'pomp', 'hatBeanie', 'hatHip'];
const FEMALE_HEAD = ['bangs', 'bangs2', 'bun', 'bun2', 'long', 'longBangs', 'longCurly', 'medium1', 'medium2', 'medium3', 'mediumBangs', 'mediumBangs2', 'mediumBangs3', 'mediumStraight'];
const OLD_MALE_HEAD = ['grayShort', 'grayMedium', 'noHair1', 'noHair2', 'noHair3', 'hatBeanie'];
const OLD_FEMALE_HEAD = ['grayBun', 'grayMedium', 'bun', 'mediumStraight'];
const MOUSTACHE = ['moustache1', 'moustache2', 'moustache3', 'moustache4', 'moustache5', 'moustache6', 'moustache7', 'moustache8', 'moustache9'];
const BEARD = ['full', 'full2', 'full3', 'full4', 'goatee1', 'goatee2', 'chin'];
const GLASSES = ['glasses', 'glasses2', 'glasses3', 'glasses4', 'glasses5'];

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function faceFor(d: Driver, r: RngState): string {
  const m = d.stats.morale;
  const perks = d.perks ?? [];
  if (m < 35) return pick(r, perks.includes('narwany') ? ['veryAngry', 'rage', 'angryWithFang'] : ['tired', 'concerned', 'solemn', 'contempt']);
  if (m < 50) return pick(r, perks.includes('maruda') ? ['contempt', 'suspicious'] : ['serious', 'solemn', 'suspicious', 'tired']);
  if (m < 75) return pick(r, perks.includes('optymista') ? ['smile', 'cheeky'] : ['calm', 'smile', 'explaining', 'driven', 'serious']);
  return pick(r, ['smileBig', 'smile', 'lovingGrin1', 'cheeky', 'smileTeethGap']);
}

export function avatarSvg(d: Driver): string {
  const seed = hash(`${d.firstName}|${d.lastName}|${d.nickname}|${d.quirk}`);
  const r = createRng(seed);
  const perks = d.perks ?? [];
  const old = d.stats.experience >= 85 || d.nickname === 'Dziadek' || rand(r) < 0.12;
  const colors: ColorPickCollection = {
    skin: pickWeighted(r, SKIN.map((c, i) => ({ c, w: SKIN_W[i] })), (x) => x.w).c,
    clothing: pick(r, CLOTHING),
    headContrast: old ? GRAY : pick(r, HAIR),
  };
  const headId = pick(r, d.female ? (old ? OLD_FEMALE_HEAD : FEMALE_HEAD) : old ? OLD_MALE_HEAD : MALE_HEAD);
  // Wąs to klasyka polskiej kabiny.
  const beardRoll = rand(r);
  const beardId = d.female ? null : beardRoll < 0.45 ? pick(r, MOUSTACHE) : beardRoll < 0.65 ? pick(r, BEARD) : null;
  const glassesRoll = rand(r);
  const accId = perks.includes('pirat')
    ? pick(r, ['sunglasses', 'sunglasses2'])
    : perks.includes('teczka') || glassesRoll < 0.18
      ? pick(r, GLASSES)
      : null;
  // Mina: osobne ziarno, żeby zmiana morale nie przestawiała reszty twarzy.
  const faceId = faceFor(d, createRng(seed ^ 0x9e3779b9));

  const parts = [
    body(colors.skin, colors.clothing),
    `<g transform="matrix(.99789 0 0 1 156 62)">${head[headId]?.({}, colors) ?? ''}</g>`,
    `<g transform="translate(315 248)">${face[faceId]?.({}, colors) ?? ''}</g>`,
    beardId ? `<g transform="translate(279 400)">${facialHair[beardId]?.({}, colors) ?? ''}</g>` : '',
    accId ? `<g transform="translate(203 303)">${accessories[accId]?.({}, colors) ?? ''}</g>` : '',
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 -16 664 664" fill="none" shape-rendering="auto"><g fill-rule="evenodd" clip-rule="evenodd">${parts.join('')}</g></svg>`;
}

const cache = new Map<string, string>();

function cached(d: Driver): string {
  // Mina zależy od przedziału morale, więc to jest część klucza.
  const key = `${d.firstName}|${d.lastName}|${d.nickname}|${d.quirk}|${(d.perks ?? []).join(',')}|${Math.floor(d.stats.morale / 5)}|${d.stats.experience >= 85}`;
  let svg = cache.get(key);
  if (!svg) {
    svg = avatarSvg(d);
    if (cache.size > 400) cache.clear();
    cache.set(key, svg);
  }
  return svg;
}

export function DriverAvatar({ d, size = 44 }: { d: Driver; size?: number }) {
  return <span className="avatar" style={{ width: size, height: size }} aria-hidden dangerouslySetInnerHTML={{ __html: cached(d) }} />;
}
