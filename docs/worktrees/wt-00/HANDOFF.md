# Handoff

## Status
WT-00 implements the F0 public foundation and verification tools locally. Forty-four operations are cataloged; production registration is empty and missing components fail readiness. Branch photon-v3/wt-00-foundation, START_COMMIT 5c342f5eeb654b1ad7cb00e52855b425f25148ae. Tag photon-v3-f0 is created only after the clean committed HEAD passes the complete checks; the commit cannot embed its own SHA.

## Evidence
See [acceptance](ACCEPTANCE.md), [test evidence](TEST-EVIDENCE.md), [exact files and symbols](FILES.json) and [foundation digest](../foundation.json). Final command: node scripts/verify-lane.mjs wt-00. Also run the five specifically requested worktree/schema/ownership/docs/lane commands and node scripts/verify-all.mjs --mode=f0. Read .photon-local/verification.json for the exact tested HEAD/working-tree identity and per-command outcomes. Source lock: 24 verified official records, five full-tab 404 failures, all 15 skills verified and 104 index links preserved.

## Integration
The one existing Grok orchestrator/worker design stays intact. New feature authors use contracts/feature.ts and contracts/services.ts (public /feature and /services exports), not legacy root type names. WT-01 must implement the f0-services-2 execution adapter, durable executeChild and restricted transaction/continuation services; WT-02 owns provider/ingress/wake and receipt integration; feature lanes adapt their inherited private child hooks/table access. These adapters are not guessed or silently wired by F0.

Only WT-00 was created in this assignment. Other lane worktrees remain planned; use the exact map after F0 freeze. Integration belongs only in /Users/darshan/Documents/ChatGPT/grokbotxphoton-worktrees/wt-integration. Existing combined source does not establish provider integration. No runtime installation, activation, deployment, provisioning or live messages occurred. Full-product verification remains blocked until genuine assembled coverage and separately authorized live evidence exist.
