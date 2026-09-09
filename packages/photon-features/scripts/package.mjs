import { readFile, writeFile, readdir, lstat, realpath, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = name => typeof name === 'string' && name.length < 500 && !isAbsolute(name) && !name.includes('\\') && name.split('/').every(p => p && p !== '.' && p !== '..') && !/(^|\/)(\.env(?:\..*)?|\.npmrc|\.git|credentials?|.*\.(sqlite|db|pem|key)|runtime\.sock)(\/|$)/i.test(name);
export function encodeArchive(files, metadata) {
  const entries = Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, value]) => {
    if (!safePath(path)) throw new Error('UNSAFE_ARCHIVE_PATH');
    const bytes = Buffer.from(value.content ?? value);
    const mode = value.mode ?? (path === 'dist/src/cli/main.js' ? 0o700 : 0o600);
    if (![0o600, 0o700].includes(mode)) throw new Error('UNSAFE_ARCHIVE_MODE');
    return { path, mode, bytes: bytes.length, sha256: sha256(bytes), content: bytes.toString('base64') };
  });
  return gzipSync(Buffer.from(JSON.stringify({ format: 'grok-photon-release-v1', metadata, files: entries }) + '\n'), { level: 9 });
}
export function decodeArchive(bytes, expectedChecksum) {
  if (!/^[a-f0-9]{64}$/.test(expectedChecksum) || sha256(bytes) !== expectedChecksum) throw new Error('ARTIFACT_CHECKSUM_MISMATCH');
  if (bytes.length > 256 * 1024 * 1024) throw new Error('ARCHIVE_TOO_LARGE');
  const archive = JSON.parse(gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 }).toString('utf8'));
  if (archive.format !== 'grok-photon-release-v1' || !Array.isArray(archive.files) || archive.files.length > 50000 || Object.keys(archive).sort().join() !== 'files,format,metadata') throw new Error('INVALID_ARCHIVE');
  const seen = new Set();
  for (const f of archive.files) {
    if (Object.keys(f).sort().join() !== 'bytes,content,mode,path,sha256' || !safePath(f.path) || seen.has(f.path) || ![0o600, 0o700].includes(f.mode) || typeof f.content !== 'string') throw new Error('UNSAFE_ARCHIVE_PATH');
    seen.add(f.path); const content = Buffer.from(f.content, 'base64');
    if (content.toString('base64') !== f.content || content.length !== f.bytes || sha256(content) !== f.sha256) throw new Error('ARCHIVE_FILE_CHECKSUM_MISMATCH');
  }
  for (const name of seen) for (let parent = name.substring(0, name.lastIndexOf('/')); parent; parent = parent.substring(0, parent.lastIndexOf('/'))) if (seen.has(parent)) throw new Error('ARCHIVE_PATH_COLLISION');
  return archive;
}
export function validateMetadata(m) {
  const required = ['npm test', 'npm run photon:test', 'npm run photon:check', 'npm run photon:test:integration', 'node scripts/generate-skill.mjs --check'];
  if (!m || m.kind !== 'assembled-tested-candidate' || !/^[a-f0-9]{40}$/.test(m.commit) || !/^[a-f0-9]{64}$/.test(m.f0Digest) || m.node !== '24.13.0' || m.npm !== '10.9.2' || !Number.isSafeInteger(m.stateSchemaVersion) || m.stateSchemaVersion !== 1 || !Array.isArray(m.compatibleStateSchemas) || m.compatibleStateSchemas.join() !== '1' || !Array.isArray(m.tests) || !m.tests.length || m.tests.some(t => t.exitCode !== 0) || required.some(command => !m.tests.some(t => t.command === command)) || !['darwin', 'linux'].includes(m.platform) || !['arm64', 'x64'].includes(m.arch)) throw new Error('UNTESTED_OR_INCOMPATIBLE_ARTIFACT');
}
export async function packageCandidate({ candidate, approval, output }) {
  candidate = await realpath(candidate);
  const git = (...args) => execFileSync('git', ['-C', candidate, ...args], { encoding: 'utf8' }).trim();
  if (git('rev-parse', '--show-toplevel') !== candidate || git('status', '--porcelain', '--untracked-files=all')) throw new Error('CLEAN_ASSEMBLED_CANDIDATE_REQUIRED');
  const commit = git('rev-parse', 'HEAD');
  const authorization = JSON.parse(await readFile(approval, 'utf8'));
  if (authorization.kind !== 'assembled-candidate-approval' || authorization.commit !== commit || typeof authorization.workflowRun !== 'string' || !authorization.workflowRun.startsWith('https://github.com/tecxbro/grokbotxphoton/actions/runs/') || authorization.approved !== true) throw new Error('INTEGRATION_APPROVAL_REQUIRED');
  const outputRelative = relative(candidate, resolve(output));
  if (!outputRelative.startsWith('..' + '/') && !isAbsolute(outputRelative)) throw new Error('OUTPUT_MUST_BE_OUTSIDE_CANDIDATE');
  const root = join(candidate, 'packages/photon-features');
  const foundation = JSON.parse(await readFile(join(candidate, 'docs/photon-features/foundation.json'), 'utf8'));
  if (authorization.f0Digest !== foundation.contractDigest) throw new Error('FOUNDATION_DIGEST_MISMATCH');
  if (process.versions.node !== foundation.runtime.node || execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim() !== foundation.runtime.npm) throw new Error('PINNED_TOOLCHAIN_REQUIRED');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const aggregate = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
  if (pkg.bin?.['grok-photon'] !== 'dist/src/cli/main.js' || !aggregate.scripts?.['photon:test:integration']) throw new Error('WT00_INTEGRATION_REQUIRED');
  // Fresh dependency tree prevents including arbitrary files from a developer node_modules.
  execFileSync('npm', ['ci', '--ignore-scripts'], { cwd: candidate, stdio: 'pipe' });
  await rm(join(root, 'dist'), { recursive: true, force: true });
  const tests = [];
  for (const args of [['test'], ['run', 'photon:test'], ['run', 'photon:check'], ['run', 'photon:test:integration']]) {
    const log = execFileSync('npm', args, { cwd: candidate });
    tests.push({ command: 'npm ' + args.join(' '), exitCode: 0, logSha256: sha256(log) });
  }
  const docLog = execFileSync(process.execPath, ['scripts/generate-skill.mjs', '--check'], { cwd: root });
  tests.push({ command: 'node scripts/generate-skill.mjs --check', exitCode: 0, logSha256: sha256(docLog) });
  if (git('status', '--porcelain', '--untracked-files=all') || git('rev-parse', 'HEAD') !== commit) throw new Error('CANDIDATE_CHANGED');
  const files = {};
  async function collect(directory, prefix, dependency = false) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (dependency && entry.name === '.bin') continue;
      const source = join(directory, entry.name), name = prefix + entry.name;
      if (entry.isSymbolicLink()) {
        // npm workspace link points back to the package already captured below.
        if (dependency && name === 'node_modules/@grokbot/photon-features' && await realpath(source) === root) continue;
        throw new Error('SYMLINK_IN_CANDIDATE');
      }
      if (entry.isDirectory()) await collect(source, name + '/', dependency);
      else if (entry.isFile()) { if (!safePath(name)) throw new Error('SECRET_PATH_IN_CANDIDATE'); files[name] = { content: await readFile(source), mode: ((await lstat(source)).mode & 0o111) ? 0o700 : 0o600 }; }
      else throw new Error('NONREGULAR_CANDIDATE_FILE');
    }
  }
  await collect(join(root, 'dist/src'), 'dist/src/');
  await collect(join(root, 'schemas'), 'schemas/');
  await collect(join(root, 'examples/wt-08'), 'examples/wt-08/');
  await collect(join(candidate, 'node_modules'), 'node_modules/', true);
  for (const name of ['package.json', 'SKILL.md', 'INSTALL.md', 'README.md', 'scripts/install.mjs', 'scripts/package.mjs', 'scripts/smoke-test.mjs']) files[name] = await readFile(join(root, name));
  files['bin/grok-photon'] = { content: Buffer.from("#!/usr/bin/env node\nimport { run } from '../dist/src/cli/main.js';\nprocess.exitCode = await run(process.argv.slice(2));\n"), mode: 0o700 };
  files['dependency-lock.json'] = await readFile(join(candidate, 'package-lock.json'));
  const lock = JSON.parse(files['dependency-lock.json'].toString('utf8'));
  for (const [name, record] of Object.entries(lock.packages)) {
    if (record.resolved?.startsWith('https://')) { const url = new URL(record.resolved); if (url.username || url.password) throw new Error('CREDENTIAL_IN_DEPENDENCY_LOCK'); }
    if (name.startsWith('packages/photon-features/node_modules/') && !record.dev) throw new Error('NESTED_RUNTIME_DEPENDENCY_REQUIRES_INTEGRATION');
  }
  files['foundation.json'] = await readFile(join(candidate, 'docs/photon-features/foundation.json'));
  const metadata = { kind: 'assembled-tested-candidate', commit, f0Digest: foundation.contractDigest, node: foundation.runtime.node, npm: foundation.runtime.npm,
    platform: process.platform, arch: process.arch, version: pkg.version, dependencies: pkg.dependencies, stateSchemaVersion: 1, compatibleStateSchemas: [1], workflowRun: authorization.workflowRun, tests: tests.map(({ command, exitCode }) => ({ command, exitCode })) };
  validateMetadata(metadata);
  const archive = encodeArchive(files, metadata);
  decodeArchive(archive, sha256(archive));
  // O_EXCL prevents silently replacing any existing artifact or checksum.
  await writeFile(output, archive, { flag: 'wx', mode: 0o600 });
  await writeFile(output + '.sha256', sha256(archive) + '\n', { flag: 'wx', mode: 0o600 });
  await writeFile(output + '.provenance.json', JSON.stringify({ commit, tests }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { artifact: output, sha256: sha256(archive), commit, files: Object.keys(files).length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [candidate, approval, output, ...extra] = process.argv.slice(2);
    if (!candidate || !approval || !output || extra.length) throw new Error('USAGE_CANDIDATE_APPROVAL_OUTPUT');
    console.log(JSON.stringify(await packageCandidate({ candidate, approval, output })));
  } catch (e) { console.error('grok-photon packaging failed: ' + (/^[A-Z_]+$/.test(e.message) ? e.message : 'VALIDATION_FAILED')); process.exitCode = 1; }
}
