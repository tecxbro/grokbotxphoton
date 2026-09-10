import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingLeases, type TimerPort } from '../../src/runtime/typing/leases.js';
import { FixedClock, scope } from '../fixtures/harness.js';
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture() {
  const clock=new FixedClock();const timers=new Map<number,{at:number;fn:()=>void}>();let id=0;
  const timer:TimerPort={set:(fn,ms)=>{timers.set(++id,{at:clock.now()+ms,fn});return id;},clear:key=>{timers.delete(key as number);}};
  const calls:string[]=[];
  const manager=new TypingLeases(clock,async()=>({startTyping:async()=>{calls.push('start');},stopTyping:async()=>{calls.push('stop');}}),timer);
  return {clock,timer,calls,manager,async advance(ms:number){clock.advance(ms);for(const [key,v] of [...timers])if(v.at<=clock.now()){timers.delete(key);v.fn();}await flush();}};
}
test('completion, failure, cancellation and timeout stop typing',async()=>{
  const f=fixture();
  await f.manager.responding(scope,1,async()=>{await flush();});await flush();assert.deepEqual(f.calls,['start','stop']);
  await assert.rejects(f.manager.responding(scope,1,async()=>{await flush();throw new Error('work failed');}));await flush();
  const c=new AbortController();f.manager.begin(scope,1,1000,{signal:c.signal});await flush();c.abort();await flush();
  f.manager.begin(scope,1,100);await flush();await f.advance(100);
  assert.deepEqual(f.calls,['start','stop','start','stop','start','stop','start','stop']);f.manager.shutdown();
});
test('overlap ignores old stop, long-work wait ends lease and delayed expired start never replays',async()=>{
  const f=fixture();const old=f.manager.begin(scope,1,1000)!;await flush();
  const current=f.manager.begin(scope,1,1000)!;f.manager.end(old);await flush();assert.deepEqual(f.calls,['start']);
  f.manager.waiting(current);await flush();assert.deepEqual(f.calls,['start','stop']);
  f.manager.begin(scope,2,100,{delayMs:200});await f.advance(200);assert.deepEqual(f.calls,['start','stop']);f.manager.shutdown();
});
test('connection loss and fresh manager never resume old starts',async()=>{
  const f=fixture();f.manager.begin(scope,1,1000);await flush();f.manager.connectionLost();await flush();
  f.manager.connectionRestored();await flush();assert.deepEqual(f.calls,['start','stop']);f.manager.shutdown();
  const restarted=fixture();await restarted.advance(5000);assert.deepEqual(restarted.calls,[]);restarted.manager.shutdown();
});
test('delayed start completion after cancellation is followed by stop',async()=>{
  const f=fixture();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const calls:string[]=[];
  const manager=new TypingLeases(f.clock,async()=>({startTyping:async()=>{calls.push('start');await gate;},stopTyping:async()=>{calls.push('stop');}}),f.timer);
  const ticket=manager.begin(scope,1,1000)!;await flush();manager.end(ticket);release();await flush();assert.deepEqual(calls,['start','stop']);manager.shutdown();
});
test('failed start attempts cleanup and failed stop is reported without pretending idle',async()=>{
  const f=fixture();const calls:string[]=[],errors:string[]=[];let failStart=true,failStop=false;
  const manager=new TypingLeases(f.clock,async()=>({startTyping:async()=>{calls.push('start');if(failStart)throw new Error('start failed');},
    stopTyping:async()=>{calls.push('stop');if(failStop)throw new Error('stop failed');}}),f.timer,code=>errors.push(code));
  manager.begin(scope,1,1000);await flush();assert.deepEqual(calls,['start','stop']);assert.ok(errors.includes('TYPING_PROVIDER_FAILURE'));
  failStart=false;const ticket=manager.begin(scope,2,1000)!;await flush();failStop=true;manager.end(ticket);await flush();
  assert.equal(manager.evidence().blocked,1);assert.ok(errors.includes('TYPING_STOP_UNKNOWN'));
  failStop=false;manager.connectionRestored();await flush();assert.equal(manager.evidence().blocked,0);manager.shutdown();
});
test('unresolved typing start never blocks real work; stopping it drains after completion',async()=>{
  const f=fixture();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const calls:string[]=[];
  const manager=new TypingLeases(f.clock,async()=>({startTyping:async()=>{calls.push('start');await gate;},stopTyping:async()=>{calls.push('stop');}}),f.timer);
  let worked=false;await manager.responding(scope,1,async()=>{worked=true;await flush();});
  assert.equal(worked,true);assert.deepEqual(calls,['start']);release();await flush();assert.deepEqual(calls,['start','stop']);manager.shutdown();
});
test('delayed old stop finishes before a newer generation start',async()=>{
  const f=fixture();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const calls:string[]=[];let delay=true;
  const manager=new TypingLeases(f.clock,async()=>({startTyping:async()=>{calls.push('start');},stopTyping:async()=>{calls.push('stop');if(delay)await gate;}}),f.timer);
  const old=manager.begin(scope,1,1000)!;await flush();manager.end(old);await flush();
  manager.begin(scope,2,1000);await flush();assert.deepEqual(calls,['start','stop']);
  delay=false;release();await flush();assert.deepEqual(calls,['start','stop','start']);manager.shutdown();await flush();
});
