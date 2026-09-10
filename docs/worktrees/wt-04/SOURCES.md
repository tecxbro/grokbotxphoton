# Source authority and versions

All seven requested official Photon Markdown documents returned HTTP 200 and passed content-type, body and URL identity checks. The first-level page titles were independently checked: Photon, Attachments, Voice, Contacts, Fetching iMessage attachments, Attachments, heif2jpeg. Exact final URLs, retrieval timestamps, status, content types, transport identity, documentTitle, snapshot paths and SHA-256 values are recorded in source-lock.json. Embedded documentation JSX is data and was not executed.

Five requested GitHub skill sources also returned HTTP 200. Every retrieved skill hash exactly matches the corresponding loaded local skill. Skills remain separately classified and do not replace the official snapshots. The local Spectrum provider/capability guides were also read.

Installed `spectrum-ts` 12.8.0 and its pinned core/iMessage dependencies constrain executable inputs and returns. The source lock hashes local package/declaration/provider files and package-lock.json; the public SDK v12.8.0 tag resolves to 938b0f86abbb998e2f36e5ef0f09b415e9913fd7. Real SDK builder tests cover attachment Buffer/id/name/size/read/stream, voice duration/audio, contact/vCard and native retrieval metadata types. The shipped getAttachment implementation exposes a lazy bounded-consumable primary stream and routes phone explicitly.

No unresolved source mismatch was found for the implemented subset. Official contact capabilities are broader than the frozen F0 schema; only the authorized subset is exposed. The voice documentation's provider fallback is modeled as an explicit host policy. No live provider behavior or HEIF conversion is inferred from documentation.
