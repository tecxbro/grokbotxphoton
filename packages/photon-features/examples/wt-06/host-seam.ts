import { createCardsModule, createInteractionAdapter, type CardOptions, type AppBackendContract } from '../../src/features/cards/module.js';
import type { Clock, TransactionStore, WakeAdapter } from '../../src/index.js';

/** WT-00 supplies actual configured templates, route/line binding, request identity,
 * and immutable admission revision lookup. No default URLs, Apple identities or
 * authentication secrets are fabricated by this example. */
export function cardsForApprovedHost(cards: CardOptions, state: {
  transactions: TransactionStore; clock: Clock; wake: WakeAdapter; backend?: AppBackendContract;
}) {
  return {
    // Add this module to the ONE shared production registry/executor.
    module: createCardsModule(cards),
    // Mount accept on the approved host only after implementing its actual backend protocol.
    // The backend must receive the durable session/nonce registration through its own
    // authenticated control path. This example does not deploy that path.
    callback: createInteractionAdapter(state),
  };
}
