# WT-05 acceptance and evidence

| Case | Observable outcome | Evidence / status |
| --- | --- | --- |
| 1: Five operation entry points | All five handlers resolve authorized scope/identity. Create uses the public Spectrum builder; management explicitly returns blocked. | unit.test.ts + sdk-contract.test.ts; local pass. Actual get/vote/unvote/addOption blocked by CR-05-01. |
| 2: Single execution owner | Create dispatch passes through executeChild; repeated create and changed digest do not resend. Timeout, undefined/wrong response and post-send persistence failure are unknown-outcome/reconcile-first. | unit.test.ts and integration.test.ts; local pass. Production child recovery still requires WT-01. |
| 3: Durable native identity | Two polls in one chat remain separate; message/native GUID and option IDs are explicit; duplicate labels do not collide; originating task/generation preserved. | unit.test.ts + regression.test.ts, including SQLite close/reopen; local pass. |
| 4: Vote transitions | Multiple voters, verified independent multiselect, unvote, early-unvote tombstone, duplicate/stale/conflicting sequence and incomparable sources. | regression.test.ts; local pass. Raw single-choice/native vote reconciliation blocked. |
| 5: Atomic continuation | A failed continuation creation rolls back vote and work; repeated event/reconciliation creates no duplicate logical work; stale generation fenced. | integration.test.ts + regression.test.ts; public fixture pass. |
| 6: Unresolved safety | Early vote survives durable inbox restart; unknown actor/target, wrong line/chat/task, conflicting targets, missing ordering/semantics retain unresolved disposition. | regression.test.ts; local pass. Runtime capture/ack and quarantine re-normalization pending CR-05-02. |
| 7: Native option additions | Metadata registration preserves known IDs/text, rejects duplicate native IDs and partial snapshots, and replay creates one logical option continuation. No invented vote record. | regression.test.ts; local pass with supplied authoritative metadata. Native network lookup blocked. |
| 8: Validation gates | Pinned build/typecheck, source/ownership audit, schema and compatibility/regression checks pass. | TEST-EVIDENCE.md. Shared lane/ownership/docs gates remain failed for exact recorded tooling limitations. |
| 9: Integrated and live workflow | Real WT-01 store + WT-02 ingress/wake, host registration, recovery crash windows, native read/write and a real authorized user vote. | NOT RUN / NOT PASSED. No activation or live action authorized in this task. |
