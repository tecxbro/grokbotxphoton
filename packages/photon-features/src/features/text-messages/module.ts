import {
  parseAction,
  sameScope,
  type Action,
  type Capability,
  type ContentSpec,
  type FeatureModule,
  type OperationResult,
  type RuntimeError,
} from "../../index.js";
import { createCompilers, validateContent } from "./composition.js";
import { executeMessageAction } from "./actions.js";
import { FeatureError } from "./errors.js";
import { codecId, Journal } from "./journal.js";
import { targetSpace } from "./targets.js";
import { bufferStream } from "./streaming.js";
import { formatProse } from "./voice-policy.js";
import type { TextMessageOptions } from "./sdk.js";
export type { TextMessageOptions, Binding } from "./sdk.js";
export const ownedOperations = [
  "text.send",
  "text.stream",
  "markdown.send",
  "link.send",
  "content.group",
  "content.compose",
  "message.get",
  "message.reply",
  "message.react",
  "reaction.remove",
  "message.edit",
  "message.unsend",
  "message.markRead",
] as const;
export function textCapabilities(): Capability[] {
  return ownedOperations.map((operation) => ({
    operation,
    providerSupport: operation === "text.stream" ? "fallback" : "native",
    availability: {
      account: "unknown",
      conversation: "unknown",
      checkedAt: null,
    },
    implementation: "implemented",
    direction: { inbound: "not-applicable", outbound: "implemented" },
    evidence: [],
    sdkVersion: "12.8.0",
    sources: [
      "npm:spectrum-ts@12.8.0",
      "npm:@spectrum-ts/imessage@12.8.0",
      "docs/photon-features/evidence/wt-03/sources.json",
    ],
    blockers: [
      "Host registration, authoritative bindings and resource adapters require integration.",
      ...(operation === "text.stream"
        ? [
            "This implementation buffers validated text before one send; it does not progressively deliver.",
          ]
        : []),
      ...(operation === "link.send"
        ? [
            "Only URL input is supported; native preview rendering is not confirmed by SDK return.",
          ]
        : []),
      ...(operation === "message.markRead"
        ? [
            "Provider marks the entire conversation read, not an individual message.",
          ]
        : []),
    ],
  }));
}
export function createTextMessageModule(
  options: TextMessageOptions,
): FeatureModule {
  const compilers = createCompilers(options),
    compiler = compilers[0]!;
  return {
    id: "text-messages",
    lane: "wt-03",
    mode: "production",
    compilers,
    reducers: [],
    capabilities: textCapabilities(),
    recoveryCodecs: [
      {
        id: codecId,
        version: 1,
        validate: (value) =>
          typeof value === "object" &&
          value !== null &&
          "requestId" in value &&
          typeof value.requestId === "string",
        reconcile: async (checkpoint, s) => {
          if (
            !checkpoint ||
            typeof checkpoint !== "object" ||
            !("requestId" in checkpoint) ||
            typeof checkpoint.requestId !== "string"
          )
            return "unknown";
          // Individual completed children are skipped by Journal; no blind global replay is authorized here.
          return s.transactions.transaction((tx) => {
            const parent = tx.get("outbox", checkpoint.requestId as string);
            return parent?.result.status === "executor-completed" &&
              sameScope(parent.scope, s.context.scope) &&
              parent.generation === s.context.generation &&
              parent.taskId === s.context.taskId &&
              parent.principalId === s.context.principalId
              ? "completed"
              : "unknown";
          });
        },
      },
    ],
    handlers: ownedOperations.map((operation) => ({
      operation,
      recoveryCodec: { id: codecId, version: 1 },
      execute: async (input, services) => {
        let journal: Journal | undefined;
        try {
          const action: Action = parseAction(input);
          if (action.operation !== operation)
            throw new FeatureError(
              "INVALID_REQUEST",
              "Wrong handler selected for the operation.",
            );
          journal = new Journal(action, services, options);
          if (!("space" in action.arguments))
            return await executeMessageAction(action, journal, compiler);
          const spaceRef = action.arguments.space;
          if (action.operation === "text.stream") {
            await journal.run(0, 1, action.arguments, async () => {
              const space = await targetSpace(spaceRef, services, options);
              const content = await bufferStream(
                action.arguments.stream,
                journal!,
              );
              return () => space.send(content);
            });
            return {
              ...journal.result(),
              capability: textCapabilities().find(
                (c) => c.operation === operation,
              )!,
            };
          }
          let parts: ContentSpec[];
          switch (action.operation) {
            case "text.send":
              parts = formatProse(action.arguments.text).bubbles.map(
                (value) => ({ type: "text", text: value }),
              );
              break;
            case "markdown.send":
              parts = [{ type: "markdown", text: action.arguments.text }];
              break;
            case "link.send":
              parts = [
                {
                  type: "link",
                  url: action.arguments.url,
                  title: action.arguments.title,
                },
              ];
              break;
            case "content.group":
              parts = [action.arguments.content];
              break;
            case "content.compose":
              validateContent(action.arguments.content);
              parts = action.arguments.content.items;
              break;
            default:
              throw new FeatureError(
                "INVALID_REQUEST",
                "Unexpected operation.",
              );
          }
          parts.forEach(validateContent);
          const prose = parts
            .flatMap((part) => (part.type === "group" ? part.items : [part]))
            .filter(
              (part): part is Extract<ContentSpec, { type: "text" }> =>
                part.type === "text",
            );
          if (prose.length)
            formatProse(prose.map((part) => part.text).join("\n\n"));
          let index = 0;
          for (const part of parts) {
            const count = part.type === "group" ? part.items.length : 1;
            await journal.run(index, count, part, async () => {
              const space = await targetSpace(spaceRef, services, options);
              const content = await compiler.compile(part, services);
              return () => space.send(content);
            });
            index += count;
          }
          return journal.result();
        } catch (error) {
          const recognized =
            error instanceof Error &&
            [
              "SCOPE_MISMATCH",
              "STALE_FENCE",
              "STALE_GENERATION",
              "CANCELLED",
            ].includes(error.message)
              ? (error.message as RuntimeError["code"])
              : undefined;
          const code: RuntimeError["code"] =
            error instanceof FeatureError
              ? error.code
              : (recognized ??
                (error instanceof Error && error.name === "ZodError"
                  ? "INVALID_REQUEST"
                  : "UNAVAILABLE"));
          const status: OperationResult["status"] =
            code === "UNKNOWN_OUTCOME"
              ? "unknown-outcome"
              : code === "CANCELLED"
                ? "cancelled"
                : ["UNAVAILABLE", "UNSUPPORTED", "RESOURCE_NOT_FOUND"].includes(
                      code,
                    )
                  ? "blocked"
                  : "failed";
          return {
            ...(journal?.result(status) ?? {
              version: 1 as const,
              requestId: options.requestId(input, services),
              revision: 0,
              updatedAt: services.clock.now(),
              references: [],
              observations: [],
            }),
            status,
            error: {
              code,
              message:
                error instanceof FeatureError
                  ? error.message
                  : "WT-03 validation or resource resolution failed.",
              retry:
                code === "UNKNOWN_OUTCOME"
                  ? "reconcile-first"
                  : status === "blocked"
                    ? "safe-before-dispatch"
                    : "never",
            },
          };
        }
      },
    })),
  };
}

import { parseActionRequest } from "../../contracts/actions.js";
import type { FeatureModule as PublicFeatureModule } from "../../contracts/feature.js";
import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import {
  assertTextProvider,
  textResult,
  digestTextInput,
  textFailure,
  type PublicTextMessageOptions,
} from "./sdk.js";
import { executeTextOperation } from "./text.js";
import { executeTextStream } from "./streaming.js";
import { executeComposition } from "./composition.js";
import { getMessageTarget } from "./targets.js";
import { contentSchema } from "../../contracts/content.js";
import { imessage } from "spectrum-ts/providers/imessage";
import { executeReply } from "./replies.js";
import { executeReaction, removeOwnReaction } from "./reactions.js";
import { executeEdit, executeUnsend } from "./edits.js";
import { executeMarkRead } from "./mark-read.js";
/** F0 factory. This entry point uses only public services; legacy factory above is not registered by F0. */
export function createFeatureModule(
  options: PublicTextMessageOptions,
): PublicFeatureModule<(typeof ownedOperations)[number]> {
  const run = async (
    input: Action,
    s: PublicServices,
  ): Promise<OperationResult> => {
    let base: OperationResult = {
      version: 1,
      requestId: digestTextInput([
        "invalid",
        s.context.contextId,
        s.context.taskId,
        s.context.generation,
      ]),
      status: "failed",
      revision: 0,
      updatedAt: s.clock.now(),
      references: [],
      observations: [],
    };
    try {
      const action = parseActionRequest(input);
      base = textResult(action, s);
      s.assertActiveClaim();
      if (
        action.contextId !== s.context.contextId ||
        !s.context.permissions.includes(action.operation)
      )
        throw new FeatureError(
          "FORBIDDEN",
          "Action is outside the trusted context grant.",
        );
      assertTextProvider(s, options);
      let result: OperationResult;
      switch (action.operation) {
        case "text.send":
        case "markdown.send":
        case "link.send":
          result = await executeTextOperation(action, s, options);
          break;
        case "text.stream":
          result = await executeTextStream(action, s, options);
          break;
        case "content.group":
        case "content.compose":
          result = await executeComposition(action, s, options);
          break;
        case "message.reply":
          result = await executeReply(action, s, options);
          break;
        case "message.react":
          result = await executeReaction(action, s, options);
          break;
        case "reaction.remove":
          result = await removeOwnReaction(action, s, options);
          break;
        case "message.edit":
          result = await executeEdit(action, s, options);
          break;
        case "message.unsend":
          result = await executeUnsend(action, s, options);
          break;
        case "message.markRead":
          result = await executeMarkRead(action, s, options);
          break;
        case "message.get": {
          const message = await getMessageTarget(
            action.arguments.message,
            s,
            options,
          );
          result = {
            ...base,
            references: [action.arguments.message],
            value: {
              type: "metadata",
              sentAt: Number.isFinite(message.timestamp.getTime())
                ? message.timestamp.getTime()
                : null,
              editedAt: imessage(message).dateEdited?.getTime() ?? null,
              isFromMe: message.direction === "outbound",
            },
          };
          const parsed = contentSchema.safeParse(
            message.content.type === "text"
              ? { type: "text", text: message.content.text }
              : message.content.type === "markdown"
                ? { type: "markdown", text: message.content.markdown }
                : message.content.type === "richlink"
                  ? { type: "link", url: message.content.url }
                  : undefined,
          );
          if (parsed.success)
            result.value = {
              type: "message",
              content: parsed.data,
              senderId: message.sender?.id ?? null,
              direction: message.direction,
            };
          break;
        }
        default:
          throw new FeatureError(
            "INVALID_REQUEST",
            "Operation is not owned by WT-03.",
          );
      }
      const capability = textCapabilities().find(
        (c) => c.operation === action.operation,
      )!;
      return {
        ...result,
        capability: {
          ...capability,
          sources: [
            "npm:spectrum-ts@12.8.0",
            "docs/worktrees/wt-03/source-lock.json",
          ],
          blockers: [
            "Public host registration and authoritative compiler/handle adapters require integration; no activation or live evidence.",
            ...(action.operation === "text.stream"
              ? ["Buffered single-send fallback; no progressive delivery."]
              : []),
            ...(action.operation === "content.group"
              ? [
                  "One opaque child; provider-internal partial sends require reconciliation.",
                ]
              : []),
            ...(action.operation === "message.markRead"
              ? [
                  "Marks the inbound conversation read; does not prove recipient read.",
                ]
              : []),
          ],
        },
      };
    } catch (error) {
      return textFailure(base, error);
    }
  };
  const handlers: PublicFeatureModule<
    (typeof ownedOperations)[number]
  >["handlers"] = {};
  for (const operation of ownedOperations) {
    const handler = async (input: Action, s: PublicServices) => {
      // Parse before inspecting input properties, including when the caller selected the wrong handler.
      try {
        const action = parseActionRequest(input);
        if (action.operation !== operation)
          throw new FeatureError(
            "INVALID_REQUEST",
            "Wrong operation handler selected.",
          );
      } catch (error) {
        return textFailure(
          {
            version: 1,
            requestId: digestTextInput([
              "invalid",
              s.context.contextId,
              operation,
            ]),
            status: "failed",
            revision: 0,
            updatedAt: s.clock.now(),
            references: [],
            observations: [],
          },
          error,
        );
      }
      return run(input, s);
    };
    handlers[operation] = handler;
  }
  return { id: "text-messages", owner: "wt-03", handlers };
}
