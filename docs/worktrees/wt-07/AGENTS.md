# WT-07 rules

Follow the repository `AGENTS.md`. Work only in WT-07-owned native iMessage implementation, tests, and lane documentation. Do not edit shared contracts, migrations, dependencies, registries, host code, media implementation, receipt observers, verification scripts, or another lane.

Use the injected authenticated Spectrum iMessage binding. Never create a client, choose a first configured line, enable a service, provision an account, or subscribe to provider events. Require exact scope, current claim/context, capability evidence, and explicit authorized user intent before provider or media access. Mutations that may have crossed the dispatch boundary are `unknown-outcome` and require reconciliation before retry.

Read-only operations may resolve provider state but must not alter settings. Group administration requires a dedicated cloud line and a real group. Media must pass through the shared guarded staging port. `custom.send` is allowlisted; no arbitrary payload, method, endpoint, or raw-provider bypass is permitted.
