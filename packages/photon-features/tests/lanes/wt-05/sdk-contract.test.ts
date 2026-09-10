import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { PollOption, PollChoice, ContentInput, Space } from "spectrum-ts";
import { poll, option } from "spectrum-ts";
import type { AdvancedIMessage, Poll, PollEvent } from "@photon-ai/advanced-imessage";
import type { ProviderContext } from "../../../src/contracts/transport.js";
import { approvedAdvancedExtensions } from "../../../src/contracts/execution.js";
import { compilePoll } from "../../../src/features/polls/sdk.js";

// Compile-only checks against actual public imports. This function is never run and opens no client.
function publicShapeProbe(im: AdvancedIMessage, space: Space, event: PollEvent, incoming: PollOption) {
  const created:Promise<Poll>=im.polls.create("chat-guid","Question?",["A","B"]);
  const fetched:Promise<Poll>=im.polls.get("poll-guid");
  const voted:Promise<Poll>=im.polls.vote("poll-guid","native-option");
  const unvoted:Promise<Poll>=im.polls.unvote("poll-guid");
  const added:Promise<Poll>=im.polls.addOption("poll-guid","C");
  // @ts-expect-error Native unvote's optional second argument is idempotency options, not an option ID.
  im.polls.unvote("poll-guid","native-option");
  // @ts-expect-error There is no participant parameter to impersonate another voter.
  im.polls.vote("poll-guid","native-option",{participant:"alice"});
  const content:ContentInput=poll("Question?",[option("A"),option("A")]);
  const sent=space.send(content);
  const sequence:number=event.sequence;
  const pollGuid:string=event.pollMessageGuid;
  const choice:PollChoice=incoming.option;
  // @ts-expect-error Unified option content contains a display title, not a native option identifier.
  const native:string=choice.optionIdentifier;
  return {created,fetched,voted,unvoted,added,sent,sequence,pollGuid,native};
}
function frozenProviderProbe(provider:ProviderContext) {
  // @ts-expect-error F0 has no approved native poll resource on ProviderContext.
  return provider.polls;
}
void publicShapeProbe; void frozenProviderProbe;

test("pinned Spectrum builder preserves duplicate labels without fabricated native IDs",async()=>{
  const built=await compilePoll("Pick?",[{key:"a",label:"Same"},{key:"b",label:"Same"}]).build();
  assert.deepEqual(built,{type:"poll",title:"Pick?",options:[{title:"Same"},{title:"Same"}]});
  assert.throws(()=>compilePoll(" ",[{key:"a",label:"A"},{key:"b",label:"B"}]),/INVALID_REQUEST/);
});

test("installed public packages match F0 pin and no advanced extension is approved",()=>{
  const require=createRequire(import.meta.url);
  const version=(name:string)=>JSON.parse(readFileSync(resolve(dirname(require.resolve(name)),"../package.json"),"utf8")).version;
  assert.equal(version("spectrum-ts"),"12.8.0");
  assert.deepEqual(approvedAdvancedExtensions,[]);
});
