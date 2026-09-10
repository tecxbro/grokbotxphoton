# Test evidence
## Candidate identity
Base/tested HEAD: ee2f8576b55973eee312bca5cad0549b6f959a88, with task-owned working changes. Node: /Users/darshan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node (24.19.0). SDK/core/iMessage 12.8.0; TypeScript 5.9.3. Exact commands and exit codes are in references/verification.json after final evidence capture. A content digest covers the seven source and four new test files independently of documentation and relocation edits.

## Direct results
- New unit/sdk-contract/integration/regression suite: 40 passed, 0 failed, 0 skipped.
- Inherited WT-06 suite: 44 passed, 0 failed, 0 skipped.
- Public foundation: 65 passed; inherited foundation: 60 passed; existing CLI: 31 passed. No failures or skips.
- Package typecheck, build, schema drift check: exit 0.
- Worktree verifier: exit 0, correct registered WT-06 path and branch.
- Shared lane verifier: exit 1, LANE_NOT_ASSEMBLED.
- Shared ownership verifier: exit 1, UNOWNED_PATH:.gitignore because it compares against START_COMMIT before F0.
- Shared documentation verifier: exit 1, FILE_INVENTORY_DRIFT; expects inherited full ownership inventory instead of the current task's exact scope.

## Evidence boundaries
The 240 passing tests are offline. The SQLite integration case proves persisted domain CAS, atomic callback consumption/continuation rollback and reopening using a test facade around existing shared SQLite primitives. Child replay is a contract fixture, not the production executor or a live provider. Actual public SDK builders and declarations are exercised, but SDK sends are stubbed. Void edit completion is not delivery, rendering or backend callback proof.

No integration, activation, installation, live message, account/extension provisioning, callback service, hosted return-path verification, device rendering, delivery/read or cold-process provider rehydration was performed. Missing full durable snapshot payload remains WT06-003; callbacks require an actual authenticated backend and exact durable captured event before reduction.

## Final review
Manual review: complete. Verified public/legacy entry point separation, all effect/claim boundaries, original SDK metadata ownership, exact resource identity after awaits, revision CAS reservation, unknown-outcome retry classification, bounded callback trust and transaction scope. Corrected the expiry test to isolate callback expiry from claim expiry. Independent source/ownership/protected-patch checks pass.

Final source-and-new-test digest: `5f2db897b6a800e18b0971a25a51b995ec857dd6a82e083b918df8a76df0ab5f`. Tests are attached to this content digest even though documentation and the eventual commit SHA change afterward.
