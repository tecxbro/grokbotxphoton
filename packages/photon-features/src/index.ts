export * from "./contracts/index.js";
export * from "./state/index.js";
export * from "./host/index.js";
export * from "./registry/index.js";
export * from "./capabilities.js";
export * from "./adapters/legacy/index.js";

// Explicit exports select the F0 public seam; legacy contracts remain under ./contracts for inherited code.
export type { ExecutionServices as FoundationExecutionServices, ChildExecution } from "./contracts/services.js";
export type { FeatureModule as FoundationFeatureModule } from "./contracts/feature.js";
export type { StateStore, UnitOfWork, ExecutionClaim, DomainTable, ContinuationSpec } from "./contracts/store.js";
export type { ProviderContext, EventSource } from "./contracts/transport.js";
export type { MessageRef, ReactionRef, PollRef, CardRef, AttachmentRef } from "./contracts/references.js";
export * from "./contracts/receipts.js";
export * from "./registry/catalog.js";
export * from "./registry/modules.js";
export * from "./host/main.js";
export * from "./integration/index.js";
