import type { Driver } from '../engine/types';
import { portraitSvg } from './portrait';
import { rigSvg, trailerOnlySvg, truckSvg, RIG_W, TRAILER_W, type RigTrailer, type TruckLook } from './truckSprite';
import type { TrailerType } from '../data/trailers';

/**
 * Pikselowy portret kierowcy (ui/portrait.ts), z pamięcią podręczną: generujemy raz na osobę i nastrój.
 * Piksele skalujemy tylko całkowicie: 64 px pokazuje cały portret 32×32 (×2),
 * a mniejsze kafelki kadr 24×24 z twarzą (48 px = ×2), żeby piksele były równe.
 */
const cache = new Map<string, string>();

export function DriverAvatar({ d, size = 44 }: { d: Driver; size?: number }) {
  // Mina zależy od morale, więc przedział morale jest częścią klucza.
  const key = `${d.firstName}|${d.lastName}|${d.nickname}|${d.quirk}|${d.female}|${(d.perks ?? []).join(',')}|${Math.floor(d.stats.morale / 5)}|${d.stats.experience >= 80}`;
  let svg = cache.get(key);
  if (!svg) {
    svg = portraitSvg(d);
    if (cache.size > 400) cache.clear();
    cache.set(key, svg);
  }
  const html = size < 64 ? svg.replace('viewBox="0 0 32 32"', 'viewBox="4 4 24 24"') : svg;
  return <span className="avatar" style={{ width: size, height: size }} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
}

const truckCache = new Map<string, string>();

/** Pikselowy ciągnik (ui/truckSprite.ts) w skali całkowitej, z pamięcią podręczną. */
export function TruckSprite({ t, scale = 2 }: { t: TruckLook; scale?: number }) {
  const key = `${t.plate}|${t.brand}|${t.model}|${Math.round(t.wear * 20)}|${t.condition ?? ''}`;
  let svg = truckCache.get(key);
  if (!svg) {
    svg = truckSvg({ ...t, wear: Math.round(t.wear * 20) / 20 });
    if (truckCache.size > 400) truckCache.clear();
    truckCache.set(key, svg);
  }
  return <span className="truck-sprite" style={{ width: 44 * scale, height: 28 * scale }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Pikselowa naczepa, ta sama co w zestawie. seed ustala kolor plandeki (numer naczepy albo id oferty). */
export function TrailerSprite({ type, wear = 0, seed = '', scale = 2 }: { type: TrailerType; wear?: number; seed?: string; scale?: number }) {
  const key = `tr|${type}|${seed}|${Math.round(wear * 10)}`;
  let svg = truckCache.get(key);
  if (!svg) {
    svg = trailerOnlySvg({ type, wear: Math.round(wear * 10) / 10, label: seed });
    truckCache.set(key, svg);
  }
  return <span className="trailer-sprite" style={{ width: TRAILER_W * scale, height: 28 * scale }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Cały zestaw: ciągnik z naczepą (albo z zarysem pustego miejsca, gdy naczepy brak). */
export function RigSprite({ t, trailer, scale = 2 }: { t: TruckLook; trailer: RigTrailer | null; scale?: number }) {
  const key = `${t.plate}|${t.brand}|${t.model}|${Math.round(t.wear * 20)}|${t.condition ?? ''}|${trailer ? `${trailer.label}|${trailer.type}|${Math.round(trailer.wear * 10)}` : '-'}`;
  let svg = truckCache.get(key);
  if (!svg) {
    svg = rigSvg({ ...t, wear: Math.round(t.wear * 20) / 20 }, trailer && { ...trailer, wear: Math.round(trailer.wear * 10) / 10 });
    if (truckCache.size > 400) truckCache.clear();
    truckCache.set(key, svg);
  }
  return <span className="truck-sprite rig-sprite" style={{ width: RIG_W * scale, height: 28 * scale }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
