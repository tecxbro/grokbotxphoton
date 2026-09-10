# WT-08 acceptance

1. `main()`, `executeCommand()`, `callRuntime()`, and `formatCommandResult()` implement the supported strict CLI grammar with one JSON stdout line, separate stderr, bounded UTF-8 input/frames, redaction, and stable exits.
2. Capabilities and doctor are read-only; execute/status/cancel and every work method use the authenticated local principal/context and accept no authority override flags.
3. Host unavailable/not-ready, malformed/oversized input, unsafe credential/socket files, invalid host responses, and post-write uncertainty are reported without retrying or exposing secrets.
4. Status preserves executor and provider observations separately; queued/completed are never called delivered/read, and absent receipts remain unknown.
5. Work list/claim returns durable events; heartbeat/ack enforce current lease/fence/generation; a pointer-only wake is insufficient and ack follows durable task acceptance.
6. `generateSkill()`/`validateExamples()` derive all operations, schemas, hashes, and examples from the real registry/parsers, including `create-poll.json`, `reply.json`, `send-voice.json`, and `update-card.json`.
7. The skill teaches exact invocation, resource references, idempotency, receipt interpretation, unknown outcomes, safe retry/fallback, work claim/ack, cancellation, ambiguity, and the preserved fuller voice policy.
8. `buildPackage()` produces deterministic checksummed archives only from a clean workflow-approved assembled candidate and includes compiled JS/types, schemas/examples/skill/manuals, exact dependencies, platform/version, and tested-code provenance.
9. `installPackage()` is repeat-safe and inactive, preserves unrelated files/credentials/full voice policy, validates target compatibility, and performs no network, account, send, or activation operation.
10. `verifyInstallation()` is offline; `rollbackInstallation()` preserves queued/unknown work and fails `INCOMPATIBLE_DOWNGRADE` before changing state or selection.
11. Unit, SDK-contract, integration, regression, generator/schema, typecheck/build, legacy CLI, ownership/diff, and direct archive/manual checks pass without weakening shared contracts.
12. Handoff distinguishes built, integrated, activated, provider delivery/read, and physical-device evidence, and records all unresolved shared gates and untested behavior.

## Reconciliation

Cases 1–10 and 12 have direct passing evidence in `TEST-EVIDENCE.md`. Case 11 has passing focused/typecheck/build/schema/legacy/manual evidence, while the aggregate shared lane, ownership, and docs wrappers remain blocked by the exact stale-tool failures in `CHANGE-REQUESTS.md`; those failures are not converted to PASS.
