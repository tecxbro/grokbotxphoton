import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../../../../..');
const script=(name:string)=>import(new URL(`../../../../../scripts/${name}.mjs`,import.meta.url).href);
test('wrong worktree produces a real nonzero checker exit',()=>{
 const result=spawnSync(process.execPath,[resolve(root,'scripts/verify-worktree.mjs'),'wt-00'],{cwd:root+'/packages/photon-features',encoding:'utf8'});assert.notEqual(result.status,0);
});
test('missing and skipped tests cannot produce PASS',async()=>{
 const {requireTests,validateTestResult}=await script('verify-lane');assert.throws(()=>requireTests(root,['absent.test.js']),/MISSING_REQUIRED/);
 for(const result of [{status:1,stdout:'# tests 1\n# skipped 0'},{status:0,stdout:'# tests 0\n# skipped 0'},{status:0,stdout:'# tests 1\n# skipped 1'},{status:0,stdout:'# tests 1\n# skipped 0\nnot ok 1 - failed'}])assert.throws(()=>validateTestResult(result));
 assert.equal(validateTestResult({status:0,stdout:'# tests 2\n# skipped 0\n# todo 0'}),2);
});
test('source checker rejects HTML, empty documents, forged success and hash mismatch',async()=>{
 const {validateDocument,fetchDocument}=await script('fetch-photon-docs');const {checkSourceLock}=await script('verify-docs');
 const record={classification:'official',url:'https://photon.codes/docs/a.md',finalUrl:'https://photon.codes/docs/a.md',status:200,contentType:'text/plain',retrievedAt:new Date().toISOString()};
 for(const body of ['','<!doctype html><html>Login</html>','# 404 Not found\n'+'x'.repeat(100)])assert.throws(()=>validateDocument(record,body));
 assert.throws(()=>validateDocument({...record,finalUrl:'https://photon.codes/login'},'# Title\n'+'x'.repeat(100)),/IDENTITY/);
 const failure=await fetchDocument(record.url,{fetcher:async()=>{throw new Error('offline');}});assert.equal(failure.record.status,null);assert.equal(failure.record.sha256,null);assert.equal(failure.body,null);
 const failed={...record,sha256:'invented',snapshot:null,identity:null,failure:'offline'};assert.throws(()=>checkSourceLock({version:1,sources:[failed]},()=>''),/FABRICATED/);
 assert.throws(()=>checkSourceLock({version:1,sources:[{...record,sha256:'wrong',snapshot:'docs/photon/reference/a.md',identity:'Title',failure:null}]},()=>'# Title\n'+'x'.repeat(100)),/HASH/);
});
test('documentation checker fails missing files and inconsistent acceptance evidence',async()=>{
 const {verifyDocs,checkEvidence}=await script('verify-docs');mkdirSync(resolve(root,'.photon-local/tests'),{recursive:true});const temp=mkdtempSync(resolve(root,'.photon-local/tests/docs-'));assert.throws(()=>verifyDocs(temp),/ENOENT/);
 const cases=Array.from({length:8},(_,i)=>({id:i+1,status:'passed',evidence:['not-run']}));assert.throws(()=>checkEvidence(cases,[]),/INCONSISTENT/);
});
