import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

import type { DatabaseMode } from "../contracts.js";
import type { BundleExportPolicy } from "./bundle-exports.js";
import { buildPostgresMigrationSql, buildPsqlProcessEnv, resolvePostgresConnectionConfig } from "./postgres.js";
import { PERSISTENCE_TABLE_DEFINITIONS } from "./schema-manifest.js";

const require = createRequire(import.meta.url);
const initSqlJs: any = require("sql.js/dist/sql-wasm.js");

let sqlJsPromise: Promise<any> | null = null;
const sqliteSaveQueues = new Map<string, Promise<void>>();
const sqliteOpenSnapshots = new WeakMap<object, Map<string, SqliteRecordRow>>();
let sqliteSaveFailureForTests: "before_temp_write" | "before_replace" | null = null;

export class SqlitePersistenceError extends Error {
  constructor(
    public readonly persistence_code: "sqlite_database_unavailable" | "sqlite_database_corrupt_or_unsupported" | "sqlite_database_locked" | "sqlite_save_failed",
    options?: { cause?: unknown }
  ) {
    super(persistence_code, options);
    this.name = "SqlitePersistenceError";
  }
}

export function setSqliteSaveFailureForTests(stage: "before_temp_write" | "before_replace" | null): void {
  sqliteSaveFailureForTests = stage;
}

interface SqliteRecordRow {
  table_name: string;
  record_key: string;
  run_id: string | null;
  created_at: string | null;
  target_id: string | null;
  target_snapshot_id: string | null;
  parent_key: string | null;
  payload_json: string;
}

interface PendingRecordUpsert {
  tableName: string;
  recordKey: string;
  payload: unknown;
  runId?: string | null;
  createdAt?: string | null;
  targetId?: string | null;
  targetSnapshotId?: string | null;
  parentKey?: string | null;
}

interface RemoteRecordDatabase {
  __remoteRecordDatabase: true;
  mode: "postgres" | "supabase";
  pendingUpserts: PendingRecordUpsert[];
  close(): void;
  run(sql: string): void;
}

export interface PersistenceMetadata {
  persistence_schema_version: string;
  database_mode: DatabaseMode;
  backend_kind: "sqlite_file";
  sqlite_path: string;
  bundle_exports_dir: string;
  bundle_export_policy: BundleExportPolicy;
  json_table_mirrors: boolean;
  compatibility_status: "current" | "legacy" | "unknown";
  warnings: string[];
  updated_at: string;
}

export type LocalPersistenceMetadata = PersistenceMetadata;

export const PERSISTENCE_SCHEMA_VERSION = "1.3.0";

function wasmPath(): string {
  return require.resolve("sql.js/dist/sql-wasm.wasm");
}

function isRemoteRoot(rootDir: string): rootDir is "postgres" | "supabase" {
  return rootDir === "postgres" || rootDir === "supabase";
}

function isRemoteDatabase(db: any): db is RemoteRecordDatabase {
  return Boolean(db?.__remoteRecordDatabase);
}

function postgresUrl(): string {
  const config = resolvePostgresConnectionConfig();
  if (!config.database_url) {
    throw new Error("postgres_database_url_required");
  }
  return config.database_url;
}

function sqlLiteral(value: string | number | boolean | null | undefined): string {
  if (value == null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonLiteral(value: unknown): string {
  return `${sqlLiteral(JSON.stringify(value ?? null))}::jsonb`;
}

function fieldSqlLiteral(value: unknown, type: "text" | "integer" | "real" | "boolean" | "json" | "timestamp"): string {
  if (type === "json") return jsonLiteral(value ?? null);
  if (type === "integer") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : "NULL";
  }
  if (type === "real") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : "NULL";
  }
  if (type === "boolean") return typeof value === "boolean" ? value ? "TRUE" : "FALSE" : "NULL";
  return sqlLiteral(value == null ? null : String(value));
}

function runPostgresSql(sql: string, args: { capture?: boolean } = {}): string {
  const command = process.env.HARNESS_PSQL_COMMAND?.trim() || "psql";
  const databaseUrl = postgresUrl();
  const result = spawnSync(command, ["-X", "-v", "ON_ERROR_STOP=1", args.capture ? "-t" : "", args.capture ? "-A" : "", "-c", sql].filter(Boolean), {
    encoding: "utf8",
    env: buildPsqlProcessEnv(databaseUrl),
    shell: false,
    windowsHide: true,
    timeout: 120_000
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`postgres_record_store_failed:${result.error?.message ?? result.stderr ?? result.stdout ?? `exit ${result.status}`}`);
  }
  return result.stdout ?? "";
}

function flushRemoteUpserts(db: RemoteRecordDatabase): void {
  if (!db.pendingUpserts.length) return;
  const values = db.pendingUpserts.map((record) => [
    sqlLiteral(record.tableName),
    sqlLiteral(record.recordKey),
    sqlLiteral(record.runId),
    sqlLiteral(record.createdAt),
    sqlLiteral(record.targetId),
    sqlLiteral(record.targetSnapshotId),
    sqlLiteral(record.parentKey),
    jsonLiteral(record.payload)
  ].join(", "));
  const recordStoreSql = `
    INSERT INTO records (table_name, record_key, run_id, created_at, target_id, target_snapshot_id, parent_key, payload_json)
    VALUES ${values.map((item) => `(${item})`).join(",\n")}
    ON CONFLICT(table_name, record_key) DO UPDATE SET
      run_id=EXCLUDED.run_id,
      created_at=EXCLUDED.created_at,
      target_id=EXCLUDED.target_id,
      target_snapshot_id=EXCLUDED.target_snapshot_id,
      parent_key=EXCLUDED.parent_key,
      payload_json=EXCLUDED.payload_json
  `;
  const relationalSql = PERSISTENCE_TABLE_DEFINITIONS
    .map((definition) => {
      const matching = db.pendingUpserts.filter((record) => record.tableName === definition.name);
      if (!matching.length) return "";
      const columns = definition.fields.map((item) => item.name);
      const rows = matching.map((record) => {
        const payload = record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
          ? record.payload as Record<string, unknown>
          : {};
        return `(${definition.fields.map((field) => fieldSqlLiteral(payload[field.name], field.type)).join(", ")})`;
      });
      const updateColumns = columns.filter((column) => !definition.primary_key.includes(column));
      return `
        INSERT INTO ${definition.name} (${columns.join(", ")})
        VALUES ${rows.join(",\n")}
        ON CONFLICT(${definition.primary_key.join(", ")}) DO UPDATE SET
          ${updateColumns.map((column) => `${column}=EXCLUDED.${column}`).join(",\n          ")}
      `;
    })
    .filter(Boolean)
    .join(";\n");
  runPostgresSql(`BEGIN;\n${recordStoreSql};\n${relationalSql ? `${relationalSql};\n` : ""}COMMIT;`);
  db.pendingUpserts = [];
}

async function getSqlJs(): Promise<any> {
  sqlJsPromise ??= initSqlJs({ locateFile: () => wasmPath() });
  return sqlJsPromise;
}

export function sqliteDbPath(rootDir: string): string {
  return path.join(rootDir, "harness.sqlite");
}

export function localPersistenceMetadataPath(rootDir: string): string {
  return path.join(rootDir, "persistence-meta.json");
}

export async function hasSqliteDatabase(rootDir: string): Promise<boolean> {
  if (isRemoteRoot(rootDir)) return true;
  try {
    await fs.access(sqliteDbPath(rootDir));
    return true;
  } catch {
    return false;
  }
}

function filesystemErrorCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
}

async function readExistingSqliteBytes(rootDir: string): Promise<Uint8Array | null> {
  try {
    return await fs.readFile(sqliteDbPath(rootDir));
  } catch (error) {
    if (filesystemErrorCode(error) === "ENOENT") return null;
    throw new SqlitePersistenceError("sqlite_database_unavailable", { cause: error });
  }
}

function openSqliteBytes(SQL: any, bytes: Uint8Array | null): any {
  if (!bytes) return new SQL.Database();
  let db: any = null;
  try {
    db = new SQL.Database(bytes);
    const check = db.exec("PRAGMA quick_check(1)");
    const result = String(check?.[0]?.values?.[0]?.[0] ?? "");
    if (result !== "ok") throw new Error("sqlite_quick_check_failed");
    return db;
  } catch (error) {
    db?.close?.();
    throw new SqlitePersistenceError("sqlite_database_corrupt_or_unsupported", { cause: error });
  }
}

export async function openSqliteDatabase(rootDir: string): Promise<any> {
  if (isRemoteRoot(rootDir)) {
    return {
      __remoteRecordDatabase: true,
      mode: rootDir,
      pendingUpserts: [],
      close() {},
      run(sql: string) {
        runPostgresSql(sql);
      }
    } satisfies RemoteRecordDatabase;
  }
  const SQL = await getSqlJs();
  const db = openSqliteBytes(SQL, await readExistingSqliteBytes(rootDir));
  sqliteOpenSnapshots.set(db, readSqliteRecordSnapshot(db));
  return db;
}

export async function writePersistenceMetadata(rootDir: string, databaseMode: DatabaseMode, bundleExportPolicy: BundleExportPolicy): Promise<PersistenceMetadata> {
  const metadata: PersistenceMetadata = {
    persistence_schema_version: PERSISTENCE_SCHEMA_VERSION,
    database_mode: databaseMode,
    backend_kind: "sqlite_file",
    sqlite_path: sqliteDbPath(rootDir),
    bundle_exports_dir: path.join(rootDir, "runs"),
    bundle_export_policy: bundleExportPolicy,
    json_table_mirrors: false,
    compatibility_status: "current",
    warnings: [],
    updated_at: new Date().toISOString()
  };
  await fs.mkdir(rootDir, { recursive: true });
  await fs.writeFile(localPersistenceMetadataPath(rootDir), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

export async function writeLocalPersistenceMetadata(rootDir: string): Promise<LocalPersistenceMetadata> {
  const { resolveBundleExportPolicy } = await import("./bundle-exports.js");
  return writePersistenceMetadata(rootDir, "local", resolveBundleExportPolicy("local"));
}

export async function readPersistenceMetadata(rootDir: string): Promise<PersistenceMetadata | null> {
  try {
    const raw = await fs.readFile(localPersistenceMetadataPath(rootDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistenceMetadata> & Record<string, unknown>;
    const warnings: string[] = Array.isArray(parsed.warnings) ? parsed.warnings.map((item) => String(item)) : [];
    const schemaVersion = typeof parsed.persistence_schema_version === "string" && parsed.persistence_schema_version
      ? parsed.persistence_schema_version
      : "1.0.0";
    const compatibilityStatus: PersistenceMetadata["compatibility_status"] = schemaVersion === PERSISTENCE_SCHEMA_VERSION
      ? "current"
      : typeof parsed.persistence_schema_version === "string"
        ? "legacy"
        : "unknown";
    if (compatibilityStatus !== "current") {
      warnings.push(`Persistence metadata schema ${schemaVersion} differs from expected ${PERSISTENCE_SCHEMA_VERSION}.`);
    }
    const databaseMode: DatabaseMode = "local";
    return {
      persistence_schema_version: schemaVersion,
      database_mode: databaseMode,
      backend_kind: "sqlite_file",
      sqlite_path: typeof parsed.sqlite_path === "string" && parsed.sqlite_path ? parsed.sqlite_path : sqliteDbPath(rootDir),
      bundle_exports_dir: typeof parsed.bundle_exports_dir === "string" && parsed.bundle_exports_dir ? parsed.bundle_exports_dir : path.join(rootDir, "runs"),
      bundle_export_policy: (parsed.bundle_export_policy && typeof parsed.bundle_export_policy === "object"
        ? parsed.bundle_export_policy as BundleExportPolicy
        : {
            database_mode: databaseMode,
            policy: "debug_optional",
            enabled: true,
            retention_days: 30,
            notes: ["Recovered default bundle export policy for legacy persistence metadata."]
          }),
      json_table_mirrors: Boolean(parsed.json_table_mirrors),
      compatibility_status: compatibilityStatus,
      warnings,
      updated_at: typeof parsed.updated_at === "string" && parsed.updated_at ? parsed.updated_at : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export async function readLocalPersistenceMetadata(rootDir: string): Promise<LocalPersistenceMetadata | null> {
  return readPersistenceMetadata(rootDir);
}

async function waitForWritablePathError(error: unknown, attempt: number): Promise<boolean> {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (!["EBUSY", "EPERM", "EACCES"].includes(code)) return false;
  await new Promise((resolve) => setTimeout(resolve, Math.min(1500, 75 * (attempt + 1) * (attempt + 1))));
  return true;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : fallback;
}

function sqliteLockPath(dbPath: string): string {
  return `${dbPath}.lock`;
}

async function clearStaleSqliteLock(lockPath: string, staleAfterMs: number): Promise<boolean> {
  try {
    const lockStat = await fs.stat(lockPath);
    if (Date.now() - lockStat.mtimeMs < staleAfterMs) return false;
  } catch (error) {
    if (filesystemErrorCode(error) === "ENOENT") return true;
    return false;
  }

  const quarantinePath = `${lockPath}.stale.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  try {
    await fs.rename(lockPath, quarantinePath);
    await fs.rm(quarantinePath, { force: true });
    return true;
  } catch (error) {
    if (filesystemErrorCode(error) === "ENOENT") return true;
    return false;
  }
}

async function acquireSqliteFileLock(dbPath: string): Promise<{
  handle: Awaited<ReturnType<typeof fs.open>>;
  lockPath: string;
  token: string;
}> {
  const lockPath = sqliteLockPath(dbPath);
  const timeoutMs = positiveIntegerEnv("HARNESS_SQLITE_LOCK_TIMEOUT_MS", 10_000);
  const staleAfterMs = positiveIntegerEnv("HARNESS_SQLITE_LOCK_STALE_MS", 120_000);
  const backoffBaseMs = positiveIntegerEnv("HARNESS_SQLITE_LOCK_BACKOFF_BASE_MS", 20);
  const backoffMaxMs = positiveIntegerEnv("HARNESS_SQLITE_LOCK_BACKOFF_MAX_MS", 500);
  const startedAt = Date.now();
  let attempt = 0;

  while (true) {
    const token = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      handle = await fs.open(lockPath, "wx", 0o600);
      await handle.writeFile(JSON.stringify({ token, pid: process.pid, acquired_at: new Date().toISOString() }), "utf8");
      return { handle, lockPath, token };
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => undefined);
        await fs.rm(lockPath, { force: true }).catch(() => undefined);
      }
      if (filesystemErrorCode(error) !== "EEXIST") {
        throw new SqlitePersistenceError("sqlite_database_unavailable", { cause: error });
      }
      if (await clearStaleSqliteLock(lockPath, staleAfterMs)) continue;
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= timeoutMs) {
        throw new SqlitePersistenceError("sqlite_database_locked", { cause: error });
      }
      const delayMs = Math.min(backoffMaxMs, backoffBaseMs * (2 ** Math.min(attempt, 8)), timeoutMs - elapsedMs);
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, delayMs)));
    }
  }
}

async function releaseSqliteFileLock(lock: Awaited<ReturnType<typeof acquireSqliteFileLock>>): Promise<void> {
  await lock.handle.close().catch(() => undefined);
  try {
    const owner = JSON.parse(await fs.readFile(lock.lockPath, "utf8")) as { token?: unknown };
    if (owner.token === lock.token) await fs.rm(lock.lockPath, { force: true });
  } catch {
    // A crashed/stale owner may already have been quarantined. Never remove a
    // replacement lock unless this process can prove ownership by token.
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function tolerateMissingTempDuringCleanup(error: unknown, tempPath: string, dbPath: string): Promise<boolean> {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code !== "ENOENT") return false;
  const tempExists = await pathExists(tempPath);
  if (tempExists) return false;
  const rootExists = await pathExists(path.dirname(dbPath));
  if (!rootExists) return true;
  return pathExists(dbPath);
}

async function replaceSqliteFile(tempPath: string, dbPath: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await fs.rename(tempPath, dbPath);
      return;
    } catch (error) {
      lastError = error;
      if (await tolerateMissingTempDuringCleanup(error, tempPath, dbPath)) return;
      if (!await waitForWritablePathError(error, attempt)) throw error;
    }
  }

  // Windows can intermittently reject replacing an existing file even after
  // retries when scanners or another request briefly touch the destination.
  // Copying over the existing file preserves the destination path and avoids
  // the rename-over-existing edge while the per-path queue prevents same-process
  // writers from interleaving bytes.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await fs.copyFile(tempPath, dbPath);
      await fs.rm(tempPath, { force: true });
      return;
    } catch (error) {
      lastError = error;
      if (await tolerateMissingTempDuringCleanup(error, tempPath, dbPath)) return;
      if (!await waitForWritablePathError(error, attempt)) throw error;
    }
  }
  throw lastError;
}

async function enqueueSqliteSave(dbPath: string, task: () => Promise<void>): Promise<void> {
  const previous = sqliteSaveQueues.get(dbPath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  sqliteSaveQueues.set(dbPath, next);
  try {
    await next;
  } finally {
    if (sqliteSaveQueues.get(dbPath) === next) {
      sqliteSaveQueues.delete(dbPath);
    }
  }
}

function sqliteRecordKey(row: Pick<SqliteRecordRow, "table_name" | "record_key">): string {
  return JSON.stringify([row.table_name, row.record_key]);
}

function readSqliteRecordSnapshot(db: any): Map<string, SqliteRecordRow> {
  const snapshot = new Map<string, SqliteRecordRow>();
  let statement: any = null;
  try {
    statement = db.prepare(`
      SELECT table_name, record_key, run_id, created_at, target_id, target_snapshot_id, parent_key, payload_json
      FROM records
    `);
    while (statement.step()) {
      const raw = statement.getAsObject() as Record<string, unknown>;
      const row: SqliteRecordRow = {
        table_name: String(raw.table_name ?? ""),
        record_key: String(raw.record_key ?? ""),
        run_id: raw.run_id == null ? null : String(raw.run_id),
        created_at: raw.created_at == null ? null : String(raw.created_at),
        target_id: raw.target_id == null ? null : String(raw.target_id),
        target_snapshot_id: raw.target_snapshot_id == null ? null : String(raw.target_snapshot_id),
        parent_key: raw.parent_key == null ? null : String(raw.parent_key),
        payload_json: String(raw.payload_json ?? "null")
      };
      snapshot.set(sqliteRecordKey(row), row);
    }
  } catch {
    return snapshot;
  } finally {
    statement?.free?.();
  }
  return snapshot;
}

function recordsEqual(left: SqliteRecordRow | undefined, right: SqliteRecordRow): boolean {
  return Boolean(left)
    && left!.run_id === right.run_id
    && left!.created_at === right.created_at
    && left!.target_id === right.target_id
    && left!.target_snapshot_id === right.target_snapshot_id
    && left!.parent_key === right.parent_key
    && left!.payload_json === right.payload_json;
}

async function openLatestSqliteDatabase(rootDir: string): Promise<any> {
  const SQL = await getSqlJs();
  return openSqliteBytes(SQL, await readExistingSqliteBytes(rootDir));
}

function mergeSqliteRecordChanges(args: {
  latestDb: any;
  original: Map<string, SqliteRecordRow>;
  current: Map<string, SqliteRecordRow>;
}): void {
  args.latestDb.run("BEGIN");
  let upsert: any = null;
  let remove: any = null;
  try {
    upsert = args.latestDb.prepare(`
      INSERT INTO records (table_name, record_key, run_id, created_at, target_id, target_snapshot_id, parent_key, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(table_name, record_key) DO UPDATE SET
        run_id=excluded.run_id,
        created_at=excluded.created_at,
        target_id=excluded.target_id,
        target_snapshot_id=excluded.target_snapshot_id,
        parent_key=excluded.parent_key,
        payload_json=excluded.payload_json
    `);
    remove = args.latestDb.prepare("DELETE FROM records WHERE table_name = ? AND record_key = ?");
    for (const [key, originalRow] of args.original.entries()) {
      if (!args.current.has(key)) remove.run([originalRow.table_name, originalRow.record_key]);
    }
    for (const [key, currentRow] of args.current.entries()) {
      if (recordsEqual(args.original.get(key), currentRow)) continue;
      upsert.run([
        currentRow.table_name,
        currentRow.record_key,
        currentRow.run_id,
        currentRow.created_at,
        currentRow.target_id,
        currentRow.target_snapshot_id,
        currentRow.parent_key,
        currentRow.payload_json
      ]);
    }
    args.latestDb.run("COMMIT");
  } catch (error) {
    try { args.latestDb.run("ROLLBACK"); } catch {}
    throw error;
  } finally {
    upsert?.free?.();
    remove?.free?.();
  }
}

export async function saveSqliteDatabase(rootDir: string, db: any, databaseMode: DatabaseMode = "local", bundleExportPolicy?: BundleExportPolicy): Promise<void> {
  if (isRemoteDatabase(db)) {
    ensureSqliteSchema(db);
    flushRemoteUpserts(db);
    return;
  }
  await fs.mkdir(rootDir, { recursive: true });
  const original = sqliteOpenSnapshots.get(db) ?? new Map<string, SqliteRecordRow>();
  const current = readSqliteRecordSnapshot(db);
  const dbPath = sqliteDbPath(rootDir);
  await enqueueSqliteSave(dbPath, async () => {
    const fileLock = await acquireSqliteFileLock(dbPath);
    try {
      const latestDb = await openLatestSqliteDatabase(rootDir);
      const tempPath = `${dbPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      try {
        ensureSqliteSchema(latestDb);
        mergeSqliteRecordChanges({ latestDb, original, current });
        if (sqliteSaveFailureForTests === "before_temp_write") {
          throw Object.assign(new Error("simulated_sqlite_disk_full"), { code: "ENOSPC" });
        }
        await fs.writeFile(tempPath, Buffer.from(latestDb.export()));
        if (sqliteSaveFailureForTests === "before_replace") {
          throw Object.assign(new Error("simulated_sqlite_replace_failure"), { code: "EIO" });
        }
        await replaceSqliteFile(tempPath, dbPath);
      } catch (error) {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
        if (error instanceof SqlitePersistenceError) throw error;
        throw new SqlitePersistenceError("sqlite_save_failed", { cause: error });
      } finally {
        latestDb.close();
      }
    } finally {
      await releaseSqliteFileLock(fileLock);
    }
  });
  sqliteOpenSnapshots.set(db, current);
  const { resolveBundleExportPolicy } = await import("./bundle-exports.js");
  await writePersistenceMetadata(rootDir, databaseMode, bundleExportPolicy ?? resolveBundleExportPolicy(databaseMode));
}

export function ensureSqliteSchema(db: any): void {
  if (isRemoteDatabase(db)) {
    runPostgresSql(buildPostgresMigrationSql());
    return;
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      table_name TEXT NOT NULL,
      record_key TEXT NOT NULL,
      run_id TEXT,
      created_at TEXT,
      target_id TEXT,
      target_snapshot_id TEXT,
      parent_key TEXT,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (table_name, record_key)
    );
    CREATE INDEX IF NOT EXISTS idx_records_table_name ON records(table_name);
    CREATE INDEX IF NOT EXISTS idx_records_run_id ON records(run_id);
    CREATE INDEX IF NOT EXISTS idx_records_target_id ON records(target_id);
    CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at);

    CREATE TABLE IF NOT EXISTS record_schemas (
      table_name TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      primary_key_json TEXT NOT NULL,
      fields_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  upsertSqliteRecordSchemas(db);
}

function upsertSqliteRecordSchemas(db: any): void {
  const updatedAt = new Date().toISOString();
  const statement = db.prepare(`
    INSERT INTO record_schemas (table_name, description, primary_key_json, fields_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(table_name) DO UPDATE SET
      description=excluded.description,
      primary_key_json=excluded.primary_key_json,
      fields_json=excluded.fields_json,
      updated_at=excluded.updated_at
  `);
  for (const definition of PERSISTENCE_TABLE_DEFINITIONS) {
    statement.run([
      definition.name,
      definition.description,
      JSON.stringify(definition.primary_key),
      JSON.stringify(definition.fields),
      updatedAt
    ]);
  }
  statement.free();
}

export function upsertSqliteRecord(args: {
  db: any;
  tableName: string;
  recordKey: string;
  payload: unknown;
  runId?: string | null;
  createdAt?: string | null;
  targetId?: string | null;
  targetSnapshotId?: string | null;
  parentKey?: string | null;
}): void {
  if (isRemoteDatabase(args.db)) {
    args.db.pendingUpserts.push({
      tableName: String(args.tableName ?? ""),
      recordKey: String(args.recordKey ?? ""),
      payload: args.payload ?? null,
      runId: args.runId ?? null,
      createdAt: args.createdAt ?? null,
      targetId: args.targetId ?? null,
      targetSnapshotId: args.targetSnapshotId ?? null,
      parentKey: args.parentKey ?? null
    });
    return;
  }
  const normalizeBindValue = (value: string | number | boolean | null | undefined): string | number | boolean | null => value ?? null;
  const statement = args.db.prepare(`
    INSERT INTO records (table_name, record_key, run_id, created_at, target_id, target_snapshot_id, parent_key, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(table_name, record_key) DO UPDATE SET
      run_id=excluded.run_id,
      created_at=excluded.created_at,
      target_id=excluded.target_id,
      target_snapshot_id=excluded.target_snapshot_id,
      parent_key=excluded.parent_key,
      payload_json=excluded.payload_json
  `);
  statement.run([
    String(args.tableName ?? ""),
    String(args.recordKey ?? ""),
    normalizeBindValue(args.runId),
    normalizeBindValue(args.createdAt),
    normalizeBindValue(args.targetId),
    normalizeBindValue(args.targetSnapshotId),
    normalizeBindValue(args.parentKey),
    JSON.stringify(args.payload ?? null)
  ]);
  statement.free();
}

export function readSqliteTable<T>(db: any, tableName: string): T[] {
  if (isRemoteDatabase(db)) {
    flushRemoteUpserts(db);
    const output = runPostgresSql(
      `SELECT COALESCE(jsonb_agg(payload_json ORDER BY created_at NULLS LAST, record_key), '[]'::jsonb)::text FROM records WHERE table_name = ${sqlLiteral(tableName)}`,
      { capture: true }
    ).trim();
    return JSON.parse(output || "[]") as T[];
  }
  const statement = db.prepare(`SELECT payload_json FROM records WHERE table_name = ?`);
  statement.bind([String(tableName ?? "")]);
  const rows: T[] = [];
  while (statement.step()) {
    const row = statement.getAsObject() as { payload_json?: string };
    rows.push(JSON.parse(String(row.payload_json ?? "null")) as T);
  }
  statement.free();
  return rows;
}

export function deleteSqliteRecord(args: { db: any; tableName: string; recordKey: string }): boolean {
  if (isRemoteDatabase(args.db)) {
    flushRemoteUpserts(args.db);
    const definition = PERSISTENCE_TABLE_DEFINITIONS.find((item) => item.name === args.tableName && item.primary_key.length === 1);
    const relationalDelete = definition
      ? `DELETE FROM ${definition.name} WHERE ${definition.primary_key[0]} = ${sqlLiteral(args.recordKey)};`
      : "";
    const output = runPostgresSql(
      `BEGIN;
       ${relationalDelete}
       DELETE FROM records WHERE table_name = ${sqlLiteral(args.tableName)} AND record_key = ${sqlLiteral(args.recordKey)} RETURNING record_key;
       COMMIT;`,
      { capture: true }
    ).trim();
    return Boolean(output);
  }
  const statement = args.db.prepare("DELETE FROM records WHERE table_name = ? AND record_key = ?");
  statement.run([String(args.tableName ?? ""), String(args.recordKey ?? "")]);
  statement.free();
  const changed = Number(args.db.exec("SELECT changes() AS count")[0]?.values?.[0]?.[0] ?? 0) > 0;
  return changed;
}
