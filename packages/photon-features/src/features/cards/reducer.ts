import { isDeepStrictEqual } from 'node:util';
import { sameScope, type Transaction, type EventReducer } from '../../index.js';
import type { AuthenticatedInteraction } from './interaction-adapter.js';
import type { CardSession } from './session-codec.js';
import { requireCard } from './configuration.js';
import { key } from './state.js';
import type { ExecutionServices as PublicCardServices } from '../../contracts/services.js';
import { assertAuthenticatedInteraction } from './interaction-adapter.js';
import { decodeSession } from './session-codec.js';

/** Only invoked after backend authentication and the complete session binding checks. */
export function reduceAuthenticatedInteraction(tx: Transaction, input: AuthenticatedInteraction, data: CardSession, backendId: string, now: number):
  { status: 'unresolved' | 'replayed' } | { status: 'committed'; pointer: { handoffId: string; taskId: string; generation: number } } {
  const eventId = key('callback-event', backendId + ':' + input.eventId);
  const nonceId = key('callback-nonce', backendId + ':' + data.session.id + ':' + input.nonce);
  if (tx.get('inbox', eventId) || tx.get('inbox', nonceId)) return { status: 'replayed' };
  const task = tx.get('tasks', data.taskId), card = tx.get('cards', data.card.id), session = tx.get('sessions', data.session.id);
  const refs = [data.card, data.session, data.message].map(ref => tx.get('references', ref.id));
  const event = { version: 1 as const, type: 'app-interaction' as const, eventId,
    direction: 'inbound' as const, scope: data.card.scope, occurredAt: input.occurredAt, receivedAt: now,
    ordering: { source: backendId }, targets: [data.session, data.card, data.message],
    interactionId: input.eventId, session: data.session, actionId: input.actionId, selection: input.selection };
  if (!task || !card || !session || refs.some(ref => !ref)) {
    tx.put('inbox', { id: eventId, scope: event.scope, revision: 0, event, state: 'unresolved' }, null);
    tx.put('unresolved', { id: eventId, scope: event.scope, revision: 0, eventId, reason: 'unknown-card-or-task', checkpointId: key('session', data.session.id) }, null);
    return { status: 'unresolved' };
  }
  requireCard(sameScope(task.scope, data.card.scope) && task.principalId === data.principalId &&
    task.generation === data.generation && task.cancelledAt === null && session.generation === data.generation && session.expiresAt > now,
    'FORBIDDEN', 'Callback task or session is stale or cancelled.');
  requireCard(isDeepStrictEqual(card.reference, data.card) && isDeepStrictEqual(session.reference, data.session) &&
    session.allowedActionIds.includes(input.actionId) && refs.every((ref, index) => ref && sameScope(ref.scope, data.card.scope) &&
      ref.taskId === data.taskId && ref.generation === data.generation && ref.ownedByPrincipalId === data.principalId &&
      isDeepStrictEqual(ref.reference, [data.card, data.session, data.message][index])),
    'FORBIDDEN', 'Authoritative callback resources differ.');
  // Single-use nonce. To permit another interaction the backend/host must register a new session binding.
  tx.put('inbox', { id: eventId, scope: event.scope, revision: 0, event, state: 'reduced' }, null);
  tx.put('inbox', { id: nonceId, scope: event.scope, revision: 0, event: { ...event, eventId: nonceId }, state: 'reduced' }, null);
  tx.put('sessions', { ...session, revision: session.revision + 1 }, session.revision);
  const handoffId = key('callback-handoff', eventId);
  tx.put('handoffs', { id: handoffId, scope: event.scope, revision: 0, taskId: data.taskId, generation: data.generation,
    principalId: data.principalId, eventIds: [eventId], state: 'pending', claim: null, createdAt: now }, null);
  return { status: 'committed', pointer: { handoffId, taskId: data.taskId, generation: data.generation } };
}
/** F0 app-interaction events have no authenticated participant/nonce. They cannot
 * bypass the app backend by arriving through app.messages or a generic reducer. */
export const unverifiedInteractionReducer: EventReducer = {
  type: 'app-interaction',
  reduce(event, tx) {
    if (event.type !== 'app-interaction') return;
    const id = key('unverified-event', event.eventId);
    if (!tx.get('unresolved', id)) tx.put('unresolved', { id, scope: event.scope, revision: 0,
      eventId: event.eventId, reason: 'app_backend_authentication_required', checkpointId: null }, null);
  },
};


/** Reduce a backend-authenticated, durably captured event using the shared domain
 * transaction. Capture must contain the exact assertion including selection;
 * the trusted host checks its inbox through its own API, outside feature access.
 * Session consumption and continuation are atomic; only the runtime wakes after commit. */
export async function applyCardInteraction(input: AuthenticatedInteraction, snapshot: string | undefined,
  services: PublicCardServices, capturedEvent?: (event: AuthenticatedInteraction) => Promise<boolean>): Promise<
    { status: 'unresolved' | 'replayed' } | { status: 'committed'; continuationId: string }> {
  services.assertActiveClaim();
  if (!snapshot) return { status: 'unresolved' };
  const data = decodeSession(snapshot);
  const binding = data.callback;
  requireCard(binding, 'UNAVAILABLE', 'Card has no callback registration.', 'app_backend_contract_missing');
  assertAuthenticatedInteraction(input, binding.backendContractId);
  const now = services.clock.now();
  requireCard(isDeepStrictEqual(input.session, data.session) && sameScope(input.scope, data.card.scope) &&
    sameScope(input.scope, services.context.scope), 'SCOPE_MISMATCH', 'Callback card, chat or line differs.');
  requireCard(input.taskId === data.taskId && data.taskId === services.context.taskId && data.principalId === services.context.principalId,
    'FORBIDDEN', 'Callback task/principal differs.');
  requireCard(input.generation === data.generation && data.generation === services.context.generation,
    'STALE_GENERATION', 'Callback generation is stale.');
  requireCard(binding.expiresAt > now && input.occurredAt <= now + 30000 && input.occurredAt >= now - 300000 && input.occurredAt < binding.expiresAt,
    'FORBIDDEN', 'Callback has expired or its event timestamp is outside the freshness window.');
  requireCard(binding.nonce === input.nonce && binding.participantIds.includes(input.participantId) && binding.actionIds.includes(input.actionId),
    'FORBIDDEN', 'Callback participant, action or nonce is not allowed.');
  requireCard(capturedEvent, 'UNAVAILABLE', 'Host must durably capture the authenticated callback before reduction.', 'app_backend_capture_required');
  const captured = await capturedEvent(input);
  services.assertActiveClaim();
  assertAuthenticatedInteraction(input, binding.backendContractId);
  requireCard(captured, 'UNAVAILABLE', 'Authenticated event capture is unavailable.', 'app_backend_capture_required');
  const continuationId = key('continuation', binding.backendContractId + ':' + input.eventId);
  return services.transaction(unit => {
    services.assertActiveClaim();
    requireCard(binding.expiresAt > services.clock.now(), 'FORBIDDEN', 'Callback expired during durable capture.');
    const card = unit.get('cards', data.card.id), session = unit.get('sessions', data.session.id);
    if (!card || !session) return { status: 'unresolved' as const };
    requireCard(isDeepStrictEqual(card.reference, data.card) && isDeepStrictEqual(session.reference, data.session) &&
      card.templateId === data.templateId && sameScope(card.scope, input.scope) && sameScope(session.scope, input.scope),
      'SCOPE_MISMATCH', 'Authoritative callback card/session mapping differs.');
    requireCard(session.generation === input.generation, 'STALE_GENERATION', 'Authoritative session generation changed.');
    requireCard(session.expiresAt === binding.expiresAt && session.expiresAt > services.clock.now() && session.allowedActionIds.includes(input.actionId),
      'FORBIDDEN', 'Authoritative callback expiry or allowed action differs.');
    for (const reference of [data.card, data.session, data.message]) {
      const row = unit.get('references', reference.id);
      if (!row) return { status: 'unresolved' as const };
      requireCard(isDeepStrictEqual(row.reference, reference) && sameScope(row.scope, input.scope) && row.providerId === data.providerMessageId,
        'SCOPE_MISMATCH', 'Authoritative callback reference differs.');
      requireCard(row.taskId === data.taskId && row.ownedByPrincipalId === data.principalId,
        'FORBIDDEN', 'Authoritative callback resource ownership differs.');
      requireCard(row.generation === data.generation, 'STALE_GENERATION', 'Authoritative callback resource generation differs.');
    }
    if (session.revision > 0) return { status: 'replayed' as const };
    // F0 can persist consumption and a pointer, but not event payload. The checked
    // durable host event supplies selection on resume; never discard it into a wake.
    unit.put('sessions', { ...session, revision: 1 }, 0);
    unit.createContinuation({ id: continuationId, eventIds: [input.eventId], resumeKey: data.session.id });
    return { status: 'committed' as const, continuationId };
  });
}
