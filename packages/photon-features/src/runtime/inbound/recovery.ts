import type { Clock, IncomingEvent } from "../../contracts/index.js";
import type { CaptureStore } from "../../adapters/transport/capture.js";
import type { ProviderContext } from "../../adapters/transport/provider-context.js";
import { normalizeCaptured, type Correlations } from "./normalize.js";

/** Replay local captures after a crash between capture and SQLite commit.
 * Does not read transcripts or request undocumented provider recovery. */
export async function recoverCaptures(
  ids: Iterable<string>,
  captures: CaptureStore,
  routes: ProviderContext,
  clock: Clock,
  accept: (event: IncomingEvent) => Promise<void>,
  correlations: Correlations = {},
): Promise<string[]> {
  const unresolved: string[] = [];
  for (const id of ids) {
    const raw = captures.read(id);
    const input =
      raw !== null && typeof raw === "object" && "message" in raw
        ? raw.message
        : raw;
    const capturedAt =
      raw !== null &&
      typeof raw === "object" &&
      "capturedAt" in raw &&
      typeof raw.capturedAt === "number"
        ? raw.capturedAt
        : clock.now();
    let event: IncomingEvent;
    try {
      event = normalizeCaptured(input, id, routes, capturedAt, correlations);
    } catch {
      unresolved.push(id);
      continue;
    }
    await accept(event); // A store failure aborts recovery; never report successful recovery.
  }
  return unresolved;
}
