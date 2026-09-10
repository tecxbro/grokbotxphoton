# WT-07 handoff

Implemented and locally validated all 17 native operations against Spectrum 12.8.0 and the tested F0 interfaces. Runtime integration, installation/activation, and live verification remain separate, pending stages.

## Repository and baseline

- Repository: https://github.com/tecxbro/grokbotonimessage
- Checkout: `/Users/darshan/Documents/ChatGPT/grokbotxphoton`
- Branch: `main`; HEAD/F0/comparison commit: `57e40736be8a59047b776654c766fbe8bfd10c9e`
- F0 SHA-256 contract digest: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8`
- F0 inventory: 71 contract files, 51 generated schemas. Fresh schema check matched the digest.
- Remote main observed through `git ls-remote`: `24468391b57f028b4b881ddbf71efab3a49a6f73`. HEAD was one commit ahead and zero behind. No fetch, branch change, worktree creation, reset, rebase, commit or push was performed.
- WT-07 implementation is uncommitted. Pre-existing package/lockfile edits and sibling work were present; see [initial-status.txt](./initial-status.txt). WT-07 edits are confined to its five owned directories.

## Operation status

Every row is built and passes lane tests. Every row is not yet integrated/activated/live-verified. SDK calls use the injected existing provider and exact serving route.

| Operation | Pinned public mapping | Supported envelope / prerequisite |
| --- | --- | --- |
| space.get | `provider.space.get(providerId, { phone })` | Scoped reference resolution; no remote-existence or delivery claim |
| space.create | `provider.space.create(member | members, { phone })` | Exact recipient intent; group requires dedicated line; optional name separately needs rename permission |
| space.getName | `space.getDisplayName()` | Dedicated group; absent name returns null |
| space.rename | `space.rename(name)` | Dedicated group and exact administrative intent |
| space.getMembers | `space.getMembers()` | Dedicated group; only member IDs returned |
| space.addMembers | `space.add(members)` | Dedicated group, exact recipient grant, iMessage roster precheck |
| space.removeMembers | `space.remove(members)` | Dedicated group, exact administrative grant, presence/service/cardinality checks |
| space.leave | `space.leave()` | Dedicated group, explicit leave grant, service/cardinality checks |
| space.getAvatar | `space.getAvatar()` | Dedicated group; null for absent icon; nonempty icon needs guarded host retention |
| space.setAvatar | `space.avatar(buffer, { mimeType })` | Dedicated group; shared guarded media port; integrity/format/size checks |
| space.clearAvatar | `space.avatar("clear")` | Dedicated group and appearance permission; no staging |
| space.setBackground | `space.background(buffer, { mimeType })` | Cloud account capability and explicit appearance intent; shared guarded media port |
| space.clearBackground | `space.background("clear")` | Cloud account capability and explicit appearance intent |
| account.shareContact | `space.shareContactCard()` | Native account identity only; host must verify account/profile prerequisites and sharing intent |
| effect.send | `space.send(effect(commonCompiledLeaf, SDKConstant))` | Text/markdown/attachment only; 13 explicit tested aliases; common compiler required |
| metadata.get | ResourceResolver message + public `timestamp`, `dateEdited`, `direction` | Authorized message and exact conversation/line; only F0 allowlisted metadata returned |
| custom.send | Named `native-account-contact-v1` → `nativeContactCard()` | Host-registered scoped card; strict schema; both custom/send-contact grants; no raw forwarding |

## Authorization and execution behavior

The 84 lane tests cover all 17 strict F0 schemas, exact intent and operation permissions, both selected dedicated lines, cross-project/account/line/chat references, direct/group restrictions, new-recipient changes, leave/appearance/contact grants, missing provider prerequisites, read-only behavior, guarded media integrity/retention, all effect aliases and leaf restrictions, metadata redaction, custom allowlist/resource/permission checks, composition bypass rejection, no group reply loop, cancellation, lease/context expiry, revocation during reads, missing send evidence, and ambiguous partial creation.

The lane supports group operations conservatively on dedicated lines so account identity and group reconciliation are stable. The pinned SDK can construct existing shared-group references and exposes some group APIs there; extending this lane to shared-group administration/read semantics requires host identity/capability evidence. Shared direct conversations remain supported when the host supplies capability and recipient grants.

Mutation completion is executor completion, not an Apple delivery or group-state observation. Void SDK methods produce no invented message ID or acceptance event. A thrown error after dispatch, or a missing effect-send result, is `unknown-outcome` with `reconcile-first`. Provider error text is redacted. The recovery codec never assumes an ambiguous mutation is safe to retry.

No group reducer is registered because F0 has no group projection table and this lane maintains no such state. WT-02 owns the durable group event stream and normalization. There is no additional listener or automatic reply.

## Validation

Commands ran from the checkout above with Node 24.13.0 on PATH, npm 10.9.2, TypeScript 5.9.3, Zod 4.5.4 and Spectrum/core/iMessage 12.8.0. The global shell still defaults to Node 23.11.0; it was not changed. The selected existing Node binary is `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node`.

| Command | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc -p packages/photon-features/tests/lanes/wt-07/tsconfig.json` | Passed; final lane build excludes mutable sibling implementations |
| `node --test packages/photon-features/tests/lanes/wt-07/build/tests/lanes/wt-07/native.test.js` | 84 passed, 0 failed |
| `npm test` | 31 passed, 0 failed |
| `npm run photon:build` | Passed |
| `npm run photon:test` | 60 foundation tests passed, 0 failed |
| `npm run photon:check` | Passed; exact F0 digest unchanged |

Exact invocation times, exit codes and logs: [validation.json](./validation.json). Final lane results: [final-isolated-tests.txt](./final-isolated-tests.txt). An earlier shared build encountered transient sibling errors; those files were not edited by WT-07, and the later full build passed. The isolated lane configuration remains available for independent verification.

Tests use the F0 harness and real temporary SQLite; public SDK builders are built for effects/appearance/contact and the implementation typechecks against pinned SDK public declarations. Provider/media/resolver calls are injected test doubles. No SDK client was constructed and no live message/group mutation was performed.

## Files and integration handoff

Implementation and test file hashes are recorded in [manifest.json](./manifest.json). Source status/version/hash records are in [sources.json](./sources.json) and [sources.md](./sources.md).

- `packages/photon-features/examples/wt-07/consume-native.ts`
- `packages/photon-features/src/features/native/appearance.ts`
- `packages/photon-features/src/features/native/custom-handlers.ts`
- `packages/photon-features/src/features/native/effects.ts`
- `packages/photon-features/src/features/native/guards.ts`
- `packages/photon-features/src/features/native/membership.ts`
- `packages/photon-features/src/features/native/metadata.ts`
- `packages/photon-features/src/features/native/module.ts`
- `packages/photon-features/src/features/native/sdk.ts`
- `packages/photon-features/src/features/native/spaces.ts`
- `packages/photon-features/tests/lanes/wt-07/.gitignore`
- `packages/photon-features/tests/lanes/wt-07/fixture.ts`
- `packages/photon-features/tests/lanes/wt-07/native.test.ts`
- `packages/photon-features/tests/lanes/wt-07/tsconfig.json`

Integration requests: [integration.md](../../requests/wt-07/integration.md). These cover scoped provider/intent authority, common media retention, aggregate/compiler registration, generated-reference context handoff, host group-event grant revalidation, and repeated cases with the real media/store/transport adapters.

| Stage | Status |
| --- | --- |
| Built | Yes, all 17 handlers plus two guarded compilers |
| Integrated with aggregate and real runtime ports | No; WT-00/host work requested |
| Installed / activated | No |
| Live verified | No |

No shared contract, dependency, migration, aggregate registry, host wiring, sibling implementation, or shared fixture was modified by this lane. No provisioning, billing, permission, service, hosting or bot configuration changes were performed.
