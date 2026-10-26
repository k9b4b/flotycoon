import type { CatchUpReport, ActionResult } from '../engine/sim';
import type { Snapshot } from '../engine/view';
import type { UpgradeId } from '../data/progression';
import type { CourseId } from '../data/development';

/** Kontrakt między UI a workerem symulacji. Typowany, bez bibliotek. */
export interface SimApi {
  init(): Promise<{ report: CatchUpReport | null; saving: boolean }>;
  setPace(pace: number): void;
  setHidden(hidden: boolean): void;
  acceptJob(jobId: string, truckId: string): ActionResult;
  serviceTruck(truckId: string): ActionResult;
  giveBonus(driverId: string): ActionResult;
  hireDriver(candidateId: string): ActionResult;
  fireDriver(driverId: string): ActionResult;
  assignDriver(truckId: string, driverId: string | null): ActionResult;
  leaseOffer(offerId: string): ActionResult;
  returnTruck(truckId: string): ActionResult;
  upgradeYard(): ActionResult;
  buyUpgrade(id: UpgradeId): ActionResult;
  setAutoDispatch(on: boolean): ActionResult;
  resolveDecision(decisionId: string, optionId: string): ActionResult;
  setAskDecisions(on: boolean): ActionResult;
  signContract(offerId: string): ActionResult;
  trainDriver(driverId: string, courseId: CourseId): ActionResult;
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
