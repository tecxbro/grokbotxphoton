import { isIMessagePlatform } from "./provider-context.js";
import { observeReceipt, type ReceiptAcquisition } from "../../runtime/inbound/receipt-observer.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  Clock,
  IncomingEvent,
  IngressAdapter,
} from "../../contracts/index.js";
import {
  slimMessage,
  normalizeCaptured,
  type Correlations,
} from "../../runtime/inbound/normalize.js";
import type { CaptureStore } from "./capture.js";
import type { SpectrumOwner } from "./spectrum-owner.js";

const envelopeSchema = z.looseObject({
  event: z.literal("messages"),
  message: slimMessage,
  space: z.looseObject({
    id: z.string(),
    platform: z.string(),
    phone: z.string(),
  }),
});
/** Native Spectrum HMAC scheme, exact raw bytes. No alternate/Fusor envelope. */
export function verifyRawBody(
  raw: Uint8Array,
  headers: Headers,
  secret: string,
  now: number,
): boolean {
  const timestamp = headers.get("x-spectrum-timestamp"),
    signature = headers.get("x-spectrum-signature");
  if (
    !secret ||
    !timestamp ||
    !/^\d{1,12}$/.test(timestamp) ||
    !signature ||
    !/^v0=[a-f0-9]{64}$/.test(signature)
  )
    return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`v0:${timestamp}:`)
    .update(raw)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(3), "hex"));
}
export class NativeWebhookIngress implements IngressAdapter {
  private accept?: (event: IncomingEvent) => Promise<void>;
  private stopping = false;
  private readonly pending = new Set<Promise<Response>>();
  constructor(
    private readonly owner: SpectrumOwner,
    private readonly captures: CaptureStore,
    private readonly clock: Clock,
    private readonly secret: string,
    private readonly correlations: Correlations = {},
    private readonly receipts?: ReceiptAcquisition,
  ) {
    if (!secret) throw new Error("WEBHOOK_SECRET_REQUIRED");
  }
  async start(accept: (event: IncomingEvent) => Promise<void>): Promise<void> {
    this.owner.claimReceiver("photon-webhook", "wt-02.native-webhook");
    this.accept = accept;
  }
  handle(request: Request): Promise<Response> {
    if (this.stopping || !this.accept)
      return Promise.resolve(new Response(null, { status: 503 }));
    const work = this.receive(request);
    this.pending.add(work);
    void work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work),
    );
    return work;
  }
  private async receive(request: Request): Promise<Response> {
    if (
      request.method !== "POST" ||
      request.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "application/json"
    )
      return new Response(null, { status: 415 });
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        chunks.push(value);
      }
    } catch {
      return new Response(null, { status: 400 });
    } finally {
      reader.releaseLock();
    }
    const raw = Buffer.concat(chunks);
    if (!verifyRawBody(raw, request.headers, this.secret, this.clock.now()))
      return new Response(null, { status: 401 });
    let envelope: z.infer<typeof envelopeSchema>;
    try {
      envelope = envelopeSchema.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
      );
    } catch {
      return new Response(null, { status: 400 });
    }
    const { message, space } = envelope;
    if (
      !isIMessagePlatform(space.platform) ||
      message.platform !== space.platform ||
      message.space.platform !== space.platform ||
      message.space.id !== space.id ||
      message.space.phone !== space.phone ||
      message.direction !== "inbound"
    )
      return new Response(null, { status: 422 });
    try {
      // app.webhook's callback is fire-and-forget in 12.8.0. This route deliberately
      // consumes the public native wire shape itself and awaits durable acceptance.
      const captureId = this.captures.put({
        capturedAt: this.clock.now(),
        ...envelope,
      });
      const event = normalizeCaptured(
        message,
        captureId,
        this.owner.routes,
        this.clock.now(),
        this.correlations,
      );
      if (message.content.type === "read" && !this.receipts) throw new Error("RECEIPT_SERVICE_NOT_CONFIGURED");
      if (this.receipts) await observeReceipt(message, this.owner.routes, this.clock.now(), this.receipts);
      await this.accept!(event);
      return new Response(null, { status: 200 });
    } catch {
      return new Response(null, { status: 503 });
    }
  }
  async stop(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled(this.pending);
    this.accept = undefined;
  }
}

/** Exact raw-byte verification and durable acceptance complete before HTTP success. */
export function acceptVerifiedWebhook(ingress: NativeWebhookIngress, request: Request): Promise<Response> {
  return ingress.handle(request);
}
