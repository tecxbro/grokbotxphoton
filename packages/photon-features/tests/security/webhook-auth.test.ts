import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { verifyRawBody, NativeWebhookIngress } from '../../src/adapters/transport/webhook-ingress.js';
import { SpectrumOwner } from '../../src/adapters/transport/spectrum-owner.js';
import { ProviderContext } from '../../src/adapters/transport/provider-context.js';
import { FileCaptureStore } from '../../src/adapters/transport/capture.js';
import { runtime } from '../lanes/wt-09/harness.js';
const secret = 'offline-fixture-secret';
function headers(raw: string, at = 10) {
  return new Headers({'content-type':'application/json','x-spectrum-timestamp':String(at),
    'x-spectrum-signature':'v0=' + createHmac('sha256',secret).update(`v0:${at}:`).update(raw).digest('hex')});
}
test('HMAC uses exact bytes and rejects missing, invalid, stale and future signatures', () => {
  const raw = '{ "text": "é" }'; assert.equal(verifyRawBody(Buffer.from(raw), headers(raw), secret, 10000), true);
  assert.equal(verifyRawBody(Buffer.from(JSON.stringify(JSON.parse(raw))), headers(raw), secret, 10000), false);
  for (const h of [new Headers(), headers(raw, 1000), headers(raw, 1)]) {
    const now = h.get('x-spectrum-timestamp') === '1' ? 302000 : 10000;
    assert.equal(verifyRawBody(Buffer.from(raw), h, secret, now), false);
  }
  const bad = headers(raw); bad.set('x-spectrum-signature','v0='+'0'.repeat(64));
  assert.equal(verifyRawBody(Buffer.from(raw),bad,secret,10000),false);
});

test('webhook awaits durable acceptance; database failure is 503 and alternate envelope is rejected', async t => {
  const r = runtime(); t.after(() => r.close());
  const routes = new ProviderContext('project-1',[{accountId:'account-1',lineId:'line-1',phone:'offline-line'}]);
  const owner = new SpectrumOwner({inbound:'photon-webhook',outbound:'imessage',wake:'existing-grok-task-handoff'}, routes,
    async () => ({messages: async function* () {}, space: async () => {throw new Error('offline');}, stop: async () => {}}));
  await owner.start(); t.after(() => owner.stop());
  const ingress = new NativeWebhookIngress(owner,new FileCaptureStore(join(r.dir,'capture')),r.clock,secret);
  t.after(() => ingress.stop());
  let release!: () => void; const barrier = new Promise<void>(resolve => {release = resolve;});
  let started!: () => void; const entered = new Promise<void>(resolve => {started = resolve;});
  let fail = false;
  await ingress.start(async event => { started(); await barrier; if (fail) throw new Error('controlled DB failure');
    r.store.transaction(tx => {if (!tx.get('inbox',event.eventId)) tx.put('inbox',{id:event.eventId,scope:event.scope,revision:0,event,state:'pending'},null);}); });
  const space = {id:'offline-chat',platform:'imessage',phone:'offline-line'};
  const raw = JSON.stringify({event:'messages',space,message:{id:'message-1',platform:'imessage',space,direction:'inbound',sender:{id:'fixture-user'},content:{type:'text',text:'hello'}}});
  const request = (body = raw) => new Request('https://fixture.invalid/webhook',{method:'POST',headers:headers(body),body});
  let ack = false; const response = ingress.handle(request()).then(value => {ack = true; return value;});
  await entered; assert.equal(ack,false); assert.equal(r.store.scan('inbox').length,0);
  release(); assert.equal((await response).status,200); assert.equal(r.store.scan('inbox').length,1);
  assert.equal((await ingress.handle(request())).status,200,'duplicate delivery is acknowledged after idempotent durable capture');
  assert.equal(r.store.scan('inbox').length,1,'duplicate delivery does not create a second event');
  fail = true;
  const failedRaw=raw.replaceAll('message-1','message-2');
  assert.equal((await ingress.handle(request(failedRaw))).status,503);
  assert.equal(r.store.scan('inbox').length,1,'failed durable capture must not acknowledge or persist partial state');
  assert.equal((await ingress.handle(request(JSON.stringify({event:'message.received',data:{}})))).status,400);
});
