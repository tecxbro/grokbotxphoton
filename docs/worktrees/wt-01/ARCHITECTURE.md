# WT-01 architecture

## Request and authority boundary

`admitRequest` performs bounded, strict wire validation before authority or I/O. `resolveAndAuthorizeContext` receives an authenticated local principal separately from the action, resolves the authoritative context and task, checks current generation/revocation/expiry/permission, and validates every resource against the full project/provider/account/line/chat scope. Status, cancellation, capability, doctor, and work methods resolve the same authority; possession of a request or context ID does not grant visibility.

`reserveRequestIdentity` binds the idempotency key to principal, full scope, task, generation, operation, and canonical arguments in one SQLite transaction. Concurrent identical submissions return the original result. Conflicting reuse fails before provider I/O.

## Transaction boundary

`createStateStore` uses Node's SQLite backend and applies the committed F0 migration. Transactions use `BEGIN IMMEDIATE`, compare-and-swap revisions, and rollback on any exception. The `UnitOfWork` facade exposes only domain tables plus `createContinuation`; each record is checked or bound to the active principal/task/generation/scope. It rejects async callbacks, nesting, retained use, wrong-scope records, and stale revisions.

A continuation and its referenced durable inbox events are committed with the domain mutation. Only after commit may a pointer-only wake be scheduled. No provider or network I/O runs inside the transaction.

## Claims, cancellation, and child effects

An execution claim binds owner, monotonically changing fence, task generation, and lease. `acquireClaim`, `renewClaim`, and `validateClaim` serialize account/line work and reject stale owners. `checkCancellation` validates the durable cancellation state and abort signal. Mutable authority is rechecked before dispatch.

Every consequential provider effect uses `executeChild`. Its identity is parent request plus child index; the caller-supplied stable key and canonical arguments digest must match on every replay. The runtime commits a prepared record and then a dispatching intent before invoking trusted program code. A completed child returns its durable result and earlier successful children are not replayed.

The provider call is outside SQLite. If it may have been transmitted but a definitive result cannot be recorded, the child and request remain `unknown-outcome` and require reconciliation. Spectrum 12.8.0 permits `Message | undefined` and fire-and-forget void-like results and does not expose a universal idempotency/reconciliation guarantee, so local exactly-once delivery is not claimed. Cancellation cannot retract an in-flight provider request: an actual returned result is recorded, while future children are fenced.

## Local handoff boundary

`createLocalServer` is Unix-domain only. Its parent directory must be owned by the current UID with mode `0700`; the socket is `0600`. Each single-line UTF-8 JSON frame is bounded, has exactly token and request fields, and is authenticated with constant-time token comparison. Responses are bounded, schema-safe data and redact configured credentials. The trust model protects against other OS users but does not claim isolation from a hostile same-UID process holding the credential.

Work is persisted before wake. `claimWork`, `heartbeatWork`, and `acknowledgeWork` check principal, task, generation, scope, lease, and fence transactionally. Repeating the same successful acknowledgement is safe; an expired owner cannot finish a newer claim.

## Receipts and recovery

`applyReceiptObservation` stores append-only evidence with actual scope, target or unresolved provider target, part, reader, source, and real timestamps. Duplicate identities are idempotent only when stable fields match. Early unresolved evidence remains durable and may later acquire an exact same-scope target mapping. Stale or rejection observations coexist with stronger delivered/read evidence; read never synthesizes delivery. Multipart and group ambiguity remain explicit.

`recoverPendingWork` performs no provider call. It clears safely expired pre-dispatch claims, converts dispatching attempts to unknown, preserves completed children and receipts, and blocks revoked/cancelled/stale work. Pending or uncertain resources are retained because F0 has no dependency-aware deletion contract.
