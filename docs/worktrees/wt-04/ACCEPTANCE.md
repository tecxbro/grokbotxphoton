# Observable acceptance cases

| ID | Observable case | Direct result and test evidence |
|---|---|---|
| A1 | Exactly four public handlers; consequential sends use executeChild | PASS: integration public module fetch/send, public voice policy, public contact success |
| A2 | Scope, native mapping, parent chat and phone precede download | PASS: integration wrong phone/chat/parent/attachment/scope and mapped native IDs |
| A3 | Traversal/symlink/inode swaps cannot redirect reads | PASS: unit approved-file test and inherited staging access-race suite |
| A4 | HTTPS/host/DNS/redirect/connected-peer controls | PASS: inherited network suite plus regression redirect and late-response tests |
| A5 | Actual byte/deadline/concurrency/disk bounds; interrupted imports cleaned | PASS: regression oversize/timeout/interrupted, misleading length, unread-body capacity, stalled body, storage capacity |
| A6 | Resource metadata and bytes survive SQLite restart | PASS: regression shared SQLite restart and metadata corruption; integration reply voice duration |
| A7 | Pending resources retained and tombstones cannot be reopened | PASS for domain/fixture behavior: unit public retention, regression cleanup/restart; inherited pending/unknown-work checks. Production no-consumer proof/admission wiring remains BLOCKED on CR-04-1 |
| A8 | Real pinned attachment/voice/contact/vCard inputs and outputs | PASS: sdk-contract suite, unit vCard/fields, integration explicit ordinary-audio fallback |
| A9 | Async cancellation/fence/generation stops new sends; unknown outcomes do not replay | PASS: integration claim-change tests and shared-child ambiguous-result replay test; production executor recovery not claimed |
| A10 | Verification and ownership/evidence tiers remain honest | Direct checks PASS, aggregate BLOCKED as recorded in TEST-EVIDENCE.md and CHANGE-REQUESTS.md; no activation/live evidence |
