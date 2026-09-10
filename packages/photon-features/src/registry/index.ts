import {
  operations,
  type Operation,
  type FeatureModule,
} from "../contracts/index.js";
const laneOperations = {
  "wt-02": ["typing.begin", "typing.end"],
  "wt-03": [
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
  ],
  "wt-04": [
    "attachment.send",
    "attachment.fetch",
    "voice.send",
    "contact.send",
  ],
  "wt-05": [
    "poll.create",
    "poll.get",
    "poll.vote",
    "poll.unvote",
    "poll.addOption",
  ],
  "wt-06": ["app.send", "app.sendCustomized", "app.update"],
  "wt-07": [
    "space.get",
    "space.create",
    "space.getName",
    "space.rename",
    "space.getMembers",
    "space.addMembers",
    "space.removeMembers",
    "space.leave",
    "space.getAvatar",
    "space.setAvatar",
    "space.clearAvatar",
    "space.setBackground",
    "space.clearBackground",
    "account.shareContact",
    "effect.send",
    "metadata.get",
    "custom.send",
  ],
} as const;
export function verifyOwnership(
  input: Readonly<Record<string, readonly string[]>>,
): Record<Operation, string> {
  const owners = new Map<string, string>();
  for (const [lane, ops] of Object.entries(input))
    for (const op of ops) {
      if (owners.has(op)) throw new Error(`DUPLICATE_OWNERSHIP:${op}`);
      if (!operations.includes(op as Operation))
        throw new Error(`UNKNOWN_OPERATION:${op}`);
      owners.set(op, lane);
    }
  for (const op of operations)
    if (!owners.has(op)) throw new Error(`MISSING_OWNERSHIP:${op}`);
  return Object.fromEntries(owners) as Record<Operation, string>;
}
export const operationOwners = Object.freeze(verifyOwnership(laneOperations));
export const operationRegistrations = operations.map((operation) =>
  Object.freeze({
    operation,
    owner: operationOwners[operation],
    implementation: "unimplemented" as const,
  }),
);
export function buildRegistry(
  modules: readonly FeatureModule[],
  options: { requireComplete: boolean } = { requireComplete: true },
) {
  const handlers = new Map<Operation, FeatureModule["handlers"][number]>();
  const compilers = new Map<string, FeatureModule["compilers"][number]>();
  const reducers = new Map<string, FeatureModule["reducers"][number]>();
  const codecs = new Map<string, FeatureModule["recoveryCodecs"][number]>();
  const ids = new Set<string>();
  for (const m of modules) {
    if (m.mode !== "production") throw new Error("TEST_MODULE_FORBIDDEN");
    if (ids.has(m.id)) throw new Error("DUPLICATE_MODULE");
    ids.add(m.id);
    for (const codec of m.recoveryCodecs) {
      const key = `${codec.id}@${codec.version}`;
      if (codecs.has(key)) throw new Error("DUPLICATE_CODEC");
      codecs.set(key, codec);
    }
    for (const h of m.handlers) {
      if (operationOwners[h.operation] !== m.lane)
        throw new Error(`WRONG_OWNER:${h.operation}`);
      if (handlers.has(h.operation))
        throw new Error(`DUPLICATE_HANDLER:${h.operation}`);
      if (
        !m.recoveryCodecs.some(
          (c) =>
            c.id === h.recoveryCodec.id &&
            c.version === h.recoveryCodec.version,
        )
      )
        throw new Error(`MISSING_CODEC:${h.operation}`);
      handlers.set(h.operation, h);
    }
    for (const c of m.compilers) {
      if (compilers.has(c.family))
        throw new Error(`DUPLICATE_COMPILER:${c.family}`);
      compilers.set(c.family, c);
    }
    for (const r of m.reducers) {
      if (reducers.has(r.type)) throw new Error(`DUPLICATE_REDUCER:${r.type}`);
      reducers.set(r.type, r);
    }
    for (const c of m.capabilities) {
      if (operationOwners[c.operation as Operation] !== m.lane)
        throw new Error("WRONG_CAPABILITY_OWNER");
      if (
        c.implementation === "implemented" &&
        !m.handlers.some((h) => h.operation === c.operation)
      )
        throw new Error("CAPABILITY_WITHOUT_HANDLER");
    }
  }
  const missing = operations.filter((op) => !handlers.has(op));
  if (options.requireComplete && missing.length)
    throw new Error(`MISSING_HANDLERS:${missing.join(",")}`);
  return { handlers, compilers, reducers, codecs, missing };
}
