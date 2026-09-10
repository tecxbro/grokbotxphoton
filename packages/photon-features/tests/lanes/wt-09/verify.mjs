import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../../../../../',import.meta.url));
const evidence=join(root,'docs/photon-features/evidence/wt-09');mkdirSync(evidence,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const head=git('rev-parse','HEAD'),candidate=process.env.WT09_CANDIDATE_SHA??null;
if(candidate&&(!/^[a-f0-9]{40}$/.test(candidate)||candidate!==head))throw new Error('EXACT_CANDIDATE_CHECKOUT_REQUIRED_NO_BRANCH_SWITCHING');
const dirty=git('status','--porcelain=v1','--untracked-files=all');
const owned=p=>/^(packages\/photon-features\/(tests\/(e2e|security|live|lanes\/wt-09)|examples\/wt-09)|docs\/photon-features\/(reports|evidence|requests)\/wt-09)\//.test(p);
if(candidate&&dirty.split('\n').some(line=>line&&!owned(line.slice(3))))throw new Error('CANDIDATE_HAS_UNREVIEWED_NON_WT09_CHANGES');
if(process.versions.node!=='24.13.0')throw new Error('NODE_24_13_0_REQUIRED');
const runDir=join(evidence,new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(runDir);
const snapshot=mkdtempSync(join(tmpdir(),'wt09-snapshot-'));
const paths=git('ls-files','--cached','--others','--exclude-standard').split('\n').filter(p=>p&&
  (/^(src|test|packages\/photon-features|docs\/photon-features)\//.test(p)||['package.json','package-lock.json','README.md','LICENSE'].includes(p))&&
  !p.startsWith('docs/photon-features/evidence/wt-09/')&&!/\/node_modules\/|\/dist\//.test(p));
const manifest=[];
for(const path of [...new Set(paths)].sort()){
  const source=join(root,path);if(!statSync(source).isFile())continue;const bytes=readFileSync(source);
  const target=join(snapshot,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
  manifest.push({path,sha256:hash(bytes)});
}
const unstable=manifest.filter(f=>hash(readFileSync(join(root,f.path)))!==f.sha256).map(f=>f.path);
if(unstable.length)throw new Error('SNAPSHOT_CHANGED_DURING_CAPTURE:'+unstable.join(','));
const foundation=JSON.parse(readFileSync(join(snapshot,'docs/photon-features/foundation.json')));
let remote;try{remote={trackingSha:git('rev-parse','origin/main'),divergence:git('rev-list','--left-right','--count','HEAD...origin/main'),live:git('ls-remote','origin','refs/heads/main')};}catch{remote={status:'unavailable'};}
const metadata={observedAt:new Date().toISOString(),repository:git('remote','get-url','origin'),path:root,branch:git('branch','--show-current'),head,
  f0:foundation.checkpoint,f0Digest:foundation.contractDigest,comparisonCommit:head,testedCandidateSha:candidate,
  dirtyState:dirty,remote,snapshot,snapshotDigest:hash(JSON.stringify(manifest)),manifest,node:process.versions.node,
  npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),commands:[]};
writeFileSync(join(runDir,'snapshot.json'),JSON.stringify(metadata,null,2)+'\n');
function run(name,command,args,cwd=snapshot){
  const startedAt=new Date().toISOString();
  const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60000,maxBuffer:20*1024*1024,env:{...process.env,WT09_LIVE_APPROVAL_FILE:'',WT09_LIVE_CANDIDATE_SHA:''}});
  const log=(result.stdout??'')+(result.stderr??'')+(result.error?'\n'+result.error.message:'');
  writeFileSync(join(runDir,name+'.log'),log);
  const record={name,command:[command,...args].join(' '),cwd,startedAt,exitCode:result.status,signal:result.signal,logSha256:hash(log)};
  metadata.commands.push(record);console.log(JSON.stringify(record));return result.status===0;
}
const installed=run('clean-install','npm',['ci','--ignore-scripts']);
if(installed){
  run('original-cli','npm',['test']);
  const built=run('build','npm',['run','photon:build']);
  run('foundation','npm',['run','photon:test']);run('contract-drift','npm',['run','photon:check']);
  if(built){
    const tests=manifest.map(f=>f.path).filter(p=>/^packages\/photon-features\/tests\/(e2e|security|live|lanes\/wt-09)\/.*\.test\.ts$/.test(p)).map(p=>p.replace('/tests/','/dist/tests/').replace(/\.ts$/,'.js'));
    run('wt09',process.execPath,['--test','--test-reporter=tap',...tests]);
    run('generated-skill',process.execPath,['packages/photon-features/scripts/generate-skill.mjs','--check']);
    run('package-boundary','npm',['pack','--dry-run','--json','--workspace=@grokbot/photon-features']);
  }
}
metadata.sourceChangedDuringRun=manifest.filter(f=>hash(readFileSync(join(root,f.path)))!==f.sha256).map(f=>f.path);
metadata.status={codeBuilt:metadata.commands.find(c=>c.name==='build')?.exitCode===0,
  assembledIntegrationVerified:false,installedActivated:false,liveVerified:false};
writeFileSync(join(runDir,'snapshot.json'),JSON.stringify(metadata,null,2)+'\n');
writeFileSync(join(evidence,'latest-run.json'),JSON.stringify({runDirectory:runDir,snapshot,snapshotDigest:metadata.snapshotDigest,head,testedCandidateSha:candidate},null,2)+'\n');
console.log(JSON.stringify({runDirectory:runDir,snapshot,status:metadata.status}));
process.exitCode=metadata.commands.some(c=>c.exitCode!==0)?1:0;
