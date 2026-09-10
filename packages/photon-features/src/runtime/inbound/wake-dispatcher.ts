import type { Clock, Scope, WakeAdapter } from "../../contracts/index.js";
import type { ExistingGrokTaskHandoff } from "../../adapters/legacy/index.js";
import type { TransactionStore } from "../../state/index.js";
import { activeRoute, type TaskRoute } from "./router.js";

/** Binding is supplied by the existing orchestrator's verified deployment.
 * There is deliberately no HTTP endpoint, model, command, or fake fallback. */
export class ExistingGrokWakeAdapter implements WakeAdapter {
  constructor(private readonly existing: ExistingGrokTaskHandoff) {}
  async wake(pointer: Parameters<WakeAdapter["wake"]>[0]) {
    return { status: await this.existing.notifyExistingTask(pointer) };
  }
}
export class WakeDispatcher {
  private running = false;
  constructor(
    private readonly store: TransactionStore,
    private readonly clock: Clock,
    private readonly wakeAdapter: WakeAdapter,
  ) {}
  /** Retry on host scheduler ticks. Durable pending/expired claims are the retry
   * ledger; acceptance alone never marks work acknowledged. Adapter must dedupe by ID. */
  async tick(
    scope: Scope,
    route: TaskRoute,
  ): Promise<
    { handoffId: string; status: "accepted" | "failed" | "unknown" }[]
  > {
    if (this.running) return [];
    this.running = true;
    try {
      const rows = this.store.transaction((tx) =>
        activeRoute(tx, scope, route)
          ? tx.listWork(
              scope,
              route.principalId,
              route.taskId,
              route.generation,
              this.clock.now(),
              100,
            )
          : [],
      );
      const results = [];
      for (const row of rows) {
        const valid = this.store.transaction((tx) => {
          const current = tx.get("handoffs", row.id);
          return (
            activeRoute(tx, scope, route) && current?.revision === row.revision
          );
        });
        if (!valid) continue;
        let status: "accepted" | "failed" | "unknown" = "unknown";
        try {
          ({ status } = await this.wakeAdapter.wake({
            handoffId: row.id,
            taskId: row.taskId,
            generation: row.generation,
          }));
        } catch {
          status = "failed";
        }
        results.push({ handoffId: row.id, status });
      }
      return results;
    } finally {
      this.running = false;
    }
  }
}

/** Explicit configuration gate: no invented endpoint or successful no-op fallback. */
export function configuredGrokWake(binding?: ExistingGrokTaskHandoff): ExistingGrokWakeAdapter {
  if (!binding || typeof binding.notifyExistingTask !== "function") throw new Error("GROK_WAKE_NOT_CONFIGURED");
  return new ExistingGrokWakeAdapter(binding);
}
/** Send durable pointers only. Wake acceptance never acknowledges work retrieval. */
export function dispatchWake(dispatcher: WakeDispatcher, scope: Scope, route: TaskRoute) {
  return dispatcher.tick(scope, route);
}
