import { z } from 'zod';
import { idSchema, type FeatureModule, type Capability } from '../../index.js';
import { CardOperations } from './operations.js';
import { templateFor, type CardOptions } from './configuration.js';
import { cardContent } from './sdk.js';
import { recoveryCodec, SESSION_CODEC } from './session-codec.js';
import { unverifiedInteractionReducer } from './reducer.js';
import type { FeatureModule as PublicFeatureModule } from '../../contracts/feature.js';
import { CardRuntime, executeCardOperation, type CardRuntimeOptions } from './operations.js';

const source = 'https://photon.codes/docs/spectrum-ts/content/app';
const operations = ['app.send', 'app.sendCustomized', 'app.update'] as const;
export function cardCapabilities(): Capability[] {
  return operations.map(operation => ({ operation, providerSupport: 'native',
    availability: { account: 'unknown', conversation: 'unknown', checkedAt: null },
    implementation: 'implemented', direction: { inbound: 'not-applicable', outbound: 'implemented' },
    evidence: [], sdkVersion: '12.8.0', sources: [source],
    blockers: operation === 'app.sendCustomized' ? ['Host extension registration required; device rendering unverified.'] :
      operation === 'app.update' ? ['Original SDK session and admission revision binding required. Universal layout changes need a configured backend URL mapping.'] :
        ['Host template registration required; device rendering unverified.'] }));
}
/** Separate report: a URL preview, static card, live extension and backend callback
 * are independent capabilities and none is promoted by provider acceptance. */
export function cardCapabilityReport(options: CardOptions) {
  return { richLinkPreview: { owner: 'wt-03', liveVerified: false },
    staticCard: { implemented: true, liveVerified: false },
    liveRendering: { implemented: true, configuredTemplates: options.templates.filter(t => t.live?.installedExtensionVerified).map(t => t.id), liveVerified: false },
    authenticatedCallback: { adapterImplemented: true, backendConfigured: false, liveVerified: false },
    restartRestoration: { supportedFromCheckpointAlone: false, blockerId: 'requires_original_session' } };
}
export function createCardsModule(options: CardOptions): FeatureModule {
  const handlers = new CardOperations(options);
  const dispatchSchema = z.strictObject({ version: z.literal(1), requestId: idSchema, phase: z.enum(['dispatching', 'returned']) });
  return { id: 'photon.cards', lane: 'wt-06', mode: 'production',
    handlers: operations.map(operation => ({ operation, execute: (action, services) => handlers.execute(action, services),
      recoveryCodec: operation === 'app.update' ? SESSION_CODEC : { id: 'wt06.card-dispatch', version: 1 } })),
    compilers: [{ family: 'app', async compile(content, services) {
      if (content.type !== 'app') throw new Error('CARD_COMPILER_FAMILY_MISMATCH');
      const template = templateFor(options, content.templateId);
      return cardContent(template, content.url, content.layout, services);
    } }],
    reducers: [unverifiedInteractionReducer], capabilities: cardCapabilities(),
    recoveryCodecs: [recoveryCodec, { id: 'wt06.card-dispatch', version: 1, validate: value => dispatchSchema.safeParse(value).success,
      reconcile: async () => 'unknown' }],
  };
}
export { createInteractionAdapter } from './interaction-adapter.js';
export type { AppBackendContract, AuthenticatedInteraction } from './interaction-adapter.js';
export type { CardOptions, CardTemplate } from './configuration.js';

/** Register only public f0-services-2 handlers. The host supplies one existing
 * executor/transport/store; legacy module registration is deliberately separate. */
export function createFeatureModule(options: CardRuntimeOptions | CardRuntime): PublicFeatureModule<'app.send' | 'app.sendCustomized' | 'app.update'> {
  const runtime = options instanceof CardRuntime ? options : new CardRuntime(options);
  return { id: 'photon.cards', owner: 'wt-06', handlers: {
    'app.send': (action, services) => executeCardOperation(action, services, runtime),
    'app.sendCustomized': (action, services) => executeCardOperation(action, services, runtime),
    'app.update': (action, services) => executeCardOperation(action, services, runtime),
  } };
}
export { authenticateInteraction, normalizeInteraction } from './interaction-adapter.js';
export { applyCardInteraction } from './reducer.js';
