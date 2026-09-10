import type { SpectrumInstance } from "spectrum-ts";
import type { Clock, ResourceResolver, TransactionStore, TrustedContext } from "../../src/index.js";
import {
  SafeMediaStager, createMediaModule, mediaProvider, nativeMediaSource,
  type ScopedMediaBinding, type NormalizedMediaLookup,
} from "../../src/features/media/index.js";

/** Called by the shared host after it has authenticated and bound its existing provider. */
export async function prepareMediaFeature(app: SpectrumInstance, host: {
  store: TransactionStore;
  resources: ResourceResolver;
  clock: Clock;
  privateStagingDirectory: string;
  approvedSourceRoots: readonly string[];
  approvedDownloadHosts: readonly string[];
  route(context: TrustedContext): Promise<Omit<ScopedMediaBinding, "provider">>;
  incomingMetadata?: NormalizedMediaLookup;
}) {
  const provider = mediaProvider(app);
  const bindings = async (context: TrustedContext): Promise<ScopedMediaBinding> => ({
    ...await host.route(context), provider,
  });
  const media = await SafeMediaStager.create({
    directory: host.privateStagingDirectory,
    approvedRoots: host.approvedSourceRoots,
    urls: { approvedHosts: host.approvedDownloadHosts },
    store: host.store,
    clock: host.clock,
    native: nativeMediaSource(host.resources, bindings, host.store, host.incomingMetadata),
  });
  return { media, module: createMediaModule({ bindings, voiceBehavior: "native" }) };
}
