import { equivalent } from "./identity.js";
import { text, type ContentInput } from "spectrum-ts";
import { assertScope, sameScope, type ResourceRef } from "../../index.js";
import { requireThat, FeatureError } from "./errors.js";
import { oneBubble } from "./voice-policy.js";
import type { Journal } from "./journal.js";
export const streamBounds = Object.freeze({
  characters: 16000,
  chunks: 4096,
  milliseconds: 30000,
});
/** Buffer before dispatch so voice validation cannot fail after progressive delivery. */
export async function bufferStream(
  ref: Extract<ResourceRef, { kind: "stream" }>,
  journal: Journal,
): Promise<ContentInput> {
  const s = journal.services;
  assertScope(ref, s.context.scope);
  requireThat(
    ref.generation === s.context.generation && ref.expiresAt > s.clock.now(),
    "UNAVAILABLE",
    "Stream is expired or belongs to another generation.",
  );
  const resolved = await s.resources.resolve(ref, s.context);
  requireThat(
    equivalent(ref, resolved),
    "FORBIDDEN",
    "Registered stream resolution changed its identity.",
  );
  s.transactions.transaction((tx) => {
    journal.guard(tx);
    const record = tx.get("streams", ref.id);
    requireThat(
      record &&
        sameScope(record.scope, ref.scope) &&
        equivalent(record.reference, ref) &&
        record.state === "registered" &&
        record.principalId === s.context.principalId &&
        record.taskId === s.context.taskId,
      "UNAVAILABLE",
      "Stream is unregistered, unavailable or already consumed.",
    );
    // Claim consumption globally before opening; a crash never permits blind reopening.
    tx.put(
      "streams",
      { ...record, revision: record.revision + 1, state: "closed" },
      record.revision,
    );
  });
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  s.signal.addEventListener("abort", onAbort, { once: true });
  if (s.signal.aborted) controller.abort();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(streamBounds.milliseconds, ref.expiresAt - s.clock.now()),
  );
  let iterator: AsyncIterator<string> | undefined;
  const race = async <T>(start: () => Promise<T>): Promise<T> => {
    requireThat(
      !controller.signal.aborted,
      "CANCELLED",
      "Stream was cancelled or timed out.",
    );
    let listener: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      listener = () =>
        reject(
          new FeatureError("CANCELLED", "Stream was cancelled or timed out."),
        );
      controller.signal.addEventListener("abort", listener, { once: true });
    });
    try {
      return await Promise.race([start(), aborted]);
    } finally {
      controller.signal.removeEventListener("abort", listener);
    }
  };
  try {
    const source = await race(() =>
      s.streams.open(ref, s.context, controller.signal),
    );
    iterator = source[Symbol.asyncIterator]();
    let value = "",
      chunks = 0;
    while (true) {
      const next = await race(() => iterator!.next());
      if (next.done) break;
      requireThat(
        typeof next.value === "string" &&
          ++chunks <= streamBounds.chunks &&
          value.length + next.value.length <= streamBounds.characters,
        "INVALID_REQUEST",
        "Registered stream exceeded its text bounds.",
      );
      requireThat(
        s.clock.now() < ref.expiresAt,
        "UNAVAILABLE",
        "Stream expired during consumption.",
      );
      value += next.value;
    }
    return text(oneBubble(value));
  } catch (error) {
    if (error instanceof FeatureError) throw error;
    throw new FeatureError(
      "UNAVAILABLE",
      "Registered stream failed before provider dispatch; it cannot be reopened.",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    s.signal.removeEventListener("abort", onAbort);
    // A hostile or wedged iterator must not hold cancellation cleanup open.
    if (iterator?.return)
      void Promise.resolve()
        .then(() => iterator!.return!())
        .catch(() => {});
  }
}

import type { ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import { resolveTextSpace } from "./targets.js";
import {
  digestTextInput,
  textResult,
  mapTextMessageOperation,
  type PublicTextMessageOptions,
} from "./sdk.js";
/** Claim a registered stream in the shared domain before opening it; crashes never reopen consumed input. */
async function consumeRegisteredStream(
  ref: Extract<ResourceRef, { kind: "stream" }>,
  s: PublicServices,
): Promise<ContentInput> {
  s.assertActiveClaim();
  assertScope(ref, s.context.scope);
  requireThat(
    ref.generation === s.context.generation && ref.expiresAt > s.clock.now(),
    "UNAVAILABLE",
    "Stream is expired or from another generation.",
  );
  const resolved = await s.resolveResource(ref);
  s.assertActiveClaim();
  requireThat(
    equivalent(ref, resolved),
    "FORBIDDEN",
    "Stream resolution changed identity.",
  );
  s.transaction((unit) => {
    const record = unit.get("streams", ref.id);
    requireThat(
      record &&
        equivalent(record.reference, ref) &&
        sameScope(record.scope, ref.scope) &&
        record.state === "registered" &&
        record.principalId === s.context.principalId &&
        record.taskId === s.context.taskId,
      "UNAVAILABLE",
      "Stream is unavailable or already consumed.",
    );
    unit.put(
      "streams",
      { ...record, revision: record.revision + 1, state: "closed" },
      record.revision,
    );
  });
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  s.signal.addEventListener("abort", onAbort, { once: true });
  if (s.signal.aborted) controller.abort();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(streamBounds.milliseconds, ref.expiresAt - s.clock.now()),
  );
  let iterator: AsyncIterator<string> | undefined;
  const race = async <T>(start: () => Promise<T>): Promise<T> => {
    requireThat(
      !controller.signal.aborted,
      "CANCELLED",
      "Stream was cancelled or timed out.",
    );
    let listener: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      listener = () =>
        reject(
          new FeatureError("CANCELLED", "Stream was cancelled or timed out."),
        );
      controller.signal.addEventListener("abort", listener, { once: true });
    });
    try {
      return await Promise.race([start(), aborted]);
    } finally {
      controller.signal.removeEventListener("abort", listener);
    }
  };
  try {
    const source = await race(() =>
      s.streams.open(ref, s.context, controller.signal),
    );
    iterator = source[Symbol.asyncIterator]();
    let value = "",
      chunks = 0;
    while (true) {
      const next = await race(() => iterator!.next());
      if (next.done) break;
      requireThat(
        typeof next.value === "string" &&
          ++chunks <= streamBounds.chunks &&
          value.length + next.value.length <= streamBounds.characters,
        "INVALID_REQUEST",
        "Registered stream exceeded its text bounds.",
      );
      requireThat(
        s.clock.now() < ref.expiresAt,
        "UNAVAILABLE",
        "Stream expired during consumption.",
      );
      s.assertActiveClaim();
      value += next.value;
    }
    return text(oneBubble(value));
  } catch (error) {
    if (error instanceof FeatureError) throw error;
    throw new FeatureError(
      "UNAVAILABLE",
      "Registered stream failed before provider dispatch; it cannot be reopened.",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    s.signal.removeEventListener("abort", onAbort);
    // A hostile or wedged iterator must not hold cancellation cleanup open.
    if (iterator?.return)
      void Promise.resolve()
        .then(() => iterator!.return!())
        .catch(() => {});
  }
}
/** Buffered fallback, not progressive delivery. Replay consults shared children before opening the stream. */
export async function executeTextStream(
  action: ActionFor<"text.stream">,
  s: PublicServices,
  o: PublicTextMessageOptions,
) {
  const space = await resolveTextSpace(action.arguments.space, s, o);
  return s.executeChild({
    index: 0,
    key: `${textResult(action, s).requestId}:0`,
    argumentsDigest: digestTextInput([action.operation, action.arguments]),
    dispatch: async (signal) => {
      let content: ContentInput;
      try {
        if (signal.aborted)
          throw new FeatureError(
            "CANCELLED",
            "Stream execution was cancelled.",
          );
        content = await consumeRegisteredStream(action.arguments.stream, {
          ...s,
          signal: AbortSignal.any([s.signal, signal]),
        });
        s.assertActiveClaim();
      } catch (error) {
        // This block precedes the SDK send, so it cannot conceal an ambiguous provider outcome.
        const cancelled = s.signal.aborted || signal.aborted;
        return {
          ...textResult(action, s),
          status: cancelled ? ("cancelled" as const) : ("failed" as const),
          error: {
            code: cancelled
              ? ("CANCELLED" as const)
              : error instanceof FeatureError
                ? error.code
                : ("UNAVAILABLE" as const),
            message:
              "Stream could not be consumed before dispatch; do not reopen it.",
            retry: "never" as const,
          },
        };
      }
      return mapTextMessageOperation(action, s, o, await space.send(content));
    },
  });
}
