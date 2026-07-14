import path from "node:path";

import type { DatabaseMode } from "../contracts.js";
import type { PersistenceStore } from "./contracts.js";
import { LocalPersistenceStore } from "./local-store.js";
import { SqliteFilePersistenceStore } from "./sqlite-file-store.js";

export interface PersistenceLocation {
  mode: DatabaseMode;
  rootDir: string;
}

export interface PersistenceReadOptions {
  rootDir?: string;
  dbMode?: DatabaseMode;
}

function resolveModeRootEnv(_mode: DatabaseMode): string | undefined {
  return process.env.HARNESS_LOCAL_DB_ROOT;
}

function isDatabaseMode(value: unknown): value is DatabaseMode {
  return value === "local" || value === "postgres" || value === "supabase";
}

export function resolvePersistenceMode(request?: { db_mode?: DatabaseMode } | null): DatabaseMode {
  const requestedMode = request?.db_mode ?? process.env.HARNESS_DB_MODE;
  if (!requestedMode) return "local";
  if (isDatabaseMode(requestedMode)) return requestedMode;
  throw new Error(`Unsupported database mode "${requestedMode}". Use "local", "postgres", or "supabase".`);
}

export function defaultPersistenceRoot(mode?: DatabaseMode): string {
  const resolvedMode = mode ?? resolvePersistenceMode();
  if (resolvedMode === "postgres" || resolvedMode === "supabase") return resolvedMode;
  const envRoot = resolveModeRootEnv(resolvedMode);
  if (envRoot) return path.resolve(envRoot);
  return path.resolve(process.cwd(), ".artifacts", "state", "local-db");
}

export function resolvePersistenceLocation(args?: PersistenceReadOptions): PersistenceLocation {
  const mode = args?.dbMode ?? resolvePersistenceMode();
  return {
    mode,
    rootDir: mode === "local" ? path.resolve(args?.rootDir ?? defaultPersistenceRoot(mode)) : defaultPersistenceRoot(mode)
  };
}

export function createPersistenceStore(mode: DatabaseMode, rootDir?: string): PersistenceStore {
  if (mode === "local") return new LocalPersistenceStore(path.resolve(rootDir ?? defaultPersistenceRoot(mode)));
  return new SqliteFilePersistenceStore(mode, rootDir ?? defaultPersistenceRoot(mode));
}
