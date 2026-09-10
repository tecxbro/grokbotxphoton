import { connect } from "node:net";
import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { z } from "zod";
import { MAX_REQUEST_BYTES, capabilitySchema, resultSchema, incomingEventSchema, scopeSchema, idSchema, type LocalRequest } from "../contracts/index.js";
import { CliError, type CliResponse } from "./output.js";
const count = z.number().int().nonnegative();
// LocalResponse's work records are TypeScript-only in F0. This validates that wire seam;
// operation payloads always use the shared schemas. Shared response schema requested from WT-00.
const handoff = z.strictObject({ id: idSchema, scope: scopeSchema, revision: count, taskId: idSchema,
  generation: count, principalId: idSchema, eventIds: z.array(idSchema), state: z.enum(["pending", "claimed", "acknowledged", "cancelled"]),
  claim: z.strictObject({ owner: idSchema, leaseUntil: count, fence: count, generation: count }).nullable(), createdAt: count });
const failure = z.strictObject({ version: z.literal(1), ok: z.literal(false), error: z.strictObject({ code: z.string().regex(/^[A-Z_]+$/).max(80), requestId: idSchema.optional() }) });
export function validateResponse(input: unknown, request: LocalRequest): CliResponse {
  if (input && typeof input === "object" && "ok" in input && input.ok === false) return failure.parse(input);
  const schema = request.method === "capabilities" ? z.array(capabilitySchema) : request.method === "diagnostics" ?
    z.strictObject({ ready: z.boolean(), activation: z.enum(["enabled", "disabled"]) }) : request.method === "work.list" ?
    z.strictObject({ work: z.array(handoff) }) : request.method.startsWith("work.") ?
    z.strictObject({ handoff, events: z.array(incomingEventSchema) }) : resultSchema;
  return z.strictObject({ version: z.literal(1), ok: z.literal(true), result: schema }).parse(input);
}
async function privateDirectory(path: string): Promise<void> {
  const s = await lstat(path);
  if (!s.isDirectory() || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o700) throw new CliError("PRIVATE_DIRECTORY_REQUIRED", 4);
}
async function credential(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new CliError("INVALID_CONFIGURATION", 2);
  await privateDirectory(dirname(path));
  const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await f.stat();
    if (!s.isFile() || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o600 || s.size > 65) throw new CliError("INVALID_CREDENTIAL_FILE", 4);
    const token = (await f.readFile("utf8")).trim();
    if (!/^[a-fA-F0-9]{64}$/.test(token)) throw new CliError("INVALID_CREDENTIAL_FILE", 4);
    return token;
  } finally { await f.close(); }
}
export async function callRuntime(request: LocalRequest, config: { socket: string; credentialFile: string; timeoutMs?: number }): Promise<CliResponse> {
  let token: string;
  try {
    if (!isAbsolute(config.socket)) throw new CliError("INVALID_CONFIGURATION", 2);
    token = await credential(config.credentialFile);
    await privateDirectory(dirname(config.socket));
    const s = await lstat(config.socket);
    if (!s.isSocket() || s.uid !== process.getuid?.() || (s.mode & 0o777) !== 0o600) throw new CliError("INVALID_SOCKET", 4);
  } catch (e) { if (e instanceof CliError) throw e; throw new CliError("HOST_UNAVAILABLE", 3); }
  const frame = Buffer.from(JSON.stringify({ token, request }) + "\n");
  if (frame.length > MAX_REQUEST_BYTES) throw new CliError("INPUT_TOO_LARGE", 2);
  return new Promise((resolve, reject) => {
    const socket = connect(config.socket);
    let buffer = Buffer.alloc(0), sent = false;
    const fail = (code: string, exitCode: number) => { clearTimeout(timer); socket.destroy(); reject(new CliError(code, exitCode)); };
    const timer = setTimeout(() => fail(sent ? "TRANSPORT_UNCERTAIN" : "HOST_UNAVAILABLE", sent ? 6 : 3), config.timeoutMs ?? 5000);
    socket.on("connect", () => { sent = true; socket.write(frame); });
    socket.on("error", () => fail(sent ? "TRANSPORT_UNCERTAIN" : "HOST_UNAVAILABLE", sent ? 6 : 3));
    socket.on("data", chunk => {
      if (buffer.length + chunk.length > 4 * 1024 * 1024) return fail("INVALID_HOST_RESPONSE", 6);
      buffer = Buffer.concat([buffer, chunk]);
    });
    socket.on("end", () => {
      clearTimeout(timer);
      try {
        const body = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        if (!body.endsWith("\n") || body.slice(0, -1).includes("\n") || body.includes(token)) throw new Error();
        resolve(validateResponse(JSON.parse(body), request));
      } catch { fail("INVALID_HOST_RESPONSE", 6); }
    });
  });
}

/** Retained for callers compiled against the earlier WT-08 function name. */
export const localRequest = callRuntime;
