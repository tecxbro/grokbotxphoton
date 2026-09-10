import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { opaqueId } from "./provider-context.js";

export interface CaptureStore {
  /** Must return only after bytes and directory entry are durable. Never log payloads. */
  put(value: unknown): string;
  read(id: string): unknown;
}
/** Private host-owned directory, same OS trust domain as F0 SQLite. Captures are
 * retained independently of normalization so missing scope/unknown content is recoverable. */
export class FileCaptureStore implements CaptureStore {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = lstatSync(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.mode & 0o077 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error("UNSAFE_CAPTURE_DIRECTORY");
  }
  put(value: unknown): string {
    const json = JSON.stringify(value);
    if (!json || Buffer.byteLength(json) > 1024 * 1024)
      throw new Error("CAPTURE_TOO_LARGE");
    const id = opaqueId("capture", json),
      path = join(this.directory, id + ".json");
    const temp = join(this.directory, randomUUID() + ".tmp");
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeFileSync(fd, json);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
    const dir = openSync(this.directory, "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
    return id;
  }
  read(id: string): unknown {
    if (!/^capture:[a-f0-9]{64}$/.test(id))
      throw new Error("INVALID_CAPTURE_ID");
    return JSON.parse(readFileSync(join(this.directory, id + ".json"), "utf8"));
  }
  *ids(): Iterable<string> {
    for (const name of readdirSync(this.directory))
      if (/^capture:[a-f0-9]{64}\.json$/.test(name)) yield name.slice(0, -5);
  }
}
