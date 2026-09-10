import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveContents,
  type Space,
  type Message,
  type ContentInput,
} from "spectrum-ts";
import {
  makeServices,
  scope,
  context,
} from "../../fixtures/runtime-services.js";
import { createFeatureModule } from "../../../src/features/text-messages/module.js";
import { streamBounds } from "../../../src/features/text-messages/streaming.js";
import type { PublicTextMessageOptions } from "../../../src/features/text-messages/sdk.js";
import {
  resourceRefSchema,
  type ResourceRef,
} from "../../../src/contracts/references.js";

function streaming(source: () => AsyncIterable<string>) {
  const f = makeServices();
  let opens = 0,
    sends = 0;
  const contents: unknown[] = [];
  const services = {
    ...f.services,
    context: { ...context, permissions: ["text.stream" as const] },
  };
  const spaceRef: Extract<ResourceRef, { kind: "space" }> = {
    version: 1,
    kind: "space",
    id: scope.spaceId,
    scope,
  };
  const ref: Extract<ResourceRef, { kind: "stream" }> = {
    version: 1,
    kind: "stream",
    id: "stream",
    scope,
    generation: context.generation,
    expiresAt: 5000,
  };
  f.resources.set(spaceRef.id, resourceRefSchema.parse(spaceRef));
  f.resources.set(ref.id, resourceRefSchema.parse(ref));
  services.transaction((unit) => {
    unit.put(
      "references",
      {
        id: spaceRef.id,
        reference: spaceRef,
        scope,
        providerId: "chat",
        ownedByPrincipalId: context.principalId,
        taskId: context.taskId,
        generation: context.generation,
        revision: 0,
      },
      null,
    );
    unit.put(
      "streams",
      {
        id: ref.id,
        scope,
        reference: ref,
        principalId: context.principalId,
        taskId: context.taskId,
        codecId: "trusted",
        codecVersion: 1,
        checkpointId: null,
        state: "registered",
        revision: 0,
      },
      null,
    );
  });
  services.streams = {
    open: async () => {
      opens++;
      return source();
    },
  };
  const space = {
    id: "chat",
    __platform: "imessage",
    phone: "phone",
    send: async (input: ContentInput) => {
      sends++;
      const content = (await resolveContents([input]))[0]!;
      contents.push(content);
      return {
        id: `message-${sends}`,
        space,
        platform: "imessage",
        direction: "outbound",
        content,
        timestamp: new Date(f.clock.now()),
      } as Message;
    },
  } as unknown as Space;
  const options: PublicTextMessageOptions = {
    provider: {
      provider: "imessage",
      scope,
      ready: () => true,
      start: async () => {},
      stop: async () => {},
    },
    binding: () => ({ scope, phone: "phone", nativeSpaceId: "chat" }),
    resources: {
      space: async () => space,
      message: async () => {
        throw Error("unused");
      },
    },
  };
  const module = createFeatureModule(options);
  const run = (key = "request") =>
    module.handlers["text.stream"]!(
      {
        version: 1,
        contextId: context.contextId,
        idempotencyKey: key,
        operation: "text.stream",
        arguments: { space: spaceRef, stream: ref },
      },
      services,
    );
  return {
    ...f,
    services,
    space,
    ref,
    run,
    contents,
    counts: () => ({ opens, sends }),
  };
}

test("registered text stream consumes once, buffers, and replays shared result without reopening", async () => {
  const f = streaming(async function* () {
    yield "Hello ";
    yield "Ada.";
  });
  const first = await f.run();
  assert.equal(first.status, "provider-accepted");
  assert.equal(first.capability!.providerSupport, "fallback");
  assert.deepEqual(f.contents, [{ type: "text", text: "hello Ada." }]);
  assert.deepEqual(f.counts(), { opens: 1, sends: 1 });
  assert.equal((await f.run()).status, "provider-accepted");
  assert.deepEqual(f.counts(), { opens: 1, sends: 1 });
  // A separate parent cannot claim the same consumed stream.
  f.children.clear();
  assert.equal((await f.run("another")).status, "failed");
  assert.deepEqual(f.counts(), { opens: 1, sends: 1 });
});
test("stream errors, oversize, chunk limits, empty output and invalid voice all fail before send", async () => {
  for (const source of [
    async function* () {
      throw Error("source failure");
      yield "unreachable";
    },
    async function* () {
      yield "x".repeat(streamBounds.characters + 1);
    },
    async function* () {
      for (let i = 0; i <= streamBounds.chunks; i++) yield "";
    },
    async function* () {},
    async function* () {
      yield "Ready? Sure?";
    },
  ]) {
    const f = streaming(source);
    const r = await f.run();
    assert.equal(r.status, "failed");
    assert.equal(r.error!.retry, "never");
    assert.equal(f.counts().sends, 0);
    assert.equal(
      f.services.transaction((u) => u.get("streams", f.ref.id))!.state,
      "closed",
    );
  }
});
test("cancellation interrupts a stalled iterator and cleanup does not wait for its return", async () => {
  let returned = false;
  const f = streaming(() => ({
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise<IteratorResult<string>>(() => {}),
        return: () => {
          returned = true;
          return new Promise<IteratorResult<string>>(() => {});
        },
      };
    },
  }));
  const running = f.run();
  setImmediate(() => f.abort.abort());
  const result = await running;
  await Promise.resolve();
  assert.equal(result.status, "cancelled");
  assert.equal(f.counts().sends, 0);
  assert.ok(returned);
});
test("stream expiry, wrong registration ownership and generation prevent opening", async () => {
  for (const mode of ["expiry", "owner", "generation"]) {
    const f = streaming(async function* () {
      yield "hello";
    });
    if (mode === "expiry") f.ref.expiresAt = 500;
    else if (mode === "generation") f.ref.generation++;
    else
      f.services.transaction((u) => {
        const row = u.get("streams", f.ref.id)!;
        u.put(
          "streams",
          { ...row, principalId: "other", revision: row.revision + 1 },
          row.revision,
        );
      });
    const r = await f.run();
    assert.equal(r.status, "failed");
    assert.deepEqual(f.counts(), { opens: 0, sends: 0 });
  }
});
test("provider exception after buffered stream send remains unknown and cannot reopen", async () => {
  const f = streaming(async function* () {
    yield "hello";
  });
  let attempted = 0;
  f.space.send = (async () => {
    attempted++;
    throw Error("write outcome unknown");
  }) as Space["send"];
  assert.equal((await f.run()).status, "unknown-outcome");
  assert.equal((await f.run()).error!.retry, "reconcile-first");
  assert.equal(attempted, 1);
  assert.equal(f.counts().opens, 1);
});
test("stream generation revocation during consumption prevents provider dispatch", async () => {
  const f = streaming(async function* () {
    yield "hello";
    f.authoritative.generation++;
    yield " Ada";
  });
  const r = await f.run();
  assert.equal(r.status, "failed");
  assert.equal(f.counts().sends, 0);
});

test("registered-source deadline interrupts stalled open without sending", async () => {
  const f = streaming(async function* () {
    yield "unreachable";
  });
  f.ref.expiresAt = f.clock.now() + 5;
  f.resources.set(f.ref.id, resourceRefSchema.parse(f.ref));
  f.services.transaction((u) => {
    const row = u.get("streams", f.ref.id)!;
    u.put(
      "streams",
      { ...row, reference: f.ref, revision: row.revision + 1 },
      row.revision,
    );
  });
  f.services.streams = {
    open: async () => new Promise<AsyncIterable<string>>(() => {}),
  };
  const result = await f.run();
  assert.equal(result.status, "failed");
  assert.equal(result.error!.retry, "never");
  assert.equal(f.counts().sends, 0);
});
