# WT-01 operating rules

WT-01 owns only the durable runtime, SQLite adapter, focused lane tests, and this directory listed in the current assignment. Shared contracts, migrations, package manifests, registry, host composition, fixtures, verification scripts, other feature lanes, and relocation-only edits are read-only.

All requests enter through an authenticated local principal. A context ID is only a lookup key: current principal, scope, task generation, revocation, expiry, permissions, and referenced-resource ownership must be checked authoritatively. Recheck cancellation, generation, and the active fence before consequential work and after every await.

Provider I/O never occurs in a database transaction. Reserve the request identity and child dispatch intent durably before I/O. A provider timeout or crash after dispatch is `unknown-outcome` with `reconcile-first`; local idempotency does not imply provider exactly-once delivery. Preserve returned provider evidence even if cancellation arrives after dispatch, then fence later children.

Transactions are synchronous, non-nestable, scoped to the public `UnitOfWork`, and commit domain state plus continuations atomically. Wake happens only after commit and carries a pointer. No feature receives private outbox, attempt, child, task, or handoff tables.

Verification evidence must distinguish focused tests, typecheck/build, aggregate verification, integration, activation, provider delivery/read, and device behavior. Do not claim a higher tier from a lower one.
