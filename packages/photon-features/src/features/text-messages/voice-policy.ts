import { voicePolicy } from "../../index.js";
import { requireThat } from "./errors.js";
export { voicePolicy };
/** Conservative prose changes only: unknown proper nouns are never guessed. */
export function formatProse(input: string): {
  bubbles: string[];
  warnings: string[];
} {
  requireThat(
    input.trim(),
    "INVALID_REQUEST",
    "Text must contain visible content.",
  );
  const protectedParts: string[] = [];
  const masked = input.replace(
    /```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s]+|(?:\/[\w.~+-]+)+[^\s]*|^\s*(?:\$ |> ).*$/gm,
    (part) => {
      protectedParts.push(part);
      return `\u0000${protectedParts.length - 1}\u0000`;
    },
  );
  requireThat(
    !input.includes("\u0000"),
    "INVALID_REQUEST",
    "Text contains a reserved control character.",
  );
  requireThat(
    (masked.match(/\?/g) ?? []).length <= 1,
    "INVALID_REQUEST",
    "Use one short question per turn.",
  );
  const question = masked.match(/[^.!?\n]*\?/g)?.[0];
  requireThat(
    !question || question.length <= voicePolicy.preferredMaximumCharacters,
    "INVALID_REQUEST",
    "The question must be short.",
  );
  const prose = masked
    .replace(/\s*—\s*/g, ", ")
    .replace(
      /(^|[.!?]\s+|\n+)(I\b|I'm\b|I've\b|I'll\b|It's\b|Here's\b|That's\b|The\b|This\b|That\b|You\b|We\b|It\b|Can\b|Could\b|Would\b|Sure\b|Thanks\b|Hey\b|Hello\b)/g,
      (_, prefix: string, word: string) => prefix + word.toLowerCase(),
    );
  const bubbles = prose
    .split(/\n[\t ]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p.replace(
        /\u0000(\d+)\u0000/g,
        (_, i: string) => protectedParts[Number(i)]!,
      ),
    );
  requireThat(
    bubbles.length <= 16,
    "INVALID_REQUEST",
    "At most 16 intended bubbles are supported.",
  );
  const warnings: string[] = [];
  if (bubbles.some((p) => p.length > 150))
    warnings.push(
      "An indivisible thought exceeds the preferred 150 character target.",
    );
  if (
    /\b(?:dear customer|how may i assist|thank you for contacting|we apologize for the inconvenience)\b/i.test(
      prose,
    )
  )
    warnings.push(
      "Use friend-like language; support-script language was preserved for the orchestrator to revise.",
    );
  return { bubbles, warnings };
}
export function oneBubble(input: string): string {
  const { bubbles } = formatProse(input);
  requireThat(
    bubbles.length === 1,
    "INVALID_REQUEST",
    "This action accepts one intended bubble.",
  );
  return bubbles[0]!;
}

/** Public formatter preserves the installed conservative policy and never splits for length alone. */
export const formatMessageBubbles = formatProse;
/** Validate prose policy without performing a second model pass. Structured callers bypass this API. */
export function validateVoicePolicy(input: string): { warnings: string[] } {
  return { warnings: formatMessageBubbles(input).warnings };
}
