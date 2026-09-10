# Source verification

All 24 user-requested official Photon Markdown bodies and 16 GitHub skill bodies were retrieved on 2026-09-10 with HTTP 200 and validated content type, body, title/identity and SHA-256. See [source-lock.json](source-lock.json) for per-source URLs, final URLs, retrieval timestamps, classification, identity and content hashes; snapshots are under references/. A browser-tool request initially failed its URL safety check; direct anonymous Markdown retrieval succeeded. This is an access-path failure, not evidence the pages were missing.

Official documents are normative. Spectrum, imessage and photon-webhooks skills were read locally and the named GitHub versions retrieved separately as workflow guidance. Management/registration instructions did not authorize account changes. No registration, credentials or live SDK client was used.

Pinned public implementation: spectrum-ts, @spectrum-ts/core and @spectrum-ts/imessage 12.8.0; TypeScript 5.9.3 and Zod 4.5.4 from unchanged lockfiles. Installed public declarations and provider implementation verified space.getMessage, imessage narrowing, delivered/read metadata, exposed read messages, dropped ambiguous reads, and typing no-op behavior. The SDK-contract suite constructs actual offline Spectrum/Space objects; native I/O is a fixture, not a provider/device test. The public repository HEAD read via git ls-remote was ff44053f821fcffb967797d0a204d8bfebae91c3; it is not claimed to be the installed package's commit.

## Source mismatches and limits

- Official standalone webhook examples use `iMessage`; installed provider ID is `imessage`. Accept these two explicit spellings with consistent envelope routing; do not assume other provider names.
- The custom lifecycle guide illustrates generic custom events, but the pinned iMessage provider does not declare a delivery subscription. Use its shared messages read path and known-target metadata lookup.
- The read guide describes catch-up during outages. Installed Spectrum retains the catch-up cursor in memory and exposes no host-managed durable restart cursor; distinguish reconnect from process restart.
- The standalone webhook page's inbound subset is narrower than the SDK stream's documented reads/polls/group events. These are not claimed live over webhook merely because normalization accepts them.
- Native metadata has read time without a reader. Do not derive a reader or group completion percentage.
- Shared receipt IDs accept only the shared ID grammar; unsupported raw provider identifiers stay captured and fail acquisition rather than being rewritten into fabricated native IDs.
- Current skills describe standard-signing-secret rotation beyond the requested official managing page. WT-02 uses only the verified legacy v0 HMAC scheme and performs no credential management.

The exact official verifying-signatures Markdown contains space-before-tab indentation in its Go example. The full staged whitespace check reports those upstream bytes in reference e58ac8fa4ec788bbf3c178f83843be271715b7038765dc390849e91187bfdc8b.md. Preserve that hash-verified source verbatim; authored source/tests/docs have a separate passing whitespace check.
