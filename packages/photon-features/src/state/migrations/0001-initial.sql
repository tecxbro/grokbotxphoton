-- Additive fresh-host migration. Apply in BEGIN IMMEDIATE; never open production state for F0.
CREATE TABLE IF NOT EXISTS "contexts" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "contexts_scope" ON "contexts"(scope,id);
CREATE TABLE IF NOT EXISTS "tasks" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "tasks_scope" ON "tasks"(scope,id);
CREATE TABLE IF NOT EXISTS "stagedMedia" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "stagedMedia_scope" ON "stagedMedia"(scope,id);
CREATE TABLE IF NOT EXISTS "streams" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "streams_scope" ON "streams"(scope,id);
CREATE TABLE IF NOT EXISTS "inbox" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "inbox_scope" ON "inbox"(scope,id);
CREATE TABLE IF NOT EXISTS "unresolved" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "unresolved_scope" ON "unresolved"(scope,id);
CREATE TABLE IF NOT EXISTS "handoffs" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "handoffs_scope" ON "handoffs"(scope,id);
CREATE TABLE IF NOT EXISTS "outbox" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "outbox_scope" ON "outbox"(scope,id);
CREATE TABLE IF NOT EXISTS "attempts" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "attempts_scope" ON "attempts"(scope,id);
CREATE TABLE IF NOT EXISTS "children" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "children_scope" ON "children"(scope,id);
CREATE TABLE IF NOT EXISTS "references" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "references_scope" ON "references"(scope,id);
CREATE TABLE IF NOT EXISTS "polls" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "polls_scope" ON "polls"(scope,id);
CREATE TABLE IF NOT EXISTS "votes" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "votes_scope" ON "votes"(scope,id);
CREATE TABLE IF NOT EXISTS "cards" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "cards_scope" ON "cards"(scope,id);
CREATE TABLE IF NOT EXISTS "sessions" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "sessions_scope" ON "sessions"(scope,id);
CREATE TABLE IF NOT EXISTS "checkpoints" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body)));
CREATE INDEX IF NOT EXISTS "checkpoints_scope" ON "checkpoints"(scope,id);
CREATE TABLE IF NOT EXISTS receipt_observations (
  scope TEXT NOT NULL, evidence_id TEXT NOT NULL,
  target_id TEXT, provider_target_id TEXT NOT NULL, part_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('accepted','delivered','read','rejected')),
  reader_id TEXT, provider_at INTEGER CHECK(provider_at >= 0),
  observed_at INTEGER NOT NULL CHECK(observed_at >= 0),
  source TEXT NOT NULL CHECK(source IN ('sdk-return','provider-event','snapshot','reconciliation')),
  source_revision TEXT, body TEXT NOT NULL CHECK(json_valid(body)),
  PRIMARY KEY(scope,evidence_id)
);
CREATE INDEX IF NOT EXISTS receipt_target ON receipt_observations(scope,provider_target_id,part_id);
CREATE TABLE IF NOT EXISTS execution_claims (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, owner TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation >= 0), fence INTEGER NOT NULL CHECK(fence >= 0),
  lease_until INTEGER NOT NULL CHECK(lease_until >= 0), cancelled_at INTEGER
);
CREATE TABLE IF NOT EXISTS foundation_migrations (id TEXT PRIMARY KEY);
INSERT OR IGNORE INTO foundation_migrations(id) VALUES ('0001-initial');
