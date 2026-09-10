import { rmSync } from 'node:fs';
import { resolveContents, type Space, type Message, type Content, type ContentInput, type ReactionBuilder, type Reaction, type AgentSender } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { SQLiteStore, parseAction, type Action, type ExecutionServices, type ResourceRef, type TransactionStore } from '../../../src/index.js';
import { FixedClock, context as baseContext, scope, storeFixture, FailureHooks } from '../../fixtures/harness.js';
import { createCardsModule } from '../../../src/features/cards/module.js';
import type { CardOptions, CardTemplate } from '../../../src/features/cards/configuration.js';
import { loadSession } from '../../../src/features/cards/state.js';
export { scope };
export class FakeSpace implements Space {
  readonly __platform = 'imessage';
  readonly id = 'any;-;+15555550123';
  phone = '+15555550100';
  calls: Content[] = [];
  messages = new Map<string, Message<string, AgentSender>>();
  hook?: (content: Content) => Promise<void>;
  returnUndefined = false;
  refresh = true;
  private counter = 0;
  async add() {} async avatar() {} async edit() {} async leave() {} async read() {}
  async remove() {} async rename() {} async startTyping() {} async stopTyping() {} async unsend() {}
  async getAvatar() { return undefined; } async getDisplayName() { return undefined; } async getMembers() { return []; }
  async getMessage(id: string) { return this.messages.get(id); }
  async responding<T>(fn: () => T | Promise<T>) { return fn(); }
  send(content: ReactionBuilder): Promise<(Message<string, AgentSender> & { content: Reaction }) | undefined>;
  send(content: ContentInput): Promise<Message<string, AgentSender> | undefined>;
  send(...content: [ContentInput, ContentInput, ...ContentInput[]]): Promise<Message<string, AgentSender>[]>;
  async send(...inputs: ContentInput[]): Promise<Message<string, AgentSender> | Message<string, AgentSender>[] | undefined> {
    const [content] = await resolveContents(inputs);
    if (!content) throw new Error('missing fixture content');
    this.calls.push(content);
    await this.hook?.(content);
    if (content.type === 'edit') {
      const native = imessage(content.target), old = native.miniAppCardSession;
      if (old && this.refresh) native.miniAppCardSession = { ...old, messageGuid: `provider-update-${this.calls.length}`, targetMessageGuid: `provider-update-${this.calls.length}` };
      return undefined;
    }
    if (this.returnUndefined) return undefined;
    const id = `provider-message-${++this.counter}`;
    const message: Message<string, AgentSender> & { miniAppCardSession?: { chatGuid: string; messageGuid: string; sessionId: string; targetMessageGuid: string } } = {
      id, platform: 'imessage', direction: 'outbound', space: this, sender: undefined, timestamp: new Date(10000), content,
      miniAppCardSession: { chatGuid: this.id, messageGuid: id, sessionId: 'provider-session-' + id, targetMessageGuid: id },
      edit: async () => {}, react: async () => undefined, read: async () => {}, reply: this.send.bind(this), unsend: async () => {},
    };
    this.messages.set(id, message);
    return message;
  }
}
/** These are isolated fixture identities, never production/deployment defaults. */
export function templates(): CardTemplate[] { return [
  { id: 'universal', kind: 'universal', origins: ['https://fixture.invalid'] },
  { id: 'custom', kind: 'customized', origins: ['https://fixture.invalid'],
    extension: { appName: 'Fixture', teamId: 'TESTTEAM01', extensionBundleId: 'invalid.fixture.messages' },
    interactions: { participantIds: ['participant-1'], actionIds: ['confirm'], ttlMs: 60000, backendContractId: 'fixture-hmac-v1' } },
]; }
export function fixture(configured = templates()) {
  const files = storeFixture(), clock = new FixedClock(), native = new FakeSpace(), abort = new AbortController();
  let store: TransactionStore = files.store;
  const context = { ...baseContext, permissions: ['app.send', 'app.sendCustomized', 'app.update'] as const };
  const spaceRef: Extract<ResourceRef, { kind: 'space' }> = { version: 1, kind: 'space', id: scope.spaceId, scope };
  const s: ExecutionServices = { context: { ...context, permissions: [...context.permissions] }, clock, signal: abort.signal,
    claim: { owner: 'worker-1', fence: 1, generation: 1, leaseUntil: 100000 }, transactions: store,
    resources: { resolve: async ref => ref, space: async () => native, message: async ref => {
      const record = s.transactions.transaction(tx => tx.get('references', ref.id));
      const message = record && await native.getMessage(record.providerId);
      if (!message) throw new Error('missing original SDK object');
      return message;
    } }, media: { resolve: async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }) },
    streams: { open: async () => { throw new Error('not used'); } } };
  const revisions = new Map<string, number>();
  const options: CardOptions = { templates: configured, binding: c => ({ scope: c.scope, phone: '+15555550100', nativeSpaceId: native.id }),
    requestId: a => a.idempotencyKey, updateRevision: a => revisions.get(a.idempotencyKey) };
  let module = createCardsModule(options);
  store.transaction(tx => {
    tx.put('tasks', { id: context.taskId, scope, revision: 0, principalId: context.principalId, generation: 1, cancelledAt: null }, null);
    tx.put('references', { id: spaceRef.id, scope, revision: 0, reference: spaceRef, providerId: native.id,
      ownedByPrincipalId: context.principalId, taskId: context.taskId, generation: 1 }, null);
  });
  function register(action: Action) {
    if (action.operation === 'app.update') revisions.set(action.idempotencyKey,
      s.transactions.transaction(tx => loadSession(tx, action.arguments.session.id).data.cardRevision));
    s.transactions.transaction(tx => tx.put('outbox', { id: action.idempotencyKey, scope, revision: 0, action,
      principalId: context.principalId, taskId: context.taskId, generation: 1, argumentDigest: 'fixture',
      result: { version: 1, requestId: action.idempotencyKey, status: 'queued', revision: 0, updatedAt: clock.now(), references: [], observations: [] },
      claim: s.claim, cancellationRequestedAt: null }, null));
    return action;
  }
  let nextRequest = 0;
  function sendAction(kind: 'universal' | 'custom' = 'custom') {
    return register(parseAction({ version: 1, idempotencyKey: 'request-' + ++nextRequest, contextId: context.contextId,
      operation: kind === 'universal' ? 'app.send' : 'app.sendCustomized', arguments: { space: spaceRef, templateId: kind, url: 'https://fixture.invalid/card',
        ...(kind === 'custom' ? { layout: { caption: 'Before' } } : {}) } }));
  }
  function updateAction(refs: ResourceRef[]) {
    return register(parseAction({ version: 1, idempotencyKey: 'request-' + ++nextRequest, contextId: context.contextId, operation: 'app.update',
      arguments: { card: refs.find(r => r.kind === 'card'), session: refs.find(r => r.kind === 'card-session'), layout: { caption: 'After' } } }));
  }
  return { s, options, native, abort, clock, files, spaceRef,
    get module() { return module; }, register, sendAction, updateAction,
    execute: (a: Action) => module.handlers.find(h => h.operation === a.operation)!.execute(a, s),
    session: (refs: ResourceRef[]) => s.transactions.transaction(tx => loadSession(tx, refs.find(r => r.kind === 'card-session')!.id).data),
    restartModule() { module = createCardsModule(options); },
    reopen() { store.close(); store = new SQLiteStore(files.path); s.transactions = store; module = createCardsModule(options); },
    failTransactionAt(table: string) {
      const failure = new FailureHooks(); failure.failAt(table);
      s.transactions = { close: () => {}, transaction: fn => store.transaction(tx => fn({ ...tx, put: (name, record, rev) => { tx.put(name, record, rev); failure.hit(name); } })) };
    },
    close() { store.close(); rmSync(files.dir, { recursive: true, force: true }); },
  };
}
