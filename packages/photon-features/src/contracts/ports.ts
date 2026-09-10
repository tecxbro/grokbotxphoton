import type { ContentInput, Message, Space } from "spectrum-ts";
import type { Action, Operation } from "./actions.js";
import type { ContentSpec } from "./content.js";
import type { AuthenticatedPrincipal, TrustedContext } from "./context.js";
import type { IncomingEvent } from "./events.js";
import type { ResourceRef, Scope } from "./resources.js";
import type { Capability, OperationResult } from "./results.js";
import type { Transaction, TransactionStore, Claim } from "../state/ports.js";
export interface Clock {
  now(): number;
}
export interface ContextResolver {
  resolve(
    principal: AuthenticatedPrincipal,
    contextId: string,
  ): Promise<TrustedContext>;
  authorize(context: TrustedContext, action: Action): Promise<void>;
}
export interface ResourceResolver {
  resolve(ref: ResourceRef, context: TrustedContext): Promise<ResourceRef>;
  space(ref: ResourceRef, context: TrustedContext): Promise<Space>;
  message(ref: ResourceRef, context: TrustedContext): Promise<Message>;
}
export interface MediaStager {
  resolve(
    media: Extract<ContentSpec, { type: "attachment" }>["media"],
    context: TrustedContext,
  ): Promise<{ bytes: Uint8Array; mimeType: string }>;
}
export interface RegisteredStreams {
  open(
    ref: Extract<ResourceRef, { kind: "stream" }>,
    context: TrustedContext,
    signal: AbortSignal,
  ): Promise<AsyncIterable<string>>;
}
export interface WakeAdapter {
  wake(pointer: {
    handoffId: string;
    taskId: string;
    generation: number;
  }): Promise<{ status: "accepted" | "failed" | "unknown" }>;
}
export interface RecoveryCodec {
  id: string;
  version: number;
  validate(checkpoint: unknown): boolean;
  reconcile(
    checkpoint: unknown,
    services: ExecutionServices,
  ): Promise<"safe-to-retry" | "completed" | "unknown">;
}
export interface ExecutionServices {
  context: TrustedContext;
  resources: ResourceResolver;
  media: MediaStager;
  streams: RegisteredStreams;
  clock: Clock;
  signal: AbortSignal;
  claim: Claim;
  transactions: TransactionStore;
}
export interface ExecutionPort {
  execute(
    action: Action,
    services: ExecutionServices,
  ): Promise<OperationResult>;
}
export interface OperationHandler {
  operation: Operation;
  execute: ExecutionPort["execute"];
  recoveryCodec: { id: string; version: number };
}
export interface ContentCompiler {
  family: ContentSpec["type"];
  compile(
    content: ContentSpec,
    services: ExecutionServices,
  ): Promise<ContentInput>;
}
export interface EventReducer {
  type: IncomingEvent["type"];
  reduce(event: IncomingEvent, tx: Transaction): void;
}
export interface FeatureModule {
  id: string;
  lane: string;
  mode: "production";
  handlers: readonly OperationHandler[];
  compilers: readonly ContentCompiler[];
  reducers: readonly EventReducer[];
  capabilities: readonly Capability[];
  recoveryCodecs: readonly RecoveryCodec[];
}
export interface IngressAdapter {
  start(accept: (event: IncomingEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}
export interface ClientOwner {
  start(): Promise<void>;
  stop(): Promise<void>;
  ready(): boolean;
}
export interface HostConfiguration {
  ingress: {
    kind: "photon-webhook" | "photon-stream";
    verificationConfigured: boolean;
  };
  provider: "imessage";
  storePath: string;
  socketPath: string;
  activation: "disabled" | "enabled";
}
