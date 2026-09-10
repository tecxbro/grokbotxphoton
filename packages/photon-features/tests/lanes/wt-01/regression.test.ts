import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStateStore } from "../../../src/adapters/state/sqlite.js";
import { executeChild } from "../../../src/runtime/core/child-journal.js";
import { checkCancellation } from "../../../src/runtime/core/cancellation.js";
import { acquireClaim } from "../../../src/runtime/core/claims.js";
import { reserveRequestIdentity, digest } from "../../../src/runtime/core/idempotency.js";
import { recoverPendingWork } from "../../../src/runtime/core/recovery.js";
import {
  applyReceiptObservation,
  getMessageStatus,
} from "../../../src/runtime/core/receipt-state.js";
import type { ReceiptObservation } from "../../../src/contracts/receipts.js";
import {
  action,
  components,
  context,
  outcome,
  seed,
} from "./fixture.js";

const message = {
  version: 1 as const,
  kind: "message" as const,
  id: "message-regression",
  scope: context.scope,
};

test("restart returns a completed multipart child without replaying its provider callback", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wt01-child-restart-"));
  const path = join(directory, "runtime.sqlite");
  let store = createStateStore(path);
  seed(store);
  let runtime = components(store);
  const reservation = reserveRequestIdentity(store, runtime.contexts, action("restart-child"), context);
  const claim = acquireClaim(runtime.claims, reservation.record.id, "owner-restart", 5000)!;
  let calls = 0;
  const spec = {
    index: 0,
    key: "multipart-0",
    argumentsDigest: digest(action().arguments),
    dispatch: async () => {
      calls++;
      return outcome("executor-completed", [message]);
    },
  };
  const controller = new AbortController();
  await executeChild({
    claims: runtime.claims,
    requestId: reservation.record.id,
    claim,
    child: spec,
    controller,
    deadlineMs: 1000,
  });
  store.close();
  store = createStateStore(path);
  runtime = components(store);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const replay = await executeChild({
    claims: runtime.claims,
    requestId: reservation.record.id,
    claim,
    child: spec,
    controller: new AbortController(),
    deadlineMs: 1000,
  });
  assert.equal(calls, 1);
  assert.deepEqual(replay.references, [message]);
});

test("crash after possible send stays unknown across recovery and cannot replay", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wt01-child-unknown-"));
  const path = join(directory, "runtime.sqlite");
  let store = createStateStore(path);
  seed(store);
  let runtime = components(store);
  const reservation = reserveRequestIdentity(store, runtime.contexts, action("unknown-child"), context);
  const claim = acquireClaim(runtime.claims, reservation.record.id, "owner-unknown", 5000)!;
  let sends = 0;
  await assert.rejects(
    executeChild({
      claims: runtime.claims,
      requestId: reservation.record.id,
      claim,
      child: {
        index: 0,
        key: "possible-send",
        argumentsDigest: digest(action().arguments),
        dispatch: async () => {
          sends++;
          throw new Error("crash after write");
        },
      },
      controller: new AbortController(),
      deadlineMs: 1000,
    }),
    /UNKNOWN_OUTCOME/,
  );
  store.close();
  store = createStateStore(path);
  runtime = components(store);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  assert.equal(recoverPendingWork(runtime.recovery).requeued, 0);
  assert.equal(store.scan("outbox")[0]?.result.status, "unknown-outcome");
  assert.equal(store.scan("children")[0]?.state, "unknown");
  assert.equal(sends, 1);
});

test("cancellation after dispatch preserves the returned result and fences later children", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wt01-cancel-race-"));
  const store = createStateStore(join(directory, "runtime.sqlite"));
  seed(store);
  const runtime = components(store);
  const reservation = reserveRequestIdentity(store, runtime.contexts, action("cancel-race"), context);
  const claim = acquireClaim(runtime.claims, reservation.record.id, "owner-cancel", 5000)!;
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const result = await executeChild({
    claims: runtime.claims,
    requestId: reservation.record.id,
    claim,
    child: {
      index: 0,
      key: "sent-before-cancel",
      argumentsDigest: digest(action().arguments),
      dispatch: async () => {
        store.transaction((tx) => {
          const row = tx.get("outbox", reservation.record.id)!;
          const revision = row.revision;
          row.cancellationRequestedAt = runtime.clock.now();
          row.revision++;
          tx.put("outbox", row, revision);
        });
        return outcome("executor-completed", [message]);
      },
    },
    controller: new AbortController(),
    deadlineMs: 1000,
  });
  assert.deepEqual(result.references, [message]);
  assert.equal(store.scan("children")[0]?.state, "completed");
  assert.deepEqual(store.scan("outbox")[0]?.result.references, [message]);
  assert.throws(
    () => checkCancellation(runtime.claims, reservation.record.id, claim),
    /CANCELLED/,
  );
  await assert.rejects(
    executeChild({
      claims: runtime.claims,
      requestId: reservation.record.id,
      claim,
      child: {
        index: 1,
        key: "must-not-send",
        argumentsDigest: digest({ part: 1 }),
        dispatch: async () => outcome(),
      },
      controller: new AbortController(),
      deadlineMs: 1000,
    }),
    /CANCELLED/,
  );
});

test("receipt evidence survives restart with part, reader, source, and ordering ambiguity intact", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wt01-receipt-restart-"));
  const path = join(directory, "runtime.sqlite");
  let store = createStateStore(path);
  const base: Omit<ReceiptObservation, "evidenceId" | "kind" | "partId"> = {
    scope: context.scope,
    target: message,
    providerTargetId: "provider-regression",
    readerId: null,
    providerAt: null,
    observedAt: 2000,
    source: "provider-event",
    sourceRevision: "r2",
  };
  applyReceiptObservation(store, { ...base, evidenceId: "read-part-1", kind: "read", partId: "part-1" });
  applyReceiptObservation(store, {
    ...base,
    evidenceId: "stale-rejection",
    kind: "rejected",
    partId: "part-1",
    observedAt: 1000,
    source: "snapshot",
    sourceRevision: "r1",
  });
  applyReceiptObservation(store, {
    ...base,
    evidenceId: "delivered-other-part",
    kind: "delivered",
    partId: "part-2",
    providerAt: 1500,
  });
  store.close();
  store = createStateStore(path);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const partOne = getMessageStatus(store, message, "part-1");
  assert.equal(partOne.reading, "observed");
  assert.equal(partOne.delivery, "unknown");
  assert.equal(partOne.read[0]?.providerAt, null);
  assert.equal(partOne.rejected.length, 1);
  assert.deepEqual(partOne.readers, []);
  const partTwo = getMessageStatus(store, message, "part-2");
  assert.equal(partTwo.delivery, "observed");
  assert.equal(partTwo.reading, "unknown");
});
