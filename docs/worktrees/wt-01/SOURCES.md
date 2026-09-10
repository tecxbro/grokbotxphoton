# WT-01 sources

Official Photon-hosted Markdown is the behavioral documentation authority. The Spectrum and iMessage skills are workflow guidance and are recorded separately. The installed `spectrum-ts` 12.8.0 declaration files are the pinned public SDK compatibility authority.

All user-supplied `.md` URLs returned HTTP 200 with non-empty bodies on 2026-09-10. The initially browser-visible extensionless documentation pages were also inspected; body-level `.md` verification was performed independently with direct retrieval. Exact URL, media type, byte count, version where applicable, and SHA-256 are in `source-lock.json`.

Relevant conclusions:

- Persist a request/child identity before external I/O and retain a resume cursor or child journal.
- Recheck cancellation against the current chain/generation; a stale cancellation must not orphan newer work.
- Stable local identifiers reduce duplicates only when the provider actually honors them. Spectrum's public 12.8.0 `Space.send` contract returns `Message | undefined` (or arrays for multipart) and includes fire-and-forget operations; it does not certify universal provider deduplication.
- Provider exceptions and timeouts after possible dispatch are ambiguous. Reconcile instead of blind retry.
- Durable event recovery checkpoints only contiguous successfully handled events; missing or unattributable provider evidence cannot be invented.
- Read, delivery, acceptance, executor completion, and queued state are separate evidence dimensions.

`references/sdk-contract-notes.md` records the declaration-level observations used by the tests without copying third-party source bodies into production code.
