import { compilePoll } from "../features/polls/sdk.js";
import type { ContentSpec, FeatureModule as CompatibilityModule } from "../contracts/index.js";
import type { FeatureModule } from "../contracts/feature.js";
import { buildRegistry } from "../registry/index.js";
import { registerFeatureModules } from "../registry/modules.js";

export const requiredCompilerFamilies = Object.freeze([
  "text",
  "markdown",
  "link",
  "group",
  "reply",
  "attachment",
  "voice",
  "contact",
  "poll",
  "app",
  "effect",
  "registered-custom",
] as const);

/** Poll composition belongs to integration because WT-05 exposes the public
 * builder but intentionally leaves its compatibility module compiler-free. */
export function createPollContentModule(): CompatibilityModule {
  return {
    id: "integration.poll-content",
    lane: "wt-05",
    mode: "production",
    handlers: [],
    reducers: [],
    capabilities: [],
    recoveryCodecs: [],
    compilers: [{
      family: "poll",
      compile: async input => {
        if (input.type !== "poll") throw new Error("INVALID_REQUEST");
        return compilePoll(input.question, input.options);
      },
    }],
  };
}

export interface IntegratedFeatureSurface {
  publicModules: readonly FeatureModule[];
  compatibilityModules: readonly CompatibilityModule[];
}

/** Pure composition validation. Provider/store/socket lifecycle remains explicit
 * in createRuntimeHost; this function never opens credentials or starts clients. */
export function assembleFeatureSurface(input: IntegratedFeatureSurface) {
  const publicRegistry = registerFeatureModules(input.publicModules, true);
  const compatibilityRegistry = buildRegistry(input.compatibilityModules, {
    requireComplete: true,
  });
  const missingCompilers = requiredCompilerFamilies.filter(
    family => !compatibilityRegistry.compilers.has(family as ContentSpec["type"]),
  );
  if (missingCompilers.length)
    throw new Error(`MISSING_COMPILERS:${missingCompilers.join(",")}`);
  return { publicRegistry, compatibilityRegistry };
}
