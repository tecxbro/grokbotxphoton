import { z } from "zod";
import { actionSchema } from "./actions.js";
import { idSchema } from "./resources.js";
const work = { contextId: idSchema };
export const localRequestSchema = z.discriminatedUnion("method", [
  z.strictObject({
    version: z.literal(1),
    method: z.literal("submit"),
    action: actionSchema,
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("status"),
    contextId: idSchema,
    requestId: idSchema,
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("capabilities"),
    ...work,
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("diagnostics"),
    ...work,
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("work.list"),
    ...work,
    limit: z.number().int().min(1).max(100),
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("work.claim"),
    ...work,
    handoffId: idSchema,
    leaseMs: z.number().int().min(1000).max(60000),
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("work.heartbeat"),
    ...work,
    handoffId: idSchema,
    fence: z.number().int().nonnegative(),
    leaseMs: z.number().int().min(1000).max(60000),
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("work.ack"),
    ...work,
    handoffId: idSchema,
    fence: z.number().int().nonnegative(),
  }),
  z.strictObject({
    version: z.literal(1),
    method: z.literal("request.cancel"),
    ...work,
    requestId: idSchema,
  }),
]);
export type LocalRequest = z.infer<typeof localRequestSchema>;
