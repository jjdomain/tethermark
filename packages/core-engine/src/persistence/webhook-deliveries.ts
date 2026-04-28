import type { PersistenceReadOptions } from "./backend.js";
import { resolvePersistenceLocation } from "./backend.js";
import type { PersistedWebhookDeliveryRecord } from "./contracts.js";
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

export async function listPersistedWebhookDeliveries(args?: {
  rootDirOrOptions?: string | PersistenceReadOptions;
  runId?: string;
  workspaceId?: string;
  projectId?: string;
  eventType?: PersistedWebhookDeliveryRecord["event_type"];
}): Promise<PersistedWebhookDeliveryRecord[]> {
  const location = resolveLocation(args?.rootDirOrOptions);
  return (await readTable<PersistedWebhookDeliveryRecord>(location.rootDir, "webhook_deliveries"))
    .filter((item) => !args?.runId || item.run_id === args.runId)
    .filter((item) => !args?.workspaceId || item.workspace_id === args.workspaceId)
    .filter((item) => !args?.projectId || item.project_id === args.projectId)
    .filter((item) => !args?.eventType || item.event_type === args.eventType)
    .sort((left, right) => right.attempted_at.localeCompare(left.attempted_at) || right.id.localeCompare(left.id));
}

export async function createPersistedWebhookDelivery(record: PersistedWebhookDeliveryRecord, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedWebhookDeliveryRecord> {
  const location = resolveLocation(rootDirOrOptions);
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({
      db,
      tableName: "webhook_deliveries",
      recordKey: record.id,
      payload: record,
      runId: record.run_id,
      createdAt: record.attempted_at,
      parentKey: record.run_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
}
