import {
  incomingEventSchema, sameScope, type EventReducer, type IncomingEvent,
} from "../../contracts/index.js";
import type { Transaction } from "../../state/index.js";
import { requireNative } from "./guards.js";

/** Consumes a group event already authenticated, normalized, and durably
 * captured by WT-02. F0 has no group projection table, so this synchronous
 * reducer validates scope only and deliberately creates no work or reply. */
export function applyNativeEvent(event: IncomingEvent, tx: Transaction): void {
  const parsed = incomingEventSchema.parse(event);
  requireNative(parsed.type === "group", "INVALID_REQUEST", "Expected a normalized group event.");
  requireNative(parsed.direction !== "outbound", "INVALID_REQUEST", "Outbound group events are not reducer input.");
  requireNative(parsed.targets.every(target => sameScope(target.scope, parsed.scope)),
    "SCOPE_MISMATCH", "Group event target scope mismatch.");
  requireNative(parsed.targets.some(target => target.kind === "space" && target.id === parsed.scope.spaceId),
    "SCOPE_MISMATCH", "Group event must target its scoped conversation.");
  void tx;
}

export const nativeGroupReducer: EventReducer = {
  type: "group",
  reduce: applyNativeEvent,
};
