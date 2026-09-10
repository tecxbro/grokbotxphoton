# Receipt evidence contract

## Execution versus evidence
Queued, executor-completed, provider-accepted, observed-delivered and observed-read are distinct. The inherited OperationResult lifecycle is preserved for compatibility; receipt observations are a separate durable evidence ledger. A void SDK return is not receipt evidence. Missing read evidence means unknown, not unread. `message.markRead` is this program's control operation; Spectrum 12.8.0 exposes `message.read()` and `read(message)`. It is never proof that a recipient read an outgoing message.

## Identity and correlation
ReceiptObservation records evidenceId, complete project/provider/account/line/space scope, actual target reference or null, providerTargetId, actual partId or null, kind, real readerId or null, providerAt or null, observedAt, source and sourceRevision. Never synthesize provider timestamps, actual native target IDs or individual readers from a group chat. Evidence identity is stable within its scope. Conflicting reuse is quarantined; duplicate arrival alone does not create evidence.

`parseReceiptObservation` checks shape and target scope. `appendReceipt` is append-only and rejects conflicting evidence IDs; later duplicate observation time leaves the original record intact. Replaying an originally unresolved receipt after reconciliation preserves the newer target mapping; two conflicting non-null mappings still fail. `reconcileReceipt` requires an exact native target mapping in the same full scope, preserves original times and refuses an existing conflicting target. Reconciliation is a runtime transaction updating target correlation, never a replacement provider observation.

## Early, stale and out-of-order observations
Store unresolved receipts before target mapping exists. Later mapping reconciles without discarding the original observation or time. Derive independent accepted/delivered/read sets with `summarizeReceipts`; read-before-delivery does not invent a delivery timestamp. Stale snapshots and rejection observations remain evidence alongside stronger earlier read/delivery evidence, never overwrite it. Multipart aggregation requires exact part identity; parent-level observations cannot be spread across children.

Group read identity is nullable. A group-level event cannot establish every member read a message; only known readers enter readers[]. Current membership is not a historical denominator. Spectrum documentation says unattributable group reads and unresolved targets may be dropped upstream, so this program cannot recover evidence never delivered by the provider. Missing evidence stays unknown.

## Persistence and restart
The additive migration creates receipt_observations keyed by scope/evidence_id plus an index on native target/part. It preserves the baseline generic inbox/outbox/domain record layout and adds an execution_claims table. The selected fresh path is `.photon-local/runtime/photon.sqlite`; no production database is migrated by F0. Receipt restart tests create an isolated SQLite file, apply the migration twice, preserve an inherited inbox record, persist unresolved read evidence, close/reopen and correlate it.

Actual provider ingestion, transactional receipt insertion/reconciliation and request-result rollups belong to the runtime/inbound lanes. No second production outbox or receipt consumer is instantiated here. See [execution](execution.md) for cancellation and durable child invariants.
