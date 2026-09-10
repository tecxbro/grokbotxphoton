import { contact, fromVCard, toVCard, type ContactInput, type ContentBuilder } from "spectrum-ts";
import { contactSchema, type ContentSpec } from "../../index.js";
import { reject } from "./safety.js";

type ContactSpec = Extract<ContentSpec, { type: "contact" }>["contact"];
export function compileContact(input: ContactSpec): ContentBuilder {
  const value = contactSchema.parse(input);
  if (/[\x00-\x1f\x7f]/.test(value.name)) reject("invalid contact name");
  return contact({ name: { formatted: value.name }, phones: value.phones.map(value => ({ value })), emails: value.emails.map(value => ({ value })) });
}
/** Projects only F0-permitted contact fields; raw dictionaries/photos never reach the builder. */
export function normalizeContact(input: ContactInput): ContactSpec {
  return contactSchema.parse({
    name: input.name?.formatted ?? [input.name?.first, input.name?.middle, input.name?.last].filter(Boolean).join(" "),
    phones: (input.phones ?? []).map(p => p.value), emails: (input.emails ?? []).map(e => e.value),
  });
}
/** Host import adapter for one bounded vCard. Unsupported fields require quarantine by WT-02. */
export function importVCard(bytes: Uint8Array): ContactSpec {
  if (!bytes.length || bytes.length > 65536) reject("vCard byte limit");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return reject("invalid vCard UTF-8"); }
  if ((text.match(/BEGIN:VCARD/g) ?? []).length !== 1 || !text.startsWith("BEGIN:VCARD") || !text.trimEnd().endsWith("END:VCARD")) reject("invalid vCard");
  // Reject all fields beyond the F0 subset instead of silently dropping metadata or fetching PHOTO URLs.
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter(Boolean);
  if (lines.some(line => !/^(BEGIN|END|VERSION|FN|N|TEL|EMAIL)(;[^:]*)?:/i.test(line))) reject("vCard fields outside F0");
  const value = normalizeContact(fromVCard(text));
  compileContact(value);
  return value;
}
export async function exportVCard(value: ContactSpec): Promise<string> {
  const built = await compileContact(value).build();
  if (built.type !== "contact") return reject("contact builder contract");
  return toVCard(built);
}

import type { ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import { mapMediaOperation, type MediaOperationOptions } from "./sdk.js";
/** Sends universal structured contact content, separate from native account contact sharing. */
export function sendContact(action: ActionFor<"contact.send">, services: PublicServices, options: MediaOperationOptions) {
  return mapMediaOperation(action, services, options);
}
