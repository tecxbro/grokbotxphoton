import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ContentInput, Message, Space } from "spectrum-ts";
import { executeOperation } from "../../../src/runtime/core/executor.js";
import { reserveRequestIdentity, digest } from "../../../src/runtime/core/idempotency.js";
import { recoverPendingWork } from "../../../src/runtime/core/recovery.js";
import {
  fixture,
  action,
  binding,
  context,
  noNetwork,
  outcome,
} from "./fixture.js";

// These functions are compile-time probes against the pinned overloads.
function sendOne(space: Space, content: ContentInput): Promise<Message | undefined> {
  return space.send(content);
}
function fireAndForgetResult(value: Message | undefined): "message" | "void" {
  return value ? "message" : "void";
}
void sendOne;

test("pinned Spectrum 12.8.0 permits message or undefined without receipt promotion", async (t) => {
  assert.equal(fireAndForgetResult(undefined), "void");
  const f = fixture(t);
  const reserved = reserveRequestIdentity(f.store, f.contexts, action("sdk-void"), context);
  let dispatches = 0;
  const result = await executeOperation({
    claims: f.claims,
    requestId: reserved.record.id,
    capability: binding().capability,
    resources: noNetwork.resources,
    media: noNetwork.media,
    streams: noNetwork.streams,
    leaseMs: 1000,
    deadlineMs: 1000,
    handler: async (request, services) => {
      assert.equal(Object.isFrozen(services.context), true);
      assert.equal(Object.isFrozen(services.context.scope), true);
      assert.equal(Object.isFrozen(services.context.permissions), true);
      return services.executeChild({
        index: 0,
        key: "sdk-void-child",
        argumentsDigest: digest(request.arguments),
        dispatch: async () => {
          dispatches++;
          return outcome("executor-completed");
        },
      });
    },
  });
  assert.equal(dispatches, 1);
  assert.equal(result?.status, "executor-completed");
  assert.deepEqual(result?.observations, []);
  assert.deepEqual(result?.value, { type: "void" });
});

test("pinned public declarations expose no universal provider idempotency or reconciliation promise", () => {
  const repositoryRoot = fileURLToPath(
    new URL("../../../../../../", import.meta.url),
  );
  const packageJson = JSON.parse(
    readFileSync(repositoryRoot + "node_modules/spectrum-ts/package.json", "utf8"),
  ) as { version: string };
  const core = readFileSync(
    repositoryRoot +
      "node_modules/@spectrum-ts/core/dist/attachment-Dy4PsNVw.d.ts",
    "utf8",
  );
  const imessage = readFileSync(
    repositoryRoot + "node_modules/@spectrum-ts/imessage/dist/index.d.ts",
    "utf8",
  );
  assert.equal(packageJson.version, "12.8.0");
  assert.match(core, /send\(content: ContentInput\): Promise<Message<[^;]+\| undefined>/);
  assert.match(core, /Promise<ProviderMessageRecord \| undefined>/);
  assert.doesNotMatch(core + imessage, /clientGuid|clientMessageId|idempotencyKey/);
});

test("ambiguous provider failure is reconcile-first and is never automatically replayed", async (t) => {
  const f = fixture(t);
  const reserved = reserveRequestIdentity(f.store, f.contexts, action("sdk-timeout"), context);
  let dispatches = 0;
  const options = {
    claims: f.claims,
    requestId: reserved.record.id,
    capability: binding().capability,
    resources: noNetwork.resources,
    media: noNetwork.media,
    streams: noNetwork.streams,
    leaseMs: 1000,
    deadlineMs: 1000,
    handler: async (request: ReturnType<typeof action>, services: Parameters<Parameters<typeof executeOperation>[0]["handler"]>[1]) =>
      services.executeChild({
        index: 0,
        key: "sdk-timeout-child",
        argumentsDigest: digest(request.arguments),
        dispatch: async () => {
          dispatches++;
          throw new Error("transport disconnected after write");
        },
      }),
  };
  const first = await executeOperation(options);
  assert.equal(first?.status, "unknown-outcome");
  assert.equal(first?.error?.retry, "reconcile-first");
  assert.equal(recoverPendingWork(f.recovery).requeued, 0);
  assert.equal(await executeOperation(options), null);
  assert.equal(dispatches, 1);
});
