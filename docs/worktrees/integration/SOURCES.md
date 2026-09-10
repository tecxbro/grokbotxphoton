# Integration sources

## Normative official sources

The repository's verified official snapshots in `docs/photon/reference` are the
normative implementation source. `source-lock.json` records the seven explicitly
required pages and their frozen SHA-256 identities. A live read of
`https://photon.codes/docs/llms.txt` on 2026-09-10 confirmed the current index;
the supplied `.md` URLs were also verified from the committed source lock.

## Workflow guidance

Loaded local `spectrum` 3.1.0, `imessage` 9.1.0, `photon-cli` 2.0.0, and
`photon-webhooks` 1.0.0 skills. Also read Spectrum best practices, capability
semantics, cloud iMessage provider, lifecycle, advanced event/error recovery, and
webhook signature/delivery guidance. Skills are workflow guidance, not normative
SDK declarations.

## Public contracts

The installed package is pinned to `spectrum-ts` 12.8.0. Lane SDK probes and the
repository's foundation tests constrain the implementation. The public GitHub
repository and Git worktree/merge manuals were reviewed as workflow sources; they
do not upgrade lane test or runtime evidence.
