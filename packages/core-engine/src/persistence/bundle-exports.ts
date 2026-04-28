import fs from "node:fs/promises";
import path from "node:path";

import type { DatabaseMode } from "../contracts.js";

export interface BundleExportPolicy {
  database_mode: DatabaseMode;
  policy: "debug_optional";
  enabled: boolean;
  retention_days: number | null;
  notes: string[];
}

export interface BundleExportCompactionSummary {
  root: string;
  dry_run: boolean;
  policy: BundleExportPolicy;
  scanned_files: number;
  removed_files: string[];
  kept_files: string[];
}

function parseBoolean(value: string | undefined): boolean | null {
  if (!value) return null;
  if (/^(1|true|yes)$/i.test(value)) return true;
  if (/^(0|false|no)$/i.test(value)) return false;
  return null;
}

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveBundleExportPolicy(mode: DatabaseMode = "local"): BundleExportPolicy {
  const enabledOverride = parseBoolean(process.env.HARNESS_BUNDLE_EXPORT_ENABLED);
  const retentionOverride = parsePositiveNumber(process.env.HARNESS_BUNDLE_EXPORT_RETENTION_DAYS);
  return {
    database_mode: mode,
    policy: "debug_optional",
    enabled: enabledOverride ?? false,
    retention_days: retentionOverride ?? 14,
    notes: [
      "Local mode treats bundle exports as temporary debug material rather than canonical storage.",
      "Use compact maintenance to prune old bundle exports after short-lived debugging windows."
    ]
  };
}

export async function compactBundleExports(args?: {
  rootDir?: string;
  dryRun?: boolean;
  retentionDays?: number | null;
  mode?: DatabaseMode;
}): Promise<BundleExportCompactionSummary> {
  const mode = args?.mode ?? "local";
  const root = path.resolve(args?.rootDir ?? path.resolve(process.cwd(), ".artifacts", "state", `${mode}-db`));
  const dryRun = args?.dryRun ?? false;
  const policy = resolveBundleExportPolicy(mode);
  const retentionDays = args?.retentionDays ?? policy.retention_days;
  const runsDir = path.join(root, "runs");
  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  const removedFiles: string[] = [];
  const keptFiles: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(runsDir, entry.name);
    const stat = await fs.stat(filePath);
    const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    const shouldRemove = policy.enabled === false || (retentionDays !== null && ageDays > retentionDays);
    if (shouldRemove) {
      removedFiles.push(entry.name);
      if (!dryRun) await fs.unlink(filePath);
      continue;
    }
    keptFiles.push(entry.name);
  }

  return {
    root,
    dry_run: dryRun,
    policy: {
      ...policy,
      retention_days: retentionDays
    },
    scanned_files: entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length,
    removed_files: removedFiles.sort(),
    kept_files: keptFiles.sort()
  };
}
