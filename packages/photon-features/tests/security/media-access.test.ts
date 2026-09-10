import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir, writeFile, symlink, link, rename } from 'node:fs/promises';
import { openApprovedFile } from '../../src/features/media/file-access.js';
import { approvedUrl, isPublicAddress, createGuardedFetcher, type HopResponse } from '../../src/features/media/guarded-fetch.js';
import { consume } from '../../src/features/media/safety.js';
import { runtime } from '../lanes/wt-09/harness.js';
import { action, context, scope } from '../lanes/wt-09/harness.js';
import { scopeHasConsumers } from '../../src/features/media/retention.js';

test('guarded file access rejects traversal, leaf/ancestor symlinks and hard links', async t => {
  const r = runtime(); t.after(() => r.close()); const root = join(r.dir, 'media'); await mkdir(root);
  const file = join(root, 'safe.txt'); await writeFile(file, 'safe');
  const handle = await openApprovedFile(file, [root]); assert.equal(await handle.readFile('utf8'), 'safe'); await handle.close();
  await symlink(file, join(root, 'alias')); await symlink(root, join(r.dir, 'alias-root'));
  for (const path of [join(root, 'alias'), `${root}/../media/safe.txt`, join(r.dir, 'alias-root/safe.txt'), r.path])
    await assert.rejects(openApprovedFile(path, [root]));
  await link(file, join(root, 'hardlink')); await assert.rejects(openApprovedFile(file, [root]));
});

test('opened handle keeps approved inode when pathname is replaced', async t => {
  const r = runtime(); t.after(() => r.close()); const file = join(r.dir, 'file'); await writeFile(file, 'approved');
  const handle = await openApprovedFile(file, [r.dir]);
  try { await rename(file, join(r.dir, 'old')); await writeFile(file, 'replacement'); assert.equal(await handle.readFile('utf8'), 'approved'); }
  finally { await handle.close(); }
});

for (const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','198.18.0.1','0.0.0.0','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1'])
  test(`egress rejects controlled address fixture ${ip}`, () => assert.equal(isPublicAddress(ip), false));

test('URL authorization rejects misleading hosts, credentials, ports and schemes', () => {
  for (const url of ['http://media.example/a','https://media.example.evil/a','https://u:p@media.example/a','https://media.example:444/a','https://127.0.0.1/a','https://media.example./a','file:///tmp/a'])
    assert.throws(() => approvedUrl(url, {approvedHosts: ['media.example']}));
});

test('redirect DNS rebinding and mixed public/private answers fail before private connection', async () => {
  let calls = 0, lookups = 0, closed = 0;
  const response = (): HopResponse => ({status: 302, location: '/next', mimeType: 'text/plain',
    stream: new ReadableStream(), close: () => {closed++;}});
  const fetcher = createGuardedFetcher({approvedHosts: ['media.example']}, {
    lookup: async () => ++lookups === 1 ? [{address:'8.8.8.8',family:4}] : [{address:'127.0.0.1',family:4}],
    request: async (_url, address) => {calls++; assert.equal(address.address, '8.8.8.8'); return response();},
  });
  await assert.rejects(fetcher('https://media.example/a', new AbortController().signal));
  assert.equal(calls, 1); assert.equal(closed, 1);
  const mixed = createGuardedFetcher({approvedHosts:['media.example']}, {
    lookup: async () => [{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}],
    request: async () => { assert.fail('must not connect to mixed DNS answers'); },
  });
  await assert.rejects(mixed('https://media.example/a', new AbortController().signal));
});

test('byte count overrides misleading size and controlled timeout/interruption releases reader', async () => {
  let cancelled = 0, written = 0;
  const stream = new ReadableStream({start(c) {c.enqueue(new Uint8Array(5)); c.enqueue(new Uint8Array(6));}, cancel() {cancelled++;}});
  await assert.rejects(consume(stream, 10, new AbortController().signal, async b => {written += b.length;}));
  assert.equal(written, 5); assert.equal(stream.locked, false); assert.equal(cancelled, 1);
  const blocked = new ReadableStream(); const controlledTimeout = new AbortController();
  const consuming = consume(blocked, 10, controlledTimeout.signal, async () => {});
  controlledTimeout.abort(new Error('CONTROLLED_TIMEOUT'));
  await assert.rejects(consuming); assert.equal(blocked.locked, false);
});

test('retention keeps bytes referenced by pending and unknown work',async t=>{
  const r=runtime();t.after(()=>r.close());assert.equal(r.store.transaction(tx=>scopeHasConsumers(tx,scope)),false);
  const result=await r.submission.submit(action(),context);assert.equal(r.store.transaction(tx=>scopeHasConsumers(tx,scope)),true);
  r.store.transaction(tx=>{const row=tx.get('outbox',result.requestId)!;const revision=row.revision++;row.result.status='unknown-outcome';tx.put('outbox',row,revision);});
  assert.equal(r.store.transaction(tx=>scopeHasConsumers(tx,scope)),true);
});
