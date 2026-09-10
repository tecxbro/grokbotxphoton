import type { FeatureModule } from "../../src/index.js";
import { createPollModule, pollWorkflowAvailability } from "../../src/features/polls/module.js";

// Composition sample only: the host owns registration, the SDK, ingress, outbox and post-commit wakes.
export function pollFeatureForHost(): FeatureModule {
  return createPollModule({ voteIngress: "unknown", reduction: { orderedSources: [] } });
}
export const advertisement = pollWorkflowAvailability({
  voteIngress: "unknown", reduction: { orderedSources: [] },
});
// advertisement.creationImplemented === true; interactiveWorkflowAdvertisable === false at F0.
// Native identities, missing actors, and selection-state reconciliation require the WT-00/WT-02 requests.
