# WT-06 source records

Access session: 2026-09-09T03:23:37.870779+00:00. All exact attempts, hashes and source mappings are in `sources.json`.

Authority is installed spectrum-ts / @spectrum-ts/core / @spectrum-ts/imessage 12.8.0. Production imports use only `spectrum-ts` and `spectrum-ts/providers/imessage`. Package implementation reads support analysis; no private imports are used.

| Source | Access | Version / role |
| --- | --- | --- |
| https://photon.codes/docs/llms.txt | read-via-web | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/content/app | read-via-web | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/content/app.md | failed | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/content/rich-links | read-via-web | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/content/rich-links.md | failed | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/content/edits | read-via-web | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/content/edits.md | failed | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/apps | read-via-web | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/apps.md | failed | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/custom-events-and-lifecycle | read-via-web | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/spectrum-ts/custom-events-and-lifecycle.md | failed | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/best-practices/recovery-and-state | read-via-web | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://photon.codes/docs/best-practices/recovery-and-state.md | failed | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://github.com/photon-hq/spectrum-ts | read | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content/app-cards.md | read | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/capability-semantics.md | read | unversioned website or mutable main; pinned installed SDK is authoritative |
| https://github.com/photon-hq/spectrum-ts/blob/main/docs/content/app.mdx.vel | read | unversioned website or mutable main; pinned installed SDK is authoritative |
| node_modules/spectrum-ts/package.json | read | 12.8.0 |
| node_modules/@spectrum-ts/core/dist/attachment-Dy4PsNVw.d.ts | read | 12.8.0 |
| node_modules/@spectrum-ts/core/dist/index.js | read | 12.8.0 |
| node_modules/@spectrum-ts/imessage/dist/index.d.ts | read | 12.8.0 |
| node_modules/@spectrum-ts/imessage/dist/index.js | read | 12.8.0 |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/content/app-cards.md | read | main (mutable), content pinned by SHA-256 |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/capability-semantics.md | read | main (mutable), content pinned by SHA-256 |
| https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/app.mdx.vel | read | main (mutable), content pinned by SHA-256 |

## Contract findings and mismatches

- `app(url, {live})` and `customizedMiniApp({...})` are builders. `sdk.test.ts` executes the real public builders; public call-shape probe compiles under strict package settings.
- Rich links are a separate URL-preview capability owned by WT-03. Card acceptance does not establish live extension rendering or callbacks.
- The universal app builder has no layout argument. F0 app.update only has layout; configured `updateUrl` is required for universal updates. No unchanged URL/layout is silently reported as applied.
- Original `Message.id` stays stable across void edits. The pinned provider mutates the edit target's `miniAppCardSession`; its four fields are refreshed into the bounded checkpoint.
- The pinned `getMessage` checks its live cache, then rebuilds from an Apple message on cache miss. There is no public session deserializer or guarantee that this rebuild restores miniAppCardSession. WT-06 never assigns checkpoint metadata to an SDK object. A surviving real handle can be resolved; missing/changed metadata yields requires_original_session.
- Website recovery examples discuss clientGuid/startIndex. These are not exposed as app/edit arguments in the selected public call shapes and no advanced extension is approved at F0. WT-06 cannot claim provider deduplication; uncertain dispatch remains blocked for reconciliation.
- The lifecycle/event reference does not define an authenticated app-form callback protocol. F0 app-interaction events omit authenticated participant and nonce. Generic events are unresolved; the exported adapter requires a real backend verifier. Fixture HMAC is only test authentication, never a claimed deployed protocol.
- F0 app.update has no expected revision. Host updateRevision must resolve an immutable admission binding; current-revision-at-execution is unsafe and is not used.
- Each website .md counterpart was checked separately and failed (urllib HTTP 403; web tool non-retryable access error). HTML counterparts were read through web.open. GitHub Markdown/template reads are supplementary and have content hashes.

No device, installed extension, live callback endpoint or production account was inspected or changed.
