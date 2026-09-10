# WT-08 local executable and operating skill

WT-08 owns the `grok-photon` local CLI, registry-generated operator guidance and examples, and deterministic inactive packaging/install/rollback tooling. It adapts the frozen F0 local protocol without owning a Spectrum SDK session, provider credentials, runtime composition, feature handlers, or the public Photon CLI.

The required commands are `capabilities --json`, `execute --json-stdin`, `status --request-id <id> --json`, and `doctor --json`, plus durable `work.list`, `work.claim`, `work.heartbeat`, `work.ack`, and request cancellation. Status and discovery are authenticated through the local socket principal and authoritative context.

See `ARCHITECTURE.md` for trust and distribution boundaries, `ACCEPTANCE.md` for observable cases, `TEST-EVIDENCE.md` for results, and `HANDOFF.md` for the final evidence-tier report.
