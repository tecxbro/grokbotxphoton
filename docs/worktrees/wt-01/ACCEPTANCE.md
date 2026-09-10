# WT-01 acceptance cases

1. Invalid, oversized, recursive, or unknown-key request input is rejected before persistence or I/O.
2. Concurrent identical key use returns one durable request; changed operation/arguments under the same authorized identity returns `IDEMPOTENCY_CONFLICT`.
3. A forged principal, context from another principal, expired or revoked context, stale task generation, missing permission, wrong line/chat, or foreign reference cannot submit, read status, cancel, inspect capability/doctor data, or claim work.
4. SQLite uses the committed F0 schema, a private absolute path, WAL/full durability, synchronous non-nested transactions, CAS revisions, and rollback across domain state plus continuation.
5. Claims serialize the scoped queue, advance fences on new ownership, renew only the current live owner, and reject an expired/stale claim.
6. Cancellation before dispatch prevents the effect. Cancellation after dispatch cannot retract it: a returned result is retained and future children are fenced. A timeout/crash after possible send remains unknown.
7. Each child binds parent/index/stable key/arguments digest. Completed earlier children return their durable result after restart; conflicting identity or an unknown prior child is not replayed.
8. Void/`undefined` SDK-style completion maps only to executor completion unless separate acceptance/delivery/read evidence exists. No local exactly-once claim is made without a verified provider contract.
9. Local protocol accepts one bounded strict UTF-8 JSON frame over a private Unix socket, authenticates token-to-principal independently of request JSON, redacts credentials, and exposes only safe data.
10. Work is durable before wake. Repeated acknowledgement of the same fence is safe; an expired owner and stale fence cannot finish a newer claim.
11. Early unresolved, duplicate, stale, and out-of-order receipts survive restart. Read-before-delivery does not create delivery time; weaker or stale metadata does not erase stronger evidence; multipart and group ambiguity stay explicit.
12. Recovery performs no provider call, marks in-flight ambiguous attempts unknown, safely requeues only pre-dispatch work, retains successful children/receipts/resources, and blocks revoked/cancelled/stale requests.
13. Existing CLI behavior, shared contracts/migrations/tooling, batching, orchestration, voice behavior, and relocation-only edits remain unchanged.
14. Focused WT-01 tests, typecheck/build, and available regressions pass independently. Any aggregate verifier limitation is recorded verbatim and remains BLOCKED rather than relabeled PASS.
