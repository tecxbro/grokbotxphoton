# Change requests
## WT06-001 Shared verifier lane support
scripts/verify-lane.mjs explicitly rejects any lane other than wt-00 with LANE_NOT_ASSEMBLED. Run the exact command and capture output, then use direct pinned tooling for owned checks. Do not modify the verifier.

## WT06-002 Lane documentation validation
scripts/verify-docs.mjs requires the entire older ownership inventory rather than this assignment's exact file set; source snapshots are hardcoded to shared docs/photon/reference and wt-00. Evidence validation is hardcoded to the F0 report. Extend the shared verifier to support task-owned lane inventories, sources and acceptance evidence. Do not move lane artifacts into unowned locations.

## WT06-003 Public durable session payload and ingress integration
f0-services-2 UnitOfWork supports card/session/reference records and createContinuation, but no versioned session payload or feature inbox access. Keep minimum supported domain bindings; full provider metadata snapshots are exportable but not written to private checkpoints. Host must durably capture authenticated callback events including selection before reduction, bind their correct execution services and dispatch pointer-only wake after commit. Approve a typed session payload/reconciliation extension before full snapshot persistence or cold-session recovery can be claimed. Production integration must use the public module; legacy compatibility exports retain older runtime requirements.

## Recorded command outputs (Node 24.19.0, WT-06)
- `node scripts/verify-lane.mjs wt-06`: exit 1, `LANE_NOT_ASSEMBLED`; no lane checks run by that command.
- `node scripts/verify-worktree.mjs wt-06`: exit 0; independently confirms relocated registered path and photon-v3/wt-06.
- `node scripts/verify-ownership.mjs wt-06`: exit 1, `UNOWNED_PATH:.gitignore`. It compares WT-06 against foundation.startCommit (pre-F0), charging all F0-owned files to WT-06. Required correction: compare lane work against immutable F0 and account for protected relocation changes separately.
- `node scripts/verify-docs.mjs wt-06`: exit 1, `FILE_INVENTORY_DRIFT`; subsequent source/evidence validations are hardcoded to WT-00 and require the corrections described above.

All independently executable checks continue. No shared file was edited to bypass a gate. Callback single-use consumption is implemented; arbitrary repeated forms, full stored callback payloads and host dispatch still require the shared integration described in WT06-003.
