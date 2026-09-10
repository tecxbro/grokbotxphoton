# WT-00 integration preflight: blocked before integration

## Exact identity

- Repository: https://github.com/tecxbro/grokbotonimessage.git
- Worktree: `/Users/darshan/Documents/ChatGPT/grokbotxphoton`; sole worktree; branch `main`.
- HEAD/F0: `57e40736be8a59047b776654c766fbe8bfd10c9e`.
- Comparison and live remote main: `24468391b57f028b4b881ddbf71efab3a49a6f73`; 1 ahead, 0 behind.
- F0 contract digest: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8` (71 files, 51 schemas; fresh check passed).
- Tested snapshot: `870f4a14ef6d3937c7c3703ab9d89030c2e92e3dc9dda5af569feb5d56785a46` at `/var/folders/mw/7sj15dn14z5g9zdvmmhzf1280000gn/T/wt00-integration-preflight-miwhhyyo`. This is a plain temporary file copy, not a branch/worktree.
- Integration commit: none. Tested release commit: none. Included lane commits: none.
- WT-01 through WT-09 reviewed commits: not supplied. Lane handoffs describe uncommitted work on the same main checkout.
- Existing package.json/package-lock.json modifications and all existing lane files were preserved. Full dirty inventory and file hashes: snapshot.json.

## Fresh verification

Node 24.13.0, npm 10.9.2; package @grokbot/photon-features 0.1.0, existing CLI 0.2.2; Spectrum/core/iMessage 12.8.0, advanced-imessage 2.1.0, Zod 4.5.4, TypeScript 5.9.3, @types/node 24.10.1; SQLite from selected Node. Clean dependencies installed in the temporary snapshot with lifecycle scripts disabled. Global runtime unchanged.

| Command | Exit / result |
| --- | --- |
| `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node --version` | 0; [versions.log](./versions.log) |
| `npm --version` | 0; [npm-version.log](./npm-version.log) |
| `npm ci --ignore-scripts` | 0; [clean-install.log](./clean-install.log) |
| `npm test` | 0; [original-cli.log](./original-cli.log) |
| `npm run photon:build` | 0; [build.log](./build.log) |
| `npm run photon:test` | 0; [foundation.log](./foundation.log) |
| `npm run photon:check` | 0; [contract-drift.log](./contract-drift.log) |
| `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node --test --test-reporter=tap packages/photon-features/dist/tests/e2e/card-restart.test.js packages/photon-features/dist/tests/e2e/feature-runtime.test.js packages/photon-features/dist/tests/e2e/inbound-events.test.js packages/photon-features/dist/tests/e2e/install-rollback.test.js packages/photon-features/dist/tests/e2e/local-roundtrip.test.js packages/photon-features/dist/tests/e2e/multipart-recovery.test.js packages/photon-features/dist/tests/e2e/poll-restart.test.js packages/photon-features/dist/tests/e2e/single-ownership.test.js packages/photon-features/dist/tests/e2e/typing-lifecycle.test.js packages/photon-features/dist/tests/lanes/wt-09/sdk-and-voice.test.js packages/photon-features/dist/tests/live/authorized-smoke.test.js packages/photon-features/dist/tests/security/claim-fencing.test.js packages/photon-features/dist/tests/security/context-scope.test.js packages/photon-features/dist/tests/security/media-access.test.js packages/photon-features/dist/tests/security/webhook-auth.test.js` | 1; [wt09.log](./wt09.log) |
| `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node packages/photon-features/scripts/generate-skill.mjs --check` | 0; [generated-skill.log](./generated-skill.log) |
| `npm pack --dry-run --json --workspace=@grokbot/photon-features` | 0; [package-boundary.log](./package-boundary.log) |

WT-09: 78 tests, 74 passed, 3 failed, 1 live test skipped. Offline provider fixtures and temporary SQLite/socket/installer tests do not prove provider delivery or deployment. `npm pack --dry-run` produced no final release artifact.

## Blocking defects and ownership

1. WT09-001: durable executor returns blocked/UNIMPLEMENTED for the production text module. WT-00 must settle shared per-provider-call execution services and request/claim access; WT-01/WT-03 own feature adoption. Do not certify the complete multi-call handler as single-call.
2. WT09-002: router and poll reducer both update inbox/continuation state, producing STALE_FENCE. WT-00 must assign one transactional owner; WT-02/WT-05 own adoption.
3. WT09-003: runtime SQLite is created 0644 under ordinary umask and installer rejects it. Establish DB/WAL/SHM private creation through the shared host/storage contract; preserve installer checks.
4. poll.get, poll.vote, poll.unvote, poll.addOption are explicitly unimplemented application integration. They are not provider blockers. WT-05 requests a scoped public advanced poll API extension with consistent snapshot/event semantics.
5. Production entrypoint, process lock, one actual store/outbox/SDK, aggregate registration, resource/media/stream bindings, authoritative grants, durable retrieval/claim/ack wiring and existing Grok notification binding remain unassembled. Real Grok wake/continuation is unverified.
6. No reviewed lane commits, approved integration workflow or exact clean assembled candidate. Packaging also requires bin metadata, aggregate integration gate and genuine workflow approval. No approval record was fabricated.

## Required contract decisions

Review each lane request under docs/photon-features/requests/wt-01 through wt-09. Publish a single exact shared amendment/digest only after integration inputs/workflow are resolved. Required decisions include execution child boundary; authoritative request/claim access; one inbox/handoff owner; private state creation; atomic media admission; card admission revision; recipient/admin grants; scoped poll extension/normalization; registry/codecs/exports; and host/process composition. No amendment or ownership reassignment was made here.

## Source inventory and capability evidence

Collected 567 records across WT-00–WT-09, preserving both original sources.json and sources.md. Shared index: [integration-preflight-2026-09-09T03-38-17Z](/Users/darshan/Documents/ChatGPT/grokbotxphoton/docs/photon-features/sources/integration-preflight-2026-09-09T03-38-17Z/index.md).
All 44 operations, lane declarations, tests and blockers: [operation-matrix.md](./operation-matrix.md). These are attributed declarations and independent offline seam evidence, not 44 assembled successful calls. Source mismatches remain visible in the collected records.

## Release gates

- F0: existing committed foundation; fresh digest check passed.
- G1: fails production text seam; host not assembled.
- G2: fails missing poll application code and production bindings.
- G3: fails three independent WT-09 assertions; no exact assembled candidate.
- G4: not attempted; no releasable candidate or final artifact. Synthetic installer cases are not final artifact qualification.
- G5: not authorized or run.

## Installation and rollback commands

No concrete release checksum or installation command exists yet. The current tooling accepts these future command forms (placeholders are not executable release instructions):

```sh
node packages/photon-features/scripts/package.mjs /absolute/assembled-candidate /absolute/approval.json /absolute/artifacts/release.gpf.gz
node /absolute/tools/install.mjs install /absolute/release.gpf.gz <sha256> /absolute/grok-photon
node /absolute/tools/install.mjs rollback /absolute/grok-photon <previous-release-sha256> confirm-inactive
```

Keep package.mjs beside install.mjs. Installation selects inactive; activation remains separate. Preserve queued and unknown-outcome work. Only schema-1 compatibility currently has synthetic test evidence. No installation, activation, account provisioning, billing, hosting migration, permissions changes or live messages were performed.

## Configuration and suspension limits

Missing verified scope/line/phone mapping, authoritative context/intent grants, private credential configuration, selected transport, process owner/supervisor, original SDK resource restoration, card templates/backend authentication and existing Grok wake/task-acceptance binding. No production values were guessed or credentials accessed. During host suspension/offline periods, execution/wake cannot progress and in-flight calls may remain unknown. Public stream restart replay/cursor coverage is unverified; capture recovery does not establish an uptime or zero-loss guarantee. No keep-awake mechanism was added.

## Concurrent changes observed

These original files changed after capture; test evidence refers only to the retained snapshot:
- `docs/photon-features/evidence/wt-02/handoff.md`
- `docs/photon-features/evidence/wt-04/build.txt`
- `docs/photon-features/evidence/wt-06/aggregate-build.txt`
- `docs/photon-features/evidence/wt-07/package-build.txt`

## Completion statements

Code built: yes, captured dirty snapshot only.
Integrated: no.
Installed and activated: no.
Live verified: no.

## Input required

Provide each lane’s exact reviewed commit and approved integration workflow, or explicitly authorize reviewing and committing the current owned lane files here on main before integration. This is required by the user-provided instruction to use immutable reviewed lane commits and integrate only through the user-authorized workflow. Feature correction ownership remains with the existing lanes unless explicitly reassigned and recorded.
