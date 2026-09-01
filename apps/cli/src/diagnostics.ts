import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveEnvironmentFilePath } from "../../../packages/core-engine/src/env.js";
import { resolveArtifactRoot } from "../../../packages/core-engine/src/local-paths.js";
import { defaultPersistenceRoot } from "../../../packages/core-engine/src/persistence/backend.js";
import type { DoctorReport } from "./doctor.js";

export const DIAGNOSTICS_SCHEMA_VERSION = "2026-08-28.diagnostics.v1";
const MAX_TREE_ENTRIES = 50_000;

interface TreeSummary {
  exists: boolean;
  files: number;
  directories: number;
  bytes: number;
  truncated: boolean;
}

async function summarizeTree(root: string): Promise<TreeSummary> {
  const summary: TreeSummary = { exists: false, files: 0, directories: 0, bytes: 0, truncated: false };
  const pending = [root];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) continue;
    summary.exists = true;
    visited += 1;
    if (visited > MAX_TREE_ENTRIES) {
      summary.truncated = true;
      break;
    }
    if (stat.isFile()) {
      summary.files += 1;
      summary.bytes += stat.size;
      continue;
    }
    if (!stat.isDirectory()) continue;
    summary.directories += 1;
    for (const entry of await fs.readdir(current)) pending.push(path.join(current, entry));
  }
  return summary;
}

async function protectedFileSummary(filePath: string): Promise<{ exists: boolean; regular_file: boolean; symlink: boolean; owner_only_mode: boolean | null }> {
  try {
    const stat = await fs.lstat(filePath);
    return {
      exists: true,
      regular_file: stat.isFile(),
      symlink: stat.isSymbolicLink(),
      owner_only_mode: process.platform === "win32" ? null : (stat.mode & 0o077) === 0
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, regular_file: false, symlink: false, owner_only_mode: null };
    throw error;
  }
}

export async function buildDiagnosticsBundle(args: { outputPath?: string; doctorReport: DoctorReport; now?: Date }): Promise<{ output_path: string; bundle: Record<string, unknown> }> {
  const artifactRoot = resolveArtifactRoot();
  const persistenceRoot = defaultPersistenceRoot("local");
  const environmentFile = resolveEnvironmentFilePath();
  const packageJson = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "package.json"), "utf8")) as { version?: string };
  const timestamp = (args.now ?? new Date()).toISOString();
  const safeTimestamp = timestamp.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const outputPath = path.resolve(args.outputPath ?? path.join(artifactRoot, "diagnostics", `tethermark-diagnostics-${safeTimestamp}.json`));
  const [artifacts, persistence, config] = await Promise.all([
    summarizeTree(artifactRoot),
    summarizeTree(persistenceRoot),
    protectedFileSummary(environmentFile)
  ]);
  const bundle = {
    schema_version: DIAGNOSTICS_SCHEMA_VERSION,
    generated_at: timestamp,
    product: { name: "Tethermark Community Edition", version: packageJson.version ?? "unknown" },
    host: {
      platform: process.platform,
      architecture: process.arch,
      os_release: os.release(),
      node_version: process.version
    },
    configuration: {
      external_environment_file_configured: Boolean(process.env.HARNESS_ENV_FILE?.trim()),
      external_artifact_root_configured: Boolean(process.env.HARNESS_ARTIFACT_ROOT?.trim()),
      external_persistence_root_configured: Boolean(process.env.HARNESS_LOCAL_DB_ROOT?.trim()),
      environment_file: config
    },
    storage: {
      artifacts,
      persistence,
      paths_redacted: true
    },
    readiness: {
      summary: args.doctorReport.summary,
      checks: args.doctorReport.checks.map((check) => ({ id: check.id, status: check.status }))
    },
    privacy: {
      includes_credentials: false,
      includes_environment_values: false,
      includes_local_paths: false,
      includes_audit_content: false,
      review_before_sharing: true
    }
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") await fs.chmod(outputPath, 0o600);
  return { output_path: outputPath, bundle };
}
