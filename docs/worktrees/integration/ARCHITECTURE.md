# Integration architecture

## Runtime ownership

The assembled candidate retains one existing Grok orchestrator and worker model.
One host owns Spectrum credentials, provider lifecycle, inbound capture, receipt
observation, and outbound dispatch. Feature modules receive only public
`f0-services-2` execution services and scoped provider bindings.

## Execution path

Authenticated local requests resolve an authorized context, reserve a durable
idempotency identity, acquire a fenced claim, and dispatch registered feature
handlers. Provider effects cross only the durable `executeChild` journal. Stable
child identities survive retry; timeout or disconnect after dispatch becomes
`unknown-outcome` and requires reconciliation before another send.

## Inbound path

The selected Spectrum owner opens live streams before catch-up, merges both paths
through one bounded durable ingress, deduplicates by provider identity/sequence,
and advances contiguous checkpoints only after successful processing. Webhook
ingress verifies freshness and raw-body HMAC before parsing, durably captures the
event before `2xx`, and treats duplicate delivery as success without repeating
downstream effects.

## Composition and feature modules

WT-01 supplies durable execution and SQLite state. WT-02 supplies transport,
ingress, receipt, wake, and typing boundaries. WT-03 through WT-07 supply public
feature modules. WT-08 supplies the inactive CLI/package lifecycle. WT-09 supplies
assembled verification. Integration owns registry, compiler composition, host
wiring, shared migration/contract amendments, and aggregate verification tools.

`assembleFeatureSurface` constructs the real lane factories and refuses an
incomplete or duplicate surface. It exposes all 44 public operation handlers and
the compatibility registry's 12 compiler families. The integration-owned poll
compiler uses Spectrum's public poll builder; other compilers remain lane-owned.
WT-07's public adapter wraps each native handler in one stable `executeChild`
while reusing the injected scoped provider rather than creating another client.

The immutable F0 declaration remains `photon-v3-f0` with digest
`d95caace...`. Post-F0 package/export/registry composition is recorded separately
in `candidate-contract.json`; integration verification never rewrites the tag or
the foundation declaration.

Optional provider capabilities remain native, fallback, warn-and-skip, accepted
no-op, or thrown-error according to the pinned Spectrum 12.8.0 provider contract;
a resolved promise alone is never delivery or device evidence.

## Activation boundary

Packaging and offline installation fixtures do not authorize runtime activation.
No account, line, permission, hosting, credential, provider, or device mutation is
part of this lane.
