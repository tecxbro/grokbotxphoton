import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../../../../..');
const script=(name:string)=>import(new URL(`../../../../../scripts/${name}.mjs`,import.meta.url).href);
test('ownership rejects duplicates, wildcard grants and foreign staged/unstaged/untracked names',async()=>{
 const {checkOwnership}=await script('verify-ownership');
 const map={owners:{'wt-00':['a.ts'],'wt-01':['b.ts']},snapshotRoots:{'wt-00':['docs/photon/reference/']}};
 assert.equal(checkOwnership(map,['a.ts'],'wt-00').checked,1);
 assert.throws(()=>checkOwnership({...map,owners:{'wt-00':['a.ts'],'wt-01':['a.ts']}},[],'wt-00'),/DUPLICATE/);
 assert.throws(()=>checkOwnership({...map,owners:{'wt-00':['src/**']}},[],'wt-00'),/NON_EXACT/);
 for(const name of ['b.ts','untracked.ts','staged.ts','docs/photon/reference/code.ts'])assert.throws(()=>checkOwnership(map,[name],'wt-00'),/UNOWNED/);
 assert.equal(checkOwnership(map,['docs/photon/reference/page.md'],'wt-00').checked,1);
});
