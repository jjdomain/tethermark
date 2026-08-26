import {
  ensureSqliteSchema,
  openSqliteDatabase,
  saveSqliteDatabase,
  setSqliteSaveStageObserverForTests,
  upsertSqliteRecord
} from "../dist/packages/core-engine/src/persistence/sqlite.js";

const [rootDir, crashStage] = process.argv.slice(2);
const supportedStages = new Set(["after_lock_acquired", "after_temp_write", "after_replace"]);
if (!rootDir || !supportedStages.has(crashStage)) {
  throw new Error("usage: sqlite-crash-worker.mjs <root-dir> <after_lock_acquired|after_temp_write|after_replace>");
}

setSqliteSaveStageObserverForTests((stage) => {
  if (stage === crashStage) process.exit(86);
});

const db = await openSqliteDatabase(rootDir);
ensureSqliteSchema(db);
upsertSqliteRecord({
  db,
  tableName: "crash_test",
  recordKey: "crash",
  payload: { id: "crash" }
});
await saveSqliteDatabase(rootDir, db);
db.close();
throw new Error(`sqlite crash stage was not reached: ${crashStage}`);
