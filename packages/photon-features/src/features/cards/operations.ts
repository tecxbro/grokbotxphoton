import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { Message } from 'spectrum-ts';
import { parseAction, type Action, type ActionFor, type ExecutionServices, type OperationResult, type ResourceRef } from '../../index.js';
import { CardError, requireCard, templateFor, approvedUrl, type CardOptions } from './configuration.js';
import { cardContent, checkSpace, checkMessage, preparedSend, preparedEdit } from './sdk.js';
import { restoreOriginal, sessionMetadata, type CardSession } from './session-codec.js';
import { CardOrdering, fence } from './update-ordering.js';
import { key, ownedReference, loadSession, saveSession, assertSession } from './state.js';
import type { ExecutionServices as PublicServices } from '../../contracts/services.js';
import type { Space } from 'spectrum-ts';
import type { CardTemplate } from './configuration.js';
import { createHash } from 'node:crypto';
import { mapCardOperation } from './sdk.js';
import { encodeCardSession, restoreCardSession } from './session-codec.js';
import { assertCurrentCardRevision } from './update-ordering.js';
import { imessage as nativeIMessage } from 'spectrum-ts/providers/imessage';

type CardAction = ActionFor<'app.send'> | ActionFor<'app.sendCustomized'> | ActionFor<'app.update'>;
export class CardOperations {
  private readonly ordering = new CardOrdering();
  private readonly retained = new Map<string, Message>();
  constructor(private readonly options: CardOptions) {}
  async execute(input: Action, s: ExecutionServices): Promise<OperationResult> {
    const requestId = this.options.requestId(input, s);
    try {
      const action = parseAction(input);
      requireCard(action.operation === 'app.send' || action.operation === 'app.sendCustomized' || action.operation === 'app.update',
        'INVALID_REQUEST', 'Operation is not owned by the cards module.');
      if (action.operation === 'app.update') {
        const expectedRevision = this.options.updateRevision?.(action, s);
        requireCard(expectedRevision !== undefined && Number.isSafeInteger(expectedRevision) && expectedRevision >= 0,
          'UNAVAILABLE', 'An immutable card revision binding from shared request admission is required.', 'card_update_revision_required');
        const initial = s.transactions.transaction(tx => loadSession(tx, action.arguments.session.id));
        return await this.ordering.run(key('card', initial.data.card.id), () => this.update(action, requestId, s, expectedRevision));
      }
      return await this.ordering.run(key('send', requestId), () => this.send(action, requestId, s));
    } catch (error) {
      const known = error instanceof CardError;
      const code = known ? error.code : error instanceof ZodError ? 'INVALID_REQUEST' : 'INTERNAL';
      return { version: 1, requestId, revision: 0, updatedAt: s.clock.now(), references: [], observations: [],
        status: code === 'CANCELLED' ? 'cancelled' : code === 'UNAVAILABLE' || code === 'UNSUPPORTED' ? 'blocked' : 'failed',
        error: { code, message: known ? error.message : 'Card operation failed before dispatch.',
          retry: known && error.blockerId === 'card_update_outcome_unknown' ? 'reconcile-first' : code === 'UNAVAILABLE' ? 'safe-before-dispatch' : 'never',
          blockerId: known ? error.blockerId : undefined } };
    }
  }
  private unknown(requestId: string, s: ExecutionServices, references: ResourceRef[] = []): OperationResult {
    return { version: 1, requestId, revision: 0, status: 'unknown-outcome', updatedAt: s.clock.now(), references,
      error: { code: 'UNKNOWN_OUTCOME', message: 'Card dispatch or subsequent durable commit has an uncertain outcome; reconcile before retry.', retry: 'reconcile-first' },
      observations: [{ kind: 'unknown', source: 'sdk-return', at: s.clock.now() }] };
  }
  private async send(action: Exclude<CardAction, ActionFor<'app.update'>>, requestId: string, s: ExecutionServices): Promise<OperationResult> {
    const { arguments: args } = action, template = templateFor(this.options, args.templateId);
    requireCard(template.kind === (action.operation === 'app.send' ? 'universal' : 'customized'), 'INVALID_REQUEST', 'Operation does not match the registered template kind.');
    s.transactions.transaction(tx => { fence(tx, requestId, action, s); ownedReference(tx, args.space, s); });
    const space = await s.resources.space(args.space, s.context);
    checkSpace(space, s, this.options);
    const mapping = s.transactions.transaction(tx => tx.get('references', args.space.id));
    requireCard(mapping?.providerId === space.id, 'SCOPE_MISMATCH', 'Space mapping differs from the SDK conversation.');
    const content = await preparedSend(await cardContent(template, args.url, 'layout' in args ? args.layout : undefined, s));
    const markerId = key('send', requestId);
    const admitted = s.transactions.transaction(tx => {
      fence(tx, requestId, action, s);
      if (tx.get('checkpoints', markerId)) return false;
      tx.put('checkpoints', { id: markerId, scope: s.context.scope, revision: 0, requestId,
        codecId: 'wt06.card-dispatch', codecVersion: 1,
        payloadJson: JSON.stringify({ version: 1, requestId, phase: 'dispatching' }), nextChildIndex: 0, claim: s.claim }, null);
      return true;
    });
    if (!admitted) return this.unknown(requestId, s);
    try {
      const message = await space.send(content);
      // Undefined on send can mean unsupported/warn-and-skip, never a successful card.
      if (!message) return this.unknown(requestId, s);
      checkMessage(message, s, this.options);
      const metadata = sessionMetadata(message);
      requireCard(!metadata || metadata.chatGuid === space.id, 'SCOPE_MISMATCH', 'Provider session points at a different conversation.');
      const scope = s.context.scope;
      const messageRef: Extract<ResourceRef, { kind: 'message' }> = { version: 1, kind: 'message', id: key('message', requestId), scope };
      const card: CardSession['card'] = { version: 1, kind: 'card', id: key('card', requestId), messageId: messageRef.id, scope };
      const session: CardSession['session'] = { version: 1, kind: 'card-session', id: key('handle', requestId), cardId: card.id, scope };
      const interaction = template.interactions;
      const data: CardSession = { version: 1, sdkVersion: '12.8.0', card, session, message: messageRef, providerMessageId: message.id,
        templateId: template.id, kind: template.kind, taskId: s.context.taskId, principalId: s.context.principalId,
        generation: s.context.generation, cardRevision: 0, url: args.url, phase: 'ready', metadata,
        callback: interaction ? { backendContractId: interaction.backendContractId, nonce: randomUUID(), participantIds: [...interaction.participantIds],
          actionIds: [...interaction.actionIds], expiresAt: s.clock.now() + interaction.ttlMs } : null };
      s.transactions.transaction(tx => {
        fence(tx, requestId, action, s);
        for (const reference of [messageRef, card, session]) tx.put('references', {
          id: reference.id, scope, revision: 0, reference, providerId: message.id, ownedByPrincipalId: s.context.principalId,
          taskId: s.context.taskId, generation: s.context.generation }, null);
        tx.put('cards', { id: card.id, scope, revision: 0, reference: card, templateId: template.id }, null);
        tx.put('sessions', { id: session.id, scope, revision: 0, reference: session,
          allowedActionIds: data.callback?.actionIds ?? [], expiresAt: data.callback?.expiresAt ?? Number.MAX_SAFE_INTEGER, generation: data.generation }, null);
        saveSession(tx, data, requestId, s);
        const marker = tx.get('checkpoints', markerId)!;
        tx.put('checkpoints', { ...marker, revision: marker.revision + 1, payloadJson: JSON.stringify({ version: 1, requestId, phase: 'returned' }) }, marker.revision);
      });
      // Bounded cache contains only live handles; evicted entries use the public resolver.
      if (this.retained.size >= 1000) this.retained.delete(this.retained.keys().next().value!);
      this.retained.set(session.id, message);
      return { version: 1, requestId, revision: 0, status: 'provider-accepted', updatedAt: s.clock.now(), references: [messageRef, card, session],
        observations: [{ kind: 'accepted', source: 'sdk-return', at: s.clock.now() }] };
    } catch { return this.unknown(requestId, s); }
  }
  private async update(action: ActionFor<'app.update'>, requestId: string, s: ExecutionServices, expectedRevision: number): Promise<OperationResult> {
    const { data } = s.transactions.transaction(tx => {
      fence(tx, requestId, action, s);
      const loaded = loadSession(tx, action.arguments.session.id);
      requireCard(isDeepStrictEqual(loaded.data.card, action.arguments.card) &&
        isDeepStrictEqual(loaded.data.session, action.arguments.session), 'SCOPE_MISMATCH', 'Requested card/session differs from the original binding.');
      assertSession(tx, loaded.data, s);
      requireCard(loaded.data.cardRevision === expectedRevision, 'IDEMPOTENCY_CONFLICT', 'A newer card revision already completed.');
      return loaded;
    });
    const template = templateFor(this.options, data.templateId);
    requireCard(template.kind === data.kind, 'UNAVAILABLE', 'Registered card kind changed.', 'card_template_changed');
    let url = data.url;
    if (data.kind === 'universal') {
      requireCard(template.updateUrl, 'UNAVAILABLE', 'Universal layout updates require a configured backend URL mapping; F0 has no update URL.', 'universal_update_url_required');
      url = approvedUrl(template, await template.updateUrl(action.arguments.layout, s.context));
    }
    const message = await restoreOriginal(data, s, this.options, this.retained.get(data.session.id));
    const builder = await cardContent(template, url, data.kind === 'customized' ? action.arguments.layout : undefined, s);
    const content = await preparedEdit(builder, message);
    s.transactions.transaction(tx => {
      const current = loadSession(tx, data.session.id).data;
      assertSession(tx, current, s);
      requireCard(current.cardRevision === expectedRevision, 'IDEMPOTENCY_CONFLICT', 'Card changed while preparing an update.');
      fence(tx, requestId, action, s);
      saveSession(tx, { ...current, phase: 'dispatching' }, requestId, s);
    });
    const refs = [data.message, data.card, data.session];
    try {
      // The pinned API returns void. Keep the original target even if a fixture/provider returns something else.
      await message.space.send(content);
      const metadata = sessionMetadata(message);
      requireCard(metadata && metadata.chatGuid === message.space.id && metadata.sessionId === data.metadata?.sessionId,
        'UNAVAILABLE', 'Card session refresh is unavailable or mismatched.', 'requires_original_session');
      s.transactions.transaction(tx => {
        fence(tx, requestId, action, s);
        const current = loadSession(tx, data.session.id);
        requireCard(current.checkpoint.requestId === requestId && current.data.phase === 'dispatching' &&
          current.data.cardRevision === expectedRevision, 'STALE_FENCE', 'Card dispatch ownership changed.');
        const card = tx.get('cards', data.card.id)!;
        requireCard(card.revision === expectedRevision, 'IDEMPOTENCY_CONFLICT', 'Card revision changed during dispatch.');
        tx.put('cards', { ...card, revision: card.revision + 1 }, card.revision);
        saveSession(tx, { ...data, phase: 'ready', url, cardRevision: expectedRevision + 1, metadata }, requestId, s);
      });
      return { version: 1, requestId, revision: 0, status: 'executor-completed', updatedAt: s.clock.now(), references: refs,
        value: { type: 'void' }, observations: [] };
    } catch {
      // If this write also fails, the durable dispatching marker still prevents an unsafe retry.
      try { s.transactions.transaction(tx => {
        const current = loadSession(tx, data.session.id);
        if (current.checkpoint.requestId === requestId && current.data.phase === 'dispatching')
          saveSession(tx, { ...current.data, phase: 'unknown' }, requestId, s);
      }); } catch { /* Keep the earlier durable dispatching marker. */ }
      return this.unknown(requestId, s, refs);
    }
  }
}

// Public f0-services-2 entry points. Compatibility CardOperations above remains
// for inherited callers; the public module never enters that private-table path.

/** Trusted executable host configuration; no provider objects/configuration arrive
 * in action JSON. Resolvers reuse the host's single transport and credentials. */
export interface CardRuntimeOptions {
  templates: readonly CardTemplate[];
  binding(context: PublicServices['context']): { scope: PublicServices['context']['scope']; phone: string; nativeSpaceId: string };
  space(reference: Extract<ResourceRef, { kind: 'space' }>, services: PublicServices): Promise<Space>;
  requestId(action: CardAction, services: PublicServices): string;
  /** Stable request-admission value, not a read of the latest card revision. */
  updateRevision?(action: ActionFor<'app.update'>, services: PublicServices): number | undefined;
}

/** Module-local live handles only. No journal, second store, provider or listener.
 * Durable dispatch/deduplication belongs exclusively to services.executeChild. */
export class CardRuntime {
  readonly ordering = new CardOrdering();
  private readonly handles = new Map<string, { data: CardSession; original: Message; templateDigest: string }>();
  constructor(readonly options: CardRuntimeOptions) {}
  remember(data: CardSession, original: Message): void {
    encodeCardSession(data);
    if (this.handles.size >= 1000 && !this.handles.has(data.session.id)) this.handles.delete(this.handles.keys().next().value!);
    this.handles.set(data.session.id, { data: structuredClone(data), original, templateDigest: this.templateDigest(data.templateId) });
  }
  private templateDigest(id: string): string {
    const template = runtimeTemplate(this, id);
    return createHash('sha256').update(JSON.stringify({ kind: template.kind, origins: template.origins,
      extension: template.extension, live: template.live, interactions: template.interactions })).digest('hex');
  }
  /** Read a detached inert snapshot. Never exports a live SDK object graph. */
  snapshot(sessionId: string): string | undefined {
    const value = this.handles.get(sessionId);
    return value ? encodeCardSession(value.data) : undefined;
  }
  original(sessionId: string): { data: CardSession; original: Message } {
    const value = this.handles.get(sessionId);
    requireCard(value, 'UNAVAILABLE', 'Original SDK card session is no longer retained.', 'requires_original_session');
    requireCard(value.templateDigest === this.templateDigest(value.data.templateId), 'UNAVAILABLE',
      'Configured card identity changed since send.', 'card_template_changed');
    return restoreCardSession(encodeCardSession(value.data), value.original);
  }
}

function publicActive(s: PublicServices, action: CardAction, signal = s.signal): void {
  requireCard(!signal.aborted && !s.signal.aborted, 'CANCELLED', 'Card operation was cancelled.');
  s.assertActiveClaim();
  requireCard(action.contextId === s.context.contextId && s.context.permissions.includes(action.operation) &&
    s.context.revokedAt === null && s.context.expiresAt > s.clock.now(), 'FORBIDDEN', 'Card context is not authorized.');
}
function publicResult(requestId: string, s: PublicServices, status: OperationResult['status'], references: ResourceRef[] = []): OperationResult {
  return { version: 1, requestId, revision: 0, updatedAt: s.clock.now(), status, references, observations: [] };
}
function publicFailure(error: unknown, requestId: string, s: PublicServices, dispatched: boolean, references: ResourceRef[] = []): OperationResult {
  if (dispatched) return { ...publicResult(requestId, s, 'unknown-outcome', references),
    error: { code: 'UNKNOWN_OUTCOME', message: 'Card effect or durable finalization is uncertain; reconcile before retry.', retry: 'reconcile-first' } };
  const known = error instanceof CardError;
  const allowed = ['CANCELLED', 'STALE_FENCE', 'STALE_GENERATION', 'CONTEXT_EXPIRED', 'CONTEXT_REVOKED', 'FORBIDDEN', 'SCOPE_MISMATCH', 'RESOURCE_NOT_FOUND'] as const;
  const plainCode = error instanceof Error ? allowed.find(code => code === error.message) : undefined;
  const code = known ? error.code : error instanceof ZodError ? 'INVALID_REQUEST' : plainCode ?? 'INTERNAL';
  return { ...publicResult(requestId, s, code === 'CANCELLED' ? 'cancelled' : code === 'UNAVAILABLE' || code === 'UNSUPPORTED' ? 'blocked' : 'failed'),
    error: { code, message: known ? error.message : 'Card preparation failed before provider dispatch.',
      retry: known && error.blockerId === 'card_update_outcome_unknown' ? 'reconcile-first' : 'never',
      ...(known && error.blockerId ? { blockerId: error.blockerId } : {}) } };
}
function runtimeTemplate(runtime: CardRuntime, templateId: string): CardTemplate {
  // Reuse existing configuration validation without entering the legacy executor.
  return templateFor({ templates: runtime.options.templates } as CardOptions, templateId);
}
function publicSpace(space: Space, runtime: CardRuntime, s: PublicServices): void {
  const binding = runtime.options.binding(s.context);
  requireCard(isDeepStrictEqual(binding.scope, s.context.scope), 'SCOPE_MISMATCH', 'Trusted card scope differs.');
  requireCard(space.__platform === 'imessage', 'UNSUPPORTED', 'Native app cards require cloud iMessage.');
  // Public provider narrowing only; no client internals or transport replacement.
  requireCard(space.id === binding.nativeSpaceId && nativeIMessage(space).phone === binding.phone,
    'SCOPE_MISMATCH', 'Native conversation or serving line differs.');
}

/** Execute one owned action through the shared child boundary. Replays enter
 * executeChild before reading mutable card state, so completed results stay replayable. */
export async function executeCardOperation(input: Action, s: PublicServices, runtime: CardRuntime): Promise<OperationResult> {
  let requestId = input.idempotencyKey;
  let enteredChild = false;
  try {
    const action = parseAction(input);
    requireCard(action.operation === 'app.send' || action.operation === 'app.sendCustomized' || action.operation === 'app.update',
      'INVALID_REQUEST', 'Not a card operation.');
    requestId = runtime.options.requestId(action, s);
    publicActive(s, action);
    const expected = action.operation === 'app.update' ? runtime.options.updateRevision?.(action, s) : undefined;
    if (action.operation === 'app.update') requireCard(expected !== undefined && Number.isSafeInteger(expected) && expected >= 0,
      'UNAVAILABLE', 'Admission-time expected card revision is required.', 'card_update_revision_required');
    const digest = createHash('sha256').update(JSON.stringify({ action, expected, taskId: s.context.taskId,
      principalId: s.context.principalId, generation: s.context.generation, scope: s.context.scope })).digest('hex');
    const queueKey = action.operation === 'app.update' ? action.arguments.card.id : requestId;
    return await runtime.ordering.run(queueKey, async () => {
      publicActive(s, action);
      enteredChild = true;
      return s.executeChild({ index: 0, key: requestId, argumentsDigest: digest,
        dispatch: signal => dispatchPublicCard(action, s, runtime, requestId, expected, signal) });
    });
  } catch (error) { return publicFailure(error, requestId, s, enteredChild); }
}

async function dispatchPublicCard(action: CardAction, s: PublicServices, runtime: CardRuntime,
  requestId: string, expected: number | undefined, signal: AbortSignal): Promise<OperationResult> {
  let dispatched = false;
  let refs: ResourceRef[] = [];
  try {
    publicActive(s, action, signal);
    if (action.operation === 'app.update') {
      await s.resolveResource(action.arguments.card);
      publicActive(s, action, signal);
      await s.resolveResource(action.arguments.session);
      publicActive(s, action, signal);
      // Check durable ambiguity even if this module no longer holds the SDK object.
      s.transaction(unit => {
        const card = unit.get('cards', action.arguments.card.id);
        requireCard(card && card.revision % 2 === 0, 'UNAVAILABLE', 'Earlier update requires reconciliation.', 'card_update_outcome_unknown');
      });
      const { data, original } = runtime.original(action.arguments.session.id);
      requireCard(isDeepStrictEqual(data.card, action.arguments.card) && isDeepStrictEqual(data.session, action.arguments.session),
        'SCOPE_MISMATCH', 'Requested card/session differs from the original.');
      publicSpace(original.space, runtime, s);
      s.transaction(unit => assertCurrentCardRevision(unit, data, expected!, s));
      const template = runtimeTemplate(runtime, data.templateId);
      requireCard(template.kind === data.kind, 'UNAVAILABLE', 'Card template kind changed.', 'card_template_changed');
      let url = data.url;
      if (template.kind === 'universal') {
        requireCard(template.updateUrl, 'UNAVAILABLE', 'Universal layout updates require the actual backend URL mapping.', 'universal_update_url_required');
        url = approvedUrl(template, await template.updateUrl(action.arguments.layout, s.context));
        publicActive(s, action, signal);
      }
      const content = await mapCardOperation(template, url, template.kind === 'customized' ? action.arguments.layout : undefined, s, original);
      publicActive(s, action, signal);
      publicSpace(original.space, runtime, s);
      refs = [data.message, data.card, data.session];
      s.transaction(unit => {
        publicActive(s, action, signal);
        const card = assertCurrentCardRevision(unit, data, expected!, s);
        unit.put('cards', { ...card, revision: card.revision + 1 }, card.revision);
      });
      publicActive(s, action, signal);
      dispatched = true;
      await original.space.send(content);
      // SDK edit returns void and mutates public metadata on the original object.
      // Never treat an incidental returned message as a replacement target.
      const metadata = sessionMetadata(original);
      requireCard(metadata && metadata.chatGuid === original.space.id && metadata.sessionId === data.metadata?.sessionId,
        'UNAVAILABLE', 'Provider-managed session refresh differs.', 'requires_original_session');
      s.transaction(unit => {
        publicActive(s, action, signal);
        const card = unit.get('cards', data.card.id);
        requireCard(card && card.revision === expected! + 1 && isDeepStrictEqual(card.reference, data.card),
          'STALE_FENCE', 'Card update reservation changed.');
        unit.put('cards', { ...card, revision: expected! + 2 }, card.revision);
      });
      runtime.remember({ ...data, url, metadata, cardRevision: expected! + 2 }, original);
      return { ...publicResult(requestId, s, 'executor-completed', refs), value: { type: 'void' } };
    }
    const args = action.arguments, template = runtimeTemplate(runtime, args.templateId);
    requireCard(template.kind === (action.operation === 'app.send' ? 'universal' : 'customized'),
      'INVALID_REQUEST', 'Card operation and template kind differ.');
    const authorized = await s.resolveResource(args.space);
    publicActive(s, action, signal);
    requireCard(isDeepStrictEqual(authorized, args.space), 'SCOPE_MISMATCH', 'Resolved space differs.');
    const space = await runtime.options.space(args.space, s);
    publicActive(s, action, signal);
    publicSpace(space, runtime, s);
    const assertSpaceMapping = () => s.transaction(unit => {
      publicActive(s, action, signal);
      publicSpace(space, runtime, s);
      const row = unit.get('references', args.space.id);
      requireCard(row && row.providerId === space.id && isDeepStrictEqual(row.reference, args.space) &&
        isDeepStrictEqual(row.scope, s.context.scope) && row.taskId === s.context.taskId &&
        row.ownedByPrincipalId === s.context.principalId && row.generation === s.context.generation,
        'SCOPE_MISMATCH', 'Authoritative space mapping differs.');
    });
    assertSpaceMapping();
    const content = await mapCardOperation(template, args.url, 'layout' in args ? args.layout : undefined, s);
    publicActive(s, action, signal);
    assertSpaceMapping();
    dispatched = true;
    const message = await space.send(content);
    requireCard(message && message.platform === 'imessage' && message.direction === 'outbound',
      'UNAVAILABLE', 'Card send returned no outbound cloud message.');
    publicSpace(message.space, runtime, s);
    const metadata = sessionMetadata(message);
    requireCard(!metadata || metadata.chatGuid === space.id, 'SCOPE_MISMATCH', 'Provider card session chat differs.');
    const scope = s.context.scope;
    const identity = createHash('sha256').update(JSON.stringify([scope, s.context.principalId, s.context.taskId, s.context.generation, requestId])).digest('hex');
    const messageRef: CardSession['message'] = { version: 1, kind: 'message', id: `wt06.message.${identity}`, scope };
    const card: CardSession['card'] = { version: 1, kind: 'card', id: `wt06.card.${identity}`, messageId: messageRef.id, scope };
    const session: CardSession['session'] = { version: 1, kind: 'card-session', id: `wt06.session.${identity}`, cardId: card.id, scope };
    const config = template.interactions;
    const data: CardSession = { version: 1, sdkVersion: '12.8.0', card, session, message: messageRef,
      providerMessageId: message.id, templateId: template.id, kind: template.kind,
      taskId: s.context.taskId, principalId: s.context.principalId, generation: s.context.generation,
      cardRevision: 0, url: args.url, phase: 'ready', metadata,
      callback: config ? { backendContractId: config.backendContractId, nonce: session.id,
        participantIds: [...config.participantIds], actionIds: [...config.actionIds], expiresAt: s.clock.now() + config.ttlMs } : null };
    encodeCardSession(data);
    refs = [messageRef, card, session];
    s.transaction(unit => {
      publicActive(s, action, signal);
      for (const reference of refs) unit.put('references', { id: reference.id, scope, revision: 0, reference,
        providerId: message.id, ownedByPrincipalId: data.principalId, taskId: data.taskId, generation: data.generation }, null);
      unit.put('cards', { id: card.id, scope, revision: 0, reference: card, templateId: template.id }, null);
      unit.put('sessions', { id: session.id, scope, revision: 0, reference: session,
        allowedActionIds: data.callback?.actionIds ?? [], expiresAt: data.callback?.expiresAt ?? Number.MAX_SAFE_INTEGER, generation: data.generation }, null);
    });
    runtime.remember(data, message);
    return { ...publicResult(requestId, s, 'provider-accepted', refs), observations: [{ kind: 'accepted', source: 'sdk-return', at: s.clock.now() }] };
  } catch (error) { return publicFailure(error, requestId, s, dispatched, refs); }
}
