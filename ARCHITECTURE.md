# Foundation architecture

## Assembled implementation
The standalone product exposes strict Zod operation/content/reference schemas, a public feature-services contract with no private task tables, an injected host seam, durable receipt state, and schema/checker tooling. The integrated registry fails closed unless all 44 handlers and 12 compiler families are present.

## Flow and ownership
Trusted local invocation resolves principal and expiring/revocable context before scoped references. A fenced claim surrounds every state change and executeChild dispatch. One runtime owns credentials, inbox/outbox, attempts and children; features own domain records through UnitOfWork only. Durable continuation is created transactionally; wake carries only a pointer. Inbound authentication precedes capture; provider dispatch and wake are separate ports.

## Transactions and recovery
Synchronous domain transactions cannot await provider I/O. Child preparation is durable before dispatch, and ambiguous dispatch must return unknown-outcome until reconciled. Cancellation fences new effects, not effects already accepted. Receipt evidence is append-only, independently correlated and never fabricates provider times/readers. Fresh SQLite migration preserves the existing record layout; no production database is opened.

## Non-ownership and limitations
The legacy Grok Bot CLI is not part of this repository. Runtime features cross the public durable-child boundary and receive scoped state/resource services. Unrestricted same-UID processes are not isolated by an opaque context ID; OS process isolation/credential separation is needed against malicious local peers.

## Interfaces
See [execution](docs/contracts/execution.md), [receipts](docs/contracts/receipts.md), and [operations](docs/contracts/operations.md) from shared docs; root ARCHITECTURE.md is the project entry point.
