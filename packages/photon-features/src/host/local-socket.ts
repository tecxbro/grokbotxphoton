import { createServer, type Server, type Socket } from "node:net";
import { lstat, chmod, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { timingSafeEqual } from "node:crypto";
import {
  MAX_REQUEST_BYTES,
  type AuthenticatedPrincipal,
} from "../contracts/index.js";
import type { LocalProtocol } from "./protocol.js";
export interface LocalCredential {
  token: string;
  principal: AuthenticatedPrincipal;
}
/** Explicitly invoked by WT-08 activation. No TCP/public command listener exists. */
export async function listenLocal(
  path: string,
  credentials: readonly LocalCredential[],
  protocol: LocalProtocol,
): Promise<{ close(): Promise<void> }> {
  const dir = await lstat(dirname(path));
  if (
    !dir.isDirectory() ||
    dir.isSymbolicLink() ||
    dir.uid !== process.getuid?.() ||
    (dir.mode & 0o077) !== 0
  )
    throw new Error("PRIVATE_DIRECTORY_REQUIRED");
  if (
    !credentials.length ||
    credentials.some(
      (c) => !/^\w{64,}$/.test(c.token) || c.principal.osUid !== dir.uid,
    )
  )
    throw new Error("INVALID_LOCAL_CREDENTIAL");
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setTimeout(5000, () => socket.destroy());
    let buffer = Buffer.alloc(0);
    let handled = false;
    socket.on("data", (chunk) => {
      if (handled) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_REQUEST_BYTES) {
        socket.destroy();
        return;
      }
      const end = buffer.indexOf(10);
      if (end < 0) return;
      handled = true;
      socket.pause();
      void (async () => {
        try {
          const frame = JSON.parse(
            buffer.subarray(0, end).toString("utf8"),
          ) as { token?: unknown; request?: unknown };
          if (
            !frame ||
            typeof frame !== "object" ||
            Object.keys(frame).some((k) => k !== "token" && k !== "request") ||
            typeof frame.token !== "string"
          )
            throw new Error("UNAUTHENTICATED");
          const supplied = Buffer.from(frame.token);
          const credential = credentials.find((c) => {
            const expected = Buffer.from(c.token);
            return (
              expected.length === supplied.length &&
              timingSafeEqual(expected, supplied)
            );
          });
          if (!credential) throw new Error("UNAUTHENTICATED");
          socket.end(
            JSON.stringify(
              await protocol.dispatch(frame.request, credential.principal),
            ) + "\n",
          );
        } catch {
          socket.end(
            JSON.stringify({
              version: 1,
              ok: false,
              error: { code: "UNAUTHENTICATED" },
            }) + "\n",
          );
        }
      })();
    });
  });
  // Refuse existing paths. Never unlink an unknown socket or file.
  try {
    await lstat(path);
    throw new Error("SOCKET_PATH_EXISTS");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
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
    server.close();
    throw e;
  }
  return {
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await unlink(path).catch((e) => {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      });
    },
  };
}
