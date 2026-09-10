import type { ContentBuilder, Space, Message } from "spectrum-ts";
import {
  type Action, type ExecutionServices, type ResourceRef, type TransactionStore, type IncomingEvent,
} from "../../../src/index.js";
import { context, scope, FixedClock, storeFixture } from "../../fixtures/harness.js";
import { actionDigest, pollOperations } from "../../../src/features/polls/operations.js";
import { registerNativeOptions, scopedId, type PollRef } from "../../../src/features/polls/identity.js";
export { context, scope, storeFixture };
export const claim = { owner: "executor", fence: 1, generation: 1, leaseUntil: 100000 };
export const trusted = { ...context, permissions: [...pollOperations] };
export const spaceRef: Extract<ResourceRef, { kind: "space" }> = { version: 1, kind: "space", id: scope.spaceId, scope };

export function seed(store: TransactionStore) {
  store.transaction(tx => {
    tx.put("contexts", { id: trusted.contextId, scope, revision: 0, context: trusted }, null);
    tx.put("tasks", { id: trusted.taskId, scope, revision: 0, generation: 1,
      principalId: trusted.principalId, cancelledAt: null }, null);
    tx.put("references", { id: spaceRef.id, scope, revision: 0, reference: spaceRef,
      providerId: "native-chat", ownedByPrincipalId: trusted.principalId,
      taskId: trusted.taskId, generation: 1 }, null);
  });
}
export function createAction(key = "create-1"): Action {
  return { version: 1, contextId: context.contextId, idempotencyKey: key, operation: "poll.create",
    arguments: { space: spaceRef, question: "Choose?", options: [
      { key: "first", label: "Same" }, { key: "second", label: "Same" },
    ] } };
}
export function enqueue(store: TransactionStore, action: Action) {
  const id = scopedId("request", scope, trusted.principalId, trusted.taskId, 1, action.idempotencyKey);
  store.transaction(tx => tx.put("outbox", { id, scope, revision: 0, action,
    principalId: trusted.principalId, taskId: trusted.taskId, generation: 1,
    argumentDigest: actionDigest(action), claim, cancellationRequestedAt: null,
    result: { version: 1, requestId: id, revision: 0, status: "queued", updatedAt: 10000,
      observations: [], references: [] },
  }, null));
  return id;
}
export function services(store: TransactionStore, send?: (content: ContentBuilder) => Promise<Message | undefined>) {
  let calls = 0;
  const payloads: unknown[] = [];
  const fakeSpace = { __platform: "imessage", id: "native-chat", phone: "line-phone",
    send: async (content: ContentBuilder) => {
      calls++;
      payloads.push(await content.build());
      if (send) return send(content);
      return { id: `native-poll-${calls}`, platform: "imessage", direction: "outbound",
        space: fakeSpace, content: await content.build() } as unknown as Message;
    },
  } as unknown as Space;
  const s: ExecutionServices = {
    context: trusted, clock: new FixedClock(), signal: new AbortController().signal, claim,
    transactions: store,
    resources: { resolve: async ref => ref, space: async () => fakeSpace,
      message: async () => { throw new Error("MUST_NOT_FETCH_MESSAGE_AS_NATIVE_POLL_STATE"); } },
    media: { resolve: async () => { throw new Error("UNUSED"); } },
    streams: { open: async () => { throw new Error("UNUSED"); } },
  };
  return { services: s, calls: () => calls, payloads };
}

export function registerPoll(store: TransactionStore, guid = "native-poll", taskId = trusted.taskId) {
  const ref: PollRef = { version: 1, kind: "poll", id: scopedId("poll", scope, guid),
    messageId: scopedId("message", scope, guid), scope };
  store.transaction(tx => {
    if (!tx.get("tasks", taskId)) tx.put("tasks", { id: taskId, scope, revision: 0,
      generation: 1, principalId: trusted.principalId, cancelledAt: null }, null);
    const message: ResourceRef = { version: 1, kind: "message", id: ref.messageId, scope };
    for (const reference of [ref, message]) tx.put("references", { id: reference.id, scope,
      revision: 0, reference, providerId: guid, ownedByPrincipalId: trusted.principalId,
      taskId, generation: 1 }, null);
    tx.put("polls", { id: ref.id, scope, revision: 0, reference: ref, question: "Choose?", options: [] }, null);
  });
  const options = store.transaction(tx => registerNativeOptions(tx, { poll: ref, nativePollGuid: guid,
    options: [{ nativeId: "native-option-a", label: "Same" }, { nativeId: "native-option-b", label: "Same" }] }));
  return { ref, options, guid };
}
export function pollEvent(poll: ReturnType<typeof registerPoll>, overrides: Partial<Extract<IncomingEvent, { type: "poll" }>> = {}): Extract<IncomingEvent, { type: "poll" }> {
  return { version: 1, type: "poll", eventId: "event-1", providerEventId: "provider-1",
    scope, direction: "inbound", occurredAt: null, receivedAt: 100,
    ordering: { source: "native-test", sequence: "1" }, targets: [],
    poll: poll.ref, option: poll.options[0]!, actorId: "alice", change: "vote", ...overrides };
}
