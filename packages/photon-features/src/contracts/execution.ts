import type { Lifecycle } from "./results.js";
import type { Claim } from "../state/ports.js";
/** Executor progress is not provider evidence. Receipt transitions require correlated observations. */
export const lifecycleTransitions: Readonly<
  Record<Lifecycle, readonly Lifecycle[]>
> = {
  queued: [
    "executor-completed",
    "provider-accepted",
    "blocked",
    "failed",
    "cancelled",
    "unknown-outcome",
  ],
  "executor-completed": [
    "provider-accepted",
    "observed-delivered",
    "observed-read",
    "unknown-outcome",
  ],
  "provider-accepted": [
    "observed-delivered",
    "observed-read",
    "failed",
    "unknown-outcome",
  ],
  "observed-delivered": ["observed-read"],
  "observed-read": [],
  blocked: ["queued", "cancelled", "failed"],
  failed: [],
  cancelled: [],
  "unknown-outcome": [
    "provider-accepted",
    "observed-delivered",
    "observed-read",
    "failed",
  ],
};
export function assertTransition(from: Lifecycle, to: Lifecycle): void {
  if (from !== to && !lifecycleTransitions[from].includes(to))
    throw new Error("INVALID_LIFECYCLE_TRANSITION");
}
export function assertClaim(
  claim: Claim,
  current: {
    owner: string;
    fence: number;
    generation: number;
    cancelled: boolean;
  },
  now: number,
): void {
  if (current.cancelled) throw new Error("CANCELLED");
  if (claim.generation !== current.generation)
    throw new Error("STALE_GENERATION");
  if (
    claim.owner !== current.owner ||
    claim.fence !== current.fence ||
    claim.leaseUntil <= now
  )
    throw new Error("STALE_FENCE");
}
export type RetryDecision =
  | "safe-before-dispatch"
  | "provider-deduplicated"
  | "reconcile-first"
  | "never";
export interface AdvancedProviderExtension {
  /** No extension is enabled at F0. WT-00 must accept a public-interface probe first. */
  id: string;
  sdkPackage: string;
  sdkVersion: string;
  publicExport: string;
  probeReference: string;
  operations: readonly string[];
  recovery: {
    supportsProviderIdempotency: boolean;
    supportsOutcomeLookup: boolean;
  };
}
export const approvedAdvancedExtensions: readonly AdvancedProviderExtension[] =
  Object.freeze([]);
