import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../../../../../',import.meta.url));
const latest=JSON.parse(readFileSync(join(root,'docs/photon-features/evidence/wt-09/latest-run.json')));
const provenance=JSON.parse(readFileSync(join(latest.runDirectory,'snapshot.json')));
const load=path=>import(pathToFileURL(join(latest.snapshot,'packages/photon-features/dist/src',path)).href);
const {operationRegistrations}=await load('registry/index.js');
const unavailable=()=>{throw new Error('COVERAGE_INVENTORY_MUST_NOT_EXECUTE');};
// Enumerate actual lane factory records only. This is not WT-00 host assembly or execution.
const modules=[
  (await load('features/text-messages/module.js')).createTextMessageModule({binding:unavailable,requestId:unavailable}),
  (await load('features/media/module.js')).createMediaModule({bindings:unavailable}),
  (await load('features/polls/module.js')).createPollModule(),
  (await load('features/cards/module.js')).createCardsModule({templates:[],binding:unavailable,requestId:unavailable}),
  (await load('features/native/module.js')).createNativeModule({compilers:[]}),
  (await load('runtime/typing/operations.js')).createTypingModule({},unavailable),
];
const testsByLane={
  'wt-02':['e2e/typing-lifecycle.test.ts','e2e/inbound-events.test.ts','security/webhook-auth.test.ts'],
  'wt-03':['e2e/feature-runtime.test.ts','e2e/multipart-recovery.test.ts','lanes/wt-09/sdk-and-voice.test.ts'],
  'wt-04':['security/media-access.test.ts'],
  'wt-05':['e2e/poll-restart.test.ts','e2e/inbound-events.test.ts'],
  'wt-06':['e2e/card-restart.test.ts'],
  'wt-07':['security/context-scope.test.ts'],
};
const gaps={
  'wt-02':'WT-00 must wire transient typing and durable ingress to one host; SDK restart replay and authoritative vote sequence are unavailable/unverified.',
  'wt-03':'WT09-001: text module cannot execute through the durable executor; multipart tests currently prove executor fixture recovery, not assembled text-feature recovery.',
  'wt-04':'Actual feature-to-executor/media service wiring and per-operation provider execution remain unverified; staged-media security tests do not prove sends or voice codecs.',
  'wt-05':'WT09-002: poll router/reducer transaction fails; native identity lookup, verified selection semantics and real incoming vote require WT-00/provider binding.',
  'wt-06':'Standalone send/update/callback tests use offline provider/backend fixtures. Full executor integration, customized extension configuration and device rendering remain unverified.',
  'wt-07':'Native feature execution is not independently covered by WT-09 yet; F0 has no assembled production host/candidate. Administrative denial tests and fixture/schema checks are narrower evidence.',
};
const rows=operationRegistrations.map(reg=>{
  const module=modules.find(m=>m.handlers.some(h=>h.operation===reg.operation));
  const cap=module?.capabilities.find(c=>c.operation===reg.operation);
  return {operation:reg.operation,owner:reg.owner,registrationImplementation:reg.implementation,
    laneHandlerPresent:!!module,laneDeclaredImplementation:cap?.implementation??'handler present; capability record absent',
    laneDeclaredProviderSupport:cap?.providerSupport??'unknown',independentlyVerifiedProviderAvailability:{account:'unknown',conversation:'unknown'},
    assembledImplementation:'pending WT-00 exact candidate and binding',
    tests:['lanes/wt-09/sdk-and-voice.test.ts',...testsByLane[reg.owner]],
    evidence:'offline fixtures / pinned public SDK / real temporary local storage as identified by each test; no live evidence',
    blockers:[gaps[reg.owner],...(cap?.blockers??[])],
  };
});
if(rows.length!==44||new Set(rows.map(r=>r.operation)).size!==44)throw new Error('OPERATION_INVENTORY_MISMATCH');
const report={head:provenance.head,testedCandidateSha:provenance.testedCandidateSha,snapshotDigest:provenance.snapshotDigest,
  note:'Factory declarations are claims, not provider execution evidence. Registration remains F0. Missing implementation is never labeled unsupported by Photon.',operations:rows};
const directory=join(root,'docs/photon-features/reports/wt-09');mkdirSync(directory,{recursive:true});
writeFileSync(join(directory,'operation-coverage.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# WT-09 operation coverage','',report.note,'',
  `Tested snapshot: ${report.snapshotDigest}. Candidate SHA: ${report.testedCandidateSha??'not supplied'}.`,
  '', 'All 44 operations have schema/ownership coverage. Provider account/conversation availability is unknown for every row. Full per-operation local invocation remains pending assembly. Tests below are scoped evidence; they do not mean each operation executed successfully.', '',
  '| Operation | Owner | F0 registration | Lane declaration | Provider declaration | Tests / exact blocker |',
  '| --- | --- | --- | --- | --- | --- |'];
for(const row of rows)lines.push(`| ${row.operation} | ${row.owner} | ${row.registrationImplementation} | ${row.laneDeclaredImplementation} | ${row.laneDeclaredProviderSupport}; availability unknown | ${[...new Set(row.tests)].join(', ')}. ${row.blockers.join(' ')} |`);
writeFileSync(join(directory,'operation-coverage.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({operations:rows.length,registrationImplemented:rows.filter(r=>r.registrationImplementation==='implemented').length,
  declaredImplemented:rows.filter(r=>r.laneDeclaredImplementation==='implemented').length,output:directory}));
