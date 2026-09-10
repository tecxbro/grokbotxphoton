# Shared changes required

All commands below ran in `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-02` under Node 24.13.0. Exact executable/arguments/exits and output snapshots are in references/verification-results.json. No shared tooling, manifest, contract, fixture, dependency or other-lane code was edited.

## CR-02-001: Non-WT-00 aggregate verification
Command: `node scripts/verify-lane.mjs wt-02`

Exit 1, exact output:

```text
LANE_NOT_ASSEMBLED
```

The script explicitly rejects every lane other than wt-00 before running lane checks. WT-00/integration must add lane-specific suites, scope and evidence identity. Typecheck/build, all 67 lane tests, foundation/CLI regressions and schema/worktree checks passed independently; the required aggregate remains blocked.

## CR-02-002: Shared native lookup contract
`src/contracts/transport.ts` ProviderContext exposes only provider/scope/ready/start/stop. The owned resolveProviderContext returns that contract plus space() and lookupNativeMessageState(providerTargetId, {timeoutMs, signal}). WT-00 must approve a shared scoped lookup result/signature; integration can then bind the owned function without private SDK fields or another client. No claim that this extension already exists in the shared type or registered host.

## CR-02-003: Production receipt service and recovery correlation
Shared StateStore/ExecutionServices declare recordReceipt, but no production recordReceipt implementation is present in this checkout. There is also no public query/update operation to recover unresolved receipt observations and attach later reference registrations. The pure reconcileReceipt helper cannot persist that update. WT-01 must provide the shared writer and scoped correlation/recovery service using its existing receipt ledger. WT-02 accepts that writer and records stable scoped observations before ack; it does not implement database storage/migrations. Until binding exists, stream setup requires a writer and read webhooks without one return 503 after raw capture. No conversational receipt wake.

## CR-02-004: Ownership and lane documentation verification
Command: `node scripts/verify-ownership.mjs wt-02`

Exit 1, exact output:

```text
UNOWNED_PATH:.gitignore
```

The checker compares against foundation.startCommit (5c342f5...) rather than WT-02's F0 creation base, attributing inherited F0 files to WT-02. `.gitignore` was not edited in this task. It also does not exclude pre-existing relocation edits. WT-00 must compare lane-owned changes against the frozen F0 base and preserve pre-existing changes as separate evidence.

The shared ownership list lacks the user-requested message-events.ts, native-state.ts, receipt-observer.ts and receipt-reconcile.ts. User exact-file authorization supersedes that stale list; request the shared owner add those exact paths.

Command: `node scripts/verify-docs.mjs wt-02`

Exit 1, exact output:

```text
FILE_INVENTORY_DRIFT
```

FILES.json reflects the exact user-authorized files and owned reference snapshots. The checker requires equality with the older manifest, and further hardcodes WT-00 source locations/acceptance/evidence mode. Shared correction: verify the selected lane's current inventory, source snapshot root, acceptance cases and direct evidence. Independent source-hash, symbol, inventory and user-owned-diff audits are recorded separately; this shared docs check is not passed.

## CR-02-005: Existing Grok wake and host composition
legacyDiscovery.wakeBindingVerified is false and no deployment-specific notifyExistingTask binding was found. Integration must bind configuredGrokWake to the existing orchestrator, preserve pointer-only notification, and connect authoritative work retrieval/claim/ack. Missing configuration throws GROK_WAKE_NOT_CONFIGURED; no endpoints, model calls or transcript polling are invented. Select the new receipt-aware stream adapter or signed webhook ingress, bind the shared receipt writer, install the current typing FeatureModule, and wire waiting/connection/shutdown controls. Do this only in the authorized integration checkout after shared prerequisites exist.

## CR-02-006: Existing runtime capacity/recovery limitations
Inherited InboundRouter.pending caps shared inbox listing at 1000 and explicitly throws INBOX_PAGINATION_REQUIRED. Shared storage needs pagination/filtering before a larger inbox can be processed. Capture retention/process ownership and authoritative poll/card correlation remain integration-owned. Spectrum 12.8.0 has no public host-owned restart cursor/health callback; upstream ambiguous group reads and unresolved targets may be dropped. Do not claim zero loss or infer unread.

## Resolved test-environment issue
An absolute temp path under the relocated checkout exceeded macOS's Unix socket limit in an inherited foundation test. `TMPDIR=.photon-local` (relative to WT-02) passed all 125 tests without editing shared code. This is not an outstanding product fix or permission request.
