import test from "node:test";
import assert from "node:assert/strict";
import { SQLiteStore, type Transaction } from "../../../src/index.js";
import {
  storeFixture,
  seedHandoff,
  scope,
  FailureHooks,
} from "../../fixtures/harness.js";
test("transaction rollback across inbox and handoff, CAS, reopen durability", () => {
  const f = storeFixture();
  try {
    const hooks = new FailureHooks();
    hooks.failAt("after-write");
    assert.throws(() =>
      f.store.transaction((tx) => {
        tx.put(
          "unresolved",
          {
            id: "u",
            scope,
            revision: 0,
            eventId: "e",
            reason: "test",
            checkpointId: null,
          },
          null,
        );
        hooks.hit("after-write");
      }),
    );
    assert.equal(
      f.store.transaction((tx) => tx.get("unresolved", "u")),
      undefined,
    );
    seedHandoff(f.store);
    const second = new SQLiteStore(f.path);
    try {
      assert.equal(
        second.transaction((tx) => tx.get("handoffs", "handoff-1"))?.state,
        "pending",
      );
    } finally {
      second.close();
    }
    f.store.transaction((tx) => {
      const h = tx.get("handoffs", "handoff-1")!;
      h.revision++;
      tx.put("handoffs", h, 0);
    });
    assert.throws(
      () =>
        f.store.transaction((tx) => {
          const h = tx.get("handoffs", "handoff-1")!;
          tx.put("handoffs", h, 0);
        }),
      /STALE_FENCE/,
    );
    assert.equal(
      f.store.transaction((tx) =>
        tx.list("handoffs", { ...scope, lineId: "other" }, 10),
      ).length,
      0,
    );
    let escaped: Transaction | undefined;
    f.store.transaction((tx) => {
      escaped = tx;
    });
    assert.throws(() => escaped!.get("inbox", "event-1"), /TRANSACTION_CLOSED/);
    assert.throws(
      () => f.store.transaction(async () => {}),
      /ASYNC_TRANSACTION/,
    );
  } finally {
    f.close();
  }
});

test("abrupt process exit rolls back uncommitted writes but preserves committed writes", async () => {
  const { spawnSync } = await import("node:child_process");
  const f = storeFixture();
  try {
    const moduleUrl = new URL("../../../src/state/index.js", import.meta.url)
      .href;
    const common = `import {SQLiteStore} from ${JSON.stringify(moduleUrl)};const store=new SQLiteStore(${JSON.stringify(f.path)});const record={id:'crash',scope:${JSON.stringify(scope)},revision:0,eventId:'event',reason:'crash',checkpointId:null};`;
    const crash = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        common +
          "store.transaction(tx=>{tx.put('unresolved',record,null);process.exit(17);});",
      ],
      { encoding: "utf8" },
    );
    assert.equal(crash.status, 17);
    assert.equal(
      f.store.transaction((tx) => tx.get("unresolved", "crash")),
      undefined,
    );
    const commit = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        common +
          "store.transaction(tx=>tx.put('unresolved',record,null));process.exit(18);",
      ],
      { encoding: "utf8" },
    );
    assert.equal(commit.status, 18);
    assert.equal(
      f.store.transaction((tx) => tx.get("unresolved", "crash"))?.id,
      "crash",
    );
  } finally {
    f.close();
  }
});
