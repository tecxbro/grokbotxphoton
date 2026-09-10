# WT-00 F0 decisions

Accepted: use npm's existing root lockfile and a single private workspace package; exact Spectrum 12.8.0; Node 24.13.0 SQLite; TypeScript 5.9.3 with documented SDK compatibility settings; restricted Unix socket; all messaging handlers unimplemented; no approved advanced-provider extension.

Shared-change requests from a lane must live in that lane's request directory and state: requested contract/version change, affected operations and owners, public SDK export and exact-version probe, compatibility/migration impact, valid/rejected fixture changes, and validation command. WT-00 decides and integrates shared changes. Do not independently edit package metadata, dependencies, migrations, schemas, shared fixtures, registry or host composition.

A feature can implement a supported subset and emit truthful blockers for the rest. It must not register a test double or unsupported no-op as an implemented handler. WT-00 production composition remains incomplete until every owned operation has an intentional, capability-aware handler and recovery policy; schema registration alone does not satisfy that gate.
