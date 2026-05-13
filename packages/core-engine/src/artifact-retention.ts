import fs from "node:fs/promises";
import path from "node:path";

export type ArtifactRetentionKind = "runs" | "sandboxes" | "all";

export interface ArtifactRetentionOptions {
  rootDir?: string;
  kind?: ArtifactRetentionKind;
  dryRun?: boolean;
  olderThanDays?: number | null;
  maxBytes?: number | null;
  now?: Date;
}

export interface ArtifactRetentionSummaryOptions {
  rootDir?: string;
  kind?: ArtifactRetentionKind;
  includeSize?: boolean;
  now?: Date;
}

export interface ArtifactRetentionCandidate {
  kind: Exclude<ArtifactRetentionKind, "all">;
  id: string;
  path: string;
  size_bytes: number;
  updated_at: string;
  age_days: number;
  prune_reasons: string[];
}

export interface ArtifactRetentionSummary {
  root: string;
  dry_run: boolean;
  kind: ArtifactRetentionKind;
  older_than_days: number | null;
  max_bytes: number | null;
  scanned_count: number;
  scanned_bytes: number;
  removed_count: number;
  removed_bytes: number;
  kept_count: number;
  kept_bytes: number;
  removed: ArtifactRetentionCandidate[];
  kept: ArtifactRetentionCandidate[];
  missing_roots: string[];
  run_index_pruned_ids: string[];
}

export interface ArtifactStorageSummary {
  root: string;
  kind: ArtifactRetentionKind;
  include_size: boolean;
  scanned_count: number;
  scanned_bytes: number | null;
  oldest_updated_at: string | null;
  newest_updated_at: string | null;
  missing_roots: string[];
  entries: ArtifactRetentionCandidate[];
}

function defaultArtifactBaseRoot(): string {
  return path.resolve(process.cwd(), ".artifacts");
}

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveArtifactRetentionOptions(options: ArtifactRetentionOptions = {}): Required<Omit<ArtifactRetentionOptions, "now">> & { now: Date } {
  const envRetentionDays = parsePositiveNumber(process.env.HARNESS_ARTIFACT_RETENTION_DAYS);
  const envMaxGb = parsePositiveNumber(process.env.HARNESS_ARTIFACT_RETENTION_MAX_GB);
  const envKind = process.env.HARNESS_ARTIFACT_RETENTION_KIND;
  const kind: ArtifactRetentionKind = options.kind
    ?? (envKind === "runs" || envKind === "sandboxes" || envKind === "all" ? envKind : "runs");
  return {
    rootDir: path.resolve(options.rootDir ?? defaultArtifactBaseRoot()),
    kind,
    dryRun: options.dryRun ?? false,
    olderThanDays: options.olderThanDays ?? envRetentionDays,
    maxBytes: options.maxBytes ?? (envMaxGb ? Math.floor(envMaxGb * 1024 * 1024 * 1024) : null),
    now: options.now ?? new Date()
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function directorySizeBytes(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(entryPath);
    } else if (entry.isFile()) {
      total += (await fs.stat(entryPath)).size;
    }
  }
  return total;
}

async function collectKindCandidates(args: {
  root: string;
  kind: Exclude<ArtifactRetentionKind, "all">;
  nowMs: number;
  missingRoots: string[];
  includeSize: boolean;
}): Promise<ArtifactRetentionCandidate[]> {
  const kindRoot = path.join(args.root, args.kind);
  if (!(await pathExists(kindRoot))) {
    args.missingRoots.push(kindRoot);
    return [];
  }

  const entries = await fs.readdir(kindRoot, { withFileTypes: true });
  const candidates: ArtifactRetentionCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(kindRoot, entry.name);
    const stat = await fs.stat(dirPath);
    const updatedMs = stat.mtimeMs;
    const ageDays = Math.max(0, (args.nowMs - updatedMs) / (24 * 60 * 60 * 1000));
    candidates.push({
      kind: args.kind,
      id: entry.name,
      path: dirPath,
      size_bytes: args.includeSize ? await directorySizeBytes(dirPath) : 0,
      updated_at: stat.mtime.toISOString(),
      age_days: Number(ageDays.toFixed(3)),
      prune_reasons: []
    });
  }
  return candidates;
}

function selectCandidatesForPrune(args: {
  candidates: ArtifactRetentionCandidate[];
  olderThanDays: number | null;
  maxBytes: number | null;
}): ArtifactRetentionCandidate[] {
  const selected = new Map<string, ArtifactRetentionCandidate>();
  const keyFor = (item: ArtifactRetentionCandidate) => `${item.kind}:${item.id}`;
  const addReason = (item: ArtifactRetentionCandidate, reason: string) => {
    const key = keyFor(item);
    const current = selected.get(key) ?? { ...item, prune_reasons: [] };
    if (!current.prune_reasons.includes(reason)) current.prune_reasons.push(reason);
    selected.set(key, current);
  };

  if (args.olderThanDays != null) {
    for (const candidate of args.candidates) {
      if (candidate.age_days >= args.olderThanDays) {
        addReason(candidate, `older_than_${args.olderThanDays}_days`);
      }
    }
  }

  if (args.maxBytes != null) {
    let retainedBytes = args.candidates.reduce((sum, item) => sum + item.size_bytes, 0);
    const oldestFirst = [...args.candidates].sort((left, right) =>
      left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id)
    );
    for (const candidate of oldestFirst) {
      if (retainedBytes <= args.maxBytes) break;
      addReason(candidate, `exceeds_max_bytes_${args.maxBytes}`);
      retainedBytes -= candidate.size_bytes;
    }
  }

  return [...selected.values()].sort((left, right) => left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id));
}

async function pruneRunIndex(args: { root: string; runIds: string[]; dryRun: boolean }): Promise<string[]> {
  if (!args.runIds.length) return [];
  const indexPath = path.join(args.root, "run-index.json");
  if (!(await pathExists(indexPath))) return [];
  const raw = await fs.readFile(indexPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const pruned: string[] = [];
  for (const runId of args.runIds) {
    if (Object.prototype.hasOwnProperty.call(parsed, runId)) {
      pruned.push(runId);
      if (!args.dryRun) delete parsed[runId];
    }
  }
  if (pruned.length && !args.dryRun) {
    await fs.writeFile(indexPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }
  return pruned;
}

export async function pruneArtifacts(options: ArtifactRetentionOptions = {}): Promise<ArtifactRetentionSummary> {
  const resolved = resolveArtifactRetentionOptions(options);
  if (resolved.olderThanDays == null && resolved.maxBytes == null) {
    throw new Error("Artifact pruning requires --older-than/--retention-days, --max-gb, or matching HARNESS_ARTIFACT_RETENTION_* settings.");
  }

  const missingRoots: string[] = [];
  const kinds: Array<Exclude<ArtifactRetentionKind, "all">> = resolved.kind === "all" ? ["runs", "sandboxes"] : [resolved.kind];
  const includeSizeDuringScan = resolved.maxBytes != null;
  const candidates = (await Promise.all(kinds.map((kind) => collectKindCandidates({
    root: resolved.rootDir,
    kind,
    nowMs: resolved.now.getTime(),
    missingRoots,
    includeSize: includeSizeDuringScan
  })))).flat();
  let removed = selectCandidatesForPrune({
    candidates,
    olderThanDays: resolved.olderThanDays,
    maxBytes: resolved.maxBytes
  });
  if (!includeSizeDuringScan && removed.length) {
    removed = await Promise.all(removed.map(async (item) => ({
      ...item,
      size_bytes: await directorySizeBytes(item.path)
    })));
  }
  const removedKeys = new Set(removed.map((item) => `${item.kind}:${item.id}`));
  const kept = candidates.filter((item) => !removedKeys.has(`${item.kind}:${item.id}`));

  if (!resolved.dryRun) {
    for (const candidate of removed) {
      await fs.rm(candidate.path, { recursive: true, force: true });
    }
  }

  const runIndexPrunedIds = await pruneRunIndex({
    root: resolved.rootDir,
    runIds: removed.filter((item) => item.kind === "runs").map((item) => item.id),
    dryRun: resolved.dryRun
  });

  return {
    root: resolved.rootDir,
    dry_run: resolved.dryRun,
    kind: resolved.kind,
    older_than_days: resolved.olderThanDays,
    max_bytes: resolved.maxBytes,
    scanned_count: candidates.length,
    scanned_bytes: candidates.reduce((sum, item) => sum + item.size_bytes, 0),
    removed_count: removed.length,
    removed_bytes: removed.reduce((sum, item) => sum + item.size_bytes, 0),
    kept_count: kept.length,
    kept_bytes: kept.reduce((sum, item) => sum + item.size_bytes, 0),
    removed,
    kept,
    missing_roots: missingRoots,
    run_index_pruned_ids: runIndexPrunedIds
  };
}

export async function summarizeArtifacts(options: ArtifactRetentionSummaryOptions = {}): Promise<ArtifactStorageSummary> {
  const resolved = resolveArtifactRetentionOptions({
    rootDir: options.rootDir,
    kind: options.kind,
    dryRun: true,
    now: options.now,
    olderThanDays: null,
    maxBytes: null
  });
  const missingRoots: string[] = [];
  const kinds: Array<Exclude<ArtifactRetentionKind, "all">> = resolved.kind === "all" ? ["runs", "sandboxes"] : [resolved.kind];
  const entries = (await Promise.all(kinds.map((kind) => collectKindCandidates({
    root: resolved.rootDir,
    kind,
    nowMs: resolved.now.getTime(),
    missingRoots,
    includeSize: options.includeSize ?? false
  })))).flat().sort((left, right) => left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id));
  return {
    root: resolved.rootDir,
    kind: resolved.kind,
    include_size: options.includeSize ?? false,
    scanned_count: entries.length,
    scanned_bytes: options.includeSize ? entries.reduce((sum, item) => sum + item.size_bytes, 0) : null,
    oldest_updated_at: entries[0]?.updated_at ?? null,
    newest_updated_at: entries.at(-1)?.updated_at ?? null,
    missing_roots: missingRoots,
    entries
  };
}
