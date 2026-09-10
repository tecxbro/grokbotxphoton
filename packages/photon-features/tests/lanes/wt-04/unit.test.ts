import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rename, symlink, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { openApprovedFile } from "../../../src/features/media/file-access.js";
import { compileContact, importVCard, exportVCard } from "../../../src/features/media/contacts.js";
import { retainResource, releaseResource, cleanExpiredResources, RETAINED } from "../../../src/features/media/retention.js";
import { makeServices } from "../../fixtures/runtime-services.js";
import { parseActionRequest } from "../../../src/contracts/actions.js";
import { validMime, validateBytes } from "../../../src/features/media/safety.js";

test("public retention cannot expire pending resources without authoritative quiescence", () => {
  const { services } = makeServices(), context = services.context;
  const media = { stagingId: "resource", sha256: "a".repeat(64), mimeType: "text/plain", bytes: 4 };
  services.transaction(unit => unit.put("stagedMedia", { id: media.stagingId, scope: context.scope, revision: 0,
    principalId: context.principalId, taskId: context.taskId, generation: context.generation,
    relativePath: "resource.bin", sha256: media.sha256, mimeType: media.mimeType, bytes: media.bytes, expiresAt: 1 }, null));
  services.transaction(unit => retainResource(unit, media, context));
  services.transaction(unit => {
    assert.equal(unit.get("stagedMedia", media.stagingId)?.expiresAt, RETAINED);
    assert.equal(releaseResource(unit, media, context, 1), false);
    assert.equal(cleanExpiredResources(unit, media, context, 9999999, () => true), undefined);
    assert.equal(releaseResource(unit, media, context, 1, () => false), false);
    assert.equal(releaseResource(unit, media, context, 1, () => true), true);
    assert.equal(cleanExpiredResources(unit, media, context, 9999999), undefined);
    assert.equal(cleanExpiredResources(unit, media, context, 9999999, () => true)?.expiresAt, 0);
    assert.throws(() => retainResource(unit, media, context), /released/);
    assert.throws(() => retainResource(unit, media, { ...context, generation: 2 }), /unavailable/);
  });
});

test("approved file access rejects traversal, symlink ancestors and inode replacement", async () => {
  await mkdir(resolve(".photon-local"), { recursive: true });
  const dir = await mkdtemp(resolve(".photon-local/wt04-file-"));
  try {
    const nested = join(dir, "nested"); await mkdir(nested);
    const path = join(nested, "input"); await writeFile(path, "original");
    await assert.rejects(openApprovedFile(`${dir}/nested/../nested/input`, [dir]), /invalid path/);
    const alias = join(dir, "alias"); await symlink(nested, alias);
    await assert.rejects(openApprovedFile(join(alias, "input"), [dir]), /symlink/);
    await assert.rejects(openApprovedFile(path, [dir], async () => {
      await rename(path, path + ".old"); await writeFile(path, "replaced");
    }), /changed/);
    const file = await openApprovedFile(path, [dir]);
    await rename(path, path + ".new"); await writeFile(path, "other");
    try { assert.equal(await file.readFile("utf8"), "replaced"); } finally { await file.close(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("contact fields and vCard serialization reject injection and preserve escaped names", async () => {
  const person = { name: "Ada; Lovelace, \\ Test", phones: ["+15555550123"], emails: ["ada@example.com"] };
  assert.deepEqual(importVCard(Buffer.from(await exportVCard(person))), person);
  for (const name of ["Ada\r\nTEL:+19999999999", "Ada\0", ""]) assert.throws(() => compileContact({ ...person, name }));
  assert.throws(() => compileContact({ ...person, phones: ["555-0100"] }));
  assert.throws(() => compileContact({ ...person, emails: ["a\r\n@example.com"] }));
  assert.throws(() => importVCard(Buffer.from("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nPHOTO:https://example.com/a\r\nEND:VCARD")), /outside F0/);
  assert.throws(() => importVCard(Buffer.alloc(65537)), /limit/);
});

test("MIME, real byte limits and the public JSON boundary reject unsafe media inputs", () => {
  assert.throws(() => validMime("text/html"));
  assert.throws(() => validateBytes(Buffer.from("not png"), "image/png"), /signature/);
  assert.throws(() => validateBytes(Buffer.alloc(101), "application/octet-stream", 100), /limit/);
  const { services } = makeServices();
  for (const media of ["/private/file", "https://example.com/file", Buffer.alloc(5), { bytes: "A".repeat(300000) }]) {
    assert.throws(() => parseActionRequest({ version: 1, contextId: services.context.contextId, idempotencyKey: "media-1",
      operation: "attachment.send", arguments: { space: { version: 1, kind: "space", id: services.context.scope.spaceId, scope: services.context.scope }, media } }));
  }
});
