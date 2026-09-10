import { resolveContents, type ContentInput } from "spectrum-ts";
import { effect, imessage, type IMessageMessageEffect } from "spectrum-ts/providers/imessage";
import {
  contentSchema, type Action, type ContentCompiler, type ContentSpec, type ExecutionServices,
} from "../../contracts/index.js";
import { requireNative, resolveReference } from "./guards.js";

const native = imessage.effect.message;
export const effectMapping = {
  slam: native.slam, loud: native.loud, gentle: native.gentle,
  "invisible-ink": native.invisible, confetti: native.confetti, balloons: native.balloons,
  fireworks: native.fireworks, lasers: native.lasers, celebration: native.celebration,
  echo: native.echo, spotlight: native.spotlight, love: native.heart,
  "shooting-star": native.sparkles,
} satisfies Record<Extract<ContentSpec, { type: "effect" }>["effect"], IMessageMessageEffect>;

export function effectCompiler(compilers: readonly ContentCompiler[]): ContentCompiler {
  return { family: "effect", async compile(input, services): Promise<ContentInput> {
    const parsed = contentSchema.parse(input);
    requireNative(parsed.type === "effect", "INVALID_REQUEST", "Expected an effect wrapper.");
    const leaf = parsed.content;
    requireNative(["text", "markdown", "attachment"].includes(leaf.type), "UNSUPPORTED",
      "iMessage effects support only text, markdown and attachments.");
    if (leaf.type === "attachment" && "kind" in leaf.media) await resolveReference(leaf.media, services);
    const compiler = compilers.find(c => c.family === leaf.type);
    requireNative(compiler, "UNAVAILABLE", "The common content compiler must be registered.");
    const compiled = await compiler.compile(leaf, services);
    const resolved = await resolveContents([compiled]);
    requireNative(resolved.length === 1 && resolved[0]?.type === leaf.type,
      "UNSUPPORTED", "The effect compiler must produce exactly one supported content item.");
    const built = resolved[0];
    requireNative(built, "UNSUPPORTED", "The effect content is missing.");
    return effect({ build: async () => built }, effectMapping[parsed.effect]);
  } };
}

/** Compiles one supported leaf with the registered common compiler before the
 * caller crosses the provider dispatch boundary. */
export async function executeEffect(
  action: Extract<Action, { operation: "effect.send" }>,
  services: ExecutionServices,
  compiler: ContentCompiler,
  send: (content: ContentInput, expectsMessage: boolean) => Promise<void>,
): Promise<void> {
  await send(await compiler.compile(action.arguments.content, services), true);
}
