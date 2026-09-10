# WT-08 sources

## Authority and retrieval

Official Photon-hosted Markdown and live OpenAPI documents are normative for public CLI/API/Spectrum behavior. The `photon-cli`, `spectrum`, and `photon-api` skills are workflow guidance and do not authorize account, billing, provisioning, activation, or live messaging changes. The local F0 contracts and pinned installed declarations control this executable's local protocol.

On 2026-09-10, WT-08 retrieved 27 sources with HTTP 200, validated final URL/path and content shape, stored exact bytes under `references/`, and recorded SHA-256, byte count, content type, and retrieval time in `source-lock.json`. This includes all 15 requested official pages/OpenAPI documents and 12 requested skill files.

## Version status

- `spectrum-ts` is lockfile-pinned to 12.8.0 with npm integrity `sha512-5qJxpB0XRwW1Zhcma8dTR8zTKH/2zkvyNnIle4WS05KQK5fkFdpRmwzuyEE25Wpkim2rGjb17gY11/z2bqHknQ==`.
- Local skill metadata: `photon-cli` 2.0.0, `spectrum` 3.1.0, and `photon-api` 1.1.0.
- The Photon skills snapshots were pinned to repository commit `11f5d755a652fff73b4410559b1c1d7d5f30a522` rather than trusting a moving `main` body.
- The observed `photon-hq/spectrum-ts` main commit was `ff44053f821fcffb967797d0a204d8bfebae91c3`; this is source status only. Runtime compatibility remains pinned to the installed 12.8.0 package contract.

## Applied conclusions

The public Photon CLI is a management/control-plane surface and its tokens are not Spectrum project credentials. Runtime messaging belongs behind the existing Spectrum runtime. Spectrum read controls do not prove recipient reads, and successful send-routed calls can be fallbacks, skips, or no-ops; therefore the local result retains separate lifecycle and receipt evidence.
