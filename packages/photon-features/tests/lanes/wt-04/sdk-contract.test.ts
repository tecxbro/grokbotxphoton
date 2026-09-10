import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachment, voice, type Attachment, type AttachmentInput, type ContactInput, type SpectrumInstance } from "spectrum-ts";
import { imessage, type IMessageAttachmentMetadata } from "spectrum-ts/providers/imessage";
import { compileContact, exportVCard, importVCard } from "../../../src/features/media/contacts.js";
import { type NativeAttachmentProvider } from "../../../src/features/media/sdk.js";
import { resourceMetadataSchema } from "../../../src/features/media/staging.js";

// Assignment checks the actual narrowed public resolver, not a invented SDK facade.
const resolverContract = (app: SpectrumInstance): NativeAttachmentProvider => {
  const provider = imessage(app);
  return { getAttachment: (id, phone) => provider.getAttachment(id, phone) };
};
void resolverContract;

test("installed Spectrum 12.8.0 attachment Buffer return and stream shapes", async () => {
  const pkg = JSON.parse(await readFile("node_modules/spectrum-ts/package.json", "utf8"));
  assert.equal(pkg.version, "12.8.0");
  const bytes: AttachmentInput = Buffer.from("contract fixture");
  const built = await attachment(bytes, { id: "native-guid", name: "original.txt", mimeType: "text/plain" }).build();
  assert.equal(built.type, "attachment");
  if (built.type !== "attachment") throw new Error("attachment contract");
  const item: Attachment = built;
  assert.equal(item.id, "native-guid"); assert.equal(item.name, "original.txt"); assert.equal(item.size, bytes.length);
  assert.deepEqual(await item.read(), bytes);
  const stream = await item.stream(); assert.deepEqual(Buffer.from(await new Response(stream).arrayBuffer()), bytes);
});

test("pinned voice uses actual audio bytes and duration, contact uses the public builder", async () => {
  const bytes = Buffer.from("RIFF0000WAVEfixture");
  const built = await voice(bytes, { name: "note.wav", mimeType: "audio/wav", duration: 2.5 }).build();
  assert.equal(built.type, "voice");
  if (built.type !== "voice") throw new Error("voice contract");
  assert.equal(built.duration, 2.5); assert.deepEqual(await built.read(), bytes);
  const input = { name: "Ada", phones: ["+15555550123"], emails: ["ada@example.com"] };
  const contact = await compileContact(input).build();
  assert.equal(contact.type, "contact");
  if (contact.type !== "contact") throw new Error("contact contract");
  const details: ContactInput = contact; assert.equal(details.name?.formatted, "Ada");
  assert.deepEqual(importVCard(Buffer.from(await exportVCard(input))), input);
});

test("all shipped native retrieval metadata fields survive the bounded staging schema", () => {
  const retrieval: IMessageAttachmentMetadata = { guid: "native-guid", fileName: "photo.heic", mimeType: "image/heic",
    totalBytes: 42, transferState: "finished", uti: "public.heic", isHidden: false, isSticker: false,
    companionKind: "live-photo-video", originalGuid: "original-guid" };
  const value = resourceMetadataSchema.parse({ version: 1, stagingId: "00000000-0000-4000-8000-000000000000", mimeType: "image/heic", retrieval });
  assert.deepEqual(value.retrieval, retrieval);
});
