import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCaptured } from '../../src/runtime/inbound/normalize.js';
import { InboundRouter } from '../../src/runtime/inbound/router.js';
import { ProviderContext } from '../../src/adapters/transport/provider-context.js';
import { runtime, context } from '../lanes/wt-09/harness.js';
const routes = new ProviderContext('project-1',[{accountId:'account-1',lineId:'line-1',phone:'offline-line'}]);
const raw = {id:'same-message',platform:'imessage',space:{id:'chat',platform:'imessage',phone:'offline-line'},direction:'inbound',sender:{id:'actor-1'}};

test('attachment, vote/unvote, edit and read identities survive repeated message IDs', () => {
  const scope = routes.inbound('offline-line','chat');
  const poll = {version:1 as const,kind:'poll' as const,id:'poll-1',messageId:'message-1',scope};
  const option = {version:1 as const,kind:'poll-option' as const,id:'option-1',pollId:poll.id,scope};
  const contents = [{type:'attachment',id:'attachment-1'}, {type:'poll_option',title:'Same',selected:true},
    {type:'poll_option',title:'Same',selected:false}, {type:'edit',target:{id:'message-1'},content:{type:'text',text:'edited'}},
    {type:'read',target:{id:'message-1'}}];
  const events = contents.map(content => normalizeCaptured({...raw,content},'capture-1',routes,10000,{poll:()=>({poll,option})}));
  assert.deepEqual(events.map(e=>e.type),['message','poll','poll','message','receipt']);
  assert.equal(new Set(events.map(e=>e.eventId)).size,5);
  const attachment = events[0]!; assert.ok(attachment.type === 'message'); assert.equal(attachment.content.type,'attachment');
  const replay = normalizeCaptured({...raw,content:contents[0]},'capture-2',routes,99999);
  assert.equal(replay.eventId,attachment.eventId);
  const unknown = normalizeCaptured({...raw,content:contents[1]},'capture-1',routes,10000);
  assert.equal(unknown.type,'unresolved');
});

test('router retains unknown events, suppresses echoes/receipt loops and deduplicates replay', async t => {
  const r = runtime(); t.after(() => r.close()); let reductions = 0;
  const router = new InboundRouter(r.store,r.clock,{route:()=>({taskId:context.taskId,generation:1,principalId:context.principalId})},
    [{type:'receipt',reduce:()=>{reductions++;}}]);
  const echo = normalizeCaptured({...raw,direction:'outbound',content:{type:'text',text:'echo'}},'capture-1',routes,10000);
  const read = normalizeCaptured({...raw,content:{type:'read',target:{id:'message-1'}}},'capture-2',routes,10000);
  const unknown = normalizeCaptured({...raw,content:{type:'app',url:'https://example.com'}},'capture-3',routes,10000);
  await router.accept(echo); await router.accept(read); await router.accept({...read,receivedAt:10001}); await router.accept(unknown);
  assert.equal(reductions,1); assert.equal(r.store.scan('handoffs').length,0);
  assert.equal(r.store.scan('inbox').length,3); assert.equal(r.store.scan('unresolved').length,1);
});
