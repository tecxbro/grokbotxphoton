import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { text, markdown, attachment, avatar, type ContentInput, type Message } from "spectrum-ts";
import { background, nativeContactCard } from "spectrum-ts/providers/imessage";
import {
  assertScope, buildRegistry, parseAction, type Action, type ExecutionServices, type ResourceRef,
} from "../../../src/index.js";
import { context, FixedClock, storeFixture } from "../../fixtures/harness.js";
import { createNativeModule, nativeOperations } from "../../../src/features/native/module.js";
import { nativeContactHandler } from "../../../src/features/native/custom-handlers.js";
import type { NativeBinding, NativeDependencies, NativeSpace } from "../../../src/features/native/sdk.js";

export const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1iEAAAAASUVORK5CYII=", "base64");
export const staged = { stagingId: "staged-1", bytes: imageBytes.length, mimeType: "image/png",
  sha256: createHash("sha256").update(imageBytes).digest("hex") };
export const spaceRef = { version: 1, kind: "space", id: context.scope.spaceId, scope: context.scope } as const;
export const cardRef = { version: 1, kind: "card", id: "card-1", messageId: "message-1", scope: context.scope } as const;
export function sample(operation: typeof nativeOperations[number]): Action {
  const fixture = JSON.parse(readFileSync(`packages/photon-features/tests/fixtures/${operation}.json`, "utf8"));
  if ("media" in fixture.valid.arguments) fixture.valid.arguments.media = staged;
  if (operation === "custom.send") fixture.valid.arguments.codecId = nativeContactHandler.id;
  if (operation === "space.addMembers") fixture.valid.arguments.members = ["+15555550999"];
  return parseAction(fixture.valid);
}

export function fixture() {
  const db = storeFixture();
  const calls: { method: string; args: unknown[] }[] = [];
  const built: unknown[] = [];
  const intents = new Set<string>();
  const clock = new FixedClock();
  const controller = new AbortController();
  const behavior = { denyContent: false, noSendResult: false, failWrite: false,
    noAvatar: false, mediaFailure: false, service: "iMessage" as "iMessage" | "SMS" | "unknown",
    writeHook: () => {}, members: ["+15555550100", "+15555550101", "+15555550102"] };
  const note = (method: string, ...args: unknown[]) => calls.push({ method, args });
  async function write(method: string, ...args: unknown[]) {
    note(method, ...args); behavior.writeHook();
    if (behavior.failWrite) throw new Error("secret-token provider failed +15555559999");
  }
  // Mocks deliberately implement no client configuration/lifecycle surface.
  const space = {
    __platform: "imessage", id: "iMessage;+;group-1", phone: "+15555550002", type: "group",
    getDisplayName: async () => { note("getDisplayName"); return "Group"; },
    getMembers: async () => { note("getMembers"); return behavior.members.map(id => ({ __platform: "imessage", id })); },
    getAvatar: async () => { note("getAvatar"); return behavior.noAvatar ? undefined : { data: imageBytes, mimeType: "image/png" }; },
    rename: async (name: string) => write("rename", name),
    add: async (members: string[]) => write("add", members),
    remove: async (members: string[]) => write("remove", members),
    leave: async () => write("leave"),
    avatar: async (input: Buffer | "clear", options?: { mimeType: string }) => {
      built.push(await (input === "clear" ? avatar(input) : avatar(input, options!)).build());
      await write("avatar", input, options);
    },
    background: async (input: Buffer | "clear", options?: { mimeType: string }) => {
      built.push(await (input === "clear" ? background(input) : background(input, options)).build());
      await write("background", input, options);
    },
    shareContactCard: async () => { built.push(await nativeContactCard().build()); await write("shareContactCard"); },
    send: async (input: ContentInput) => {
      built.push(typeof input === "string" ? await text(input).build() : await input.build());
      await write("send"); return behavior.noSendResult ? undefined : message;
    },
  } as unknown as NativeSpace;
  const message = { id: "apple-message-1", platform: "imessage", space, direction: "outbound",
    timestamp: new Date(1234), dateEdited: new Date(2345), content: { type: "text", text: "private" },
    nativeText: "private", token: "secret", sender: { id: "private-email@example.com" } } as unknown as Message;
  const services: ExecutionServices = {
    context: { ...context, scope: { ...context.scope }, permissions: [...nativeOperations] },
    clock, signal: controller.signal,
    claim: { owner: "worker-7", leaseUntil: 100000, generation: context.generation, fence: 1 },
    transactions: db.store,
    resources: {
      resolve: async ref => { assertScope(ref, services.context.scope); note("resolve", ref); return ref; },
      space: async ref => { assertScope(ref, services.context.scope); note("resolveSpace", ref); return space; },
      message: async ref => { assertScope(ref, services.context.scope); note("resolveMessage", ref); return message; },
    },
    media: { resolve: async media => {
      note("media.resolve", media); if (behavior.mediaFailure) throw new Error("unsafe bytes");
      return { bytes: imageBytes, mimeType: "image/png" };
    } },
    streams: { open: async () => { throw new Error("No streams in WT-07"); } },
  };
  const binding: NativeBinding = {
    scope: services.context.scope, phone: space.phone, dedicated: true, accountReady: true,
    availableOperations: [...nativeOperations],
    provider: { getMembers: async () => { note("provider.getMembers"); return behavior.members.map(id => ({ __platform: "imessage", id, service: behavior.service })); }, space: {
      get: async (id, params) => { note("space.get", id, params); return space; },
      create: async (members, params) => {
        await write("space.create", members, params);
        return { ...space, id: "iMessage;+;new-group", type: Array.isArray(members) && members.length > 1 ? "group" : "dm" };
      },
    } },
  };
  const deps: NativeDependencies = {
    binding: async () => { note("binding"); return binding; },
    authorizeIntent: async action => {
      if (!intents.has(JSON.stringify(action))) throw new Error("No trusted user intent");
    },
    authorizeContent: async () => { if (behavior.denyContent) throw new Error("No composition intent"); },
    compilers: [
      { family: "text", compile: async content => { if (content.type !== "text") throw Error(); return text(content.text); } },
      { family: "markdown", compile: async content => { if (content.type !== "markdown") throw Error(); return markdown(content.text); } },
      { family: "attachment", compile: async (content, s) => {
        if (content.type !== "attachment") throw Error(); const media = await s.media.resolve(content.media, s.context);
        return attachment(Buffer.from(media.bytes), { mimeType: media.mimeType });
      } },
    ],
    retainAvatar: async (image, s) => {
      note("retainAvatar", image.mimeType, s.context.scope);
      return staged;
    },
  };
  db.store.transaction(tx => tx.put("cards", { id: cardRef.id, scope: context.scope, revision: 0,
    reference: cardRef, templateId: nativeContactHandler.id }, null));
  const module = createNativeModule(deps);
  const registry = buildRegistry([module], { requireComplete: false });
  function grant(action: Action) { intents.add(JSON.stringify(parseAction(action))); }
  async function run(action: Action, authorized = true) {
    if (authorized) {
      grant(action);
      if (action.operation === "custom.send") grant({ ...action, operation: "account.shareContact", arguments: { space: action.arguments.space } });
    }
    return registry.handlers.get(action.operation)!.execute(action, services);
  }
  return { ...db, services, calls, built, intents, grant, run, binding, deps, behavior,
    space, message, clock, controller, module, registry };
}
