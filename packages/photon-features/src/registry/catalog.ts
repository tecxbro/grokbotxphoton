import { operationArguments, operations, type Operation } from "../contracts/actions.js";
import { operationOwners } from "./index.js";
const reads = new Set<Operation>(["message.get", "attachment.fetch", "poll.get", "space.get", "space.getName", "space.getMembers", "space.getAvatar", "metadata.get"]);
/** Canonical catalog derives schemas/owners from the preserved wire contract. */
export const operationCatalog = Object.freeze(operations.map(operation => Object.freeze({
  operation, owner: operationOwners[operation], schema: operationArguments[operation],
  permission: operation, sideEffect: reads.has(operation) ? "read" as const : "provider-write" as const,
  references: Object.keys(operationArguments[operation].shape).filter(k => ["space","message","reaction","attachment","poll","option","card","session","stream"].includes(k)),
  resultSchema: "result.schema.json", implementation: "unimplemented" as const,
})));
