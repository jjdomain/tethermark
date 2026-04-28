import path from "node:path";

import type { DatabaseMode } from "../contracts.js";
import type { PersistenceStore } from "./contracts.js";
import { LocalPersistenceStore } from "./local-store.js";

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
  return value === "local";
}

export function resolvePersistenceMode(request?: { db_mode?: DatabaseMode } | null): DatabaseMode {
  const requestedMode = request?.db_mode ?? process.env.HARNESS_DB_MODE;
  if (!requestedMode) return "local";
  if (isDatabaseMode(requestedMode)) return requestedMode;
  throw new Error(`Unsupported OSS database mode "${requestedMode}". Use "local". Hosted production storage is provided by the hosted Supabase/Postgres adapter.`);
}

export function defaultPersistenceRoot(mode?: DatabaseMode): string {
  const resolvedMode = mode ?? resolvePersistenceMode();
  const envRoot = resolveModeRootEnv(resolvedMode);
  if (envRoot) return path.resolve(envRoot);
  return path.resolve(process.cwd(), ".artifacts", "state", "local-db");
}

export function resolvePersistenceLocation(args?: PersistenceReadOptions): PersistenceLocation {
  const mode = args?.dbMode ?? resolvePersistenceMode();
  return {
    mode,
    rootDir: path.resolve(args?.rootDir ?? defaultPersistenceRoot(mode))
  };
}

export function createPersistenceStore(mode: DatabaseMode, rootDir?: string): PersistenceStore {
  const resolvedRoot = path.resolve(rootDir ?? defaultPersistenceRoot(mode));
  if (mode === "local") return new LocalPersistenceStore(resolvedRoot);
  throw new Error(`Unsupported OSS database mode "${mode}". Use "local".`);
}
