import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  Spectrum,
  definePlatform,
  type Space,
  type Message,
} from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { z } from "zod";
import {
  SpectrumOwner,
  cloudSdkFactory,
  type OwnedSdk,
} from "../../../src/adapters/transport/spectrum-owner.js";
import { NativeWebhookIngress } from "../../../src/adapters/transport/webhook-ingress.js";
import { SpectrumEventSource } from "../../../src/adapters/transport/event-source.js";
import { InboundRouter } from "../../../src/runtime/inbound/router.js";
import {
  fixture,
  routes,
  scope,
  chat,
  snapshot,
  taskRoute,
  deferred,
  settle,
} from "./helpers.js";
function fakeSdk() {
  let constructions = 0,
    listeners = 0,
    stops = 0;
  const selected: { id: string; phone: string }[] = [];
  const space = {
    startTyping: async () => {},
    stopTyping: async () => {},
  } as Space;
  const sdk: OwnedSdk = {
    messages: () => {
      listeners++;
      return { async *[Symbol.asyncIterator]() {} };
    },
    space: async (id, { phone }) => {
      selected.push({ id, phone });
      return space;
    },
    stop: async () => {
      stops++;
    },
  };
  return {
    sdk,
    selected,
    counts: () => ({ constructions, listeners, stops }),
    factory: async () => {
      constructions++;
      return sdk;
    },
  };
}
function webhookRequest(
  body: string,
  now: number,
  secret = "test-only-secret",
  headers: Record<string, string> = {},
) {
  const timestamp = String(Math.floor(now / 1000));
  const signature =
    "v0=" +
    createHmac("sha256", secret)
      .update(`v0:${timestamp}:`)
      .update(body)
      .digest("hex");
  return new Request("https://ingress.invalid/events", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-spectrum-timestamp": timestamp,
      "x-spectrum-signature": signature,
      ...headers,
    },
  });
}
const body = () =>
  JSON.stringify({
    event: "messages",
    space: snapshot().space,
    message: snapshot(),
  });
test("single SDK lifecycle and explicit multi-line routing; feature calls never create listeners", async () => {
  const f = fakeSdk(),
    owner = new SpectrumOwner(
      {
        inbound: "photon-stream",
        outbound: "imessage",
        wake: "existing-grok-task-handoff",
      },
      routes,
      f.factory,
    );
  await Promise.all([owner.start(), owner.start()]);
  await owner.space(scope, chat);
  await owner.space(routes.inbound("+15555550102", chat), chat);
  assert.deepEqual(
    f.selected.map((r) => r.phone),
    ["+15555550101", "+15555550102"],
  );
  await assert.rejects(
    owner.space({ ...scope, lineId: "missing" }, chat),
    /SCOPE/,
  );
  await assert.rejects(owner.space(scope, "other-chat"), /SCOPE/);
  assert.equal(f.counts().listeners, 0);
  owner.stream("only-owner");
  assert.throws(() => owner.stream("other"), /COMPETING/);
  assert.throws(
    () => owner.claimReceiver("photon-webhook", "other"),
    /COMPETING/,
  );
  assert.equal(f.counts().constructions, 1);
  assert.equal(f.counts().listeners, 1);
  await owner.stop();
  await owner.stop();
  assert.equal(f.counts().stops, 1);
  assert.equal(owner.ready(), false);
  assert.equal(owner.evidence().networkConnection, "unknown");
  assert.equal(typeof cloudSdkFactory, "function");
  assert.equal(typeof imessage.config, "function");
});
test("owner startup failure and stop during delayed startup clean up correctly", async () => {
  const f = fakeSdk(),
    start = deferred<OwnedSdk>();
  const owner = new SpectrumOwner(
    {
      inbound: "photon-stream",
      outbound: "imessage",
      wake: "existing-grok-task-handoff",
    },
    routes,
    () => start.promise,
  );
  const starting = owner.start(),
    stopping = owner.stop();
  start.resolve(f.sdk);
  await Promise.all([starting, stopping]);
  assert.equal(f.counts().stops, 1);
  assert.equal(owner.ready(), false);
  const failed = new SpectrumOwner(owner.dimensions, routes, async () => {
    throw new Error("configuration");
  });
  await assert.rejects(failed.start(), /configuration/);
  assert.equal(failed.ready(), false);
});
test("webhook acknowledges only after awaited durable acceptance and rejects persistence failure", async () => {
  const f = fixture(),
    sdk = fakeSdk(),
    owner = new SpectrumOwner(
      {
        inbound: "photon-webhook",
        outbound: "imessage",
        wake: "existing-grok-task-handoff",
      },
      routes,
      sdk.factory,
    );
  try {
    await owner.start();
    const ingress = new NativeWebhookIngress(
      owner,
      f.captures,
      f.clock,
      "test-only-secret",
    );
    const router = new InboundRouter(
        f.store,
        f.clock,
        { route: () => taskRoute },
        [],
      ),
      gate = deferred();
    let finished = false;
    await ingress.start(async (e) => {
      await gate.promise;
      await router.accept(e);
    });
    const response = ingress
      .handle(webhookRequest(body(), f.clock.now()))
      .then((r) => {
        finished = true;
        return r;
      });
    await settle();
    assert.equal(finished, false);
    gate.resolve();
    assert.equal((await response).status, 200);
    assert.equal(
      f.store.transaction((tx) => tx.list("inbox", scope, 100)).length,
      1,
    );
    assert.equal(sdk.counts().listeners, 0);
    await ingress.stop();
    const brokenOwner = new SpectrumOwner(
      owner.dimensions,
      routes,
      sdk.factory,
    );
    await brokenOwner.start();
    const broken = new NativeWebhookIngress(
      brokenOwner,
      f.captures,
      f.clock,
      "test-only-secret",
    );
    await broken.start(async () => {
      throw new Error("disk-full");
    });
    assert.equal(
      (await broken.handle(webhookRequest(body(), f.clock.now()))).status,
      503,
    );
    await broken.stop();
    await brokenOwner.stop();
  } finally {
    await owner.stop();
    f.close();
  }
});
test("invalid signatures, raw-byte tampering, stale/future timestamps and alternate envelopes cannot enter inbox", async () => {
  const f = fixture(),
    sdk = fakeSdk(),
    owner = new SpectrumOwner(
      {
        inbound: "photon-webhook",
        outbound: "imessage",
        wake: "existing-grok-task-handoff",
      },
      routes,
      sdk.factory,
    );
  try {
    await owner.start();
    const ingress = new NativeWebhookIngress(
      owner,
      f.captures,
      f.clock,
      "test-only-secret",
    );
    let accepted = 0;
    await ingress.start(async () => {
      accepted++;
    });
    for (const req of [
      webhookRequest(body(), f.clock.now(), "wrong"),
      webhookRequest(body(), f.clock.now() + 301000),
      webhookRequest(body(), f.clock.now(), "test-only-secret", {
        "x-spectrum-signature": "v1=" + "a".repeat(64),
      }),
      webhookRequest(body(), f.clock.now(), "test-only-secret", {
        "x-spectrum-timestamp": "10, 10",
      }),
    ])
      assert.equal((await ingress.handle(req)).status, 401);
    const signed = webhookRequest(body(), f.clock.now());
    assert.equal(
      (
        await ingress.handle(
          new Request(signed.url, {
            method: "POST",
            headers: signed.headers,
            body: body() + " ",
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await ingress.handle(
          webhookRequest(
            JSON.stringify({ event: "fusor", payload: {} }),
            f.clock.now(),
          ),
        )
      ).status,
      400,
    );
    assert.equal(
      (await ingress.handle(webhookRequest("not-json", f.clock.now()))).status,
      400,
    );
    const mismatch = JSON.stringify({
      event: "messages",
      space: { ...snapshot().space, phone: "+15555550102" },
      message: snapshot(),
    });
    assert.equal(
      (await ingress.handle(webhookRequest(mismatch, f.clock.now()))).status,
      422,
    );
    assert.equal(accepted, 0);
    assert.deepEqual([...f.captures.ids()], []);
    await ingress.stop();
  } finally {
    await owner.stop();
    f.close();
  }
});
test("actual pinned SDK helper returns before callback settles (offline custom provider)", async () => {
  const provider = definePlatform("wt02_test", {
    config: z.object({}),
    lifecycle: { createClient: async () => ({}) },
    user: { resolve: async ({ input }) => ({ id: input.userID }) },
    space: { create: async () => ({ id: "space" }) },
    async *messages() {},
    send: async () => undefined,
  });
  const secret = "test-only-secret";
  const app = await Spectrum({
    providers: [provider.config()],
    webhookSecret: secret,
  });
  try {
    const gate = deferred();
    let completed = false;
    const data = {
      event: "messages",
      message: {
        ...snapshot(),
        platform: "wt02_test",
        space: { id: "space", platform: "wt02_test" },
      },
    };
    const request = webhookRequest(JSON.stringify(data), Date.now(), secret);
    const response = await app.webhook(request, async () => {
      await gate.promise;
      completed = true;
    });
    assert.equal(response.status, 200);
    assert.equal(completed, false);
    gate.resolve();
    await settle();
    assert.equal(completed, true);
  } finally {
    await app.stop();
  }
});
test("stream failure remains inspectable and SDK's reconnect is not replaced with another connection", async () => {
  const f = fixture(),
    sdk = fakeSdk();
  sdk.sdk.messages = () => ({
    async *[Symbol.asyncIterator](): AsyncGenerator<[Space, Message]> {
      throw new Error("gap");
    },
  });
  const owner = new SpectrumOwner(
    {
      inbound: "photon-stream",
      outbound: "imessage",
      wake: "existing-grok-task-handoff",
    },
    routes,
    sdk.factory,
  );
  const reports: string[] = [];
  try {
    await owner.start();
    const source = new SpectrumEventSource(owner, f.captures, f.clock, (d) =>
      reports.push(d.code),
    );
    await source.start(async () => {});
    await settle();
    assert.equal(owner.ready(), false);
    assert.deepEqual(reports, ["RESTART_GAP", "RECEIVE_FAILED"]);
    assert.equal(sdk.counts().constructions, 1);
    await source.stop();
  } finally {
    await owner.stop();
    f.close();
  }
});
test("owner stops typing before destroying the shared client", async () => {
  const f = fakeSdk(),
    order: string[] = [];
  f.sdk.stop = async () => {
    order.push("sdk-stop");
  };
  const owner = new SpectrumOwner(
    {
      inbound: "photon-stream",
      outbound: "imessage",
      wake: "existing-grok-task-handoff",
    },
    routes,
    f.factory,
    {
      beforeStop: async () => {
        order.push("typing-stop");
      },
    },
  );
  await owner.start();
  await Promise.all([owner.stop(), owner.stop()]);
  assert.deepEqual(order, ["typing-stop", "sdk-stop"]);
});
