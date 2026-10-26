/**
 * Worker symulacji: trzyma stan gry, kręci zegarem i wysyła widok do UI.
 * UI nigdy nie modyfikuje stanu bezpośrednio, tylko woła metody SimApi.
 */
import { migrate } from '../engine/save';
import * as E from '../engine/sim';
import { advanceTo, catchUp, log, newGame, type ActionResult, type CatchUpReport } from '../engine/sim';
import { BASE_PACE, formatDuration } from '../engine/time';
import type { GameState } from '../engine/types';
import { buildSnapshot } from '../engine/view';
import type { RpcRequest, SimApi, WorkerMessage } from './protocol';
import { loadSave, writeSave } from './storage';

const SLOT = 'slot1';
const TICK_MS = 250;
const AUTOSAVE_MS = 10_000;
/** Maks. minut gry na jeden tik (zabezpieczenie po uśpieniu karty). */
const MAX_TICK_GAME_MIN = 6 * 60;

let state: GameState | null = null;
let pace = BASE_PACE;
let hidden = false;
let lastTick = 0;
let lastSave = 0;
let saving = true;

const post = (m: WorkerMessage) => (self as unknown as { postMessage(m: WorkerMessage): void }).postMessage(m);

function pushSnapshot() {
  if (state) post({ kind: 'snapshot', snap: buildSnapshot(state), pace });
}

async function persist(): Promise<boolean> {
  if (!state) return false;
  const ok = await writeSave({ id: SLOT, savedAt: Date.now(), state });
  saving = ok;
  lastSave = Date.now();
  return ok;
}

function tick() {
  const now = performance.now();
  const dtSec = (now - lastTick) / 1000;
  lastTick = now;
  if (!state) return;
  // W tle gra idzie w tempie bazowym, tak samo jak przy nieobecności.
  const effective = hidden ? BASE_PACE : pace;
  // Gracz patrzy (karta widoczna): zdarzenia z decyzją zatrzymują zegar i czekają na wybór.
  if (effective > 0) advanceTo(state, state.now + Math.min(dtSec * effective, MAX_TICK_GAME_MIN), !hidden);
  pushSnapshot();
  if (Date.now() - lastSave > AUTOSAVE_MS) void persist();
}

function act(fn: () => ActionResult): ActionResult {
  const r = fn();
  pushSnapshot();
  return r;
}

const api: SimApi = {
  async init() {
    const rec = await loadSave(SLOT);
    const loaded = rec ? migrate(rec.state) : null;
    let report: CatchUpReport | null = null;
    if (rec && loaded) {
      state = loaded;
      report = catchUp(state, Date.now() - rec.savedAt, BASE_PACE);
      if (report.gameMinutes >= 30) {
        log(state, 'info', `Pod Twoją nieobecność minęło ${formatDuration(report.gameMinutes)} czasu gry${report.capped ? ' (limit nadrabiania)' : ''}.`);
      } else {
        report = null;
      }
    } else {
      state = newGame((Math.random() * 2 ** 31) | 0);
    }
    lastTick = performance.now();
    setInterval(tick, TICK_MS);
    await persist();
    pushSnapshot();
    return { report, saving };
  },
  setPace(p) {
    pace = p;
    pushSnapshot();
  },
  setHidden(h) {
    hidden = h;
    if (h) void persist();
  },
  // Każda akcja gracza: wykonaj na stanie i od razu odśwież widok.
  acceptJob: (jobId, truckId) => act(() => E.acceptJob(state!, jobId, truckId)),
  serviceTruck: (truckId) => act(() => E.serviceTruck(state!, truckId)),
  giveBonus: (driverId) => act(() => E.giveBonus(state!, driverId)),
  hireDriver: (id) => act(() => E.hireDriver(state!, id)),
  fireDriver: (id) => act(() => E.fireDriver(state!, id)),
  assignDriver: (truckId, driverId) => act(() => E.assignDriver(state!, truckId, driverId)),
  leaseOffer: (id) => act(() => E.leaseOffer(state!, id)),
  returnTruck: (id) => act(() => E.returnTruck(state!, id)),
  upgradeYard: () => act(() => E.upgradeYard(state!)),
  buyUpgrade: (id) => act(() => E.buyUpgrade(state!, id)),
  setAutoDispatch: (on) => act(() => E.setAutoDispatch(state!, on)),
  resolveDecision: (id, option) => act(() => E.resolveDecision(state!, id, option)),
  setAskDecisions: (on) => act(() => E.setAskDecisions(state!, on)),
  newGame(seed) {
    state = newGame(seed ?? ((Math.random() * 2 ** 31) | 0));
    void persist();
    pushSnapshot();
  },
  save: persist,
};

self.onmessage = async (e: MessageEvent<RpcRequest>) => {
  const { id, method, args } = e.data;
  try {
    const fn = api[method] as (...a: unknown[]) => unknown;
    const result = await fn(...args);
    post({ kind: 'rpc-result', id, result });
  } catch (err) {
    post({ kind: 'rpc-result', id, error: err instanceof Error ? err.message : String(err) });
  }
};
