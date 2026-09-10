import { test } from "node:test";
import assert from "node:assert/strict";
import type { IncomingEvent, TransactionStore } from "../../../src/index.js";
import { pollEvent, registerPoll, scope, seed } from "./support.js";

/** WT-01/WT-02 can register the same assertions using their real store/router.
 * Each factory must allocate an independent database and route accept through the shared UoW.
 * failNextCommit must fail that UoW after reducer writes but before COMMIT.
 */
export interface PollIntegrationFixture {
  store: TransactionStore;
  accept(event: IncomingEvent): Promise<void>;
  failNextCommit(): void;
  close(): void;
}
export function registerPollIntegrationContract(label: string, factory: () => PollIntegrationFixture) {
  test(`${label}: real store/router contract keeps task correlation and deduplicates work`, async () => {
    const f = factory();
    try {
      seed(f.store);
      const a = registerPoll(f.store, "integrated-a", "origin-a");
      const b = registerPoll(f.store, "integrated-b", "origin-b");
      const first = pollEvent(a);
      const second = pollEvent(b, { eventId: "event-b", providerEventId: "provider-b" });
      await f.accept(first); await f.accept(second); await f.accept(first);
      const work = f.store.transaction(tx => tx.list("handoffs", scope, 100));
      assert.equal(work.length, 2);
      assert.deepEqual(work.map(w => w.taskId).sort(), ["origin-a", "origin-b"]);
      assert.ok(work.every(w => w.state === "pending" && w.generation === 1));
    } finally { f.close(); }
  });
  test(`${label}: failed commit leaves neither a vote nor a continuation`, async () => {
    const f = factory();
    try {
      seed(f.store); const p = registerPoll(f.store); const event = pollEvent(p);
      f.failNextCommit();
      await assert.rejects(f.accept(event));
      assert.equal(f.store.transaction(tx => tx.list("votes", scope, 100).length), 0);
      assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 100).length), 0);
      await f.accept(event);
      assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 100).length), 1);
    } finally { f.close(); }
  });
}
