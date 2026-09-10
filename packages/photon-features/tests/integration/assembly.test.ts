import test from "node:test";
import assert from "node:assert/strict";
import { operations } from "../../src/contracts/actions.js";
import { assembleFeatureSurface, createPollContentModule, requiredCompilerFamilies } from "../../src/integration/assembly.js";
import { createTypingModule, createTypingFeatureModule } from "../../src/runtime/typing/operations.js";
import { TypingLeases } from "../../src/runtime/typing/leases.js";
import { createTextMessageModule, createFeatureModule as createTextFeature } from "../../src/features/text-messages/module.js";
import { createMediaModule, createFeatureModule as createMediaFeature } from "../../src/features/media/module.js";
import { createPollModule, createFeatureModule as createPollFeature } from "../../src/features/polls/module.js";
import { createCardsModule, createFeatureModule as createCardFeature } from "../../src/features/cards/module.js";
import { createNativeModule, createPublicFeatureModule as createNativeFeature } from "../../src/features/native/module.js";
import type { Scope } from "../../src/contracts/resources.js";
import type { ExecutionServices } from "../../src/contracts/services.js";
import type { ActionFor } from "../../src/contracts/actions.js";
import { fixture as nativeFixture, sample as nativeSample } from "../lanes/wt-07/fixture.js";

const scope: Scope = {
  projectId: "integration-project",
  provider: "imessage",
  accountId: "integration-account",
  lineId: "integration-line",
  spaceId: "integration-space",
};
const unavailable = (): never => { throw new Error("INERT_INTEGRATION_FIXTURE"); };
const clock = { now: () => 10_000 };

test("actual lane factories assemble exactly 44 public handlers and every shared compiler", () => {
  const leases = new TypingLeases(clock, async () => unavailable());
  const textOptions = {
    binding: () => ({ scope, phone: "+15555550100", nativeSpaceId: "native-space" }),
    requestId: () => "integration-request",
  };
  const text = createTextMessageModule(textOptions);
  const media = createMediaModule({ bindings: async () => unavailable() });
  const polls = createPollModule();
  const cards = createCardsModule({ templates: [], ...textOptions });
  const native = createNativeModule({
    binding: async () => unavailable(),
    authorizeIntent: async () => unavailable(),
    authorizeContent: async () => unavailable(),
    compilers: [...text.compilers, ...media.compilers, ...cards.compilers],
  });
  const pollContent = createPollContentModule();

  const provider = {
    provider: "imessage" as const,
    scope,
    ready: () => false,
    start: async () => {},
    stop: async () => {},
  };
  const publicTextOptions = {
    provider,
    binding: textOptions.binding,
    resources: { space: async () => unavailable(), message: async () => unavailable() },
  };
  const publicModules = [
    createTypingFeatureModule(leases, () => unavailable()),
    createTextFeature(publicTextOptions),
    createMediaFeature({ provider: async () => unavailable(), voiceBehavior: "native" }),
    createPollFeature(),
    createCardFeature({
      templates: [],
      binding: textOptions.binding,
      space: async () => unavailable(),
      requestId: () => "integration-request",
    }),
    createNativeFeature({
      binding: async () => unavailable(),
      authorizeIntent: async () => unavailable(),
      authorizeContent: async () => unavailable(),
      compilers: native.compilers,
      resources: publicTextOptions.resources,
    }),
  ];
  const assembled = assembleFeatureSurface({
    publicModules,
    compatibilityModules: [
      createTypingModule(leases, () => unavailable()),
      text,
      media,
      polls,
      cards,
      native,
      pollContent,
    ],
  });

  assert.equal(operations.length, 44);
  assert.equal(assembled.publicRegistry.handlers.size, 44);
  assert.deepEqual(assembled.publicRegistry.missing, []);
  assert.equal(assembled.compatibilityRegistry.handlers.size, 44);
  assert.deepEqual(
    [...assembled.compatibilityRegistry.compilers.keys()].sort(),
    [...requiredCompilerFamilies].sort(),
  );
});

test("assembly fails closed when a public lane or compiler is absent", () => {
  assert.throws(
    () => assembleFeatureSurface({ publicModules: [], compatibilityModules: [] }),
    /MISSING_HANDLERS/,
  );
});

test("public native adapter dispatches through exactly one durable child", async () => {
  const f = nativeFixture();
  const action = nativeSample("space.getName") as ActionFor<"space.getName">;
  f.grant(action);
  const childSignals: AbortSignal[] = [];
  const childController = new AbortController();
  const services: ExecutionServices = {
    context: f.services.context,
    claim: f.services.claim,
    signal: f.services.signal,
    clock: f.services.clock,
    assertActiveClaim: () => {},
    resolveResource: reference => f.services.resources.resolve(reference, f.services.context),
    transaction: run => f.services.transactions.transaction(tx => run({
      get: tx.get.bind(tx),
      put: tx.put.bind(tx),
      createContinuation: unavailable,
    })),
    executeChild: async child => {
      childSignals.push(childController.signal);
      assert.equal(child.index, 0);
      assert.equal(child.key, "native:space.getName");
      assert.match(child.argumentsDigest, /^[a-f0-9]{64}$/);
      return child.dispatch(childController.signal);
    },
    recordReceipt: async () => {},
    media: f.services.media,
    streams: f.services.streams,
  };
  const module = createNativeFeature({
    ...f.deps,
    resources: {
      space: reference => f.services.resources.space(reference, f.services.context),
      message: reference => f.services.resources.message(reference, f.services.context),
    },
  });

  const result = await module.handlers["space.getName"]!(action, services);

  assert.equal(childSignals.length, 1);
  assert.deepEqual(result.value, { type: "name", name: "Group" });
  assert.equal(f.calls.filter(call => call.method === "getDisplayName").length, 1);
  f.close();
});
