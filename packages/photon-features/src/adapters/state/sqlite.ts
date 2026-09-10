import { DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SQLiteStore,
  tables,
  type Table,
  type StateTables,
  type Transaction,
} from "../../state/index.js";
import {
  sameScope,
  type Scope,
  type TrustedContext,
} from "../../contracts/index.js";
import {
  appendReceipt,
  parseReceiptObservation,
  type ReceiptObservation,
} from "../../contracts/receipts.js";
import type { ExecutionClaim, StateStore } from "../../contracts/store.js";

function migrationPath(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  const root = parse(directory).root;
  while (directory !== root) {
    const candidate = join(directory, "src/state/migrations/0001-initial.sql");
    if (existsSync(candidate)) return candidate;
    directory = dirname(directory);
  }
  throw new Error("F0_MIGRATION_NOT_FOUND");
}

function scopeKey(scope: Scope): string {
  return JSON.stringify([
    scope.projectId,
    scope.provider,
    scope.accountId,
    scope.lineId,
    scope.spaceId,
  ]);
}
/** Uses F0 migrations and its BEGIN IMMEDIATE / CAS UnitOfWork unchanged. */
export class DurableSQLiteStore extends SQLiteStore implements StateStore {
  readonly persistence = "sqlite" as const;
  private readonly reader: DatabaseSync;
  private readonly evidence: DatabaseSync;
  private readonly path: string;
  private readonly now: () => number;
  constructor(path: string, now: () => number = Date.now) {
    if (!isAbsolute(path)) throw new Error("ABSOLUTE_STORE_PATH_REQUIRED");
    const dir = lstatSync(dirname(path));
    if (
      !dir.isDirectory() ||
      dir.isSymbolicLink() ||
      dir.uid !== process.getuid?.() ||
      (dir.mode & 0o777) !== 0o700
    )
      throw new Error("PRIVATE_DIRECTORY_REQUIRED");
    for (const file of [path, path + "-wal", path + "-shm"]) {
      try {
        const stat = lstatSync(file);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.uid !== dir.uid ||
          stat.nlink !== 1
        )
          throw new Error("UNSAFE_STORE_PATH");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    super(path);
    this.path = path;
    this.now = now;
    const migrator = new DatabaseSync(path);
    try {
      migrator.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
      migrator.exec(readFileSync(migrationPath(), "utf8"));
      migrator.exec("COMMIT");
    } catch (error) {
      try {
        migrator.exec("ROLLBACK");
      } catch {
        // The original migration error is authoritative.
      }
      migrator.close();
      super.close();
      throw error;
    }
    migrator.close();
    this.secureFiles();
    this.reader = new DatabaseSync(path, { readOnly: true });
    this.reader.exec("PRAGMA busy_timeout=5000");
    this.evidence = new DatabaseSync(path);
    this.evidence.exec(
      "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL",
    );
    this.secureFiles();
  }
  /** Discovery only; every mutation must recheck the row inside a transaction. */
  scan<K extends Table>(table: K, after = "", limit = 1000): StateTables[K][] {
    if (
      !tables.includes(table) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    )
      throw new Error("INVALID_SCAN");
    return this.reader
      .prepare(`SELECT body FROM "${table}" WHERE id > ? ORDER BY id LIMIT ?`)
      .all(after, limit)
      .map((r) => JSON.parse(String(r.body)) as StateTables[K]);
  }
  /** Conservative account/line FIFO also serializes cross-conversation admin operations. */
  predecessors(id: string, scope: Scope): boolean {
    return !!this.reader
      .prepare(
        `SELECT 1 FROM outbox WHERE rowid < (SELECT rowid FROM outbox WHERE id=?) AND json_extract(body,'$.scope.projectId')=? AND json_extract(body,'$.scope.accountId')=? AND json_extract(body,'$.scope.lineId')=? AND json_extract(body,'$.result.status') IN ('queued','blocked','unknown-outcome') LIMIT 1`,
      )
      .get(id, scope.projectId, scope.accountId, scope.lineId);
  }
  /** Public StateStore claim check; runtime execution additionally checks the exact request row. */
  assertActiveClaim(context: TrustedContext, claim: ExecutionClaim): void {
    const row = this.reader
      .prepare(
        `SELECT body FROM outbox WHERE scope=? AND json_extract(body,'$.principalId')=? AND json_extract(body,'$.taskId')=? AND json_extract(body,'$.generation')=? AND json_extract(body,'$.claim.owner')=? AND json_extract(body,'$.claim.fence')=? LIMIT 1`,
      )
      .get(
        scopeKey(context.scope),
        context.principalId,
        context.taskId,
        context.generation,
        claim.owner,
        claim.fence,
      );
    if (!row) throw new Error("STALE_FENCE");
    const value = JSON.parse(String(row.body)) as {
      claim: ExecutionClaim | null;
      cancellationRequestedAt: number | null;
    };
    if (
      !value.claim ||
      value.claim.generation !== claim.generation ||
      value.claim.leaseUntil <= this.now()
    )
      throw new Error("STALE_FENCE");
    if (value.cancellationRequestedAt !== null) throw new Error("CANCELLED");
  }
  /** Append immutable receipt evidence, permitting only null-to-exact target correlation. */
  recordReceipt(input: ReceiptObservation): void {
    const observation = parseReceiptObservation(input);
    const key = scopeKey(observation.scope);
    this.evidence.exec("BEGIN IMMEDIATE");
    try {
      const selected = this.evidence
        .prepare(
          "SELECT body FROM receipt_observations WHERE scope=? AND evidence_id=?",
        )
        .get(key, observation.evidenceId);
      if (selected) {
        const prior = parseReceiptObservation(JSON.parse(String(selected.body)));
        appendReceipt([prior], observation);
        if (!prior.target && observation.target) {
          const correlated = parseReceiptObservation({
            ...prior,
            target: observation.target,
          });
          this.evidence
            .prepare(
              "UPDATE receipt_observations SET target_id=?, body=? WHERE scope=? AND evidence_id=?",
            )
            .run(
              correlated.target!.id,
              JSON.stringify(correlated),
              key,
              correlated.evidenceId,
            );
        }
      } else {
        this.evidence
          .prepare(
            `INSERT INTO receipt_observations(scope,evidence_id,target_id,provider_target_id,part_id,kind,reader_id,provider_at,observed_at,source,source_revision,body) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            key,
            observation.evidenceId,
            observation.target?.id ?? null,
            observation.providerTargetId,
            observation.partId,
            observation.kind,
            observation.readerId,
            observation.providerAt,
            observation.observedAt,
            observation.source,
            observation.sourceRevision,
            JSON.stringify(observation),
          );
      }
      this.evidence.exec("COMMIT");
    } catch (error) {
      this.evidence.exec("ROLLBACK");
      throw error;
    } finally {
      this.secureFiles();
    }
  }
  /** Query durable evidence without inferring a target for unresolved observations. */
  listReceipts(scope: Scope): ReceiptObservation[] {
    return this.reader
      .prepare(
        "SELECT body FROM receipt_observations WHERE scope=? ORDER BY observed_at,evidence_id",
      )
      .all(scopeKey(scope))
      .map((row) => parseReceiptObservation(JSON.parse(String(row.body))))
      .filter((row) => sameScope(row.scope, scope));
  }
  override transaction<T>(fn: (tx: Transaction) => T): T {
    try {
      return super.transaction(fn);
    } finally {
      this.secureFiles();
    }
  }
  private secureFiles(): void {
    for (const file of [this.path, this.path + "-wal", this.path + "-shm"])
      if (existsSync(file)) chmodSync(file, 0o600);
  }
  override close(): void {
    this.evidence.close();
    this.reader.close();
    super.close();
  }
}

/** Open the one production state store at a private absolute path and apply F0's committed migration. */
export function createStateStore(
  path: string,
  now: () => number = Date.now,
): DurableSQLiteStore {
  return new DurableSQLiteStore(path, now);
}
