import type { AsyncJobStatus, AuditRequest, RunEnvelope } from "../contracts.js";
import type { AuditEngine } from "../orchestrator.js";
import { deriveRequestScope, normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import { assertAuditRequestProviderPolicy } from "../provider-policy.js";
import { assertRequestSafeForDurableQueue, assertSafeWebhookTarget, redactUrlCredentials } from "../security-boundaries.js";
import { createId, nowIso } from "../utils.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./backend.js";
import type { PersistedAsyncJobAttemptRecord, PersistedAsyncJobRecord } from "./contracts.js";
import { getPersistedRun } from "./query.js";
import { ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

function resolveLocation(rootDirOrOptions?: string | PersistenceReadOptions) {
  return typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
}

async function readTable<T>(rootDir: string, tableName: string): Promise<T[]> {
  if (!(await hasSqliteDatabase(rootDir))) return [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const db = await openSqliteDatabase(rootDir);
    try {
      return readSqliteTable<T>(db, tableName);
    } catch (error) {
      if (error instanceof Error && /no such table/i.test(error.message)) return [];
      const isRetryable = error instanceof Error && /database disk image is malformed/i.test(error.message) && attempt === 0;
      if (!isRetryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } finally {
      db.close();
    }
  }
  return [];
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
  for (const dbMode of ["local"] as const) {
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

function asyncMonitorMaxPolls(): number {
  const configured = Number(process.env.HARNESS_ASYNC_MONITOR_MAX_POLLS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 14_400;
}

export type AsyncJobLifecycleStageForTests =
  | "after_queued_persist"
  | "after_starting_persist"
  | "after_engine_start"
  | "after_running_persist"
  | "after_terminal_persist"
  | "after_completion_webhook"
  | "after_terminal_hook"
  | "after_terminal_followup_persist";

export class PersistedAsyncJobManager {
  private recoveryPromise: Promise<void> | null = null;

  constructor(
    private readonly engine: AuditEngine,
    private readonly hooks?: {
      onTerminalJob?: (args: {
        job: PersistedAsyncJobRecord;
        attempt: PersistedAsyncJobAttemptRecord;
        envelope: RunEnvelope;
        rootDirOrOptions?: string | PersistenceReadOptions;
      }) => Promise<void> | void;
      onLifecycleStageForTests?: (stage: AsyncJobLifecycleStageForTests, details: {
        job: PersistedAsyncJobRecord;
        attempt: PersistedAsyncJobAttemptRecord;
      }) => Promise<void> | void;
    }
  ) {}

  private async observeLifecycleStage(stage: AsyncJobLifecycleStageForTests, job: PersistedAsyncJobRecord, attempt: PersistedAsyncJobAttemptRecord): Promise<void> {
    await this.hooks?.onLifecycleStageForTests?.(stage, { job, attempt });
  }

  private async deliverWebhook(rootDirOrOptions: string | PersistenceReadOptions | undefined, job: PersistedAsyncJobRecord, attempts: PersistedAsyncJobAttemptRecord[]): Promise<PersistedAsyncJobRecord> {
    if (!job.completion_webhook_url) return job;
    const latestAttempt = attempts.at(-1) ?? null;
    const deliveredAt = nowIso();
    let nextJob = { ...job };
    try {
      const targetUrl = await assertSafeWebhookTarget(job.completion_webhook_url, "completion_unsigned");
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          job,
          attempts,
          latest_attempt: latestAttempt,
          run: latestAttempt?.run_id ? this.engine.getRun(latestAttempt.run_id) ?? null : null
        }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      });
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok) throw new Error(`completion_webhook_http_${response.status}`);
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
        completion_webhook_error: redactUrlCredentials(error instanceof Error ? error.message : String(error)).slice(0, 400),
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

  private async completeTerminalFollowup(args: {
    location: ReturnType<typeof resolveLocation>;
    job: PersistedAsyncJobRecord;
    attempt: PersistedAsyncJobAttemptRecord;
    attempts: PersistedAsyncJobAttemptRecord[];
    envelope: RunEnvelope;
  }): Promise<PersistedAsyncJobRecord> {
    const deliveredJob = args.job.completion_webhook_url && args.job.completion_webhook_status !== "delivered"
      ? await this.deliverWebhook(args.location, args.job, args.attempts)
      : args.job;
    await this.observeLifecycleStage("after_completion_webhook", deliveredJob, args.attempt);
    const attemptedAt = nowIso();
    try {
      await this.hooks?.onTerminalJob?.({
        job: deliveredJob,
        attempt: args.attempt,
        envelope: args.envelope,
        rootDirOrOptions: args.location
      });
      await this.observeLifecycleStage("after_terminal_hook", deliveredJob, args.attempt);
    } catch (error) {
      const failedJob: PersistedAsyncJobRecord = {
        ...deliveredJob,
        terminal_followup_status: "failed",
        terminal_followup_last_attempt_at: attemptedAt,
        terminal_followup_error: error instanceof Error ? error.message : String(error),
        updated_at: attemptedAt
      };
      await writeRecords({ rootDir: args.location.rootDir, dbMode: args.location.mode, job: failedJob });
      return failedJob;
    }
    const completedJob: PersistedAsyncJobRecord = {
      ...deliveredJob,
      terminal_followup_status: "completed",
      terminal_followup_last_attempt_at: attemptedAt,
      terminal_followup_error: null,
      updated_at: attemptedAt
    };
    await writeRecords({ rootDir: args.location.rootDir, dbMode: args.location.mode, job: completedJob });
    await this.observeLifecycleStage("after_terminal_followup_persist", completedJob, args.attempt);
    return completedJob;
  }

  private monitorAttempt(rootDirOrOptions: string | PersistenceReadOptions | undefined, jobId: string, runId: string): void {
    void (async () => {
      const found = await findPersistedAsyncJob(jobId, rootDirOrOptions);
      if (!found) return;
      for (let attemptIndex = 0; attemptIndex < asyncMonitorMaxPolls(); attemptIndex += 1) {
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
            completed_at: completedAt,
            terminal_followup_status: "pending",
            terminal_followup_last_attempt_at: null,
            terminal_followup_error: null
          };
          await writeRecords({
            rootDir: found.location.rootDir,
            dbMode: found.location.mode,
            job: nextJob,
            attempt: nextAttempt
          });
          await this.observeLifecycleStage("after_terminal_persist", nextJob, nextAttempt);
          await this.completeTerminalFollowup({
            location: found.location,
            job: nextJob,
            attempt: nextAttempt,
            attempts: attempts.map((item) => item.run_id === runId ? nextAttempt : item),
            envelope
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
    const request = assertRequestSafeForDurableQueue(assertAuditRequestProviderPolicy(args.request, "unattended_local"));
    const completionWebhookUrl = args.completionWebhookUrl
      ? await assertSafeWebhookTarget(args.completionWebhookUrl, "completion_unsigned")
      : null;
    const location = resolveLocation({ dbMode: request.db_mode });
    const scope = deriveRequestScope(request);
    const createdAt = nowIso();
    const jobId = createId("job", "async");
    const runId = createId("run", "async");
    const job: PersistedAsyncJobRecord = {
      job_id: jobId,
      status: "queued",
      request_json: request,
      db_mode: location.mode,
      workspace_id: scope.workspace_id,
      project_id: scope.project_id,
      requested_by: scope.requested_by,
      current_run_id: runId,
      latest_attempt_number: 1,
      completion_webhook_url: completionWebhookUrl,
      completion_webhook_status: completionWebhookUrl ? "pending" : null,
      completion_webhook_last_attempt_at: null,
      completion_webhook_error: null,
      terminal_followup_status: null,
      terminal_followup_last_attempt_at: null,
      terminal_followup_error: null,
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
    await this.observeLifecycleStage("after_queued_persist", job, attempt);
    if (args.startImmediately ?? true) {
      const started = await this.startJob(jobId, location);
      return started ?? { job, attempts: [attempt] };
    }
    return { job, attempts: [attempt] };
  }

  async listJobs(rootDirOrOptions?: string | PersistenceReadOptions, filters?: { workspaceId?: string; projectId?: string }): Promise<PersistedAsyncJobRecord[]> {
    if (rootDirOrOptions) return listPersistedAsyncJobs(rootDirOrOptions, filters);
    const all = await Promise.all((["local"] as const).map((dbMode) => listPersistedAsyncJobs({ dbMode }, filters)));
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
    await this.observeLifecycleStage("after_starting_persist", startingJob, startingAttempt);
    this.engine.hydrateRun(toQueuedEnvelope(startingJob, startingAttempt));
    await this.engine.startRun(startingAttempt.run_id);
    await this.observeLifecycleStage("after_engine_start", startingJob, startingAttempt);
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
    await this.observeLifecycleStage("after_running_persist", runningJob, runningAttempt);
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
    const queuedEnvelope = toQueuedEnvelope(found.job, currentAttempt);
    this.engine.hydrateRun(queuedEnvelope);
    const canceledEnvelope = this.engine.cancelRun(currentAttempt.run_id) ?? {
      ...queuedEnvelope,
      status: "canceled" as const,
      updated_at: canceledAt,
      error: "canceled_by_user"
    };
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
      error: "canceled_by_user",
      terminal_followup_status: "pending",
      terminal_followup_last_attempt_at: null,
      terminal_followup_error: null
    };
    await writeRecords({ rootDir: found.location.rootDir, dbMode: found.location.mode, job: nextJob, attempt: nextAttempt });
    await this.observeLifecycleStage("after_terminal_persist", nextJob, nextAttempt);
    const nextAttempts = attempts.map((item) => item.id === nextAttempt.id ? nextAttempt : item);
    const completedJob = await this.completeTerminalFollowup({
      location: found.location,
      job: nextJob,
      attempt: nextAttempt,
      attempts: nextAttempts,
      envelope: canceledEnvelope
    });
    return { job: completedJob, attempts: nextAttempts };
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
      terminal_followup_status: null,
      terminal_followup_last_attempt_at: null,
      terminal_followup_error: null,
      error: null,
      updated_at: createdAt,
      completed_at: null,
      canceled_at: null
    };
    await writeRecords({ rootDir: found.location.rootDir, dbMode: found.location.mode, job: nextJob, attempt: nextAttempt });
    return this.startJob(jobId, found.location);
  }

  async recoverJobs(): Promise<void> {
    this.recoveryPromise ??= this.recoverJobsOnce().finally(() => {
      this.recoveryPromise = null;
    });
    return this.recoveryPromise;
  }

  private async recoverJobsOnce(): Promise<void> {
    for (const dbMode of ["local"] as const) {
      const location = resolveLocation({ dbMode });
      const jobs = await listPersistedAsyncJobs(location);
      for (const job of jobs.filter((item) => ["succeeded", "failed", "canceled"].includes(item.status)
        && (item.terminal_followup_status === "pending" || item.terminal_followup_status === "failed"))) {
        const attempts = await readPersistedAsyncJobAttempts(job.job_id, location);
        const currentAttempt = attempts.find((item) => item.run_id === job.current_run_id) ?? attempts.at(-1) ?? null;
        if (!currentAttempt) continue;
        const persistedRun = await getPersistedRun(currentAttempt.run_id, location);
        await this.completeTerminalFollowup({
          location,
          job,
          attempt: currentAttempt,
          attempts,
          envelope: {
            run_id: currentAttempt.run_id,
            status: job.status as "succeeded" | "failed" | "canceled",
            request: job.request_json,
            created_at: currentAttempt.created_at,
            updated_at: job.completed_at ?? job.updated_at,
            error: job.error ?? undefined,
            result: this.engine.getRun(currentAttempt.run_id)?.result,
            retry_of_run_id: currentAttempt.retry_of_run_id ?? undefined,
            ...(persistedRun?.completed_at ? { updated_at: persistedRun.completed_at } : {})
          }
        });
      }
      for (const job of jobs.filter((item) => item.status === "queued" || item.status === "starting" || item.status === "running")) {
        const attempts = await readPersistedAsyncJobAttempts(job.job_id, location);
        const currentAttempt = attempts.find((item) => item.run_id === job.current_run_id) ?? attempts.at(-1) ?? null;
        if (!currentAttempt) continue;
        const persistedRun = await getPersistedRun(currentAttempt.run_id, location);
        const persistedTerminalStatus = persistedRun && ["succeeded", "failed", "canceled"].includes(persistedRun.status)
          ? persistedRun.status as "succeeded" | "failed" | "canceled"
          : null;
        if (persistedTerminalStatus) {
          const completedAt = persistedRun?.completed_at ?? nowIso();
          const reconciledAttempt: PersistedAsyncJobAttemptRecord = {
            ...currentAttempt,
            status: persistedTerminalStatus,
            completed_at: completedAt,
            error: persistedTerminalStatus === "failed" ? currentAttempt.error ?? "recovered_terminal_run_failed" : null
          };
          const reconciledJob: PersistedAsyncJobRecord = {
            ...job,
            status: persistedTerminalStatus,
            updated_at: completedAt,
            completed_at: completedAt,
            canceled_at: persistedTerminalStatus === "canceled" ? completedAt : null,
            error: reconciledAttempt.error,
            terminal_followup_status: "pending",
            terminal_followup_last_attempt_at: null,
            terminal_followup_error: null
          };
          await writeRecords({ rootDir: location.rootDir, dbMode: location.mode, job: reconciledJob, attempt: reconciledAttempt });
          await this.observeLifecycleStage("after_terminal_persist", reconciledJob, reconciledAttempt);
          await this.completeTerminalFollowup({
            location,
            job: reconciledJob,
            attempt: reconciledAttempt,
            attempts: attempts.map((item) => item.id === reconciledAttempt.id ? reconciledAttempt : item),
            envelope: {
              run_id: currentAttempt.run_id,
              status: persistedTerminalStatus,
              request: job.request_json,
              created_at: currentAttempt.created_at,
              updated_at: completedAt,
              error: reconciledAttempt.error ?? undefined,
              retry_of_run_id: currentAttempt.retry_of_run_id ?? undefined
            }
          });
          continue;
        }
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
