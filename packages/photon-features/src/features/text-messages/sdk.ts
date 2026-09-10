import type { Message, Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import {
  sameScope,
  type Scope,
  type TrustedContext,
  type Action,
  type ExecutionServices,
  type ContentCompiler,
  type ContentSpec,
} from "../../index.js";
import { requireThat, FeatureError } from "./errors.js";
export interface Binding {
  scope: Scope;
  phone: string;
  nativeSpaceId: string;
}
/** Host callbacks are trusted configuration, never action JSON. No client is created here. */
export interface TextMessageOptions {
  binding(context: TrustedContext): Binding;
  requestId(action: Action, services: ExecutionServices): string;
  compilers?: () => readonly ContentCompiler[];
}
export function checkSpace(
  space: Space,
  services: ExecutionServices,
  options: TextMessageOptions,
): void {
  const binding = options.binding(services.context);
  requireThat(
    sameScope(binding.scope, services.context.scope),
    "SCOPE_MISMATCH",
    "Host binding scope mismatch.",
  );
  requireThat(
    space.__platform === "imessage",
    "UNSUPPORTED",
    "Only the pinned cloud iMessage provider is supported.",
  );
  requireThat(
    space.id === binding.nativeSpaceId &&
      imessage(space).phone === binding.phone,
    "SCOPE_MISMATCH",
    "SDK conversation or serving line does not match the trusted binding.",
  );
}
export function checkMessage(
  message: Message,
  services: ExecutionServices,
  options: TextMessageOptions,
): void {
  requireThat(
    message.platform === "imessage",
    "UNSUPPORTED",
    "Target must be a cloud iMessage message.",
  );
  checkSpace(message.space, services, options);
  requireThat(
    message.direction === "inbound" || message.direction === "outbound",
    "FORBIDDEN",
    "Target direction is unavailable.",
  );
}
export const tapbacks = {
  love: "❤️",
  like: "👍",
  dislike: "👎",
  laugh: "😂",
  emphasize: "‼️",
  question: "❓",
} as const;

import { createHash } from "node:crypto";
import type { ContentInput } from "spectrum-ts";
import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import type { ProviderContext } from "../../contracts/transport.js";
import type { ResourceResolver } from "../../contracts/ports.js";
import type { OperationResult as PublicResult } from "../../contracts/results.js";
import type { ResourceRef } from "../../contracts/references.js";
/** Adapter for the shared compiler registry while its legacy signature is migrated by integration. */
export interface PublicContentCompiler {
  family: ContentSpec["type"];
  compile(spec: ContentSpec, services: PublicServices): Promise<ContentInput>;
}
/** Trusted host configuration. Reuse the one existing SDK owner and authoritative handle resolver. */
export interface PublicTextMessageOptions {
  provider: ProviderContext;
  binding(context: TrustedContext): Binding;
  resources: Pick<ResourceResolver, "space" | "message">;
  compilers?: () => readonly PublicContentCompiler[];
}
export function digestTextInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
/** Stable parent identity; executeChild additionally scopes child keys to the runtime request. */
export function textResult(action: Action, s: PublicServices): PublicResult {
  return {
    version: 1,
    requestId: digestTextInput([
      s.context.scope,
      s.context.taskId,
      s.context.generation,
      s.context.principalId,
      action.idempotencyKey,
    ]),
    status: "executor-completed",
    revision: 0,
    updatedAt: s.clock.now(),
    references: [],
    observations: [],
  };
}
export function assertTextProvider(
  s: PublicServices,
  o: PublicTextMessageOptions,
): void {
  s.assertActiveClaim();
  requireThat(
    o.provider.provider === "imessage" &&
      sameScope(o.provider.scope, s.context.scope),
    "SCOPE_MISMATCH",
    "Provider scope differs from the authorized context.",
  );
  requireThat(
    o.provider.ready(),
    "UNAVAILABLE",
    "The existing provider owner is unavailable.",
  );
  requireThat(
    sameScope(o.binding(s.context).scope, s.context.scope),
    "SCOPE_MISMATCH",
    "Binding scope differs from context.",
  );
}
/** Check native chat and serving phone as well as the logical scope. */
export function checkPublicSpace(
  space: Space,
  s: PublicServices,
  o: PublicTextMessageOptions,
): void {
  assertTextProvider(s, o);
  const b = o.binding(s.context);
  requireThat(
    space.__platform === "imessage",
    "UNSUPPORTED",
    "Cloud iMessage is required.",
  );
  requireThat(
    space.id === b.nativeSpaceId && imessage(space).phone === b.phone,
    "SCOPE_MISMATCH",
    "Wrong SDK chat or serving phone.",
  );
}
/** Capture actual SDK-returned handles only; void results never create replacement IDs. */
export function mapTextMessageOperation(
  action: Action,
  s: PublicServices,
  o: PublicTextMessageOptions,
  returned: Message | Message[] | void,
  reactionParent?: string,
): PublicResult {
  const result = textResult(action, s);
  const envelopes =
    returned === undefined
      ? []
      : Array.isArray(returned)
        ? returned
        : [returned];
  // Spectrum returns grouped member handles inside a single group envelope. Preserve their real IDs
  // after the opaque call completes without claiming per-member dispatch/recovery checkpoints.
  const messages = envelopes.flatMap((message) => {
    checkPublicSpace(message.space, s, o);
    requireThat(
      message.platform === "imessage" && message.direction === "outbound",
      "SCOPE_MISMATCH",
      "SDK returned an invalid envelope.",
    );
    return message.content.type === "group" ? message.content.items : [message];
  });
  requireThat(
    messages.length <= 128,
    "UNSUPPORTED",
    "SDK returned too many message handles.",
  );
  for (const message of messages) {
    checkPublicSpace(message.space, s, o);
    requireThat(
      message.platform === "imessage" &&
        message.direction === "outbound" &&
        !!message.id,
      "SCOPE_MISMATCH",
      "SDK returned an invalid outbound handle.",
    );
    if (reactionParent) {
      requireThat(
        message.content.type === "reaction",
        "UNSUPPORTED",
        "SDK did not return an actual reaction handle.",
      );
      const parent = s.transaction((unit) =>
        unit.get("references", reactionParent),
      );
      checkPublicSpace(message.content.target.space, s, o);
      requireThat(
        parent &&
          sameScope(parent.scope, s.context.scope) &&
          parent.providerId === message.content.target.id &&
          message.content.target.platform === "imessage",
        "SCOPE_MISMATCH",
        "SDK returned a reaction to another parent.",
      );
    }
    const id = digestTextInput([
      s.context.scope,
      message.id,
      reactionParent ?? "message",
    ]);
    const ref: ResourceRef = reactionParent
      ? {
          version: 1,
          kind: "reaction",
          id,
          scope: s.context.scope,
          messageId: reactionParent,
        }
      : { version: 1, kind: "message", id, scope: s.context.scope };
    s.transaction((unit) => {
      const prior = unit.get("references", id);
      if (prior)
        requireThat(
          prior.providerId === message.id &&
            prior.ownedByPrincipalId === s.context.principalId,
          "FORBIDDEN",
          "Returned resource conflicts with its stored owner.",
        );
      else
        unit.put(
          "references",
          {
            id,
            reference: ref,
            scope: ref.scope,
            providerId: message.id,
            ownedByPrincipalId: s.context.principalId,
            taskId: s.context.taskId,
            generation: s.context.generation,
            revision: 0,
          },
          null,
        );
    });
    result.references.push(ref);
  }
  if (messages.length) {
    result.status = "provider-accepted";
    result.observations.push({
      kind: "accepted",
      source: "sdk-return",
      at: s.clock.now(),
    });
  } else result.value = { type: "void" };
  return result;
}
/** Consequential calls cross exactly one shared child boundary. Unknown outcomes belong to that runtime. */
export async function executeTextChild(
  action: Action,
  s: PublicServices,
  o: PublicTextMessageOptions,
  index: number,
  input: unknown,
  dispatch: () => Promise<Message | Message[] | void>,
  reactionParent?: string,
): Promise<PublicResult> {
  s.assertActiveClaim();
  return s.executeChild({
    index,
    key: `${textResult(action, s).requestId}:${index}`,
    argumentsDigest: digestTextInput([
      action.operation,
      action.arguments,
      input,
    ]),
    dispatch: async (signal) => {
      s.assertActiveClaim();
      if (signal.aborted) throw new Error("CANCELLED");
      return mapTextMessageOperation(
        action,
        s,
        o,
        await dispatch(),
        reactionParent,
      );
    },
  });
}

/** Preserve already-recorded child progress when a later pre-dispatch check fails. */
export function textFailure(base: PublicResult, error: unknown): PublicResult {
  const allowed = [
    "SCOPE_MISMATCH",
    "STALE_FENCE",
    "STALE_GENERATION",
    "CANCELLED",
    "FORBIDDEN",
    "RESOURCE_NOT_FOUND",
    "IDEMPOTENCY_CONFLICT",
    "CONTEXT_EXPIRED",
    "CONTEXT_REVOKED",
  ];
  const code: NonNullable<PublicResult["error"]>["code"] =
    error instanceof FeatureError
      ? error.code
      : error instanceof Error && allowed.includes(error.message)
        ? (error.message as NonNullable<PublicResult["error"]>["code"])
        : error instanceof Error &&
            (error.name === "ZodError" ||
              /^(NON_JSON_|CYCLIC_JSON|CONTENT_TOO_DEEP|REQUEST_TOO_LARGE)/.test(
                error.message,
              ))
          ? "INVALID_REQUEST"
          : "UNAVAILABLE";
  return {
    ...base,
    status:
      code === "CANCELLED"
        ? "cancelled"
        : code === "UNKNOWN_OUTCOME"
          ? "unknown-outcome"
          : ["UNSUPPORTED", "UNAVAILABLE", "RESOURCE_NOT_FOUND"].includes(code)
            ? "blocked"
            : "failed",
    error: {
      code,
      message: "WT-03 validation or authoritative resource resolution failed.",
      retry: code === "UNKNOWN_OUTCOME" ? "reconcile-first" : "never",
    },
  };
}
