import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SQLiteStore,
  type Clock,
  type FeatureModule,
  type Operation,
  type OperationResult,
  type Scope,
  type TrustedContext,
  type AuthenticatedPrincipal,
  type IncomingEvent,
} from "../../src/index.js";
export const scope: Scope = {
  projectId: "project-1",
  provider: "imessage",
  accountId: "account-1",
  lineId: "line-1",
  spaceId: "space-1",
};
export const principal: AuthenticatedPrincipal = {
  id: "principal-1",
  osUid: process.getuid?.() ?? 0,
  credentialId: "credential-1",
  authenticatedAt: 100,
};
export const context: TrustedContext = {
  version: 1,
  contextId: "context-1",
  principalId: principal.id,
  scope,
  taskId: "task-1",
  generation: 1,
  permissions: ["text.send"],
  issuedAt: 100,
  expiresAt: 200000,
  revokedAt: null,
};
export class FixedClock implements Clock {
  constructor(private at = 10000) {}
  now() {
    return this.at;
  }
  advance(ms: number) {
    this.at += ms;
  }
}
export class FailureHooks {
  private next: string | undefined;
  failAt(point: string) {
    this.next = point;
  }
  hit(point: string) {
    if (this.next === point) {
      this.next = undefined;
      throw new Error(`TEST_CRASH:${point}`);
    }
  }
}
export function storeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "photon-f0-"));
  const path = join(dir, "state.sqlite");
  const store = new SQLiteStore(path);
  return {
    dir,
    path,
    store,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
export const event: IncomingEvent = {
  version: 1,
  eventId: "event-1",
  direction: "inbound",
  scope,
  occurredAt: 1000,
  receivedAt: 1001,
  ordering: { source: "photon" },
  targets: [],
  type: "message",
  senderId: "user-1",
  message: { version: 1, kind: "message", id: "message-1", scope },
  content: { type: "text", text: "hello" },
  change: "created",
};
export function seedHandoff(store: SQLiteStore) {
  store.transaction((tx) => {
    tx.put(
      "inbox",
      { id: "event-1", scope, revision: 0, event, state: "pending" },
      null,
    );
    tx.put(
      "handoffs",
      {
        id: "handoff-1",
        scope,
        revision: 0,
        taskId: context.taskId,
        generation: context.generation,
        principalId: principal.id,
        eventIds: ["event-1"],
        state: "pending",
        claim: null,
        createdAt: 1001,
      },
      null,
    );
  });
}
// The harness is not a FeatureModule and cannot register in production by accident.
export interface TestFeature {
  mode: "test";
  lane: string;
  operations: Operation[];
}
export function testFeature(
  lane: string,
  operations: Operation[],
): TestFeature {
  return { mode: "test", lane, operations };
}
export function productionShapeForRegistryTest(
  operation: Operation,
  lane: string,
): FeatureModule {
  return {
    id: "test-shaped-module",
    mode: "production",
    lane,
    handlers: [
      {
        operation,
        execute: async () => {
          throw new Error("TEST_ONLY_NEVER_EXECUTE");
        },
        recoveryCodec: { id: "test", version: 1 },
      },
    ],
    compilers: [],
    reducers: [],
    capabilities: [],
    recoveryCodecs: [
      {
        id: "test",
        version: 1,
        validate: () => true,
        reconcile: async () => "unknown",
      },
    ],
  };
}
export function queued(): OperationResult {
  return {
    version: 1,
    requestId: "request-1",
    status: "queued",
    revision: 0,
    updatedAt: 10000,
    references: [],
    observations: [],
  };
}
