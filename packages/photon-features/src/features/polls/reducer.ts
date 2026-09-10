import { isDeepStrictEqual } from "node:util";
import {
  incomingEventSchema, sameScope,
  type EventReducer, type IncomingEvent, type Transaction,
} from "../../index.js";
import { pollForEvent, referenceOwner, scopedId } from "./identity.js";

export interface PollReductionPolicy {
  /** Only host-verified monotonically increasing decimal sequence sources. No arrival-time ordering. */
  orderedSources: readonly string[];
  /** Must be verified by ingress normalization; raw single-choice "voted" does not prove this. */
  selectionSemantics?: "independent-option-deltas" | "unknown";
}

function sameEvent(a: IncomingEvent, b: IncomingEvent): boolean {
  const { receivedAt: _a, eventId: _aid, ...left } = a;
  const { receivedAt: _b, eventId: _bid, ...right } = b;
  return isDeepStrictEqual(left, right);
}

function retainUnresolved(event: IncomingEvent, tx: Transaction, reason: string) {
  const inbox = tx.get("inbox", event.eventId);
  if (inbox && inbox.state !== "unresolved") tx.put("inbox", {
    ...inbox, revision: inbox.revision + 1, state: "unresolved",
  }, inbox.revision);
  const id = scopedId("unresolved", event.scope, event.eventId);
  const prior = tx.get("unresolved", id);
  if (!prior || prior.reason !== reason) tx.put("unresolved", {
    id, scope: event.scope, revision: prior ? prior.revision + 1 : 0,
    eventId: event.eventId, reason, checkpointId: null,
  }, prior?.revision ?? null);
}

function markReduced(event: IncomingEvent, tx: Transaction) {
  const inbox = tx.get("inbox", event.eventId)!;
  if (inbox.state !== "reduced") tx.put("inbox", {
    ...inbox, revision: inbox.revision + 1, state: "reduced",
  }, inbox.revision);
  const id = scopedId("unresolved", event.scope, event.eventId);
  const unresolved = tx.get("unresolved", id);
  // F0 has no delete/status field. Keep resolution history; inbox state is authoritative.
  if (unresolved && unresolved.reason !== "resolved") tx.put("unresolved", {
    ...unresolved, revision: unresolved.revision + 1, reason: "resolved",
  }, unresolved.revision);
}

export function createPollReducer(policy: PollReductionPolicy = { orderedSources: [] }): EventReducer {
  return {
    type: "poll",
    reduce(event, tx) {
      if (event.type !== "poll") return;
      incomingEventSchema.parse(event);
      const priorInbox = tx.get("inbox", event.eventId);
      if (priorInbox && (!sameScope(priorInbox.scope, event.scope) ||
          !sameEvent(priorInbox.event, event))) throw new Error("EVENT_IDENTITY_CONFLICT");
      if (priorInbox?.state === "reduced") return;
      if (!priorInbox) tx.put("inbox", {
        id: event.eventId, scope: event.scope, revision: 0, event, state: "pending",
      }, null);
      let poll;
      try {
        if (!sameScope(event.poll.scope, event.scope) || !sameScope(event.option.scope, event.scope) ||
            event.option.pollId !== event.poll.id || event.targets.some(t => !sameScope(t.scope, event.scope)))
          throw new Error("EVENT_SCOPE_OR_PARENT_MISMATCH");
        poll = pollForEvent(tx, event.poll);
      } catch (error) {
        retainUnresolved(event, tx, error instanceof Error ? error.message : "UNKNOWN_POLL");
        return;
      }
      const owner = referenceOwner(tx, poll.reference);
      const task = tx.get("tasks", owner.taskId);
      if (!task || !sameScope(task.scope, event.scope) || task.generation !== owner.generation ||
          task.principalId !== owner.ownedByPrincipalId || task.cancelledAt !== null) {
        retainUnresolved(event, tx, "ORIGINATING_TASK_UNAVAILABLE");
        return;
      }
      const options = poll.options.filter(o => {
        const native = tx.get("references", o.reference.id);
        return native && sameScope(native.scope, event.scope) &&
          (event.option.id === o.reference.id || event.option.id === native.providerId);
      });
      if (options.length !== 1) {
        retainUnresolved(event, tx, options.length ? "AMBIGUOUS_OPTION" : "NATIVE_OPTION_LOOKUP_REQUIRED");
        return;
      }
      const option = options[0]!;
      const handoffId = scopedId("handoff", event.scope,
        event.ordering.source, event.providerEventId ?? event.eventId, owner.taskId, owner.generation);
      const priorHandoff = tx.get("handoffs", handoffId);
      if (priorHandoff) {
        const original = tx.get("inbox", priorHandoff.eventIds[0]!);
        if (!original || !sameEvent(original.event, event)) {
          retainUnresolved(event, tx, "PROVIDER_EVENT_IDENTITY_CONFLICT"); return;
        }
        markReduced(event, tx); return;
      }
      // F0 requires actorId. WT-02 must quarantine missing actors, never fill a sentinel/bot identity.
      const seq = event.ordering.sequence;
      if (!policy.orderedSources.includes(event.ordering.source) || !seq || !/^\d{1,100}$/.test(seq)) {
        retainUnresolved(event, tx, "AUTHORITATIVE_ORDERING_REQUIRED");
        return;
      }
      if (event.change !== "option-added") {
        if (policy.selectionSemantics !== "independent-option-deltas") {
          retainUnresolved(event, tx, "SELECTION_SEMANTICS_REQUIRE_NATIVE_STATE"); return;
        }
        const id = scopedId("vote", event.scope, poll.id, option.reference.id, event.actorId);
        const vote = tx.get("votes", id);
        const sourceRevision = JSON.stringify({ source: event.ordering.source, sequence: BigInt(seq).toString() });
        const active = event.change === "vote";
        if (vote) {
          let ordering: { source?: string; sequence?: string };
          try { ordering = JSON.parse(vote.sourceRevision ?? "null"); }
          catch { ordering = {}; }
          if (!ordering || ordering.source !== event.ordering.source || !ordering.sequence ||
              !/^\d{1,100}$/.test(ordering.sequence)) {
            retainUnresolved(event, tx, "INCOMPARABLE_ORDERING"); return;
          }
          const comparison = BigInt(seq) - BigInt(ordering.sequence);
          if (comparison < 0n || (comparison === 0n && vote.active === active)) {
            markReduced(event, tx); return;
          }
          if (comparison === 0n) { retainUnresolved(event, tx, "CONFLICTING_REVISION"); return; }
        }
        tx.put("votes", {
          id, scope: event.scope, revision: vote ? vote.revision + 1 : 0,
          pollId: poll.id, optionId: option.reference.id, actorId: event.actorId,
          active, sourceRevision, eventId: event.eventId,
        }, vote?.revision ?? null);
        if (vote?.active === active) { markReduced(event, tx); return; }
      }
      // This transaction also owns inbox reduction. Only the shared post-commit dispatcher wakes Grok.
      if (!tx.get("handoffs", handoffId)) tx.put("handoffs", {
        id: handoffId, scope: event.scope, revision: 0,
        taskId: owner.taskId, generation: owner.generation, principalId: owner.ownedByPrincipalId,
        eventIds: [event.eventId], state: "pending", claim: null, createdAt: event.receivedAt,
      }, null);
      markReduced(event, tx);
      return { continuationId: handoffId };
    },
  };
}

import type { UnitOfWork } from "../../contracts/store.js";
import type { TrustedContext } from "../../contracts/context.js";
import { resolvePollIdentity, resolveOptionIdentity } from "./identity.js";

/** Normalizer evidence, not participant IDs supplied by an action or guessed sentinels. */
export interface PollEventPolicy extends PollReductionPolicy {
  verifiedActors: readonly string[];
}
export type PollEventDisposition =
  | { status: "applied" | "duplicate" | "stale"; continuationId?: string }
  | { status: "unresolved"; reason: string };
const unresolved = (reason: string): PollEventDisposition => ({ status: "unresolved", reason });

/** Pure synchronous F0 reducer. Host captures/retains inbox events and selects the ORIGINAL task's
 * authorized UoW before calling this function. State and continuation share that transaction;
 * storage/commit failures propagate for rollback. No network, subscriptions or wake here.
 */
export function applyPollEvent(input: IncomingEvent, unit: UnitOfWork,
  context: Readonly<TrustedContext>, policy: PollEventPolicy): PollEventDisposition {
  const parsed = incomingEventSchema.safeParse(input);
  if (!parsed.success || parsed.data.type !== "poll") return unresolved("INVALID_POLL_EVENT");
  const event = parsed.data;
  if (!sameScope(event.scope, context.scope) || !sameScope(event.poll.scope, event.scope) ||
      !sameScope(event.option.scope, event.scope) || event.option.pollId !== event.poll.id ||
      event.targets.some(t => !sameScope(t.scope, event.scope))) return unresolved("EVENT_SCOPE_OR_PARENT_MISMATCH");
  if (event.direction !== "inbound") return unresolved("INBOUND_INTERACTION_REQUIRED");
  if (!policy.verifiedActors.includes(event.actorId)) return unresolved("UNKNOWN_VOTER");
  const seq = event.ordering.sequence;
  if (!policy.orderedSources.includes(event.ordering.source) || !seq || !/^\d{1,100}$/.test(seq))
    return unresolved("AUTHORITATIVE_ORDERING_REQUIRED");
  let poll, option;
  try {
    poll = resolvePollIdentity(unit, event.poll, context);
    option = resolveOptionIdentity(unit, poll, event.option, context);
    for (const target of event.targets) {
      if (target.kind === "poll" && resolvePollIdentity(unit, target, context).id !== poll.id)
        return unresolved("AMBIGUOUS_EVENT_TARGET");
      if (target.kind === "poll-option" && resolveOptionIdentity(unit, poll, target, context).reference.id !== option.reference.id)
        return unresolved("AMBIGUOUS_EVENT_TARGET");
      if (target.kind === "message") {
        const native = unit.get("references", poll.reference.messageId)!;
        if (target.id !== poll.reference.messageId && target.id !== native.providerId)
          return unresolved("AMBIGUOUS_EVENT_TARGET");
      }
      if (!["poll", "poll-option", "message", "space"].includes(target.kind))
        return unresolved("UNSUPPORTED_EVENT_TARGET");
      if (target.kind === "space" && target.id !== context.scope.spaceId)
        return unresolved("AMBIGUOUS_EVENT_TARGET");
    }
  } catch (error) {
    // Only identity ambiguity is a disposition. Infrastructure errors must abort the transaction.
    const reason = error instanceof Error ? error.message : "";
    if (["SCOPE_MISMATCH", "POLL_OPTION_MISMATCH", "UNKNOWN_POLL", "AMBIGUOUS_POLL", "FORBIDDEN",
      "STALE_GENERATION", "AMBIGUOUS_OPTION", "NATIVE_OPTION_LOOKUP_REQUIRED"].includes(reason)) return unresolved(reason);
    throw error;
  }
  const continuationId = scopedId("continuation", event.scope, context.taskId, context.generation,
    event.change === "option-added" ? ["option-added", poll.id, option.reference.id] :
      [event.ordering.source, poll.id, option.reference.id, event.actorId, BigInt(seq).toString()]);
  if (event.change !== "option-added") {
    if (policy.selectionSemantics !== "independent-option-deltas")
      return unresolved("SELECTION_SEMANTICS_REQUIRE_NATIVE_STATE");
    const id = scopedId("vote", event.scope, poll.id, option.reference.id, event.actorId);
    const prior = unit.get("votes", id);
    const active = event.change === "vote";
    if (prior) {
      if (!sameScope(prior.scope, event.scope) || prior.pollId !== poll.id ||
          prior.optionId !== option.reference.id || prior.actorId !== event.actorId)
        return unresolved("VOTE_IDENTITY_CONFLICT");
      let ordering: {source?: string; sequence?: string} | null;
      try { ordering = JSON.parse(prior.sourceRevision ?? "null"); } catch { ordering = null; }
      if (!ordering || ordering.source !== event.ordering.source || !ordering.sequence || !/^\d{1,100}$/.test(ordering.sequence))
        return unresolved("INCOMPARABLE_ORDERING");
      const comparison = BigInt(seq) - BigInt(ordering.sequence);
      if (comparison < 0n) return { status: "stale" };
      if (comparison === 0n) return prior.active === active ? { status: "duplicate" } : unresolved("CONFLICTING_REVISION");
    }
    unit.put("votes", { id, scope: event.scope, revision: prior ? prior.revision + 1 : 0,
      pollId: poll.id, optionId: option.reference.id, actorId: event.actorId, active,
      sourceRevision: JSON.stringify({ source: event.ordering.source, sequence: BigInt(seq).toString() }),
      eventId: event.eventId }, prior?.revision ?? null);
    // Persist an unvote tombstone even when no earlier vote was delivered; late votes cannot revive it.
    if (prior?.active === active || (!prior && !active)) return { status: "applied" };
  }
  // Option-add replay relies on F0's idempotent continuation identity. It never creates a fake vote.
  unit.createContinuation({ id: continuationId, eventIds: [event.eventId],
    resumeKey: scopedId("resume", event.scope, context.taskId, context.generation, poll.id) });
  return { status: "applied", continuationId };
}
