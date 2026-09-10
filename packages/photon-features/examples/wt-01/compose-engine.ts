import type { Clock } from "../../src/contracts/index.js";
import { DurableSQLiteStore } from "../../src/adapters/state/sqlite.js";
import {
  DurableContexts,
  DurableSubmission,
  ExecutionClaims,
  DurableExecutor,
  DurableRecovery,
  DurableEngine,
  DurableWork,
  DurableLocalProtocol,
  type AuthorizationPolicy,
  type ExecutionBinding,
  type FeatureDependencies,
} from "../../src/runtime/core/index.js";
/** Construction only. The existing host must inject real services and call lifecycle methods. */
export function composeEngine(input: {
  databasePath: string;
  clock: Clock;
  policy: AuthorizationPolicy;
  features: readonly ExecutionBinding[];
  dependencies: FeatureDependencies;
  diagnostics(): { ready: boolean; activation: "disabled" | "enabled" };
}) {
  const store = new DurableSQLiteStore(input.databasePath);
  const contexts = new DurableContexts(store, input.clock, input.policy);
  const claims = new ExecutionClaims(store, contexts);
  const executor = new DurableExecutor(claims, input.dependencies);
  const submission = new DurableSubmission(store, contexts, (id) =>
    executor.cancel(id),
  );
  const recovery = new DurableRecovery(store, contexts);
  const engine = new DurableEngine(
    submission,
    executor,
    recovery,
    input.features,
  );
  const work = new DurableWork(store, contexts);
  const protocol = new DurableLocalProtocol({
    contexts,
    submission: engine,
    work,
    capabilities: (c) => input.features.map((f) => f.capability(c)),
    diagnostics: input.diagnostics,
  });
  return {
    store,
    contexts,
    engine,
    work,
    protocol,
    recover: () => engine.recover(),
    startOutbox: () => engine.startOutbox(),
    stopOutbox: () => engine.stopOutbox(),
  };
}
