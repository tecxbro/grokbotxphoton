import { createServer, type Socket } from "node:net";
import { lstat, chmod } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import {
  localRequestSchema,
  principalSchema,
  capabilitySchema,
  assertJsonData,
  MAX_REQUEST_BYTES,
  type AuthenticatedPrincipal,
  type Capability,
  type TrustedContext,
} from "../../contracts/index.js";
import type { SubmissionPort } from "../../host/protocol.js";
import { DurableContexts } from "./authorization.js";
import { DurableWork } from "./work-handoff.js";
import { admitRequest } from "./admission.js";
import { publicError, RuntimeFault } from "./errors.js";
export interface RuntimeProtocolServices {
  contexts: DurableContexts;
  submission: SubmissionPort;
  work: DurableWork;
  capabilities(context: TrustedContext): Capability[];
  diagnostics(): { ready: boolean; activation: "disabled" | "enabled" };
}
export class DurableLocalProtocol {
  constructor(private readonly services: RuntimeProtocolServices) {}
  async dispatch(
    input: unknown,
    principal: AuthenticatedPrincipal,
  ): Promise<unknown> {
    try {
      let request: ReturnType<typeof localRequestSchema.parse>;
      try {
        assertJsonData(input, MAX_REQUEST_BYTES);
        request = localRequestSchema.parse(input);
        principalSchema.parse(principal);
      } catch {
        throw new RuntimeFault("INVALID_REQUEST");
      }
      const s = this.services,
        c = await s.contexts.resolve(
          principal,
          request.method === "submit"
            ? request.action.contextId
            : request.contextId,
        );
      let result: unknown;
      switch (request.method) {
        case "submit":
          result = await s.submission.submit(admitRequest(request.action), c);
          break;
        case "status":
          result = await s.submission.status(request.requestId, c);
          break;
        case "request.cancel":
          result = await s.submission.cancel(request.requestId, c);
          break;
        case "capabilities":
          result = s
            .capabilities(c)
            .filter((cap) =>
              c.permissions.includes(
                cap.operation as (typeof c.permissions)[number],
              ),
            )
            .map((cap) => capabilitySchema.parse(cap));
          break;
        case "diagnostics": {
          const d = s.diagnostics();
          result = {
            ready: d.ready === true,
            activation: d.activation === "enabled" ? "enabled" : "disabled",
          };
          break;
        }
        case "work.list":
          result = { work: s.work.list(c, request.limit) };
          break;
        case "work.claim":
          result = s.work.change(
            c,
            request.handoffId,
            "claim",
            undefined,
            request.leaseMs,
          );
          break;
        case "work.heartbeat":
          result = s.work.change(
            c,
            request.handoffId,
            "heartbeat",
            request.fence,
            request.leaseMs,
          );
          break;
        case "work.ack":
          result = s.work.change(c, request.handoffId, "ack", request.fence);
          break;
      }
      return { version: 1, ok: true, result };
    } catch (e) {
      return {
        version: 1,
        ok: false,
        error: { code: publicError(e).code, requestId: randomUUID() },
      };
    }
  }
}
export interface LocalCredential {
  token: string;
  principal: AuthenticatedPrincipal;
}
/** Build the frozen local protocol over one authenticated private Unix-domain socket. */
export function createLocalServer(options: {
  path: string;
  credentials: readonly LocalCredential[];
  services: RuntimeProtocolServices;
}): Promise<{ close(): Promise<void> }> {
  return listenDurableLocal(
    options.path,
    options.credentials,
    new DurableLocalProtocol(options.services),
  );
}
/** Same OS user is one trust domain. No peer PID identity or hostile same-user isolation is claimed. */
export async function listenDurableLocal(
  path: string,
  inputCredentials: readonly LocalCredential[],
  protocol: DurableLocalProtocol,
): Promise<{ close(): Promise<void> }> {
  if (!isAbsolute(path)) throw new Error("ABSOLUTE_SOCKET_PATH_REQUIRED");
  const dir = await lstat(dirname(path));
  if (
    !dir.isDirectory() ||
    dir.isSymbolicLink() ||
    dir.uid !== process.getuid?.() ||
    (dir.mode & 0o777) !== 0o700
  )
    throw new Error("PRIVATE_DIRECTORY_REQUIRED");
  const credentials = inputCredentials.map((c) => ({
    token: c.token,
    principal: principalSchema.parse(c.principal),
  }));
  if (
    !credentials.length ||
    credentials.some(
      (c) =>
        !/^[a-fA-F0-9]{64}$/.test(c.token) || c.principal.osUid !== dir.uid,
    ) ||
    new Set(credentials.map((c) => c.token)).size !== credentials.length
  )
    throw new Error("INVALID_LOCAL_CREDENTIAL");
  try {
    await lstat(path);
    throw new Error("SOCKET_PATH_EXISTS");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    if (sockets.size >= 64) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    const timeout = setTimeout(() => socket.destroy(), 5000);
    timeout.unref();
    socket.on("close", () => {
      clearTimeout(timeout);
      sockets.delete(socket);
    });
    socket.on("error", () => socket.destroy());
    let buffer = Buffer.alloc(0),
      handled = false;
    socket.on("data", (chunk) => {
      if (handled) return;
      if (buffer.length + chunk.length > MAX_REQUEST_BYTES) {
        socket.destroy();
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf(10);
      if (end < 0) return;
      handled = true;
      socket.pause();
      void (async () => {
        try {
          if (end !== buffer.length - 1) throw new Error();
          const frame = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              buffer.subarray(0, end),
            ),
          ) as { token?: unknown; request?: unknown };
          if (
            !frame ||
            typeof frame !== "object" ||
            Array.isArray(frame) ||
            Object.keys(frame).length !== 2 ||
            !("request" in frame) ||
            typeof frame.token !== "string" ||
            !("token" in frame)
          )
            throw new Error();
          const supplied = Buffer.from(frame.token);
          let selected: LocalCredential | undefined;
          for (const c of credentials) {
            const expected = Buffer.from(c.token);
            if (
              expected.length === supplied.length &&
              timingSafeEqual(expected, supplied)
            )
              selected = c;
          }
          if (!selected) throw new Error();
          const response = await protocol.dispatch(
            frame.request,
            selected.principal,
          );
          let encoded = JSON.stringify(response);
          for (const c of credentials)
            encoded = encoded.split(c.token).join("[REDACTED]");
          if (Buffer.byteLength(encoded) > MAX_REQUEST_BYTES)
            encoded = JSON.stringify({
              version: 1,
              ok: false,
              error: { code: "UNAVAILABLE", requestId: randomUUID() },
            });
          socket.end(encoded + "\n");
        } catch {
          socket.end(
            JSON.stringify({
              version: 1,
              ok: false,
              error: { code: "UNAUTHENTICATED", requestId: randomUUID() },
            }) + "\n",
          );
        }
      })();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      resolve();
    });
  });
  try {
    await chmod(path, 0o600);
  } catch (e) {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw e;
  }
  let closed = false;
  return {
    close: async () => {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    },
  };
}
