import type { Space } from "spectrum-ts";
import type { Clock, Scope } from "../../contracts/index.js";
import { scopeKey } from "../../adapters/transport/provider-context.js";

export interface TimerPort {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
export const systemTimers: TimerPort = {
  set: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    timer.unref();
    return timer;
  },
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
export type TypingSpace = Pick<Space, "startTyping" | "stopTyping">;
interface Lease {
  generation: number;
  token: number;
  startAt: number;
  expiresAt: number;
  detach?: () => void;
  validate?: () => void;
}
interface Conversation {
  scope: Scope;
  highestGeneration: number;
  lease?: Lease;
  observed: boolean;
  running: boolean;
  timer?: unknown;
  space?: TypingSpace;
  blocked: boolean;
}
export interface TypingTicket {
  scope: Scope;
  generation: number;
  token: number;
}
/** Control calls have their own per-conversation queue, independent of uploads
 * and reply sends. No persistent start jobs: a restarted manager starts idle. */
export class TypingLeases {
  private readonly conversations = new Map<string, Conversation>();
  private token = 0;
  private readonly pending = new Set<Promise<void>>();
  private stopped = false;
  private connected = true;
  constructor(
    private readonly clock: Clock,
    private readonly resolve: (scope: Scope) => Promise<TypingSpace>,
    private readonly timers: TimerPort = systemTimers,
    private readonly report: (code: string) => void = () => {},
  ) {}
  begin(
    scope: Scope,
    generation: number,
    ttlMs: number,
    options: {
      delayMs?: number;
      signal?: AbortSignal;
      validate?: () => void;
    } = {},
  ): TypingTicket | undefined {
    if (this.stopped || !this.connected || options.signal?.aborted) return;
    if (
      !Number.isSafeInteger(generation) ||
      generation < 0 ||
      !Number.isFinite(ttlMs) ||
      ttlMs < 100 ||
      ttlMs > 30000 ||
      (options.delayMs !== undefined &&
        (!Number.isFinite(options.delayMs) || options.delayMs < 0))
    )
      throw new Error("INVALID_TYPING_LEASE");
    const key = scopeKey(scope);
    let state = this.conversations.get(key);
    if (!state) {
      state = {
        scope,
        highestGeneration: generation,
        observed: false,
        running: false,
        blocked: false,
      };
      this.conversations.set(key, state);
    }
    if (generation < state.highestGeneration) return;
    state.highestGeneration = generation;
    this.clearLease(state);
    const ticket = { scope, generation, token: ++this.token };
    const lease: Lease = {
      generation,
      token: ticket.token,
      startAt: this.clock.now() + (options.delayMs ?? 0),
      expiresAt: this.clock.now() + ttlMs,
    };
    lease.validate = options.validate;
    state.lease = lease;
    if (options.signal) {
      const abort = () => this.end(ticket);
      options.signal.addEventListener("abort", abort, { once: true });
      lease.detach = () => options.signal!.removeEventListener("abort", abort);
    }
    this.schedule(state);
    this.dispatch(state);
    return ticket;
  }
  end(ticket: Omit<TypingTicket, "token"> & { token?: number }): void {
    const state = this.conversations.get(scopeKey(ticket.scope));
    if (
      !state?.lease ||
      state.lease.generation !== ticket.generation ||
      (ticket.token !== undefined && ticket.token !== state.lease.token)
    )
      return;
    this.clearLease(state);
    this.schedule(state);
    this.dispatch(state);
  }
  private clearLease(state: Conversation) {
    state.lease?.detach?.();
    state.lease = undefined;
  }
  private desired(state: Conversation): boolean {
    if (state.lease && this.clock.now() >= state.lease.expiresAt)
      this.clearLease(state);
    return (
      !this.stopped &&
      this.connected &&
      !!state.lease &&
      this.clock.now() >= state.lease.startAt
    );
  }
  private schedule(state: Conversation): void {
    if (state.timer !== undefined) this.timers.clear(state.timer);
    state.timer = undefined;
    const lease = state.lease;
    if (!lease) return;
    const next =
      this.clock.now() < lease.startAt
        ? Math.min(lease.startAt, lease.expiresAt)
        : lease.expiresAt;
    state.timer = this.timers.set(
      () => {
        this.desired(state);
        this.schedule(state);
        this.dispatch(state);
      },
      Math.max(0, next - this.clock.now()),
    );
  }
  private dispatch(state: Conversation): void {
    const work = this.pump(state);
    this.pending.add(work);
    void work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work),
    );
  }
  /** Bound shutdown waiting: a hung SDK call cannot hold the host forever.
   * A timeout reports uncertainty; it does not claim the remote indicator stopped. */
  async drain(timeoutMs = 1000): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const completed = await Promise.race([
      Promise.allSettled([...this.pending]).then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (!completed) this.report("TYPING_SHUTDOWN_INCOMPLETE");
    return completed;
  }
  private async pump(state: Conversation): Promise<void> {
    if (state.running || state.blocked) return;
    state.running = true;
    try {
      while (true) {
        const desired = this.desired(state);
        if (desired === state.observed) return;
        const resolvingLease = state.lease;
        try {
          state.space ??= await this.resolve(state.scope);
        } catch {
          this.report("TYPING_RESOLUTION_FAILED");
          if (
            state.lease &&
            state.lease !== resolvingLease &&
            this.desired(state)
          )
            continue;
          this.clearLease(state);
          return;
        }
        // Resolution may be delayed beyond expiration/cancellation.
        const active = this.desired(state);
        if (active === state.observed) continue;
        const dispatchedLease = state.lease;
        try {
          if (active) {
            state.lease?.validate?.();
            await state.space.startTyping();
          } else await state.space.stopTyping();
          state.observed = active; // SDK completion only, never a visibility claim.
        } catch {
          this.report("TYPING_PROVIDER_FAILURE");
          // A failure belongs to the dispatched lease, not a newer generation
          // that arrived while its RPC was pending.
          if (state.lease === dispatchedLease) this.clearLease(state);
          if (active) {
            // A rejected start may still have reached the provider. Attempt stop once.
            try {
              await state.space.stopTyping();
              state.observed = false;
            } catch {
              state.blocked = true;
              this.report("TYPING_STOP_UNKNOWN");
            }
          } else {
            state.blocked = true;
            this.report("TYPING_STOP_UNKNOWN");
          }
          if (
            state.lease &&
            state.lease !== dispatchedLease &&
            this.desired(state)
          ) {
            // Reassert the new generation after the old control has settled.
            state.blocked = false;
            state.observed = false;
            continue;
          }
          return;
        }
      }
    } catch {
      this.clearLease(state);
      this.report("TYPING_RESOLUTION_FAILED");
    } finally {
      state.running = false;
      this.schedule(state);
    }
  }
  /** Host calls on observed connection loss. The SDK exposes no such callback;
   * do not invent one. Invalidated generations never resume automatically. */
  connectionLost(): void {
    this.connected = false;
    for (const state of this.conversations.values()) {
      this.clearLease(state);
      this.schedule(state);
      this.dispatch(state);
    }
  }
  connectionRestored(): void {
    this.connected = true;
    for (const state of this.conversations.values()) {
      state.blocked = false;
      this.dispatch(state);
    }
  }
  shutdown(): void {
    this.stopped = true;
    for (const state of this.conversations.values()) {
      this.clearLease(state);
      this.schedule(state);
      this.dispatch(state);
    }
  }
  /** Waiting on a long worker explicitly ends active typing; resume needs a new begin. */
  waiting(ticket: TypingTicket): void {
    this.end(ticket);
  }
  async responding<T>(
    scope: Scope,
    generation: number,
    fn: (ticket: TypingTicket | undefined) => Promise<T>,
    options: { ttlMs?: number; delayMs?: number; signal?: AbortSignal } = {},
  ): Promise<T> {
    const ticket = this.begin(
      scope,
      generation,
      options.ttlMs ?? 30000,
      options,
    );
    try {
      return await fn(ticket);
    } finally {
      if (ticket) this.end(ticket);
    }
  }
  /** Host/fake clock tick expires leases without replaying an old start. */
  expire(): void {
    for (const state of this.conversations.values()) {
      this.desired(state); this.schedule(state); this.dispatch(state);
    }
  }
  evidence() {
    return {
      pending: [...this.conversations.values()].filter((s) => s.running).length,
      blocked: [...this.conversations.values()].filter((s) => s.blocked).length,
      visible: "unknown",
      persistentStarts: false,
    };
  }
}

/** Acquire a transient ticket; undefined explicitly means no start was scheduled. */
export function acquireTypingLease(leases: TypingLeases, ...args: Parameters<TypingLeases["begin"]>) {
  return leases.begin(...args);
}
/** Token/generation checks prevent an old turn from stopping a newer lease. */
export function releaseTypingLease(leases: TypingLeases, ticket: Parameters<TypingLeases["end"]>[0]): void {
  leases.end(ticket);
}
/** Explicit scheduler entrypoint; expiring input never becomes a persistent job. */
export function expireLeases(leases: TypingLeases): void { leases.expire(); }
