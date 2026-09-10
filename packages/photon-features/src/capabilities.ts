import { operations, type Capability } from "./contracts/index.js";
export function foundationCapabilities(): Capability[] {
  return operations.map((operation) => ({
    operation,
    providerSupport: "unknown",
    availability: {
      account: "unknown",
      conversation: "unknown",
      checkedAt: null,
    },
    implementation: "unimplemented",
    direction: { inbound: "unknown", outbound: "unimplemented" },
    evidence: [],
    sdkVersion: "12.8.0",
    sources: ["npm:spectrum-ts@12.8.0", "npm:@spectrum-ts/imessage@12.8.0"],
    blockers: [
      "F0 defines contracts only; owner lane must implement and validate this operation.",
      "Account and conversation capabilities have not been inspected.",
    ],
  }));
}

/** F0 keeps support, availability, implementation, direction and evidence independent. */
export interface CapabilityRecord extends Omit<Capability, "evidence"> {
  evidence: {tier: "unit" | "sdk-contract" | "integration" | "live"; reference: string; observedAt: number; sdkVersion: string}[];
}
/** Evidence is explicit input, never inferred from a module name or a resolved provider promise. */
export function evaluateCapabilities(registered: ReadonlySet<string>, observations: readonly CapabilityRecord[] = []): CapabilityRecord[] {
  if (new Set(observations.map(c => c.operation)).size !== observations.length) throw new Error("DUPLICATE_CAPABILITY");
  for (const item of observations) {
    if (!operations.includes(item.operation as (typeof operations)[number])) throw new Error("UNKNOWN_OPERATION");
    if (item.implementation !== "unimplemented" && !registered.has(item.operation)) throw new Error("CAPABILITY_WITHOUT_HANDLER");
  }
  return foundationCapabilities().map(base => {
    const evidence = observations.find(c => c.operation === base.operation);
    return evidence ? structuredClone(evidence) : {...base, implementation: registered.has(base.operation) ? "partial" : "unimplemented"};
  });
}
