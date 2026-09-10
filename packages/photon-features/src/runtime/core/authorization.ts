import {
  contextSchema,
  sameScope,
  type Action,
  type AuthenticatedPrincipal,
  type ContextResolver,
  type TrustedContext,
  type ResourceRef,
} from "../../contracts/index.js";
import type {
  Transaction,
  TransactionStore,
  OutboxRecord,
} from "../../state/index.js";
import { references, walk } from "./admission.js";
import { canonical } from "./idempotency.js";
import { fault } from "./errors.js";
import { admitRequest } from "./admission.js";
const admin = new Set([
  "space.create",
  "space.rename",
  "space.addMembers",
  "space.removeMembers",
  "space.leave",
  "space.setAvatar",
  "space.clearAvatar",
  "space.setBackground",
  "space.clearBackground",
  "account.shareContact",
]);
export interface AuthorizationPolicy {
  /** Synchronous authoritative host policy. No network or model-supplied authorized flag. */
  administrativeIntent(context: TrustedContext, action: Action): boolean;
  recipientsAllowed(
    context: TrustedContext,
    recipients: readonly string[],
  ): boolean;
}
/** Resolve authority from the authenticated transport principal, then authorize the admitted action. */
export async function resolveAndAuthorizeContext(
  contexts: DurableContexts,
  principal: AuthenticatedPrincipal,
  input: unknown,
): Promise<{ action: Action; context: TrustedContext }> {
  const action = admitRequest(input);
  const context = await contexts.resolve(principal, action.contextId);
  await contexts.authorize(context, action);
  return { action, context };
}
export class DurableContexts implements ContextResolver {
  constructor(
    readonly store: TransactionStore,
    readonly clock: { now(): number },
    private readonly policy?: AuthorizationPolicy,
  ) {}
  current(
    tx: Transaction,
    principalId: string,
    contextId: string,
  ): TrustedContext {
    const record = tx.get("contexts", contextId);
    if (!record) return fault("FORBIDDEN");
    const c = contextSchema.parse(record.context);
    if (
      c.contextId !== record.id ||
      c.principalId !== principalId ||
      !sameScope(record.scope, c.scope)
    )
      return fault("FORBIDDEN");
    if (c.revokedAt !== null) return fault("CONTEXT_REVOKED");
    if (c.issuedAt > this.clock.now() || c.expiresAt <= this.clock.now())
      return fault("CONTEXT_EXPIRED");
    const task = tx.get("tasks", c.taskId);
    if (
      !task ||
      task.principalId !== principalId ||
      !sameScope(task.scope, c.scope)
    )
      return fault("FORBIDDEN");
    if (task.generation !== c.generation) return fault("STALE_GENERATION");
    if (task.cancelledAt !== null) return fault("CANCELLED");
    return c;
  }
  refresh(tx: Transaction, supplied: TrustedContext): TrustedContext {
    const c = this.current(tx, supplied.principalId, supplied.contextId);
    if (
      c.taskId !== supplied.taskId ||
      c.generation !== supplied.generation ||
      !sameScope(c.scope, supplied.scope)
    )
      fault("STALE_GENERATION");
    return c;
  }
  async resolve(
    principal: AuthenticatedPrincipal,
    contextId: string,
  ): Promise<TrustedContext> {
    return this.store.transaction((tx) =>
      this.current(tx, principal.id, contextId),
    );
  }
  async authorize(context: TrustedContext, action: Action): Promise<void> {
    this.store.transaction((tx) => this.action(tx, context, action));
  }
  action(
    tx: Transaction,
    supplied: TrustedContext,
    action: Action,
  ): TrustedContext {
    const c = this.refresh(tx, supplied);
    if (
      action.contextId !== c.contextId ||
      !c.permissions.includes(action.operation)
    )
      fault("FORBIDDEN");
    if (
      admin.has(action.operation) &&
      !this.policy?.administrativeIntent(c, action)
    )
      fault("FORBIDDEN");
    if (
      "members" in action.arguments &&
      !this.policy?.recipientsAllowed(c, action.arguments.members)
    )
      fault("FORBIDDEN");
    for (const ref of references(action)) this.reference(tx, c, ref);
    walk(action.arguments, (v) => {
      if ("stagingId" in v) {
        const m = tx.get("stagedMedia", String(v.stagingId));
        if (
          !m ||
          m.principalId !== c.principalId ||
          m.taskId !== c.taskId ||
          m.generation !== c.generation ||
          !sameScope(m.scope, c.scope) ||
          m.expiresAt <= this.clock.now() ||
          m.sha256 !== v.sha256 ||
          m.bytes !== v.bytes ||
          m.mimeType !== v.mimeType
        )
          fault("MEDIA_REJECTED");
      }
    });
    return c;
  }
  reference(tx: Transaction, c: TrustedContext, ref: ResourceRef): void {
    if (!sameScope(ref.scope, c.scope)) fault("SCOPE_MISMATCH");
    const row = tx.get("references", ref.id);
    if (
      !row ||
      row.ownedByPrincipalId !== c.principalId ||
      row.taskId !== c.taskId ||
      row.generation !== c.generation ||
      !sameScope(row.scope, c.scope) ||
      canonical(row.reference) !== canonical(ref)
    )
      fault("RESOURCE_NOT_FOUND");
    if (ref.kind === "space" && ref.id !== c.scope.spaceId)
      fault("SCOPE_MISMATCH");
    if (ref.kind === "stream") {
      const s = tx.get("streams", ref.id);
      if (
        !s ||
        s.state !== "registered" ||
        s.principalId !== c.principalId ||
        s.taskId !== c.taskId ||
        canonical(s.reference) !== canonical(ref) ||
        ref.generation !== c.generation ||
        ref.expiresAt <= this.clock.now()
      )
        fault("STALE_GENERATION");
    }
    if (ref.kind === "card-session") {
      const s = tx.get("sessions", ref.id);
      if (
        !s ||
        s.generation !== c.generation ||
        s.expiresAt <= this.clock.now() ||
        canonical(s.reference) !== canonical(ref)
      )
        fault("CONTEXT_EXPIRED");
    }
    const parent =
      "messageId" in ref
        ? ref.messageId
        : "pollId" in ref
          ? ref.pollId
          : "cardId" in ref
            ? ref.cardId
            : undefined;
    if (parent) {
      const p = tx.get("references", parent);
      const kind =
        "messageId" in ref ? "message" : "pollId" in ref ? "poll" : "card";
      if (
        !p ||
        p.reference.kind !== kind ||
        p.ownedByPrincipalId !== c.principalId ||
        p.taskId !== c.taskId ||
        p.generation !== c.generation ||
        !sameScope(p.scope, c.scope)
      )
        fault("RESOURCE_NOT_FOUND");
    }
  }
  owned(tx: Transaction, id: string, supplied: TrustedContext): OutboxRecord {
    const c = this.refresh(tx, supplied),
      row = tx.get("outbox", id);
    if (
      !row ||
      row.principalId !== c.principalId ||
      row.taskId !== c.taskId ||
      row.generation !== c.generation ||
      !sameScope(row.scope, c.scope)
    )
      return fault("RESOURCE_NOT_FOUND");
    if (!c.permissions.includes(row.action.operation)) fault("FORBIDDEN");
    return row;
  }
}
