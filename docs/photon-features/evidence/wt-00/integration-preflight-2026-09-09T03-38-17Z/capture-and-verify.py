import pathlib,subprocess,json,hashlib,tempfile,datetime,os,shutil
root=pathlib.Path('/Users/darshan/Documents/ChatGPT/grokbotxphoton')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')
evidence=root/'docs/photon-features/evidence/wt-00'/('integration-preflight-'+stamp)
snapshot=pathlib.Path(tempfile.mkdtemp(prefix='wt00-integration-preflight-'))
def git(*args):return subprocess.check_output(['git',*args],cwd=root).decode().strip()
def sha(b):return hashlib.sha256(b).hexdigest()
paths=sorted(set(git('ls-files','--cached','--others','--exclude-standard').splitlines()))
manifest=[]
for name in paths:
 p=root/name
 if not p.is_file():continue
 b=p.read_bytes();dest=snapshot/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
 manifest.append({'path':name,'sha256':sha(b)})
evidence.mkdir(parents=True)
meta={'observedAt':stamp,'repository':git('remote','get-url','origin'),'worktree':str(root),'branch':git('branch','--show-current'),'head':git('rev-parse','HEAD'),'f0':git('rev-parse','HEAD'),'comparison':git('rev-parse','origin/main'),'remoteMain':git('ls-remote','origin','refs/heads/main'),'divergence':git('rev-list','--left-right','--count','origin/main...HEAD'),'dirtyState':git('status','--porcelain=v1','--untracked-files=all'),'testedReleaseCommit':None,'includedLaneCommits':[],'snapshot':str(snapshot),'manifest':manifest,'snapshotDigest':sha(json.dumps(manifest,sort_keys=True).encode()),'commands':[]}
(evidence/'snapshot.json').write_text(json.dumps(meta,indent=2)+'\n')
pathlib.Path('/tmp/wt00-integration-preflight-current.json').write_text(json.dumps({'evidence':str(evidence),'snapshot':str(snapshot)}))
node='/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node'
env={**os.environ,'PATH':str(pathlib.Path(node).parent)+':'+os.environ['PATH'],'WT09_LIVE_APPROVAL_FILE':'','WT09_LIVE_CANDIDATE_SHA':''}
def run(name,args):
 start=datetime.datetime.now(datetime.timezone.utc).isoformat()
 r=subprocess.run(args,cwd=snapshot,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
 (evidence/(name+'.log')).write_bytes(r.stdout)
 record={'name':name,'argv':args,'cwd':str(snapshot),'startedAt':start,'exitCode':r.returncode,'logSha256':sha(r.stdout)};meta['commands'].append(record)
 (evidence/'snapshot.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(record),flush=True)
 return r.returncode==0
run('versions',[node,'--version']);run('npm-version',['npm','--version'])
if run('clean-install',['npm','ci','--ignore-scripts']):
 run('original-cli',['npm','test'])
 if run('build',['npm','run','photon:build']):
  run('foundation',['npm','run','photon:test']);run('contract-drift',['npm','run','photon:check'])
  tests=sorted(str(p.relative_to(snapshot)) for folder in ['e2e','security','live','lanes/wt-09'] for p in (snapshot/'packages/photon-features/dist/tests'/folder).rglob('*.test.js'))
  run('wt09',[node,'--test','--test-reporter=tap',*tests])
  run('generated-skill',[node,'packages/photon-features/scripts/generate-skill.mjs','--check'])
  run('package-boundary',['npm','pack','--dry-run','--json','--workspace=@grokbot/photon-features'])
meta['sourceChangedDuringRun']=[f['path'] for f in manifest if not (root/f['path']).is_file() or sha((root/f['path']).read_bytes())!=f['sha256']]
(evidence/'snapshot.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps({'evidence':str(evidence),'snapshot':str(snapshot),'sourceChangedDuringRun':meta['sourceChangedDuringRun']}),flush=True)
