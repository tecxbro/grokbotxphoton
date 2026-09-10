import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveContents,
  contact,
  reply,
  reaction,
  edit,
  unsend,
  read,
  type Content,
  type ContentInput,
  type Message,
  type Space,
} from "spectrum-ts";
import { createFeatureModule } from "../../../src/features/text-messages/module.js";
import {
  makeServices,
  scope,
  context,
} from "../../fixtures/runtime-services.js";
import {
  parseActionRequest,
  type Action,
  type Operation,
} from "../../../src/contracts/actions.js";
import { resultSchema } from "../../../src/contracts/results.js";
import {
  resourceRefSchema,
  type ResourceRef,
} from "../../../src/contracts/references.js";
import type { PublicTextMessageOptions } from "../../../src/features/text-messages/sdk.js";

function setup() {
  const f = makeServices();
  let count = 0;
  const sent: Content[] = [];
  const handles = new Map<string, Message>();
  const services = {
    ...f.services,
    resolveResource: (ref: ResourceRef) =>
      f.services.resolveResource(resourceRefSchema.parse(ref)),
    context: {
      ...context,
      permissions: [
        "text.send",
        "text.stream",
        "markdown.send",
        "link.send",
        "content.group",
        "content.compose",
        "message.get",
        "message.reply",
        "message.react",
        "reaction.remove",
        "message.edit",
        "message.unsend",
        "message.markRead",
      ] as Operation[],
    },
  };
  const spaceRef: Extract<ResourceRef, { kind: "space" }> = {
    version: 1,
    kind: "space",
    id: scope.spaceId,
    scope,
  };
  const targetRef: Extract<ResourceRef, { kind: "message" }> = {
    version: 1,
    kind: "message",
    id: "target",
    scope,
  };
  const space = {
    id: "native-chat",
    __platform: "imessage",
    phone: "native-phone",
    getMessage: async (id: string) => handles.get(id),
    send: async (input: ContentInput) => {
      const content = (await resolveContents([input]))[0]!;
      sent.push(content);
      if (["edit", "unsend", "read"].includes(content.type)) return undefined;
      if (content.type === "group")
        return makeMessage(
          `sent-${++count}`,
          {
            ...content,
            items: content.items.map((item) =>
              makeMessage(`part-${++count}`, item.content, "outbound"),
            ),
          },
          "outbound",
        );
      return makeMessage(`sent-${++count}`, content, "outbound");
    },
  } as unknown as Space;
  function makeMessage(
    id: string,
    content: Content,
    direction: Message["direction"],
  ): Message {
    const message = {
      id,
      content,
      direction,
      platform: "imessage",
      space,
      timestamp: new Date(f.clock.now()),
      sender: undefined,
      reply: async (input: ContentInput) => space.send(reply(input, message)),
      react: async (emoji: string) => space.send(reaction(emoji, message)),
      edit: async (input: ContentInput) => {
        await space.send(edit(input, message));
      },
      unsend: async () => {
        await space.send(unsend(message));
      },
      read: async () => {
        await space.send(read(message));
      },
    } as Message;
    handles.set(id, message);
    return message;
  }
  const target = makeMessage(
    "native-target",
    { type: "text", text: "Incoming" },
    "inbound",
  );
  function register(
    ref: ResourceRef,
    providerId: string,
    owner = context.principalId,
  ) {
    f.resources.set(ref.id, resourceRefSchema.parse(ref));
    services.transaction((unit) => {
      const old = unit.get("references", ref.id);
      unit.put(
        "references",
        {
          id: ref.id,
          reference: ref,
          scope,
          providerId,
          ownedByPrincipalId: owner,
          taskId: context.taskId,
          generation: context.generation,
          revision: old ? old.revision + 1 : 0,
        },
        old?.revision ?? null,
      );
    });
  }
  register(spaceRef, space.id);
  register(targetRef, target.id);
  const options: PublicTextMessageOptions = {
    provider: {
      provider: "imessage",
      scope,
      ready: () => true,
      start: async () => {},
      stop: async () => {},
    },
    binding: () => ({ scope, phone: "native-phone", nativeSpaceId: space.id }),
    resources: {
      space: async () => space,
      message: async (ref) => {
        const record = services.transaction((u) => u.get("references", ref.id));
        return handles.get(record!.providerId)!;
      },
    },
    compilers: () => [
      {
        family: "contact",
        compile: async (spec) => {
          assert.equal(spec.type, "contact");
          return contact("BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nEND:VCARD");
        },
      },
    ],
  };
  const module = createFeatureModule(options);
  const action = (
    operation: Operation,
    args: unknown,
    key = "request",
  ): Action =>
    parseActionRequest({
      version: 1,
      contextId: context.contextId,
      idempotencyKey: key,
      operation,
      arguments: args,
    });
  async function run(operation: Operation, args: unknown, key = "request") {
    const a = action(operation, args, key);
    const handler = module.handlers[operation as keyof typeof module.handlers]!;
    const result = await (
      handler as (a: Action, s: typeof services) => ReturnType<typeof handler>
    )(a, services);
    resultSchema.parse(result);
    return result;
  }
  return {
    ...f,
    services,
    space,
    spaceRef,
    target,
    targetRef,
    options,
    module,
    run,
    sent,
    register,
    handles,
    action,
  };
}

test("public module registers 13 handlers; text uses shared children and stored actual IDs", async () => {
  const f = setup();
  assert.equal(Object.keys(f.module.handlers).length, 13);
  const args = { space: f.spaceRef, text: "Hello Ada.\n\nThe next thought." };
  const first = await f.run("text.send", args);
  assert.equal(first.status, "provider-accepted");
  assert.equal(first.references.length, 2);
  assert.equal(f.children.size, 2);
  assert.equal((await f.run("text.send", args)).status, "provider-accepted");
  assert.equal(f.sent.length, 2);
  assert.deepEqual(f.sent, [
    { type: "text", text: "hello Ada." },
    { type: "text", text: "the next thought." },
  ]);
});
test("composition preflights all content before sends and delegates registered families", async () => {
  const f = setup();
  const content = {
    type: "compose",
    items: [
      { type: "text", text: "HELLO — Ready? Sure?" },
      { type: "contact", contact: { name: "Ada", phones: [], emails: [] } },
    ],
  };
  const r = await f.run("content.compose", { space: f.spaceRef, content });
  assert.equal(r.status, "provider-accepted");
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[0]!.type, "text");
  assert.equal((f.sent[0] as { text: string }).text, "HELLO — Ready? Sure?");
  const bad = setup();
  assert.equal(
    (
      await bad.run("content.compose", {
        space: bad.spaceRef,
        content: {
          type: "compose",
          items: [
            { type: "text", text: "first" },
            { type: "link", url: "https://example.com", title: "unsupported" },
          ],
        },
      })
    ).status,
    "blocked",
  );
  assert.equal(bad.sent.length, 0);
});
test("groups use one opaque shared child, not one checkpoint per hidden member", async () => {
  const f = setup();
  const r = await f.run("content.group", {
    space: f.spaceRef,
    content: {
      type: "group",
      items: [
        { type: "text", text: "Ada" },
        { type: "contact", contact: { name: "Ada", phones: [], emails: [] } },
      ],
    },
  });
  assert.equal(r.status, "provider-accepted");
  assert.equal(f.children.size, 1);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0]!.type, "group");
  assert.equal(r.references.length, 2);
  for (const ref of r.references)
    assert.match(
      f.services.transaction((u) => u.get("references", ref.id))!.providerId,
      /^part-/,
    );
});
test("wrong logical scope, SDK chat, line, provider ID, and direction are rejected before effects", async () => {
  for (const mutate of [
    (f: ReturnType<typeof setup>) => {
      f.target.space = { ...f.space, id: "wrong" } as Space;
    },
    (f: ReturnType<typeof setup>) => {
      f.target.space = { ...f.space, phone: "wrong" } as unknown as Space;
    },
    (f: ReturnType<typeof setup>) => {
      f.options.resources.message = async () => ({ ...f.target, id: "wrong" });
    },
    (f: ReturnType<typeof setup>) => {
      f.target.direction = "outbound";
    },
  ]) {
    const f = setup();
    mutate(f);
    const r = await f.run("message.markRead", { message: f.targetRef });
    assert.ok(["SCOPE_MISMATCH", "FORBIDDEN"].includes(r.error!.code));
    assert.equal(f.sent.length, 0);
  }
  const f = setup();
  const r = await f.run("message.reply", {
    message: { ...f.targetRef, scope: { ...scope, lineId: "wrong" } },
    content: { type: "text", text: "hello" },
  });
  assert.equal(r.error!.code, "SCOPE_MISMATCH");
});
test("get reads real metadata; reply, markdown and link retain public builder shapes", async () => {
  let f = setup();
  const get = await f.run("message.get", { message: f.targetRef });
  assert.deepEqual(get.value, {
    type: "message",
    content: { type: "text", text: "Incoming" },
    senderId: null,
    direction: "inbound",
  });
  assert.equal(f.children.size, 0);
  f = setup();
  assert.equal(
    (
      await f.run("message.reply", {
        message: f.targetRef,
        content: { type: "text", text: "HELLO — Ready? Sure?" },
      })
    ).status,
    "provider-accepted",
  );
  assert.equal(f.sent[0]!.type, "reply");
  f = setup();
  await f.run("markdown.send", {
    space: f.spaceRef,
    text: "**HELLO** — Ready? Sure?",
  });
  assert.deepEqual(f.sent[0], {
    type: "markdown",
    markdown: "**HELLO** — Ready? Sure?",
  });
  f = setup();
  await f.run("link.send", { space: f.spaceRef, url: "https://example.com" });
  assert.deepEqual(f.sent[0], { type: "richlink", url: "https://example.com" });
});
test("void edit, unsend and markRead do not invent IDs or receipt observations", async () => {
  for (const operation of [
    "message.edit",
    "message.unsend",
    "message.markRead",
  ] as const) {
    const f = setup();
    if (operation !== "message.markRead") f.target.direction = "outbound";
    const r = await f.run(operation, {
      message: f.targetRef,
      ...(operation === "message.edit" ? { text: "The new text." } : {}),
    });
    assert.equal(r.status, "executor-completed");
    assert.deepEqual(r.value, { type: "void" });
    assert.deepEqual(r.references, []);
    assert.deepEqual(r.observations, []);
    assert.equal(f.children.size, 1);
  }
});
test("expired, future-dated, retracted and other-principal mutations cannot dispatch", async () => {
  for (const operation of ["message.edit", "message.unsend"] as const)
    for (const mode of ["expired", "future", "retracted", "owner"]) {
      const f = setup();
      f.target.direction = "outbound";
      if (mode === "expired")
        f.target.timestamp = new Date(
          f.clock.now() - (operation === "message.edit" ? 900000 : 120000),
        );
      if (mode === "future") f.target.timestamp = new Date(f.clock.now() + 1);
      if (mode === "retracted")
        Object.assign(f.target, { dateRetracted: new Date() });
      if (mode === "owner")
        f.register(f.targetRef, f.target.id, "another-principal");
      const r = await f.run(operation, {
        message: f.targetRef,
        ...(operation === "message.edit" ? { text: "new" } : {}),
      });
      assert.ok(r.error);
      assert.equal(f.sent.length, 0);
    }
});
test("real reaction handles persist with their parent; only authorized bot reactions are removed", async () => {
  const f = setup();
  const r = await f.run("message.react", {
    message: f.targetRef,
    reaction: "love",
  });
  const ref = r.references[0]!;
  assert.equal(ref.kind, "reaction");
  f.resources.set(ref.id, resourceRefSchema.parse(ref));
  f.children.clear();
  const removed = await f.run("reaction.remove", { reaction: ref }, "remove");
  assert.equal(removed.status, "executor-completed");
  assert.deepEqual(removed.references, []);
  f.children.clear();
  f.register(
    ref,
    f.services.transaction((u) => u.get("references", ref.id))!.providerId,
    "another-principal",
  );
  assert.equal(
    (await f.run("reaction.remove", { reaction: ref }, "remove-other")).error!
      .code,
    "FORBIDDEN",
  );
});
test("reaction removal rejects changed parent metadata and reactions cannot target reactions", async () => {
  const f = setup();
  const r = await f.run("message.react", {
    message: f.targetRef,
    reaction: "like",
  });
  const ref = r.references[0]!;
  f.resources.set(ref.id, resourceRefSchema.parse(ref));
  f.children.clear();
  const handle = f.handles.get(
    f.services.transaction((u) => u.get("references", ref.id))!.providerId,
  )!;
  assert.equal(handle.content.type, "reaction");
  if (handle.content.type === "reaction")
    handle.content.target = { ...f.target, id: "wrong-parent" };
  assert.equal(
    (await f.run("reaction.remove", { reaction: ref }, "remove")).error!.code,
    "SCOPE_MISMATCH",
  );
  f.target.content = handle.content;
  assert.equal(
    (
      await f.run(
        "message.react",
        { message: f.targetRef, reaction: "like" },
        "react-again",
      )
    ).error!.code,
    "UNSUPPORTED",
  );
});
test("completed children survive later unknown and retries do not resend accepted parts", async () => {
  const f = setup();
  let calls = 0;
  const original = f.space.send.bind(f.space);
  f.space.send = (async (input: ContentInput) => {
    if (++calls === 2) throw new Error("disconnected after write");
    return original(input);
  }) as Space["send"];
  const args = {
    space: f.spaceRef,
    content: {
      type: "compose",
      items: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
        { type: "text", text: "third" },
      ],
    },
  };
  const r = await f.run("content.compose", args);
  assert.equal(r.status, "unknown-outcome");
  assert.equal(r.error!.retry, "reconcile-first");
  assert.equal(r.references.length, 1);
  assert.equal(
    (await f.run("content.compose", args)).status,
    "unknown-outcome",
  );
  assert.equal(calls, 2);
  assert.equal(f.children.size, 2);
});
test("changed child arguments and cancellation after async resolution prevent dispatch", async () => {
  const f = setup();
  await f.run("text.send", { space: f.spaceRef, text: "first" });
  assert.equal(
    (await f.run("text.send", { space: f.spaceRef, text: "changed" })).error!
      .code,
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(f.sent.length, 1);
  const g = setup();
  g.options.resources.space = async () => {
    g.abort.abort();
    return g.space;
  };
  assert.equal(
    (await g.run("text.send", { space: g.spaceRef, text: "hello" })).status,
    "cancelled",
  );
  assert.equal(g.sent.length, 0);
});

test("malformed JSON never executes getters and the selected handler is enforced", async () => {
  const f = setup();
  let accessed = false;
  const malicious = {
    get idempotencyKey() {
      accessed = true;
      return "bad";
    },
  };
  const r = await f.module.handlers["text.send"]!(
    malicious as never,
    f.services,
  );
  assert.equal(r.error!.code, "INVALID_REQUEST");
  assert.equal(accessed, false);
  assert.equal(f.sent.length, 0);
  const wrong = await f.module.handlers["text.send"]!(
    f.action("message.markRead", { message: f.targetRef }) as never,
    f.services,
  );
  assert.equal(wrong.error!.code, "INVALID_REQUEST");
  assert.equal(f.sent.length, 0);
});
test("cancellation between children preserves accepted references without a later send", async () => {
  const f = setup();
  const execute = f.services.executeChild.bind(f.services);
  f.services.executeChild = async (child) => {
    const result = await execute(child);
    if (child.index === 0) f.abort.abort();
    return result;
  };
  const result = await f.run("text.send", {
    space: f.spaceRef,
    text: "first\n\nsecond",
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.references.length, 1);
  assert.equal(f.sent.length, 1);
  assert.equal(f.children.size, 1);
});

test("message.get refreshes provider state and bounds returned content without inventing media", async () => {
  const f = setup();
  let fetches = 0;
  f.space.getMessage = async () => {
    fetches++;
    return {
      ...f.target,
      content: { type: "richlink", url: "https://example.com/current" },
    };
  };
  assert.deepEqual(
    (await f.run("message.get", { message: f.targetRef })).value,
    {
      type: "message",
      content: { type: "link", url: "https://example.com/current" },
      senderId: null,
      direction: "inbound",
    },
  );
  assert.equal(fetches, 1);
  f.space.getMessage = async () => ({
    ...f.target,
    content: { type: "text", text: "x".repeat(16001) },
  });
  assert.equal(
    (await f.run("message.get", { message: f.targetRef })).value!.type,
    "metadata",
  );
  f.space.getMessage = async () => ({ ...f.target, id: "wrong" });
  assert.equal(
    (await f.run("message.get", { message: f.targetRef })).error!.code,
    "SCOPE_MISMATCH",
  );
});
