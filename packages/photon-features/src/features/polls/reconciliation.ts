import type { EventReducer, Scope, Transaction, TransactionStore } from "../../index.js";
import { registerNativeOptions } from "./identity.js";

/** Retry retained events after authoritative identity registration, within bounded UoW work.
 * No SDK calls; missing native lookup/order/actor remains explicitly unresolved at F0.
 * Network reads, once approved, must happen before this transaction and be version checked.
 */
export function reconcilePollEvents(store: TransactionStore, scope: Scope, reducer: EventReducer) {
  return store.transaction(tx => reconcileInTransaction(tx, scope, reducer));
}

/** Use after an approved native metadata read. Registration and pending option/vote continuations commit together. */
export function registerAndReconcilePollOptions(store: TransactionStore,
  input: Parameters<typeof registerNativeOptions>[1], reducer: EventReducer) {
  return store.transaction(tx => {
    registerNativeOptions(tx, input);
    return reconcileInTransaction(tx, input.poll.scope, reducer);
  });
}

function reconcileInTransaction(tx: Transaction, scope: Scope, reducer: EventReducer) {
    const rows = tx.list("inbox", scope, 1000);
    if (rows.length === 1000) throw new Error("RECONCILIATION_REQUIRES_PAGINATION");
    let resolved = 0;
    let unresolved = 0;
    for (const row of rows) {
      if (row.event.type !== "poll" || row.state === "reduced") continue;
      reducer.reduce(row.event, tx);
      if (tx.get("inbox", row.id)?.state === "reduced") resolved++;
      else unresolved++;
    }
    return { resolved, unresolved };
}

import type { UnitOfWork } from "../../contracts/store.js";
import type { TrustedContext } from "../../contracts/context.js";
import type { IncomingEvent } from "../../contracts/events.js";
import { resolvePollIdentity, type PollRef } from "./identity.js";
import { applyPollEvent, type PollEventPolicy } from "./reducer.js";

/** Data from a shared-owner authoritative lookup, never derived from labels or caller choice keys.
 * Full options are required so a partial/stale snapshot cannot remove known identities.
 * This snapshot registers metadata only, not provider vote state or delivery evidence.
 */
export interface NativePollIdentitySnapshot {
  poll: PollRef;
  nativePollGuid: string;
  options: readonly {nativeId: string; label: string}[];
}

/** Registration only: network lookup must finish before opening this UoW.
 * The host rechecks active claim and task generation around lookup and transaction.
 * Without a snapshot F0 cannot do a native lookup; return an explicit shared blocker.
 */
export function reconcilePollState(unit: UnitOfWork, context: Readonly<TrustedContext>,
  snapshot?: NativePollIdentitySnapshot) {
  if (!snapshot) return { status: "blocked" as const, blockerId: "wt-05-advanced-polls" };
  const poll = resolvePollIdentity(unit, snapshot.poll, context);
  const options = registerNativeOptions(unit, { ...snapshot, poll: poll.reference });
  return { status: "registered" as const, options };
}

/** Reprocess a bounded batch loaded from the shared durable inbox after identity registration.
 * This function does not claim to persist unresolved events: caller must retain each unresolved
 * disposition and atomically acknowledge successful ones. Exceptions roll back the whole batch.
 */
export function retryUnresolvedPollEvents(events: readonly IncomingEvent[], unit: UnitOfWork,
  context: Readonly<TrustedContext>, policy: PollEventPolicy) {
  if (events.length > 100) throw new Error("POLL_RECONCILIATION_BATCH_TOO_LARGE");
  return events.map(event => ({ eventId: event.eventId, ...applyPollEvent(event, unit, context, policy) }));
}
