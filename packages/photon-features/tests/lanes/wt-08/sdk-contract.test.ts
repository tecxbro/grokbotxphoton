import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  capabilitySchema,
  localRequestSchema,
  parseAction,
  resultSchema,
} from "../../../src/contracts/index.js";
import { operationRegistrations } from "../../../src/registry/index.js";
import { callRuntime } from "../../../src/cli/local-client.js";

test("CLI request surface matches the frozen local protocol without an SDK client", () => {
  const methods = [
    { version: 1, method: "capabilities", contextId: "context-1" },
    { version: 1, method: "diagnostics", contextId: "context-1" },
    { version: 1, method: "status", contextId: "context-1", requestId: "request-1" },
    { version: 1, method: "work.list", contextId: "context-1", limit: 20 },
    { version: 1, method: "work.claim", contextId: "context-1", handoffId: "handoff-1", leaseMs: 30000 },
    { version: 1, method: "work.heartbeat", contextId: "context-1", handoffId: "handoff-1", fence: 1, leaseMs: 30000 },
    { version: 1, method: "work.ack", contextId: "context-1", handoffId: "handoff-1", fence: 1 },
    { version: 1, method: "request.cancel", contextId: "context-1", requestId: "request-1" },
  ];
  for (const request of methods) assert.doesNotThrow(() => localRequestSchema.parse(request));
  assert.equal(typeof callRuntime, "function");
  assert.equal(operationRegistrations.length, 44);
  assert.ok(operationRegistrations.every(entry => entry.implementation === "unimplemented"));
});

test("assigned examples use real strict action schemas", () => {
  const expected = new Map([
    ["create-poll.json", "poll.create"],
    ["reply.json", "message.reply"],
    ["send-voice.json", "voice.send"],
    ["update-card.json", "app.update"],
  ]);
  for (const [name, operation] of expected) {
    const input = JSON.parse(readFileSync(new URL(`../../../../examples/wt-08/${name}`, import.meta.url), "utf8"));
    assert.equal(parseAction(input).operation, operation);
  }
});

test("result and capability contracts keep provider evidence explicit", () => {
  const result = resultSchema.parse({
    version: 1,
    requestId: "request-1",
    status: "executor-completed",
    revision: 1,
    updatedAt: 100,
    references: [],
    observations: [],
  });
  assert.equal(result.status, "executor-completed");
  assert.deepEqual(result.observations, []);
  assert.doesNotThrow(() => capabilitySchema.parse({
    operation: "text.send",
    providerSupport: "unknown",
    availability: { account: "unknown", conversation: "unknown", checkedAt: null },
    implementation: "unimplemented",
    direction: { inbound: "not-applicable", outbound: "unimplemented" },
    evidence: [],
    sdkVersion: "12.8.0",
    sources: [],
    blockers: ["F0"],
  }));
});
