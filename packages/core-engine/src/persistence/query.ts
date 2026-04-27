import fs from "node:fs/promises";
import path from "node:path";

import type { RunRegistryEntry } from "../run-registry.js";
import { normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import { deriveCanonicalTargetId } from "../target-identity.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./backend.js";
import {
  hasSqliteDatabase,
  openSqliteDatabase,
  readSqliteTable
} from "./sqlite.js";
import type {
  PersistedDimensionScoreRecord,
  PersistedFindingRecord,
  PersistedLaneSpecialistRecord,
  PersistedPolicyApplicationRecord,
  PersistedResolvedConfigurationRecord,
  PersistedReviewWorkflowRecord,
  PersistedReviewDecisionRecord,
  PersistedRunRecord,
  PersistedScoreSummaryRecord,
  PersistedStageExecutionRecord,
  PersistedToolExecutionRecord,
  PersistedTargetRecord,
  PersistedTargetSnapshotRecord,
  PersistedTargetSummaryRecord
} from "./contracts.js";

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

export interface PersistedRunListItem extends PersistedRunRecord {
  target?: PersistedTargetRecord | null;
  target_snapshot?: PersistedTargetSnapshotRecord | null;
  target_summary?: PersistedTargetSummaryRecord | null;
  score_summary?: PersistedScoreSummaryRecord | null;
  review_decision?: PersistedReviewDecisionRecord | null;
  review_workflow?: PersistedReviewWorkflowRecord | null;
  policy_application?: PersistedPolicyApplicationRecord | null;
  resolved_configuration?: PersistedResolvedConfigurationRecord | null;
  canonical_target_id?: string;
  finding_count?: number;
  lane_specialist_count?: number;
}

export interface PersistedTargetListItem extends PersistedTargetRecord {
  latest_run?: PersistedRunListItem | null;
  latest_snapshot?: PersistedTargetSnapshotRecord | null;
  summary?: PersistedTargetSummaryRecord | null;
}

export interface PersistedRunQuery {
  rootDir?: string;
  dbMode?: "embedded" | "local";
  workspaceId?: string;
  projectId?: string;
  targetId?: string;
  status?: string;
  auditPackage?: string;
  runMode?: string;
  targetClass?: string;
  rating?: string;
  publishabilityStatus?: string;
  reviewWorkflowStatus?: string;
  policyPackId?: string;
  since?: string;
  until?: string;
  requiresHumanReview?: boolean;
  hasFindings?: boolean;
  limit?: number;
}

export interface PersistedRunStats {
  total_runs: number;
  publishable_runs: number;
  human_review_runs: number;
  runs_with_findings: number;
  runs_without_findings: number;
  average_overall_score: number;
  average_static_score: number;
  average_findings_per_run: number;
  total_lane_specialists: number;
  average_lane_specialists_per_run: number;
  by_audit_package: Array<{ audit_package: string; count: number }>;
  by_status: Array<{ status: string; count: number }>;
  by_rating: Array<{ rating: string; count: number }>;
  by_target_class: Array<{ target_class: string; count: number }>;
  by_publishability_status: Array<{ publishability_status: string; count: number }>;
}

export interface PersistedTargetStats {
  total_targets: number;
  repo_targets: number;
  path_targets: number;
  endpoint_targets: number;
  publishable_targets: number;
  human_review_targets: number;
  targets_with_findings: number;
  targets_with_lane_specialists: number;
  average_latest_overall_score: number;
  average_latest_static_score: number;
  by_target_type: Array<{ target_type: string; count: number }>;
  by_latest_target_class: Array<{ target_class: string; count: number }>;
  by_latest_rating: Array<{ rating: string; count: number }>;
  by_latest_publishability_status: Array<{ publishability_status: string; count: number }>;
}

function summarizeCounts(values: string[]): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export async function listPersistedRuns(args?: PersistedRunQuery): Promise<PersistedRunListItem[]> {
  const { rootDir } = resolvePersistenceLocation({ rootDir: args?.rootDir, dbMode: args?.dbMode });
  const [runs, targets, snapshots, targetSummaries, summaries, reviewDecisions, reviewWorkflows, policyApplications, resolvedConfigurations, findings, laneSpecialists] = await Promise.all([
    readTable<PersistedRunRecord>(rootDir, "runs"),
    readTable<PersistedTargetRecord>(rootDir, "targets"),
    readTable<PersistedTargetSnapshotRecord>(rootDir, "target_snapshots"),
    readTable<PersistedTargetSummaryRecord>(rootDir, "target_summaries"),
    readTable<PersistedScoreSummaryRecord>(rootDir, "score_summaries"),
    readTable<PersistedReviewDecisionRecord>(rootDir, "review_decisions"),
    readTable<PersistedReviewWorkflowRecord>(rootDir, "review_workflows"),
    readTable<PersistedPolicyApplicationRecord>(rootDir, "policy_applications"),
    readTable<PersistedResolvedConfigurationRecord>(rootDir, "resolved_configurations"),
    readTable<PersistedFindingRecord>(rootDir, "findings"),
    readTable<PersistedLaneSpecialistRecord>(rootDir, "lane_specialists")
  ]);

  const targetMap = new Map(targets.map((item) => [item.id, item]));
  const snapshotMap = new Map(snapshots.map((item) => [item.id, item]));
  const targetSummaryMap = new Map(targetSummaries.map((item) => [`${item.workspace_id}:${item.project_id}:${item.target_id}`, item]));
  const summaryMap = new Map(summaries.map((item) => [item.run_id, item]));
  const reviewDecisionMap = new Map(reviewDecisions.map((item) => [item.run_id, item]));
  const reviewWorkflowMap = new Map(reviewWorkflows.map((item) => [item.run_id, item]));
  const policyApplicationMap = new Map(policyApplications.map((item) => [item.run_id, item]));
  const resolvedConfigurationMap = new Map(resolvedConfigurations.map((item) => [item.run_id, item]));
  const findingCountMap = new Map<string, number>();
  for (const finding of findings) {
    findingCountMap.set(finding.run_id, (findingCountMap.get(finding.run_id) ?? 0) + 1);
  }
  const laneSpecialistCountMap = new Map<string, number>();
  for (const specialist of laneSpecialists) {
    laneSpecialistCountMap.set(specialist.run_id, (laneSpecialistCountMap.get(specialist.run_id) ?? 0) + 1);
  }

  return runs
    .map((item) => {
      const target = targetMap.get(item.target_id) ?? null;
      const snapshot = snapshotMap.get(item.target_snapshot_id) ?? null;
      const targetSummary = targetSummaryMap.get(`${item.workspace_id}:${item.project_id}:${item.target_id}`) ?? null;
      const canonicalTargetId = deriveCanonicalTargetId({
        targetType: target?.target_type ?? targetSummary?.target_type ?? "path",
        snapshotValue: snapshot?.snapshot_value ?? null,
        repoUrl: target?.repo_url ?? targetSummary?.repo_url ?? null,
        localPath: target?.target_type === "path"
          ? targetSummary?.local_path ?? target?.local_path ?? snapshot?.snapshot_value ?? null
          : target?.local_path ?? targetSummary?.local_path ?? null,
        endpointUrl: target?.endpoint_url ?? targetSummary?.endpoint_url ?? null,
        fallbackTargetId: item.target_id
      });
      return {
        ...item,
        target,
        target_snapshot: snapshot,
        target_summary: targetSummary,
        score_summary: summaryMap.get(item.id) ?? null,
        review_decision: reviewDecisionMap.get(item.id) ?? null,
        review_workflow: reviewWorkflowMap.get(item.id) ?? null,
        policy_application: policyApplicationMap.get(item.id) ?? null,
        resolved_configuration: resolvedConfigurationMap.get(item.id) ?? null,
        canonical_target_id: canonicalTargetId,
        finding_count: findingCountMap.get(item.id) ?? 0,
        lane_specialist_count: laneSpecialistCountMap.get(item.id) ?? 0
      };
    })
    .filter((item) => !args?.workspaceId || normalizeWorkspaceId(item.workspace_id) === normalizeWorkspaceId(args.workspaceId))
    .filter((item) => !args?.projectId || normalizeProjectId(item.project_id) === normalizeProjectId(args.projectId))
    .filter((item) => !args?.targetId || item.canonical_target_id === args.targetId || item.target_id === args.targetId)
    .filter((item) => !args?.status || item.status === args.status)
    .filter((item) => !args?.auditPackage || item.audit_package === args.auditPackage || item.resolved_configuration?.selected_audit_package === args.auditPackage)
    .filter((item) => !args?.runMode || item.run_mode === args.runMode || item.resolved_configuration?.run_mode === args.runMode)
    .filter((item) => !args?.targetClass || item.resolved_configuration?.initial_target_class === args.targetClass || item.target_summary?.latest_target_class === args.targetClass)
    .filter((item) => !args?.rating || item.rating === args.rating || item.score_summary?.rating === args.rating)
    .filter((item) => !args?.publishabilityStatus || item.review_decision?.publishability_status === args.publishabilityStatus)
    .filter((item) => !args?.reviewWorkflowStatus || item.review_workflow?.status === args.reviewWorkflowStatus)
    .filter((item) => !args?.policyPackId || item.policy_pack_id === args.policyPackId || item.resolved_configuration?.policy_pack_id === args.policyPackId)
    .filter((item) => !args?.since || item.created_at >= args.since)
    .filter((item) => !args?.until || item.created_at <= args.until)
    .filter((item) => args?.requiresHumanReview === undefined || item.review_decision?.human_review_required === args.requiresHumanReview)
    .filter((item) => args?.hasFindings === undefined || (args.hasFindings ? (item.finding_count ?? 0) > 0 : (item.finding_count ?? 0) === 0))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, args?.limit ?? runs.length);
}

export async function getPersistedRun(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedRunListItem | null> {
  const runs = typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? await listPersistedRuns({ rootDir: rootDirOrOptions, limit: Number.MAX_SAFE_INTEGER })
    : await listPersistedRuns({ rootDir: rootDirOrOptions.rootDir, dbMode: rootDirOrOptions.dbMode, limit: Number.MAX_SAFE_INTEGER });
  return runs.find((item) => item.id === runId) ?? null;
}

export async function readPersistedTargetSummary(targetId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedTargetSummaryRecord | null> {
  const { rootDir: resolvedRoot } = typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
  const rows = await readTable<PersistedTargetSummaryRecord>(resolvedRoot, "target_summaries");
  return rows.find((item) => item.id === targetId || item.target_id === targetId || item.canonical_target_id === targetId) ?? null;
}

export async function getPersistedTarget(targetId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedTargetListItem | null> {
  const targets = await listPersistedTargets(rootDirOrOptions);
  return targets.find((item) => item.id === targetId) ?? null;
}

export async function listPersistedTargets(rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedTargetListItem[]> {
  const location = typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
  const [runs, targetSummaries] = await Promise.all([
    listPersistedRuns({ rootDir: location.rootDir, dbMode: location.mode, limit: Number.MAX_SAFE_INTEGER }),
    readTable<PersistedTargetSummaryRecord>(location.rootDir, "target_summaries")
  ]);
  const summaryMap = new Map(targetSummaries.map((item) => [`${item.workspace_id}:${item.project_id}:${item.target_id}`, item]));
  const grouped = new Map<string, PersistedRunListItem[]>();

  for (const run of runs) {
    const canonicalTargetId = run.canonical_target_id ?? run.target_id;
    const bucket = grouped.get(canonicalTargetId) ?? [];
    bucket.push(run);
    grouped.set(canonicalTargetId, bucket);
  }

  return [...grouped.entries()].map(([canonicalTargetId, groupRuns]) => {
    const latestRun = [...groupRuns].sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;
    const latestSnapshot = latestRun?.target_snapshot ?? null;
    const latestTarget = latestRun?.target ?? null;
    const summary = latestRun
      ? (summaryMap.get(`${latestRun.workspace_id}:${latestRun.project_id}:${latestRun.target_id}`) ?? latestRun.target_summary ?? null)
      : null;
    return {
      id: canonicalTargetId,
      target_type: latestTarget?.target_type ?? summary?.target_type ?? "path",
      canonical_name: summary?.canonical_name ?? latestTarget?.canonical_name ?? latestSnapshot?.snapshot_value ?? canonicalTargetId,
      repo_url: summary?.repo_url ?? latestTarget?.repo_url ?? null,
      local_path: summary?.local_path ?? (latestTarget?.target_type === "path" ? latestSnapshot?.snapshot_value ?? latestTarget?.local_path ?? null : latestTarget?.local_path ?? null),
      endpoint_url: summary?.endpoint_url ?? latestTarget?.endpoint_url ?? null,
      created_at: groupRuns.reduce((earliest, item) => item.created_at < earliest ? item.created_at : earliest, latestRun?.created_at ?? new Date().toISOString()),
      latest_run: latestRun ? {
        ...latestRun,
        target_id: canonicalTargetId
      } : null,
      latest_snapshot: latestSnapshot ? {
        ...latestSnapshot,
        target_id: canonicalTargetId
      } : null,
      summary
    };
  }).sort((left, right) => (right.latest_run?.created_at ?? right.created_at).localeCompare(left.latest_run?.created_at ?? left.created_at));
}

export async function listPersistedRunsForTarget(targetId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedRunListItem[]> {
  if (typeof rootDirOrOptions === "string" || !rootDirOrOptions) {
    return listPersistedRuns({ rootDir: rootDirOrOptions, targetId, limit: Number.MAX_SAFE_INTEGER });
  }
  return listPersistedRuns({ rootDir: rootDirOrOptions.rootDir, dbMode: rootDirOrOptions.dbMode, targetId, limit: Number.MAX_SAFE_INTEGER });
}

export async function readPersistedStageExecutions(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedStageExecutionRecord[]> {
  const { rootDir: resolvedRoot } = typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
  const rows = await readTable<PersistedStageExecutionRecord>(resolvedRoot, "stage_executions");
  return rows
    .filter((item) => item.run_id === runId)
    .sort((left, right) => left.started_at.localeCompare(right.started_at));
}

export async function readPersistedDimensionScores(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedDimensionScoreRecord[]> {
  const { rootDir: resolvedRoot } = typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
  const rows = await readTable<PersistedDimensionScoreRecord>(resolvedRoot, "dimension_scores");
  return rows
    .filter((item) => item.run_id === runId)
    .sort((left, right) => left.dimension.localeCompare(right.dimension));
}

export async function readRunRegistry(rootDir?: string): Promise<RunRegistryEntry[]> {
  try {
    const raw = await fs.readFile(path.resolve(rootDir ?? path.resolve(process.cwd(), ".artifacts", "run-index.json")), "utf8");
    return Object.values(JSON.parse(raw) as Record<string, RunRegistryEntry>);
  } catch {
    return [];
  }
}

export async function readPersistedPolicyApplication(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedPolicyApplicationRecord | null> {
  const { rootDir: resolvedRoot } = typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
  const rows = await readTable<PersistedPolicyApplicationRecord>(resolvedRoot, "policy_applications");
  return rows.find((item) => item.run_id === runId) ?? null;
}

export async function getPersistedRunStats(args?: PersistedRunQuery): Promise<PersistedRunStats> {
  const runs = await listPersistedRuns({ ...args, limit: Number.MAX_SAFE_INTEGER });
  const averageOverall = runs.length ? Number((runs.reduce((sum, item) => sum + item.overall_score, 0) / runs.length).toFixed(2)) : 0;
  const averageStatic = runs.length ? Number((runs.reduce((sum, item) => sum + item.static_score, 0) / runs.length).toFixed(2)) : 0;
  const totalFindings = runs.reduce((sum, item) => sum + (item.finding_count ?? 0), 0);
  const totalLaneSpecialists = runs.reduce((sum, item) => sum + (item.lane_specialist_count ?? 0), 0);
  return {
    total_runs: runs.length,
    publishable_runs: runs.filter((item) => item.review_decision?.publishability_status === "publishable").length,
    human_review_runs: runs.filter((item) => item.review_decision?.human_review_required).length,
    runs_with_findings: runs.filter((item) => (item.finding_count ?? 0) > 0).length,
    runs_without_findings: runs.filter((item) => (item.finding_count ?? 0) === 0).length,
    average_overall_score: averageOverall,
    average_static_score: averageStatic,
    average_findings_per_run: runs.length ? Number((totalFindings / runs.length).toFixed(2)) : 0,
    total_lane_specialists: totalLaneSpecialists,
    average_lane_specialists_per_run: runs.length ? Number((totalLaneSpecialists / runs.length).toFixed(2)) : 0,
    by_audit_package: summarizeCounts(runs.map((item) => item.audit_package)).map((item) => ({ audit_package: item.key, count: item.count })),
    by_status: summarizeCounts(runs.map((item) => item.status)).map((item) => ({ status: item.key, count: item.count })),
    by_rating: summarizeCounts(runs.map((item) => item.rating)).map((item) => ({ rating: item.key, count: item.count })),
    by_target_class: summarizeCounts(runs.map((item) => item.resolved_configuration?.initial_target_class ?? item.target_summary?.latest_target_class ?? "unknown")).map((item) => ({ target_class: item.key, count: item.count })),
    by_publishability_status: summarizeCounts(runs.map((item) => item.review_decision?.publishability_status ?? "unknown")).map((item) => ({ publishability_status: item.key, count: item.count }))
  };
}

export async function getPersistedTargetStats(rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedTargetStats> {
  const targets = await listPersistedTargets(rootDirOrOptions);
  const averageLatestOverallScore = targets.length
    ? Number((targets.reduce((sum, item) => sum + (item.summary?.latest_overall_score ?? item.latest_run?.overall_score ?? 0), 0) / targets.length).toFixed(2))
    : 0;
  const averageLatestStaticScore = targets.length
    ? Number((targets.reduce((sum, item) => sum + (item.summary?.latest_static_score ?? item.latest_run?.static_score ?? 0), 0) / targets.length).toFixed(2))
    : 0;

  return {
    total_targets: targets.length,
    repo_targets: targets.filter((item) => item.target_type === "repo").length,
    path_targets: targets.filter((item) => item.target_type === "path").length,
    endpoint_targets: targets.filter((item) => item.target_type === "endpoint").length,
    publishable_targets: targets.filter((item) => item.summary?.latest_publishability_status === "publishable").length,
    human_review_targets: targets.filter((item) => item.summary?.latest_human_review_required).length,
    targets_with_findings: targets.filter((item) => (item.summary?.latest_finding_count ?? 0) > 0).length,
    targets_with_lane_specialists: targets.filter((item) => (item.latest_run?.lane_specialist_count ?? 0) > 0).length,
    average_latest_overall_score: averageLatestOverallScore,
    average_latest_static_score: averageLatestStaticScore,
    by_target_type: summarizeCounts(targets.map((item) => item.target_type)).map((item) => ({ target_type: item.key, count: item.count })),
    by_latest_target_class: summarizeCounts(targets.map((item) => item.summary?.latest_target_class ?? "unknown")).map((item) => ({ target_class: item.key, count: item.count })),
    by_latest_rating: summarizeCounts(targets.map((item) => item.summary?.latest_rating ?? item.latest_run?.rating ?? "unknown")).map((item) => ({ rating: item.key, count: item.count })),
    by_latest_publishability_status: summarizeCounts(targets.map((item) => item.summary?.latest_publishability_status ?? "unknown")).map((item) => ({ publishability_status: item.key, count: item.count }))
  };
}

export async function getPersistedTargetHistory(targetId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<Array<{
  run_id: string;
  created_at: string;
  overall_score: number;
  static_score: number;
  rating: string;
  publishability_status: string | null;
  audit_package: string;
}>> {
  const runs = await listPersistedRunsForTarget(targetId, rootDirOrOptions);
  return runs
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map((item) => ({
      run_id: item.id,
      created_at: item.created_at,
      overall_score: item.overall_score,
      static_score: item.static_score,
      rating: item.rating,
      publishability_status: item.review_decision?.publishability_status ?? null,
      audit_package: item.audit_package
    }));
}


export interface PersistedToolAdapterHistoryBucket {
  requested_provider_id: string;
  requested_tool: string;
  total_executions: number;
  direct_count: number;
  fallback_count: number;
  completed_count: number;
  skipped_count: number;
  failed_count: number;
  run_count: number;
  fallback_rate: number;
  completion_rate: number;
  providers_observed: string[];
}

export interface PersistedToolAdapterHistorySummary {
  total_runs: number;
  total_executions: number;
  buckets: PersistedToolAdapterHistoryBucket[];
}


export async function getPersistedToolAdapterHistory(args?: PersistedRunQuery): Promise<PersistedToolAdapterHistorySummary> {
  const { rootDir } = resolvePersistenceLocation({ rootDir: args?.rootDir, dbMode: args?.dbMode });
  const runs = await listPersistedRuns({ ...args, limit: Number.MAX_SAFE_INTEGER });
  const runIds = new Set(runs.map((item) => item.id));
  const executions = (await readTable<PersistedToolExecutionRecord>(rootDir, "tool_executions")).filter((item) => runIds.has(item.run_id));
  const buckets = new Map<string, PersistedToolAdapterHistoryBucket>();

  for (const execution of executions) {
    const adapter = (execution as any).adapter_json ?? null;
    const requestedProviderId = String(adapter?.requested_provider_id ?? execution.provider_id);
    const requestedTool = String(adapter?.requested_tool ?? execution.tool);
    const key = requestedProviderId + "::" + requestedTool;
    const current = buckets.get(key) ?? {
      requested_provider_id: requestedProviderId,
      requested_tool: requestedTool,
      total_executions: 0,
      direct_count: 0,
      fallback_count: 0,
      completed_count: 0,
      skipped_count: 0,
      failed_count: 0,
      run_count: 0,
      fallback_rate: 0,
      completion_rate: 0,
      providers_observed: []
    };
    current.total_executions += 1;
    if (adapter?.adapter_action === "fallback") current.fallback_count += 1;
    else current.direct_count += 1;
    if (execution.status === "completed") current.completed_count += 1;
    if (execution.status === "skipped") current.skipped_count += 1;
    if (execution.status === "failed") current.failed_count += 1;
    current.providers_observed = [...new Set([...current.providers_observed, execution.provider_id])];
    buckets.set(key, current);
  }

  for (const bucket of buckets.values()) {
    const matchingRunIds = new Set(executions.filter((execution) => {
      const adapter = (execution as any).adapter_json ?? null;
      const requestedProviderId = String(adapter?.requested_provider_id ?? execution.provider_id);
      const requestedTool = String(adapter?.requested_tool ?? execution.tool);
      return requestedProviderId === bucket.requested_provider_id && requestedTool === bucket.requested_tool;
    }).map((execution) => execution.run_id));
    bucket.run_count = matchingRunIds.size;
    bucket.fallback_rate = bucket.total_executions ? Number((bucket.fallback_count / bucket.total_executions).toFixed(4)) : 0;
    bucket.completion_rate = bucket.total_executions ? Number((bucket.completed_count / bucket.total_executions).toFixed(4)) : 0;
  }

  return {
    total_runs: runs.length,
    total_executions: executions.length,
    buckets: [...buckets.values()].sort((left, right) => right.total_executions - left.total_executions || left.requested_provider_id.localeCompare(right.requested_provider_id))
  };
}


export interface PersistedTargetLaneSpecialistHistory {
  target_id: string;
  total_runs: number;
  total_lane_specialists: number;
  average_lane_specialists_per_run: number;
  runs_with_lane_specialists: number;
  history: Array<{
    run_id: string;
    created_at: string;
    audit_package: string;
    lane_specialist_count: number;
  }>;
}

export async function getPersistedTargetLaneSpecialistHistory(targetId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedTargetLaneSpecialistHistory> {
  const runs = await listPersistedRunsForTarget(targetId, rootDirOrOptions);
  const ordered = runs.sort((left, right) => left.created_at.localeCompare(right.created_at));
  const totalLaneSpecialists = ordered.reduce((sum, item) => sum + (item.lane_specialist_count ?? 0), 0);
  return {
    target_id: targetId,
    total_runs: ordered.length,
    total_lane_specialists: totalLaneSpecialists,
    average_lane_specialists_per_run: ordered.length ? Number((totalLaneSpecialists / ordered.length).toFixed(2)) : 0,
    runs_with_lane_specialists: ordered.filter((item) => (item.lane_specialist_count ?? 0) > 0).length,
    history: ordered.map((item) => ({
      run_id: item.id,
      created_at: item.created_at,
      audit_package: item.audit_package,
      lane_specialist_count: item.lane_specialist_count ?? 0
    }))
  };
}

export async function getPersistedTargetToolAdapterHistory(targetId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedToolAdapterHistorySummary> {
  if (typeof rootDirOrOptions === "string" || !rootDirOrOptions) {
    return getPersistedToolAdapterHistory({ rootDir: rootDirOrOptions, targetId, limit: Number.MAX_SAFE_INTEGER });
  }
  return getPersistedToolAdapterHistory({ rootDir: rootDirOrOptions.rootDir, dbMode: rootDirOrOptions.dbMode, targetId, limit: Number.MAX_SAFE_INTEGER });
}
