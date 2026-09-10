# Documentation authority and evidence

## Retrieval
`scripts/fetch-photon-docs.mjs` retrieves both supplied indexes first, retains all 104 discovered URL entries (including providers/extensions outside this product), then the five full-tab URLs and 22 exact focused Markdown targets. Anonymous reads are bounded to 15 seconds and 4 MiB each, four concurrent focused requests, no credentials. Source records include requested/final URL, actual HTTP status, UTC timestamp, media type, matching title/document identity, SHA-256, snapshot and failure. HTML/login/error/empty/mismatched pages cannot be verified as Markdown. MDX examples are source data, never executed.

## Observed sources
Both official indexes and all 22 focused pages were retrieved and verified: 24 successful official records. The five supplied full-tab URLs returned actual HTTP 404; their entries remain with failure and null hash/snapshot/identity. All 15 required GitHub skill/README targets were retrieved separately under lane references and classified skill. Local spectrum, imessage, photon-cli and photon-webhooks skills and the specified focused references were read. The official pages remain normative, not replaced by skills.

## Version reconciliation
The installed npm public packages are spectrum-ts/@spectrum-ts/core/@spectrum-ts/imessage 12.8.0 from the lockfile. Public types compile in sdk-compatibility.test.ts. The docs repository README explains that source prose can change independently of installed npm type extraction; main-branch GitHub source is not installed-package proof. Public implementation references inspected: https://github.com/photon-hq/docs/blob/main/README.md, https://github.com/photon-hq/docs/blob/main/scripts/sources.json, https://github.com/photon-hq/spectrum-ts and local committed repository sources. Git worktree/merge documentation was consulted for isolation/tag behavior; no merge occurs.

One retrieval validator initially misclassified the legitimate heading Error Handling as an error document. The classifier was corrected and that exact URL was fetched again; the final record is a verified 200 response. No material mismatch was found for the F0 SDK imports. Higher-level operation names are application contracts, not assertions that Spectrum exposes methods of those names.

## Review cadence
Every lane maintains the eleven working documents; [project rules](../../AGENTS.md) define timing. Automated docs verification checks sections, exact file/symbol inventory, source/title/hash/classification, numbered acceptance references and fresh hashed test logs for the current working-tree identity. Semantic API/receipt/recovery review still requires actual human/agent inspection; the wrapper reports this limitation explicitly.
