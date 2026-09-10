# WT-05 sources and version evidence

All nine requested official Markdown sources and all six requested skill sources returned HTTP 200 on 2026-09-10. Exact request URL, final URL, retrieval time, content type, validated title, SHA-256 and actual body snapshot are in source-lock.json. Snapshots live only in this lane's references directory. Official pages are normative; skill snapshots are separate usage guidance. Browser retrieval initially refused two Markdown URLs; direct anonymous HTTP retrieval succeeded and is the recorded evidence. No failed page is represented as read.

## Pinned public contracts
Spectrum, core and iMessage provider are 12.8.0; transitive @photon-ai/advanced-imessage is 2.1.0. The feature workspace compiler is TypeScript 5.9.3. SHA-256 evidence covers the package lock, feature package, exported Spectrum/core/provider declarations, advanced public declarations and referenced declaration bundle. The unchanged lock also hoists TypeScript 6.0.3 at root; direct checks select the pinned workspace compiler.

sdk-contract.test.ts compiles public imports for poll/option/Space.send and advanced polls.create/get/vote/unvote/addOption, including return shapes, native IDs, poll event sequence and explicit negative probes. The advanced probe is never invoked and creates no client. The advanced package is a transitive dependency, not an approved runtime extension or a newly added dependency.

## Source conclusions and mismatches
- Unified poll choice and poll_option content contain display titles, not authoritative native option IDs. Never parse the provider's synthetic message IDs or use private caches to recover them.
- Installed provider code does handle native poll events internally; the limitation is the frozen public integration/normalization seam, not an assertion that iMessage or Spectrum lacks polls.
- Advanced vote changes the authenticated account's choice; no participant parameter is accepted. Native unvote accepts a poll GUID and optional idempotency options, whereas the frozen action requires a scoped option. CR-05-01 must settle those semantics before enabling writes.
- Raw native voted means the current choice changed; it does not prove independent option deltas or multiselect. applyPollEvent only applies those deltas when ingress explicitly verifies the semantics. Otherwise native state reconciliation is required.
- Shared ingress owns authenticated capture, catch-up/live overlap, sequence deduplication and contiguous checkpoint advancement. Webhook retries are bounded and at least once; provider acceptance never proves inbound user interaction.
- Official recovery guidance discusses stable client GUIDs. The pinned universal poll send does not expose that caller option, so this feature uses shared child persistence and reconcile-first unknown outcomes, never an invented provider idempotency guarantee.

All 15 source bodies were independently rehashed and revalidated. No installed SDK version drift from the F0 Spectrum pin was found. Local skill hashes are recorded separately from fetched source evidence.
