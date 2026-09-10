# WT-09 sources

## Authority

Official Photon Markdown is normative for public behavior. The Spectrum, iMessage, and Photon Webhooks skills guide workflow but are not documentation or live evidence. Installed public declarations pin what the tests can compile against.

## Retrieval

`source-lock.json` records URL, final URL, UTC retrieval time, HTTP status, content type, byte count, title, SHA-256, and snapshot path for 28 validated Markdown documents. The set includes every official URL and skill reference named in the assignment. Browser-readable versions were also inspected for semantic review.

Snapshots preserve retrieved bytes exactly. The authored-file `git diff --check` passes; the snapshot subtree is excluded because the official signature guide contains upstream space-before-tab indentation that cannot be normalized without invalidating its recorded hash.

## Installed SDK

- `spectrum-ts`: 12.8.0.
- `package-lock.json` SHA-256: `6aff930eec3f42597185e7f504f66e66b3ea1684126099ad3260d31c16111b88`.
- `spectrum-ts/package.json` SHA-256: `69248e5615aecbe5844d9cc94323aa2a93391e76ac322cf82477c75df95dbcc2`.
- `@spectrum-ts/core/dist/index.d.ts` SHA-256: `651577159733a34e4243b86b80bfd088f9d82281db9ed0f11e1e0a2db769676a`.
- `@spectrum-ts/imessage/dist/index.d.ts` SHA-256: `6a2278d14fd42a5603675b046fd1c8ad5c584da760e60b621f74059bf7dc3aa0`.

The pinned declarations expose inbound `read` content, `message.read()`/`space.read()`, poll-option events, typing controls, `miniAppCardSession`, and iMessage metadata including `dateDelivered`, `dateRead`, and `isDelivered`. They do not expose a separate native delivered event; metadata acquisition/reconciliation is the valid delivery path.

## Semantic decisions

- A resolved fire-and-forget control does not prove device behavior.
- `message.markRead` is the product operation mapped to SDK read control; it is not evidence that a recipient read an outbound message.
- Inbound read receipts share the message stream, can be replayed after reconnect, and must not enter the conversational reply default path.
- Poll labels are not stable option identity.
- App-card updates require the original returned message/session; `edit` returns no replacement message.
- Webhook signatures cover exact raw bytes and timestamp, and durable capture must finish before acknowledgment.
