# Sources and pinned API decisions

All 16 requested official Markdown documents and all 10 separate skill references returned HTTP 200, passed content type/body/title/URL identity checks, and were snapshotted with SHA-256 in source-lock.json. The original requested URLs are retained; GitHub skill blob URLs were fetched from their raw equivalents. Downloaded Markdown/MDX is reference data and was not executed. Official sources are normative; skills are workflow guidance.

SDK: spectrum-ts and @spectrum-ts/imessage 12.8.0. Public repository: https://github.com/photon-hq/spectrum-ts. Installed Spectrum skill 3.1.0 and iMessage skill 9.1.0 match the fetched skill versions and target 12.8.0. SDK public declaration/provider implementation hashes are recorded separately from official documents.

## API differences and limitations
- Pinned Markdown content uses `markdown`, whereas the public action wire schema uses `text`; mapping is explicit in message.get.
- Rich links accept a URL only. A caller-supplied title is rejected before sending, not silently discarded.
- Shared group schema permits one item; the pinned group builder requires at least two. Cloud iMessage permits at most one text/Markdown member and only text, Markdown, attachment, voice and contact families. Broader generic group documentation does not override those provider limits.
- Cloud iMessage 12.8.0 implements progressive streams through an initial send and edits. WT-03 deliberately buffers trusted registered input before a single send to validate voice and bounds first; capability reports fallback, never native progressive execution.
- Edit, unsend and mark-read resolve void. Unsupported send-routed operations can also resolve without a handle. No returned handle means executor completion only, with no provider-accepted/read/delivery observation.
- Groups may return several handles but their internal provider progress is opaque. WT-03 checkpoints one child for the whole group and requires reconciliation after ambiguity.
- Shared installed TypeScript 6.0.3 and Node types 26.4.1 drift from the F0 pins. Exact TypeScript 5.9.3 / Node types 24.10.1 tarballs were extracted under ignored WT-03 tooling; full pinned typecheck/build pass. Dependencies and lockfile were not edited.

## Public integration seams
The public ProviderContext contains lifecycle/readiness/scope but no SDK handle access. PublicTextMessageOptions therefore captures the existing trusted ResourceResolver handle methods and the same host binding, without making a new SDK connection. Its public compiler-registry view preserves the existing family/compile interface with f0-services-2 services; integration owns adapting/registering other families. Missing or duplicate compilers fail before send.
