# WT-00: assembled candidate and aggregate test wiring required

WT-09 test preparation is implemented in its owned directories. No exact assembled candidate SHA was supplied, and F0 still reports no integrated runtime. Do not interpret another lane's uncommitted correction as present in the tested snapshot.

Please supply the exact assembled commit and comparison commit in the existing authorized checkout. WT-09 must not create, switch, reset or rebase branches/worktrees. Register WT-09 e2e/security/lane tests in the aggregate integration command and include live tests only with their disabled-by-default guard. `npm run photon:test` currently runs WT-00 only. The packaging script expects `photon:test:integration`; WT-09 cannot edit root/package metadata or host registration.

Keep WT09-001, WT09-002 and WT09-003 red until their real integrated corrections are available. No production changes are included in this lane. Review the operation coverage and requirement matrix before release. An exact candidate, explicit live account/line/conversation authorization and later incoming vote/device evidence remain separate gates.
