import type { Platform, PlatformInstance, PlatformSpace } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import type {
  Action, ContentCompiler, ContentSpec, ExecutionServices, Operation,
  Scope, TrustedContext,
} from "../../contracts/index.js";

type Definition = typeof imessage extends Platform<infer D> ? D : never;
export type NativeSpace = PlatformSpace<Definition>;
export type NativeProvider = Pick<PlatformInstance<Definition>, "space" | "getMembers">;
export type StagedMedia = Extract<ContentSpec, { type: "attachment" }>["media"];
export type StoredMedia = Extract<StagedMedia, { stagingId: string }>;
export type NativeDispatch = <T>(operation: () => Promise<T>) => Promise<T>;

/** Auditable F0-to-Spectrum operation inventory; values name public APIs only. */
export const nativeOperationMap = Object.freeze({
  "space.get": "provider.space.get",
  "space.create": "provider.space.create",
  "space.getName": "space.getDisplayName",
  "space.rename": "space.rename",
  "space.getMembers": "space.getMembers",
  "space.addMembers": "space.add",
  "space.removeMembers": "space.remove",
  "space.leave": "space.leave",
  "space.getAvatar": "space.getAvatar",
  "space.setAvatar": "space.avatar",
  "space.clearAvatar": "space.avatar",
  "space.setBackground": "space.background",
  "space.clearBackground": "space.background",
  "account.shareContact": "space.shareContactCard",
  "effect.send": "space.send(effect)",
  "metadata.get": "resources.message+narrow",
  "custom.send": "space.send(nativeContactCard)",
} satisfies Partial<Record<Operation, string>>);

/** Maps each F0 operation to the pinned public Spectrum 12.8.0 surface used by
 * WT-07. Missing mappings are rejected before provider or media access. */
export function mapNativeOperation(operation: Operation): string | undefined {
  return nativeOperationMap[operation as keyof typeof nativeOperationMap];
}

/** Host-owned identity and current capability evidence, never action arguments. */
export interface NativeBinding {
  scope: Scope;
  phone: string;
  dedicated: boolean;
  accountReady: boolean;
  availableOperations: readonly Operation[];
  provider: NativeProvider;
}

export interface NativeDependencies {
  /** Return the existing, authenticated provider. Must not configure/start a client. */
  binding(context: TrustedContext): Promise<NativeBinding>;
  /** Validate trusted user intent for this exact action, including recipient sets,
   * group administration and native account identity sharing. A model flag is not intent. */
  authorizeIntent(action: Action, context: TrustedContext): Promise<void>;
  /** Revalidate explicit intent when native wrappers are used by another lane's
   * composition handler. Must bind the content and its target to the trusted task. */
  authorizeContent(content: ContentSpec, context: TrustedContext): Promise<void>;
  /** F0 compiler seam; inject registered text/markdown/attachment compilers. */
  compilers: readonly ContentCompiler[];
  /** Missing from F0 MediaStager: host must retain guarded provider bytes under the
   * principal/task/generation with expiry. No path/URL fallback is implemented here. */
  retainAvatar?: (
    image: { bytes: Uint8Array; mimeType: string },
    services: ExecutionServices,
  ) => Promise<StoredMedia>;
}
