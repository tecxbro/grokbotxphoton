import type { Table, StateTables } from "../../state/index.js";
import type { TrustedContext } from "../../contracts/index.js";
import { DurableSQLiteStore } from "../../adapters/state/sqlite.js";
import { DurableContexts } from "./authorization.js";
import { saveOutbox } from "./submission.js";
import { fault, publicError } from "./errors.js";
export function* scanAll<K extends Table>(
  store: DurableSQLiteStore,
  table: K,
): Generator<StateTables[K]> {
  let after = "";
  for (;;) {
    const rows = store.scan(table, after);
    if (!rows.length) return;
    for (const row of rows) yield row;
    after = rows.at(-1)!.id;
  }
}
/** Recovery performs no provider call. Unknown children and references are retained indefinitely. */
export class DurableRecovery {
  constructor(
    readonly store: DurableSQLiteStore,
    readonly contexts: DurableContexts,
  ) {}
  recover(): { requeued: number; unknown: number; blocked: number } {
    const counts = { requeued: 0, unknown: 0, blocked: 0 };
    for (const candidate of scanAll(this.store, "outbox")) {
      if (candidate.result.status !== "queued") continue;
      this.store.transaction((tx) => {
        const row = tx.get("outbox", candidate.id),
          now = this.contexts.clock.now();
        if (
          !row ||
          row.result.status !== "queued" ||
          (row.claim && row.claim.leaseUntil > now)
        )
          return;
        const attempts = [...scanAll(this.store, "attempts")].filter(
          (a) => a.requestId === row.id,
        );
        const uncertain = attempts.some(
          (a) => a.phase === "dispatching" || a.phase === "unknown",
        );
        if (uncertain) {
          for (const a of attempts.filter((a) => a.phase === "dispatching")) {
            a.phase = "unknown";
            a.finishedAt = now;
            a.revision++;
            tx.put("attempts", a, a.revision - 1);
          }
          for (const child of scanAll(this.store, "children"))
            if (child.requestId === row.id && child.state === "dispatching") {
              child.state = "unknown";
              child.revision++;
              tx.put("children", child, child.revision - 1);
            }
          row.result.status = "unknown-outcome";
          row.result.error = {
            code: "UNKNOWN_OUTCOME",
            message: "UNKNOWN_OUTCOME",
            retry: "reconcile-first",
          };
          counts.unknown++;
        } else {
          try {
            if (row.cancellationRequestedAt !== null) fault("CANCELLED");
            const c = this.contexts.current(
              tx,
              row.principalId,
              row.action.contextId,
            );
            this.contexts.owned(tx, row.id, c);
            this.contexts.action(tx, c, row.action);
            if (!row.claim) return;
            counts.requeued++;
          } catch (e) {
            const err = publicError(e);
            row.result.status =
              err.code === "CANCELLED" && row.result.references.length === 0
                ? "cancelled"
                : "blocked";
            row.result.error = err;
            counts.blocked++;
          }
        }
        row.claim = null;
        saveOutbox(tx, row, now);
      });
    }
    // Expired handoffs remain retrievable via listWork; claiming advances their stored fence.
    return counts;
  }
  retry(id: string, c: TrustedContext): void {
    this.store.transaction((tx) => {
      const row = this.contexts.owned(tx, id, c);
      if (
        row.result.status !== "blocked" ||
        row.claim ||
        row.cancellationRequestedAt !== null
      )
        fault("FORBIDDEN");
      this.contexts.action(tx, c, row.action);
      if (
        [...scanAll(this.store, "attempts")].some(
          (a) =>
            a.requestId === id &&
            (a.phase === "unknown" || a.phase === "dispatching"),
        )
      )
        fault("UNKNOWN_OUTCOME");
      for (const checkpoint of scanAll(this.store, "checkpoints"))
        if (
          checkpoint.requestId === id &&
          checkpoint.codecId === "wt01-child-result" &&
          checkpoint.codecVersion === 1
        ) {
          const outcome = JSON.parse(checkpoint.payloadJson) as {
            status?: string;
          };
          if (
            ["failed", "blocked", "cancelled", "unknown-outcome"].includes(
              outcome.status ?? "",
            )
          )
            fault("FORBIDDEN");
        }
      row.result.status = "queued";
      delete row.result.error;
      saveOutbox(tx, row, this.contexts.clock.now());
    });
  }
  /** F0 has no delete API/dependency graph. Retaining every record is conservative and safe. */
  retentionPolicy(): { automaticDeletion: false; reason: string } {
    return {
      automaticDeletion: false,
      reason:
        "Retain durable resources and uncertain operations until a shared dependency-aware retention contract is approved.",
    };
  }
}

/** Recover durable state without dispatching or retrying any provider operation. */
export function recoverPendingWork(
  recovery: DurableRecovery,
): { requeued: number; unknown: number; blocked: number } {
  return recovery.recover();
}
