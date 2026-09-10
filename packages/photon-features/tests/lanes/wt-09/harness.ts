import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';
import { parseAction, LocalProtocol, listenLocal, type Action, type Operation, type TrustedContext } from '../../../src/index.js';
import { DurableSQLiteStore } from '../../../src/adapters/state/sqlite.js';
import { DurableContexts, type AuthorizationPolicy } from '../../../src/runtime/core/authorization.js';
import { DurableSubmission } from '../../../src/runtime/core/submission.js';
import { FixedClock, context, principal, scope } from '../../fixtures/harness.js';

export { context, principal, scope };
export function action(operation: Operation = 'text.send'): Action {
  return parseAction(JSON.parse(readFileSync(new URL(`../../../../tests/fixtures/${operation}.json`, import.meta.url), 'utf8')).valid);
}
export function runtime(policy?: AuthorizationPolicy) {
  const dir = mkdtempSync(join(tmpdir(), 'wt09-'));
  chmodSync(dir, 0o700);
  const path = join(dir, 'state.sqlite');
  const store = new DurableSQLiteStore(path);
  const clock = new FixedClock();
  const contexts = new DurableContexts(store, clock, policy);
  const submission = new DurableSubmission(store, contexts);
  function seed(c: TrustedContext = structuredClone(context)) {
    store.transaction(tx => {
      tx.put('contexts', { id: c.contextId, scope: c.scope, revision: 0, context: c }, null);
      if (!tx.get('tasks', c.taskId)) tx.put('tasks', { id: c.taskId, scope: c.scope, revision: 0,
        principalId: c.principalId, generation: c.generation, cancelledAt: null }, null);
      if (!tx.get('references', c.scope.spaceId)) tx.put('references', { id: c.scope.spaceId, scope: c.scope, revision: 0,
        reference: { version: 1, kind: 'space', id: c.scope.spaceId, scope: c.scope }, providerId: 'offline-chat',
        ownedByPrincipalId: c.principalId, taskId: c.taskId, generation: c.generation }, null);
    });
  }
  seed();
  const protocol = new LocalProtocol({ contexts, submission, store, clock, capabilities: () => [],
    diagnostics: () => ({ ready: false, activation: 'disabled' }) });
  return { dir, path, store, clock, contexts, submission, protocol, seed,
    updateContext(edit: (c: TrustedContext) => void) {
      store.transaction(tx => { const row = tx.get('contexts', context.contextId)!;
        edit(row.context); const revision = row.revision++; tx.put('contexts', row, revision); });
    },
    async socket() {
      const token = randomBytes(32).toString('hex');
      const socketPath = join(dir, 'host.sock');
      const listener = await listenLocal(socketPath, [{ token, principal }], protocol);
      return { token, socketPath, close: () => listener.close(),
        request: (request: unknown, credential = token) => wire(socketPath, { token: credential, request }) };
    },
    close() { store.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}
export function wire(path: string, frame: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path); let body = '';
    socket.setTimeout(2000, () => socket.destroy(new Error('WT09_IPC_TIMEOUT')));
    socket.once('connect', () => socket.write(JSON.stringify(frame) + '\n'));
    socket.on('data', data => { body += data.toString(); });
    socket.once('error', reject);
    socket.once('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
  });
}
