import {
  group,
  markdown,
  richlink,
  text,
  reply,
  resolveContents,
  type ContentInput,
} from "spectrum-ts";
import {
  contentSchema,
  type ContentCompiler,
  type ContentSpec,
  type ExecutionServices,
} from "../../index.js";
import { requireThat } from "./errors.js";
import { oneBubble } from "./voice-policy.js";
import { targetMessage } from "./targets.js";
import type { TextMessageOptions } from "./sdk.js";
const groupTypes = new Set([
  "text",
  "markdown",
  "attachment",
  "voice",
  "contact",
]);
export function validateContent(spec: ContentSpec): void {
  contentSchema.parse(spec);
  if (spec.type === "group") {
    requireThat(
      spec.items.length >= 2,
      "UNSUPPORTED",
      "The pinned group builder requires at least two items.",
    );
    requireThat(
      spec.items.every((item) => groupTypes.has(item.type)),
      "UNSUPPORTED",
      "iMessage groups support text, markdown, attachment, voice and contact only.",
    );
    requireThat(
      spec.items.filter(
        (item) => item.type === "text" || item.type === "markdown",
      ).length <= 1,
      "UNSUPPORTED",
      "iMessage groups accept at most one text or markdown item.",
    );
    spec.items.forEach(validateContent);
  } else if (spec.type === "compose") spec.items.forEach(validateContent);
  else if (spec.type === "reply" || spec.type === "effect") {
    requireThat(
      !(spec.type === "reply" && spec.content.type === "poll"),
      "UNSUPPORTED",
      "iMessage polls cannot be replies.",
    );
    validateContent(spec.content);
  } else if (spec.type === "poll")
    requireThat(
      new Set(spec.options.map((o) => o.key)).size === spec.options.length,
      "INVALID_REQUEST",
      "Poll keys must be unique.",
    );
}
export function createCompilers(
  options: TextMessageOptions,
): ContentCompiler[] {
  const compile = async (
    spec: ContentSpec,
    s: ExecutionServices,
  ): Promise<ContentInput> => {
    validateContent(spec);
    switch (spec.type) {
      case "text":
        return text(oneBubble(spec.text));
      // Structured payloads deliberately bypass prose transformations.
      case "markdown":
        return markdown(spec.text);
      case "link":
        requireThat(
          spec.title === undefined,
          "UNSUPPORTED",
          "Pinned richlink accepts a URL only; custom titles are unsupported.",
        );
        return richlink(spec.url);
      case "group": {
        const inputs = await Promise.all(
          spec.items.map((item) => compile(item, s)),
        );
        const resolved = await resolveContents(inputs);
        requireThat(
          resolved.length === spec.items.length &&
            resolved.every((item) => groupTypes.has(item.type)) &&
            resolved.filter(
              (item) => item.type === "text" || item.type === "markdown",
            ).length <= 1,
          "UNSUPPORTED",
          "A registered compiler returned unsupported group content.",
        );
        const builders = resolved.map((content) => ({
          build: async () => content,
        }));
        return group(builders[0]!, builders[1]!, ...builders.slice(2));
      }
      case "compose":
        throw new Error(
          "Compose must be executed through the per-child journal.",
        );
      case "reply": {
        const target = await targetMessage(spec.message, s, options);
        return reply(await compile(spec.content, s), target);
      }
      default: {
        const compiler = options
          .compilers?.()
          .find((item) => item.family === spec.type);
        requireThat(
          compiler,
          "UNAVAILABLE",
          "A required content compiler has not been registered.",
        );
        const result = await compiler.compile(spec, s);
        const built = await resolveContents([result]);
        requireThat(
          built.length === 1,
          "UNSUPPORTED",
          "A leaf compiler must return exactly one content item.",
        );
        return { build: async () => built[0]! };
      }
    }
  };
  return (["text", "markdown", "link", "group", "reply"] as const).map(
    (family) => ({ family, compile }),
  );
}

import { parseContentSpec } from "../../contracts/content.js";
import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import type { Action } from "../../contracts/actions.js";
import type { OperationResult } from "../../contracts/results.js";
import {
  executeTextChild,
  textResult,
  textFailure,
  type PublicTextMessageOptions,
} from "./sdk.js";
import { resolveMessageTarget, resolveTextSpace } from "./targets.js";
/** Compile inert content through the shared injected registry. Structured content bypasses prose rewriting. */
export async function compileComposition(
  input: ContentSpec,
  s: PublicServices,
  o: PublicTextMessageOptions,
): Promise<ContentInput> {
  const spec = parseContentSpec(input);
  validateContent(spec);
  s.assertActiveClaim();
  let content: ContentInput;
  switch (spec.type) {
    case "text":
      return text(spec.text);
    case "markdown":
      return markdown(spec.text);
    case "link":
      requireThat(
        spec.title === undefined,
        "UNSUPPORTED",
        "Pinned richlink accepts a URL only.",
      );
      return richlink(spec.url);
    case "compose":
      throw new Error("Composition requires separate shared children.");
    case "group": {
      const built = await resolveContents(
        await Promise.all(
          spec.items.map((item) => compileComposition(item, s, o)),
        ),
      );
      s.assertActiveClaim();
      requireThat(
        built.length === spec.items.length &&
          built.every((c) => groupTypes.has(c.type)) &&
          built.filter((c) => c.type === "text" || c.type === "markdown")
            .length <= 1,
        "UNSUPPORTED",
        "Compiler returned invalid iMessage group members.",
      );
      const inputs = built.map((item) => ({ build: async () => item }));
      return group(inputs[0]!, inputs[1]!, ...inputs.slice(2));
    }
    case "reply": {
      const target = await resolveMessageTarget(spec.message, s, o);
      return reply(await compileComposition(spec.content, s, o), target);
    }
    default: {
      const matches =
        o.compilers?.().filter((c) => c.family === spec.type) ?? [];
      requireThat(
        matches.length === 1,
        "UNAVAILABLE",
        "Exactly one shared compiler must be registered for this content family.",
      );
      content = await matches[0]!.compile(spec, s);
      s.assertActiveClaim();
      const built = await resolveContents([content]);
      s.assertActiveClaim();
      requireThat(
        built.length === 1,
        "UNSUPPORTED",
        "A leaf compiler must return one SDK content item.",
      );
      // A compiler cannot smuggle action content into a leaf or wrapper.
      const expected = spec.type === "registered-custom" ? "custom" : spec.type;
      requireThat(
        built[0]!.type === expected,
        "UNSUPPORTED",
        "Shared compiler changed the content family.",
      );
      return { build: async () => built[0]! };
    }
  }
}
/** Each top-level part is a child. A group is opaque: its hidden internal sends cannot be checkpointed here. */
export async function executeComposition(
  action: Extract<Action, { operation: "content.group" | "content.compose" }>,
  s: PublicServices,
  o: PublicTextMessageOptions,
): Promise<OperationResult> {
  const spec = parseContentSpec(action.arguments.content);
  validateContent(spec);
  const parts = spec.type === "compose" ? spec.items : [spec];
  // Preflight every builder before the first consequential provider call.
  const built: ContentInput[] = [];
  for (const part of parts) {
    const resolved = await resolveContents([
      await compileComposition(part, s, o),
    ]);
    s.assertActiveClaim();
    requireThat(
      resolved.length === 1,
      "UNSUPPORTED",
      "A planned child must compile to one SDK content item.",
    );
    built.push({ build: async () => resolved[0]! });
  }
  const space = await resolveTextSpace(action.arguments.space, s, o);
  const aggregate = textResult(action, s);
  for (let i = 0; i < built.length; i++) {
    let child: OperationResult;
    try {
      child = await executeTextChild(action, s, o, i, parts[i], () =>
        space.send(built[i]!),
      );
    } catch (error) {
      return textFailure(aggregate, error);
    }
    aggregate.references.push(...child.references);
    aggregate.observations.push(...child.observations);
    aggregate.updatedAt = child.updatedAt;
    if (
      ![
        "executor-completed",
        "provider-accepted",
        "observed-delivered",
        "observed-read",
      ].includes(child.status)
    )
      return {
        ...child,
        requestId: aggregate.requestId,
        references: aggregate.references,
        observations: aggregate.observations,
      };
  }
  aggregate.status = aggregate.references.length
    ? "provider-accepted"
    : "executor-completed";
  return aggregate;
}
