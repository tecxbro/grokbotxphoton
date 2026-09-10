import type {
  Action,
  OperationResult,
  TrustedContext,
} from "../../contracts/index.js";
import type { SubmissionPort } from "../../host/protocol.js";
import { DurableExecutor, type ExecutionBinding } from "./executor.js";
import { DurableRecovery, scanAll } from "./recovery.js";
import { DurableSubmission, saveOutbox } from "./submission.js";
/** Event-driven driver for the one F0 outbox. Explicit host activation only. */
export class DurableEngine implements SubmissionPort {
  private active = false;
  private drive: Promise<void> | undefined;
  private dirty = false;
  private leaseTimer: ReturnType<typeof setTimeout> | undefined;
  private failed = false;
  private readonly bindings: ReadonlyMap<string, ExecutionBinding>;
  constructor(
    readonly submission: DurableSubmission,
    readonly executor: DurableExecutor,
    readonly recovery: DurableRecovery,
    bindings: readonly ExecutionBinding[],
  ) {
    if (
      new Set(bindings.map((b) => b.handler.operation)).size !== bindings.length
    )
      throw new Error("DUPLICATE_HANDLER");
    this.bindings = new Map(bindings.map((b) => [b.handler.operation, b]));
  }
  async submit(action: Action, c: TrustedContext): Promise<OperationResult> {
    const r = await this.submission.submit(action, c);
    this.kick();
    return r;
  }
  status(id: string, c: TrustedContext): Promise<OperationResult> {
    return this.submission.status(id, c);
  }
  async cancel(id: string, c: TrustedContext): Promise<OperationResult> {
    const r = await this.submission.cancel(id, c);
    this.executor.cancel(id);
    this.kick();
    return r;
  }
  async recover(): Promise<void> {
    this.recovery.recover();
  }
  async startOutbox(): Promise<void> {
    if (this.active) throw new Error("OUTBOX_ALREADY_STARTED");
    this.active = true;
    this.failed = false;
    this.kick();
  }
  async stopOutbox(): Promise<void> {
    this.active = false;
    if (this.leaseTimer) clearTimeout(this.leaseTimer);
    this.executor.abortAll();
    await this.drive;
  }
  ready(): boolean {
    return this.active && !this.failed;
  }
  /** Can also be called by an approved host retry/reconciliation adapter after committing state. */
  kick(): void {
    if (!this.active) return;
    this.dirty = true;
    if (this.drive) return;
    this.drive = Promise.resolve()
      .then(() => this.drain())
      .catch(() => {
        this.failed = true;
        this.active = false;
      })
      .finally(() => {
        this.drive = undefined;
        if (this.dirty && this.active) this.kick();
      });
  }
  private async drain(): Promise<void> {
    while (this.active && this.dirty) {
      this.dirty = false;
      this.recovery.recover();
      let progressed = false;
      let batch: Promise<OperationResult | null>[] = [];
      const flush = async () => {
        const results = await Promise.allSettled(batch);
        batch = [];
        if (results.some((r) => r.status === "fulfilled" && r.value !== null))
          progressed = true;
        if (results.some((r) => r.status === "rejected"))
          this.recovery.recover();
      };
      for (const row of scanAll(this.recovery.store, "outbox")) {
        if (!this.active) break;
        if (row.result.status !== "queued") continue;
        const binding = this.bindings.get(row.action.operation);
        if (!binding) {
          this.recovery.store.transaction((tx) => {
            const r = tx.get("outbox", row.id);
            if (!r || r.result.status !== "queued" || r.claim) return;
            r.result.status = "blocked";
            r.result.error = {
              code: "UNIMPLEMENTED",
              message: "UNIMPLEMENTED",
              retry: "safe-before-dispatch",
            };
            saveOutbox(tx, r, this.recovery.contexts.clock.now());
          });
          continue;
        }
        batch.push(this.executor.execute(row.id, binding));
        if (batch.length >= this.executor.concurrency) await flush();
      }
      await flush();
      if (progressed) this.dirty = true;
    }
    if (this.leaseTimer) clearTimeout(this.leaseTimer);
    if (this.active) {
      const leases = [...scanAll(this.recovery.store, "outbox")]
        .filter((r) => r.result.status === "queued" && r.claim)
        .map((r) => r.claim!.leaseUntil);
      if (leases.length) {
        this.leaseTimer = setTimeout(
          () => this.kick(),
          Math.max(1, Math.min(...leases) - this.recovery.contexts.clock.now()),
        );
        this.leaseTimer.unref();
      }
    }
  }
}
