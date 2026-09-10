import test from "node:test";
import assert from "node:assert/strict";
import { event } from "../../fixtures/harness.js";
import { admitRequest } from "../../../src/runtime/core/admission.js";
import { resolveAndAuthorizeContext } from "../../../src/runtime/core/authorization.js";
import {
  acquireClaim,
  renewClaim,
  validateClaim,
} from "../../../src/runtime/core/claims.js";
import { checkCancellation } from "../../../src/runtime/core/cancellation.js";
import { reserveRequestIdentity } from "../../../src/runtime/core/idempotency.js";
import {
  acknowledgeWork,
  claimWork,
  heartbeatWork,
} from "../../../src/runtime/core/work-handoff.js";
import {
  applyReceiptObservation,
  getMessageStatus,
} from "../../../src/runtime/core/receipt-state.js";
import { runUnitOfWorkTransaction } from "../../../src/adapters/state/unit-of-work.js";
import type { ReceiptObservation } from "../../../src/contracts/receipts.js";
import {
  fixture,
  action,
  context,
  principal,
  space,
} from "./fixture.js";

test("admitRequest is strict and authorization comes from the transport principal", async (t) => {
  const f = fixture(t);
  assert.deepEqual(admitRequest(action()), action());
  assert.throws(
    () => admitRequest({ ...action(), trusted: true }),
    /INVALID_REQUEST/,
  );
  let getterRan = false;
  const accessor = { ...action() } as Record<string, unknown>;
  Object.defineProperty(accessor, "arguments", {
    enumerable: true,
    get: () => {
      getterRan = true;
      return action().arguments;
    },
  });
  assert.throws(() => admitRequest(accessor), /INVALID_REQUEST/);
  assert.equal(getterRan, false);
  const authorized = await resolveAndAuthorizeContext(
    f.contexts,
    principal,
    action(),
  );
  assert.equal(authorized.context.contextId, context.contextId);
  await assert.rejects(
    resolveAndAuthorizeContext(
      f.contexts,
      { ...principal, id: "forged-principal" },
      action(),
    ),
    /FORBIDDEN/,
  );
});

test("reserveRequestIdentity returns identical work and rejects conflicting key reuse", (t) => {
  const f = fixture(t);
  const first = reserveRequestIdentity(
    f.store,
    f.contexts,
    action("same-key"),
    context,
  );
  const duplicate = reserveRequestIdentity(
    f.store,
    f.contexts,
    action("same-key"),
    context,
  );
  assert.equal(first.existing, false);
  assert.equal(duplicate.existing, true);
  assert.equal(duplicate.record.id, first.record.id);
  assert.equal(f.store.scan("outbox").length, 1);
  assert.throws(
    () =>
      reserveRequestIdentity(
        f.store,
        f.contexts,
        ({
          ...action("same-key"),
          arguments: { ...action().arguments, text: "changed" },
        } as ReturnType<typeof action>),
        context,
      ),
    /IDEMPOTENCY_CONFLICT/,
  );
});

test("claim helpers renew only the current fence and cancellation is authoritative", async (t) => {
  const f = fixture(t);
  const reservation = reserveRequestIdentity(
    f.store,
    f.contexts,
    action("claim-key"),
    context,
  );
  const claim = acquireClaim(f.claims, reservation.record.id, "owner-1", 1000);
  assert.ok(claim);
  f.store.transaction((tx) => {
    assert.equal(
      validateClaim(f.claims, tx, reservation.record.id, claim).row.id,
      reservation.record.id,
    );
  });
  f.clock.advance(500);
  renewClaim(f.claims, reservation.record.id, claim, 1000);
  assert.equal(checkCancellation(f.claims, reservation.record.id, claim).id, reservation.record.id);
  const cancelled = await f.submission.cancel(reservation.record.id, context);
  assert.equal(cancelled.status, "queued");
  assert.throws(
    () => checkCancellation(f.claims, reservation.record.id, claim),
    /CANCELLED/,
  );
  assert.throws(
    () => renewClaim(f.claims, reservation.record.id, { ...claim, fence: claim.fence + 1 }, 1000),
    /STALE_FENCE/,
  );
});

test("UnitOfWork binds scope, commits continuation atomically, rolls back, and cannot be retained", (t) => {
  const f = fixture(t);
  const reservation = reserveRequestIdentity(
    f.store,
    f.contexts,
    action("uow-key"),
    context,
  );
  const claim = acquireClaim(f.claims, reservation.record.id, "uow-owner", 5000)!;
  f.store.transaction((tx) => {
    tx.put(
      "inbox",
      { id: event.eventId, scope: context.scope, revision: 0, event, state: "pending" },
      null,
    );
  });
  const wakes: string[] = [];
  let retained: Parameters<Parameters<typeof runUnitOfWorkTransaction>[0]["run"]>[0] | undefined;
  runUnitOfWorkTransaction({
    claims: f.claims,
    requestId: reservation.record.id,
    claim,
    run: (unit) => {
      retained = unit;
      const reference = unit.get("references", space.id)!;
      unit.put("references", { ...reference, revision: reference.revision + 1 }, reference.revision);
      unit.createContinuation({ id: "resume-1", eventIds: [event.eventId], resumeKey: "cursor-1" });
    },
    afterCommit: (pointer) => wakes.push(pointer.handoffId),
  });
  assert.equal(wakes.length, 1);
  assert.equal(f.store.scan("handoffs").length, 1);
  assert.throws(() => retained!.get("references", space.id), /FORBIDDEN/);
  const revision = f.store.transaction((tx) => tx.get("references", space.id)!.revision);
  assert.throws(
    () =>
      runUnitOfWorkTransaction({
        claims: f.claims,
        requestId: reservation.record.id,
        claim,
        run: (unit) => {
          const reference = unit.get("references", space.id)!;
          unit.put("references", { ...reference, revision: reference.revision + 1 }, reference.revision);
          throw new Error("rollback-me");
        },
      }),
    /rollback-me/,
  );
  assert.equal(
    f.store.transaction((tx) => tx.get("references", space.id)!.revision),
    revision,
  );
});

test("receipt state retains unresolved reads and never fabricates delivery", (t) => {
  const f = fixture(t);
  const target = { version: 1 as const, kind: "message" as const, id: "message-1", scope: context.scope };
  const early: ReceiptObservation = {
    evidenceId: "evidence-1",
    scope: context.scope,
    target: null,
    providerTargetId: "provider-message-1",
    partId: null,
    kind: "read",
    readerId: null,
    providerAt: null,
    observedAt: 1000,
    source: "provider-event",
    sourceRevision: "revision-1",
  };
  applyReceiptObservation(f.store, early, context);
  assert.equal(getMessageStatus(f.store, target).reading, "unknown");
  applyReceiptObservation(f.store, { ...early, target, observedAt: 2000 }, context);
  const status = getMessageStatus(f.store, target);
  assert.equal(status.reading, "observed");
  assert.equal(status.delivery, "unknown");
  assert.equal(status.read[0]?.providerAt, null);
  assert.equal(status.read[0]?.observedAt, 1000);
  assert.deepEqual(status.readers, []);
  assert.throws(
    () => applyReceiptObservation(f.store, { ...early, kind: "delivered" }, context),
    /EVIDENCE_ID_CONFLICT/,
  );
});

test("work helper functions fence stale acknowledgements and repeat the exact completed fence", (t) => {
  const f = fixture(t);
  f.store.transaction((tx) => {
    tx.put(
      "inbox",
      { id: event.eventId, scope: context.scope, revision: 0, event, state: "pending" },
      null,
    );
    tx.put(
      "handoffs",
      {
        id: "handoff-helper",
        scope: context.scope,
        revision: 0,
        taskId: context.taskId,
        generation: context.generation,
        principalId: context.principalId,
        eventIds: [event.eventId],
        state: "pending",
        claim: null,
        createdAt: 1000,
      },
      null,
    );
  });
  const first = claimWork(f.work, context, "handoff-helper", 1000);
  const oldFence = first.handoff.claim!.fence;
  heartbeatWork(f.work, context, "handoff-helper", oldFence, 1000);
  f.clock.advance(1001);
  const next = claimWork(f.work, context, "handoff-helper", 1000);
  assert.throws(
    () => acknowledgeWork(f.work, context, "handoff-helper", oldFence),
    /STALE_FENCE/,
  );
  const acknowledged = acknowledgeWork(
    f.work,
    context,
    "handoff-helper",
    next.handoff.claim!.fence,
  );
  assert.deepEqual(
    acknowledgeWork(f.work, context, "handoff-helper", next.handoff.claim!.fence),
    acknowledged,
  );
});
