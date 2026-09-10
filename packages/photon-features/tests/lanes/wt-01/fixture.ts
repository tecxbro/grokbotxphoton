import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import {
  type Action,
  type Capability,
  type OperationHandler,
  type OperationResult,
  type ResourceRef,
  type TrustedContext,
} from "../../../src/index.js";
import {
  context,
  principal,
  scope,
  FixedClock,
} from "../../fixtures/harness.js";
import { DurableSQLiteStore } from "../../../src/adapters/state/sqlite.js";
import {
  DurableContexts,
  DurableSubmission,
  ExecutionClaims,
  DurableExecutor,
  DurableRecovery,
  DurableWork,
  DurableLocalProtocol,
  type ExecutionBinding,
  type FeatureDependencies,
} from "../../../src/runtime/core/index.js";
export { context, principal, scope, FixedClock };
export const space: ResourceRef = {
  version: 1,
  kind: "space",
  id: scope.spaceId,
  scope,
};
export const action = (key = "key-1"): Action => ({
  version: 1,
  contextId: context.contextId,
  idempotencyKey: key,
  operation: "text.send",
  arguments: {
    space: structuredClone(space) as Extract<ResourceRef, { kind: "space" }>,
    text: "hello",
  },
});
export const noNetwork: FeatureDependencies = {
  resources: {
    resolve: async (r) => r,
    space: async () => {
      throw Error("TEST_NO_SDK");
    },
    message: async () => {
      throw Error("TEST_NO_SDK");
    },
  },
  media: {
    resolve: async () => {
      throw Error("TEST_NO_MEDIA");
    },
  },
  streams: {
    open: async () => {
      throw Error("TEST_NO_STREAM");
    },
  },
};
export function outcome(
  status: OperationResult["status"] = "executor-completed",
  refs: ResourceRef[] = [],
): OperationResult {
  return {
    version: 1,
    requestId: "handler-placeholder",
    revision: 0,
    updatedAt: 10000,
    status,
    references: refs,
    value: { type: "void" },
    observations:
      status === "provider-accepted"
        ? [{ kind: "accepted", source: "sdk-return", at: 10000 }]
        : [],
  };
}
export function binding(
  execute: OperationHandler["execute"] = async () => outcome(),
  boundary: ExecutionBinding["boundary"] = "single-call",
): ExecutionBinding {
  return {
    handler: {
      operation: "text.send",
      execute,
      recoveryCodec: { id: "wt01-test", version: 1 },
    },
    boundary,
    capability: () =>
      ({
        operation: "text.send",
        providerSupport: "native",
        availability: {
          account: "available",
          conversation: "available",
          checkedAt: 10000,
        },
        implementation: "implemented",
        direction: { inbound: "not-applicable", outbound: "implemented" },
        evidence: [
          {
            tier: "unit",
            reference: "wt-01 test double only",
            observedAt: 10000,
            sdkVersion: "12.8.0",
          },
        ],
        sdkVersion: "12.8.0",
        sources: [],
        blockers: [],
      }) satisfies Capability,
  };
}
export function seed(
  store: DurableSQLiteStore,
  c: TrustedContext = context,
): void {
  store.transaction((tx) => {
    tx.put(
      "contexts",
      { id: c.contextId, scope: c.scope, revision: 0, context: c },
      null,
    );
    tx.put(
      "tasks",
      {
        id: c.taskId,
        scope: c.scope,
        revision: 0,
        principalId: c.principalId,
        generation: c.generation,
        cancelledAt: null,
      },
      null,
    );
    tx.put(
      "references",
      {
        id: c.scope.spaceId,
        scope: c.scope,
        revision: 0,
        reference: {
          version: 1,
          kind: "space",
          id: c.scope.spaceId,
          scope: c.scope,
        },
        providerId: "test-provider-space",
        ownedByPrincipalId: c.principalId,
        taskId: c.taskId,
        generation: c.generation,
      },
      null,
    );
  });
}
export function components(
  store: DurableSQLiteStore,
  clock = new FixedClock(),
  concurrency = 4,
) {
  const contexts = new DurableContexts(store, clock),
    claims = new ExecutionClaims(store, contexts),
    executor = new DurableExecutor(claims, noNetwork, concurrency, 1000),
    submission = new DurableSubmission(store, contexts, (id) =>
      executor.cancel(id),
    ),
    work = new DurableWork(store, contexts),
    recovery = new DurableRecovery(store, contexts);
  const protocol = new DurableLocalProtocol({
    contexts,
    submission,
    work,
    capabilities: () => [binding().capability(context)],
    diagnostics: () => ({ ready: false, activation: "disabled" }),
  });
  return {
    store,
    clock,
    contexts,
    claims,
    executor,
    submission,
    work,
    recovery,
    protocol,
  };
}
export function fixture(t: TestContext, concurrency = 4) {
  const dir = mkdtempSync(join(tmpdir(), "photon-wt01-test-")),
    path = join(dir, "state.sqlite");
  const store = new DurableSQLiteStore(path);
  seed(store);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { ...components(store, new FixedClock(), concurrency), dir, path };
}
export function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
