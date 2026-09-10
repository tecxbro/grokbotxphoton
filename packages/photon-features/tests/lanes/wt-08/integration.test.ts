import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LocalProtocol, listenLocal, foundationCapabilities, type ProtocolServices } from "../../../src/index.js";
import { callRuntime } from "../../../src/cli/local-client.js";
import { commandRequest } from "../../../src/cli/commands.js";
import { context, FixedClock, principal, queued, seedHandoff, storeFixture } from "../../fixtures/harness.js";

test("authenticated local client reads status and claims durable event payloads", async () => {
  const fixture = storeFixture();
  chmodSync(fixture.dir, 0o700);
  seedHandoff(fixture.store);
  const socket = join(fixture.dir, "runtime.sock");
  const credentialFile = join(fixture.dir, "credential");
  const token = "a".repeat(64);
  writeFileSync(credentialFile, token, { mode: 0o600 });
  const services: ProtocolServices = {
    store: fixture.store,
    clock: new FixedClock(),
    contexts: { resolve: async () => structuredClone(context), authorize: async () => {} },
    submission: {
      submit: async () => queued(),
      status: async (requestId, trusted) => {
        if (requestId !== "request-1" || trusted.principalId !== principal.id) throw new Error("FORBIDDEN");
        return queued();
      },
      cancel: async () => ({ ...queued(), status: "cancelled" }),
    },
    capabilities: foundationCapabilities,
    diagnostics: () => ({ ready: false, activation: "disabled" }),
  };
  const listener = await listenLocal(socket, [{ token, principal }], new LocalProtocol(services));
  const config = { socket, credentialFile };
  try {
    const status = await callRuntime(commandRequest(["status", "--request-id", "request-1", "--json"], context.contextId), config);
    assert.equal(status.ok, true);
    const claim = await callRuntime(commandRequest(["work.claim", "--handoff-id", "handoff-1", "--lease-ms", "1000", "--json"], context.contextId), config);
    assert.equal(claim.ok, true);
    if (!claim.ok || !("events" in claim.result)) assert.fail("claim response missing events");
    assert.equal(claim.result.events[0]?.eventId, "event-1");
    assert.equal(claim.result.handoff.claim?.owner, principal.id);
  } finally {
    await listener.close();
    fixture.close();
  }
});

test("bad local credential cannot access authenticated status", async () => {
  const fixture = storeFixture();
  chmodSync(fixture.dir, 0o700);
  const socket = join(fixture.dir, "runtime.sock");
  const credentialFile = join(fixture.dir, "credential");
  const token = "a".repeat(64);
  writeFileSync(credentialFile, "b".repeat(64), { mode: 0o600 });
  const services: ProtocolServices = {
    store: fixture.store,
    clock: new FixedClock(),
    contexts: { resolve: async () => structuredClone(context), authorize: async () => {} },
    submission: { submit: async () => queued(), status: async () => queued(), cancel: async () => queued() },
    capabilities: foundationCapabilities,
    diagnostics: () => ({ ready: true, activation: "enabled" }),
  };
  const listener = await listenLocal(socket, [{ token, principal }], new LocalProtocol(services));
  try {
    const response = await callRuntime(commandRequest(["status", "--request-id", "request-1", "--json"], context.contextId), { socket, credentialFile });
    assert.equal(response.ok, false);
    if (response.ok) assert.fail("bad credential accepted");
    assert.equal(response.error.code, "UNAUTHENTICATED");
  } finally {
    await listener.close();
    fixture.close();
  }
});
