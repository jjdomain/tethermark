import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { PERSISTENCE_POSTGRES_DDL, PERSISTENCE_TABLE_DEFINITIONS } from "./schema-manifest.js";

export interface PostgresConnectionConfig {
  database_url: string | null;
  database_url_source: string | null;
  ssl_required: boolean;
  supabase_project_url: string | null;
  supabase_service_role_key_configured: boolean;
}

export interface PostgresMigrationResult {
  dry_run: boolean;
  applied: boolean;
  database_url_source: string | null;
  migration_file: string;
  command: string | null;
  stdout: string;
  stderr: string;
}

function envValue(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolvePostgresConnectionConfig(): PostgresConnectionConfig {
  const entries = [
    ["HARNESS_POSTGRES_URL", envValue("HARNESS_POSTGRES_URL")],
    ["SUPABASE_DB_URL", envValue("SUPABASE_DB_URL")],
    ["DATABASE_URL", envValue("DATABASE_URL")]
  ] as const;
  const selected = entries.find(([, value]) => Boolean(value)) ?? null;
  return {
    database_url: selected?.[1] ?? null,
    database_url_source: selected?.[0] ?? null,
    ssl_required: envValue("HARNESS_POSTGRES_SSL") !== "false",
    supabase_project_url: envValue("SUPABASE_URL"),
    supabase_service_role_key_configured: Boolean(envValue("SUPABASE_SERVICE_ROLE_KEY"))
  };
}

export function buildPostgresRecordStoreDdl(): string {
  const schemaRows = PERSISTENCE_TABLE_DEFINITIONS.map((definition) => {
    const description = definition.description.replace(/'/g, "''");
    const primaryKeyJson = JSON.stringify(definition.primary_key).replace(/'/g, "''");
    const fieldsJson = JSON.stringify(definition.fields).replace(/'/g, "''");
    return `('${definition.name}', '${description}', '${primaryKeyJson}'::jsonb, '${fieldsJson}'::jsonb, NOW())`;
  }).join(",\n  ");

  return [
    "CREATE TABLE IF NOT EXISTS records (",
    "  table_name TEXT NOT NULL,",
    "  record_key TEXT NOT NULL,",
    "  run_id TEXT,",
    "  created_at TIMESTAMPTZ,",
    "  target_id TEXT,",
    "  target_snapshot_id TEXT,",
    "  parent_key TEXT,",
    "  payload_json JSONB NOT NULL,",
    "  PRIMARY KEY (table_name, record_key)",
    ");",
    "CREATE INDEX IF NOT EXISTS idx_records_table_name ON records(table_name);",
    "CREATE INDEX IF NOT EXISTS idx_records_run_id ON records(run_id);",
    "CREATE INDEX IF NOT EXISTS idx_records_target_id ON records(target_id);",
    "CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at);",
    "",
    "CREATE TABLE IF NOT EXISTS record_schemas (",
    "  table_name TEXT PRIMARY KEY,",
    "  description TEXT NOT NULL,",
    "  primary_key_json JSONB NOT NULL,",
    "  fields_json JSONB NOT NULL,",
    "  updated_at TIMESTAMPTZ NOT NULL",
    ");",
    "",
    "INSERT INTO record_schemas (table_name, description, primary_key_json, fields_json, updated_at)",
    `VALUES\n  ${schemaRows}`,
    "ON CONFLICT(table_name) DO UPDATE SET",
    "  description=EXCLUDED.description,",
    "  primary_key_json=EXCLUDED.primary_key_json,",
    "  fields_json=EXCLUDED.fields_json,",
    "  updated_at=EXCLUDED.updated_at;",
    ""
  ].join("\n");
}

export function buildPostgresMigrationSql(): string {
  return [
    "-- Tethermark Postgres/Supabase bootstrap migration.",
    "-- Default OSS runtime remains SQLite; this migration prepares a remote Postgres-compatible store.",
    "BEGIN;",
    buildPostgresRecordStoreDdl(),
    PERSISTENCE_POSTGRES_DDL,
    "COMMIT;",
    ""
  ].join("\n\n");
}

export async function writePostgresMigrationFile(outputFile: string): Promise<string> {
  const resolved = path.resolve(outputFile);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, buildPostgresMigrationSql(), "utf8");
  return resolved;
}

export function buildPsqlProcessEnv(databaseUrl: string, environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("postgres_database_url_invalid");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !database) throw new Error("postgres_database_url_invalid");
  return {
    ...environment,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: database,
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGSSLMODE: parsed.searchParams.get("sslmode") || (envValue("HARNESS_POSTGRES_SSL") === "false" ? "prefer" : "require"),
    PGAPPNAME: "tethermark"
  };
}

export async function runPostgresMigration(args: {
  databaseUrl?: string | null;
  outputFile?: string | null;
  dryRun?: boolean;
  psqlCommand?: string | null;
} = {}): Promise<PostgresMigrationResult> {
  const config = resolvePostgresConnectionConfig();
  const databaseUrl = args.databaseUrl ?? config.database_url;
  const migrationFile = await writePostgresMigrationFile(args.outputFile ?? path.join(os.tmpdir(), `tethermark-postgres-${Date.now()}.sql`));
  if (args.dryRun) {
    return {
      dry_run: true,
      applied: false,
      database_url_source: args.databaseUrl ? "argument" : config.database_url_source,
      migration_file: migrationFile,
      command: null,
      stdout: "",
      stderr: ""
    };
  }
  if (!databaseUrl) {
    throw new Error("postgres_database_url_required");
  }
  const command = args.psqlCommand || envValue("HARNESS_PSQL_COMMAND") || "psql";
  const result = await new Promise<{ stdout: string; stderr: string; status: number | null }>((resolve, reject) => {
    const child = spawn(command, ["-X", "-v", "ON_ERROR_STOP=1", "-f", migrationFile], {
      env: buildPsqlProcessEnv(databaseUrl),
      windowsHide: true,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (status) => resolve({ stdout, stderr, status }));
  });
  if (result.status !== 0) {
    throw new Error(`postgres_migration_failed:${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
  return {
    dry_run: false,
    applied: true,
    database_url_source: args.databaseUrl ? "argument" : config.database_url_source,
    migration_file: migrationFile,
    command,
    stdout: result.stdout,
    stderr: result.stderr
  };
}
