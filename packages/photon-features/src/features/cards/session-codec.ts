import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { Message } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { cardRefSchema, sessionRefSchema, messageRefSchema, idSchema, httpsSchema, sameScope, type ExecutionServices, type RecoveryCodec } from '../../index.js';
import { checkMessage } from './sdk.js';
import { requireCard, type CardOptions } from './configuration.js';

export const SESSION_CODEC = { id: 'wt06.card-session', version: 1 } as const;
const providerId = z.string().min(1).max(1000);
const metadataSchema = z.strictObject({ chatGuid: providerId, messageGuid: providerId, sessionId: providerId, targetMessageGuid: providerId });
export const sessionSchema = z.strictObject({
  version: z.literal(1), sdkVersion: z.literal('12.8.0'),
  card: cardRefSchema, session: sessionRefSchema, message: messageRefSchema,
  providerMessageId: idSchema, templateId: idSchema, kind: z.enum(['universal', 'customized']),
  taskId: idSchema, principalId: idSchema, generation: z.number().int().nonnegative(), cardRevision: z.number().int().nonnegative(),
  url: httpsSchema, phase: z.enum(['ready', 'dispatching', 'unknown']),
  metadata: metadataSchema.nullable(),
  callback: z.strictObject({ backendContractId: idSchema, nonce: idSchema, participantIds: z.array(idSchema).min(1).max(32),
    actionIds: z.array(idSchema).min(1).max(32), expiresAt: z.number().int().nonnegative() }).nullable(),
}).superRefine((data, ctx) => {
  if (data.card.messageId !== data.message.id || data.session.cardId !== data.card.id ||
    !sameScope(data.card.scope, data.message.scope) || !sameScope(data.card.scope, data.session.scope))
    ctx.addIssue({ code: 'custom', message: 'Inconsistent card session references' });
});
export type CardSession = z.infer<typeof sessionSchema>;
export function encodeSession(value: CardSession): string { return JSON.stringify(sessionSchema.parse(value)); }
export function decodeSession(json: string): CardSession {
  requireCard(Buffer.byteLength(json) <= 32768, 'INVALID_REQUEST', 'Card session checkpoint exceeds the bound.');
  return sessionSchema.parse(JSON.parse(json));
}
export function sessionMetadata(message: Message): CardSession['metadata'] {
  if (message.platform !== 'imessage') return null;
  const metadata = imessage(message).miniAppCardSession;
  if (!metadata) return null;
  return metadataSchema.parse(metadata);
}
/** Only the shared resolver may obtain a real SDK Message. Never assign stored metadata
 * to an object or serialize a Message graph. Pinned getMessage does not guarantee
 * session metadata after a provider-cache restart. */
export async function restoreOriginal(data: CardSession, s: ExecutionServices, options: CardOptions, retained?: Message): Promise<Message> {
  let message = retained;
  if (!message) {
    try { message = await s.resources.message(data.message, s.context); }
    catch { /* Missing public restoration is a capability limitation, not a resend. */ }
  }
  requireCard(message, 'UNAVAILABLE', 'requires_original_session: public resolver did not restore the original card.', 'requires_original_session');
  checkMessage(message, s, options);
  requireCard(message.id === data.providerMessageId, 'SCOPE_MISMATCH', 'Restored message is not the original card.');
  const metadata = sessionMetadata(message);
  requireCard(metadata && data.metadata, 'UNAVAILABLE', 'requires_original_session: provider-managed session metadata is unavailable.', 'requires_original_session');
  requireCard(metadata.chatGuid === message.space.id && isDeepStrictEqual(metadata, data.metadata),
    'UNAVAILABLE', 'requires_original_session: original session metadata differs from the durable checkpoint.', 'requires_original_session');
  return message;
}
export const recoveryCodec: RecoveryCodec = {
  ...SESSION_CODEC,
  validate: value => sessionSchema.safeParse(value).success,
  // A card snapshot is never evidence that an interrupted provider operation completed.
  reconcile: async () => 'unknown',
};

/** Versioned inert snapshot for a future approved host checkpoint seam. The public
 * F0 domain records persist minimum bindings, not this payload or an SDK graph. */
export function encodeCardSession(value: CardSession): string {
  const json = encodeSession(value);
  requireCard(Buffer.byteLength(json) <= 32768, 'INVALID_REQUEST', 'Card session checkpoint exceeds the bound.');
  return json;
}

/** Proves only restoration with a genuine retained/publicly resolved SDK handle.
 * A cold checkpoint alone cannot rehydrate the pinned provider session. */
export function restoreCardSession(encoded: string, original?: Message): { data: CardSession; original: Message } {
  const data = decodeSession(encoded);
  requireCard(original, 'UNAVAILABLE', 'Public original session is required.', 'requires_original_session');
  requireCard(original.platform === 'imessage' && original.direction === 'outbound' && original.id === data.providerMessageId,
    'SCOPE_MISMATCH', 'Restored card is not the original outbound cloud message.');
  const metadata = sessionMetadata(original);
  requireCard(metadata && data.metadata && metadata.chatGuid === original.space.id && isDeepStrictEqual(metadata, data.metadata),
    'UNAVAILABLE', 'Provider session metadata cannot be reconstructed from a checkpoint.', 'requires_original_session');
  return { data, original };
}
