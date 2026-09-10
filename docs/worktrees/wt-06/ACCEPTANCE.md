# Acceptance reconciliation
The implementation and offline tests are complete within the owned public-service boundary. Shared and host dependencies remain explicit; partial cases are not promoted to passed.

| Case | Status | Observable evidence |
| --- | --- | --- |
| 1. Configured card operations | Passed offline | Real app/customized builders, separate static/live checks; missing template, extension and approved origin fail before effects. |
| 2. Original update target | Passed offline | Public edit builder uses original object; repeated void updates preserve references and refreshed metadata. |
| 3. Session persistence/restart | Partial: WT06-003 | Versioned bounded codec and original-handle checks pass; public domain binding persistence passes. Full snapshot storage has no F0 seam; cold-process rehydration is unavailable. |
| 4. Ordering/cancellation | Passed offline | Concurrent same/different module tests, admission revision and generation checks, media-await remapping fence, SQLite reopen reservation, uncertainty after dispatch. |
| 5. Callback validation | Passed offline; production backend absent | Raw bounds, backend authentication, immutable assertion check, participant/line/chat/task/generation/action/nonce/expiry rejection. |
| 6. Replay and atomic continuation | Passed offline | Single-use session consumption, duplicate event/nonce handling, SQLite continuation failure rollback and committed state after reopen. |
| 7. Host routing and wake | Partial: integration required | Unknown/absent sessions unresolved; durable exact event capture required; no feature-owned wake or server. Production backend capture and post-commit wake unassembled. |
| 8. Verification and scope | Partial: shared tooling blockers | 240 tests, typecheck/build/schema, identity, exact scope and source checks pass. Shared lane/ownership/docs gates remain blocked with exact outputs. |

references/verification.json contains the corresponding case records, focused test names, commands, counts, hashes and evidence limits. TEST-EVIDENCE.md and HANDOFF.md distinguish built, integrated, activated and live behavior.
