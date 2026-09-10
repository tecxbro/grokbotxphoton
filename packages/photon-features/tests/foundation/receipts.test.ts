import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendReceipt, reconcileReceipt, summarizeReceipts, parseReceiptObservation, type ReceiptObservation } from '../../src/contracts/receipts.js';
import { scope } from '../fixtures/runtime-services.js';
const target={version:1 as const,kind:'message' as const,id:'message-1',scope};
const read:ReceiptObservation={evidenceId:'e1',scope,target:null,providerTargetId:'native-1',partId:null,kind:'read',readerId:null,providerAt:800,observedAt:1000,source:'provider-event',sourceRevision:null};
test('early read survives duplicates and resolves only within matching scope',()=>{
 const list=appendReceipt([],read);assert.equal(appendReceipt(list,{...read,observedAt:2000}).length,1);
 assert.throws(()=>appendReceipt(list,{...read,readerId:'invented'}),/EVIDENCE_ID_CONFLICT/);
 assert.throws(()=>reconcileReceipt(read,{providerId:'wrong',reference:target}),/TARGET_MISMATCH/);
 assert.throws(()=>reconcileReceipt(read,{providerId:'native-1',reference:{...target,scope:{...scope,lineId:'other'}}}),/TARGET_MISMATCH/);
 const resolved=reconcileReceipt(read,{providerId:'native-1',reference:target});assert.equal(resolved.providerAt,800);assert.equal(resolved.observedAt,1000);
 assert.deepEqual(appendReceipt([resolved],{...read,observedAt:2000}),[resolved]);
 const state=summarizeReceipts([resolved],target);assert.equal(state.reading,'observed');assert.equal(state.delivery,'unknown');assert.deepEqual(state.readers,[]);assert.deepEqual(state.accepted,[]);
});
test('late and stale observations retain stronger evidence without inventing readers/times',()=>{
 const first={...read,target,readerId:'real-reader'};
 const delivered={...read,target,evidenceId:'e2',kind:'delivered' as const,providerAt:null,observedAt:2000};
 const accepted={...read,target,evidenceId:'e3',kind:'accepted' as const,source:'snapshot' as const,providerAt:500};
 const state=summarizeReceipts([first,delivered,accepted],target);assert.equal(state.reading,'observed');assert.equal(state.delivery,'observed');assert.equal(state.delivered[0]!.providerAt,null);assert.deepEqual(state.readers,['real-reader']);
 assert.equal(summarizeReceipts([{...first,partId:'part-2'}],target,'part-1').reading,'unknown');
 assert.throws(()=>parseReceiptObservation({...read,kind:'markRead'}));
 assert.throws(()=>parseReceiptObservation({...read,target:{...target,scope:{...scope,lineId:'other'}}}),/SCOPE_MISMATCH/);
});
test('additive SQLite migration and early receipt persist across close/reopen',()=>{
 const root=resolve(import.meta.dirname,'../../../../..');mkdirSync(resolve(root,'.photon-local/tests'),{recursive:true});const dir=mkdtempSync(resolve(root,'.photon-local/tests/receipts-'));const path=resolve(dir,'state.sqlite');
 const sql=readFileSync(resolve(root,'packages/photon-features/src/state/migrations/0001-initial.sql'),'utf8');
 let db=new DatabaseSync(path);db.exec('BEGIN IMMEDIATE');db.exec(sql);db.exec('COMMIT');
 db.prepare('INSERT INTO inbox(id,scope,revision,body) VALUES(?,?,?,?)').run('existing','scope',0,'{}');
 db.prepare('INSERT INTO receipt_observations(scope,evidence_id,target_id,provider_target_id,kind,observed_at,source,body) VALUES(?,?,?,?,?,?,?,?)').run(JSON.stringify(scope),read.evidenceId,null,read.providerTargetId,read.kind,read.observedAt,read.source,JSON.stringify(read));db.close();
 db=new DatabaseSync(path);db.exec(sql);assert.ok(db.prepare('SELECT id FROM inbox WHERE id=?').get('existing'));
 const row=db.prepare('SELECT body FROM receipt_observations WHERE evidence_id=?').get('e1')!;assert.deepEqual(JSON.parse(String(row.body)),read);assert.equal(summarizeReceipts([reconcileReceipt(JSON.parse(String(row.body)),{providerId:'native-1',reference:target})],target).reading,'observed');db.close();
});
