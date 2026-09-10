import type { OperationResult } from "./results.js";
import type { TrustedContext } from "./context.js";
import type { ResourceRef } from "./references.js";
import type { ExecutionClaim, UnitOfWork } from "./store.js";
import type { ReceiptObservation } from "./receipts.js";
import type { Clock, MediaStager, RegisteredStreams } from "./ports.js";
/** Executable callback is trusted program code, never accepted from action JSON. */
export interface ChildExecution {
  index: number;
  key: string;
  argumentsDigest: string;
  dispatch(signal: AbortSignal): Promise<OperationResult>;
}
/** The only feature execution boundary. Implementations recheck authority after every await. */
export interface ExecutionServices {
  readonly context: Readonly<TrustedContext>;
  readonly claim: Readonly<ExecutionClaim>;
  readonly signal: AbortSignal;
  readonly clock: Clock;
  assertActiveClaim(): void;
  resolveResource(ref: ResourceRef): Promise<ResourceRef>;
  transaction<T>(run: (unit: UnitOfWork) => T extends PromiseLike<unknown> ? never : T): T;
  executeChild(child: ChildExecution): Promise<OperationResult>;
  recordReceipt(observation: ReceiptObservation): Promise<void>;
  media: MediaStager;
  streams: RegisteredStreams;
}
