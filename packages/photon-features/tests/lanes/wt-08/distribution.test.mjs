import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, chmod, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { encodeArchive, decodeArchive, sha256, packageCandidate } from '../../../scripts/package.mjs';
import { installRelease, rollbackRelease } from '../../../scripts/install.mjs';
import { generateSkill } from '../../../scripts/generate-skill.mjs';
import { smoke } from '../../../scripts/smoke-test.mjs';
// Synthetic in-memory release metadata for installer tests, not an integration attestation.
const metadata = { kind: 'assembled-tested-candidate', commit: 'a'.repeat(40), f0Digest: 'b'.repeat(64), node: '24.13.0', npm: '10.9.2', stateSchemaVersion: 1, compatibleStateSchemas: [1], platform: process.platform, arch: process.arch, tests: ['npm test', 'npm run photon:test', 'npm run photon:check', 'npm run photon:test:integration', 'node scripts/generate-skill.mjs --check'].map(command => ({ command, exitCode: 0 })) };
const files = { 'dist/src/cli/main.js': 'console.log("fixture only")', 'dist/src/index.d.ts': 'export {};', 'schemas/protocol.json': '{}', 'SKILL.md': 'baseline', 'INSTALL.md': 'inactive', 'package.json': '{"type":"module"}', 'dependency-lock.json': '{}', 'node_modules/zod/package.json': '{}' };
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'wt08-install-'));
  const bytes = encodeArchive(files, metadata), checksum = sha256(bytes), archivePath = join(dir, 'fixture.gpf.gz');
  await writeFile(archivePath, bytes);
  return { dir, root: join(dir, 'installation'), archivePath, checksum, close: () => rm(dir, { recursive: true, force: true }) };
}
test('archive is deterministic, complete, checksummed and traversal/secret safe', () => {
  const a = encodeArchive(files, metadata), b = encodeArchive(Object.fromEntries(Object.entries(files).reverse()), metadata);
  assert.deepEqual(a, b);
  assert.equal(decodeArchive(a, sha256(a)).files.length, Object.keys(files).length);
  assert.throws(() => decodeArchive(a, '0'.repeat(64)), /CHECKSUM/);
  for (const name of ['../escape', '/tmp/escape', 'nested/../../escape', '.env', 'credentials', 'runtime/state.sqlite']) assert.throws(() => encodeArchive({ [name]: 'secret' }, metadata), /UNSAFE_ARCHIVE_PATH/);
  const collision = encodeArchive({ x: 'file', 'x/y': 'child' }, metadata);
  assert.throws(() => decodeArchive(collision, sha256(collision)), /COLLISION/);
});
test('clean and repeat installation is inactive, preserves fuller skill and unrelated files', async () => {
  const f = await fixture();
  try {
    const skill = join(f.dir, 'existing-fuller-SKILL.md'); await writeFile(skill, 'fuller installed policy');
    const first = await installRelease(f); assert.equal(first.activation, 'disabled');
    assert.deepEqual(await installRelease(f), first);
    assert.equal(await readFile(skill, 'utf8'), 'fuller installed policy');
    assert.deepEqual(JSON.parse(await readFile(join(f.root, 'runtime/configuration.json'), 'utf8')), { version: 1, activation: 'disabled' });
    await writeFile(join(f.root, 'unrelated'), 'preserve');
    await installRelease(f); assert.equal(await readFile(join(f.root, 'unrelated'), 'utf8'), 'preserve');
    const unrelated = join(f.dir, 'other'); await mkdir(unrelated, { mode: 0o700 }); await writeFile(join(unrelated, 'data'), 'keep');
    await assert.rejects(installRelease({ ...f, root: unrelated })); assert.equal(await readFile(join(unrelated, 'data'), 'utf8'), 'keep');
  } finally { await f.close(); }
});
test('owner lock, active configuration and existing socket prevent installation', async () => {
  const f = await fixture();
  try {
    await installRelease(f);
    for (const name of ['.install-lock', 'runtime/host.lock', 'runtime/runtime.sock']) {
      const p = join(f.root, name); await writeFile(p, 'owner'); await assert.rejects(installRelease(f), /OWNER/); await rm(p);
    }
    await writeFile(join(f.root, 'runtime/configuration.json'), JSON.stringify({ activation: 'enabled' }));
    await assert.rejects(installRelease(f), /DEACTIVATION/);
  } finally { await f.close(); }
});
test('compatible rollback preserves queued and unknown work; unsafe downgrade fails without state loss', async () => {
  const f = await fixture();
  try {
    const first = await installRelease(f);
    const state = join(f.root, 'runtime/state.sqlite');
    let db = new DatabaseSync(state); db.exec("PRAGMA user_version=1; CREATE TABLE work(id TEXT, status TEXT); INSERT INTO work VALUES('one','queued'),('two','unknown-outcome');"); db.close(); await chmod(state, 0o600);
    const before = await readFile(state);
    const newer = encodeArchive({ ...files, 'SKILL.md': 'newer' }, { ...metadata, commit: 'c'.repeat(40) });
    const secondPath = join(f.dir, 'second.gpf.gz'); await writeFile(secondPath, newer);
    await installRelease({ ...f, archivePath: secondPath, checksum: sha256(newer) });
    await rollbackRelease({ root: f.root, release: first.release });
    assert.deepEqual(await readFile(state), before);
    db = new DatabaseSync(state); db.exec('PRAGMA user_version=2'); db.close();
    const upgraded = await readFile(state), pointer = await readFile(join(f.root, 'selected-release.json'));
    await assert.rejects(rollbackRelease({ root: f.root, release: first.release }), /INCOMPATIBLE_DOWNGRADE/);
    assert.deepEqual(await readFile(state), upgraded); assert.deepEqual(await readFile(join(f.root, 'selected-release.json')), pointer);
  } finally { await f.close(); }
});
test('tampered releases and symlink roots are refused', async () => {
  const f = await fixture();
  try {
    const installed = await installRelease(f);
    await writeFile(join(installed.path, 'SKILL.md'), 'tampered');
    await assert.rejects(installRelease(f), /MODIFIED/);
    await assert.rejects(rollbackRelease({ root: f.root, release: installed.release }), /CHECKSUM/);
    const link = join(f.dir, 'link'); await symlink(f.root, link);
    await assert.rejects(installRelease({ ...f, root: link }), /PRIVATE_DIRECTORY/);
  } finally { await f.close(); }
});
test('release boundary rejects a dirty isolated candidate, never produces final artifact', async () => {
  const f = await fixture();
  try {
    const candidate = join(f.dir, 'dirty-candidate');
    await mkdir(candidate);
    execFileSync('git', ['-C', candidate, 'init', '--quiet']);
    await writeFile(join(candidate, 'tracked'), 'committed');
    execFileSync('git', ['-C', candidate, 'add', 'tracked']);
    execFileSync('git', ['-C', candidate, '-c', 'user.name=WT08', '-c', 'user.email=wt08@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
    await writeFile(join(candidate, 'untracked'), 'dirty');
    await assert.rejects(packageCandidate({ candidate, approval: join(f.dir, 'missing'), output: join(f.dir, 'final.gpf.gz') }), /CLEAN_ASSEMBLED_CANDIDATE_REQUIRED/);
  }
  finally { await f.close(); }
});
test('all generated examples validate, registry drift detected, offline smoke needs no host', async () => {
  assert.equal((await generateSkill({ check: true })).examplesValidated, 44);
  const skill = new URL('../../../SKILL.md', import.meta.url); const original = await readFile(skill);
  try {
    await writeFile(skill, original.toString().replace('| text.send |', '| invented.operation |'));
    await assert.rejects(generateSkill({ check: true }), /SKILL_REGISTRY_DRIFT/);
  } finally { await writeFile(skill, original); }
  assert.equal((await smoke(new URL('../../../', import.meta.url).pathname)).offlineSmoke, 'passed');
});
