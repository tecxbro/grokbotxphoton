import test from "node:test";
import assert from "node:assert/strict";
import {
  Spectrum,
  definePlatform,
  UnsupportedError,
  text,
  markdown,
  richlink,
  group,
  reply,
  read,
  edit,
  unsend,
  type Content,
} from "spectrum-ts";
import { z } from "zod";
import { fixture } from "./fixture.js";
test("pinned public builders retain exact content, grouping and stream shapes", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  assert.deepEqual(await text("Ada").build(), { type: "text", text: "Ada" });
  assert.deepEqual(await markdown("**Ada**").build(), {
    type: "markdown",
    markdown: "**Ada**",
  });
  assert.deepEqual(await richlink("https://example.com").build(), {
    type: "richlink",
    url: "https://example.com",
  });
  const grouped = await group(text("one"), text("two")).build();
  assert.equal(grouped.type, "group");
  if (grouped.type === "group") assert.equal(grouped.items.length, 2);
  assert.equal((await reply(text("hello"), f.target).build()).type, "reply");
  assert.equal((await read(f.target).build()).type, "read");
  await assert.rejects(() => edit(text("bad"), f.target).build());
  await assert.rejects(() => unsend(f.target).build());
  f.target.direction = "outbound";
  assert.equal((await edit(text("new"), f.target).build()).type, "edit");
  const source = text(
    (async function* () {
      yield "a";
      yield "b";
    })(),
  );
  const content = await source.build();
  assert.equal(content.type, "streamText");
  if (content.type === "streamText") {
    let value = "";
    for await (const delta of content.stream()) value += delta;
    assert.equal(value, "ab");
    await assert.rejects(async () => {
      for await (const _ of content.stream()) {
      }
    });
  }
});
test("real Spectrum runtime preserves reaction handles, void controls, buffering and unsupported skip semantics", async () => {
  const calls: Content[] = [];
  let id = 0;
  // Explicit test-only transport. No Photon client, credentials, sockets, or network calls.
  const testProvider = definePlatform("wt03_fixture", {
    config: z.object({}),
    lifecycle: { createClient: async () => ({}) },
    user: { resolve: async ({ input }) => ({ id: input.userID }) },
    space: {
      create: async () => ({ id: "chat" }),
      get: async ({ input }) => ({ id: input.id }),
    },
    async *messages() {},
    send: async ({ space, content }) => {
      calls.push(content);
      if (content.type === "streamText")
        throw UnsupportedError.content("streamText", "wt03_fixture");
      if (
        content.type === "edit" ||
        content.type === "unsend" ||
        content.type === "read"
      )
        return undefined;
      if (content.type === "reply")
        throw UnsupportedError.content("reply", "wt03_fixture");
      return { id: `id-${++id}`, content, space, timestamp: new Date() };
    },
  });
  const app = await Spectrum({
    providers: [testProvider.config({})],
    telemetry: false,
    options: { logLevel: "silent" },
  });
  try {
    const space = await testProvider(app).space.get("chat");
    const target = await space.send(text("hello"));
    assert.ok(target);
    const reaction = await target.react("❤️");
    assert.ok(reaction);
    assert.equal(reaction.content.target.id, target.id);
    assert.equal(await reaction.unsend(), undefined);
    assert.equal(calls.at(-1)!.type, "unsend");
    assert.equal(await target.edit(text("new")), undefined);
    assert.equal(await target.reply(text("unsupported")), undefined);
    const sent = await space.send(
      text(
        (async function* () {
          yield "a";
          yield "b";
        })(),
      ),
    );
    assert.ok(sent);
    assert.deepEqual(sent.content, { type: "text", text: "ab" });
  } finally {
    await app.stop();
  }
});

test("public F0 factory registers all thirteen owned handlers without starting the provider", async () => {
  const { createFeatureModule, ownedOperations } = await import(
    "../../../src/features/text-messages/module.js"
  );
  const { registerFeatureModules } = await import(
    "../../../src/registry/modules.js"
  );
  const { scope } = await import("../../fixtures/runtime-services.js");
  let starts = 0;
  const module = createFeatureModule({
    provider: {
      provider: "imessage",
      scope,
      ready: () => true,
      start: async () => {
        starts++;
      },
      stop: async () => {},
    },
    binding: () => ({ scope, phone: "unused", nativeSpaceId: "unused" }),
    resources: {
      space: async () => {
        throw Error("unused");
      },
      message: async () => {
        throw Error("unused");
      },
    },
  });
  const registry = registerFeatureModules([module]);
  assert.equal(registry.handlers.size, 13);
  assert.equal(starts, 0);
  for (const operation of ownedOperations)
    assert.ok(registry.handlers.has(operation));
  assert.equal(registry.missing.length, 31);
});
