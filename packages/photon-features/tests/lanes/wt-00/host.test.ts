import test from "node:test";
import assert from "node:assert/strict";
import {
  HostComposition,
  type HostRuntimePorts,
  type HostConfiguration,
} from "../../../src/index.js";
import { publicImports } from "./sdk-probe.js";
const config: HostConfiguration = {
  ingress: { kind: "photon-stream", verificationConfigured: true },
  provider: "imessage",
  storePath: "/private/state.sqlite",
  socketPath: "/private/runtime.sock",
  activation: "enabled",
};
function ports(log: string[]): HostRuntimePorts {
  return {
    client: {
      start: async () => {
        log.push("client");
      },
      stop: async () => {
        log.push("client-stop");
      },
      ready: () => true,
    },
    store: {
      transaction: () => {
        throw new Error("TEST_UNUSED");
      },
      close: () => {
        log.push("store-close");
      },
    },
    ingress: {
      start: async () => {
        log.push("ingress");
      },
      stop: async () => {
        log.push("ingress-stop");
      },
    },
    recover: async () => {
      log.push("recover");
    },
    startOutbox: async () => {
      log.push("outbox");
    },
    stopOutbox: async () => {
      log.push("outbox-stop");
    },
    accept: async () => {},
  };
}
test("public SDK imports load without client construction", () => {
  for (const [name, value] of Object.entries(publicImports))
    assert.equal(typeof value, "function", name);
});
test("host activation, ordered recovery, singleton start and shutdown", async () => {
  const log: string[] = [];
  const h = new HostComposition(config, ports(log));
  assert.equal(h.readiness().ready, false);
  await h.start();
  assert.deepEqual(log, ["client", "recover", "outbox", "ingress"]);
  assert.equal(h.readiness().ready, true);
  await assert.rejects(() => h.start(), /ALREADY_STARTED/);
  await h.stop();
  assert.deepEqual(log.slice(4), [
    "ingress-stop",
    "outbox-stop",
    "client-stop",
    "store-close",
  ]);
  assert.equal(h.readiness().ready, false);
});
test("failed recovery cleans up; disabled host never starts client", async () => {
  const log: string[] = [];
  const p = ports(log);
  p.recover = async () => {
    throw new Error("TEST_RECOVERY_FAILURE");
  };
  const h = new HostComposition(config, p);
  await assert.rejects(() => h.start(), /RECOVERY_FAILURE/);
  assert.equal(h.readiness().state, "failed");
  assert.ok(log.includes("store-close"));
  const disabled = new HostComposition(
    { ...config, activation: "disabled" },
    ports([]),
  );
  await assert.rejects(() => disabled.start(), /NOT_CONFIGURED/);
});
