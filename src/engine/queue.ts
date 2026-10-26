/**
 * Kolejka zdarzeń: kopiec binarny posortowany po czasie gry.
 * Przechowywana jako zwykły obiekt, żeby dało się ją zapisać w IndexedDB.
 * `seq` rozstrzyga remisy, więc zdarzenia z tym samym czasem
 * wykonują się w kolejności dodania (determinizm).
 */
export interface Scheduled<E> {
  at: number;
  seq: number;
  ev: E;
}

export interface Queue<E> {
  heap: Scheduled<E>[];
  seq: number;
}

export function createQueue<E>(): Queue<E> {
  return { heap: [], seq: 0 };
}

function less<E>(a: Scheduled<E>, b: Scheduled<E>): boolean {
  return a.at < b.at || (a.at === b.at && a.seq < b.seq);
}

export function qPush<E>(q: Queue<E>, at: number, ev: E): void {
  const h = q.heap;
  h.push({ at, seq: q.seq++, ev });
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(h[i], h[p])) break;
    [h[i], h[p]] = [h[p], h[i]];
    i = p;
  }
}

export function qPeek<E>(q: Queue<E>): Scheduled<E> | undefined {
  return q.heap[0];
}

export function qPop<E>(q: Queue<E>): Scheduled<E> | undefined {
  const h = q.heap;
  if (h.length === 0) return undefined;
  const top = h[0];
  const last = h.pop()!;
  if (h.length > 0) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && less(h[l], h[m])) m = l;
      if (r < h.length && less(h[r], h[m])) m = r;
      if (m === i) break;
      [h[i], h[m]] = [h[m], h[i]];
      i = m;
    }
  }
  return top;
}

export function qSize<E>(q: Queue<E>): number {
  return q.heap.length;
}
