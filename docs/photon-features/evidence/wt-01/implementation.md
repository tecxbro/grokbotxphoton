# WT-01 implementation and operating boundary

The lane contains a durable SQLite execution engine and a Unix-domain protocol server. It uses the committed F0 SQLite store and migrations as its transactional implementation. It owns no Spectrum connection, ingress subscription, provider credentials, or separate outbox.

## Interfaces

- `DurableSQLiteStore` extends F0 `SQLiteStore` / `TransactionStore`. All inserts and updates use its frozen `Transaction` contract and revision CAS. An additional read-only connection performs keyset discovery and conservative FIFO predecessor checks. Database, WAL and SHM reside under a private 0700 directory; symlinks and multiply linked files are refused.
- `DurableContexts` implements `ContextResolver` with persisted context/task lookup on every access. It validates principal, scope, task generation, cancellation, expiry, revocation, permissions, reference identity/parent ownership, staged-media manifests, and stream/session validity. Host policy must explicitly approve administrative intent and recipient lists.
- `DurableSubmission` implements F0 `SubmissionPort`: strict admission, scoped canonical idempotency reservation, authorized status, and cancellation. Existing reservations never invoke a provider. `authorized:true`, unknown operations and unknown fields are rejected.
- `ExecutionClaims` uses monotonic fences, explicit owner/generation/lease, heartbeat without fence renewal, and current authorization checks. `DurableExecutor` bounds active requests and deadlines. Children have stable request/index identities; attempts progress through prepared/dispatching/returned/unknown. Child outcomes and recovery checkpoints commit atomically. Earlier multipart references survive later failure.
- `DurableEngine` is an explicitly activated driver for the existing F0 outbox, exposing F0 host lifecycle ports. It wakes after committed submissions and schedules only local lease-expiry work. It contains no model, Grok API or external orchestrator polling. Construction does not start execution. `ready()` becomes false if its driver fails.
- `applyInteraction` validates a typed event and atomically commits inbox, reducer state and handoff, or an unresolved record when no reducer exists. Event identity includes source/project/provider/account/line/event identity; delivery timestamp changes do not create another logical event. Wake happens after commit. Failed/duplicate wake cannot erase the handoff. It is an integration seam for WT-02, not an ingress adapter.
- `DurableWork` implements retrieval, claim, heartbeat and acknowledgement. An exact repeated completed acknowledgement is idempotent; a stale fence cannot acknowledge a newer claim. Ack means task responsibility was accepted, not provider delivery.
- `DurableLocalProtocol` implements the exact F0 methods: submit, status, capabilities, diagnostics, work.list, work.claim, work.heartbeat, work.ack, request.cancel. The brief's execute/doctor concepts map to submit/diagnostics; no extra wire methods were invented.

## Execution and evidence rules

A resolved void SDK call is executor-completed with no invented message reference. Provider acceptance and delivery/read evidence remain distinct. Reported provider statuses require matching observations; raw provider error text/codes and capability objects are removed from operation responses. Protocol diagnostics expose only readiness and activation. Socket errors expose codes and opaque IDs, never stack traces. Known local credential strings are redacted from encoded responses.

Fencing prevents stale database commits and new calls through the approved boundary. It cannot cancel or retract an already transmitted provider request. Timeouts, post-dispatch cancellation/revocation, process death, and stale lease loss preserve unknown outcomes. No automatic resend, provider idempotency key or advanced extension is enabled. Generic retryable SDK errors are not sufficient evidence that a write never transmitted.

The line is the conservative ordering resource: requests serialize across project/account/line, including different conversations on that line, so conversation and line-wide controls cannot overtake one another. Unknown or blocked predecessor requests pause later requests on that line. Different lines can use the configured concurrency. This deliberately trades throughput for ordering safety. One host is required; the driver is not a multi-host scheduler.

Expired claimed requests undergo recovery before reclaim. Prepared work can resume. Completed child checkpoints suppress already-recorded calls. Expired work handoffs remain listable and are fenced again on claim. Keyset scanning does not silently stop at the first 1000 records. Recovery never makes provider calls. No automatic retention deletion is implemented; all resource dependencies, partial results, and unknown operations remain stored.

## IPC trust and lifecycle

The server binds only an absolute Unix-domain socket under an owner-owned 0700 directory and chmods the socket to 0600. It refuses existing paths, validates configured 64-hex credentials, authenticates outside action JSON, uses constant-time comparison, limits frames/responses to 262144 UTF-8 bytes, accepts one newline-delimited JSON frame per connection, rejects malformed UTF-8, limits active connections to 64, and imposes an absolute five-second connection deadline. Requests arriving after the first complete frame are never dispatched on that connection. Public TCP endpoints do not exist.

OS permissions isolate OS users. Unrestricted processes sharing the OS account can read secrets, inspect process memory, or impersonate cooperative principals. A local token does not establish hostile same-user process isolation, authenticated peer PID, or per-worker OS identity. Parent paths must be administrator-controlled; the implementation does not pin directory descriptors against privileged rename races. Root/admin access is outside this boundary. The host must provision random credentials securely and never pass them in command arguments.

`compose-engine.ts` is construction-only and uses injected real dependencies. It neither constructs a Spectrum client nor starts a service. Feature doubles exist only under WT-01 tests. The frozen aggregate registry/host still selects no WT-01 production implementation. Integration, package exports, actual provider capability checks, resource/media/stream adapters, host locking, and installation await the shared-change requests.

## Limits requiring explicit handoff

The complete provider-integrated objective cannot be claimed under unmodified F0: the frozen handler services lack a mandatory per-child side-effect boundary. `ExecutionBinding` and `executeChild` provide a concrete adapter for review, with safe certification rules documented in the request. Arbitrary F0 handlers, builders or SDK objects are not automatically fenced. No installed or live messaging integration was verified.

The storage implementation uses synchronous SQLite transactions and discovery scans. The driver catches fatal errors by marking itself not ready, without logging user payloads or credentials; the existing host must monitor that readiness. Automatic data deletion, transport receipt correlation, and provider reconciliation are intentionally unavailable pending shared contracts. These are functional limitations, not claims of exactly-once delivery.
