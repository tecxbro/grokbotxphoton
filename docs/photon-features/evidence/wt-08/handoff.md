# WT-08 implementation handoff

WT-08 source and local tooling are implemented and tested. The assembled runtime is not integrated, installed/activated or live verified by this lane. No final release artifact was created. Installation/rollback tests used temporary synthetic archives and real temporary SQLite state only.

## Repository identity

- Repository: https://github.com/tecxbro/grokbotonimessage
- Path: /Users/darshan/Documents/ChatGPT/grokbotxphoton
- Branch: main
- HEAD and F0 commit: `57e40736be8a59047b776654c766fbe8bfd10c9e`
- F0 digest: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8`
- Comparison and live-verified origin/main: `24468391b57f028b4b881ddbf71efab3a49a6f73`; provable divergence 1 ahead, 0 behind.
- Existing tracked package/lock changes and other lanes' untracked work were preserved. No branches/worktrees were created or switched; no commits/pushes. WT-08 changes remain uncommitted. Baseline/current dirty inventory: [baseline.json](baseline.json).

## Implemented surface

`capabilities --json`, `execute --json-stdin`, `status --request-id ID --json`, `doctor --json`, `cancel --request-id ID --json`, `work.list`, `work.claim`, `work.heartbeat`, `work.ack` with documented JSON flags and bounded numeric options. Only the frozen Unix-socket protocol is used. Authentication stays outside action JSON in an owner-protected file; task context comes from launcher configuration and is revalidated by the host. Strict action parsing and bounded UTF-8 framing preserve stdout/stderr separation and stable exit behavior. After-write transport uncertainty never triggers automatic resubmission. Bin symlink invocation is tested.

The skill explains every invocation, resource scope and target ambiguity, stable identity, all lifecycle outcomes, allowed fallbacks, durable task acceptance/claim/heartbeat/ack, cancellation/fences/generation, retry limits and preserved voice policy. All 44 operation listings/examples come from the shared registry, shared strict parsers and F0 fixtures; their exact schema hashes are in the generated table. Generation does not claim registration equals implementation.

Distribution tooling uses reproducible gzip JSON archives, compiled JS/public declarations, schemas, 44 validated examples, skill/manuals, private launcher, pinned dependency lock, freshly installed dependencies, platform/architecture, artifact checksum and commit/F0/test provenance. It requires an approved clean assembled candidate, shared bin metadata and an offline integration test gate. Installer stages immutable releases inactive, uses owner-only directories/files, refuses owner/socket/config conflicts and modified releases, preserves fuller skills, and changes only inactive selection during compatible rollback. Actual database schema versions other than tested schema 1 fail clearly without deleting work.

## Validation

Node 24.13.0, npm 10.9.2 and package-local TypeScript 5.9.3. Exact commands, timestamps, exit codes and logs: [validation.json](validation.json).

- WT-08 focused compilation: passed.
- CLI tests: 6 passed, 0 failed.
- Distribution/documentation tests: 7 passed, 0 failed.
- Existing CLI regression suite: 31 passed, 0 failed.
- Full package build plus F0 suite: 60 passed, 0 failed.
- Full schema/foundation drift gate: passed; 71 digest files and 51 schemas retain F0 digest.
- Generated skill/examples drift: passed; 44/44 examples validate.
- Ordinary offline smoke: passed, no host/provider calls.
- Initial transient compile failures occurred in concurrent WT-04 media work; no WT-04 files were edited here. Final full build and gates above passed after that lane progressed.

## Files and integration boundary

[files.json](files.json) lists every WT-08 implementation/documentation/test/example path with SHA-256. This evidence directory also contains source access/review records and test logs. [sources.md](sources.md) and [sources.json](sources.json) distinguish retrieved pages, read excerpts, pinned supplementary commits and local authority. All official `.md` variants were checked individually.

Required shared changes are in [../../requests/wt-08/integration.md](../../requests/wt-08/integration.md): package bin/files, offline all-lane integration gate, approved candidate/workflow handoff, shared response validation, deployment entrypoint/owner-lock coordination, state/codec compatibility, and reconciliation lookup gaps. There is no new dependency or direct SDK integration request.

Full archive generation, fresh dependency closure/native-codec validation and production activation remain integration work. F0 has no system-wide host owner implementation; the installer alone cannot guarantee an uncooperative host will honor locks. No live messages, account provisioning, billing, hosting or permission changes were performed.
