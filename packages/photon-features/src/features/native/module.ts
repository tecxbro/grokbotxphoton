import { createHash } from "node:crypto";
import { UnsupportedError, type ContentInput } from "spectrum-ts";
import {
  parseAction, resultSchema, type Action, type ContentCompiler, type ExecutionServices,
  type FeatureModule, type Operation, type OperationResult, type ResourceRef,
  type ResourceResolver,
} from "../../contracts/index.js";
import type { FeatureModule as PublicFeatureModule } from "../../contracts/feature.js";
import type { ExecutionServices as PublicExecutionServices } from "../../contracts/services.js";
import type { UnitOfWork } from "../../contracts/store.js";
import type { Transaction, TransactionStore } from "../../state/index.js";
import { canonicalJson } from "../../adapters/transport/provider-context.js";
import {
  checkBinding, checkContext, NativeError, nativeSpace, requireGroup, requireNative, resolveReference,
} from "./guards.js";
import { createSpace, executeSpaceLookup, getSpace, remember } from "./spaces.js";
import { executeAppearanceOperation } from "./appearance.js";
import { effectCompiler, executeEffect } from "./effects.js";
import { customCompiler, executeCustomHandler } from "./custom-handlers.js";
import { getCuratedMetadata } from "./metadata.js";
import { executeMembershipOperation } from "./membership.js";
import { shareAccountContact } from "./account-contact.js";
import { nativeGroupReducer } from "./reducer.js";
import { mapNativeOperation, type NativeDependencies } from "./sdk.js";

export const nativeOperations = [
  "space.get", "space.create", "space.getName", "space.rename", "space.getMembers",
  "space.addMembers", "space.removeMembers", "space.leave", "space.getAvatar",
  "space.setAvatar", "space.clearAvatar", "space.setBackground", "space.clearBackground",
  "account.shareContact", "effect.send", "metadata.get", "custom.send",
] as const satisfies readonly Operation[];
const groupOperations = new Set<Operation>([
  "space.getName", "space.rename", "space.getMembers", "space.addMembers", "space.removeMembers",
  "space.leave", "space.getAvatar", "space.setAvatar", "space.clearAvatar",
]);

/** Lane factory only. The aggregate registry and host activation remain WT-00 owned. */
export function createFeatureModule(dependencies: NativeDependencies): FeatureModule {
  const effects = effectCompiler(dependencies.compilers);
  function guardedCompiler(compiler: ContentCompiler, operation: "effect.send" | "custom.send"): ContentCompiler {
    return { family: compiler.family, async compile(content, services) {
      const space: Extract<ResourceRef, { kind: "space" }> = {
        version: 1, kind: "space", id: services.context.scope.spaceId, scope: services.context.scope,
      };
      // The synthetic envelope is used only for common context/lease checks.
      // Content intent comes from a separate host authority, never this identifier.
      const action = parseAction({ version: 1, idempotencyKey: "native-content-check", contextId: services.context.contextId,
        operation, arguments: operation === "effect.send" ? { space, content } :
          { space, ...(content.type === "registered-custom" ? { codecId: content.codecId, resource: content.resource } : {}) } });
      checkContext(action, services);
      const binding = await dependencies.binding(services.context);
      checkBinding(binding, services, operation);
      if (operation === "custom.send") checkBinding(binding, services, "account.shareContact");
      try { await dependencies.authorizeContent(content, services.context); }
      catch { throw new NativeError("FORBIDDEN", "Explicit native content intent is required."); }
      const built = await compiler.compile(content, services);
      checkContext(action, services);
      return built;
    } };
  }
  const compilers = [guardedCompiler(effects, "effect.send"), guardedCompiler(customCompiler, "custom.send")];

  async function execute(input: Action, services: ExecutionServices): Promise<OperationResult> {
    const result: OperationResult = { version: 1, requestId: input.idempotencyKey, status: "executor-completed",
      revision: 0, updatedAt: services.clock.now(), references: [], observations: [], value: { type: "void" } };
    let dispatched = false;
    let resolving = false;
    try {
      const action = parseAction(input);
      requireNative(nativeOperations.includes(action.operation as typeof nativeOperations[number]), "INVALID_REQUEST", "Operation belongs to another lane.");
      requireNative(mapNativeOperation(action.operation), "INVALID_REQUEST", "Native SDK operation mapping is missing.");
      checkContext(action, services);
      // Authorize the exact parsed action before any provider lookup or media resolution.
      try { await dependencies.authorizeIntent(action, services.context); }
      catch { throw new NativeError("FORBIDDEN", "Explicit authorized user intent is required."); }
      const binding = await dependencies.binding(services.context);
      checkBinding(binding, services, action.operation);
      checkContext(action, services);
      resolving = true;
      const dispatch = async <T>(fn: () => Promise<T>): Promise<T> => {
        checkContext(action, services);
        dispatched = true;
        return fn();
      };
      if (action.operation === "space.create") {
        await createSpace(action, services, binding, result, dispatch);
      } else {
        const ref = "space" in action.arguments ? action.arguments.space :
          { version: 1 as const, kind: "space" as const, id: services.context.scope.spaceId, scope: services.context.scope };
        if (action.operation === "metadata.get") await resolveReference(action.arguments.message, services);
        const space = await getSpace(ref, services, binding, () => checkContext(action, services));
        checkContext(action, services);
        if (groupOperations.has(action.operation)) requireGroup(space, binding);
        result.references.push(ref);
        async function send(content: ContentInput, expectsMessage: boolean) {
          // Build before dispatch so invalid builders never become ambiguous provider outcomes.
          const built = typeof content === "string" ? content : await content.build();
          const sent = await dispatch(() => space.send(typeof built === "string" ? built : { build: async () => built }));
          if (sent) {
            nativeSpace(sent.space, binding, space.id);
            result.references.push(remember("message", sent.id, services));
          } else if (expectsMessage) {
            throw new NativeError("UNKNOWN_OUTCOME", "The provider returned no message evidence.");
          }
        }
        switch (action.operation) {
          case "space.get":
          case "space.getName":
          case "space.rename":
            await executeSpaceLookup(action, space, result, dispatch); break;
          case "space.getMembers":
          case "space.addMembers":
          case "space.removeMembers":
          case "space.leave":
            await executeMembershipOperation(action, space, binding, result, dispatch); break;
          case "space.getAvatar":
          case "space.setAvatar":
          case "space.clearAvatar":
          case "space.setBackground":
          case "space.clearBackground":
            await executeAppearanceOperation(action, space, services, dependencies, result, dispatch); break;
          case "account.shareContact":
            await shareAccountContact(action, space, dispatch); break;
          case "effect.send":
            await executeEffect(action, services, effects, send); break;
          case "metadata.get": {
            result.value = await getCuratedMetadata(action, services, binding, space.id);
            result.references.push(action.arguments.message); break;
          }
          case "custom.send": {
            checkBinding(binding, services, "account.shareContact");
            await executeCustomHandler(action, services, async () => {
              try {
                await dependencies.authorizeIntent({ ...action, operation: "account.shareContact", arguments: { space: action.arguments.space } }, services.context);
              } catch { throw new NativeError("FORBIDDEN", "Explicit native account sharing intent is required."); }
            }, send); break;
          }
          default: throw new NativeError("INVALID_REQUEST", "Operation belongs to another lane.");
        }
      }
      checkContext(action, services);
      result.updatedAt = services.clock.now();
      return resultSchema.parse(result);
    } catch (error) {
      const known = error instanceof NativeError ? error : error instanceof UnsupportedError ?
        new NativeError("UNSUPPORTED", "The provider does not support this operation.") : null;
      result.status = dispatched ? "unknown-outcome" : known?.code === "CANCELLED" ? "cancelled" :
        known?.code === "UNAVAILABLE" ? "blocked" : "failed";
      delete result.value;
      result.error = { code: dispatched ? "UNKNOWN_OUTCOME" : known?.code ?? (resolving ? "PROVIDER_FAILURE" : "INVALID_REQUEST"),
        message: dispatched ? "Native dispatch may have taken effect; reconcile before retrying." :
          known?.message ?? "Native operation could not be validated or resolved.",
        retry: dispatched ? "reconcile-first" : known?.code === "UNAVAILABLE" ? "safe-before-dispatch" : "never" };
      result.updatedAt = services.clock.now();
      return result;
    }
  }

  return {
    id: "native-imessage-v1", lane: "wt-07", mode: "production",
    handlers: nativeOperations.map(operation => ({ operation,
      execute: async (action, services) => {
        if (action.operation !== operation) throw new NativeError("INVALID_REQUEST", "Handler operation mismatch.");
        return execute(action, services);
      }, recoveryCodec: { id: "native-v1", version: 1 } })),
    compilers,
    // WT-02 owns subscription and normalization. This reducer only lets the
    // shared inbox transaction consume validated group changes without a reply.
    reducers: [nativeGroupReducer],
    recoveryCodecs: [{ id: "native-v1", version: 1,
      validate: checkpoint => checkpoint !== null && typeof checkpoint === "object" &&
        Object.keys(checkpoint).length === 1 && "version" in checkpoint && checkpoint.version === 1,
      reconcile: async () => "unknown" }],
    capabilities: nativeOperations.map(operation => ({ operation, providerSupport: "native",
      availability: { account: "unknown", conversation: "unknown", checkedAt: null },
      implementation: "implemented", direction: { inbound: "not-applicable", outbound: "implemented" },
      evidence: [
        { tier: "unit", reference: "docs/worktrees/wt-07/TEST-EVIDENCE.md",
          observedAt: Date.parse("2026-09-10T08:34:16.609Z"), sdkVersion: "12.8.0" },
        { tier: "sdk-contract", reference: "docs/worktrees/wt-07/source-lock.json",
          observedAt: Date.parse("2026-09-10T08:08:22.016Z"), sdkVersion: "12.8.0" },
      ], sdkVersion: "12.8.0",
      sources: ["npm:spectrum-ts@12.8.0", "npm:@spectrum-ts/imessage@12.8.0"],
      blockers: ["Host authorization, scoped provider and capability bindings must be supplied; no live verification.",
        ...(operation === "space.getAvatar" ? ["Nonempty avatars require the host retention port absent from F0."] : []),
        ...(operation === "custom.send" ? ["Only native-account-contact-v1 is allowlisted; a host-registered resource is required."] : [])],
    })),
  };
}

/** Compatibility export for pre-existing lane consumers. */
export const createNativeModule = createFeatureModule;

export interface PublicNativeDependencies extends NativeDependencies {
  /** Host resolvers backed by the same scoped SDK owner as `binding`. */
  resources: Pick<ResourceResolver, "space" | "message">;
}

function publicServiceAdapter(
  services: PublicExecutionServices,
  dependencies: PublicNativeDependencies,
  signal: AbortSignal,
): ExecutionServices {
  const transact = services.transaction as unknown as <T>(
    run: (unit: UnitOfWork) => T,
  ) => T;
  const transactions: TransactionStore = {
    close: () => { throw new Error("FORBIDDEN"); },
    transaction: run => transact(unit => run({
      ...unit,
      list: () => { throw new Error("FORBIDDEN"); },
      listWork: () => { throw new Error("FORBIDDEN"); },
    } as unknown as Transaction)),
  };
  return {
    context: services.context,
    claim: services.claim,
    clock: services.clock,
    signal,
    transactions,
    resources: {
      resolve: reference => services.resolveResource(reference),
      space: async reference => {
        services.assertActiveClaim();
        const value = await dependencies.resources.space(reference, services.context);
        services.assertActiveClaim();
        return value;
      },
      message: async reference => {
        services.assertActiveClaim();
        const value = await dependencies.resources.message(reference, services.context);
        services.assertActiveClaim();
        return value;
      },
    },
    media: services.media,
    streams: services.streams,
  };
}

/** Integration adapter for the frozen public executor. It reuses the existing
 * scoped provider dependency and places each native operation behind the public
 * durable child journal; construction is inert and never starts another client. */
export function createPublicFeatureModule(
  dependencies: PublicNativeDependencies,
): PublicFeatureModule<(typeof nativeOperations)[number]> {
  const legacy = createNativeModule(dependencies);
  const handlers = Object.fromEntries(legacy.handlers.map(handler => [
    handler.operation,
    (action: Action, services: PublicExecutionServices) => services.executeChild({
      index: 0,
      key: `native:${action.operation}`,
      argumentsDigest: createHash("sha256").update(canonicalJson(action)).digest("hex"),
      dispatch: signal => handler.execute(action, publicServiceAdapter(services, dependencies, signal)),
    }),
  ])) as PublicFeatureModule<(typeof nativeOperations)[number]>["handlers"];
  return { id: "native-imessage-v1", owner: "wt-07", handlers };
}
