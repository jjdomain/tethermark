import { normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import type { PersistedReviewCommentRecord } from "./contracts.js";
import { getPersistedRun } from "./query.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./backend.js";
import { ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

function resolveLocation(rootDirOrOptions?: string | PersistenceReadOptions) {
  return typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
}

async function readTable<T>(rootDir: string, tableName: string): Promise<T[]> {
  if (!(await hasSqliteDatabase(rootDir))) return [];
  const db = await openSqliteDatabase(rootDir);
  try {
    ensureSqliteSchema(db);
    return readSqliteTable<T>(db, tableName);
  } finally {
    db.close();
  }
}

export async function readPersistedReviewComments(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedReviewCommentRecord[]> {
  const location = resolveLocation(rootDirOrOptions);
  const rows = await readTable<PersistedReviewCommentRecord>(location.rootDir, "review_comments");
  return rows
    .filter((item) => item.run_id === runId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export async function createPersistedReviewComment(args: {
  runId: string;
  authorId: string;
  body: string;
  findingId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedReviewCommentRecord> {
  const location = resolveLocation(args.rootDirOrOptions);
  const run = await getPersistedRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!run) {
    throw new Error("run_not_found");
  }
  const body = args.body.trim();
  if (!body) {
    throw new Error("comment_body_required");
  }
  const createdAt = args.createdAt ?? new Date().toISOString();
  const record: PersistedReviewCommentRecord = {
    id: `${args.runId}:review-comment:${createdAt}:${args.authorId}:${Math.random().toString(36).slice(2, 10)}`,
    run_id: args.runId,
    workspace_id: normalizeWorkspaceId(run.workspace_id),
    project_id: normalizeProjectId(run.project_id),
    author_id: args.authorId,
    finding_id: args.findingId ?? null,
    body,
    created_at: createdAt,
    metadata_json: args.metadata ?? null
  };
  const db = await openSqliteDatabase(location.rootDir);
  try {
    upsertSqliteRecord({
      db,
      tableName: "review_comments",
      recordKey: record.id,
      payload: record,
      runId: args.runId,
      createdAt: record.created_at,
      targetId: run.target_id,
      parentKey: args.runId
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return record;
}
