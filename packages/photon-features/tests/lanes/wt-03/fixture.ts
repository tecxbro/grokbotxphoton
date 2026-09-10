import {
  resolveContents,
  type Content,
  type ContentInput,
  type Message,
  type Space,
} from "spectrum-ts";
import {
  parseAction,
  type Action,
  type ContentCompiler,
  type ExecutionServices,
  type ResourceRef,
  type Operation,
} from "../../../src/index.js";
import {
  context,
  scope,
  FixedClock,
  storeFixture,
  queued,
  FailureHooks,
} from "../../fixtures/harness.js";
import {
  createTextMessageModule,
  ownedOperations,
} from "../../../src/features/text-messages/module.js";
export function fixture() {
  const sqlite = storeFixture(),
    clock = new FixedClock(),
    abort = new AbortController(),
    hooks = new FailureHooks();
  const calls: { operation: string; content?: Content; target?: Message }[] =
    [];
  const messages = new Map<string, Message>(),
    extra: ContentCompiler[] = [];
  let sequence = 0,
    requestSequence = 0,
    noMessage = false;
  const spaceRef: Extract<ResourceRef, { kind: "space" }> = {
    version: 1,
    kind: "space",
    id: "space-1",
    scope,
  };
  const messageRef: Extract<ResourceRef, { kind: "message" }> = {
    version: 1,
    kind: "message",
    id: "message-1",
    scope,
  };
  const reactionRef: Extract<ResourceRef, { kind: "reaction" }> = {
    version: 1,
    kind: "reaction",
    id: "reaction-1",
    messageId: messageRef.id,
    scope,
  };
  const streamRef: Extract<ResourceRef, { kind: "stream" }> = {
    version: 1,
    kind: "stream",
    id: "stream-1",
    scope,
    generation: 1,
    expiresAt: 100000,
  };
  const requestIds = new Map<string, string>();
  async function resolve(input: ContentInput) {
    return (await resolveContents([input]))[0]!;
  }
  const space = {
    id: "native-chat",
    __platform: "imessage",
    phone: "+15555550100",
    type: "dm",
    send: async (input: ContentInput) => {
      const content = await resolve(input);
      calls.push({ operation: "send", content });
      hooks.hit(`send-${calls.length}`);
      if (noMessage) return undefined;
      if (content.type === "group")
        return makeMessage({
          type: "group",
          items: content.items.map((item) => makeMessage(item.content)),
        });
      return makeMessage(content);
    },
    getMessage: async (id: string) => messages.get(id),
  } as unknown as Space & { phone: string };
  function makeMessage(
    content: Content,
    id = `native-${++sequence}`,
    direction: "inbound" | "outbound" = "outbound",
  ): Message {
    const message: Message = {
      id,
      platform: "imessage",
      space,
      content,
      direction,
      timestamp: new Date(clock.now() - 1000),
      sender: undefined,
      edit: async (input) => {
        calls.push({
          operation: "edit",
          content: await resolve(input),
          target: message,
        });
        hooks.hit("edit");
      },
      unsend: async () => {
        calls.push({ operation: "unsend", target: message });
        hooks.hit("unsend");
      },
      read: async () => {
        calls.push({ operation: "read", target: message });
        hooks.hit("read");
      },
      reply: (async (input: ContentInput) => {
        const content = await resolve(input);
        calls.push({ operation: "reply", content, target: message });
        return noMessage ? undefined : makeMessage(content);
      }) as Message["reply"],
      react: (async (emoji: string) => {
        calls.push({ operation: "react", target: message });
        return noMessage
          ? undefined
          : (makeMessage({
              type: "reaction",
              emoji,
              target: message,
            }) as Awaited<ReturnType<Message["react"]>>);
      }) as Message["react"],
    };
    messages.set(id, message);
    return message;
  }
  const target = makeMessage(
    { type: "text", text: "hello" },
    "native-target",
    "inbound",
  );
  const reaction = makeMessage(
    { type: "reaction", emoji: "❤️", target },
    "native-reaction",
  );
  const services: ExecutionServices = {
    context: { ...context, permissions: [...ownedOperations] },
    clock,
    signal: abort.signal,
    claim: { owner: "executor-1", fence: 1, generation: 1, leaseUntil: 150000 },
    transactions: sqlite.store,
    resources: {
      resolve: async (ref) => ref,
      space: async () => space,
      message: async (ref) => {
        const record = sqlite.store.transaction((tx) =>
          tx.get("references", ref.id),
        );
        const message = record && messages.get(record.providerId);
        if (!message) throw new Error("missing message");
        return message;
      },
    },
    media: {
      resolve: async () => {
        throw new Error("No media staging in this fixture.");
      },
    },
    streams: {
      open: async () =>
        (async function* () {
          yield "hello ";
          yield "Ada";
        })(),
    },
  };
  sqlite.store.transaction((tx) => {
    tx.put(
      "tasks",
      {
        id: context.taskId,
        scope,
        revision: 0,
        principalId: context.principalId,
        generation: 1,
        cancelledAt: null,
      },
      null,
    );
    for (const [reference, providerId] of [
      [spaceRef, space.id],
      [messageRef, target.id],
      [reactionRef, reaction.id],
    ] as const)
      tx.put(
        "references",
        {
          id: reference.id,
          scope,
          revision: 0,
          reference,
          providerId,
          ownedByPrincipalId: context.principalId,
          taskId: context.taskId,
          generation: 1,
        },
        null,
      );
    tx.put(
      "streams",
      {
        id: streamRef.id,
        scope,
        revision: 0,
        reference: streamRef,
        principalId: context.principalId,
        taskId: context.taskId,
        codecId: "fixture",
        codecVersion: 1,
        checkpointId: null,
        state: "registered",
      },
      null,
    );
  });
  const module = createTextMessageModule({
    binding: () => ({
      scope,
      phone: "+15555550100",
      nativeSpaceId: "native-chat",
    }),
    requestId: (action) =>
      requestIds.get(action.idempotencyKey) ?? "invalid-request",
    compilers: () => extra,
  });
  const prepare = (
    operation: Operation,
    args: unknown,
    key = `key-${++requestSequence}`,
  ): Action => {
    const action = parseAction({
      version: 1,
      idempotencyKey: key,
      contextId: context.contextId,
      operation,
      arguments: args,
    });
    const id = `request-${requestSequence}`;
    requestIds.set(key, id);
    sqlite.store.transaction((tx) =>
      tx.put(
        "outbox",
        {
          id,
          scope,
          revision: 0,
          action,
          principalId: context.principalId,
          taskId: context.taskId,
          generation: 1,
          argumentDigest: "fixture",
          result: { ...queued(), requestId: id },
          claim: services.claim,
          cancellationRequestedAt: null,
        },
        null,
      ),
    );
    return action;
  };
  const execute = (action: Action) =>
    module.handlers
      .find((h) => h.operation === action.operation)!
      .execute(action, services);
  return {
    ...sqlite,
    clock,
    abort,
    calls,
    hooks,
    services,
    module,
    extra,
    target,
    reaction,
    space,
    spaceRef,
    messageRef,
    reactionRef,
    streamRef,
    prepare,
    execute,
    makeMessage,
    noMessage: () => {
      noMessage = true;
    },
  };
}
