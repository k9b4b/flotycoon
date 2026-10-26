/**
 * Czas gry to liczba minut od GAME_EPOCH (poniedziałek 4.01.2027, 00:00).
 * Tempo: ile minut gry mija w ciągu jednej sekundy realnej.
 * BASE_PACE = 1 → 1 min realna = 1 h gry (tempo „normalne” i tempo offline).
 */
export const GAME_EPOCH_MS = Date.UTC(2027, 0, 4, 0, 0, 0);
export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 1440;

/** Tempo bazowe (minut gry na sekundę realną). Działa też podczas nieobecności gracza. */
export const BASE_PACE = 1;

export const SPEED_PRESETS = [
  { id: 0, label: '⏸', pace: 0 },
  { id: 1, label: '1×', pace: BASE_PACE },
  { id: 2, label: '5×', pace: BASE_PACE * 5 },
  { id: 3, label: '30×', pace: BASE_PACE * 30 },
  { id: 4, label: '120×', pace: BASE_PACE * 120 },
] as const;

const DAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function toDate(gameMin: number): Date {
  return new Date(GAME_EPOCH_MS + gameMin * 60_000);
}

export function dayIndex(gameMin: number): number {
  return Math.floor(gameMin / MIN_PER_DAY);
}

export function nextMidnight(gameMin: number): number {
  return (dayIndex(gameMin) + 1) * MIN_PER_DAY;
}

/** „pn 04.01 06:00” */
export function formatGameTime(gameMin: number, withYear = false): string {
  const d = toDate(gameMin);
  const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}${withYear ? '.' + d.getUTCFullYear() : ''}`;
  return `${DAYS[d.getUTCDay()]} ${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatClock(gameMin: number): string {
  const d = toDate(gameMin);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** „5 h 20 min” */
export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const d = Math.floor(m / MIN_PER_DAY);
  const h = Math.floor((m % MIN_PER_DAY) / 60);
  const mm = m % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${mm} min`;
  return `${mm} min`;
}
