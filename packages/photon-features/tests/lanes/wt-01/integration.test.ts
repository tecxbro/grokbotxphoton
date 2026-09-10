import test from "node:test";
import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { event } from "../../fixtures/harness.js";
import { createStateStore } from "../../../src/adapters/state/sqlite.js";
import { createLocalServer } from "../../../src/runtime/core/local-server.js";
import { MAX_REQUEST_BYTES } from "../../../src/contracts/actions.js";
import {
  action,
  binding,
  components,
  context,
  principal,
  seed,
} from "./fixture.js";

function exchange(path: string, frame: string | Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let result = "";
    socket.on("connect", () => socket.write(frame));
    socket.on("data", (chunk) => (result += chunk));
    socket.on("close", () => resolve(result));
    socket.on("error", (error) => {
      if (["ECONNRESET", "EPIPE"].includes((error as NodeJS.ErrnoException).code ?? ""))
        resolve(result);
      else reject(error);
    });
  });
}

test("createStateStore applies F0 migration and createLocalServer serves authenticated execute/status/doctor", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wt01-integration-"));
  const databasePath = join(directory, "runtime.sqlite");
  const socketPath = join(directory, "runtime.sock");
  const token = "a".repeat(64);
  let storeNow = 10000;
  const store = createStateStore(databasePath, () => storeNow);
  seed(store);
  const runtime = components(store);
  const server = await createLocalServer({
    path: socketPath,
    credentials: [{ token, principal }],
    services: {
      contexts: runtime.contexts,
      submission: runtime.submission,
      work: runtime.work,
      capabilities: () => [binding().capability(context)],
      diagnostics: () => ({ ready: false, activation: "disabled" }),
    },
  });
  t.after(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const submit = JSON.parse(
    await exchange(
      socketPath,
      JSON.stringify({
        token,
        request: { version: 1, method: "submit", action: action("ipc-key") },
      }) + "\n",
    ),
  ) as { ok: boolean; result: { requestId: string; status: string } };
  assert.equal(submit.ok, true);
  assert.equal(submit.result.status, "queued");
  const status = JSON.parse(
    await exchange(
      socketPath,
      JSON.stringify({
        token,
        request: {
          version: 1,
          method: "status",
          contextId: context.contextId,
          requestId: submit.result.requestId,
        },
      }) + "\n",
    ),
  ) as { ok: boolean; result: { requestId: string } };
  assert.equal(status.ok, true);
  assert.equal(status.result.requestId, submit.result.requestId);
  const doctor = JSON.parse(
    await exchange(
      socketPath,
      JSON.stringify({
        token,
        request: {
          version: 1,
          method: "diagnostics",
          contextId: context.contextId,
        },
      }) + "\n",
    ),
  ) as { ok: boolean; result: { ready: boolean; activation: string } };
  assert.deepEqual(doctor.result, { ready: false, activation: "disabled" });
  const claim = runtime.claims.acquire(
    submit.result.requestId,
    "store-contract-test",
    1000,
  )!;
  store.assertActiveClaim(context, claim);
  storeNow = claim.leaseUntil;
  assert.throws(() => store.assertActiveClaim(context, claim), /STALE_FENCE/);
  assert.equal(lstatSync(databasePath).mode & 0o777, 0o600);
  assert.equal(lstatSync(socketPath).mode & 0o777, 0o600);
});

test("actual local IPC fences work ownership and rejects malformed, forged, and oversized frames", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wt01-ipc-security-"));
  const store = createStateStore(join(directory, "runtime.sqlite"));
  seed(store);
  store.transaction((tx) => {
    tx.put(
      "inbox",
      { id: event.eventId, scope: context.scope, revision: 0, event, state: "pending" },
      null,
    );
    tx.put(
      "handoffs",
      {
        id: "handoff-ipc",
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
  const runtime = components(store);
  const token = "b".repeat(64);
  const socketPath = join(directory, "runtime.sock");
  const server = await createLocalServer({
    path: socketPath,
    credentials: [{ token, principal }],
    services: {
      contexts: runtime.contexts,
      submission: runtime.submission,
      work: runtime.work,
      capabilities: () => [],
      diagnostics: () => ({ ready: false, activation: "disabled" }),
    },
  });
  t.after(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const claimed = JSON.parse(
    await exchange(
      socketPath,
      JSON.stringify({
        token,
        request: {
          version: 1,
          method: "work.claim",
          contextId: context.contextId,
          handoffId: "handoff-ipc",
          leaseMs: 1000,
        },
      }) + "\n",
    ),
  ) as { ok: boolean; result: { handoff: { claim: { fence: number } }; events: unknown[] } };
  assert.equal(claimed.ok, true);
  assert.equal(claimed.result.events.length, 1);
  const fence = claimed.result.handoff.claim.fence;
  const stale = JSON.parse(
    await exchange(
      socketPath,
      JSON.stringify({
        token,
        request: {
          version: 1,
          method: "work.ack",
          contextId: context.contextId,
          handoffId: "handoff-ipc",
          fence: fence + 1,
        },
      }) + "\n",
    ),
  ) as { ok: boolean; error: { code: string } };
  assert.equal(stale.error.code, "STALE_FENCE");

  const forged = await exchange(
    socketPath,
    JSON.stringify({
      token: "c".repeat(64),
      request: { version: 1, method: "work.list", contextId: context.contextId, limit: 1 },
    }) + "\n",
  );
  assert.match(forged, /UNAUTHENTICATED/);
  assert.doesNotMatch(forged, new RegExp(token));
  const malformed = await exchange(
    socketPath,
    JSON.stringify({ token, request: {}, extra: true }) + "\n",
  );
  assert.match(malformed, /UNAUTHENTICATED/);
  assert.equal(
    await exchange(socketPath, Buffer.alloc(MAX_REQUEST_BYTES + 1, 0x61)),
    "",
  );
});
