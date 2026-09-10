import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { reject } from "./safety.js";

export function beneath(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
/** Opens the same inode inspected under an approved root. Never reopen the supplied path. */
export async function openApprovedFile(path: string, roots: readonly string[], afterInspection?: () => Promise<void>): Promise<FileHandle> {
  if (!isAbsolute(path) || path.includes("\0") || path.split(/[\\/]/).includes("..")) reject("invalid path");
  const absolute = resolve(path);
  const canonicalRoots = await Promise.all(roots.map(root => realpath(root)));
  const canonical = await realpath(absolute);
  // Symlinks in the caller-controlled suffix are rejected, including ancestor symlinks.
  // System aliases in the configured root (e.g. /tmp on macOS) are canonicalized.
  const rootIndex = roots.findIndex(root => beneath(resolve(root), absolute));
  if (rootIndex < 0) reject("outside approved roots");
  const trustedRoot = canonicalRoots[rootIndex]!;
  const expected = resolve(trustedRoot, relative(resolve(roots[rootIndex]!), absolute));
  if (canonical !== expected || !beneath(trustedRoot, canonical)) reject("symlink or root escape");
  const before = await lstat(canonical);
  if (!before.isFile() || before.nlink !== 1) reject("not a private regular file");
  await afterInspection?.();
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) reject("file changed during open");
    if (await realpath(absolute) !== canonical) reject("path changed during open");
    return handle;
  } catch (error) { await handle.close(); throw error; }
}
