import { appendFileSync } from "node:fs";
import { DurableSQLiteStore } from "../../../src/adapters/state/sqlite.js";
import { action, binding, components, context, outcome } from "./fixture.js";
const [mode, path, id] = process.argv.slice(2);
if (!path) throw Error("PATH_REQUIRED");
const store = new DurableSQLiteStore(path),
  runtime = components(store);
if (mode === "reserve") {
  const r = await runtime.submission.submit(action(), context);
  process.stdout.write(r.requestId);
  store.close();
} else if (mode === "crash") {
  await runtime.executor.execute(
    id!,
    binding(async () => {
      appendFileSync(path + ".transmissions", "one\n");
      process.exit(23);
      return outcome();
    }),
  );
} else throw Error("INVALID_MODE");
