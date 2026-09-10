# Acceptance and evidence mapping

All operation implementations are local/contract evidence only. Aggregate and product integration gates remain blocked.

| Case | Observable acceptance | Status / evidence |
| --- | --- | --- |
| 1 | All 13 schemas accept committed valid fixtures and reject malformed/executable payloads | Passed: unit.test.ts, 13 individually named schema cases; integration getter/selected-handler test |
| 2 | Full voice policy and structured-content bypass | Passed: unit and integration prose/Markdown/composition cases; retained operations/streaming tests |
| 3 | Composition preflight, registry delegation, wrapper/group/count bounds and opaque group child | Passed: unit and integration tests; pinned SDK group probe |
| 4 | Actual scope/line/chat/provider/direction/parent/owner validation | Passed: integration wrong-target, reaction-parent and refreshed message.get cases |
| 5 | Expired/future/retracted/other-principal mutations rejected; void results have no fake IDs | Passed: integration mutation/void tests and actual Spectrum runtime SDK probe |
| 6 | Completed children replay, unknown outcomes stop later sends, cancellation retains accepted references | Passed: shared services integration tests; retained recovery suite. Production durability not proved |
| 7 | Stream single consumption, bounds, cancellation, expiry/deadline, source/provider errors and fallback reporting | Passed: regression.test.ts and retained streaming suite |
| 8 | Pinned public SDK exports/returns and public module registry contract | Passed: sdk-contract.test.ts plus foundation sdk-compatibility.test.ts |
| 9a | Full package pinned typecheck/build and existing CLI behavior | Passed: typecheck-final/build-final logs and 31 CLI tests |
| 9b | Lane-owned paths, protected edits and official/skill snapshot identities | Passed: independent source/ownership audit; exact source hashes and FILES.json |
| 9c | Shared aggregate verifier and product end-to-end | BLOCKED/FAILED: LANE_NOT_ASSEMBLED; shared ownership/docs rules; inherited e2e UNIMPLEMENTED and local socket-path constraints. See CHANGE-REQUESTS.md |
