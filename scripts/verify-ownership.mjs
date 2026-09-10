import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Exact code ownership; snapshot exceptions can contain reference data only. */
export function checkOwnership(manifest, paths, lane) {
  const seen = new Set();
  for (const [owner, files] of Object.entries(manifest.owners)) {
    for (const file of files) {
      if (seen.has(file)) throw new Error(`DUPLICATE_OWNERSHIP:${file}`);
      if (file.includes('..') || file.startsWith('/') || /[*?]/.test(file)) throw new Error(`NON_EXACT_OWNERSHIP:${owner}:${file}`);
      seen.add(file);
    }
  }
  if (!manifest.owners[lane]) throw new Error('UNKNOWN_LANE');
  const allowed = new Set(manifest.owners[lane]);
  for (const path of paths) {
    const snapshot = (manifest.snapshotRoots[lane] ?? []).some(prefix => path.startsWith(prefix) && /\.(md|txt|json)$/.test(path));
    if (!allowed.has(path) && !snapshot) throw new Error(`UNOWNED_PATH:${path}`);
  }
  return {lane, checked:paths.length};
}
export function changedPaths(root, base) {
  const run = args => execFileSync('git',['-C',root,...args],{encoding:'utf8'}).split('\0').filter(Boolean);
  return [...new Set([...run(['diff','--name-only','-z',base,'--']), ...run(['diff','--cached','--name-only','-z','--']), ...run(['ls-files','--others','--exclude-standard','-z'])])].sort();
}
export function verifyOwnership(root=process.cwd(),lane='wt-00') {
  const manifest = JSON.parse(readFileSync(resolve(root,'docs/worktrees/ownership.json')));
  const {startCommit} = JSON.parse(readFileSync(resolve(root,'docs/worktrees/foundation.json')));
  const map = JSON.parse(readFileSync(resolve(root,'docs/worktrees/worktree-map.json')));
  const base = lane === 'integration'
    ? execFileSync('git',['-C',root,'rev-parse','--verify',`${map.lanes.integration.base}^{commit}`],{encoding:'utf8'}).trim()
    : startCommit;
  const paths = changedPaths(root,base);
  for (const path of paths) { try { if(lstatSync(resolve(root,path)).isSymbolicLink()) throw new Error('OWNED_SYMLINK_FORBIDDEN'); } catch(e) {if(e.code!=='ENOENT')throw e;} }
  if (lane === 'integration') {
    // An assembled candidate contains immutable reviewed lane deltas plus exact
    // integration-owned composition files. Derive the former from the ledger;
    // do not grant a wildcard over arbitrary working-tree paths.
    const ledger = JSON.parse(readFileSync(resolve(root,'docs/worktrees/integration/included-commits.json')));
    const reviewed = new Set();
    for (const entry of ledger.lanes) for (const commit of entry.reviewedCommits) {
      const output = execFileSync('git',['-C',root,'diff','--name-only','-z',base,commit,'--'],{encoding:'utf8'});
      for (const path of output.split('\0').filter(Boolean)) reviewed.add(path);
    }
    const owned = new Set(manifest.owners.integration);
    const snapshots = manifest.snapshotRoots.integration ?? [];
    for (const path of paths) {
      const snapshot = snapshots.some(prefix => path.startsWith(prefix) && /\.(md|txt|json)$/.test(path));
      if (!reviewed.has(path) && !owned.has(path) && !snapshot) throw new Error(`UNOWNED_PATH:${path}`);
    }
    return {lane,checked:paths.length,reviewedLanePaths:[...reviewed].filter(path=>paths.includes(path)).length,
      integrationPaths:paths.filter(path=>owned.has(path)||snapshots.some(prefix=>path.startsWith(prefix))).length};
  }
  return checkOwnership(manifest,paths,lane);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyOwnership(process.cwd(),process.argv[2] ?? 'wt-00'))); }
  catch(e) { console.error(e.message); process.exitCode=1; }
}
