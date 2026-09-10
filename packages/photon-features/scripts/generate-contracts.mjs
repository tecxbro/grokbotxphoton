import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  actionSchemas,
  contentSchema,
  resourceRefSchema,
  contextSchema,
  incomingEventSchema,
  resultSchema,
  capabilitySchema,
  localRequestSchema,
} from "../dist/src/contracts/index.js";
const directory = new URL("../schemas/", import.meta.url);
await mkdir(directory, { recursive: true });
const schemas = {
  ...actionSchemas,
  content: contentSchema,
  resource: resourceRefSchema,
  context: contextSchema,
  event: incomingEventSchema,
  result: resultSchema,
  capability: capabilitySchema,
  protocol: localRequestSchema,
};
const check = process.argv.includes("--check");
for (const [name, schema] of Object.entries(schemas)) {
  const body =
    JSON.stringify(
      z.toJSONSchema(schema, {
        target: "draft-2020-12",
        unrepresentable: "throw",
      }),
      null,
      2,
    ) + "\n";
  const file = new URL(name + ".json", directory);
  if (check) {
    if ((await readFile(file, "utf8")) !== body)
      throw new Error(`SCHEMA_DRIFT:${name}`);
  } else await writeFile(file, body);
}
const actual = (await readdir(directory))
  .filter((f) => f.endsWith(".json"))
  .sort();
if (
  actual.join() !==
  Object.keys(schemas)
    .map((n) => n + ".json")
    .sort()
    .join()
)
  throw new Error("SCHEMA_INVENTORY_DRIFT");
// Digest covers source contracts, storage contracts/migrations, registration and generated schemas.
const root = new URL("../", import.meta.url);
const names = [];
async function walk(relative) {
  for (const ent of await readdir(new URL(relative, root), {
    withFileTypes: true,
  })) {
    const p = relative + ent.name;
    if (ent.isDirectory()) await walk(p + "/");
    else if (/\.(ts|json)$/.test(p)) names.push(p);
  }
}
for (const p of [
  "src/contracts/",
  "src/state/",
  "src/registry/",
  "src/host/",
  "src/adapters/legacy/",
  "schemas/",
])
  await walk(p);
names.push("src/capabilities.ts");
const hash = createHash("sha256");
for (const name of names.sort()) {
  hash.update(name + "\0");
  hash.update(await readFile(new URL(name, root)));
  hash.update("\0");
}
const manifest = {
  contractVersion: 1,
  algorithm: "sha256",
  contractDigest: hash.digest("hex"),
  files: names.length,
  schemas: actual.length,
};
if (check) {
  const foundation = JSON.parse(
    await readFile(
      new URL("../../../docs/photon-features/foundation.json", import.meta.url),
      "utf8",
    ),
  );
  if (foundation.contractDigest !== manifest.contractDigest)
    throw new Error("FOUNDATION_DIGEST_DRIFT");
}
console.log(JSON.stringify(manifest));
