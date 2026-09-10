# WT-09 acceptance matrix

Statuses are `pending`, `passed`, `failed`, or `blocked`. A passing fixture case is not assembled or live proof.

| ID | Requirement and observable outcome | Test/evidence | F0 expectation | Status |
| --- | --- | --- | --- | --- |
| WT09-A01 | Correct registered repository/worktree/branch/F0 identity; relocation edits preserved | Git commands in WORKLOG | Must match | passed |
| WT09-A02 | All 44 operations retain schema/owner/test/evidence accounting | operation-coverage.json; registry/example checks | Schema coverage only; implementations remain unassembled | passed |
| WT09-A03 | Real CLI/socket/auth/context/durable executor/feature/provider-adapter path has one request, transport and outbox | local-roundtrip.test.ts | Required implementation gap must fail | failed: WT09-001 |
| WT09-A04 | Forged, expired, revoked, wrong-principal and cross-scope contexts fail; admin/new-recipient and status disclosure fail closed | context-scope.test.ts | Independently runnable | passed |
| WT09-A05 | Claims reject stale/conflicting ownership, cancellation/revocation, and preserve provider-success/crash as reconcile-first unknown | claim-fencing.test.ts; multipart-recovery.test.ts | Independently runnable | passed |
| WT09-A06 | Acceptance/delivery/read remain independent and exactly correlated by message/part/line/chat; missing/group evidence stays unknown | delivery-read.test.ts | Contract/local persistence only | passed in ledger/SDK fixtures; durable runtime failed: WT09-004 |
| WT09-A07 | Receipts restart/replay safely, do not double count, erase evidence, fabricate timestamps, cause replies, or authorize blind resend | delivery-read.test.ts | Local acquisition/reconciliation only | passed in ledger/router fixtures; durable runtime failed: WT09-004 |
| WT09-A08 | Poll IDs, duplicate labels, multiple voters/selections, unvote/add-option, early/out-of-order ingress, atomic continuation and restart are preserved | poll-restart.test.ts | Router/reducer seam may fail as product defect | failed: WT09-002 |
| WT09-A09 | App original target/session, refresh/codec, stale update, unsupported rehydration, callback auth/expiry/replay and missing backend are enforced | card-restart.test.ts | Independently runnable; no device rendering | passed locally |
| WT09-A10 | Multipart later failure preserves earlier parts, unknown children are not resent, and structured content bypasses prose formatting | multipart-recovery.test.ts | Independently runnable | passed locally |
| WT09-A11 | Exact raw webhook signatures/timestamps/tampering/envelopes/duplicates and durable-capture-before-ack behavior are enforced | webhook-auth.test.ts | Local Request/Response only | passed locally |
| WT09-A12 | Media traversal/symlink/redirect/private-address/race/size/timeout/interruption/retention controls fail closed | media-access.test.ts | Controlled network fixtures only | passed locally |
| WT09-A13 | Typing overlaps/delay/stop/error/cancel/timeout/restart never block real messages | inherited typing tests; local suite evidence | Independently runnable | passed locally |
| WT09-A14 | Clean/repeat inactive install, shutdown, compatible rollback and queued/unknown retention pass; original CLI/voice and generated examples remain intact | install-rollback.test.ts; regression commands | Runtime file-mode gap may fail | failed: WT09-003; other regressions passed |
| WT09-A15 | Live tests stay off by default and require exact expiring candidate/account/line/conversation/action approval; missing observations remain pending | authorized-smoke.test.ts | skipped/off by default, never counted PASS | passed gate behavior; live evidence pending |
| WT09-A16 | Integration owner runs exact test commit against exact assembled candidate and audits actual logs plus included product commits | HANDOFF.md | Cannot be satisfied in F0 lane | blocked |
