import { z } from "zod";
import { attachmentRefSchema } from "../../index.js";

export const metadataSchema = z.strictObject({
  version: z.literal(1),
  stagingId: z.string().uuid(),
  name: z.string().min(1).max(200).refine(v => !/[\x00-\x1f\x7f/\\]/.test(v)).optional(),
  mimeType: z.string().max(100),
  size: z.number().int().positive().optional(),
  duration: z.number().finite().nonnegative().optional(),
  source: attachmentRefSchema.optional(),
  providerHandle: z.string().min(1).max(200).optional(),
  providerMessageId: z.string().min(1).max(500).optional(),
  providerConversationId: z.string().min(1).max(500).optional(),
});
export type MediaMetadata = z.infer<typeof metadataSchema>;
export type SourceMetadata = Omit<MediaMetadata, "version" | "stagingId">;

export const mediaCheckpointSchema = z.strictObject({
  metadata: metadataSchema,
  readers: z.array(z.string().uuid()).max(1000),
});
