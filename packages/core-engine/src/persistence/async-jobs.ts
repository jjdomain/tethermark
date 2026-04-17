import type { AsyncJobStatus, AuditRequest, RunEnvelope } from "../contracts.js";
import type { AuditEngine } from "../orchestrator.js";
import { deriveRequestScope, normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import { createId, nowIso } from "../utils.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./backend.js";
import type { PersistedAsyncJobAttemptRecord, PersistedAsyncJobRecord } from "./contracts.js";
import { ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

function resolveLocation(rootDirOrOptions?: string | PersistenceReadOptions) {
  return typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
}

async function readTable<T>(rootDir: string, tableName: string): Promise<T[]> {
  if (!(await hasSqliteDatabase(rootDir))) return [];
  const db = await openSqliteDatabase(rootDir);
  try {
    return readSqliteTable<T>(db, tableName);
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) return [];
    throw error;
  } finally {
    db.close();
  }
}

async function writeRecords(args: {
  rootDir: string;
  dbMode: PersistedAsyncJobRecord["db_mode"];
  job?: PersistedAsyncJobRecord | null;
  attempt?: PersistedAsyncJobAttemptRecord | null;
}): Promise<void> {
  const db = await openSqliteDatabase(args.rootDir);
  try {
    ensureSqliteSchema(db);
    if (args.job) {
      upsertSqliteRecord({
        db,
        tableName: "async_jobs",
        recordKey: args.job.job_id,
        payload: args.job,
        runId: args.job.current_run_id,
        createdAt: args.job.created_at,
        parentKey: args.job.job_id
      });
    }
    if (args.attempt) {
      upsertSqliteRecord({
        db,
        tableName: "async_job_attempts",
        recordKey: args.attempt.id,
        payload: args.attempt,
        runId: args.attempt.run_id,
        createdAt: args.attempt.created_at,
        parentKey: args.attempt.job_id
      });
    }
    await saveSqliteDatabase(args.rootDir, db, args.dbMode);
  } finally {
    db.close();
  }
}

export async function listPersistedAsyncJobs(rootDirOrOptions?: string | PersistenceReadOptions, filters?: { workspaceId?: string; projectId?: string }): Promise<PersistedAsyncJobRecord[]> {
  const location = resolveLocation(rootDirOrOptions);
  const workspaceId = filters?.workspaceId ? normalizeWorkspaceId(filters.workspaceId) : undefined;
  const projectId = filters?.projectId ? normalizeProjectId(filters.projectId) : undefined;
  return (await readTable<PersistedAsyncJobRecord>(location.rootDir, "async_jobs"))
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .filter((item) => !projectId || item.project_id === projectId)
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.job_id.localeCompare(left.job_id));
}

export async function readPersistedAsyncJob(jobId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedAsyncJobRecord | null> {
  const location = resolveLocation(rootDirOrOptions);
  return (await readTable<PersistedAsyncJobRecord>(location.rootDir, "async_jobs")).find((item) => item.job_id === jobId) ?? null;
}

export async function readPersistedAsyncJobAttempts(jobId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedAsyncJobAttemptRecord[]> {
  const location = resolveLocation(rootDirOrOptions);
  return (await readTable<PersistedAsyncJobAttemptRecord>(location.rootDir, "async_job_attempts"))
    .filter((item) => item.job_id === jobId)
    .sort((left, right) => left.attempt_number - right.attempt_number || left.created_at.localeCompare(right.created_at));
}

async function findPersistedAsyncJob(jobId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<{ location: ReturnType<typeof resolveLocation>; job: PersistedAsyncJobRecord } | null> {
  if (rootDirOrOptions) {
    const location = resolveLocation(rootDirOrOptions);
    const job = await readPersistedAsyncJob(jobId, location);
    return job ? { location, job } : null;
  }
  for (const dbMode of ["embedded", "local", "hosted"] as const) {
    const location = resolveLocation({ dbMode });
    const job = await readPersistedAsyncJob(jobId, location);
    if (job) return { location, job };
  }
  return null;
}

export interface PersistedAsyncJobDetails {
  job: PersistedAsyncJobRecord;
  attempts: PersistedAsyncJobAttemptRecord[];
}

async function readPersistedAsyncJobDetails(jobId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedAsyncJobDetails | null> {
  const found = await findPersistedAsyncJob(jobId, rootDirOrOptions);
  if (!found) return null;
  return {
    job: found.job,
    attempts: await readPersistedAsyncJobAttempts(jobId, found.location)
  };
}

function toQueuedEnvelope(job: PersistedAsyncJobRecord, attempt: PersistedAsyncJobAttemptRecord): RunEnvelope {
  return {
    run_id: attempt.run_id,
    status: "queued",
    request: job.request_json,
    created_at: attempt.created_at,
    updated_at: nowIso(),
    retry_of_run_id: attempt.retry_of_run_id ?? undefined
  };
}

function toAttemptStatus(status: RunEnvelope["status"]): AsyncJobStatus {
  if (status === "queued" || status === "running" || status === "succeeded" || status === "failed" || status === "canceled") {
    return status;
  }
  return "failed";
}

export class PersistedAsyncJobManager {
  constructor(
    private readonly engine: AuditEngine,
    private readonly hooks?: {
      onTerminalJob?: (args: {
        job: PersistedAsyncJobRecord;
        attempt: PersistedAsyncJobAttemptRecord;
        envelope: RunEnvelope;
        rootDirOrOptions?: string | PersistenceReadOptions;
      }) => Promise<void> | void;
    }
  ) {}

  private async deliverWebhook(rootDirOrOptions: string | PersistenceReadOptions | undefined, job: PersistedAsyncJobRecord, attempts: PersistedAsyncJobAttemptRecord[]): Promise<PersistedAsyncJobRecord> {
    if (!job.completion_webhook_url) return job;
    const latestAttempt = attempts.at(-1) ?? null;
    const deliveredAt = nowIso();
    let nextJob = { ...job };
    try {
      await fetch(job.completion_webhook_url, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          job,
          attempts,
          latest_attempt: latestAttempt,
          run: latestAttempt?.run_id ? this.engine.getRun(latestAttempt.run_id) ?? null : null
        })
      });
      nextJob = {
        ...job,
        completion_webhook_status: "delivered",
        completion_webhook_last_attempt_at: deliveredAt,
        completion_webhook_error: null,
        updated_at: deliveredAt
      };
    } catch (error) {
      nextJob = {
        ...job,
        completion_webhook_status: "failed",
        completion_webhook_last_attempt_at: deliveredAt,
        completion_webhook_error: error instanceof Error ? error.message : String(error),
        updated_at: deliveredAt
      };
    }
    await writeRecords({
      rootDir: resolveLocation(rootDirOrOptions ?? { dbMode: job.db_mode }).rootDir,
      dbMode: job.db_mode,
      job: nextJob
    });
    return nextJob;
  }

  private monitorAttempt(rootDirOrOptions: string | PersistenceReadOptions | undefined, jobId: string, runId: string): void {
    void (async () => {
      const found = await findPersistedAsyncJob(jobId, rootDirOrOptions);
      if (!found) return;
      for (let attemptIndex = 0; attemptIndex < 1200; attemptIndex += 1) {
        const envelope = this.engine.getRun(runId);
        if (envelope && (envelope.status === "succeeded" || envelope.status === "failed" || envelope.status === "canceled")) {
          const attempts = await readPersistedAsyncJobAttempts(jobId, found.location);
          const currentAttempt = attempts.find((item) => item.run_id === runId);
          if (!currentAttempt) return;
          const completedAt = nowIso();
          const nextAttempt: PersistedAsyncJobAttemptRecord = {
            ...currentAttempt,
            status: toAttemptStatus(envelope.status),
            completed_at: completedAt,
            error: envelope.error ?? null
          };
          const nextJob: PersistedAsyncJobRecord = {
            ...(await readPersistedAsyncJob(jobId, found.location) as PersistedAsyncJobRecord),
            status: toAttemptStatus(envelope.status),
            error: envelope.error ?? null,
            updated_at: completedAt,
            completed_at: completedAt
          };
          await writeRecords({
            rootDir: found.location.rootDir,
            dbMode: found.location.mode,
            job: nextJob,
            attempt: nextAttempt
          });
          await this.deliverWebhook(found.location, nextJob, attempts.map((item) => item.run_id === runId ? nextAttempt : item));
          await this.hooks?.onTerminalJob?.({
            job: nextJob,
            attempt: nextAttempt,
            envelope,
            rootDirOrOptions: found.location
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    })();
  }

  async createJob(args: {
    request: AuditRequest;
    startImmediately?: boolean;
    completionWebhookUrl?: string | null;
  }): Promise<PersistedAsyncJobDetails> {
    const location = resolveLocation({ dbMode: args.request.db_mode });
    const scope = deriveRequestScope(args.request);
    const createdAt = nowIso();
    const jobId = createId("job", "async");
    const runId = createId("run", "async");
    const job: PersistedAsyncJobRecord = {
      job_id: jobId,
      status: "queued",
      request_json: args.request,
      db_mode: location.mode,
      workspace_id: scope.workspace_id,
      project_id: scope.project_id,
      requested_by: scope.requested_by,
      current_run_id: runId,
      latest_attempt_number: 1,
      completion_webhook_url: args.completionWebhookUrl ?? null,
      completion_webhook_status: args.completionWebhookUrl ? "pending" : null,
      completion_webhook_last_attempt_at: null,
      completion_webhook_error: null,
      error: null,
      created_at: createdAt,
      updated_at: createdAt,
      started_at: null,
      completed_at: null,
      canceled_at: null
    };
    const attempt: PersistedAsyncJobAttemptRecord = {
      id: `${jobId}:attempt:1`,
      job_id: jobId,
      attempt_number: 1,
      run_id: runId,
      status: "queued",
      created_at: createdAt,
      started_at: null,
      completed_at: null,
      error: null,
      retry_of_run_id: null
    };
    await writeRecords({ rootDir: location.rootDir, dbMode: location.mode, job, attempt });
    if (args.startImmediately ?? true) {
      const started = await this.startJob(jobId, location);
      return started ?? { job, attempts: [attempt] };
    }
    return { job, attempts: [attempt] };
  }

  async listJobs(rootDirOrOptions?: string | PersistenceReadOptions, filters?: { workspaceId?: string; projectId?: string }): Promise<PersistedAsyncJobRecord[]> {
    if (rootDirOrOptions) return listPersistedAsyncJobs(rootDirOrOptions, filters);
    const all = await Promise.all((["embedded", "local", "hosted"] as const).map((dbMode) => listPersistedAsyncJobs({ dbMode }, filters)));
    return all.flat().sort((left, right) => right.created_at.localeCompare(left.created_at));
  }

  async getJob(jobId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedAsyncJobDetails | null> {
    return readPersistedAsyncJobDetails(jobId, rootDirOrOptions);
  }

  async startJob(jobId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedAsyncJobDetails | null> {
    const found = await findPersistedAsyncJob(jobId, rootDirOrOptions);
    if (!found) return null;
    const attempts = await readPersistedAsyncJobAttempts(jobId, found.location);
    const currentAttempt = attempts.find((item) => item.run_id === found.job.current_run_id) ?? attempts.at(-1) ?? null;
    if (!currentAttempt || found.job.status !== "queued") {
      return { job: found.job, attempts };
    }
    const startingAt = nowIso();
    const startingJob: PersistedAsyncJobRecord = {
      ...found.job,
      status: "starting",
      updated_at: startingAt,
      started_at: found.job.started_at ?? startingAt,
      completed_at: null,
      canceled_at: null,
      error: null
    };
    const startingAttempt: PersistedAsyncJobAttemptRecord = {
      ...currentAttempt,
      status: "starting",
      started_at: currentAttempt.started_at ?? startingAt,
      completed_at: null,
      error: null
    };
    await writeRecords({ rootDir: found.location.rootDir, dbMode: found.location.mode, job: startingJob, attempt: startingAttempt });
    this.engine.hydrateRun(toQueuedEnvelope(startingJob, startingAttempt));
    await this.engine.startRun(startingAttempt.run_id);
    const runningAt = nowIso();
    const runningJob: PersistedAsyncJobRecord = {
      ...startingJob,
      status: "running",
      updated_at: runningAt,
      started_at: startingJob.started_at ?? runningAt
    };
    const runningAttempt: PersistedAsyncJobAttemptRecord = {
      ...startingAttempt,
      status: "running",
      started_at: startingAttempt.started_at ?? runningAt
    };
    await writeRecords({ rootDir: found.location.rootDir, dbMode: found.location.mode, job: runningJob, attempt: runningAttempt });
    this.monitorAttempt(found.location, jobId, runningAttempt.run_id);
    return { job: runningJob, attempts: attempts.map((item) => item.id === runningAttempt.id ? runningAttempt : item) };
  }

  async cancelJob(jobId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedAsyncJobDetails | null> {
    const found = await findPersistedAsyncJob(jobId, rootDirOrOptions);
    if (!found) return null;
    const attempts = await readPersistedAsyncJobAttempts(jobId, found.location);
    const currentAttempt = attempts.find((item) => item.run_id === found.job.current_run_id) ?? attempts.at(-1) ?? null;
    if (!currentAttempt) {
      return { job: found.job, attempts };
    }
    if (found.job.status === "running" || found.job.status === "starting") {
      this.engine.cancelRun(currentAttempt.run_id);
      const requestedAt = nowIso();
      const nextJob: PersistedAsyncJobRecord = {
        ...found.job,
        updated_at: requestedAt,
        error: "cancel_requested"
      };
      await writeRecords({ rootDir: found.location.rootDir, dbMode: found.location.mode, job: nextJob });
      return { job: nextJob, attempts };
    }
    if (found.job.status !== "queued") {
      return { job: found.job, attempts };
    }
    const canceledAt = nowIso();
    this.engine.hydrateRun(toQueuedEnvelope(found.job, currentAttempt));
    this.engine.cancelRun(currentAttempt.run_id);
    const nextAttempt: PersistedAsyncJobAttemptRecord = {
      ...currentAttempt,
      status: "canceled",
      completed_at: canceledAt,
      error: "canceled_by_user"
    };
    const nextJob: PersistedAsyncJobRecord = {
      ...found.job,
      status: "canceled",
      updated_at: canceledAt,
      completed_at: canceledAt,
      canceled_at: canceledAt,
      error: "canceled_by_user"
    };
    await writeRecords({ rootDir: found.location.rootDir, dbMode: found.location.mode, job: nextJob, attempt: nextAttempt });
    await this.deliverWebhook(found.location, nextJob, attempts.map((item) => item.id === nextAttempt.id ? nextAttempt : item));
    return { job: nextJob, attempts: attempts.map((item) => item.id === nextAttempt.id ? nextAttempt : item) };
  }

  async retryJob(jobId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedAsyncJobDetails | null> {
    const found = await findPersistedAsyncJob(jobId, rootDirOrOptions);
    if (!found) return null;
    if (found.job.status !== "failed" && found.job.status !== "canceled") {
      return { job: found.job, attempts: await readPersistedAsyncJobAttempts(jobId, found.location) };
    }
    const attempts = await readPersistedAsyncJobAttempts(jobId, found.location);
    const latestAttempt = attempts.at(-1) ?? null;
    const createdAt = nowIso();
    const runId = createId("run", "async");
    const nextAttempt: PersistedAsyncJobAttemptRecord = {
      id: `${jobId}:attempt:${found.job.latest_attempt_number + 1}`,
      job_id: jobId,
      attempt_number: found.job.latest_attempt_number + 1,
      run_id: runId,
      status: "queued",
      created_at: createdAt,
      started_at: null,
      completed_at: null,
      error: null,
      retry_of_run_id: latestAttempt?.run_id ?? null
    };
    const nextJob: PersistedAsyncJobRecord = {
      ...found.job,
      status: "queued",
      current_run_id: runId,
      latest_attempt_number: nextAttempt.attempt_number,
      completion_webhook_status: found.job.completion_webhook_url ? "pending" : null,
      completion_webhook_last_attempt_at: null,
      completion_webhook_error: null,
      error: null,
      updated_at: createdAt,
      completed_at: null,
      canceled_at: null
    };
    await writeRecords({ rootDir: found.location.rootDir, dbMode: found.location.mode, job: nextJob, attempt: nextAttempt });
    return this.startJob(jobId, found.location);
  }

  async recoverJobs(): Promise<void> {
    for (const dbMode of ["embedded", "local", "hosted"] as const) {
      const location = resolveLocation({ dbMode });
      const jobs = await listPersistedAsyncJobs(location);
      for (const job of jobs.filter((item) => item.status === "queued" || item.status === "starting" || item.status === "running")) {
        const attempts = await readPersistedAsyncJobAttempts(job.job_id, location);
        const currentAttempt = attempts.find((item) => item.run_id === job.current_run_id) ?? attempts.at(-1) ?? null;
        if (!currentAttempt) continue;
        const resetJob: PersistedAsyncJobRecord = {
          ...job,
          status: "queued",
          updated_at: nowIso(),
          completed_at: null,
          canceled_at: null,
          error: null
        };
        const resetAttempt: PersistedAsyncJobAttemptRecord = {
          ...currentAttempt,
          status: "queued",
          completed_at: null,
          error: null
        };
        await writeRecords({ rootDir: location.rootDir, dbMode: location.mode, job: resetJob, attempt: resetAttempt });
        await this.startJob(job.job_id, location);
      }
    }
  }
}
