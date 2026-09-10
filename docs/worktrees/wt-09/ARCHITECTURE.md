# WT-09 test architecture

## Boundary under test

The intended assembled path is:

`CLI JSON -> private Unix socket -> credential authentication -> authoritative context/task authorization -> one durable outbox -> fenced executor/executeChild -> production feature handler -> one provider adapter`

The test must fail if any production stage is absent, replaced by a test fallback, bypassed through private tables, or duplicated with a second transport/outbox. An offline provider adapter is allowed only for deterministic local integration and is never described as live Photon evidence.

## Controlled failures

Tests inject failures only at named seams: before dispatch, after possible provider acceptance, during atomic database work, during webhook durable capture, during stream consumption, and during installation selection. Abrupt child-process exit models the provider-success/local-crash gap. Unknown child outcomes remain reconcile-first and block blind resend.

## Receipt model

Queue acceptance, executor completion, provider acceptance, observed delivery, and observed read are independent. The ledger is append-only and keyed by full project/provider/account/line/chat scope, provider target, logical target, part, evidence identity, kind, reader, and timestamps. Early receipts remain unresolved until exact mapping. Read never synthesizes delivered or accepted state; missing evidence stays unknown; group ambiguity never becomes universal readership.

Spectrum 12.8.0 exposes inbound `read` content and iMessage metadata snapshots (`dateDelivered`, `dateRead`, `isDelivered`), not a separate native delivered event. Tests therefore exercise the implemented message-stream normalization and metadata reconciliation paths without inventing an event.

## Restart and ownership

Temporary SQLite databases are closed and reopened to prove persisted state. Poll state and continuations must commit atomically; card updates retain the original SDK message/session or return an explicit rehydration blocker. Feature handlers never receive private task/outbox tables or create a feature-local journal.

## Live gate

`authorized-smoke.test.ts` is disabled by default. It requires a signed/hashed approval record, exact assembled candidate SHA, expiration, and exact account/line/conversation/action scope. Credentials alone are not authorization. Missing provider, user, receipt, backend, extension, or device evidence is pending/blocked and never PASS.
