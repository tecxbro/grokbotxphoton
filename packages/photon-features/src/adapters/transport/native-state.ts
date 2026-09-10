import { imessage } from "spectrum-ts/providers/imessage";
import type { Scope } from "../../contracts/references.js";
import type { SpectrumOwner } from "./spectrum-owner.js";
import { scopeKey } from "./provider-context.js";
import { snapshotMessage } from "./snapshot.js";

export interface NativeTarget { scope: Scope; conversationId: string; providerTargetId: string; }
export type NativeState =
  | { status: "found"; message: Record<string, unknown> }
  | { status: "missing" | "unavailable"; reason: string };
const pending = new WeakMap<SpectrumOwner, Map<string, Promise<NativeState>>>();
/** One exact public getMessage lookup. A timeout cannot cancel SDK I/O; retain
 * its in-flight slot until settlement, so repeated scheduler ticks cannot pile up
 * lookups. Late results never persist evidence or trigger retries by themselves. */
export async function lookupNativeMessageState(
  owner: SpectrumOwner, target: NativeTarget,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<NativeState> {
  owner.routes.outbound(target.scope, target.conversationId);
  if (!target.providerTargetId) throw new Error("KNOWN_TARGET_REQUIRED");
  const timeoutMs = options.timeoutMs ?? 3000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new Error("INVALID_LOOKUP_TIMEOUT");
  if (options.signal?.aborted) return { status: "unavailable", reason: "cancelled" };
  if (!owner.ready()) return { status: "unavailable", reason: "owner-not-ready" };
  let slots = pending.get(owner);
  if (!slots) { slots = new Map(); pending.set(owner, slots); }
  const key = JSON.stringify([scopeKey(target.scope), target.providerTargetId]);
  if (slots.has(key)) return { status: "unavailable", reason: "lookup-in-flight" };
  let active = true;
  const work = (async (): Promise<NativeState> => {
    const space = await owner.space(target.scope, target.conversationId);
    if (!active || options.signal?.aborted || !owner.ready()) return { status: "unavailable", reason: "cancelled" };
    const message = await space.getMessage(target.providerTargetId);
    if (!message) return { status: "missing", reason: "target-not-found" };
    if (message.id !== target.providerTargetId || !imessage.is(message) ||
        message.space.id !== target.conversationId ||
        imessage(message.space).phone !== owner.routes.outbound(target.scope, target.conversationId).phone)
      throw new Error("NATIVE_TARGET_SCOPE_MISMATCH");
    return { status: "found", message: snapshotMessage(message) };
  })().catch((error: unknown): NativeState => ({
    status: "unavailable", reason: error instanceof Error ? error.message : "lookup-failed",
  }));
  slots.set(key, work);
  void work.finally(() => slots!.delete(key));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([work, new Promise<NativeState>(resolve => {
      timer = setTimeout(() => resolve({status: "unavailable", reason: "timeout"}), timeoutMs);
      abort = () => resolve({status: "unavailable", reason: "cancelled"});
      options.signal?.addEventListener("abort", abort, {once: true});
      if (options.signal?.aborted) abort();
    })]);
  } finally {
    active = false;
    if (timer) clearTimeout(timer);
    if (abort) options.signal?.removeEventListener("abort", abort);
  }
}
