# WT-08 architecture

## Local IPC boundary

`main()` reads bounded arguments/stdin, `executeCommand()` converts only the supported CLI grammar into the frozen strict `LocalRequest`, `callRuntime()` authenticates to the one existing local runtime over an owner-only Unix socket, and `formatCommandResult()` emits one JSON line plus redacted stderr guidance and a stable exit code. Action JSON carries a context lookup key, never a principal or credential. The socket authenticator and runtime context resolver remain authoritative for every method, including status, capability discovery, doctor, cancellation, and work handoff.

The CLI never imports or starts Spectrum, never owns provider credentials, and never exposes a public execution endpoint. A write followed by timeout/disconnect is `TRANSPORT_UNCERTAIN`; it is not automatically retried. The runtime result keeps executor lifecycle separate from append-only provider observations, and absent delivery/read evidence stays unknown.

## Durable work boundary

A wake is pointer-only. The orchestrator lists work, claims a handoff, consumes the returned durable typed events, persists task acceptance, heartbeats with the returned fence, and acknowledges only after durable acceptance. Lease, task generation, principal, scope, and fence are revalidated by the runtime. Ack does not mean the outbound operation completed.

## Registry and skill boundary

`generateSkill()` and `validateExamples()` import the compiled canonical registry and strict action parser. The generated operation table, hashes, per-operation examples, and the four assigned examples therefore do not form a second handwritten schema. Registration does not prove a handler, provider capability, delivery, or read receipt. The handwritten skill sections define resource resolution, idempotency, cancellation, ambiguity, unknown outcomes, and the preserved voice policy.

## Distribution boundary

`buildPackage()` accepts only a clean, committed, workflow-approved assembled candidate and records exact code, dependency lock, toolchain, platform, F0 digest, tests, checksums, schemas, examples, skill, and manuals. `installPackage()` verifies and stages an immutable owner-only release with activation disabled. `verifyInstallation()` is offline and cannot call a host or provider. `rollbackInstallation()` verifies the installed release and SQLite schema compatibility, then changes only the inactive selection pointer; it preserves queued/unknown work and rejects incompatible downgrades.

Package metadata/bin registration and final runtime assembly are shared/integration-owned. WT-08 requests those changes instead of editing protected files.
