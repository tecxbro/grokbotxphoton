import type { ExecutionServices } from "../../contracts/services.js";
import type {
  Clock,
  MediaStager,
  RegisteredStreams,
  ResourceResolver,
} from "../../contracts/ports.js";
import type { ResourceRef } from "../../contracts/resources.js";
import type { Claim } from "../../state/index.js";
import type { ExecutionClaims } from "./claims.js";
import { canonical } from "./idempotency.js";
import { fault } from "./errors.js";
import { executeChild } from "./child-journal.js";
import { applyReceiptObservation } from "./receipt-state.js";
import { runUnitOfWorkTransaction } from "../../adapters/state/unit-of-work.js";

export interface CreateExecutionServicesOptions {
  claims: ExecutionClaims;
  requestId: string;
  claim: Claim;
  controller: AbortController;
  deadlineMs: number;
  resources: ResourceResolver;
  media: MediaStager;
  streams: RegisteredStreams;
  clock?: Clock;
  afterCommit?(pointer: {
    handoffId: string;
    taskId: string;
    generation: number;
  }): void;
}

/** Create the exact f0-services-2 facade; no private execution table escapes this object. */
export function createExecutionServices(
  options: CreateExecutionServicesOptions,
): ExecutionServices {
  const assertActiveClaim = () => {
    if (options.controller.signal.aborted) fault("CANCELLED");
    options.claims.store.transaction((tx) => {
      options.claims.writable(
        tx,
        options.requestId,
        options.claim,
      );
    });
  };
  const current = () =>
    options.claims.store.transaction(
      (tx) =>
        options.claims.writable(tx, options.requestId, options.claim).context,
    );
  const resolveAuthorized = (reference: ResourceRef) =>
    options.claims.store.transaction((tx) => {
      const { context } = options.claims.writable(
        tx,
        options.requestId,
        options.claim,
      );
      options.claims.contexts.reference(tx, context, reference);
      return context;
    });
  const context = current();
  Object.freeze(context.scope);
  Object.freeze(context.permissions);
  Object.freeze(context);
  return {
    context,
    claim: Object.freeze({ ...options.claim }),
    signal: options.controller.signal,
    clock: options.clock ?? options.claims.contexts.clock,
    assertActiveClaim,
    resolveResource: async (reference) => {
      const before = resolveAuthorized(reference);
      const resolved = await options.resources.resolve(reference, before);
      resolveAuthorized(reference);
      if (canonical(resolved) !== canonical(reference))
        fault("RESOURCE_NOT_FOUND");
      return resolved;
    },
    transaction: (run) =>
      runUnitOfWorkTransaction({
        claims: options.claims,
        requestId: options.requestId,
        claim: options.claim,
        run,
        afterCommit: options.afterCommit,
      }),
    executeChild: (child) =>
      executeChild({
        claims: options.claims,
        requestId: options.requestId,
        claim: options.claim,
        child,
        controller: options.controller,
        deadlineMs: options.deadlineMs,
      }),
    recordReceipt: async (observation) => {
      const before = current();
      applyReceiptObservation(options.claims.store, observation, before);
      current();
    },
    media: {
      resolve: async (media, supplied) => {
        const before = current();
        if (canonical(supplied) !== canonical(before)) fault("FORBIDDEN");
        const resolved = await options.media.resolve(media, before);
        current();
        return resolved;
      },
    },
    streams: {
      open: async (reference, supplied, signal) => {
        const before = resolveAuthorized(reference);
        if (canonical(supplied) !== canonical(before)) fault("FORBIDDEN");
        if (signal !== options.controller.signal) fault("FORBIDDEN");
        const opened = await options.streams.open(reference, before, signal);
        resolveAuthorized(reference);
        return opened;
      },
    },
  };
}
