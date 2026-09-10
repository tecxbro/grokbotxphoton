import { isDeepStrictEqual } from 'node:util';
import { assertClaim, sameScope, type Action, type ExecutionServices, type Transaction } from '../../index.js';
import { requireCard } from './configuration.js';
export class CardOrdering {
  private readonly tails = new Map<string, Promise<void>>();
  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;
    try { return await work(); }
    finally { release(); if (this.tails.get(key) === tail) this.tails.delete(key); }
  }
}
/** Synchronous transaction immediately before dispatch; durable card phase also
 * excludes dispatch from a second process/module, even after lease expiry. */
export function fence(tx: Transaction, requestId: string, action: Action, s: ExecutionServices): void {
  const c = s.context, now = s.clock.now();
  requireCard(!s.signal.aborted, 'CANCELLED', 'Card operation was cancelled.');
  requireCard(c.contextId === action.contextId && c.revokedAt === null && c.expiresAt > now && c.permissions.includes(action.operation),
    'FORBIDDEN', 'Card execution context is not authorized.');
  const task = tx.get('tasks', c.taskId), outbox = tx.get('outbox', requestId);
  requireCard(task && outbox?.claim, 'STALE_FENCE', 'Shared executor task and claim are required.');
  requireCard(sameScope(task.scope, c.scope) && sameScope(outbox.scope, c.scope) && task.principalId === c.principalId &&
    outbox.principalId === c.principalId && outbox.taskId === c.taskId && outbox.generation === c.generation &&
    isDeepStrictEqual(outbox.action, action), 'FORBIDDEN', 'Shared executor record does not match the card action.');
  requireCard(task.generation === c.generation && s.claim.generation === c.generation, 'STALE_GENERATION', 'Card task generation is stale.');
  requireCard(task.cancelledAt === null && outbox.cancellationRequestedAt === null, 'CANCELLED', 'Card task or request was cancelled.');
  requireCard(outbox.claim.leaseUntil > now, 'STALE_FENCE', 'Shared executor lease expired.');
  try { assertClaim(s.claim, { ...outbox.claim, generation: task.generation, cancelled: false }, now); }
  catch { requireCard(false, 'STALE_FENCE', 'Card execution fence is stale.'); }
}

/** Public domain CAS: even revisions are settled; odd revisions denote unresolved
 * dispatch. An admission revision never comes from a late read of current state. */
export function assertCurrentCardRevision(unit: import('../../contracts/store.js').UnitOfWork,
  data: import('./session-codec.js').CardSession, expected: number,
  services: import('../../contracts/services.js').ExecutionServices) {
  services.assertActiveClaim();
  requireCard(Number.isSafeInteger(expected) && expected >= 0 && expected <= Number.MAX_SAFE_INTEGER - 2 && expected % 2 === 0,
    'IDEMPOTENCY_CONFLICT', 'A settled admission-time revision is required.');
  const card = unit.get('cards', data.card.id), session = unit.get('sessions', data.session.id);
  requireCard(card && session, 'RESOURCE_NOT_FOUND', 'Card/session mapping is unavailable.');
  requireCard(isDeepStrictEqual(card.reference, data.card) && isDeepStrictEqual(session.reference, data.session) &&
    card.templateId === data.templateId && sameScope(card.scope, services.context.scope) &&
    sameScope(session.scope, services.context.scope), 'SCOPE_MISMATCH', 'Card/session identity changed.');
  requireCard(data.taskId === services.context.taskId && data.principalId === services.context.principalId,
    'FORBIDDEN', 'Card belongs to a different task or principal.');
  requireCard(data.generation === services.context.generation && session.generation === services.context.generation,
    'STALE_GENERATION', 'Card generation is stale.');
  for (const reference of [data.message, data.card, data.session]) {
    const row = unit.get('references', reference.id);
    requireCard(row && isDeepStrictEqual(row.reference, reference) && sameScope(row.scope, services.context.scope) &&
      row.providerId === data.providerMessageId, 'SCOPE_MISMATCH', 'Original resource mapping changed.');
    requireCard(row.taskId === data.taskId && row.ownedByPrincipalId === data.principalId,
      'FORBIDDEN', 'Resource ownership changed.');
    requireCard(row.generation === data.generation, 'STALE_GENERATION', 'Resource generation changed.');
  }
  requireCard(card.revision % 2 === 0, 'UNAVAILABLE', 'Earlier card dispatch requires reconciliation.', 'card_update_outcome_unknown');
  requireCard(card.revision === expected && data.cardRevision === expected,
    'IDEMPOTENCY_CONFLICT', 'A newer card revision already completed.');
  return card;
}
