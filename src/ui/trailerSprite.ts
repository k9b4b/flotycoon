import type { TrailerType } from '../data/trailers';

/**
 * Pikselowe naczepy z boku (48×20), w tym samym stylu co ciągniki.
 * Typ rozpoznasz po sylwetce: firanka w fałdach, chłodnia z agregatem, beczka, niskie podwozie.
 */
const W = 48;
const H = 20;

type Px = [x: number, y: number, w: number, h: number, c: string];

function wheels(xs: number[], y = 15): Px[] {
  return xs.flatMap((x) => [[x, y, 4, 4, '#1b1d22'] as Px, [x + 1, y + 1, 2, 2, '#7c828c'] as Px]);
}

function shape(type: TrailerType, wear: number): Px[] {
  const dirt = wear > 0.45 ? '#6b5a44' : null;
  const out: Px[] = [];
  switch (type) {
    case 'curtain': {
      out.push([3, 2, 44, 12, '#3f6496'], [3, 2, 44, 1, '#2a3a52'], [3, 13, 44, 1, '#2a3a52']);
      for (let x = 7; x < 46; x += 5) out.push([x, 3, 1, 10, '#34557f']);
      out.push([3, 2, 1, 12, '#2a3a52'], [46, 2, 1, 12, '#2a3a52']);
      break;
    }
    case 'reefer': {
      out.push([4, 2, 43, 12, '#e6ebf0'], [4, 2, 43, 1, '#aeb6c0'], [4, 13, 43, 1, '#aeb6c0'], [46, 2, 1, 12, '#aeb6c0']);
      out.push([1, 4, 3, 8, '#8d969f'], [1, 5, 3, 1, '#5d646c'], [1, 7, 3, 1, '#5d646c'], [1, 9, 3, 1, '#5d646c']);
      out.push([10, 7, 30, 2, '#4f8fd6']);
      break;
    }
    case 'adr': {
      out.push([6, 4, 38, 9, '#c9ced6'], [5, 5, 40, 7, '#c9ced6'], [4, 6, 42, 5, '#c9ced6']);
      out.push([6, 4, 38, 1, '#eef1f5'], [6, 12, 38, 1, '#8b929c']);
      for (const x of [15, 25, 35]) out.push([x, 4, 1, 9, '#a9b0ba']);
      out.push([20, 3, 6, 1, '#8b929c'], [41, 8, 4, 3, '#f28c28'], [4, 13, 42, 1, '#2a2d33']);
      break;
    }
    case 'lowbed': {
      out.push([1, 6, 10, 3, '#d9a520'], [9, 8, 3, 5, '#d9a520'], [11, 11, 36, 3, '#d9a520'], [11, 11, 36, 1, '#f0c24a']);
      out.push([1, 6, 10, 1, '#f0c24a'], [44, 9, 3, 2, '#c0392b']);
      break;
    }
  }
  // podwozie i zaczep
  if (type !== 'lowbed') out.push([3, 14, 44, 1, '#22252b'], [6, 14, 2, 3, '#22252b']);
  out.push(...wheels(type === 'lowbed' ? [30, 35, 40] : [32, 37, 42]));
  if (dirt) out.push([3, 12, 44, 1, dirt]);
  return out;
}

export function trailerSvg(type: TrailerType, wear = 0): string {
  const rects = shape(type, wear)
    .map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" shape-rendering="crispEdges">${rects}</svg>`;
}

export const TRAILER_SPRITE_SIZE = { w: W, h: H };
