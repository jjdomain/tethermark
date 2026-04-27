import path from "node:path";

import type { DatabaseMode } from "../contracts.js";
import type { PersistenceStore } from "./contracts.js";
import { EmbeddedPersistenceStore } from "./embedded-store.js";
import { LocalPersistenceStore } from "./local-store.js";

export interface PersistenceLocation {
  mode: DatabaseMode;
  rootDir: string;
}

export interface PersistenceReadOptions {
  rootDir?: string;
  dbMode?: DatabaseMode;
}

function resolveModeRootEnv(mode: DatabaseMode): string | undefined {
  if (mode === "embedded") return process.env.HARNESS_EMBEDDED_DB_ROOT;
  return process.env.HARNESS_LOCAL_DB_ROOT;
}

export function resolvePersistenceMode(request?: { db_mode?: DatabaseMode } | null): DatabaseMode {
  const envMode = process.env.HARNESS_DB_MODE as DatabaseMode | undefined;
  return request?.db_mode ?? envMode ?? "embedded";
}

export function defaultPersistenceRoot(mode?: DatabaseMode): string {
  const resolvedMode = mode ?? resolvePersistenceMode();
  const envRoot = resolveModeRootEnv(resolvedMode);
  if (envRoot) return path.resolve(envRoot);
  return path.resolve(process.cwd(), ".artifacts", "state", `${resolvedMode}-db`);
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
  if (mode === "embedded") return new EmbeddedPersistenceStore(resolvedRoot);
  return new LocalPersistenceStore(resolvedRoot);
}
