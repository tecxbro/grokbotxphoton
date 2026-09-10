import { readFile, writeFile, mkdir, lstat, readdir, rename, rm, open, realpath } from 'node:fs/promises';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { decodeArchive, validateMetadata, sha256 } from './package.mjs';
const marker = 'grok-photon-install-v1\n';
async function exists(path) { try { await lstat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function privateDirectory(path) {
  const s = await lstat(path);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o700) throw new Error('PRIVATE_DIRECTORY_REQUIRED');
}
async function prepare(root) {
  // Do not adopt or chmod an unrelated existing directory.
  if (!(await exists(root))) {
    await mkdir(root, { mode: 0o700 });
    await writeFile(join(root, '.grok-photon-install'), marker, { flag: 'wx', mode: 0o600 });
  }
  await privateDirectory(root);
  if (await readFile(join(root, '.grok-photon-install'), 'utf8') !== marker) throw new Error('UNRELATED_INSTALL_ROOT');
  for (const name of ['releases', 'runtime']) {
    const p = join(root, name); if (!(await exists(p))) await mkdir(p, { mode: 0o700 }); await privateDirectory(p);
  }
}
async function locked(root, task) {
  const lockPath = join(root, '.install-lock');
  const lock = await open(lockPath, 'wx', 0o600).catch(() => { throw new Error('INSTALL_OWNER_EXISTS'); });
  try {
    for (const name of ['host.lock', 'runtime.sock']) if (await exists(join(root, 'runtime', name))) throw new Error('HOST_OWNER_OR_SOCKET_EXISTS');
    const cfg = join(root, 'runtime', 'configuration.json');
    if (await exists(cfg)) {
      const s = await lstat(cfg); if (!s.isFile() || s.isSymbolicLink() || (s.mode & 0o077)) throw new Error('UNSAFE_CONFIGURATION');
      const config = JSON.parse(await readFile(cfg, 'utf8'));
      if (config.activation !== 'disabled') throw new Error('DEACTIVATION_REQUIRED');
    } else await writeFile(cfg, JSON.stringify({ version: 1, activation: 'disabled' }) + '\n', { flag: 'wx', mode: 0o600 });
    return await task();
  } finally { await lock.close(); await rm(lockPath); }
}
async function stateVersion(root) {
  const path = join(root, 'runtime', 'state.sqlite');
  if (!(await exists(path))) return 1;
  const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077)) throw new Error('UNSAFE_STATE_FILE');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try { return db.prepare('PRAGMA user_version').get().user_version; } finally { db.close(); }
}
async function compatible(root, metadata) {
  validateMetadata(metadata);
  if (process.platform !== metadata.platform || process.arch !== metadata.arch) throw new Error('TARGET_PLATFORM_MISMATCH');
  if (process.versions.node !== metadata.node) throw new Error('PINNED_NODE_REQUIRED');
  if (!metadata.compatibleStateSchemas.includes(await stateVersion(root))) throw new Error('INCOMPATIBLE_DOWNGRADE');
}
async function pointer(root, release) {
  const target = join(root, 'selected-release.json');
  if (await exists(target)) { const s = await lstat(target); if (!s.isFile() || s.isSymbolicLink()) throw new Error('UNSAFE_RELEASE_POINTER'); }
  const temporary = join(root, '.selection-' + randomUUID());
  await writeFile(temporary, JSON.stringify({ version: 1, release, activation: 'disabled' }) + '\n', { flag: 'wx', mode: 0o600 });
  await rename(temporary, target);
}
async function verifyInstalled(directory, archive) {
  await privateDirectory(directory);
  const expected = new Set(archive.files.map(f => f.path)); expected.add('release-manifest.json');
  async function walk(dir, prefix = '') {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const name = prefix + e.name;
      if (e.isDirectory()) await walk(join(dir, e.name), name + '/');
      else if (!e.isFile() || !expected.delete(name)) throw new Error('INSTALLED_RELEASE_MODIFIED');
    }
  }
  await walk(directory);
  if (expected.size) throw new Error('INSTALLED_RELEASE_MODIFIED');
  for (const f of archive.files) {
    const path = join(directory, f.path), s = await lstat(path);
    if (s.uid !== process.getuid?.() || (s.mode & 0o777) !== f.mode || sha256(await readFile(path)) !== f.sha256) throw new Error('INSTALLED_RELEASE_MODIFIED');
  }
}
export async function installRelease({ archivePath, checksum, root }) {
  if (!isAbsolute(root)) throw new Error('ABSOLUTE_INSTALL_ROOT_REQUIRED');
  root = resolve(root);
  const bytes = await readFile(archivePath), archive = decodeArchive(bytes, checksum);
  validateMetadata(archive.metadata);
  if (process.platform !== archive.metadata.platform || process.arch !== archive.metadata.arch) throw new Error('TARGET_PLATFORM_MISMATCH');
  if (process.versions.node !== archive.metadata.node) throw new Error('PINNED_NODE_REQUIRED');
  const names = new Set(archive.files.map(f => f.path));
  for (const name of ['dist/src/cli/main.js', 'dist/src/index.d.ts', 'schemas/protocol.json', 'SKILL.md', 'INSTALL.md', 'package.json', 'dependency-lock.json', 'node_modules/zod/package.json']) if (!names.has(name)) throw new Error('INCOMPLETE_RELEASE');
  await prepare(root);
  return locked(root, async () => {
    await compatible(root, archive.metadata);
    const release = checksum, destination = join(root, 'releases', release);
    if (await exists(destination)) {
      await verifyInstalled(destination, archive);
      const stored = JSON.parse(await readFile(join(destination, 'release-manifest.json'), 'utf8'));
      if (stored.checksum !== checksum || JSON.stringify(stored.metadata) !== JSON.stringify(archive.metadata)) throw new Error('INSTALLED_RELEASE_MODIFIED');
    } else {
      const temporary = join(root, 'releases', '.staging-' + randomUUID()); await mkdir(temporary, { mode: 0o700 });
      try {
        for (const f of archive.files) {
          const path = join(temporary, f.path); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
          await writeFile(path, Buffer.from(f.content, 'base64'), { flag: 'wx', mode: f.mode });
        }
        await writeFile(join(temporary, 'release-manifest.json'), JSON.stringify({ checksum, metadata: archive.metadata, files: archive.files.map(({ content, ...f }) => f) }) + '\n', { flag: 'wx', mode: 0o600 });
        await rename(temporary, destination);
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
    await pointer(root, release);
    return { installed: true, release, activation: 'disabled', path: destination };
  });
}
export async function installPackage(options) { return installRelease(options); }
export async function rollbackRelease({ root, release }) {
  if (!isAbsolute(root) || !/^[a-f0-9]{64}$/.test(release)) throw new Error('INVALID_ROLLBACK_TARGET');
  await prepare(root);
  return locked(root, async () => {
    const directory = join(root, 'releases', release); await privateDirectory(directory);
    const path = join(directory, 'release-manifest.json');
    const s = await lstat(path); if (!s.isFile() || s.isSymbolicLink()) throw new Error('UNSAFE_MANIFEST');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    if (manifest.checksum !== release) throw new Error('INVALID_RELEASE');
    const files = {};
    // Reconstruct and verify the full original artifact checksum, including metadata.
    for (const f of manifest.files) {
      if (!f.path || f.path.startsWith('/') || f.path.split('/').includes('..')) throw new Error('UNSAFE_MANIFEST');
      files[f.path] = { content: await readFile(join(directory, f.path)), mode: f.mode };
    }
    const { encodeArchive } = await import('./package.mjs');
    const archive = decodeArchive(encodeArchive(files, manifest.metadata), release);
    await verifyInstalled(directory, archive);
    await compatible(root, archive.metadata);
    await pointer(root, release);
    return { selected: release, activation: 'disabled', statePreserved: true };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, a, b, root, ...extra] = process.argv.slice(2);
    if (!a || !b || !root || extra.length) throw new Error('USAGE_INSTALL_ARCHIVE_SHA256_ROOT_OR_ROLLBACK_ROOT_RELEASE_CONFIRM');
    const result = command === 'install' ? await installRelease({ archivePath: a, checksum: b, root }) : command === 'rollback' && root === 'confirm-inactive' ? await rollbackRelease({ root: a, release: b }) : (() => { throw new Error('INVALID_COMMAND'); })();
    console.log(JSON.stringify(result));
  } catch (e) { console.error('grok-photon installation failed: ' + (/^[A-Z_]+$/.test(e.message) ? e.message : 'VALIDATION_FAILED')); process.exitCode = 1; }
}
