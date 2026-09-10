import type {
  Action,
  IncomingEvent,
  OperationResult,
  ResourceRef,
  Scope,
  TrustedContext,
} from "../contracts/index.js";
export interface Claim {
  owner: string;
  leaseUntil: number;
  fence: number;
  generation: number;
}
export interface StoredRecord {
  id: string;
  scope: Scope;
  revision: number;
}
export interface ContextRecord extends StoredRecord {
  context: TrustedContext;
}
export interface TaskRecord extends StoredRecord {
  principalId: string;
  generation: number;
  cancelledAt: number | null;
}
export interface StagedMediaRecord extends StoredRecord {
  principalId: string;
  taskId: string;
  generation: number;
  relativePath: string;
  sha256: string;
  mimeType: string;
  bytes: number;
  expiresAt: number;
}
export interface StreamRecord extends StoredRecord {
  reference: Extract<ResourceRef, { kind: "stream" }>;
  principalId: string;
  taskId: string;
  codecId: string;
  codecVersion: number;
  checkpointId: string | null;
  state: "registered" | "closed" | "expired";
}
export interface InboxRecord extends StoredRecord {
  event: IncomingEvent;
  state: "pending" | "reduced" | "unresolved";
}
export interface UnresolvedRecord extends StoredRecord {
  eventId: string;
  reason: string;
  checkpointId: string | null;
}
export interface HandoffRecord extends StoredRecord {
  taskId: string;
  generation: number;
  principalId: string;
  eventIds: string[];
  state: "pending" | "claimed" | "acknowledged" | "cancelled";
  claim: Claim | null;
  createdAt: number;
}
export interface OutboxRecord extends StoredRecord {
  action: Action;
  principalId: string;
  taskId: string;
  generation: number;
  argumentDigest: string;
  result: OperationResult;
  claim: Claim | null;
  cancellationRequestedAt: number | null;
}
export interface AttemptRecord extends StoredRecord {
  requestId: string;
  claim: Claim;
  phase: "prepared" | "dispatching" | "returned" | "unknown";
  providerIdempotencyKey: string | null;
  startedAt: number;
  finishedAt: number | null;
}
export interface ChildRecord extends StoredRecord {
  requestId: string;
  index: number;
  stableKey: string;
  state: "pending" | "dispatching" | "completed" | "unknown";
  references: ResourceRef[];
}
export interface ReferenceRecord extends StoredRecord {
  reference: ResourceRef;
  providerId: string;
  ownedByPrincipalId: string;
  taskId: string;
  generation: number;
}
export interface PollRecord extends StoredRecord {
  reference: Extract<ResourceRef, { kind: "poll" }>;
  question: string;
  options: {
    reference: Extract<ResourceRef, { kind: "poll-option" }>;
    label: string;
  }[];
}
export interface VoteRecord extends StoredRecord {
  pollId: string;
  optionId: string;
  actorId: string;
  active: boolean;
  sourceRevision: string | null;
  eventId: string;
}
export interface CardRecord extends StoredRecord {
  reference: Extract<ResourceRef, { kind: "card" }>;
  templateId: string;
}
export interface SessionRecord extends StoredRecord {
  reference: Extract<ResourceRef, { kind: "card-session" }>;
  allowedActionIds: string[];
  expiresAt: number;
  generation: number;
}
export interface CheckpointRecord extends StoredRecord {
  requestId: string;
  codecId: string;
  codecVersion: number;
  payloadJson: string;
  nextChildIndex: number;
  claim: Claim;
}
export interface StateTables {
  contexts: ContextRecord;
  tasks: TaskRecord;
  stagedMedia: StagedMediaRecord;
  streams: StreamRecord;
  inbox: InboxRecord;
  unresolved: UnresolvedRecord;
  handoffs: HandoffRecord;
  outbox: OutboxRecord;
  attempts: AttemptRecord;
  children: ChildRecord;
  references: ReferenceRecord;
  polls: PollRecord;
  votes: VoteRecord;
  cards: CardRecord;
  sessions: SessionRecord;
  checkpoints: CheckpointRecord;
}
export type Table = keyof StateTables;
export const tables: readonly Table[] = [
  "contexts",
  "tasks",
  "stagedMedia",
  "streams",
  "inbox",
  "unresolved",
  "handoffs",
  "outbox",
  "attempts",
  "children",
  "references",
  "polls",
  "votes",
  "cards",
  "sessions",
  "checkpoints",
];
export interface Transaction {
  get<K extends Table>(table: K, id: string): StateTables[K] | undefined;
  list<K extends Table>(
    table: K,
    scope: Scope,
    limit: number,
  ): StateTables[K][];
  listWork(
    scope: Scope,
    principalId: string,
    taskId: string,
    generation: number,
    now: number,
    limit: number,
  ): HandoffRecord[];
  /** expectedRevision=null inserts; updates require matching revision and next revision = old + 1. */
  put<K extends Table>(
    table: K,
    record: StateTables[K],
    expectedRevision: number | null,
  ): void;
}
export interface TransactionStore {
  transaction<T>(fn: (tx: Transaction) => T): T;
  close(): void;
}
