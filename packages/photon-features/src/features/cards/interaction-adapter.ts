import { z } from 'zod';
import { idSchema, scopeSchema, sessionRefSchema, sameScope, type TransactionStore, type Clock, type WakeAdapter, type IncomingEvent } from '../../index.js';
import { key, loadSession } from './state.js';
import { CardError, requireCard } from './configuration.js';
import { reduceAuthenticatedInteraction } from './reducer.js';
import { assertJsonData as assertInteractionJson } from '../../contracts/content.js';

/** Internal normalized assertion, NOT an invented app-backend wire protocol.
 * The configured backend verifier must authenticate raw bytes and the participant,
 * validate its real wire schema, and return this bounded assertion. */
export const authenticatedInteractionSchema = z.strictObject({
  version: z.literal(1), eventId: idSchema, session: sessionRefSchema, scope: scopeSchema,
  taskId: idSchema, generation: z.number().int().nonnegative(), participantId: idSchema,
  nonce: idSchema, actionId: idSchema, selection: z.array(idSchema).max(32),
  occurredAt: z.number().int().nonnegative(),
});
export type AuthenticatedInteraction = z.infer<typeof authenticatedInteractionSchema>;
export interface AppBackendContract {
  id: string;
  /** A real protocol/version/source reference, supplied by WT-00's approved host. */
  source: string;
  authenticate(request: { body: Uint8Array; headers: Readonly<Record<string, string>> }): Promise<unknown>;
}
export type InteractionResult =
  | { status: 'blocked'; blockerId: 'app_backend_contract_missing' }
  | { status: 'rejected'; reason: string }
  | { status: 'unresolved' | 'replayed' }
  | { status: 'committed'; handoffId: string; wake: 'accepted' | 'failed' | 'unknown' };
export function createInteractionAdapter(options: { backend?: AppBackendContract; transactions: TransactionStore; clock: Clock; wake: WakeAdapter }) {
  return {
    /** Exported HTTP-host seam only. Does not listen, subscribe, create a server or SDK client. */
    async accept(request: { body: Uint8Array; headers: Readonly<Record<string, string>> }): Promise<InteractionResult> {
      const backend = options.backend;
      if (!backend?.source || !idSchema.safeParse(backend.id).success) return { status: 'blocked', blockerId: 'app_backend_contract_missing' };
      if (!(request.body instanceof Uint8Array) || request.body.byteLength === 0 || request.body.byteLength > 16384 ||
        Object.keys(request.headers).length > 32 || Object.entries(request.headers).some(([k, v]) => k.length > 200 || v.length > 2048))
        return { status: 'rejected', reason: 'body_or_headers_out_of_bounds' };
      let assertion: AuthenticatedInteraction;
      try { assertion = authenticatedInteractionSchema.parse(await backend.authenticate(request)); }
      catch { return { status: 'rejected', reason: 'unauthorized_or_malformed' }; }
      const now = options.clock.now();
      let reduced: ReturnType<typeof reduceAuthenticatedInteraction>;
      try {
        reduced = options.transactions.transaction(tx => {
          // Unknown references are durable, authenticated unresolved records; never select a recent task.
          let loaded;
          try { loaded = loadSession(tx, assertion.session.id); }
          catch (error) {
            if (!(error instanceof CardError) || error.code !== 'RESOURCE_NOT_FOUND') throw error;
            const id = key('callback-event', backend.id + ':' + assertion.eventId);
            if (!tx.get('unresolved', id)) {
              const event: IncomingEvent = { version: 1, eventId: id, direction: 'inbound', scope: assertion.scope,
                occurredAt: assertion.occurredAt, receivedAt: now, ordering: { source: backend.id }, targets: [assertion.session],
                type: 'unresolved', reason: 'unknown-target', quarantineId: id };
              tx.put('inbox', { id, scope: event.scope, revision: 0, event, state: 'unresolved' }, null);
              tx.put('unresolved', { id, scope: event.scope, revision: 0, eventId: id, reason: 'unknown-card-session', checkpointId: null }, null);
            }
            return { status: 'unresolved' as const };
          }
          const { data } = loaded, binding = data.callback;
          requireCard(binding && binding.backendContractId === backend.id, 'FORBIDDEN', 'Callback backend is not bound to this session.');
          requireCard(sameScope(assertion.scope, data.card.scope) && sameScope(assertion.session.scope, data.card.scope) &&
            assertion.session.cardId === data.card.id, 'SCOPE_MISMATCH', 'Callback conversation or line binding differs.');
          requireCard(assertion.taskId === data.taskId && assertion.generation === data.generation,
            'FORBIDDEN', 'Callback task binding differs.');
          requireCard(binding.participantIds.includes(assertion.participantId), 'FORBIDDEN', 'Callback participant is not permitted.');
          requireCard(binding.nonce === assertion.nonce && binding.actionIds.includes(assertion.actionId), 'FORBIDDEN', 'Callback nonce or interaction is not permitted.');
          requireCard(binding.expiresAt > now && assertion.occurredAt <= now + 30000 && assertion.occurredAt >= now - 300000,
            'CONTEXT_EXPIRED', 'Callback has expired.');
          return reduceAuthenticatedInteraction(tx, assertion, data, backend.id, now);
        });
      } catch (error) {
        // Transaction failure never crosses the wake boundary. No exception text/credentials escape.
        return { status: 'rejected', reason: error instanceof CardError ? error.code : 'transaction_failed' };
      }
      if (reduced.status !== 'committed') return reduced;
      let wake: 'accepted' | 'failed' | 'unknown';
      try { wake = (await options.wake.wake(reduced.pointer)).status; } catch { wake = 'unknown'; }
      return { status: 'committed', handoffId: reduced.pointer.handoffId, wake };
    },
  };
}

const authenticatedBackend = new WeakMap<AuthenticatedInteraction, { id: string; json: string }>();
/** Validate inert internal assertions only. This function grants no authentication. */
export function normalizeInteraction(input: unknown): AuthenticatedInteraction {
  assertInteractionJson(input);
  return authenticatedInteractionSchema.parse(input);
}

/** Host callback seam: delegate to its configured, documented backend wire
 * verifier. No default HMAC protocol, app.messages subscription or server exists. */
export async function authenticateInteraction(request: { body: Uint8Array; headers: Readonly<Record<string, string>> },
  backend?: AppBackendContract): Promise<AuthenticatedInteraction> {
  requireCard(backend && backend.source.trim() && idSchema.safeParse(backend.id).success, 'UNAVAILABLE',
    'Actual app backend return-path contract is not configured.', 'app_backend_contract_missing');
  requireCard(request.body instanceof Uint8Array && request.body.byteLength > 0 && request.body.byteLength <= 16384 &&
    Object.keys(request.headers).length <= 32 && Object.entries(request.headers).every(([k, v]) => k.length <= 200 && typeof v === 'string' && v.length <= 2048),
    'INVALID_REQUEST', 'Callback body or headers exceed bounds.');
  const assertion = normalizeInteraction(await backend.authenticate({ body: new Uint8Array(request.body), headers: { ...request.headers } }));
  authenticatedBackend.set(assertion, { id: backend.id, json: JSON.stringify(assertion) });
  return assertion;
}
/** Reject caller-created or mutated normalized assertions at the reduction seam. */
export function assertAuthenticatedInteraction(input: AuthenticatedInteraction, backendId: string): void {
  const proof = authenticatedBackend.get(input);
  requireCard(proof && proof.id === backendId && proof.json === JSON.stringify(input),
    'UNAUTHENTICATED', 'Callback assertion was not authenticated by its bound backend.');
}
