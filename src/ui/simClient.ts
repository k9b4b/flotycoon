import { useSyncExternalStore } from 'react';
import type { Snapshot } from '../engine/view';
import type { Method, RpcRequest, SimApi, WorkerMessage } from '../worker/protocol';

/**
 * Klient workera: typowane RPC (Promise) + magazyn ostatniego widoku
 * dla Reacta (useSyncExternalStore, bez dodatkowych bibliotek).
 */
type Remote = { [K in Method]: (...args: Parameters<SimApi[K]>) => Promise<Awaited<ReturnType<SimApi[K]>>> };

export interface SimView {
  snap: Snapshot | null;
  pace: number;
}

let view: SimView = { snap: null, pace: 1 };
const listeners = new Set<() => void>();
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let nextId = 1;

const worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });

worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const m = e.data;
  if (m.kind === 'snapshot') {
    view = { snap: m.snap, pace: m.pace };
    listeners.forEach((l) => l());
    return;
  }
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (m.error) p.reject(new Error(m.error));
  else p.resolve(m.result);
};

export const sim = new Proxy({} as Remote, {
  get: (_t, method: Method) =>
    (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        const req: RpcRequest = { kind: 'rpc', id, method, args };
        worker.postMessage(req);
      }),
});

document.addEventListener('visibilitychange', () => void sim.setHidden(document.hidden));
window.addEventListener('pagehide', () => void sim.save());

export function useSim(): SimView {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => view,
  );
}
