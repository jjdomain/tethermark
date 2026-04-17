import type { DatabaseMode } from "../contracts.js";
import type { PersistedRunQuery } from "./query.js";
import { listPersistedRuns, readPersistedStageExecutions } from "./query.js";
import {
  readPersistedAgentInvocations,
  readPersistedEvents,
  readPersistedMetrics,
  readPersistedToolExecutions
} from "./run-details.js";
import type { PersistenceReadOptions } from "./backend.js";

export interface ObservabilityRetentionPolicy {
  database_mode: DatabaseMode;
  raw_event_retention_days: number;
  raw_metric_retention_days: number;
  rollup_retention_days: number;
  bundle_export_retention_days: number | null;
  notes: string[];
}

export interface ObservabilityStageRollup {
  stage_name: string;
  execution_count: number;
  reused_count: number;
  failure_count: number;
  total_duration_ms: number;
  event_count: number;
}

export interface ObservabilityLaneRollup {
  lane_name: string;
  invocation_count: number;
  tool_execution_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface ObservabilityProviderRollup {
  provider_id: string;
  kind: "agent_model" | "tool_provider";
  invocation_count: number;
  tool_execution_count: number;
  completed_count: number;
  skipped_count: number;
  failed_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface PersistedObservabilitySummary {
  run_id: string;
  retention_policy: ObservabilityRetentionPolicy;
  totals: {
    event_count: number;
    metric_count: number;
    stage_execution_count: number;
    provider_count: number;
    lane_count: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
  };
  latest_event_at: string | null;
  stage_rollups: ObservabilityStageRollup[];
  lane_rollups: ObservabilityLaneRollup[];
  provider_rollups: ObservabilityProviderRollup[];
}

export interface PersistedObservabilityHistoryRun {
  run_id: string;
  created_at: string;
  target_id: string;
  event_count: number;
  metric_count: number;
  stage_execution_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface PersistedObservabilityDailyRollup {
  day: string;
  run_count: number;
  event_count: number;
  metric_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface PersistedObservabilityHistory {
  retention_policy: ObservabilityRetentionPolicy;
  totals: {
    run_count: number;
    event_count: number;
    metric_count: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
  };
  runs: PersistedObservabilityHistoryRun[];
  daily_rollups: PersistedObservabilityDailyRollup[];
}

function retentionDays(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveObservabilityRetentionPolicy(mode: DatabaseMode = "embedded"): ObservabilityRetentionPolicy {
  if (mode === "embedded") {
    return {
      database_mode: mode,
      raw_event_retention_days: retentionDays("HARNESS_OBSERVABILITY_RAW_EVENT_RETENTION_DAYS", 30),
      raw_metric_retention_days: retentionDays("HARNESS_OBSERVABILITY_RAW_METRIC_RETENTION_DAYS", 30),
      rollup_retention_days: retentionDays("HARNESS_OBSERVABILITY_ROLLUP_RETENTION_DAYS", 365),
      bundle_export_retention_days: retentionDays("HARNESS_OBSERVABILITY_BUNDLE_RETENTION_DAYS", 30),
      notes: [
        "Embedded mode keeps short-lived raw observability for local debugging.",
        "Rollups are intended to outlive raw event streams for cost and usage history."
      ]
    };
  }
  if (mode === "local") {
    return {
      database_mode: mode,
      raw_event_retention_days: retentionDays("HARNESS_OBSERVABILITY_RAW_EVENT_RETENTION_DAYS", 90),
      raw_metric_retention_days: retentionDays("HARNESS_OBSERVABILITY_RAW_METRIC_RETENTION_DAYS", 90),
      rollup_retention_days: retentionDays("HARNESS_OBSERVABILITY_ROLLUP_RETENTION_DAYS", 730),
      bundle_export_retention_days: retentionDays("HARNESS_OBSERVABILITY_BUNDLE_RETENTION_DAYS", 90),
      notes: [
        "Local mode favors longer raw retention for team dashboards and debugging.",
        "Rollups remain the preferred long-term query surface for historical usage."
      ]
    };
  }
  return {
    database_mode: mode,
    raw_event_retention_days: retentionDays("HARNESS_OBSERVABILITY_RAW_EVENT_RETENTION_DAYS", 365),
    raw_metric_retention_days: retentionDays("HARNESS_OBSERVABILITY_RAW_METRIC_RETENTION_DAYS", 365),
    rollup_retention_days: retentionDays("HARNESS_OBSERVABILITY_ROLLUP_RETENTION_DAYS", 3650),
    bundle_export_retention_days: retentionDays("HARNESS_OBSERVABILITY_BUNDLE_RETENTION_DAYS", 365),
    notes: [
      "Hosted mode keeps raw observability longer for audit support and incident review.",
      "Rollups should be treated as the durable cost and token history surface."
    ]
  };
}

export async function readPersistedObservabilitySummary(runId: string, options?: string | PersistenceReadOptions): Promise<PersistedObservabilitySummary> {
  const [events, metrics, stageExecutions, agentInvocations, toolExecutions] = await Promise.all([
    readPersistedEvents(runId, options),
    readPersistedMetrics(runId, options),
    readPersistedStageExecutions(runId, options),
    readPersistedAgentInvocations(runId, options),
    readPersistedToolExecutions(runId, options)
  ]);
  const mode = typeof options === "string" || !options ? "embedded" : options.dbMode ?? "embedded";

  const stageEventCounts = new Map<string, number>();
  for (const event of events) {
    stageEventCounts.set(event.stage, (stageEventCounts.get(event.stage) ?? 0) + 1);
  }
  const stageRollups: ObservabilityStageRollup[] = stageExecutions.map((stage) => ({
    stage_name: stage.stage_name,
    execution_count: 1,
    reused_count: stage.status === "reused" ? 1 : 0,
    failure_count: stage.status === "failed" ? 1 : 0,
    total_duration_ms: stage.duration_ms ?? 0,
    event_count: stageEventCounts.get(stage.stage_name) ?? 0
  })).sort((left: ObservabilityStageRollup, right: ObservabilityStageRollup) => right.total_duration_ms - left.total_duration_ms || left.stage_name.localeCompare(right.stage_name));

  const laneMap = new Map<string, ObservabilityLaneRollup>();
  for (const invocation of agentInvocations) {
    const laneName = invocation.lane_name ?? "unattributed";
    const current = laneMap.get(laneName) ?? {
      lane_name: laneName,
      invocation_count: 0,
      tool_execution_count: 0,
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
    laneMap.set(laneName, current);
  }
  for (const execution of toolExecutions) {
    const laneName = execution.lane_name ?? "unattributed";
    const current = laneMap.get(laneName) ?? {
      lane_name: laneName,
      invocation_count: 0,
      tool_execution_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0
    };
    current.tool_execution_count += 1;
    laneMap.set(laneName, current);
  }
  const laneRollups = [...laneMap.values()].sort((left, right) => right.total_tokens - left.total_tokens || right.tool_execution_count - left.tool_execution_count || left.lane_name.localeCompare(right.lane_name));

  const providerMap = new Map<string, ObservabilityProviderRollup>();
  for (const invocation of agentInvocations) {
    const providerId = `${invocation.provider}:${invocation.model}`;
    const current = providerMap.get(providerId) ?? {
      provider_id: providerId,
      kind: "agent_model",
      invocation_count: 0,
      tool_execution_count: 0,
      completed_count: 0,
      skipped_count: 0,
      failed_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0
    };
    current.invocation_count += 1;
    if (invocation.status === "completed") current.completed_count += 1;
    if (invocation.status === "failed") current.failed_count += 1;
    if (invocation.status === "skipped") current.skipped_count += 1;
    current.prompt_tokens += invocation.prompt_tokens ?? 0;
    current.completion_tokens += invocation.completion_tokens ?? 0;
    current.total_tokens += invocation.total_tokens ?? 0;
    current.estimated_cost_usd = Number((current.estimated_cost_usd + (invocation.estimated_cost_usd ?? 0)).toFixed(8));
    providerMap.set(providerId, current);
  }
  for (const execution of toolExecutions) {
    const providerId = execution.provider_id;
    const current = providerMap.get(providerId) ?? {
      provider_id: providerId,
      kind: "tool_provider",
      invocation_count: 0,
      tool_execution_count: 0,
      completed_count: 0,
      skipped_count: 0,
      failed_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0
    };
    current.tool_execution_count += 1;
    if (execution.status === "completed") current.completed_count += 1;
    if (execution.status === "failed") current.failed_count += 1;
    if (execution.status === "skipped") current.skipped_count += 1;
    providerMap.set(providerId, current);
  }
  const providerRollups = [...providerMap.values()].sort((left, right) => right.total_tokens - left.total_tokens || right.tool_execution_count - left.tool_execution_count || left.provider_id.localeCompare(right.provider_id));

  const promptTokens = agentInvocations.reduce((sum, item) => sum + (item.prompt_tokens ?? 0), 0);
  const completionTokens = agentInvocations.reduce((sum, item) => sum + (item.completion_tokens ?? 0), 0);
  const totalTokens = agentInvocations.reduce((sum, item) => sum + (item.total_tokens ?? 0), 0);
  const estimatedCostUsd = Number(agentInvocations.reduce((sum, item) => sum + (item.estimated_cost_usd ?? 0), 0).toFixed(8));

  return {
    run_id: runId,
    retention_policy: resolveObservabilityRetentionPolicy(mode),
    totals: {
      event_count: events.length,
      metric_count: metrics.length,
      stage_execution_count: stageExecutions.length,
      provider_count: providerRollups.length,
      lane_count: laneRollups.length,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCostUsd
    },
    latest_event_at: events.at(-1)?.timestamp ?? null,
    stage_rollups: stageRollups,
    lane_rollups: laneRollups,
    provider_rollups: providerRollups
  };
}

export async function getPersistedObservabilityHistory(args?: PersistedRunQuery): Promise<PersistedObservabilityHistory> {
  const mode = args?.dbMode ?? "embedded";
  const runs = await listPersistedRuns({ ...args, limit: Number.MAX_SAFE_INTEGER });
  const summaries = await Promise.all(runs.map(async (run) => ({
    run,
    summary: await readPersistedObservabilitySummary(run.id, { rootDir: args?.rootDir, dbMode: mode })
  })));

  const dailyMap = new Map<string, PersistedObservabilityDailyRollup>();
  for (const item of summaries) {
    const day = item.run.created_at.slice(0, 10);
    const current = dailyMap.get(day) ?? {
      day,
      run_count: 0,
      event_count: 0,
      metric_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost_usd: 0
    };
    current.run_count += 1;
    current.event_count += item.summary.totals.event_count;
    current.metric_count += item.summary.totals.metric_count;
    current.prompt_tokens += item.summary.totals.prompt_tokens;
    current.completion_tokens += item.summary.totals.completion_tokens;
    current.total_tokens += item.summary.totals.total_tokens;
    current.estimated_cost_usd = Number((current.estimated_cost_usd + item.summary.totals.estimated_cost_usd).toFixed(8));
    dailyMap.set(day, current);
  }

  const historyRuns = summaries
    .map((item) => ({
      run_id: item.run.id,
      created_at: item.run.created_at,
      target_id: item.run.target_id,
      event_count: item.summary.totals.event_count,
      metric_count: item.summary.totals.metric_count,
      stage_execution_count: item.summary.totals.stage_execution_count,
      prompt_tokens: item.summary.totals.prompt_tokens,
      completion_tokens: item.summary.totals.completion_tokens,
      total_tokens: item.summary.totals.total_tokens,
      estimated_cost_usd: item.summary.totals.estimated_cost_usd
    }))
    .sort((left, right) => right.created_at.localeCompare(left.created_at));

  return {
    retention_policy: resolveObservabilityRetentionPolicy(mode),
    totals: {
      run_count: historyRuns.length,
      event_count: historyRuns.reduce((sum: number, item: PersistedObservabilityHistoryRun) => sum + item.event_count, 0),
      metric_count: historyRuns.reduce((sum: number, item: PersistedObservabilityHistoryRun) => sum + item.metric_count, 0),
      prompt_tokens: historyRuns.reduce((sum: number, item: PersistedObservabilityHistoryRun) => sum + item.prompt_tokens, 0),
      completion_tokens: historyRuns.reduce((sum: number, item: PersistedObservabilityHistoryRun) => sum + item.completion_tokens, 0),
      total_tokens: historyRuns.reduce((sum: number, item: PersistedObservabilityHistoryRun) => sum + item.total_tokens, 0),
      estimated_cost_usd: Number(historyRuns.reduce((sum: number, item: PersistedObservabilityHistoryRun) => sum + item.estimated_cost_usd, 0).toFixed(8))
    },
    runs: historyRuns,
    daily_rollups: [...dailyMap.values()].sort((left, right) => right.day.localeCompare(left.day))
  };
}
