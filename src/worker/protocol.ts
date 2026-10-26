import type { CatchUpReport, ActionResult } from '../engine/sim';
import type { Snapshot } from '../engine/view';

/** Kontrakt między UI a workerem symulacji. Typowany, bez bibliotek. */
export interface SimApi {
  init(): Promise<{ report: CatchUpReport | null; saving: boolean }>;
  setPace(pace: number): void;
  setHidden(hidden: boolean): void;
  acceptJob(jobId: string, truckId: string): ActionResult;
  leaseTruck(): ActionResult;
  serviceTruck(truckId: string): ActionResult;
  newGame(seed?: number): void;
  save(): Promise<boolean>;
}

export type Method = keyof SimApi;

export interface RpcRequest {
  kind: 'rpc';
  id: number;
  method: Method;
  args: unknown[];
}

export type WorkerMessage =
  | { kind: 'rpc-result'; id: number; result?: unknown; error?: string }
  | { kind: 'snapshot'; snap: Snapshot; pace: number };
