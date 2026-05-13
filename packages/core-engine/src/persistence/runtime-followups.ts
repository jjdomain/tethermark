import type { AsyncJobStatus, AuditRequest, HumanReviewActionInput, LaunchIntentArtifact } from "../contracts.js";
import { normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import type { PersistedAsyncJobRecord, PersistedRuntimeFollowupRecord } from "./contracts.js";
import { getPersistedRun } from "./query.js";
import { readPersistedEvidenceRecords, readPersistedFindings, readPersistedStageArtifact } from "./run-details.js";
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function normalizeTokens(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function tokenOverlap(left: string, right: string): boolean {
  const leftTokens = new Set(normalizeTokens(left));
  const rightTokens = new Set(normalizeTokens(right));
  if (!leftTokens.size || !rightTokens.size) return false;
  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) matches += 1;
  }
  return matches >= Math.min(2, Math.min(leftTokens.size, rightTokens.size));
}

function findingsMatch(sourceFinding: Awaited<ReturnType<typeof readPersistedFindings>>[number] | null, candidate: Awaited<ReturnType<typeof readPersistedFindings>>[number]): boolean {
  if (!sourceFinding) return false;
  if (sourceFinding.category === candidate.category && tokenOverlap(sourceFinding.title, candidate.title)) return true;
  const sourceControls = new Set(asStringArray(sourceFinding.control_ids_json));
  const candidateControls = new Set(asStringArray(candidate.control_ids_json));
  const overlappingControls = [...sourceControls].some((item) => candidateControls.has(item));
  if (overlappingControls) return true;
  return tokenOverlap(sourceFinding.title, candidate.title);
}

function collectEvidenceIdentity(args: {
  finding: Awaited<ReturnType<typeof readPersistedFindings>>[number] | null;
  evidenceRecords: Awaited<ReturnType<typeof readPersistedEvidenceRecords>>;
}): { symbols: Set<string>; paths: Set<string> } {
  const symbols = new Set<string>();
  const paths = new Set<string>();
  const controlIds = new Set(asStringArray(args.finding?.control_ids_json));
  for (const record of args.evidenceRecords) {
    const metadata = (record.metadata_json ?? {}) as Record<string, any>;
    const runtimeEvidenceIds = Array.isArray(metadata?.runtime_evidence_ids) ? metadata.runtime_evidence_ids.map((item: any) => String(item)) : [];
    const linkedFindingIds = Array.isArray(metadata?.finding_ids) ? metadata.finding_ids.map((item: any) => String(item)) : [];
    const recordControlIds = new Set(asStringArray(record.control_ids_json));
    const belongsToFinding = linkedFindingIds.includes(String(args.finding?.id ?? ""))
      || runtimeEvidenceIds.includes(record.id)
      || [...controlIds].some((item) => recordControlIds.has(item))
      || tokenOverlap(String(record.summary ?? ""), String(args.finding?.title ?? ""));
    if (!belongsToFinding) continue;
    const locations = Array.isArray(record.locations_json) ? record.locations_json : [];
    for (const location of locations) {
      if (typeof location?.symbol === "string" && location.symbol.trim()) symbols.add(location.symbol.trim());
      if (typeof location?.path === "string" && location.path.trim()) paths.add(String(location.path).replace(/\\/g, "/"));
    }
  }
  return { symbols, paths };
}

function evidenceIdentityMatches(args: {
  source: { symbols: Set<string>; paths: Set<string> };
  candidate: { symbols: Set<string>; paths: Set<string> };
}): boolean {
  for (const symbol of args.source.symbols) {
    if (args.candidate.symbols.has(symbol)) return true;
  }
  for (const filePath of args.source.paths) {
    if (args.candidate.paths.has(filePath)) return true;
  }
  return false;
}

function deriveRerunRequest(args: {
  run: Awaited<ReturnType<typeof getPersistedRun>>;
  launchIntent: LaunchIntentArtifact | null;
  findingId: string;
  findingTitle: string | null;
  requestedBy: string;
}): AuditRequest {
  const run = args.run;
  const launchIntent = args.launchIntent;
  const requestedProfile = launchIntent?.requested_profile;
  const currentRunMode = String(run?.run_mode ?? "static");
  const rerunMode = currentRunMode === "runtime" || currentRunMode === "validate" ? currentRunMode : "validate";
  const request: AuditRequest = {
    local_path: run?.target_summary?.local_path ?? undefined,
    repo_url: run?.target_summary?.repo_url ?? undefined,
    endpoint_url: run?.target_summary?.endpoint_url ?? undefined,
    run_mode: rerunMode as AuditRequest["run_mode"],
    llm_provider: requestedProfile?.llm_provider === "openai" || requestedProfile?.llm_provider === "openai_codex" ? requestedProfile.llm_provider : "mock",
    llm_model: typeof requestedProfile?.llm_model === "string" ? requestedProfile.llm_model : undefined,
    audit_policy_pack: typeof requestedProfile?.audit_policy_pack === "string" ? requestedProfile.audit_policy_pack : undefined,
    db_mode: (run?.resolved_configuration?.db_mode as AuditRequest["db_mode"]) ?? "local",
    audit_package: (requestedProfile?.audit_package ?? run?.resolved_configuration?.selected_audit_package ?? run?.audit_package) as AuditRequest["audit_package"],
    workspace_id: run?.workspace_id ?? "default",
    project_id: run?.project_id ?? "default",
    requested_by: args.requestedBy,
    hints: {
      launch_intent: {
        source_surface: "runtime_followup",
        preflight_checked_at: new Date().toISOString(),
        preflight_accepted_at: new Date().toISOString()
      },
      runtime_followup: {
        source_run_id: run?.id ?? null,
        source_finding_id: args.findingId,
        source_finding_title: args.findingTitle ?? null
      }
    }
  };
  return request;
}

async function writeFollowup(record: PersistedRuntimeFollowupRecord, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedRuntimeFollowupRecord> {
  const location = resolveLocation(rootDirOrOptions);
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({
      db,
      tableName: "runtime_followups",
      recordKey: record.id,
      payload: record,
      runId: record.run_id,
      createdAt: record.requested_at,
      parentKey: record.run_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
}

async function reconcileRuntimeFollowupOutcome(args: {
  followup: PersistedRuntimeFollowupRecord;
  linkedRunId: string | null;
  status: AsyncJobStatus;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<Pick<PersistedRuntimeFollowupRecord, "linked_run_id" | "rerun_outcome" | "rerun_outcome_summary" | "rerun_outcome_finding_ids_json" | "rerun_reconciled_at">> {
  const reconciledAt = new Date().toISOString();
  if (args.status === "canceled") {
    return {
      linked_run_id: args.linkedRunId,
      rerun_outcome: "still_inconclusive",
      rerun_outcome_summary: "Linked rerun was canceled before runtime follow-up could be reconciled.",
      rerun_outcome_finding_ids_json: [],
      rerun_reconciled_at: reconciledAt
    };
  }
  if (!args.linkedRunId) {
    return {
      linked_run_id: null,
      rerun_outcome: "still_inconclusive",
      rerun_outcome_summary: "Linked rerun completed without a persisted run id for reconciliation.",
      rerun_outcome_finding_ids_json: [],
      rerun_reconciled_at: reconciledAt
    };
  }
  const [sourceFindings, linkedRun, linkedFindings, sourceEvidenceRecords, linkedEvidenceRecords] = await Promise.all([
    readPersistedFindings(args.followup.run_id, args.rootDirOrOptions),
    getPersistedRun(args.linkedRunId, args.rootDirOrOptions),
    readPersistedFindings(args.linkedRunId, args.rootDirOrOptions),
    readPersistedEvidenceRecords(args.followup.run_id, args.rootDirOrOptions),
    readPersistedEvidenceRecords(args.linkedRunId, args.rootDirOrOptions)
  ]);
  const sourceFinding = sourceFindings.find((item) => item.id === args.followup.finding_id) ?? null;
  const sourceIdentity = collectEvidenceIdentity({
    finding: sourceFinding,
    evidenceRecords: sourceEvidenceRecords
  });
  const matchingFindings = linkedFindings.filter((item) => {
    if (findingsMatch(sourceFinding, item)) return true;
    const candidateIdentity = collectEvidenceIdentity({
      finding: item,
      evidenceRecords: linkedEvidenceRecords
    });
    return evidenceIdentityMatches({ source: sourceIdentity, candidate: candidateIdentity });
  });
  if (matchingFindings.length > 0) {
    return {
      linked_run_id: args.linkedRunId,
      rerun_outcome: "confirmed",
      rerun_outcome_summary: `Linked rerun reproduced ${matchingFindings.length} matching finding(s).`,
      rerun_outcome_finding_ids_json: matchingFindings.map((item) => item.id),
      rerun_reconciled_at: reconciledAt
    };
  }
  if (linkedRun?.status === "succeeded") {
    return {
      linked_run_id: args.linkedRunId,
      rerun_outcome: "not_reproduced",
      rerun_outcome_summary: "Linked rerun completed successfully and did not reproduce a matching finding.",
      rerun_outcome_finding_ids_json: [],
      rerun_reconciled_at: reconciledAt
    };
  }
  return {
    linked_run_id: args.linkedRunId,
    rerun_outcome: "still_inconclusive",
    rerun_outcome_summary: `Linked rerun completed with status ${args.status} and did not produce enough matching evidence to reconcile the source finding automatically.`,
    rerun_outcome_finding_ids_json: [],
    rerun_reconciled_at: reconciledAt
  };
}

export async function listPersistedRuntimeFollowups(args?: {
  rootDirOrOptions?: string | PersistenceReadOptions;
  runId?: string;
  workspaceId?: string;
  projectId?: string;
  status?: PersistedRuntimeFollowupRecord["status"];
}): Promise<PersistedRuntimeFollowupRecord[]> {
  const location = resolveLocation(args?.rootDirOrOptions);
  return (await readTable<PersistedRuntimeFollowupRecord>(location.rootDir, "runtime_followups"))
    .filter((item) => !args?.runId || item.run_id === args.runId)
    .filter((item) => !args?.workspaceId || item.workspace_id === normalizeWorkspaceId(args.workspaceId))
    .filter((item) => !args?.projectId || item.project_id === normalizeProjectId(args.projectId))
    .filter((item) => !args?.status || item.status === args.status)
    .sort((left, right) => right.requested_at.localeCompare(left.requested_at) || right.id.localeCompare(left.id));
}

export async function readPersistedRuntimeFollowup(id: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedRuntimeFollowupRecord | null> {
  const location = resolveLocation(rootDirOrOptions);
  return (await readTable<PersistedRuntimeFollowupRecord>(location.rootDir, "runtime_followups")).find((item) => item.id === id) ?? null;
}

export async function upsertRuntimeFollowupFromReviewAction(args: {
  runId: string;
  actionId: string;
  input: HumanReviewActionInput;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedRuntimeFollowupRecord | null> {
  const actionType = args.input.action_type;
  if (!["rerun_in_capable_env", "adopt_rerun_outcome", "mark_manual_runtime_review_complete", "accept_without_runtime_validation"].includes(actionType)) {
    return null;
  }
  const findingId = args.input.finding_id ?? null;
  if (!findingId) return null;
  const location = resolveLocation(args.rootDirOrOptions);
  const run = await getPersistedRun(args.runId, location);
  if (!run) throw new Error("run_not_found");
  const finding = (await readPersistedFindings(args.runId, location)).find((item) => item.id === findingId) ?? null;
  const launchIntent = await readPersistedStageArtifact<LaunchIntentArtifact>(args.runId, "launch-intent", location);
  const id = `${args.runId}:runtime-followup:${findingId}`;
  const existing = await readPersistedRuntimeFollowup(id, location);
  const createdAt = args.input.created_at ?? new Date().toISOString();
  const base: PersistedRuntimeFollowupRecord = existing ?? {
    id,
    run_id: args.runId,
    workspace_id: normalizeWorkspaceId(run.workspace_id),
    project_id: normalizeProjectId(run.project_id),
    finding_id: findingId,
    finding_title: finding?.title ?? null,
    status: "pending",
    followup_policy: actionType === "rerun_in_capable_env" ? "rerun_in_capable_env" : "manual_runtime_review",
    requested_by: args.input.reviewer_id,
    requested_at: createdAt,
    source_review_action_id: args.actionId,
    rerun_request_json: null,
    linked_job_id: null,
    linked_run_id: null,
    launch_attempted_at: null,
    completed_at: null,
    completed_status: null,
    rerun_outcome: "pending",
    rerun_outcome_summary: null,
    rerun_outcome_finding_ids_json: [],
    rerun_reconciled_at: null,
    resolved_at: null,
    resolved_by: null,
    resolution_action_type: null,
    resolution_notes: null,
    metadata_json: null
  };

  if (actionType === "rerun_in_capable_env") {
    return writeFollowup({
      ...base,
      finding_title: finding?.title ?? base.finding_title,
      status: existing?.status === "launched" ? "launched" : "pending",
      followup_policy: "rerun_in_capable_env",
      requested_by: args.input.reviewer_id,
      requested_at: createdAt,
      source_review_action_id: args.actionId,
      rerun_request_json: deriveRerunRequest({
        run,
        launchIntent,
        findingId,
        findingTitle: finding?.title ?? null,
        requestedBy: args.input.reviewer_id
      }),
      rerun_outcome: existing?.status === "completed" ? existing.rerun_outcome : "pending",
      rerun_outcome_summary: existing?.status === "completed" ? existing.rerun_outcome_summary : null,
      rerun_outcome_finding_ids_json: existing?.status === "completed" ? existing.rerun_outcome_finding_ids_json : [],
      rerun_reconciled_at: existing?.status === "completed" ? existing.rerun_reconciled_at : null,
      resolved_at: null,
      resolved_by: null,
      resolution_action_type: null,
      resolution_notes: null
    }, location);
  }

  if (actionType === "adopt_rerun_outcome") {
    if (!existing) return null;
    return writeFollowup({
      ...existing,
      status: "resolved",
      resolved_at: createdAt,
      resolved_by: args.input.reviewer_id,
      resolution_action_type: actionType,
      resolution_notes: args.input.notes ?? null,
      metadata_json: {
        ...(((existing.metadata_json as Record<string, unknown> | null) ?? {})),
        adopted_outcome: String((args.input.metadata as Record<string, unknown> | null)?.adopted_outcome ?? existing.rerun_outcome ?? "pending")
      }
    }, location);
  }

  return writeFollowup({
    ...base,
    finding_title: finding?.title ?? base.finding_title,
    status: "resolved",
    resolved_at: createdAt,
    resolved_by: args.input.reviewer_id,
    resolution_action_type: actionType,
    resolution_notes: args.input.notes ?? null
  }, location);
}

export async function markRuntimeFollowupLaunched(args: {
  id: string;
  job: PersistedAsyncJobRecord;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedRuntimeFollowupRecord | null> {
  const location = resolveLocation(args.rootDirOrOptions);
  const existing = await readPersistedRuntimeFollowup(args.id, location);
  if (!existing) return null;
  const next: PersistedRuntimeFollowupRecord = {
    ...existing,
    status: "launched",
    linked_job_id: args.job.job_id,
    linked_run_id: args.job.current_run_id,
    launch_attempted_at: new Date().toISOString(),
    completed_at: null,
    completed_status: null,
    rerun_outcome: "pending",
    rerun_outcome_summary: null,
    rerun_outcome_finding_ids_json: [],
    rerun_reconciled_at: null
  };
  return writeFollowup(next, location);
}

export async function markRuntimeFollowupJobTerminal(args: {
  jobId: string;
  status: AsyncJobStatus;
  linkedRunId?: string | null;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedRuntimeFollowupRecord | null> {
  const location = resolveLocation(args.rootDirOrOptions);
  const match = (await listPersistedRuntimeFollowups({ rootDirOrOptions: location })).find((item) => item.linked_job_id === args.jobId) ?? null;
  if (!match) return null;
  const completedAt = new Date().toISOString();
  const reconciliation = await reconcileRuntimeFollowupOutcome({
    followup: match,
    linkedRunId: args.linkedRunId ?? match.linked_run_id,
    status: args.status,
    rootDirOrOptions: location
  });
  return writeFollowup({
    ...match,
    status: "completed",
    completed_at: completedAt,
    completed_status: args.status,
    linked_run_id: reconciliation.linked_run_id,
    rerun_outcome: reconciliation.rerun_outcome,
    rerun_outcome_summary: reconciliation.rerun_outcome_summary,
    rerun_outcome_finding_ids_json: reconciliation.rerun_outcome_finding_ids_json,
    rerun_reconciled_at: reconciliation.rerun_reconciled_at
  }, location);
}
