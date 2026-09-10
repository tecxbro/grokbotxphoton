import type { FeatureModule } from "../../src/index.js";
import { createNativeModule } from "../../src/features/native/module.js";
import type { NativeDependencies } from "../../src/features/native/sdk.js";

/** Composition example only. The host supplies its existing provider, authoritative
 * grants, common content compilers, and guarded avatar retention. No client or
 * service is created and no operation runs when this module is imported. */
export function nativeFeatureForHost(ports: NativeDependencies): FeatureModule {
  return createNativeModule(ports);
}
