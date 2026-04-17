import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import type { DatabaseMode } from "../contracts.js";
import type { BundleExportPolicy } from "./bundle-exports.js";

const require = createRequire(import.meta.url);
const initSqlJs: any = require("sql.js/dist/sql-wasm.js");

let sqlJsPromise: Promise<any> | null = null;

export interface PersistenceMetadata {
  database_mode: DatabaseMode;
  backend_kind: "sqlite_file";
  sqlite_path: string;
  bundle_exports_dir: string;
  bundle_export_policy: BundleExportPolicy;
  json_table_mirrors: boolean;
  updated_at: string;
}

export type EmbeddedPersistenceMetadata = PersistenceMetadata;

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

export function embeddedPersistenceMetadataPath(rootDir: string): string {
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
    database_mode: databaseMode,
    backend_kind: "sqlite_file",
    sqlite_path: sqliteDbPath(rootDir),
    bundle_exports_dir: path.join(rootDir, "runs"),
    bundle_export_policy: bundleExportPolicy,
    json_table_mirrors: false,
    updated_at: new Date().toISOString()
  };
  await fs.mkdir(rootDir, { recursive: true });
  await fs.writeFile(embeddedPersistenceMetadataPath(rootDir), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

export async function writeEmbeddedPersistenceMetadata(rootDir: string): Promise<EmbeddedPersistenceMetadata> {
  const { resolveBundleExportPolicy } = await import("./bundle-exports.js");
  return writePersistenceMetadata(rootDir, "embedded", resolveBundleExportPolicy("embedded"));
}

export async function readPersistenceMetadata(rootDir: string): Promise<PersistenceMetadata | null> {
  try {
    const raw = await fs.readFile(embeddedPersistenceMetadataPath(rootDir), "utf8");
    return JSON.parse(raw) as PersistenceMetadata;
  } catch {
    return null;
  }
}

export async function readEmbeddedPersistenceMetadata(rootDir: string): Promise<EmbeddedPersistenceMetadata | null> {
  return readPersistenceMetadata(rootDir);
}

export async function saveSqliteDatabase(rootDir: string, db: any, databaseMode: DatabaseMode = "embedded", bundleExportPolicy?: BundleExportPolicy): Promise<void> {
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
    args.tableName,
    args.recordKey,
    args.runId ?? null,
    args.createdAt ?? null,
    args.targetId ?? null,
    args.targetSnapshotId ?? null,
    args.parentKey ?? null,
    JSON.stringify(args.payload ?? null)
  ]);
  statement.free();
}

export function readSqliteTable<T>(db: any, tableName: string): T[] {
  const statement = db.prepare(`SELECT payload_json FROM records WHERE table_name = ?`);
  statement.bind([tableName]);
  const rows: T[] = [];
  while (statement.step()) {
    const row = statement.getAsObject() as { payload_json?: string };
    rows.push(JSON.parse(String(row.payload_json ?? "null")) as T);
  }
  statement.free();
  return rows;
}
