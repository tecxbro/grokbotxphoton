import { test } from "node:test";
import assert from "node:assert/strict";
import { avatar } from "spectrum-ts";
import { background, imessage, nativeContactCard } from "spectrum-ts/providers/imessage";
import { effectMapping } from "../../../src/features/native/effects.js";
import { nativeOperations } from "../../../src/features/native/module.js";
import { mapNativeOperation, nativeOperationMap } from "../../../src/features/native/sdk.js";
import { imageBytes } from "./fixture.js";

test("all 17 F0 operations map to pinned public Spectrum surfaces", () => {
  assert.equal(nativeOperations.length, 17);
  assert.deepEqual(Object.keys(nativeOperationMap), [...nativeOperations]);
  for (const operation of nativeOperations)
    assert.match(mapNativeOperation(operation) ?? "", /^(provider|space|resources)/);
});

test("pinned iMessage effects use exported Spectrum 12.8.0 constants", () => {
  assert.equal(effectMapping["invisible-ink"], imessage.effect.message.invisible);
  assert.equal(effectMapping.love, imessage.effect.message.heart);
  assert.equal(effectMapping["shooting-star"], imessage.effect.message.sparkles);
  assert.deepEqual(new Set(Object.values(effectMapping)), new Set(Object.values(imessage.effect.message)));
});

test("avatar, background, and native account card builders use public shapes", async () => {
  const builtAvatar = await avatar(imageBytes, { mimeType: "image/png" }).build();
  assert.equal(builtAvatar.type, "avatar");
  assert.equal(builtAvatar.action.kind, "set");
  if (builtAvatar.action.kind === "set") {
    assert.equal(builtAvatar.action.mimeType, "image/png");
    assert.deepEqual(await builtAvatar.action.read(), imageBytes);
  }
  assert.deepEqual(await background("clear").build(), {
    type: "background", action: { kind: "clear" }, __platform: "imessage", __fireAndForget: true,
  });
  assert.deepEqual(await nativeContactCard().build(), {
    type: "contactCard", __platform: "imessage", __fireAndForget: true,
  });
});
