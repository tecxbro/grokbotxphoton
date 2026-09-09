# Agent working guide

Standalone repository: https://github.com/tecxbro/grokbotxphoton.
Last updated: 2026-09-09 for product separation. Historical F0 evidence remains unchanged.
Read this file and [architecthure.md](architecthure.md) when starting a lane assignment.

The former root Grok Bot CLI, its tests, demos, changesets and publishing workflows are excluded from this product. The external Grok orchestrator remains an integration dependency; its implementation is not bundled here.

## Mission and boundaries

- Build the deterministic Photon Feature Runtime; the existing Grok Bot orchestrator delegates substantive work to existing worker Bots.
- Codex builds the integration package and operating skill; Grok Bot must not generate integration code during normal operation.
- Keep one host responsible for Photon credentials, client lifecycle, ingress and production outbox.
- Keep inbound transport, outbound provider and Grok wake-up separate; wake notifications only point to durable work.
- Do not add another reasoning model, keyword router, Grok API integration or transcript polling.
- Do not migrate hosting, modify iMessage-agent-render or select the macOS local provider because development runs on a Mac.
- Do not provision lines, change billing/approval settings, activate services or send live messages without explicit task authorization.

## Checkout and ownership

- Work only in the assigned checkout; inspect branch, HEAD, upstream/divergence and dirty files before changes.
- Report the comparison commit and current merge-base separately; leave the original creation base unknown unless proven.
- Do not create/switch branches or worktrees, reset, rebase or force-push unless the assignment explicitly permits it.
- Preserve unrelated changes and stage only task-owned files when committing.
- Follow [ownership.json](docs/photon-features/ownership.json) for every lane's implementation, test and documentation paths.
- WT-00 owns shared contracts, dependencies, migrations, aggregate registration, host composition and these two living root guides.
- Submit shared-change requests in `docs/photon-features/requests/wt-NN/`; do not independently edit shared contracts.

## Implementation rules

- Use injected `ExecutionServices` and the shared transaction/resource ports; feature modules must not create clients or subscriptions.
- Treat context IDs and resource references as lookups requiring authenticated, current authorization.
- Use installed exact-version public SDK exports/types as API authority; never bypass missing support through private SDK internals.
- Keep provider support, account/conversation availability, implementation and unit/SDK-contract/live evidence separate.
- Keep queued, executor completion, provider acceptance, delivered/read observations and unknown outcomes distinct.
- Keep fixtures under tests; schema existence or a fake provider must never satisfy a production implementation gate.
- WT-03 owns voice formatting and WT-08 owns its operating guidance; preserve [the voice policy](docs/photon-features/contracts-v1.md#voice-policy-preservation).

## Verification commands

Use Node 24.13.0 and npm 10.9.2 on PATH; exact dependency versions and compatibility limitations are recorded in [foundation.json](docs/photon-features/foundation.json).

| Check | Command from repository root |
| --- | --- |
| Product foundation tests | `npm test` |
| Independent offline integration/security verification (known failures) | `npm run test:verification` |
| Package compilation and public SDK probes | `npm run photon:build` |
| F0 foundation tests | `npm run photon:test` |
| Schema and foundation digest drift | `npm run photon:check` |
| Regenerate shared schemas, WT-00 only | `npm run generate --workspace=@grokbot/photon-features` |

For one lane, run `npm run test:lane -- dist/tests/lanes/wt-NN/*.test.js` inside `packages/photon-features`; it compiles the package, then selects that lane's tests. Run relevant checks after changes and record their actual results.

## Living documentation and handoff

- Update this guide when working rules, ownership or verified commands change; update [architecthure.md](architecthure.md) when architecture, interfaces or integration status changes.
- Coordinate shared guide edits through WT-00 so parallel lanes do not overwrite one another.
- Keep detailed contracts authoritative in [runtime-contract.md](docs/photon-features/runtime-contract.md) and [contracts-v1.md](docs/photon-features/contracts-v1.md); link to them rather than duplicating them.
- Preserve historical checkpoint evidence; record new dated evidence and distinguish decisions from proposed work.
- Handoffs must state commit/dirty state, validation, blockers and separate code-built, integrated, installed/activated and live-verified status.
- Report an actual commit SHA only after it exists; uncommitted work is not part of a published checkpoint.
