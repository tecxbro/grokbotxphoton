# WT-09 independent verification

Run from the repository root with Node 24.13.0 and npm 10.9.2 on PATH:

```sh
node packages/photon-features/tests/lanes/wt-09/verify.mjs
```

This captures a hashed copy of the observed sources in a temporary directory, runs a clean dependency install there, builds, runs the original CLI and foundation checks, executes WT-09, and validates generated skill/examples and the npm package boundary. Logs and provenance are written only under `docs/photon-features/evidence/wt-09/`. A failing test causes a nonzero exit. The source checkout, branches, production dependencies and other lanes are not modified. Temporary copies are not Git worktrees or assembled candidates.

For final verification, WT-00 must supply a candidate SHA and make that exact candidate available in the existing checkout. Set `WT09_CANDIDATE_SHA` to that SHA before running the same command. The runner refuses a HEAD mismatch or non-WT-09 dirty changes; it never switches branches. A candidate SHA by itself does not establish assembly or live success. The report must still evaluate the operation inventory and every test result.

For a focused reproducer, use the snapshot path recorded in `latest-run.json` and the exact command in its `snapshot.json`. Tests under `e2e/feature-runtime.test.ts` and `e2e/poll-restart.test.ts` intentionally retain required successful behavior when integration fails. Do not invert assertions or turn failures into skips.

Evidence boundaries:

- Public Spectrum builders execute offline against the pinned package.
- Context, submission, claims, crash recovery, IPC, installer and reducers use real temporary files/SQLite. Provider functions and the app backend are controlled fixtures.
- The CLI-to-text-feature test composes actual available components. It is a seam integration test; the WT-00 production host/registration is still required.
- Installer fixtures validate file selection, safety and state preservation. Synthetic archive metadata never represents a released/tested candidate.
- No provider account, line, conversation, live incoming vote or device rendering has been verified.

The runner always clears live opt-in variables. To run the live text smoke separately, first obtain explicit user authorization for the exact action and candidate. Record the user authorization reference, approver, expiry, full account/line/conversation scope, complete `text.send` action and its SHA-256 in a private approval JSON file matching `tests/live/authorized-smoke.test.ts`. The hash covers `JSON.stringify(action)`. Include the socket and private credential-file paths; never include the credential value. Set `WT09_LIVE_APPROVAL_FILE` to that file and `WT09_LIVE_CANDIDATE_SHA` to the independently verified candidate SHA, then run only the compiled live test. Environment configuration is not permission. The runtime must independently enforce its context grants.

The live smoke submits one approved text and polls its existing request status. It asserts provider acceptance only; it cannot certify delivery/read, poll interaction or card rendering. It never auto-provisions, changes billing, mutates groups, or selects an unrelated target. No live action is authorized by this README.
