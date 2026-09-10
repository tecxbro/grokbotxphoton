import type { Capability, FeatureModule } from "../../index.js";
import { checkpointSchema, codecIdentity, executePoll, pollOperations } from "./operations.js";
import { createPollReducer, type PollReductionPolicy } from "./reducer.js";

export interface PollModuleConfiguration {
  voteIngress: "available" | "unavailable" | "unknown";
  reduction: PollReductionPolicy;
}
export function pollWorkflowAvailability(config: PollModuleConfiguration) {
  return { creationImplemented: true, interactiveWorkflowAdvertisable: false as const,
    blockers: ["Native identity/state lookup is not exposed by the F0 shared services.",
      ...(config.voteIngress === "available" ? [] : ["Active vote ingress is unavailable or unverified."])] };
}
export function createPollModule(config: PollModuleConfiguration = {
  voteIngress: "unknown", reduction: { orderedSources: [] },
}): FeatureModule {
  const capabilities: Capability[] = pollOperations.map(operation => ({
    operation, providerSupport: "native", implementation: operation === "poll.create" ? "implemented" : "unimplemented",
    availability: { account: "unknown", conversation: "unknown", checkedAt: null },
    direction: { inbound: operation === "poll.create" ?
      (config.voteIngress === "available" ? "implemented" : "unknown") : "not-applicable",
      outbound: operation === "poll.create" ? "implemented" : "unimplemented" },
    sdkVersion: "12.8.0", evidence: [],
    sources: ["https://photon.codes/docs/spectrum-ts/content/polls", "https://photon.codes/docs/advanced-kits/imessage/polls"],
    blockers: operation === "poll.create" ? pollWorkflowAvailability(config).blockers :
      ["Application integration missing: F0 approves no shared advanced poll extension; not an SDK/provider absence."],
  }));
  return {
    id: "polls", lane: "wt-05", mode: "production",
    handlers: pollOperations.map(operation => ({ operation, execute: executePoll, recoveryCodec: codecIdentity })),
    // Nested poll content needs WT-03's child identity registration before it can advertise continuation.
    compilers: [], reducers: [createPollReducer(config.reduction)], capabilities,
    recoveryCodecs: [{ ...codecIdentity,
      validate: checkpoint => checkpointSchema.safeParse(checkpoint).success,
      reconcile: async checkpoint => {
        const parsed = checkpointSchema.safeParse(checkpoint);
        return parsed.success && parsed.data.stage === "completed" &&
          parsed.data.result?.status === "provider-accepted" ? "completed" : "unknown";
      },
    }],
  };
}

import type { FeatureModule as F0FeatureModule } from "../../contracts/feature.js";
import { executePollOperation } from "./operations.js";
import type { PollProviderBinding } from "./sdk.js";

/** F0 module factory; inert construction and no second SDK owner.
 * Registration is handler availability only. Consult pollFeatureAvailability before advertising
 * an interactive workflow; native management stays explicitly blocked on the frozen F0 seam.
 */
export function createFeatureModule(binding?: PollProviderBinding): F0FeatureModule {
  return { id: "polls", owner: "wt-05", handlers: {
    "poll.create": (action, services) => executePollOperation(action, services, binding),
    "poll.get": (action, services) => executePollOperation(action, services, binding),
    "poll.vote": (action, services) => executePollOperation(action, services, binding),
    "poll.unvote": (action, services) => executePollOperation(action, services, binding),
    "poll.addOption": (action, services) => executePollOperation(action, services, binding),
  } };
}

/** Separate outbound implementation from provider availability and actual incoming user votes. */
export function pollFeatureAvailability(voteIngress: PollModuleConfiguration["voteIngress"] = "unknown") {
  return {
    operations: { "poll.create": "implemented", "poll.get": "blocked", "poll.vote": "blocked",
      "poll.unvote": "blocked", "poll.addOption": "blocked" } as const,
    outboundProviderAvailability: "unverified" as const,
    voteIngress, interactiveWorkflowAdvertisable: false as const,
    blockers: ["wt-05-advanced-polls", ...(voteIngress === "available" ? [] : ["wt-05-vote-ingress"])],
  };
}
