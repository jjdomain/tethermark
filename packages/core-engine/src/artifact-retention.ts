import fs from "node:fs/promises";
import path from "node:path";

import { defaultPersistenceRoot } from "./persistence/backend.js";
import type { PersistedArtifactIndexRecord, PersistedAsyncJobRecord, PersistedRunRecord } from "./persistence/contracts.js";
import { deleteSqliteRecord, ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase } from "./persistence/sqlite.js";

export type ArtifactRetentionKind = "runs" | "sandboxes" | "all";

export interface ArtifactRetentionOptions {
  rootDir?: string;
  persistenceRoot?: string;
  kind?: ArtifactRetentionKind;
  dryRun?: boolean;
  olderThanDays?: number | null;
  maxBytes?: number | null;
  protectActiveRuns?: boolean;
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
  protected_run_ids: string[];
  artifact_index_reconciled_ids: string[];
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

export const ARTIFACT_RETENTION_SCHEDULE_SCHEMA_VERSION = "2026-08-26.artifact-retention-schedule.v1";

export interface ArtifactRetentionScheduleOptions {
  rootDir?: string;
  persistenceRoot?: string;
  intervalMs?: number;
  runRetentionDays?: number;
  sandboxRetentionDays?: number;
  runMaxBytes?: number | null;
  force?: boolean;
  now?: Date;
}

export interface ArtifactRetentionScheduleState {
  schema_version: typeof ARTIFACT_RETENTION_SCHEDULE_SCHEMA_VERSION;
  status: "succeeded" | "failed";
  started_at: string;
  completed_at: string;
  last_success_at: string | null;
  due: boolean;
  run_retention_days: number;
  sandbox_retention_days: number;
  interval_ms: number;
  summaries: ArtifactRetentionSummary[];
  error: string | null;
}

export interface ScheduledArtifactRetentionResult {
  due: boolean;
  state: ArtifactRetentionScheduleState | null;
}

function defaultArtifactBaseRoot(): string {
  return path.resolve(process.cwd(), ".artifacts");
}

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

interface ResolvedArtifactRetentionOptions {
  rootDir: string;
  persistenceRoot: string;
  kind: ArtifactRetentionKind;
  dryRun: boolean;
  olderThanDays: number | null;
  maxBytes: number | null;
  protectActiveRuns: boolean;
  now: Date;
}

function persistenceRootForArtifactRoot(artifactRoot: string): string {
  if (process.env.HARNESS_LOCAL_DB_ROOT) return defaultPersistenceRoot("local");
  const defaultArtifactRoot = defaultArtifactBaseRoot();
  return path.resolve(artifactRoot) === defaultArtifactRoot
    ? defaultPersistenceRoot("local")
    : path.join(path.resolve(artifactRoot), "state", "local-db");
}

export function resolveArtifactRetentionOptions(options: ArtifactRetentionOptions = {}): ResolvedArtifactRetentionOptions {
  const envRetentionDays = parsePositiveNumber(process.env.HARNESS_ARTIFACT_RETENTION_DAYS);
  const envMaxGb = parsePositiveNumber(process.env.HARNESS_ARTIFACT_RETENTION_MAX_GB);
  const envKind = process.env.HARNESS_ARTIFACT_RETENTION_KIND;
  const rootDir = path.resolve(options.rootDir ?? defaultArtifactBaseRoot());
  const kind: ArtifactRetentionKind = options.kind
    ?? (envKind === "runs" || envKind === "sandboxes" || envKind === "all" ? envKind : "runs");
  return {
    rootDir,
    persistenceRoot: path.resolve(options.persistenceRoot ?? persistenceRootForArtifactRoot(rootDir)),
    kind,
    dryRun: options.dryRun ?? false,
    olderThanDays: options.olderThanDays ?? envRetentionDays,
    maxBytes: options.maxBytes ?? (envMaxGb ? Math.floor(envMaxGb * 1024 * 1024 * 1024) : null),
    protectActiveRuns: options.protectActiveRuns ?? true,
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

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
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
  protectedRunIds: Set<string>;
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
      if (args.protectedRunIds.has(candidate.id)) continue;
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
      if (args.protectedRunIds.has(candidate.id)) continue;
      addReason(candidate, `exceeds_max_bytes_${args.maxBytes}`);
      retainedBytes -= candidate.size_bytes;
    }
  }

  return [...selected.values()].sort((left, right) => left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id));
}

async function readProtectedRunIds(persistenceRoot: string): Promise<Set<string>> {
  if (!(await hasSqliteDatabase(persistenceRoot))) return new Set();
  const db = await openSqliteDatabase(persistenceRoot);
  try {
    ensureSqliteSchema(db);
    const protectedIds = new Set<string>();
    for (const run of readSqliteTable<PersistedRunRecord>(db, "runs")) {
      if (["queued", "starting", "running"].includes(run.status)) protectedIds.add(run.id);
    }
    for (const job of readSqliteTable<PersistedAsyncJobRecord>(db, "async_jobs")) {
      if (["queued", "starting", "running"].includes(job.status) && job.current_run_id) {
        protectedIds.add(job.current_run_id);
      }
    }
    return protectedIds;
  } finally {
    db.close();
  }
}

function isPathWithinRoot(candidatePath: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function reconcileArtifactIndex(args: {
  artifactRoot: string;
  persistenceRoot: string;
  removedRunIds: string[];
  protectedRunIds: Set<string>;
  dryRun: boolean;
}): Promise<string[]> {
  if (!(await hasSqliteDatabase(args.persistenceRoot))) return [];
  const db = await openSqliteDatabase(args.persistenceRoot);
  try {
    ensureSqliteSchema(db);
    const removedRunIds = new Set(args.removedRunIds);
    const managedRunsRoot = path.join(args.artifactRoot, "runs");
    const rows = readSqliteTable<PersistedArtifactIndexRecord>(db, "artifact_index");
    const reconciled: string[] = [];
    for (const row of rows) {
      if (args.protectedRunIds.has(row.run_id)) continue;
      const removedWithRun = removedRunIds.has(row.run_id);
      const managedMissingPath = isPathWithinRoot(row.path, managedRunsRoot) && !(await pathExists(row.path));
      if (!removedWithRun && !managedMissingPath) continue;
      reconciled.push(row.artifact_id);
      if (!args.dryRun) {
        deleteSqliteRecord({ db, tableName: "artifact_index", recordKey: row.artifact_id });
      }
    }
    reconciled.sort();
    if (reconciled.length && !args.dryRun) {
      await saveSqliteDatabase(args.persistenceRoot, db, "local");
    }
    return reconciled;
  } finally {
    db.close();
  }
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
  const protectedRunIds = resolved.protectActiveRuns ? await readProtectedRunIds(resolved.persistenceRoot) : new Set<string>();
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
    maxBytes: resolved.maxBytes,
    protectedRunIds
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
  const artifactIndexReconciledIds = await reconcileArtifactIndex({
    artifactRoot: resolved.rootDir,
    persistenceRoot: resolved.persistenceRoot,
    removedRunIds: removed.filter((item) => item.kind === "runs").map((item) => item.id),
    protectedRunIds,
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
    run_index_pruned_ids: runIndexPrunedIds,
    protected_run_ids: [...protectedRunIds].sort(),
    artifact_index_reconciled_ids: artifactIndexReconciledIds
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

function positiveMilliseconds(value: string | undefined, fallback: number, minimum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
}

function positiveDays(value: string | undefined, fallback: number): number {
  return parsePositiveNumber(value) ?? fallback;
}

function retentionMaintenancePaths(rootDir: string): { state: string; history: string } {
  const maintenanceRoot = path.join(rootDir, "maintenance");
  return {
    state: path.join(maintenanceRoot, "artifact-retention-state.json"),
    history: path.join(maintenanceRoot, "artifact-retention-history.json")
  };
}

async function appendRetentionHistory(historyPath: string, state: ArtifactRetentionScheduleState): Promise<void> {
  const history = await readJsonFile<ArtifactRetentionScheduleState[]>(historyPath) ?? [];
  history.push(state);
  await writeJsonAtomic(historyPath, history.slice(-100));
}

export async function runScheduledArtifactRetention(options: ArtifactRetentionScheduleOptions = {}): Promise<ScheduledArtifactRetentionResult> {
  const rootDir = path.resolve(options.rootDir ?? defaultArtifactBaseRoot());
  const persistenceRoot = path.resolve(options.persistenceRoot ?? persistenceRootForArtifactRoot(rootDir));
  const intervalMs = options.intervalMs
    ?? positiveMilliseconds(process.env.HARNESS_ARTIFACT_RETENTION_INTERVAL_MS, 24 * 60 * 60 * 1000, 60_000);
  const runRetentionDays = options.runRetentionDays
    ?? positiveDays(process.env.HARNESS_ARTIFACT_RETENTION_DAYS, 30);
  const sandboxRetentionDays = options.sandboxRetentionDays
    ?? positiveDays(process.env.HARNESS_SANDBOX_RETENTION_DAYS, 7);
  const envMaxGb = parsePositiveNumber(process.env.HARNESS_ARTIFACT_RETENTION_MAX_GB);
  const runMaxBytes = options.runMaxBytes === undefined
    ? (envMaxGb == null ? null : Math.floor(envMaxGb * 1024 * 1024 * 1024))
    : options.runMaxBytes;
  const now = options.now ?? new Date();
  const maintenancePaths = retentionMaintenancePaths(rootDir);
  const previous = await readJsonFile<ArtifactRetentionScheduleState>(maintenancePaths.state);
  const lastSuccessMs = previous?.last_success_at ? Date.parse(previous.last_success_at) : Number.NaN;
  const due = options.force === true
    || !Number.isFinite(lastSuccessMs)
    || now.getTime() - lastSuccessMs >= intervalMs;
  if (!due) return { due: false, state: previous };

  const startedAt = now.toISOString();
  try {
    const summaries = [
      await pruneArtifacts({
        rootDir,
        persistenceRoot,
        kind: "runs",
        olderThanDays: runRetentionDays,
        maxBytes: runMaxBytes,
        now
      }),
      await pruneArtifacts({
        rootDir,
        persistenceRoot,
        kind: "sandboxes",
        olderThanDays: sandboxRetentionDays,
        maxBytes: null,
        now
      })
    ];
    const completedAt = now.toISOString();
    const state: ArtifactRetentionScheduleState = {
      schema_version: ARTIFACT_RETENTION_SCHEDULE_SCHEMA_VERSION,
      status: "succeeded",
      started_at: startedAt,
      completed_at: completedAt,
      last_success_at: completedAt,
      due: true,
      run_retention_days: runRetentionDays,
      sandbox_retention_days: sandboxRetentionDays,
      interval_ms: intervalMs,
      summaries,
      error: null
    };
    await writeJsonAtomic(maintenancePaths.state, state);
    await appendRetentionHistory(maintenancePaths.history, state);
    return { due: true, state };
  } catch (error) {
    const state: ArtifactRetentionScheduleState = {
      schema_version: ARTIFACT_RETENTION_SCHEDULE_SCHEMA_VERSION,
      status: "failed",
      started_at: startedAt,
      completed_at: now.toISOString(),
      last_success_at: previous?.last_success_at ?? null,
      due: true,
      run_retention_days: runRetentionDays,
      sandbox_retention_days: sandboxRetentionDays,
      interval_ms: intervalMs,
      summaries: [],
      error: error instanceof Error ? error.message : String(error)
    };
    await writeJsonAtomic(maintenancePaths.state, state);
    await appendRetentionHistory(maintenancePaths.history, state);
    throw error;
  }
}

function artifactRetentionSchedulerDisabled(): boolean {
  return /^(1|true|yes)$/i.test(String(process.env.HARNESS_DISABLE_ARTIFACT_RETENTION_SCHEDULER ?? ""));
}

export function createArtifactRetentionScheduler(options: ArtifactRetentionScheduleOptions & {
  pollMs?: number;
  startupDelayMs?: number;
  onError?: (error: unknown) => void;
} = {}): { start(): void; stop(): void; runNow(): Promise<ScheduledArtifactRetentionResult> } {
  let timer: NodeJS.Timeout | null = null;
  let startupTimer: NodeJS.Timeout | null = null;
  let running: Promise<ScheduledArtifactRetentionResult> | null = null;

  const runNow = (): Promise<ScheduledArtifactRetentionResult> => {
    if (running) return running;
    running = runScheduledArtifactRetention(options).finally(() => { running = null; });
    return running;
  };

  return {
    start() {
      if (timer || artifactRetentionSchedulerDisabled()) return;
      const intervalMs = options.intervalMs
        ?? positiveMilliseconds(process.env.HARNESS_ARTIFACT_RETENTION_INTERVAL_MS, 24 * 60 * 60 * 1000, 60_000);
      const pollMs = options.pollMs
        ?? positiveMilliseconds(process.env.HARNESS_ARTIFACT_RETENTION_SCHEDULER_POLL_MS, Math.min(intervalMs, 60 * 60 * 1000), 10_000);
      const runAndReport = () => { void runNow().catch((error) => options.onError?.(error)); };
      timer = setInterval(runAndReport, pollMs);
      timer.unref?.();
      startupTimer = setTimeout(() => {
        startupTimer = null;
        runAndReport();
      }, options.startupDelayMs ?? 2_000);
      startupTimer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      if (startupTimer) clearTimeout(startupTimer);
      timer = null;
      startupTimer = null;
    },
    runNow
  };
}
