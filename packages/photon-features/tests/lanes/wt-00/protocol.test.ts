import test from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import {
  LocalProtocol,
  listenLocal,
  foundationCapabilities,
  type ProtocolServices,
  type LocalResponse,
} from "../../../src/index.js";
import {
  storeFixture,
  seedHandoff,
  context,
  principal,
  FixedClock,
  queued,
} from "../../fixtures/harness.js";
function setup() {
  const f = storeFixture();
  seedHandoff(f.store);
  const clock = new FixedClock();
  const services: ProtocolServices = {
    store: f.store,
    clock,
    contexts: {
      resolve: async () => structuredClone(context),
      authorize: async () => {},
    },
    submission: {
      submit: async () => queued(),
      status: async () => queued(),
      cancel: async () => queued(),
    },
    capabilities: foundationCapabilities,
    diagnostics: () => ({ ready: false, activation: "disabled" }),
  };
  return { ...f, clock, services, protocol: new LocalProtocol(services) };
}
const req = (method: string, extra = {}) => ({
  version: 1,
  method,
  contextId: context.contextId,
  ...extra,
});
test("woken task retrieves actual durable events, claims, heartbeats, acknowledges", async () => {
  const f = setup();
  try {
    const list = await f.protocol.dispatch(
      req("work.list", { limit: 10 }),
      principal,
    );
    assert.equal(list.ok, true);
    const claim = await f.protocol.dispatch(
      req("work.claim", { handoffId: "handoff-1", leaseMs: 1000 }),
      principal,
    );
    assert.ok(claim.ok && "handoff" in claim.result);
    if (!claim.ok || !("handoff" in claim.result)) return;
    assert.equal(claim.result.events[0]?.eventId, "event-1");
    const fence = claim.result.handoff.claim!.fence;
    assert.equal(
      (
        await f.protocol.dispatch(
          req("work.claim", { handoffId: "handoff-1", leaseMs: 1000 }),
          principal,
        )
      ).ok,
      false,
    );
    assert.equal(
      (
        await f.protocol.dispatch(
          req("work.heartbeat", {
            handoffId: "handoff-1",
            fence,
            leaseMs: 1000,
          }),
          principal,
        )
      ).ok,
      true,
    );
    assert.equal(
      (
        await f.protocol.dispatch(
          req("work.ack", { handoffId: "handoff-1", fence }),
          principal,
        )
      ).ok,
      true,
    );
    assert.equal(
      f.store.transaction((tx) => tx.get("handoffs", "handoff-1"))?.state,
      "acknowledged",
    );
  } finally {
    f.close();
  }
});
test("expired leases fence old acknowledgements; auth, revocation and generation checks", async () => {
  const f = setup();
  try {
    await f.protocol.dispatch(
      req("work.claim", { handoffId: "handoff-1", leaseMs: 1000 }),
      principal,
    );
    f.clock.advance(1001);
    assert.equal(
      (
        await f.protocol.dispatch(
          req("work.ack", { handoffId: "handoff-1", fence: 1 }),
          principal,
        )
      ).ok,
      false,
    );
    const next = await f.protocol.dispatch(
      req("work.claim", { handoffId: "handoff-1", leaseMs: 1000 }),
      principal,
    );
    assert.ok(next.ok);
    assert.equal(
      (
        await f.protocol.dispatch(
          req("work.ack", { handoffId: "handoff-1", fence: 1 }),
          principal,
        )
      ).ok,
      false,
    );
    assert.equal(
      (
        await f.protocol.dispatch(req("work.list", { limit: 10 }), {
          ...principal,
          id: "attacker",
        })
      ).ok,
      false,
    );
    f.services.contexts.resolve = async () => ({ ...context, revokedAt: 1 });
    assert.equal(
      (await f.protocol.dispatch(req("work.list", { limit: 10 }), principal))
        .ok,
      false,
    );
    f.services.contexts.resolve = async () => ({ ...context, generation: 2 });
    const list = await f.protocol.dispatch(
      req("work.list", { limit: 10 }),
      principal,
    );
    assert.ok(
      list.ok && "work" in list.result && list.result.work.length === 0,
    );
  } finally {
    f.close();
  }
});
function exchange(path: string, value: unknown): Promise<LocalResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    let body = "";
    socket.on("connect", () => socket.write(JSON.stringify(value) + "\n"));
    socket.on("data", (c) => (body += c));
    socket.on("error", reject);
    socket.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
  });
}
test("Unix socket authenticates separately from opaque contextId and refuses unsafe directory", async () => {
  const f = setup();
  const path = join(f.dir, "runtime.sock");
  const token = "a".repeat(64);
  let listener: Awaited<ReturnType<typeof listenLocal>> | undefined;
  try {
    chmodSync(f.dir, 0o700);
    listener = await listenLocal(path, [{ token, principal }], f.protocol);
    assert.equal(
      (
        await exchange(path, {
          token: "wrong",
          request: req("work.list", { limit: 10 }),
        })
      ).ok,
      false,
    );
    assert.equal(
      (
        await exchange(path, {
          token,
          request: req("work.list", { limit: 10 }),
        })
      ).ok,
      true,
    );
    await assert.rejects(
      () => listenLocal(path, [{ token, principal }], f.protocol),
      /SOCKET_PATH_EXISTS/,
    );
    await listener.close();
    listener = undefined;
    chmodSync(f.dir, 0o755);
    await assert.rejects(
      () => listenLocal(path, [{ token, principal }], f.protocol),
      /PRIVATE_DIRECTORY/,
    );
  } finally {
    await listener?.close();
    f.close();
  }
});

test("work query cannot starve behind acknowledged rows and context expiry denies access", async () => {
  const f = setup();
  try {
    f.store.transaction((tx) => {
      for (let i = 0; i < 1001; i++)
        tx.put(
          "handoffs",
          {
            id: "aaa-" + i,
            scope: context.scope,
            revision: 0,
            taskId: context.taskId,
            generation: 1,
            principalId: principal.id,
            eventIds: [],
            state: "acknowledged",
            claim: null,
            createdAt: 1,
          },
          null,
        );
    });
    const list = await f.protocol.dispatch(
      req("work.list", { limit: 10 }),
      principal,
    );
    assert.ok(
      list.ok && "work" in list.result && list.result.work.length === 1,
    );
    f.clock.advance(200000);
    const expired = await f.protocol.dispatch(
      req("work.list", { limit: 10 }),
      principal,
    );
    assert.ok(!expired.ok && expired.error.code === "CONTEXT_EXPIRED");
  } finally {
    f.close();
  }
});
