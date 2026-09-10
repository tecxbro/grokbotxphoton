# WT-09 defects

Product SHA under test: `ee2f8576b55973eee312bca5cad0549b6f959a88` (`photon-v3-f0`). Test/source/report commit: `dacae5e6626c7ec05b9c1a8f624ae342d0463004`. Evidence is local and sanitized; no live account was used.

## WT09-001 - durable text path is unimplemented

- Owner: WT-01 executor/host and WT-03 text integration.
- Command: exact 11-file owned-suite command in HANDOFF, or the compiled `local-roundtrip.test.js` alone.
- Expected: CLI JSON traverses one real Unix socket, credential and context authorization, one durable outbox/executor, the production `text.send` feature, and one offline provider-adapter send.
- Actual: the durable executor returns `blocked` with `UNIMPLEMENTED`; the provider adapter is not reached.
- Evidence: `local-roundtrip.test.ts` fails its required success assertion while also proving that no duplicate transport/outbox or feature-private database fallback was introduced.
- Retest: pending on an assembled candidate containing the owner implementation.

## WT09-002 - poll ingress cannot apply through the current fence

- Owner: WT-02 inbound router and WT-05 poll reducer/integration.
- Command: exact owned-suite command in HANDOFF, or the compiled `poll-restart.test.js` alone.
- Expected: early/out-of-order vote and add-option events persist, correlate by stable poll/option identity, and resume the atomic continuation across restart.
- Actual: the router/reducer seam rejects the event with `STALE_FENCE`.
- Evidence: surrounding poll identity, duplicate-label, multi-voter/selection, unvote, ordering, missing-ingress and restart fixture assertions pass; the assembled production seam does not.
- Retest: pending on an assembled candidate with compatible fence ownership.

## WT09-003 - SQLite runtime database is created as 0644

- Owner: WT-01 durable store and WT-08 packaging/install.
- Command: exact owned-suite command in HANDOFF, or the compiled `install-rollback.test.js` alone.
- Expected: runtime state database has no group/other permission bits (`mode & 0o077 === 0`) and remains compatible across inactive repeat install/rollback.
- Actual: the observed mode mask is decimal `36` (`0o044`), meaning the database is `0644`.
- Evidence: the clean/repeat inactive install, shutdown, rollback and queued/unknown retention fixture passes; the real runtime file-mode assertion fails.
- Retest: pending after the durable store creates/chmods the database to an owner-only mode.

## WT09-004 - durable runtime has no receipt acquisition API

- Owner: WT-01 durable store and WT-02 inbound/reconciliation integration.
- Command: exact owned-suite command in HANDOFF, or the compiled `delivery-read.test.js` alone.
- Expected: the production runtime store exposes durable receipt capture/reconciliation so normalized early read evidence survives restart and attaches after target registration.
- Actual: `typeof store.recordReceipt` is `undefined`.
- Evidence: ledger and public-SDK fixtures pass receipt independence, exact correlation, duplicate handling, monotonic snapshots, group ambiguity, no-reply routing, mark-read separation and restart behavior; the production durable store gate fails.
- Retest: pending on an assembled candidate with a public durable receipt acquisition/reconciliation seam.
