import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding:'utf8'}).trim();
/** Fail rather than repairing or switching a checkout. */
export function verifyWorktree(root = process.cwd(), lane = 'wt-00') {
  const map = JSON.parse(readFileSync(resolve(root,'docs/worktrees/worktree-map.json')));
  const foundation = JSON.parse(readFileSync(resolve(root,'docs/worktrees/foundation.json')));
  const expected = map.lanes[lane];
  if (!expected || realpathSync(root) !== expected.path) throw new Error('WRONG_WORKTREE_PATH');
  if (git(root,'rev-parse','--show-toplevel') !== expected.path || git(root,'branch','--show-current') !== expected.branch) throw new Error('WRONG_WORKTREE_BRANCH');
  const registration = git(root,'worktree','list','--porcelain');
  if (!registration.includes(`worktree ${expected.path}\nHEAD `) || !registration.includes(`branch refs/heads/${expected.branch}`)) throw new Error('UNREGISTERED_WORKTREE');
  if (realpathSync(git(root,'rev-parse','--git-common-dir')) !== realpathSync(resolve(map.primary,'.git'))) throw new Error('WRONG_REPOSITORY');
  const origin = git(root,'remote','get-url','origin').replace(/\.git$/, '');
  if (origin !== map.repository) throw new Error('WRONG_ORIGIN');
  const expectedBase = git(root,'rev-parse','--verify',`${expected.base}^{commit}`);
  if (lane === 'wt-00' && (foundation.startCommit !== expected.base || foundation.comparisonCommit !== expected.base)) throw new Error('BASE_IDENTITY_DRIFT');
  git(root,'merge-base','--is-ancestor',expectedBase,'HEAD');
  const first = git(root,'reflog','show','--format=%H',expected.branch).split('\n').at(-1);
  if ((lane === 'wt-00' || lane === 'integration') && first !== expectedBase) throw new Error('ORIGINAL_BASE_MISMATCH');
  if (existsSync(resolve(root,'.photon-local')) && !realpathSync(resolve(root,'.photon-local')).startsWith(expected.path+'/')) throw new Error('OUTPUT_PATH_ESCAPE');
  if (!git(root,'check-ignore','.photon-local/runtime/photon.sqlite')) throw new Error('OUTPUT_NOT_ISOLATED');
  return {lane, path:expected.path, branch:expected.branch, startCommit:expectedBase, head:git(root,'rev-parse','HEAD'), dirty:!!git(root,'status','--porcelain')};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyWorktree(process.cwd(),process.argv[2] ?? 'wt-00'))); }
  catch(e) { console.error(e.message); process.exitCode=1; }
}
