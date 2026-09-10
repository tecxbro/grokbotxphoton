# WT-01 durable runtime and local handoff

This lane implements the persistence and authority boundary between Grok-selected operations and trusted local execution. It uses the single F0 SQLite state model and outbox, authenticates local callers independently of action JSON, fences execution and work claims, journals child effects, persists receipt evidence, and recovers without blind replay of ambiguous sends.

The lane does not create a Spectrum connection, provider client, feature handler registry, public execution route, second orchestrator, second production store, deployment, account change, or live send. Integration remains reserved for `wt-integration`.

The committed F0 includes compatible legacy runtime modules with older filenames and service types. They remain untouched unless they are one of the exact assigned files. The exact `f0-services-2` entry points are implemented in the filenames named by `FILES.json`; integration must explicitly select them.

See `ARCHITECTURE.md` for boundaries, `ACCEPTANCE.md` for observable cases, `SOURCES.md` and `source-lock.json` for source evidence, `TEST-EVIDENCE.md` for commands, and `HANDOFF.md` for evidence tiers.
