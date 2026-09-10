import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { resolveContents, type Message, type Space, type ContentInput } from 'spectrum-ts';
import { DurableSQLiteStore } from '../../src/adapters/state/sqlite.js';
import { createFeatureModule } from '../../src/features/text-messages/module.js';
import { DurableLocalProtocol, listenDurableLocal } from '../../src/runtime/core/local-server.js';
import { DurableWork } from '../../src/runtime/core/work-handoff.js';
import { executeOperation } from '../../src/runtime/core/executor.js';
import { ExecutionClaims } from '../../src/runtime/core/claims.js';
import { run } from '../../src/cli/main.js';
import { runtime, action, context, principal, scope } from '../lanes/wt-09/harness.js';
import { unusedDependencies, offlineCapability } from '../lanes/wt-09/execution-harness.js';

test('CLI -> real local IPC -> authorization -> durable executor -> production feature -> provider adapter', async t => {
  const r = runtime();
  t.after(() => r.close());
  let sends = 0;
  const offlineSpace = {
    id: 'offline-chat',
    __platform: 'imessage',
    phone: 'offline-line',
    send: async (input: ContentInput) => {
      sends++;
      const content = (await resolveContents([input]))[0]!;
      return {
        id: 'accepted-message',
        platform: 'imessage',
        space: offlineSpace,
        content,
        direction: 'outbound',
        timestamp: new Date(10000),
        sender: undefined,
      } as Message;
    },
  } as unknown as Space;
  const resources = { ...unusedDependencies.resources, space: async () => offlineSpace };
  const provider = {
    provider: 'imessage' as const,
    scope,
    ready: () => true,
    start: async () => {},
    stop: async () => {},
  };
  const feature = createFeatureModule({
    provider,
    binding: () => ({ scope, phone: 'offline-line', nativeSpaceId: 'offline-chat' }),
    resources,
  });
  const claims = new ExecutionClaims(r.store, r.contexts);
  const protocol = new DurableLocalProtocol({
    contexts: r.contexts,
    submission: r.submission,
    work: new DurableWork(r.store, r.contexts),
    capabilities: () => [offlineCapability],
    diagnostics: () => ({ ready: true, activation: 'enabled' }),
  });
  const socket = join(r.dir, 'runtime.sock');
  const credentialFile = join(r.dir, 'credential');
  const token = 'a'.repeat(64);
  writeFileSync(credentialFile, token, { mode: 0o600 });
  const server = await listenDurableLocal(socket, [{ token, principal }], protocol);
  t.after(() => server.close());

  let stdout = '';
  let stderr = '';
  const code = await run(
    ['execute', '--json-stdin'],
    {
      GROK_PHOTON_CONTEXT_ID: context.contextId,
      GROK_PHOTON_SOCKET: socket,
      GROK_PHOTON_CREDENTIAL_FILE: credentialFile,
    },
    Readable.from([JSON.stringify(action())]),
    { write: (value: string) => { stdout += value; return true; } },
    { write: (value: string) => { stderr += value; return true; } },
  );
  assert.equal(code, 0, stdout + stderr);
  assert.ok(!stdout.includes(token));
  const reply = JSON.parse(stdout);
  assert.equal(reply.result.status, 'queued', 'queue acceptance is not provider acceptance');
  assert.equal(r.store.scan('outbox').length, 1, 'one durable outbox owns the request');

  const execute = () => executeOperation({
    claims,
    requestId: reply.result.requestId,
    handler: feature.handlers['text.send']!,
    capability: () => offlineCapability,
    resources,
    media: unusedDependencies.media,
    streams: unusedDependencies.streams,
    leaseMs: 1000,
    deadlineMs: 1000,
  });
  const result = await execute();
  assert.equal(result?.status, 'provider-accepted', JSON.stringify(result));
  assert.equal(sends, 1);
  assert.equal(result.references.length, 1);
  assert.deepEqual(result.observations, [{ kind: 'accepted', source: 'sdk-return', at: 10000 }]);
  assert.equal(await execute(), null);
  assert.equal(sends, 1, 'completed request must not be sent through a duplicate path');
  assert.deepEqual(
    readdirSync(r.dir).filter(name => name.endsWith('.sqlite')),
    ['state.sqlite'],
    'the feature path must not create a private feature store',
  );
});

test('concurrent IPC duplicates produce one durable request and survive a second DB connection', async t => {
  const r = runtime(); t.after(() => r.close()); const socket = await r.socket(); t.after(() => socket.close());
  const replies = await Promise.all(Array.from({length: 24}, () => socket.request({version: 1, method: 'submit', action: action()})));
  assert.ok(replies.every(reply => reply.ok));
  assert.equal(new Set(replies.map(reply => reply.result.requestId)).size, 1);
  assert.equal(r.store.scan('outbox').length, 1);
  const reopened = new DurableSQLiteStore(r.path);
  try { assert.deepEqual(reopened.scan('outbox')[0]!.result, replies[0]!.result); } finally { reopened.close(); }
});

test('same key with changed content conflicts and preserves original content', async t => {
  const r = runtime(); t.after(() => r.close()); const a = action('text.send');
  await r.submission.submit(a, context);
  if (a.operation !== 'text.send') throw new Error('fixture'); a.arguments.text = 'different';
  await assert.rejects(r.submission.submit(a, context), /IDEMPOTENCY_CONFLICT/);
  assert.equal(r.store.scan('outbox').length, 1);
  assert.deepEqual(r.store.scan('outbox')[0]!.action, action());
});

test('pre-dispatch cancellation is durable and a duplicate cannot resurrect it', async t => {
  const r = runtime(); t.after(() => r.close()); const result = await r.submission.submit(action(), context);
  assert.equal((await r.submission.cancel(result.requestId, context)).status, 'cancelled');
  assert.equal((await r.submission.submit(action(), context)).status, 'cancelled');
  assert.equal(r.store.scan('attempts').length, 0);
});
