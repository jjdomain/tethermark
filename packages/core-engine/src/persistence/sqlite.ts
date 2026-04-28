import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import type { DatabaseMode } from "../contracts.js";
import type { BundleExportPolicy } from "./bundle-exports.js";

const require = createRequire(import.meta.url);
const initSqlJs: any = require("sql.js/dist/sql-wasm.js");

let sqlJsPromise: Promise<any> | null = null;

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

export const PERSISTENCE_SCHEMA_VERSION = "1.1.0";

function wasmPath(): string {
  return path.resolve(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
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
  try {
    await fs.access(sqliteDbPath(rootDir));
    return true;
  } catch {
    return false;
  }
}

export async function openSqliteDatabase(rootDir: string): Promise<any> {
  const SQL = await getSqlJs();
  const dbPath = sqliteDbPath(rootDir);
  try {
    const bytes = await fs.readFile(dbPath);
    return new SQL.Database(bytes);
  } catch {
    return new SQL.Database();
  }
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

export async function saveSqliteDatabase(rootDir: string, db: any, databaseMode: DatabaseMode = "local", bundleExportPolicy?: BundleExportPolicy): Promise<void> {
  await fs.mkdir(rootDir, { recursive: true });
  const bytes = db.export();
  await fs.writeFile(sqliteDbPath(rootDir), Buffer.from(bytes));
  const { resolveBundleExportPolicy } = await import("./bundle-exports.js");
  await writePersistenceMetadata(rootDir, databaseMode, bundleExportPolicy ?? resolveBundleExportPolicy(databaseMode));
}

export function ensureSqliteSchema(db: any): void {
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
  `);
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
