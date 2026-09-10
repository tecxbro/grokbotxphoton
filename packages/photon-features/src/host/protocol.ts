import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  localRequestSchema,
  parseAction,
  sameScope,
  type AuthenticatedPrincipal,
  type TrustedContext,
  type ContextResolver,
  type Clock,
  type Action,
  type OperationResult,
  type Capability,
  type IncomingEvent,
} from "../contracts/index.js";
import type { HandoffRecord, TransactionStore } from "../state/index.js";
export interface SubmissionPort {
  submit(action: Action, context: TrustedContext): Promise<OperationResult>;
  status(requestId: string, context: TrustedContext): Promise<OperationResult>;
  cancel(requestId: string, context: TrustedContext): Promise<OperationResult>;
}
export interface ProtocolServices {
  contexts: ContextResolver;
  store: TransactionStore;
  clock: Clock;
  submission: SubmissionPort;
  capabilities(context: TrustedContext): Capability[];
  diagnostics(): { ready: boolean; activation: "disabled" | "enabled" };
}
export type LocalResponse =
  | {
      version: 1;
      ok: true;
      result:
        | OperationResult
        | Capability[]
        | { ready: boolean; activation: "disabled" | "enabled" }
        | { work: HandoffRecord[] }
        | { handoff: HandoffRecord; events: IncomingEvent[] };
    }
  | { version: 1; ok: false; error: { code: string; requestId: string } };
/** The socket authenticator supplies principal. It is never read from request JSON. */
export class LocalProtocol {
  constructor(private readonly services: ProtocolServices) {}
  async dispatch(
    input: unknown,
    principal: AuthenticatedPrincipal,
  ): Promise<LocalResponse> {
    try {
      const req = localRequestSchema.parse(input);
      const contextId =
        req.method === "submit" ? req.action.contextId : req.contextId;
      const s = this.services;
      const c = await s.contexts.resolve(principal, contextId);
      const now = s.clock.now();
      if (c.contextId !== contextId || c.principalId !== principal.id)
        throw new Error("FORBIDDEN");
      if (c.revokedAt !== null) throw new Error("CONTEXT_REVOKED");
      if (c.expiresAt <= now || c.issuedAt > now)
        throw new Error("CONTEXT_EXPIRED");
      const ok = (
        result: Extract<LocalResponse, { ok: true }>["result"],
      ): LocalResponse => ({ version: 1, ok: true, result });
      if (req.method === "submit") {
        const action = parseAction(req.action);
        if (!c.permissions.includes(action.operation))
          throw new Error("FORBIDDEN");
        await s.contexts.authorize(c, action);
        return ok(await s.submission.submit(action, c));
      }
      if (req.method === "status")
        return ok(await s.submission.status(req.requestId, c));
      if (req.method === "request.cancel")
        return ok(await s.submission.cancel(req.requestId, c));
      if (req.method === "capabilities") return ok(s.capabilities(c));
      if (req.method === "diagnostics") return ok(s.diagnostics());
      const visible = (h: HandoffRecord) =>
        h.principalId === principal.id &&
        h.taskId === c.taskId &&
        h.generation === c.generation &&
        sameScope(h.scope, c.scope);
      if (req.method === "work.list")
        return ok({
          work: s.store.transaction((tx) =>
            tx.listWork(
              c.scope,
              principal.id,
              c.taskId,
              c.generation,
              now,
              req.limit,
            ),
          ),
        });
      return ok(
        s.store.transaction((tx) => {
          const h = tx.get("handoffs", req.handoffId);
          if (!h || !visible(h)) throw new Error("RESOURCE_NOT_FOUND");
          if (h.state === "acknowledged" || h.state === "cancelled")
            throw new Error("CANCELLED");
          if (req.method === "work.claim") {
            if (h.claim && h.claim.leaseUntil > now)
              throw new Error("UNAVAILABLE");
            h.claim = {
              owner: principal.id,
              leaseUntil: now + req.leaseMs,
              fence: h.revision + 1,
              generation: c.generation,
            };
            h.state = "claimed";
          } else {
            if (
              !h.claim ||
              h.claim.owner !== principal.id ||
              h.claim.fence !== req.fence ||
              h.claim.generation !== c.generation ||
              h.claim.leaseUntil <= now
            )
              throw new Error("STALE_FENCE");
            if (req.method === "work.ack") h.state = "acknowledged";
            else h.claim.leaseUntil = now + req.leaseMs;
          }
          const old = h.revision;
          h.revision++;
          tx.put("handoffs", h, old);
          const events = h.eventIds.map((id) => {
            const e = tx.get("inbox", id);
            if (!e || !sameScope(e.scope, c.scope))
              throw new Error("RESOURCE_NOT_FOUND");
            return e.event;
          });
          return { handoff: h, events };
        }),
      );
    } catch (e) {
      const known = [
        "FORBIDDEN",
        "CONTEXT_EXPIRED",
        "CONTEXT_REVOKED",
        "RESOURCE_NOT_FOUND",
        "CANCELLED",
        "UNAVAILABLE",
        "STALE_FENCE",
        "UNIMPLEMENTED",
      ];
      return {
        version: 1,
        ok: false,
        error: {
          code:
            e instanceof z.ZodError
              ? "INVALID_REQUEST"
              : e instanceof Error && known.includes(e.message)
                ? e.message
                : e instanceof Error &&
                    [
                      "POLL_OPTION_MISMATCH",
                      "CARD_SESSION_MISMATCH",
                      "DUPLICATE_OPTION",
                    ].includes(e.message)
                  ? "INVALID_REQUEST"
                  : "INTERNAL",
          requestId: randomUUID(),
        },
      };
    }
  }
}
