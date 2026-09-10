# WT-04 handoff

Implemented the four media operations and the shared F0 staging port using Spectrum 12.8.0 public APIs. Changes are confined to the five owned WT-04 directories. The commit boundary is WT-04 only. No worktree, branch, registry, contract, migration, package/dependency metadata, host composition, or other feature was changed by this lane.

## Checkout and foundation

- Repository: https://github.com/tecxbro/grokbotonimessage
- Path: `/Users/darshan/Documents/ChatGPT/grokbotxphoton`
- Branch: `main`
- HEAD / F0 commit: `57e40736be8a59047b776654c766fbe8bfd10c9e`
- F0 SHA256: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8`
- Comparison / verified remote main: `24468391b57f028b4b881ddbf71efab3a49a6f73`
- Baseline divergence before the WT-04 commit: ahead 1, behind 0. No push requested.
- Initial unrelated dirty files: `package.json`, `package-lock.json`, `agent.md`, `architecthure.md`, WT-01 evidence. Other lanes added files concurrently. Full initial/final observations: [baseline.json](baseline.json).

## Four-operation status

| Operation | Implemented behavior | Evidence / limits |
| --- | --- | --- |
| `attachment.send` | Resolve authorized staged/native bytes, validate size/MIME, call public `attachment(Buffer, {id,name,mimeType})` and scoped `Space.send` | Real builder/call shape tested; provider send mocked; returned native IDs mapped to new logical resource references in shared storage |
| `attachment.fetch` | Resolve authoritative logical-to-native mappings, verify native parent/conversation/phone membership, call public `getAttachment(nativeGuid, phone)` and bounded `stream()`, persist staging result | Native retrieval route/metadata tested; missing mappings fail closed; no live provider retrieval |
| `voice.send` | Send an existing validated audio resource via public `voice(Buffer, {name,mimeType,duration})` | Native voice versus explicitly selected regular-audio attachment fallback tested and reported through capability support; no speech generation/transcription/calls |
| `contact.send` | Validate F0 name/phones/emails, call public `contact`; host vCard import/export uses `fromVCard` and `toVCard` | Structured and vCard subset round trips tested; account contact sharing remains WT-07 |

`undefined` SDK send results and exceptions after dispatch produce unknown outcomes requiring reconciliation. SDK acceptance is recorded separately from delivery/read observations; neither is invented. The module adds three content compilers and conservative recovery codecs. It does not add another message reducer or event listener.

## Exported staging and host API

The public lane barrel is `packages/photon-features/src/features/media/index.ts`; host composition example: `packages/photon-features/examples/wt-04/host-composition.ts`.

- `SafeMediaStager.create(options)` implements F0 `MediaStager.resolve(media, context): Promise<{bytes, mimeType}>`. Its richer concrete result also preserves metadata. Other features use `ExecutionServices.media.resolve` without private implementation imports.
- Trusted host imports: `stageFile(path, metadata, context, claim, signal?)`, `stageUrl(url, context, claim, signal?)`, `stageNative(reference, context, claim, signal?)`.
- `resolveWithSignal` adds cancellation for owned media operations; `collect` performs explicit final release, with durable read pins and tombstones.
- `nativeMediaSource(resources, bindings, store, normalizedMetadata?)`, `mediaProvider(existingApp)`, `NormalizedMediaLookup`, `ScopedMediaBinding`, and `SourceMetadata` expose typed host/provider seams.
- `assertActionMediaAvailable(tx, action, context)` is the required atomic admission check before enabling cleanup in the shared host.
- `compileContact`, `normalizeContact`, `importVCard`, `exportVCard` implement the permitted contact subset.

Staging files are private UUID-named `.bin` files. Metadata, integrity, ownership, generation and retention information use the existing `stagedMedia` and `checkpoints` tables. No new storage backend is introduced. Native metadata retains the logical source reference (including line/conversation), native retrieval handle, native message/conversation IDs, MIME, original name, size and duration where available. The SDK never receives an untrusted URL or caller path.

## Verification

Node `24.13.0`, npm `10.9.2`; the shell's global Node was not replaced. Toolchain prefix for repository commands:

```sh
export PATH=/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin:$PATH
```

Clean reproduction was made from `git archive` of the exact F0 HEAD plus only WT-04 source/tests/examples, with its own dependencies and temporary resources. No branch or worktree was created. Location and observed timestamps are in [reproduction.json](reproduction.json).

| Command | Result | Log |
| --- | --- | --- |
| `npm ci --ignore-scripts` in isolated F0 copy | exit 0 | [clean-install.txt](clean-install.txt) |
| `npm test` in isolated F0 copy | 31 passed | [existing-tests.txt](existing-tests.txt) |
| `npm run photon:build` in isolated F0 copy | exit 0, including host example | [build.txt](build.txt) |
| `npm run photon:test` in isolated F0 copy | 60 passed | [foundation-tests.txt](foundation-tests.txt) |
| `npm run photon:check` in isolated F0 copy | exit 0; exact F0 digest, 71 files, 51 schemas | [schema-check.txt](schema-check.txt) |
| `npm run test:lane --workspace=@grokbot/photon-features -- 'dist/tests/lanes/wt-04/*.test.js'` in isolated F0 copy | 36 passed | [clean-lane-tests.txt](clean-lane-tests.txt) |
| `node packages/photon-features/tests/lanes/wt-04/verify.mjs` from working checkout | 36 passed; independent temporary compile/output | [lane-tests.txt](lane-tests.txt) |
| `npm run photon:check` from working checkout, final run | exit 0; exact F0 digest | [shared-check-latest.txt](shared-check-latest.txt) |
| `git diff --check` plus owned untracked source whitespace inspection | passed | source inventory below |

An earlier aggregate check encountered in-progress WT-01/WT-06 TypeScript errors; [foundation-check.txt](foundation-check.txt) preserves that observation. The later aggregate run passed without WT-04 editing those lanes.

Safety tests cover bounded generic/image/video/audio/vCard inputs, invalid MIME/signatures and missing files, traversal and outside roots, file/ancestor symlinks and access races, hardlinks, descriptor pinning, forbidden URL schemes/credentials/ports/IP literals, private/metadata/mapped/transition addresses, mixed DNS answers, redirect revalidation/loops, DNS rebinding and actual HTTPS lookup/connected-peer checks, misleading/missing content length, actual byte limits, timeouts, interrupted streams, temporary-file cleanup, bounded concurrency, durable read pins across instances, restart persistence, pending/unknown/retry retention, unresolved-input retention, saturated scans, final collection/tombstones, scoped native retrieval, opaque/native IDs, normalized metadata retention, contact round trips, and explicit voice fallback. Network fixtures use isolated local HTTP servers or injected DNS/transport fixtures; no internal service or live iMessage was contacted.

## Integration and limitations

See [integration requests](../../requests/wt-04/integration.md) for the concrete WT-00/WT-01/WT-02 handoff. Package export/aggregate registration/host binding, atomic staged-reference admission, and authoritative incoming provider-ID mappings remain unwired by this lane. Current WT-02 voice snapshot capture needs to retain `Voice.id` where present. Optional `NormalizedMediaLookup` consumes the typed inbound metadata without importing WT-02 private files.

Cleanup must remain disabled in host composition until atomic admission is connected. Retention is deliberately conservative: unresolved scope consumers and truncated scans prevent deletion. Process-death read pins require proof of final release; they never expire speculatively. F0 has no delete primitive, so tombstone records remain. Staging orphan files after a hard crash before store commit are not automatically swept; this avoids deleting another process's uncommitted resource.

The MIME allowlist is in `safety.ts`. Header/signature checks reject obvious MIME mismatches; they are not full codec validation or antivirus scanning. F0 requires bounded byte materialization (maximum 25 MiB, default concurrency 4) before SDK upload. Native codec/transcoding availability and provider behavior are not live verified. The SDK's metadata RPC and send methods have no public AbortSignal parameter; download waits/streams are bounded, but the lane cannot cancel an already dispatched native send. Spectrum attachment retrieval returns primary data; Live Photo companions and rich contact metadata beyond the F0 subset remain outside this contract. No HEIF conversion was added.

## Delivery status

- **Built:** yes, four handlers, three compilers, staging, safety and contact helpers.
- **Integrated:** tested through the F0 registry in isolation; production aggregate/transport/runtime composition pending the requests above.
- **Installed/activated:** no.
- **Live verified:** no. No messages, provisioning, billing, hosting or platform permissions changed.

## Files and source evidence

[changed-files.txt](changed-files.txt) lists every created WT-04 file, including evidence and requests. [source-manifest.json](source-manifest.json) records SHA256 for all 19 source/test/example/configuration files. [sources.json](sources.json) and [sources.md](sources.md) record exact requested/read URLs, local public SDK artifacts, actual read status, observed version/commit/hash, operation/test associations, and inaccessible `.md` variants.
