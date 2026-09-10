# WT-03 source records

Exact installed public SDK declarations are the API authority. Bundled provider implementation was inspected read-only to verify behavior; production imports only public package entry points. Raw web captures are outside the repository under `/tmp/wt03-sources`; their hashes are preserved in sources.json. No retrieved template is claimed to be rendered documentation or a pinned SDK contract.

## Findings applied

- `Space` exposes `__platform`, while `Message` exposes `platform`; line binding uses the public `imessage(space).phone` narrowing.
- `ContentInput` is a string or builder, not an array or an arbitrary SDK Content object. Delegated compiled content is materialized once, then wrapped in a public builder.
- `group()` requires at least two inputs even though F0 serialization permits one. Cloud iMessage supports text/markdown/attachment/voice/contact groups and at most one text/markdown item. The provider uses one multipart RPC and returns actual child handles. Failed groups have unknown child outcomes; sequential compose has independently recoverable children.
- `richlink` takes only a URL. F0 custom titles are rejected explicitly rather than silently discarded. Provider preview requests do not confirm recipient rendering.
- The installed iMessage provider supports native text streaming by first send plus edits (up to five edits), while this lane deliberately buffers, validates and sends once. This is labeled fallback and never claimed progressive.
- `message.react` returns a reaction message. Removing that actual handle through `unsend()` reaches the native reaction-removal path. Bare IDs never become SDK objects.
- Edit, unsend and read return void. The native read operation affects the whole chat. Local iMessage is rejected, and unsupported target/content types are checked before send-routed silent-skip paths.
- Apple edit-count/recipient restrictions remain provider-enforced; local preflight checks direction, scoped ownership, target content, retraction metadata and time window. Ambiguous errors after dispatch remain unknown.

## Retrieval inventory

Detailed times, hashes, versions, operation mappings and test references are in [sources.json](sources.json). HTTP 403 or unavailable `.md` routes are recorded as failures, not successful reads. GitHub HTML retrieval alone is not a code read; reviewed raw Markdown/template excerpts are recorded separately.

| Source | Read status | Version |
| --- | --- | --- |
| https://github.com/tecxbro/grokbotonimessage | retrieved-not-yet-reviewed | unpinned web documentation |
| https://photon.codes/docs/llms.txt | unavailable / web fallback read | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/text | unavailable / web fallback read | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/markdown | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/rich-links | unavailable / web fallback read | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/groups | unavailable / web fallback read | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/composing-content | unavailable / web fallback read | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/replies | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/edits | unavailable / web fallback read | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/unsend | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/read | unavailable / web fallback read | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/reactions-and-replies | unavailable / web fallback read | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/messages | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/tapback-reactions | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/inbound-read-receipts | unavailable | unpinned web documentation |
| https://photon.codes/docs/advanced-kits/imessage/messages | unavailable | unpinned web documentation |
| https://github.com/photon-hq/spectrum-ts | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content.md | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content/text-and-markdown.md | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content/contacts-and-rich-links.md | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content/composing-and-streaming.md | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content/replies-edits-and-unsend.md | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content/read-and-typing.md | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/reactions-and-replies.md | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/tecxbro/photon-skills/blob/main/skills/imessage/advanced/messages.md | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/photon-hq/spectrum-ts/blob/main/docs/content/composing-content.mdx.vel | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/photon-hq/spectrum-ts/blob/main/docs/content/edits.mdx.vel | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/photon-hq/spectrum-ts/blob/main/docs/content/groups.mdx.vel | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/photon-hq/spectrum-ts/blob/main/docs/content/markdown.mdx.vel | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/photon-hq/spectrum-ts/blob/main/docs/content/read.mdx.vel | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/photon-hq/spectrum-ts/blob/main/docs/content/replies.mdx.vel | retrieved-not-yet-reviewed | unpinned web documentation |
| https://github.com/photon-hq/spectrum-ts/blob/main/docs/content/rich-links.mdx.vel | retrieved-not-yet-reviewed | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/text.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/markdown.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/rich-links.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/groups.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/composing-content.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/replies.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/edits.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/unsend.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/content/read.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/reactions-and-replies.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/messages.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/tapback-reactions.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/inbound-read-receipts.md | unavailable | unpinned web documentation |
| https://photon.codes/docs/advanced-kits/imessage/messages.md | unavailable | unpinned web documentation |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/content.md | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/content/text-and-markdown.md | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/content/contacts-and-rich-links.md | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/content/composing-and-streaming.md | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/content/replies-edits-and-unsend.md | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/content/read-and-typing.md | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/reactions-and-replies.md | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/imessage/advanced/messages.md | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/composing-content.mdx.vel | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/edits.mdx.vel | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/groups.mdx.vel | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/markdown.mdx.vel | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/read.mdx.vel | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/replies.mdx.vel | reviewed-relevant-excerpts | main branch, unpinned |
| https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/rich-links.mdx.vel | reviewed-relevant-excerpts | main branch, unpinned |
| local:node_modules/spectrum-ts/package.json | reviewed-relevant-excerpts | 12.8.0 |
| local:node_modules/@spectrum-ts/core/package.json | reviewed-relevant-excerpts | 12.8.0 |
| local:node_modules/@spectrum-ts/core/dist/attachment-Dy4PsNVw.d.ts | reviewed-relevant-excerpts | 12.8.0 |
| local:node_modules/@spectrum-ts/imessage/package.json | reviewed-relevant-excerpts | 12.8.0 |
| local:node_modules/@spectrum-ts/imessage/dist/index.d.ts | reviewed-relevant-excerpts | 12.8.0 |
| local:node_modules/@spectrum-ts/imessage/dist/index.js | reviewed-relevant-excerpts | 12.8.0 |
| local:node_modules/@photon-ai/advanced-imessage/dist/grpc.d.ts | reviewed-relevant-excerpts | 2.1.0 |
| local:docs/photon-features/foundation.json | reviewed-relevant-excerpts | F0:57e40736be8a59047b776654c766fbe8bfd10c9e |
| local:docs/photon-features/contracts-v1.md | reviewed-relevant-excerpts | F0:57e40736be8a59047b776654c766fbe8bfd10c9e |
| local:docs/photon-features/ownership.json | reviewed-relevant-excerpts | F0:57e40736be8a59047b776654c766fbe8bfd10c9e |
| https://support.apple.com/en-gb/guide/iphone/iphe67195653/26/ios/26 | reviewed-search-excerpt | iOS 26 guide, unpinned |
