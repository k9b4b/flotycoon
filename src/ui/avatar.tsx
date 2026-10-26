import type { Driver } from '../engine/types';
import { portraitSvg } from './portrait';

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
