import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { sameScope, type ResourceRef, type ExecutionServices, type Transaction, type CheckpointRecord } from '../../index.js';
import { requireCard } from './configuration.js';
import { decodeSession, encodeSession, SESSION_CODEC, type CardSession } from './session-codec.js';
export const key = (kind: string, id: string) => `wt06.${kind}.${createHash('sha256').update(id).digest('hex')}`;
export function ownedReference(tx: Transaction, ref: ResourceRef, s: ExecutionServices): void {
  const record = tx.get('references', ref.id);
  requireCard(record && sameScope(ref.scope, s.context.scope) && sameScope(record.scope, ref.scope) &&
    isDeepStrictEqual(record.reference, ref), 'SCOPE_MISMATCH', 'Authoritative card resource mapping is missing or differs.');
  requireCard(record.ownedByPrincipalId === s.context.principalId && record.taskId === s.context.taskId,
    'FORBIDDEN', 'Card resource belongs to another principal or task.');
  requireCard(record.generation === s.context.generation, 'STALE_GENERATION', 'Card resource generation is stale.');
}
export function loadSession(tx: Transaction, sessionId: string): { checkpoint: CheckpointRecord; data: CardSession } {
  const checkpoint = tx.get('checkpoints', key('session', sessionId));
  requireCard(checkpoint?.codecId === SESSION_CODEC.id && checkpoint.codecVersion === SESSION_CODEC.version,
    'RESOURCE_NOT_FOUND', 'Card session checkpoint is unavailable.');
  const data = decodeSession(checkpoint.payloadJson);
  requireCard(data.session.id === sessionId && sameScope(checkpoint.scope, data.session.scope), 'SCOPE_MISMATCH', 'Session checkpoint identity differs.');
  return { checkpoint, data };
}
export function saveSession(tx: Transaction, data: CardSession, requestId: string, s: ExecutionServices): void {
  const id = key('session', data.session.id), previous = tx.get('checkpoints', id);
  tx.put('checkpoints', { id, scope: data.card.scope, revision: previous ? previous.revision + 1 : 0,
    requestId, codecId: SESSION_CODEC.id, codecVersion: SESSION_CODEC.version, payloadJson: encodeSession(data), nextChildIndex: 0, claim: s.claim }, previous?.revision ?? null);
}
export function assertSession(tx: Transaction, data: CardSession, s: ExecutionServices): void {
  for (const ref of [data.card, data.session, data.message]) ownedReference(tx, ref, s);
  requireCard(tx.get('references', data.message.id)?.providerId === data.providerMessageId,
    'SCOPE_MISMATCH', 'Authoritative original message mapping changed.');
  requireCard(data.taskId === s.context.taskId && data.principalId === s.context.principalId,
    'FORBIDDEN', 'Card session is bound to another task or principal.');
  requireCard(data.generation === s.context.generation, 'STALE_GENERATION', 'Card session generation is stale.');
  const card = tx.get('cards', data.card.id), session = tx.get('sessions', data.session.id);
  requireCard(card && session && card.revision === data.cardRevision && card.templateId === data.templateId &&
    isDeepStrictEqual(card.reference, data.card) && isDeepStrictEqual(session.reference, data.session) &&
    session.generation === data.generation && sameScope(card.scope, data.card.scope) && sameScope(session.scope, data.card.scope),
    'IDEMPOTENCY_CONFLICT', 'Card revision or session binding changed.');
  requireCard(data.phase === 'ready', 'UNAVAILABLE', 'An earlier card update has an unresolved in-flight outcome.', 'card_update_outcome_unknown');
}
