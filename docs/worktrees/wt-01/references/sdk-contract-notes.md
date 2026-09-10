# Pinned SDK contract notes

Source: published `spectrum-ts` 12.8.0 and its exact 12.8.0 scoped dependencies, installed from the committed lockfile.

- `Space.send(ContentInput)` returns `Promise<Message | undefined>`.
- Multipart `Space.send(...content)` returns `Promise<Message[]>`.
- Read, typing, unsend, and provider-specific fire-and-forget controls may resolve without a message object.
- The provider authoring `send` callback returns `Promise<ProviderMessageRecord | undefined>`.
- Public declarations expose message IDs and provider results but no universal `clientGuid`, idempotency-key, or outcome-lookup guarantee for every Spectrum provider operation.
- Therefore an undefined result is not provider acceptance, delivery, or read evidence, and an ambiguous post-dispatch exception requires reconciliation rather than blind local replay.

The declaration observations are locked by the npm tarball and integrity entries in `source-lock.json`; tests import the actual pinned types instead of duplicating them.
