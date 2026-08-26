import {
  ensureSqliteSchema,
  openSqliteDatabase,
  saveSqliteDatabase,
  upsertSqliteRecord
} from "../dist/packages/core-engine/src/persistence/sqlite.js";

const [rootDir, workerId, rawWriteCount] = process.argv.slice(2);
const writeCount = Number(rawWriteCount);
if (!rootDir || !workerId || !Number.isInteger(writeCount) || writeCount < 1 || writeCount > 100) {
  throw new Error("usage: sqlite-stress-worker.mjs <root-dir> <worker-id> <write-count:1-100>");
}

for (let index = 0; index < writeCount; index += 1) {
  const recordId = `${workerId}:${index}`;
  const db = await openSqliteDatabase(rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({
      db,
      tableName: "process_concurrency_test",
      recordKey: recordId,
      payload: { id: recordId }
    });
    await saveSqliteDatabase(rootDir, db);
  } finally {
    db.close();
  }
}
