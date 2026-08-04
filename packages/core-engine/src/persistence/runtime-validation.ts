import type { SandboxExecutionArtifact } from "../contracts.js";
import type {
  PersistedRuntimeSandboxEventRecord,
  PersistedRuntimeSandboxReadinessRecord,
  PersistedRuntimeValidationArtifactRecord,
  PersistedRuntimeValidationRunRecord,
  PersistedRuntimeValidationStepRecord
} from "./contracts.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./backend.js";
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
    ensureSqliteSchema(db);
    return readSqliteTable<T>(db, tableName);
  } finally {
    db.close();
  }
}

export async function persistRuntimeValidationRecords(args: {
  runId: string;
  workspaceId: string;
  projectId: string;
  sandboxExecution: SandboxExecutionArtifact | null;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<void> {
  const runtimeSandbox = args.sandboxExecution?.runtime_sandbox;
  if (!runtimeSandbox) return;

  const location = resolveLocation(args.rootDirOrOptions);
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    const now = new Date().toISOString();
    const selectedBackend = String(runtimeSandbox.selected_backend || runtimeSandbox.readiness.resolution.selected_backend || "unavailable");
    const readinessStatus = runtimeSandbox.readiness.resolution.readiness_status;
    const readinessRecord: PersistedRuntimeSandboxReadinessRecord = {
      id: `${args.runId}:runtime-readiness`,
      workspace_id: args.workspaceId,
      project_id: args.projectId,
      provider_id: "local_runtime",
      selected_backend: selectedBackend,
      readiness_status: readinessStatus,
      candidates_json: runtimeSandbox.readiness.resolution.candidates,
      settings_json: runtimeSandbox.readiness.settings,
      warnings_json: runtimeSandbox.readiness.resolution.warnings,
      blockers_json: runtimeSandbox.readiness.resolution.blockers,
      generated_at: runtimeSandbox.readiness.generated_at
    };
    upsertSqliteRecord({
      db,
      tableName: "runtime_sandbox_readiness",
      recordKey: readinessRecord.id,
      payload: readinessRecord,
      runId: args.runId,
      createdAt: readinessRecord.generated_at,
      parentKey: args.projectId
    });

    const runRecord: PersistedRuntimeValidationRunRecord = {
      id: `${args.runId}:runtime-validation`,
      run_id: args.runId,
      workspace_id: args.workspaceId,
      project_id: args.projectId,
      provider_id: "local_runtime",
      selected_backend: selectedBackend,
      readiness_status: readinessStatus,
      policy_json: runtimeSandbox.policy,
      plan_json: args.sandboxExecution?.plan ?? null,
      result_count: args.sandboxExecution?.results?.length ?? 0,
      created_at: now
    };
    upsertSqliteRecord({
      db,
      tableName: "runtime_validation_runs",
      recordKey: runRecord.id,
      payload: runRecord,
      runId: args.runId,
      createdAt: now,
      parentKey: args.projectId
    });

    for (const [index, result] of (args.sandboxExecution?.results ?? []).entries()) {
      const planStep = args.sandboxExecution?.plan?.steps?.find((item) => item.step_id === result.step_id) ?? null;
      const record: PersistedRuntimeValidationStepRecord = {
        id: `${args.runId}:runtime-step:${index}:${result.step_id}`,
        run_id: args.runId,
        workspace_id: args.workspaceId,
        project_id: args.projectId,
        step_id: result.step_id,
        provider_id: "local_runtime",
        selected_backend: selectedBackend,
        phase: planStep?.phase ?? result.normalized_artifact?.type ?? null,
        adapter: result.adapter ?? planStep?.adapter ?? null,
        command_json: planStep?.command ?? [],
        status: result.status,
        exit_code: result.exit_code ?? null,
        duration_ms: result.duration_ms ?? null,
        stdout_excerpt: result.stdout_excerpt ?? null,
        stderr_excerpt: result.stderr_excerpt ?? null,
        artifact_json: result.normalized_artifact ?? null,
        checked_at: result.checked_at
      };
      upsertSqliteRecord({
        db,
        tableName: "runtime_validation_steps",
        recordKey: record.id,
        payload: record,
        runId: args.runId,
        createdAt: record.checked_at,
        parentKey: runRecord.id
      });

      if (result.normalized_artifact) {
        const artifactRecord: PersistedRuntimeValidationArtifactRecord = {
          id: `${args.runId}:runtime-artifact:${index}:${result.step_id}`,
          run_id: args.runId,
          workspace_id: args.workspaceId,
          project_id: args.projectId,
          artifact_type: result.normalized_artifact.type,
          path: null,
          summary: result.normalized_artifact.summary,
          metadata_json: result.normalized_artifact.details_json,
          created_at: result.completed_at ?? result.checked_at
        };
        upsertSqliteRecord({
          db,
          tableName: "runtime_validation_artifacts",
          recordKey: artifactRecord.id,
          payload: artifactRecord,
          runId: args.runId,
          createdAt: artifactRecord.created_at,
          parentKey: runRecord.id
        });
      }
    }

    const eventRecord: PersistedRuntimeSandboxEventRecord = {
      id: `${args.runId}:runtime-event:backend-resolution`,
      run_id: args.runId,
      workspace_id: args.workspaceId,
      project_id: args.projectId,
      event_type: "backend_resolution",
      level: readinessStatus === "blocked" ? "error" : readinessStatus === "ready_with_warnings" ? "warn" : "info",
      provider_id: "local_runtime",
      selected_backend: selectedBackend,
      summary: `Local Runtime Sandbox resolved backend '${selectedBackend}' with readiness ${readinessStatus}.`,
      details_json: runtimeSandbox.readiness.resolution,
      created_at: now
    };
    upsertSqliteRecord({
      db,
      tableName: "runtime_sandbox_events",
      recordKey: eventRecord.id,
      payload: eventRecord,
      runId: args.runId,
      createdAt: now,
      parentKey: runRecord.id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
}

export async function readPersistedRuntimeValidation(runId: string, rootDirOrOptions?: string | PersistenceReadOptions) {
  const location = resolveLocation(rootDirOrOptions);
  const [runs, steps, artifacts, events, readiness] = await Promise.all([
    readTable<PersistedRuntimeValidationRunRecord>(location.rootDir, "runtime_validation_runs"),
    readTable<PersistedRuntimeValidationStepRecord>(location.rootDir, "runtime_validation_steps"),
    readTable<PersistedRuntimeValidationArtifactRecord>(location.rootDir, "runtime_validation_artifacts"),
    readTable<PersistedRuntimeSandboxEventRecord>(location.rootDir, "runtime_sandbox_events"),
    readTable<PersistedRuntimeSandboxReadinessRecord>(location.rootDir, "runtime_sandbox_readiness")
  ]);
  return {
    run: runs.find((item) => item.run_id === runId) ?? null,
    steps: steps.filter((item) => item.run_id === runId),
    artifacts: artifacts.filter((item) => item.run_id === runId),
    events: events.filter((item) => item.run_id === runId),
    readiness: readiness.find((item) => item.id === `${runId}:runtime-readiness`) ?? null
  };
}
