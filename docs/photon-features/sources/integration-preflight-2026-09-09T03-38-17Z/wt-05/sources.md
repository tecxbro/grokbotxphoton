# WT-05 sources

Access date: 2026-09-09T03:22:35.950432+00:00. Exact response/file hashes and access status are in [sources.json](sources.json).

The pinned public SDK declarations are API authority. All eight requested website `.md` variants returned HTTP 200 and were verified as Markdown; relevant excerpts were read. HTML URLs were fetched for availability; their Markdown counterpart supplies the review. GitHub main is rolling; the separate observed HEAD is recorded without claiming atomic pinning. Temporary source captures are under `/tmp/wt05-sources/` and may be removed independently of this record.

## Findings and limits

- Spectrum 12.8.0 exposes a public poll builder, but public poll/option content omits native option IDs. The read-only provider trace confirms the create result uses the native poll message GUID as the returned message ID. No composite inbound message ID is parsed.
- Advanced iMessage 2.1.0 publicly declares create/get/vote/unvote/addOption and native state. F0 supplies no approved extension. Four native management handlers are blocked as missing application integration, not misreported as provider limitations.
- The advanced API casts the local account vote; unvote takes no option ID. Native vote replacement and independent multi-select deltas are distinct semantics.
- Public native Poll snapshots have no sequence/cursor; native events do. Snapshot/event consistency remains an integration requirement, not inferred from a fetch timestamp.
- The webhook delivery documentation explicitly excludes poll votes. Spectrum stream public content alone is insufficient to reconstruct a reliable native target/option mapping.
- Generic recovery clientGuid examples do not establish a Spectrum poll send idempotency seam. Timeout, undefined send result, or persistence failure remains unknown and is never automatically resent.

## Read/access inventory

- [https://photon.codes/docs/llms.txt](https://photon.codes/docs/llms.txt): reviewed relevant index entries. Supports: source discovery.
- [https://photon.codes/docs/spectrum-ts/content/polls](https://photon.codes/docs/spectrum-ts/content/polls): fetched; Markdown counterpart reviewed. Supports: poll.create public builder; native identity limitation; schema/call-shape tests.
- [https://photon.codes/docs/spectrum-ts/content/polls.md](https://photon.codes/docs/spectrum-ts/content/polls.md): reviewed relevant poll/event/retry excerpts. Supports: poll.create public builder; native identity limitation; schema/call-shape tests.
- [https://photon.codes/docs/spectrum-ts/messages](https://photon.codes/docs/spectrum-ts/messages): fetched; Markdown counterpart reviewed. Supports: poll.create public builder; native identity limitation; schema/call-shape tests.
- [https://photon.codes/docs/spectrum-ts/messages.md](https://photon.codes/docs/spectrum-ts/messages.md): reviewed relevant poll/event/retry excerpts. Supports: poll.create public builder; native identity limitation; schema/call-shape tests.
- [https://photon.codes/docs/advanced-kits/imessage/polls](https://photon.codes/docs/advanced-kits/imessage/polls): fetched; Markdown counterpart reviewed. Supports: all five public call-shape probes; native option identity; bot-only vote semantics.
- [https://photon.codes/docs/advanced-kits/imessage/polls.md](https://photon.codes/docs/advanced-kits/imessage/polls.md): reviewed relevant poll/event/retry excerpts. Supports: all five public call-shape probes; native option identity; bot-only vote semantics.
- [https://photon.codes/docs/advanced-kits/imessage/events](https://photon.codes/docs/advanced-kits/imessage/events): fetched; Markdown counterpart reviewed. Supports: ordered reducer; unknown actor request; restart/replay tests.
- [https://photon.codes/docs/advanced-kits/imessage/events.md](https://photon.codes/docs/advanced-kits/imessage/events.md): reviewed relevant poll/event/retry excerpts. Supports: ordered reducer; unknown actor request; restart/replay tests.
- [https://photon.codes/docs/advanced-kits/imessage/error-handling](https://photon.codes/docs/advanced-kits/imessage/error-handling): fetched; Markdown counterpart reviewed. Supports: timeout/no-resend tests; recovery codec; advanced seam request.
- [https://photon.codes/docs/advanced-kits/imessage/error-handling.md](https://photon.codes/docs/advanced-kits/imessage/error-handling.md): reviewed relevant poll/event/retry excerpts. Supports: timeout/no-resend tests; recovery codec; advanced seam request.
- [https://photon.codes/docs/webhooks/events](https://photon.codes/docs/webhooks/events): fetched; Markdown counterpart reviewed. Supports: capability separation; duplicate delivery tests; WT-02 ingress request.
- [https://photon.codes/docs/webhooks/events.md](https://photon.codes/docs/webhooks/events.md): reviewed relevant poll/event/retry excerpts. Supports: capability separation; duplicate delivery tests; WT-02 ingress request.
- [https://photon.codes/docs/webhooks/delivery](https://photon.codes/docs/webhooks/delivery): fetched; Markdown counterpart reviewed. Supports: capability separation; duplicate delivery tests; WT-02 ingress request.
- [https://photon.codes/docs/webhooks/delivery.md](https://photon.codes/docs/webhooks/delivery.md): reviewed relevant poll/event/retry excerpts. Supports: capability separation; duplicate delivery tests; WT-02 ingress request.
- [https://photon.codes/docs/best-practices/recovery-and-state](https://photon.codes/docs/best-practices/recovery-and-state): fetched; Markdown counterpart reviewed. Supports: timeout/no-resend tests; recovery codec; advanced seam request.
- [https://photon.codes/docs/best-practices/recovery-and-state.md](https://photon.codes/docs/best-practices/recovery-and-state.md): reviewed relevant poll/event/retry excerpts. Supports: timeout/no-resend tests; recovery codec; advanced seam request.
- [https://github.com/photon-hq/spectrum-ts](https://github.com/photon-hq/spectrum-ts): fetched repository page; local pinned package and authored template reviewed. Supports: poll.create public builder; native identity limitation; schema/call-shape tests.
- [https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/polls.mdx.vel](https://raw.githubusercontent.com/photon-hq/spectrum-ts/main/docs/content/polls.mdx.vel): reviewed relevant poll/event/retry excerpts. Supports: poll.create public builder; native identity limitation; schema/call-shape tests.
- [https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/content/polls-groups-and-custom.md](https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/content/polls-groups-and-custom.md): reviewed relevant poll/event/retry excerpts. Supports: poll.create public builder; native identity limitation; schema/call-shape tests.
- [https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/imessage/advanced/polls.md](https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/imessage/advanced/polls.md): reviewed relevant poll/event/retry excerpts. Supports: all five public call-shape probes; native option identity; bot-only vote semantics.
- [https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/imessage/advanced/events.md](https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/imessage/advanced/events.md): reviewed relevant poll/event/retry excerpts. Supports: ordered reducer; unknown actor request; restart/replay tests.
- [https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/capability-semantics.md](https://raw.githubusercontent.com/tecxbro/photon-skills/main/skills/spectrum/capability-semantics.md): reviewed relevant poll/event/retry excerpts. Supports: undefined SDK return test; directional capabilities.
- `node_modules/@spectrum-ts/core/dist/attachment-Dy4PsNVw.d.ts`: reviewed relevant declarations or instructions. Supports: Public Space, ContentBuilder, Poll and PollOption types; create call shape and native-ID absence.
- `node_modules/@spectrum-ts/imessage/dist/index.d.ts`: reviewed relevant declarations or instructions. Supports: Public imessage narrowing and absence of poll management seam.
- `node_modules/@spectrum-ts/imessage/dist/index.js`: reviewed relevant declarations or instructions. Supports: Read-only trace: outbound poll GUID becomes message ID; public vote conversion drops native identities. No internal symbols imported..
- `node_modules/@photon-ai/advanced-imessage/dist/grpc.d.ts`: reviewed relevant declarations or instructions. Supports: Public AdvancedIMessage polls signatures; compile-only probe for future F0 extension.
- `node_modules/@photon-ai/advanced-imessage/dist/groups-CMgks3Ll.d.ts`: reviewed relevant declarations or instructions. Supports: Poll and PollEvent native IDs, optional actor, sequence, vote shapes.
- `docs/photon-features/foundation.json`: reviewed relevant declarations or instructions. Supports: Start gate versions and digest.
- `docs/photon-features/contracts-v1.md`: reviewed relevant declarations or instructions. Supports: Normative lane boundaries.
- `docs/photon-features/ownership.json`: reviewed relevant declarations or instructions. Supports: Owned paths and shared-change requests.
- `docs/photon-features/runtime-contract.md`: reviewed relevant declarations or instructions. Supports: Shared outbox, UoW, no client or stream ownership.
- `packages/photon-features/src/contracts/ports.ts`: reviewed relevant declarations or instructions. Supports: ExecutionServices and EventReducer interfaces; absent native extension.
- `packages/photon-features/src/contracts/events.ts`: reviewed relevant declarations or instructions. Supports: Normalized poll fields and missing actor/snapshot expressiveness.
- `packages/photon-features/src/contracts/execution.ts`: reviewed relevant declarations or instructions. Supports: Empty approvedAdvancedExtensions; claim fencing.
- `packages/photon-features/src/contracts/actions.ts`: reviewed relevant declarations or instructions. Supports: Five operation schemas and parent checks.
- `packages/photon-features/src/contracts/results.ts`: reviewed relevant declarations or instructions. Supports: Honest implementation and result status.
- `packages/photon-features/src/state/ports.ts`: reviewed relevant declarations or instructions. Supports: Durable poll/vote/reference/inbox/handoff/checkpoint records.
- `packages/photon-features/tests/fixtures/harness.ts`: reviewed relevant declarations or instructions. Supports: Independent SQLite fixture, clock and crash hooks.
- `/Users/darshan/.codex/skills/spectrum/SKILL.md`: reviewed relevant declarations or instructions. Supports: User-requested contract-gate workflow.
- `/Users/darshan/.codex/skills/spectrum/providers/imessage.md`: reviewed relevant declarations or instructions. Supports: Cloud provider routing.
- `/Users/darshan/.codex/skills/spectrum/capability-semantics.md`: reviewed relevant declarations or instructions. Supports: Warn-and-skip and no-op distinctions.
- `/Users/darshan/.codex/skills/spectrum/content/polls-groups-and-custom.md`: reviewed relevant declarations or instructions. Supports: Builder syntax.
- `/Users/darshan/.agents/skills/verification-before-completion/SKILL.md`: reviewed relevant declarations or instructions. Supports: Fresh verification workflow.
