import fs from "node:fs/promises";
import path from "node:path";

import type { HarnessEvent, HarnessMetricSnapshot, ObservabilityArtifacts } from "../contracts.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./backend.js";
import type {
  PersistedAgentInvocationRecord,
  PersistedArtifactIndexRecord,
  PersistedCommitDiffRecord,
  PersistedControlResultRecord,
  PersistedCorrectionPlanRecord,
  PersistedCorrectionResultRecord,
  PersistedLaneReuseDecisionRecord,
  PersistedPersistenceSummaryRecord,
  PersistedStageArtifactRecord,
  PersistedEvidenceRecord,
  PersistedFindingDispositionRecord,
  PersistedFindingRecord,
  PersistedLanePlanRecord,
  PersistedLaneResultRecord,
  PersistedLaneSpecialistRecord,
  PersistedMetricRecord,
  PersistedRemediationMemoRecord,
  PersistedReviewCommentRecord,
  PersistedResolvedConfigurationRecord,
  PersistedReviewActionRecord,
  PersistedReviewDecisionRecord,
  PersistedReviewWorkflowRecord,
  PersistedScoreSummaryRecord,
  PersistedSupervisorReviewRecord,
  PersistedToolExecutionRecord
} from "./contracts.js";
import { ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

async function readJsonTable<T>(rootDir: string, tableName: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(path.join(rootDir, `${tableName}.json`), "utf8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

async function readTable<T>(rootDir: string, tableName: string): Promise<T[]> {
  if (await hasSqliteDatabase(rootDir)) {
    const db = await openSqliteDatabase(rootDir);
    try {
      return readSqliteTable<T>(db, tableName);
    } finally {
      db.close();
    }
  }
  return readJsonTable<T>(rootDir, tableName);
}

async function readRecordsByRun<T extends { run_id: string }>(tableName: string, runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<T[]> {
  const { rootDir: resolvedRoot } = typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
  const rows = await readTable<T>(resolvedRoot, tableName);
  return rows.filter((item) => item.run_id === runId);
}

export async function readPersistedLanePlans(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedLanePlanRecord[]> {
  return readRecordsByRun<PersistedLanePlanRecord>("lane_plans", runId, rootDirOrOptions);
}

export async function readPersistedEvidenceRecords(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedEvidenceRecord[]> {
  return readRecordsByRun<PersistedEvidenceRecord>("evidence_records", runId, rootDirOrOptions);
}

export async function readPersistedLaneResults(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedLaneResultRecord[]> {
  return readRecordsByRun<PersistedLaneResultRecord>("lane_results", runId, rootDirOrOptions);
}

export async function readPersistedAgentInvocations(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedAgentInvocationRecord[]> {
  return readRecordsByRun<PersistedAgentInvocationRecord>("agent_invocations", runId, rootDirOrOptions);
}

export async function readPersistedToolExecutions(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedToolExecutionRecord[]> {
  return readRecordsByRun<PersistedToolExecutionRecord>("tool_executions", runId, rootDirOrOptions);
}

export async function readPersistedFindings(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedFindingRecord[]> {
  return readRecordsByRun<PersistedFindingRecord>("findings", runId, rootDirOrOptions);
}

export async function readPersistedControlResults(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedControlResultRecord[]> {
  return readRecordsByRun<PersistedControlResultRecord>("control_results", runId, rootDirOrOptions);
}

export async function readPersistedScoreSummary(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedScoreSummaryRecord | null> {
  const rows = await readRecordsByRun<PersistedScoreSummaryRecord & { run_id: string }>("score_summaries", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedReviewDecision(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedReviewDecisionRecord | null> {
  const rows = await readRecordsByRun<PersistedReviewDecisionRecord & { run_id: string }>("review_decisions", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedSupervisorReview(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedSupervisorReviewRecord | null> {
  const rows = await readRecordsByRun<PersistedSupervisorReviewRecord & { run_id: string }>("supervisor_reviews", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedRemediationMemo(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedRemediationMemoRecord | null> {
  const rows = await readRecordsByRun<PersistedRemediationMemoRecord & { run_id: string }>("remediation_memos", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedReviewWorkflow(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedReviewWorkflowRecord | null> {
  const rows = await readRecordsByRun<PersistedReviewWorkflowRecord & { run_id: string }>("review_workflows", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedReviewActions(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedReviewActionRecord[]> {
  const rows = await readRecordsByRun<PersistedReviewActionRecord>("review_actions", runId, rootDirOrOptions);
  return rows.sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export async function readPersistedReviewComments(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedReviewCommentRecord[]> {
  const rows = await readRecordsByRun<PersistedReviewCommentRecord>("review_comments", runId, rootDirOrOptions);
  return rows.sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export async function readPersistedFindingDispositions(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedFindingDispositionRecord[]> {
  const { readPersistedFindingDispositionsForRun } = await import("./finding-dispositions.js");
  return readPersistedFindingDispositionsForRun(runId, rootDirOrOptions);
}

export async function readPersistedResolvedConfiguration(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedResolvedConfigurationRecord | null> {
  const rows = await readRecordsByRun<PersistedResolvedConfigurationRecord & { run_id: string }>("resolved_configurations", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedCommitDiff(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedCommitDiffRecord | null> {
  const rows = await readRecordsByRun<PersistedCommitDiffRecord & { run_id: string }>("commit_diffs", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedCorrectionPlan(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedCorrectionPlanRecord | null> {
  const rows = await readRecordsByRun<PersistedCorrectionPlanRecord & { run_id: string }>("correction_plans", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedCorrectionResult(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedCorrectionResultRecord | null> {
  const rows = await readRecordsByRun<PersistedCorrectionResultRecord & { run_id: string }>("correction_results", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedLaneReuseDecisions(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedLaneReuseDecisionRecord[]> {
  return readRecordsByRun<PersistedLaneReuseDecisionRecord>("lane_reuse_decisions", runId, rootDirOrOptions);
}

export async function readPersistedPersistenceSummary(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedPersistenceSummaryRecord | null> {
  const rows = await readRecordsByRun<PersistedPersistenceSummaryRecord & { run_id: string }>("persistence_summaries", runId, rootDirOrOptions);
  return rows[0] ?? null;
}

export async function readPersistedStageArtifacts(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedStageArtifactRecord[]> {
  return readRecordsByRun<PersistedStageArtifactRecord>("stage_artifacts", runId, rootDirOrOptions);
}

export async function readPersistedStageArtifact<T>(runId: string, artifactType: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<T | null> {
  const rows = await readPersistedStageArtifacts(runId, rootDirOrOptions);
  return (rows.find((item) => item.artifact_type === artifactType)?.payload_json as T | undefined) ?? null;
}

export async function upsertPersistedStageArtifact<T>(args: {
  runId: string;
  artifactType: string;
  payload: T;
  createdAt?: string;
  targetId?: string | null;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedStageArtifactRecord> {
  const location = typeof args.rootDirOrOptions === "string" || !args.rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: args.rootDirOrOptions })
    : resolvePersistenceLocation(args.rootDirOrOptions);
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    const record: PersistedStageArtifactRecord = {
      id: `${args.runId}:stage-artifact:${args.artifactType}`,
      run_id: args.runId,
      artifact_type: args.artifactType,
      payload_json: args.payload,
      created_at: args.createdAt ?? new Date().toISOString()
    };
    upsertSqliteRecord({
      db,
      tableName: "stage_artifacts",
      recordKey: record.id,
      payload: record,
      runId: record.run_id,
      createdAt: record.created_at,
      targetId: args.targetId ?? null,
      parentKey: record.run_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
}

export async function readPersistedArtifactIndex(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedArtifactIndexRecord[]> {
  const { rootDir: resolvedRoot } = typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
  const rows = await readTable<PersistedArtifactIndexRecord>(resolvedRoot, "artifact_index");
  return rows.filter((item) => item.run_id === runId);
}

function isMaintenanceEvent(event: HarnessEvent): boolean {
  return event.stage.startsWith("maintenance_") || event.actor === "persistence_backfill" || event.event_type.startsWith("reconstruction_");
}

function isMaintenanceMetric(metric: HarnessMetricSnapshot): boolean {
  const tags = metric.tags ?? {};
  return metric.name.startsWith("reconstruction_") || tags.actor === "persistence_backfill";
}

function toHarnessMetric(metric: PersistedMetricRecord): HarnessMetricSnapshot {
  return {
    name: metric.name,
    kind: metric.kind as any,
    value: metric.value,
    count: metric.count ?? undefined,
    min: metric.min ?? undefined,
    max: metric.max ?? undefined,
    avg: metric.avg ?? undefined,
    tags: (metric.tags_json as Record<string, string> | null) ?? undefined
  };
}

export async function readPersistedEvents(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<HarnessEvent[]> {
  const rows = await readRecordsByRun<HarnessEvent>("events", runId, rootDirOrOptions);
  return rows.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export async function readPersistedMetrics(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<HarnessMetricSnapshot[]> {
  const rows = await readRecordsByRun<PersistedMetricRecord>("metrics", runId, rootDirOrOptions);
  return rows.map(toHarnessMetric).sort((left, right) => left.name.localeCompare(right.name));
}

export async function readPersistedObservability(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<ObservabilityArtifacts> {
  const [events, metrics] = await Promise.all([
    readPersistedEvents(runId, rootDirOrOptions),
    readPersistedMetrics(runId, rootDirOrOptions)
  ]);
  return { events, metrics };
}

export interface PersistedMaintenanceHistory {
  run_id: string;
  last_maintenance_at: string | null;
  events: HarnessEvent[];
  metrics: HarnessMetricSnapshot[];
}

export async function readPersistedMaintenanceHistory(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedMaintenanceHistory> {
  const [events, metrics] = await Promise.all([
    readPersistedEvents(runId, rootDirOrOptions),
    readPersistedMetrics(runId, rootDirOrOptions)
  ]);
  const maintenanceEvents = events.filter(isMaintenanceEvent);
  const maintenanceMetrics = metrics.filter(isMaintenanceMetric);
  return {
    run_id: runId,
    last_maintenance_at: maintenanceEvents.at(-1)?.timestamp ?? null,
    events: maintenanceEvents,
    metrics: maintenanceMetrics
  };
}

export interface PersistedRunUsageBucket {
  name: string;
  invocation_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface PersistedRunUsageSummary {
  run_id: string;
  totals: {
    invocation_count: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
  };
  by_stage: PersistedRunUsageBucket[];
  by_lane: PersistedRunUsageBucket[];
  by_agent: PersistedRunUsageBucket[];
}

function summarizeUsageBuckets(invocations: PersistedAgentInvocationRecord[], selector: (item: PersistedAgentInvocationRecord) => string | null | undefined): PersistedRunUsageBucket[] {
  const buckets = new Map<string, PersistedRunUsageBucket>();
  for (const invocation of invocations) {
    const name = selector(invocation) ?? "unattributed";
    const current = buckets.get(name) ?? {
      name,
      invocation_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0
    };
    current.invocation_count += 1;
    current.prompt_tokens += invocation.prompt_tokens ?? 0;
    current.completion_tokens += invocation.completion_tokens ?? 0;
    current.total_tokens += invocation.total_tokens ?? 0;
    current.estimated_cost_usd = Number((current.estimated_cost_usd + (invocation.estimated_cost_usd ?? 0)).toFixed(8));
    buckets.set(name, current);
  }
  return [...buckets.values()].sort((left, right) => right.total_tokens - left.total_tokens || right.invocation_count - left.invocation_count || left.name.localeCompare(right.name));
}

export async function readPersistedRunUsageSummary(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedRunUsageSummary> {
  const invocations = await readPersistedAgentInvocations(runId, rootDirOrOptions);
  const totals = invocations.reduce((acc, invocation) => {
    acc.invocation_count += 1;
    acc.prompt_tokens += invocation.prompt_tokens ?? 0;
    acc.completion_tokens += invocation.completion_tokens ?? 0;
    acc.total_tokens += invocation.total_tokens ?? 0;
    acc.estimated_cost_usd = Number((acc.estimated_cost_usd + (invocation.estimated_cost_usd ?? 0)).toFixed(8));
    return acc;
  }, {
    invocation_count: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0
  });

  return {
    run_id: runId,
    totals,
    by_stage: summarizeUsageBuckets(invocations, (item) => item.stage_name),
    by_lane: summarizeUsageBuckets(invocations, (item) => item.lane_name),
    by_agent: summarizeUsageBuckets(invocations, (item) => item.agent_name)
  };
}

export interface PersistedToolAdapterSummaryBucket {
  requested_provider_id: string;
  requested_tool: string;
  execution_count: number;
  direct_count: number;
  fallback_count: number;
  completed_count: number;
  skipped_count: number;
  failed_count: number;
  providers_observed: string[];
  fallback_targets: string[];
}

export interface PersistedToolAdapterSummary {
  run_id: string;
  total_executions: number;
  direct_count: number;
  fallback_count: number;
  buckets: PersistedToolAdapterSummaryBucket[];
}

export async function readPersistedLaneSpecialistOutputs(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedLaneSpecialistRecord[]> {
  return readRecordsByRun<PersistedLaneSpecialistRecord>("lane_specialists", runId, rootDirOrOptions);
}

export async function readPersistedToolAdapterSummary(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedToolAdapterSummary> {
  const executions = await readPersistedToolExecutions(runId, rootDirOrOptions);
  const buckets = new Map<string, PersistedToolAdapterSummaryBucket>();
  let directCount = 0;
  let fallbackCount = 0;

  for (const execution of executions) {
    const adapter = (execution as any).adapter_json ?? null;
    const requestedProviderId = String(adapter?.requested_provider_id ?? execution.provider_id);
    const requestedTool = String(adapter?.requested_tool ?? execution.tool);
    const key = requestedProviderId + "::" + requestedTool;
    const current = buckets.get(key) ?? {
      requested_provider_id: requestedProviderId,
      requested_tool: requestedTool,
      execution_count: 0,
      direct_count: 0,
      fallback_count: 0,
      completed_count: 0,
      skipped_count: 0,
      failed_count: 0,
      providers_observed: [],
      fallback_targets: []
    };
    current.execution_count += 1;
    if (adapter?.adapter_action === "fallback") {
      current.fallback_count += 1;
      fallbackCount += 1;
    } else {
      current.direct_count += 1;
      directCount += 1;
    }
    if (execution.status === "completed") current.completed_count += 1;
    if (execution.status === "skipped") current.skipped_count += 1;
    if (execution.status === "failed") current.failed_count += 1;
    current.providers_observed = [...new Set([...current.providers_observed, execution.provider_id])];
    if (adapter?.adapter_action === "fallback") {
      current.fallback_targets = [...new Set([...current.fallback_targets, execution.provider_id])];
    }
    buckets.set(key, current);
  }

  return {
    run_id: runId,
    total_executions: executions.length,
    direct_count: directCount,
    fallback_count: fallbackCount,
    buckets: [...buckets.values()].sort((left, right) => right.execution_count - left.execution_count || left.requested_provider_id.localeCompare(right.requested_provider_id))
  };
}
