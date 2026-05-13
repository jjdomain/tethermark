import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { listenWithFriendlyErrors } from "../../shared/src/listen.js";
import { describeArtifactType } from "../../../packages/core-engine/src/artifact-policy.js";
import { loadEnvironment } from "../../../packages/core-engine/src/env.js";
import {
  createEngine,
  getPersistedRun,
  getPersistedRunStats,
  getPersistedObservabilityHistory,
  getPersistedToolAdapterHistory,
  getPersistedTarget,
  getPersistedTargetHistory,
  getPersistedTargetLaneSpecialistHistory,
  getPersistedTargetToolAdapterHistory,
  getPersistedTargetStats,
  listBuiltinAuditPackages,
  listBuiltinAuditPolicyPacks,
  listBuiltinLlmProviders,
  listBuiltinLlmProviderPresets,
  attachLlmProviderCredentialStatus,
  listBuiltinIntegrations,
  attachIntegrationCredentialStatus,
  pruneArtifacts,
  summarizeArtifacts,
  listPersistedRuns,
  listPersistedRunsForTarget,
  listPersistedTargets,
  readPersistenceMetadata,
  resolvePersistenceLocation,
  readPersistedAgentInvocations,
  readPersistedArtifactIndex,
  readPersistedControlResults,
  readPersistedEvidenceRecords,
  readPersistedFindings,
  readPersistedLanePlans,
  readPersistedLaneResults,
  readPersistedReviewDecision,
  readPersistedRunUsageSummary,
  readPersistedLaneSpecialistOutputs,
  readPersistedToolAdapterSummary,
  readPersistedScoreSummary,
  readPersistedDimensionScores,
  readPersistedRemediationMemo,
  readPersistedStageArtifact,
  readPersistedStageExecutions,
  readPersistedSupervisorReview,
  readPersistedTargetSummary,
  readPersistedToolExecutions,
  readPersistedResolvedConfiguration,
  readPersistedCommitDiff,
  readPersistedCorrectionPlan,
  readPersistedCorrectionResult,
  readPersistedReviewActions,
  readPersistedReviewComments,
  readPersistedFindingDispositions,
  readPersistedReviewWorkflow,
  upsertPersistedStageArtifact,
  buildReviewSummary,
  buildFindingEvaluationSummary,
  createPersistedFindingDisposition,
  updatePersistedFindingDisposition,
  revokePersistedFindingDisposition,
  resolveFindingDispositions,
  findingDispositionSignature,
  buildFindingEvidenceFingerprint,
  buildMarkdownRunReport,
  buildExecutiveMarkdownReport,
  buildExecutiveSummaryPayload,
  buildSarifRunReport,
  emitGenericWebhookEvent,
  normalizeGenericWebhookConfig,
  createPersistedReviewComment,
  readPersistedLaneReuseDecisions,
  readPersistedPersistenceSummary,
  readPersistedEvents,
  readPersistedMaintenanceHistory,
  readPersistedMetrics,
  readPersistedObservability,
  readPersistedObservabilitySummary,
  reconstructLocalRun,
  reconstructLocalRuns,
  readPersistedPolicyApplication,
  PersistedAsyncJobManager,
  acknowledgePersistedReviewNotification,
  listPersistedReviewNotifications,
  submitPersistedReviewAction,
  readPersistedUiSettings,
  readPersistedUiSettingsLayer,
  resolvePersistedUiSettings,
  updatePersistedUiSettings,
  listPersistedWebhookDeliveries,
  listPersistedUiDocuments,
  createPersistedUiDocument,
  deletePersistedUiDocument,
  listPersistedProjects,
  createPersistedProject,
  getPersistedProject,
  updatePersistedProject,
  listPersistedRuntimeFollowups,
  readPersistedRuntimeFollowup,
  upsertRuntimeFollowupFromReviewAction,
  markRuntimeFollowupLaunched,
  markRuntimeFollowupJobTerminal,
  buildPreflightSummary,
  buildStaticToolsReadiness,
  canCommentOnReview,
  canExportReviewAudit,
  canPerformReviewAction,
  buildGithubOutboundPreview,
  executeGithubOutboundDelivery,
  normalizeGithubExecutionConfig,
  normalizeGithubIntegrationPolicy,
  verifyGithubRepositoryAccess,
  normalizeActorId,
  normalizeProjectId,
  normalizeWorkspaceId,
  type ReviewActorRole,
  type GenericWebhookEventType,
  type OutboundApprovalArtifact,
  type OutboundDeliveryArtifact,
  type OutboundSendArtifact,
  type OutboundVerificationArtifact,
  type AuditRequest,
  type ArtifactRetentionKind,
  type PersistedProjectRecord,
  type PersistedRunListItem,
  type PersistedTargetListItem
} from "../../../packages/core-engine/src/index.js";

loadEnvironment();

const engine = createEngine();
const TETHERMARK_VERSION = process.env.TETHERMARK_VERSION ?? "0.2.0";
const EXPORT_SCHEMA_VERSION = "1.0.0";
const asyncJobs = new PersistedAsyncJobManager(engine, {
  onTerminalJob: async ({ job, attempt, rootDirOrOptions }) => {
    await markRuntimeFollowupJobTerminal({
      jobId: job.job_id,
      status: job.status,
      linkedRunId: attempt.run_id,
      rootDirOrOptions
    });
    if (!attempt.run_id) return;
    await emitConfiguredWebhookForRun(attempt.run_id, "run_completed", "system_async", {
      async_job_id: job.job_id,
      async_attempt_number: attempt.attempt_number,
      async_status: job.status
    }, rootDirOrOptions);
  }
});
const host = "127.0.0.1";
const port = Number(process.env.PORT ?? "8787");

type RunSubresource =
  | "observability"
  | "observations"
  | "events"
  | "metrics"
  | "observability-summary"
  | "maintenance"
  | "lane-plans"
  | "lane-results"
  | "lane-specialists"
  | "lane-reuse-decisions"
  | "tool-adapters"
  | "evidence-records"
  | "findings"
  | "control-results"
  | "tool-executions"
  | "agent-invocations"
  | "artifact-index"
  | "score-summary"
  | "dimension-scores"
  | "usage-summary"
  | "review-decision"
  | "review-workflow"
  | "review-actions"
  | "review-comments"
  | "review-summary"
  | "runtime-followups"
  | "exports"
  | "finding-dispositions"
  | "finding-evaluations"
  | "webhook-deliveries"
  | "report-markdown"
  | "report-sarif"
  | "report-executive"
  | "report-compare"
  | "sandbox-execution"
  | "review-audit"
  | "outbound-preview"
  | "outbound-verification"
  | "supervisor-review"
  | "remediation"
  | "summary"
  | "preflight"
  | "launch-intent"
  | "outbound-approval"
  | "outbound-send"
  | "outbound-delivery"
  | "commit-diff"
  | "persistence"
  | "stage-executions"
  | "publishability"
  | "policy-application"
  | "resolved-config"
  | "correction-plan"
  | "correction-result";

function sendText(res: http.ServerResponse, status: number, contentType: string, body: string): void {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

function buildRuntimeFollowupSummary(followups: Array<Record<string, any>>) {
  return {
    total_count: followups.length,
    pending_count: followups.filter((item) => item.status === "pending").length,
    launched_count: followups.filter((item) => item.status === "launched").length,
    adoption_ready_count: followups.filter((item) => item.status !== "resolved" && item.rerun_outcome && item.rerun_outcome !== "pending").length,
    confirmed_count: followups.filter((item) => item.rerun_outcome === "confirmed").length,
    not_reproduced_count: followups.filter((item) => item.rerun_outcome === "not_reproduced").length,
    inconclusive_count: followups.filter((item) => item.rerun_outcome === "still_inconclusive").length,
    resolved_count: followups.filter((item) => item.status === "resolved").length
  };
}

function csvValue(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function buildRuntimeFollowupCsv(followups: Array<Record<string, any>>): string {
  const headers = [
    "id",
    "run_id",
    "finding_id",
    "finding_title",
    "status",
    "followup_policy",
    "requested_by",
    "requested_at",
    "linked_job_id",
    "linked_run_id",
    "rerun_outcome",
    "rerun_outcome_summary",
    "resolved_at",
    "resolved_by",
    "resolution_action_type"
  ];
  const rows = followups.map((item) => headers.map((key) => csvValue(item[key])).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function buildExportEnvelope<T>(schemaName: string, payload: T) {
  return {
    schema_name: schemaName,
    schema_version: EXPORT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    tethermark_version: TETHERMARK_VERSION,
    payload
  };
}

function buildRunExportIndex(runId: string, compareToRunId: string | null) {
  return {
    run_id: runId,
    exports: [
      { export_type: "executive_summary", format: "json", filename: `${runId}-executive-summary.json`, route: `/runs/${encodeURIComponent(runId)}/report-executive?format=json`, schema_name: "executive_summary.v1" },
      { export_type: "executive_summary", format: "markdown", filename: `${runId}-executive-summary.md`, route: `/runs/${encodeURIComponent(runId)}/report-executive?format=markdown`, schema_name: null },
      { export_type: "run_report", format: "markdown", filename: `${runId}-report.md`, route: `/runs/${encodeURIComponent(runId)}/report-markdown`, schema_name: null },
      { export_type: "run_report", format: "sarif", filename: `${runId}-report.sarif.json`, route: `/runs/${encodeURIComponent(runId)}/report-sarif`, schema_name: null },
      { export_type: "finding_evaluations", format: "json", filename: `${runId}-finding-evaluations.json`, route: `/runs/${encodeURIComponent(runId)}/finding-evaluations`, schema_name: "finding_evaluations.v1" },
      { export_type: "review_audit", format: "json", filename: `${runId}-review-audit.json`, route: `/runs/${encodeURIComponent(runId)}/review-audit`, schema_name: "review_audit.v1" },
      ...(compareToRunId ? [
        { export_type: "run_comparison", format: "json", filename: `${runId}-vs-${compareToRunId}-comparison.json`, route: `/runs/${encodeURIComponent(runId)}/report-compare?compare_to=${encodeURIComponent(compareToRunId)}&format=json`, schema_name: "run_comparison.v1" },
        { export_type: "run_comparison", format: "markdown", filename: `${runId}-vs-${compareToRunId}-comparison.md`, route: `/runs/${encodeURIComponent(runId)}/report-compare?compare_to=${encodeURIComponent(compareToRunId)}&format=markdown`, schema_name: null }
      ] : [])
    ]
  };
}

function normalizeFindingSignature(finding: { title?: string | null; category?: string | null }): string {
  return `${String(finding.category ?? "unknown").trim().toLowerCase()}::${String(finding.title ?? "").trim().toLowerCase()}`;
}

function normalizeEvidenceSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function overlappingEvidenceSymbols(left: unknown, right: unknown): string[] {
  const leftSet = new Set(normalizeEvidenceSymbols(left));
  if (!leftSet.size) return [];
  return normalizeEvidenceSymbols(right).filter((item) => leftSet.has(item));
}

export function buildRunComparisonReport(args: {
  currentRunId: string;
  compareToRunId: string;
  currentFindings: Array<Record<string, any>>;
  previousFindings: Array<Record<string, any>>;
  currentEvaluations: Record<string, any>;
  previousEvaluations: Record<string, any>;
  currentSummary: Record<string, any>;
  previousSummary: Record<string, any>;
}) {
  const currentBySignature = new Map<string, Record<string, any>>();
  const previousBySignature = new Map<string, Record<string, any>>();
  const currentEvalByFindingId = new Map<string, Record<string, any>>(
    Array.isArray(args.currentEvaluations?.evaluations)
      ? args.currentEvaluations.evaluations.map((item: Record<string, any>) => [String(item.finding_id), item])
      : []
  );
  const previousEvalByFindingId = new Map<string, Record<string, any>>(
    Array.isArray(args.previousEvaluations?.evaluations)
      ? args.previousEvaluations.evaluations.map((item: Record<string, any>) => [String(item.finding_id), item])
      : []
  );
  for (const finding of args.currentFindings) currentBySignature.set(normalizeFindingSignature(finding), finding);
  for (const finding of args.previousFindings) previousBySignature.set(normalizeFindingSignature(finding), finding);
  const newFindings: Array<Record<string, any>> = [];
  const resolvedFindings: Array<Record<string, any>> = [];
  const changedFindings: Array<Record<string, any>> = [];
  const matchedPreviousIds = new Set<string>();
  let symbolMatchedCount = 0;
  let unchangedCount = 0;

  for (const [signature, currentFinding] of currentBySignature.entries()) {
    const currentEvaluation = currentEvalByFindingId.get(String(currentFinding.id)) ?? null;
    let previousFinding = previousBySignature.get(signature);
    let matchStrategy: "finding_signature" | "evidence_symbols" | "none" = previousFinding ? "finding_signature" : "none";
    let sharedEvidenceSymbols: string[] = [];
    if (!previousFinding) {
      const currentSymbols = normalizeEvidenceSymbols(currentEvaluation?.evidence_symbols);
      if (currentSymbols.length) {
        for (const candidate of args.previousFindings) {
          if (matchedPreviousIds.has(String(candidate.id))) continue;
          const candidateEvaluation = previousEvalByFindingId.get(String(candidate.id)) ?? null;
          const overlappingSymbols = overlappingEvidenceSymbols(currentSymbols, candidateEvaluation?.evidence_symbols);
          if (!overlappingSymbols.length) continue;
          previousFinding = candidate;
          matchStrategy = "evidence_symbols";
          sharedEvidenceSymbols = overlappingSymbols;
          symbolMatchedCount += 1;
          break;
        }
      }
    }
    if (!previousFinding) {
      newFindings.push({
        signature,
        finding_id: currentFinding.id,
        title: currentFinding.title,
        category: currentFinding.category,
        current_severity: currentEvaluation?.current_severity ?? currentFinding.severity,
        current_confidence: currentFinding.confidence,
        runtime_validation_status: currentEvaluation?.runtime_validation_status ?? "not_applicable",
        runtime_followup_policy: currentEvaluation?.runtime_followup_policy ?? "not_applicable",
        evidence_symbols: normalizeEvidenceSymbols(currentEvaluation?.evidence_symbols)
      });
      continue;
    }
    matchedPreviousIds.add(String(previousFinding.id));
    const previousEvaluation = previousEvalByFindingId.get(String(previousFinding.id)) ?? null;
    if (!sharedEvidenceSymbols.length && matchStrategy === "evidence_symbols") {
      sharedEvidenceSymbols = overlappingEvidenceSymbols(currentEvaluation?.evidence_symbols, previousEvaluation?.evidence_symbols);
    }
    const fieldPairs = [
      ["severity", previousEvaluation?.current_severity ?? previousFinding.severity, currentEvaluation?.current_severity ?? currentFinding.severity],
      ["confidence", previousFinding.confidence, currentFinding.confidence],
      ["evidence_sufficiency", previousEvaluation?.evidence_sufficiency ?? "unknown", currentEvaluation?.evidence_sufficiency ?? "unknown"],
      ["runtime_validation_status", previousEvaluation?.runtime_validation_status ?? "not_applicable", currentEvaluation?.runtime_validation_status ?? "not_applicable"],
      ["runtime_followup_policy", previousEvaluation?.runtime_followup_policy ?? "not_applicable", currentEvaluation?.runtime_followup_policy ?? "not_applicable"],
      ["runtime_followup_resolution", previousEvaluation?.runtime_followup_resolution ?? "none", currentEvaluation?.runtime_followup_resolution ?? "none"],
      ["next_action", previousEvaluation?.next_action ?? "ready_for_review", currentEvaluation?.next_action ?? "ready_for_review"]
    ];
    const changes = fieldPairs
      .filter(([, previousValue, currentValue]) => String(previousValue) !== String(currentValue))
      .map(([field, previousValue, currentValue]) => ({ field, previous: previousValue, current: currentValue }));
    if (!changes.length) {
      unchangedCount += 1;
      continue;
    }
    changedFindings.push({
      signature,
      match_strategy: matchStrategy,
      shared_evidence_symbols: sharedEvidenceSymbols,
      title: currentFinding.title,
      category: currentFinding.category,
      previous_finding_id: previousFinding.id,
      current_finding_id: currentFinding.id,
      changes
    });
  }

  for (const [signature, previousFinding] of previousBySignature.entries()) {
    if (matchedPreviousIds.has(String(previousFinding.id))) continue;
    const previousEvaluation = previousEvalByFindingId.get(String(previousFinding.id)) ?? null;
    resolvedFindings.push({
      signature,
      finding_id: previousFinding.id,
      title: previousFinding.title,
      category: previousFinding.category,
      previous_severity: previousEvaluation?.current_severity ?? previousFinding.severity,
      previous_confidence: previousFinding.confidence,
      runtime_validation_status: previousEvaluation?.runtime_validation_status ?? "not_applicable",
      runtime_followup_policy: previousEvaluation?.runtime_followup_policy ?? "not_applicable",
      evidence_symbols: normalizeEvidenceSymbols(previousEvaluation?.evidence_symbols)
    });
  }

  return {
    current_run_id: args.currentRunId,
    compare_to_run_id: args.compareToRunId,
    summary: {
      current_finding_count: args.currentFindings.length,
      compare_to_finding_count: args.previousFindings.length,
      new_finding_count: newFindings.length,
      resolved_finding_count: resolvedFindings.length,
      changed_finding_count: changedFindings.length,
      unchanged_finding_count: unchangedCount,
      evidence_symbol_matched_count: symbolMatchedCount,
      current_runtime_followup_required_count: Number(args.currentEvaluations?.runtime_followup_required_count ?? 0),
      compare_to_runtime_followup_required_count: Number(args.previousEvaluations?.runtime_followup_required_count ?? 0),
      current_runtime_validation_blocked_count: Number(args.currentEvaluations?.runtime_validation_blocked_count ?? 0),
      compare_to_runtime_validation_blocked_count: Number(args.previousEvaluations?.runtime_validation_blocked_count ?? 0),
      current_overall_score: args.currentSummary?.overall_score ?? null,
      compare_to_overall_score: args.previousSummary?.overall_score ?? null
    },
    new_findings: newFindings,
    resolved_findings: resolvedFindings,
    changed_findings: changedFindings
  };
}

function buildMarkdownComparisonReport(comparison: Record<string, any>): string {
  const lines: string[] = [];
  lines.push(`# Run Comparison Report`);
  lines.push("");
  lines.push(`- Current Run: ${comparison.current_run_id}`);
  lines.push(`- Compared To: ${comparison.compare_to_run_id}`);
  lines.push(`- New Findings: ${comparison.summary?.new_finding_count ?? 0}`);
  lines.push(`- Resolved Findings: ${comparison.summary?.resolved_finding_count ?? 0}`);
  lines.push(`- Changed Findings: ${comparison.summary?.changed_finding_count ?? 0}`);
  lines.push(`- Unchanged Findings: ${comparison.summary?.unchanged_finding_count ?? 0}`);
  lines.push(`- Current Overall Score: ${comparison.summary?.current_overall_score ?? "n/a"}`);
  lines.push(`- Compared Overall Score: ${comparison.summary?.compare_to_overall_score ?? "n/a"}`);
  lines.push("");
  lines.push(`## New Findings`);
  lines.push("");
  if (!comparison.new_findings?.length) {
    lines.push(`No new findings.`);
  } else {
    for (const item of comparison.new_findings) {
      lines.push(`- ${item.title} (${item.category}) - severity ${item.current_severity}, runtime ${item.runtime_validation_status}`);
    }
  }
  lines.push("");
  lines.push(`## Resolved Findings`);
  lines.push("");
  if (!comparison.resolved_findings?.length) {
    lines.push(`No resolved findings.`);
  } else {
    for (const item of comparison.resolved_findings) {
      lines.push(`- ${item.title} (${item.category}) - previous severity ${item.previous_severity}, runtime ${item.runtime_validation_status}`);
    }
  }
  lines.push("");
  lines.push(`## Changed Findings`);
  lines.push("");
  if (!comparison.changed_findings?.length) {
    lines.push(`No changed findings.`);
  } else {
    for (const item of comparison.changed_findings) {
      const matchDetail = item.match_strategy === "evidence_symbols" && Array.isArray(item.shared_evidence_symbols) && item.shared_evidence_symbols.length
        ? ` matched by evidence identity (${item.shared_evidence_symbols.join(", ")})`
        : "";
      lines.push(`### ${item.title} (${item.category})${matchDetail}`);
      for (const change of item.changes || []) lines.push(`- ${change.field}: ${change.previous} -> ${change.current}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

type ArtifactFormat = "json" | "jsonl" | "text";
type AsyncRunRequestBody = {
  request: AuditRequest;
  start_immediately?: boolean;
  completion_webhook_url?: string;
};

type UiSettingsBody = {
  providers?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  audit_defaults?: Record<string, unknown>;
  preflight?: Record<string, unknown>;
  review?: Record<string, unknown>;
  integrations?: Record<string, unknown>;
  test_mode?: Record<string, unknown>;
};

const LLM_AGENT_ENV_PREFIXES: Record<string, string[]> = {
  planner_agent: ["AUDIT_LLM_PLANNER"],
  threat_model_agent: ["AUDIT_LLM_THREAT_MODEL"],
  eval_selection_agent: ["AUDIT_LLM_EVIDENCE_SELECTION"],
  lane_specialist_agent: ["AUDIT_LLM_AREA_REVIEW"],
  audit_supervisor_agent: ["AUDIT_LLM_SUPERVISOR"],
  remediation_agent: ["AUDIT_LLM_REMEDIATION"]
};
const MASKED_SECRET_PLACEHOLDER = "************";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function stringifyEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

async function writeEnvValues(updates: Record<string, string | null | undefined>): Promise<void> {
  const envPath = path.resolve(process.cwd(), ".env");
  let contents = "";
  try {
    contents = await fs.readFile(envPath, "utf8");
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  const lines = contents ? contents.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) return line;
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    seen.add(key);
    const value = updates[key];
    if (typeof value !== "string" || !value.length || value === MASKED_SECRET_PLACEHOLDER) return line;
    process.env[key] = value;
    return `${key}=${stringifyEnvValue(value)}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    if (typeof value !== "string" || !value.length || value === MASKED_SECRET_PLACEHOLDER) continue;
    process.env[key] = value;
    nextLines.push(`${key}=${stringifyEnvValue(value)}`);
  }
  await fs.writeFile(envPath, `${nextLines.join("\n").replace(/\n*$/, "")}\n`, "utf8");
}

function inferLlmProviderForModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  return listBuiltinLlmProviders().find((provider) => provider.models.some((item) => item.id === model))?.id;
}

function firstAgentEnv(agentId: string, suffix: "PROVIDER" | "MODEL" | "API_KEY"): { variable: string; value: string } | null {
  for (const prefix of LLM_AGENT_ENV_PREFIXES[agentId] || []) {
    const variable = `${prefix}_${suffix}`;
    const value = readEnv(variable);
    if (value) return { variable, value };
  }
  return null;
}

function primaryAgentEnvVar(agentId: string, suffix: "PROVIDER" | "MODEL" | "API_KEY"): string | null {
  const prefix = LLM_AGENT_ENV_PREFIXES[agentId]?.[0];
  return prefix ? `${prefix}_${suffix}` : null;
}

function applyEnvironmentLlmSettings(settings: any): any {
  const currentProviders = settings.providers_json && typeof settings.providers_json === "object"
    ? settings.providers_json as Record<string, any>
    : {};
  const envDefaultModel = readEnv("AUDIT_LLM_MODEL");
  const envDefaultProvider = readEnv("AUDIT_LLM_PROVIDER")
    ?? inferLlmProviderForModel(envDefaultModel)
    ?? (readEnv("AUDIT_LLM_API_KEY") || readEnv("LLM_API_KEY") || readEnv("OPENAI_API_KEY") ? "openai" : undefined);
  const providerCanUseEnv = !currentProviders.default_provider || currentProviders.default_provider === "mock";
  const modelCanUseEnv = !currentProviders.default_model || currentProviders.default_model === "mock-agent-runtime";
  const nextProviders: Record<string, any> = {
    ...currentProviders,
    default_provider: providerCanUseEnv ? (envDefaultProvider || currentProviders.default_provider || "") : currentProviders.default_provider,
    default_model: modelCanUseEnv ? (envDefaultModel || currentProviders.default_model || "") : currentProviders.default_model
  };
  const currentOverrides = currentProviders.agent_overrides && typeof currentProviders.agent_overrides === "object"
    ? currentProviders.agent_overrides as Record<string, any>
    : {};
  const nextOverrides: Record<string, any> = { ...currentOverrides };
  for (const agentId of Object.keys(LLM_AGENT_ENV_PREFIXES)) {
    const currentOverride = currentOverrides[agentId] && typeof currentOverrides[agentId] === "object"
      ? currentOverrides[agentId] as Record<string, any>
      : {};
    const envModel = firstAgentEnv(agentId, "MODEL")?.value;
    const envProvider = firstAgentEnv(agentId, "PROVIDER")?.value ?? inferLlmProviderForModel(envModel);
    if (!envProvider && !envModel) continue;
    nextOverrides[agentId] = {
      ...currentOverride,
      provider: currentOverride.provider || envProvider || "",
      model: currentOverride.model || envModel || ""
    };
  }
  nextProviders.agent_overrides = nextOverrides;
  return {
    ...settings,
    providers_json: nextProviders
  };
}

function describeEnvironmentLlmDefaults(): Record<string, unknown> {
  const defaultModel = readEnv("AUDIT_LLM_MODEL");
  const defaultProvider = readEnv("AUDIT_LLM_PROVIDER") ?? inferLlmProviderForModel(defaultModel);
  const defaultApiKey = readEnv("AUDIT_LLM_API_KEY")
    ? "AUDIT_LLM_API_KEY"
    : readEnv("LLM_API_KEY")
      ? "LLM_API_KEY"
      : readEnv("OPENAI_API_KEY")
        ? "OPENAI_API_KEY"
        : null;
  const agentOverrides: Record<string, unknown> = {};
  for (const agentId of Object.keys(LLM_AGENT_ENV_PREFIXES)) {
    const provider = firstAgentEnv(agentId, "PROVIDER");
    const model = firstAgentEnv(agentId, "MODEL");
    const apiKey = firstAgentEnv(agentId, "API_KEY");
    if (!provider && !model && !apiKey) continue;
    agentOverrides[agentId] = {
      provider: provider?.value ?? inferLlmProviderForModel(model?.value),
      provider_env_var: provider?.variable ?? null,
      model: model?.value ?? null,
      model_env_var: model?.variable ?? null,
      api_key_configured: Boolean(apiKey),
      api_key_env_var: apiKey?.variable ?? null,
      api_key_value: null
    };
  }
  return {
    default_provider: defaultProvider ?? null,
    default_provider_env_var: defaultProvider ? (readEnv("AUDIT_LLM_PROVIDER") ? "AUDIT_LLM_PROVIDER" : null) : null,
    default_model: defaultModel ?? null,
    default_model_env_var: defaultModel ? "AUDIT_LLM_MODEL" : null,
    default_api_key_configured: Boolean(defaultApiKey),
    default_api_key_env_var: defaultApiKey,
    default_api_key_value: null,
    agent_overrides: agentOverrides
  };
}

function isLocalOAuthConnectEnabled(): boolean {
  const mode = getAuthMode();
  return mode === "none" || process.env.HARNESS_ENABLE_LOCAL_OAUTH_CONNECT === "1";
}

interface CodexCommandResolution {
  command: string;
  argsPrefix: string[];
  displayCommand: string;
  note?: string;
}

function resolveCodexCommand(configuredCommand: string): CodexCommandResolution {
  const command = configuredCommand.trim() || "codex";
  if (process.platform !== "win32" || command.toLowerCase() !== "codex") {
    return { command, argsPrefix: [], displayCommand: command };
  }
  const probe = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: true,
    windowsHide: true,
    timeout: 10000
  });
  const combinedOutput = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`.toLowerCase();
  if (probe.status === 0 && !combinedOutput.includes("access is denied")) {
    return { command, argsPrefix: [], displayCommand: command };
  }
  return {
    command: "npx",
    argsPrefix: ["-y", "@openai/codex"],
    displayCommand: "npx -y @openai/codex",
    note: "The Windows Store Codex command was not executable from Tethermark, so the npm Codex CLI fallback was used."
  };
}

function buildCodexArgs(resolution: CodexCommandResolution, args: string[]): string[] {
  return [...resolution.argsPrefix, ...args];
}

async function launchOpenAICodexLogin(context: RequestContext): Promise<Record<string, unknown>> {
  if (!isLocalOAuthConnectEnabled()) {
    throw new Error("Local OAuth connect is disabled. Set HARNESS_ENABLE_LOCAL_OAUTH_CONNECT=1 to allow the API server to launch local provider login commands.");
  }
  const settingsResolution = await resolvePersistedUiSettings(undefined, context);
  const credentials = settingsResolution.effective.credentials_json as Record<string, unknown>;
  const configuredCommand = typeof credentials.codex_command === "string" && credentials.codex_command.trim()
    ? credentials.codex_command.trim()
    : readEnv("AUDIT_LLM_CODEX_COMMAND") ?? readEnv("CODEX_COMMAND") ?? "codex";
  const resolvedCommand = resolveCodexCommand(configuredCommand);
  let child;
  try {
    if (process.platform === "win32") {
      const visibleCommand = [resolvedCommand.command, ...buildCodexArgs(resolvedCommand, ["login"])].map((part) => part.includes(" ") ? `"${part}"` : part).join(" ");
      child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "Tethermark Codex Login", "cmd.exe", "/k", visibleCommand], {
        detached: true,
        stdio: "ignore",
        windowsHide: false
      });
    } else {
      child = spawn(resolvedCommand.command, buildCodexArgs(resolvedCommand, ["login"]), {
        detached: true,
        stdio: "ignore"
      });
    }
  } catch (error) {
    throw new Error(`Codex could not be opened: ${error instanceof Error ? error.message : String(error)}. Install Codex, then try Connect ChatGPT account again.`);
  }
  child.on("error", () => {
    // Detached login failures are surfaced by the explicit status check.
  });
  child.unref();
  return {
    provider_id: "openai_codex",
    command: resolvedCommand.displayCommand,
    status: "started",
    checked_at: new Date().toISOString(),
    note: resolvedCommand.note
      ? `${resolvedCommand.note} Complete the browser prompt, then return here and check the connection.`
      : "Opening ChatGPT sign-in for Codex. Complete the browser prompt, then return here and check the connection."
  };
}

async function getOpenAICodexLoginStatus(context: RequestContext): Promise<Record<string, unknown>> {
  const settingsResolution = await resolvePersistedUiSettings(undefined, context);
  const credentials = settingsResolution.effective.credentials_json as Record<string, unknown>;
  const configuredCommand = typeof credentials.codex_command === "string" && credentials.codex_command.trim()
    ? credentials.codex_command.trim()
    : readEnv("AUDIT_LLM_CODEX_COMMAND") ?? readEnv("CODEX_COMMAND") ?? "codex";
  const resolvedCommand = resolveCodexCommand(configuredCommand);
  return await new Promise((resolve) => {
    let output = "";
    let settled = false;
    const finish = (payload: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      resolve({
        provider_id: "openai_codex",
        command: resolvedCommand.displayCommand,
        checked_at: new Date().toISOString(),
        ...payload
      });
    };
    let child;
    try {
      child = spawn(resolvedCommand.command, buildCodexArgs(resolvedCommand, ["login", "status"]), {
        shell: process.platform === "win32",
        windowsHide: true
      });
    } catch (error) {
      finish({
        connected: false,
        status: "missing",
        note: `Codex could not be started: ${error instanceof Error ? error.message : String(error)}`
      });
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      finish({
        connected: false,
        status: "timeout",
        note: "Could not check Codex sign-in status before the request timed out."
      });
    }, 10000);
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        connected: false,
        status: "missing",
        note: `Codex CLI could not be started: ${error.message}`
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const normalized = output.toLowerCase();
      const connected = code === 0 && (normalized.includes("authenticated") || normalized.includes("chatgpt oauth") || normalized.includes("logged in") || normalized.includes("yes"));
      finish({
        connected,
        status: connected ? "connected" : "not_connected",
        note: connected
          ? (resolvedCommand.note ? `Codex is signed in on this machine. ${resolvedCommand.note}` : "Codex is signed in on this machine.")
          : (resolvedCommand.note ? `${resolvedCommand.note} Choose Connect ChatGPT account and finish the browser prompt.` : "Codex is not signed in yet. Choose Connect ChatGPT account and finish the browser prompt."),
        detail: output.trim().slice(0, 500)
      });
    });
  });
}

async function persistLlmEnvironmentSettings(input: UiSettingsBody): Promise<void> {
  const updates: Record<string, string | null | undefined> = {};
  const providers = input.providers && typeof input.providers === "object" ? input.providers as Record<string, any> : {};
  const credentials = input.credentials && typeof input.credentials === "object" ? input.credentials as Record<string, any> : {};
  if (typeof providers.default_provider === "string" && providers.default_provider) updates.AUDIT_LLM_PROVIDER = providers.default_provider;
  if (typeof providers.default_model === "string" && providers.default_model) updates.AUDIT_LLM_MODEL = providers.default_model;
  if (typeof credentials.openai_api_key === "string" && credentials.openai_api_key && credentials.openai_api_key !== MASKED_SECRET_PLACEHOLDER) {
    updates.AUDIT_LLM_API_KEY = credentials.openai_api_key;
  }
  if (typeof credentials.codex_command === "string" && credentials.codex_command) {
    updates.AUDIT_LLM_CODEX_COMMAND = credentials.codex_command;
  }
  const overrides = providers.agent_overrides && typeof providers.agent_overrides === "object"
    ? providers.agent_overrides as Record<string, any>
    : {};
  for (const [agentId, override] of Object.entries(overrides)) {
    if (!override || typeof override !== "object") continue;
    const providerEnvVar = primaryAgentEnvVar(agentId, "PROVIDER");
    const modelEnvVar = primaryAgentEnvVar(agentId, "MODEL");
    const apiKeyEnvVar = primaryAgentEnvVar(agentId, "API_KEY");
    if (providerEnvVar && typeof override.provider === "string" && override.provider) updates[providerEnvVar] = override.provider;
    if (modelEnvVar && typeof override.model === "string" && override.model) updates[modelEnvVar] = override.model;
    if (apiKeyEnvVar && typeof override.api_key === "string" && override.api_key && override.api_key !== MASKED_SECRET_PLACEHOLDER) {
      updates[apiKeyEnvVar] = override.api_key;
    }
  }
  if (Object.keys(updates).length) await writeEnvValues(updates);
}

function stripLlmSecretsFromSettingsInput(input: UiSettingsBody): UiSettingsBody {
  const credentials = input.credentials && typeof input.credentials === "object"
    ? { ...(input.credentials as Record<string, unknown>) }
    : input.credentials;
  if (credentials && typeof credentials === "object") delete (credentials as Record<string, unknown>).openai_api_key;
  const providers = input.providers && typeof input.providers === "object"
    ? { ...(input.providers as Record<string, any>) }
    : input.providers;
  if (providers && typeof providers === "object" && providers.agent_overrides && typeof providers.agent_overrides === "object") {
    const nextOverrides: Record<string, unknown> = {};
    for (const [agentId, override] of Object.entries(providers.agent_overrides as Record<string, any>)) {
      if (!override || typeof override !== "object") {
        nextOverrides[agentId] = override;
        continue;
      }
      const { api_key: _apiKey, ...rest } = override;
      nextOverrides[agentId] = rest;
    }
    providers.agent_overrides = nextOverrides;
  }
  return {
    ...input,
    providers,
    credentials
  };
}

type ProjectBody = {
  id?: string;
  name: string;
  description?: string | null;
  target_defaults?: Record<string, unknown>;
};

type UiDocumentBody = {
  title: string;
  document_type: "policy" | "reference" | "runbook" | "checklist";
  filename?: string | null;
  media_type?: string | null;
  content_text: string;
  notes?: string | null;
  tags?: string[];
};

type FindingDispositionBody = {
  disposition_type: "suppression" | "waiver";
  scope_level?: "run" | "project";
  finding_id: string;
  reason: string;
  notes?: string | null;
  expires_at?: string | null;
  owner_id?: string | null;
  reviewed_at?: string | null;
  review_due_by?: string | null;
};

type FindingDispositionUpdateBody = {
  reason?: string;
  notes?: string | null;
  expires_at?: string | null;
  owner_id?: string | null;
  reviewed_at?: string | null;
  review_due_by?: string | null;
};

type ArtifactRetentionBody = {
  root?: string;
  kind?: ArtifactRetentionKind;
  older_than_days?: number | null;
  retention_days?: number | null;
  max_gb?: number | null;
  max_bytes?: number | null;
};

type RequestContext = {
  workspaceId: string;
  projectId: string;
  actorId: string;
  roles: ReviewActorRole[];
};

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readJson<T = AuditRequest>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return (chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}) as T;
}

function readHeader(req: http.IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function getAuthMode(): string {
  return (process.env.HARNESS_API_AUTH_MODE ?? "none").trim().toLowerCase();
}

function getExpectedApiKey(): string {
  return process.env.HARNESS_API_KEY ?? "";
}

function buildAuthInfo() {
  const authMode = getAuthMode();
  const identityEnforced = authMode !== "none";
  return {
    auth_mode: authMode,
    identity_enforced: identityEnforced,
    trusted_mode: !identityEnforced,
    review_roles_security: identityEnforced ? "enforced" : "advisory",
    guidance: identityEnforced
      ? "API requests require configured authentication. Review roles and assignments are enforced against the authenticated actor."
      : "No authentication is enforced. Review ownership is suitable only for trusted internal deployments and local operator use."
  };
}

async function authenticateRequest(req: http.IncomingMessage): Promise<{ ok: true; context: RequestContext } | { ok: false; status: number; error: string }> {
  const authMode = getAuthMode();
  const expectedApiKey = getExpectedApiKey();
  const providedApiKey = readHeader(req, "x-api-key");
  const workspaceId = "default";
  const projectId = normalizeProjectId(readHeader(req, "x-harness-project"));
  const actorId = normalizeActorId(readHeader(req, "x-harness-actor"));
  const finalizeContext = async (): Promise<RequestContext> => {
    return {
      workspaceId,
      projectId,
      actorId,
      roles: ["admin"]
    };
  };
  if (authMode === "api_key") {
    if (!providedApiKey) {
      return { ok: false, status: 401, error: "unauthorized" };
    }
    if (expectedApiKey && providedApiKey === expectedApiKey) {
      return {
        ok: true,
        context: await finalizeContext()
      };
    }
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (authMode !== "none" && authMode !== "api_key") {
      return { ok: false, status: 500, error: "api_key_auth_not_configured" };
  }
  return {
    ok: true,
    context: await finalizeContext()
  };
}

function applyRequestContextToAuditRequest(request: AuditRequest, context: RequestContext): AuditRequest {
  return {
    ...request,
    workspace_id: context.workspaceId,
    project_id: context.projectId,
    requested_by: context.actorId
  };
}

function runMatchesScope(run: Pick<PersistedRunListItem, "workspace_id" | "project_id"> | null | undefined, context: RequestContext): boolean {
  return !!run && normalizeWorkspaceId(run.workspace_id) === context.workspaceId && normalizeProjectId(run.project_id) === context.projectId;
}

async function attachProjectRunStats(projects: PersistedProjectRecord[], workspaceId: string): Promise<Array<PersistedProjectRecord & {
  run_stats: {
    runs: number;
    open_reviews: number;
    average_score: number | null;
    last_run_at: string | null;
  };
}>> {
  const runs = await listPersistedRuns({ workspaceId, limit: Number.MAX_SAFE_INTEGER });
  const statsByProject = new Map<string, { runs: number; openReviews: number; scoreTotal: number; scoreCount: number; lastRunAt: string | null }>();
  for (const run of runs) {
    const projectId = normalizeProjectId(run.project_id);
    const stats = statsByProject.get(projectId) ?? { runs: 0, openReviews: 0, scoreTotal: 0, scoreCount: 0, lastRunAt: null };
    stats.runs += 1;
    if (!stats.lastRunAt || run.created_at > stats.lastRunAt) stats.lastRunAt = run.created_at;
    if (["review_required", "in_review", "requires_rerun"].includes(run.review_workflow?.status || "")) stats.openReviews += 1;
    const score = Number(run.overall_score);
    if (Number.isFinite(score)) {
      stats.scoreTotal += score;
      stats.scoreCount += 1;
    }
    statsByProject.set(projectId, stats);
  }
  return projects.map((project) => {
    const stats = statsByProject.get(normalizeProjectId(project.id));
    return {
      ...project,
      run_stats: {
        runs: stats?.runs ?? 0,
        open_reviews: stats?.openReviews ?? 0,
        average_score: stats && stats.scoreCount ? stats.scoreTotal / stats.scoreCount : null,
        last_run_at: stats?.lastRunAt ?? null
      }
    };
  });
}

function buildScopedTargetList(runs: PersistedRunListItem[]): PersistedTargetListItem[] {
  const grouped = new Map<string, PersistedRunListItem[]>();
  for (const run of runs) {
    const bucket = grouped.get(run.canonical_target_id ?? run.target_id) ?? [];
    bucket.push(run);
    grouped.set(run.canonical_target_id ?? run.target_id, bucket);
  }
  return [...grouped.entries()].map(([canonicalTargetId, groupRuns]) => {
    const latestRun = [...groupRuns].sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;
    const latestSnapshot = latestRun?.target_snapshot ?? null;
    const latestTarget = latestRun?.target ?? null;
    const summary = latestRun?.target_summary ?? null;
    return {
      id: canonicalTargetId,
      target_type: latestTarget?.target_type ?? summary?.target_type ?? "path",
      canonical_name: summary?.canonical_name ?? latestTarget?.canonical_name ?? latestSnapshot?.snapshot_value ?? canonicalTargetId,
      repo_url: summary?.repo_url ?? latestTarget?.repo_url ?? null,
      local_path: summary?.local_path ?? (latestTarget?.target_type === "path" ? latestSnapshot?.snapshot_value ?? latestTarget?.local_path ?? null : latestTarget?.local_path ?? null),
      endpoint_url: summary?.endpoint_url ?? latestTarget?.endpoint_url ?? null,
      created_at: groupRuns.reduce((earliest, item) => item.created_at < earliest ? item.created_at : earliest, latestRun?.created_at ?? new Date().toISOString()),
      latest_run: latestRun ? { ...latestRun, target_id: canonicalTargetId } : null,
      latest_snapshot: latestSnapshot ? { ...latestSnapshot, target_id: canonicalTargetId } : null,
      summary
    };
  }).sort((left, right) => (right.latest_run?.created_at ?? right.created_at).localeCompare(left.latest_run?.created_at ?? left.created_at));
}

function buildScopedTargetStats(targets: PersistedTargetListItem[]) {
  const countBy = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };
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
    by_target_type: countBy(targets.map((item) => item.target_type)).map((item) => ({ target_type: item.key, count: item.count })),
    by_latest_target_class: countBy(targets.map((item) => item.summary?.latest_target_class ?? "unknown")).map((item) => ({ target_class: item.key, count: item.count })),
    by_latest_rating: countBy(targets.map((item) => item.summary?.latest_rating ?? item.latest_run?.rating ?? "unknown")).map((item) => ({ rating: item.key, count: item.count })),
    by_latest_publishability_status: countBy(targets.map((item) => item.summary?.latest_publishability_status ?? "unknown")).map((item) => ({ publishability_status: item.key, count: item.count }))
  };
}

function matchRunSubresource(url: URL): { runId: string; resource: RunSubresource } | null {
  const match = url.pathname.match(/^\/runs\/([^/]+)\/(observability|observations|events|metrics|observability-summary|maintenance|lane-plans|lane-results|lane-specialists|lane-reuse-decisions|evidence-records|findings|control-results|tool-executions|tool-adapters|agent-invocations|artifact-index|score-summary|dimension-scores|usage-summary|review-decision|review-workflow|review-actions|review-comments|review-summary|runtime-followups|exports|finding-dispositions|finding-evaluations|webhook-deliveries|report-markdown|report-sarif|report-executive|report-compare|sandbox-execution|review-audit|outbound-preview|outbound-approval|outbound-send|outbound-verification|outbound-delivery|supervisor-review|remediation|summary|preflight|launch-intent|commit-diff|persistence|stage-executions|publishability|policy-application|resolved-config|correction-plan|correction-result)$/);
  if (!match) return null;
  return { runId: match[1] ?? "", resource: match[2] as RunSubresource };
}

function matchRunReviewActions(url: URL): { runId: string } | null {
  const match = url.pathname.match(/^\/runs\/([^/]+)\/review-actions$/);
  if (!match) return null;
  return { runId: decodeURIComponent(match[1] ?? "") };
}

function matchRunFindingDispositions(url: URL): { runId: string } | null {
  const match = url.pathname.match(/^\/runs\/([^/]+)\/finding-dispositions$/);
  if (!match) return null;
  return { runId: decodeURIComponent(match[1] ?? "") };
}

function matchRunFindingDispositionItem(url: URL): { runId: string; dispositionId: string; action: "update" | "revoke" } | null {
  const match = url.pathname.match(/^\/runs\/([^/]+)\/finding-dispositions\/([^/]+?)(?:\/(revoke))?$/);
  if (!match) return null;
  return {
    runId: decodeURIComponent(match[1] ?? ""),
    dispositionId: decodeURIComponent(match[2] ?? ""),
    action: match[3] === "revoke" ? "revoke" : "update"
  };
}

function matchReviewNotification(url: URL): { notificationId: string } | null {
  const match = url.pathname.match(/^\/review-notifications\/([^/]+)\/ack$/);
  if (!match) return null;
  return { notificationId: decodeURIComponent(match[1] ?? "") };
}

function matchRunReconstruct(url: URL): { runId: string } | null {
  const match = url.pathname.match(/^\/runs\/([^/]+)\/reconstruct$/);
  if (!match) return null;
  return { runId: decodeURIComponent(match[1] ?? "") };
}

function matchRunArtifacts(url: URL): { runId: string } | null {
  const match = url.pathname.match(/^\/artifacts\/runs\/([^/]+)$/);
  if (!match) return null;
  return { runId: decodeURIComponent(match[1] ?? "") };
}

function matchAsyncRun(url: URL): { runId: string } | null {
  const match = url.pathname.match(/^\/runs\/async\/([^/]+)$/);
  if (!match) return null;
  return { runId: decodeURIComponent(match[1] ?? "") };
}

function matchAsyncRunAction(url: URL): { runId: string; action: "cancel" | "retry" } | null {
  const match = url.pathname.match(/^\/runs\/async\/([^/]+)\/(cancel|retry)$/);
  if (!match) return null;
  return {
    runId: decodeURIComponent(match[1] ?? ""),
    action: (match[2] ?? "") as "cancel" | "retry"
  };
}

function matchRuntimeFollowupAction(url: URL): { followupId: string; action: "launch" } | null {
  const match = url.pathname.match(/^\/runtime-followups\/([^/]+)\/(launch)$/);
  if (!match) return null;
  return {
    followupId: decodeURIComponent(match[1] ?? ""),
    action: "launch"
  };
}

function matchRuntimeFollowupReport(url: URL): { followupId: string } | null {
  const match = url.pathname.match(/^\/runtime-followups\/([^/]+)\/report$/);
  if (!match) return null;
  return { followupId: decodeURIComponent(match[1] ?? "") };
}

function matchRunArtifact(url: URL): { runId: string; artifactType: string } | null {
  const match = url.pathname.match(/^\/artifacts\/runs\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return {
    runId: decodeURIComponent(match[1] ?? ""),
    artifactType: decodeURIComponent(match[2] ?? "")
  };
}

function matchUiDocument(url: URL): { documentId: string } | null {
  const match = url.pathname.match(/^\/ui\/documents\/([^/]+)$/);
  if (!match) return null;
  return { documentId: decodeURIComponent(match[1] ?? "") };
}

function matchUiProject(url: URL): { projectId: string } | null {
  const match = url.pathname.match(/^\/ui\/projects\/([^/]+)$/);
  if (!match) return null;
  return { projectId: decodeURIComponent(match[1] ?? "") };
}

function matchUiProjectRuns(url: URL): { projectId: string } | null {
  const match = url.pathname.match(/^\/ui\/projects\/([^/]+)\/runs$/);
  if (!match) return null;
  return { projectId: decodeURIComponent(match[1] ?? "") };
}

function matchRunsReconstruct(url: URL): boolean {
  return url.pathname === "/runs/reconstruct";
}

function matchTarget(url: URL): { targetId: string } | null {
  const match = url.pathname.match(/^\/targets\/([^/]+)$/);
  if (!match) return null;
  return { targetId: decodeURIComponent(match[1] ?? "") };
}

function matchTargetRuns(url: URL): { targetId: string } | null {
  const match = url.pathname.match(/^\/targets\/([^/]+)\/runs$/);
  if (!match) return null;
  return { targetId: decodeURIComponent(match[1] ?? "") };
}

function matchTargetHistory(url: URL): { targetId: string } | null {
  const match = url.pathname.match(/^\/targets\/([^/]+)\/history$/);
  if (!match) return null;
  return { targetId: decodeURIComponent(match[1] ?? "") };
}

function matchTargetSummary(url: URL): { targetId: string } | null {
  const match = url.pathname.match(/^\/targets\/([^/]+)\/summary$/);
  if (!match) return null;
  return { targetId: decodeURIComponent(match[1] ?? "") };
}

function matchTargetLaneSpecialists(url: URL): { targetId: string } | null {
  const match = url.pathname.match(/^\/targets\/([^/]+)\/lane-specialists$/);
  if (!match) return null;
  return { targetId: decodeURIComponent(match[1] ?? "") };
}

function matchTargetToolAdapters(url: URL): { targetId: string } | null {
  const match = url.pathname.match(/^\/targets\/([^/]+)\/tool-adapters$/);
  if (!match) return null;
  return { targetId: decodeURIComponent(match[1] ?? "") };
}

function readNumberParam(url: URL, name: string): number | undefined {
  const value = url.searchParams.get(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readBooleanParam(url: URL, name: string): boolean | undefined {
  const value = url.searchParams.get(name);
  if (value === null) return undefined;
  if (/^(1|true|yes)$/i.test(value)) return true;
  if (/^(0|false|no)$/i.test(value)) return false;
  return undefined;
}

function normalizeArtifactRetentionKind(value: unknown): ArtifactRetentionKind | undefined {
  return value === "runs" || value === "sandboxes" || value === "all" ? value : undefined;
}

function resolveArtifactRetentionRequest(body: ArtifactRetentionBody) {
  const maxGb = typeof body.max_gb === "number" && Number.isFinite(body.max_gb) && body.max_gb > 0 ? body.max_gb : null;
  const maxBytes = typeof body.max_bytes === "number" && Number.isFinite(body.max_bytes) && body.max_bytes > 0
    ? Math.floor(body.max_bytes)
    : maxGb
      ? Math.floor(maxGb * 1024 * 1024 * 1024)
      : null;
  const olderThanDays = typeof body.older_than_days === "number" && Number.isFinite(body.older_than_days) && body.older_than_days > 0
    ? body.older_than_days
    : typeof body.retention_days === "number" && Number.isFinite(body.retention_days) && body.retention_days > 0
      ? body.retention_days
      : null;
  return {
    rootDir: typeof body.root === "string" && body.root.trim() ? body.root.trim() : undefined,
    kind: normalizeArtifactRetentionKind(body.kind),
    olderThanDays,
    maxBytes
  };
}

function resolveArtifactFormat(filePath: string): ArtifactFormat {
  if (/\.json$/i.test(filePath)) return "json";
  if (/\.jsonl$/i.test(filePath)) return "jsonl";
  return "text";
}

function isArtifactPathWithinRoot(artifactPath: string, artifactRoot: string): boolean {
  const resolvedArtifactPath = path.resolve(artifactPath);
  const resolvedArtifactRoot = path.resolve(artifactRoot);
  const relative = path.relative(resolvedArtifactRoot, resolvedArtifactPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readArtifactPayload(filePath: string): Promise<{ format: ArtifactFormat; payload: unknown }> {
  const format = resolveArtifactFormat(filePath);
  const raw = await fs.readFile(filePath, "utf8");
  if (format === "json") {
    return { format, payload: JSON.parse(raw) };
  }
  if (format === "jsonl") {
    return {
      format,
      payload: raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    };
  }
  return { format, payload: raw };
}

async function buildRunSummary(runId: string): Promise<Record<string, unknown>> {
  const [run, scoreSummary, reviewDecision, reviewWorkflow, findings, controlResults, evidenceRecords, toolExecutions, stageExecutions, laneSpecialists, sandboxExecution, findingDispositions, runtimeFollowups] = await Promise.all([
    getPersistedRun(runId),
    readPersistedScoreSummary(runId),
    readPersistedReviewDecision(runId),
    readPersistedReviewWorkflow(runId),
    readPersistedFindings(runId),
    readPersistedControlResults(runId),
    readPersistedEvidenceRecords(runId),
    readPersistedToolExecutions(runId),
    readPersistedStageExecutions(runId),
    readPersistedLaneSpecialistOutputs(runId),
    readPersistedStageArtifact(runId, "sandbox-execution"),
    readPersistedFindingDispositions(runId),
    listPersistedRuntimeFollowups({ runId })
  ]);
  if (!run) {
    throw new Error("run_not_found");
  }
  const findingEvaluation = buildFindingEvaluationSummary({
    workflow: reviewWorkflow,
    findings,
    actions: [],
    comments: [],
    dispositions: findingDispositions,
    supervisorReview: null,
    sandboxExecution: sandboxExecution as any,
    evidenceRecords,
    runtimeFollowups
  });
  return {
    run_id: run.id,
    target_id: run.target_id,
    created_at: run.created_at,
    status: run.status,
    audit_package: run.audit_package,
    run_mode: run.run_mode,
    rating: run.rating,
    overall_score: scoreSummary?.overall_score ?? run.overall_score,
    static_score: run.static_score,
    publishability_status: reviewDecision?.publishability_status ?? null,
    human_review_required: reviewDecision?.human_review_required ?? null,
    review_workflow_status: reviewWorkflow?.status ?? null,
    current_reviewer_id: reviewWorkflow?.current_reviewer_id ?? null,
    finding_count: findings.length,
    control_result_count: controlResults.length,
    tool_execution_count: toolExecutions.length,
    completed_tool_count: toolExecutions.filter((item) => item.status === "completed").length,
    blocked_tool_count: toolExecutions.filter((item) => item.status === "skipped").length,
    lane_specialist_count: laneSpecialists.length,
    stage_execution_count: stageExecutions.length,
    suppressed_finding_count: findingEvaluation.suppressed_finding_count,
    waived_finding_count: findingEvaluation.waived_finding_count,
    expired_disposition_count: findingEvaluation.expired_disposition_count,
    due_soon_disposition_count: findingEvaluation.evaluations.filter((item) => item.active_disposition_due_soon).length,
    reopened_disposition_count: findingEvaluation.reopened_disposition_count,
    findings_needing_disposition_review_count: findingEvaluation.findings_needing_disposition_review_count,
    runtime_validation_validated_count: findingEvaluation.runtime_validation_validated_count,
    runtime_validation_blocked_count: findingEvaluation.runtime_validation_blocked_count,
    runtime_validation_failed_count: findingEvaluation.runtime_validation_failed_count,
    runtime_validation_recommended_count: findingEvaluation.runtime_validation_recommended_count,
    runtime_followup_required_count: findingEvaluation.runtime_followup_required_count,
    runtime_followup_resolved_count: findingEvaluation.runtime_followup_resolved_count,
    runtime_followup_rerun_requested_count: findingEvaluation.runtime_followup_rerun_requested_count,
    runtime_followup_completed_count: findingEvaluation.runtime_followup_completed_count,
    sandbox_execution: findingEvaluation.sandbox_execution,
    sandbox_execution_attention_required: findingEvaluation.sandbox_execution?.attention_required ?? false
  };
}

async function attachReviewQueueDispositionCounts(runs: PersistedRunListItem[]): Promise<Array<PersistedRunListItem & {
  review_summary_counts?: {
    expired_disposition_count: number;
    due_soon_disposition_count: number;
    reopened_disposition_count: number;
    findings_needing_disposition_review_count: number;
    runtime_validation_blocked_count: number;
    runtime_validation_failed_count: number;
    runtime_validation_recommended_count: number;
    runtime_followup_required_count: number;
    runtime_followup_resolved_count: number;
    runtime_followup_rerun_requested_count: number;
    runtime_followup_completed_count: number;
    next_disposition_expiry_at: string | null;
    next_disposition_review_due_at: string | null;
  };
}>> {
  return Promise.all(runs.map(async (run) => {
    const workflowStatus = run.review_workflow?.status ?? "";
    if (!["review_required", "in_review", "requires_rerun", "approved", "rejected"].includes(workflowStatus)) {
      return run;
    }
    const [findings, actions, comments, dispositions, workflow, sandboxExecution, evidenceRecords, runtimeFollowups] = await Promise.all([
      readPersistedFindings(run.id),
      readPersistedReviewActions(run.id),
      readPersistedReviewComments(run.id),
      readPersistedFindingDispositions(run.id),
      readPersistedReviewWorkflow(run.id),
      readPersistedStageArtifact(run.id, "sandbox-execution"),
      readPersistedEvidenceRecords(run.id),
      listPersistedRuntimeFollowups({ runId: run.id })
    ]);
    const reviewSummary = buildReviewSummary({ workflow, findings, actions, comments, dispositions });
    const findingEvaluation = buildFindingEvaluationSummary({
      workflow,
      findings,
      actions,
      comments,
      dispositions,
      supervisorReview: null,
      sandboxExecution: sandboxExecution as any,
      evidenceRecords,
      runtimeFollowups
    });
    return {
      ...run,
      review_summary_counts: {
        expired_disposition_count: reviewSummary.expired_disposition_count,
        due_soon_disposition_count: reviewSummary.due_soon_disposition_count,
        reopened_disposition_count: reviewSummary.reopened_disposition_count,
        findings_needing_disposition_review_count: reviewSummary.findings_needing_disposition_review_count,
        runtime_validation_blocked_count: findingEvaluation.runtime_validation_blocked_count,
        runtime_validation_failed_count: findingEvaluation.runtime_validation_failed_count,
        runtime_validation_recommended_count: findingEvaluation.runtime_validation_recommended_count,
        runtime_followup_required_count: findingEvaluation.runtime_followup_required_count,
        runtime_followup_resolved_count: findingEvaluation.runtime_followup_resolved_count,
        runtime_followup_rerun_requested_count: findingEvaluation.runtime_followup_rerun_requested_count,
        runtime_followup_completed_count: findingEvaluation.runtime_followup_completed_count,
        next_disposition_expiry_at: reviewSummary.handoff.next_disposition_expiry_at,
        next_disposition_review_due_at: reviewSummary.handoff.next_disposition_review_due_at
      }
    };
  }));
}

async function buildOutboundPreviewForRun(run: PersistedRunListItem): Promise<Record<string, unknown>> {
  const [summary, findings, workflow, actions, comments, dispositions, settingsResolution, approval, verification] = await Promise.all([
    buildRunSummary(run.id),
    readPersistedFindings(run.id),
    readPersistedReviewWorkflow(run.id),
    readPersistedReviewActions(run.id),
    readPersistedReviewComments(run.id),
    readPersistedFindingDispositions(run.id),
    resolvePersistedUiSettings(undefined, { workspaceId: run.workspace_id, projectId: run.project_id }),
    readPersistedStageArtifact<OutboundApprovalArtifact>(run.id, "outbound-approval"),
    readPersistedStageArtifact<OutboundVerificationArtifact>(run.id, "outbound-verification")
  ]);
  return buildGithubOutboundPreview({
    run,
    summary,
    findings,
    reviewWorkflow: workflow,
    reviewSummary: buildReviewSummary({ workflow, findings, actions, comments, dispositions }),
    policy: normalizeGithubIntegrationPolicy(settingsResolution.effective.integrations_json as Record<string, unknown>),
    executionConfig: normalizeGithubExecutionConfig(settingsResolution.effective.credentials_json as Record<string, unknown>),
    approval: approval ? { approved_by: approval.approved_by, approved_at: approval.approved_at } : null,
    verification: verification ?? null
  });
}

async function emitConfiguredWebhookForRun(
  runId: string,
  eventType: GenericWebhookEventType,
  triggeredBy: string | null,
  data: Record<string, unknown>,
  rootDirOrOptions?: unknown
): Promise<void> {
  const run = await getPersistedRun(runId);
  if (!run) return;
  const [summary, settingsResolution, reviewWorkflow, reviewDecision] = await Promise.all([
    buildRunSummary(runId),
    resolvePersistedUiSettings(rootDirOrOptions as any, { workspaceId: run.workspace_id, projectId: run.project_id }),
    readPersistedReviewWorkflow(runId, rootDirOrOptions as any),
    readPersistedReviewDecision(runId, rootDirOrOptions as any)
  ]);
  const config = normalizeGenericWebhookConfig(settingsResolution.effective.integrations_json as Record<string, unknown>);
  await emitGenericWebhookEvent({
    config,
    run,
    eventType,
    summary,
    triggeredBy,
    rootDirOrOptions: rootDirOrOptions as any,
    data: {
      review_workflow_status: reviewWorkflow?.status ?? null,
      publishability_status: reviewDecision?.publishability_status ?? null,
      ...data
    }
  });
  if (eventType === "run_completed" && reviewWorkflow?.status === "review_required") {
    await emitGenericWebhookEvent({
      config,
      run,
      eventType: "review_required",
      summary,
      triggeredBy,
      rootDirOrOptions: rootDirOrOptions as any,
      data: {
        review_workflow_status: reviewWorkflow.status,
        publishability_status: reviewDecision?.publishability_status ?? null,
        trigger: "run_completed"
      }
    });
  }
}

export function createApiServer(): http.Server {
  void asyncJobs.recoverJobs();
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", service: "tethermark-api", language: "TypeScript/Node", ...buildAuthInfo() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/info") {
    sendJson(res, 200, buildAuthInfo());
    return;
  }

  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }
  const context = auth.context;

  if (req.method === "GET" && url.pathname === "/ui/settings") {
    const scopeLevel = (url.searchParams.get("scope_level") as "global" | "workspace" | "project" | "effective" | null) ?? "effective";
    if (scopeLevel === "workspace") {
      sendJson(res, 404, { error: "hosted_only", feature: "workspace_settings" });
      return;
    }
    if (scopeLevel === "effective") {
      const resolution = await resolvePersistedUiSettings(undefined, context);
      sendJson(res, 200, {
        settings: resolution.effective,
        layers: resolution.layers
      });
      return;
    }
    const settings = await readPersistedUiSettingsLayer(scopeLevel, undefined, context);
    sendJson(res, 200, { settings: scopeLevel === "global" ? applyEnvironmentLlmSettings(settings) : settings });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/ui/settings") {
    try {
      const body = await readJson<UiSettingsBody>(req);
      const scopeLevel = (url.searchParams.get("scope_level") as "global" | "workspace" | "project" | null) ?? "project";
      if (scopeLevel === "workspace") {
        sendJson(res, 404, { error: "hosted_only", feature: "workspace_settings" });
        return;
      }
      await persistLlmEnvironmentSettings(body);
      const settings = await updatePersistedUiSettings(stripLlmSecretsFromSettingsInput(body), undefined, { ...context, scopeLevel });
      sendJson(res, 200, { settings });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/ui/projects") {
    const workspaceId = normalizeWorkspaceId(url.searchParams.get("workspace_id") ?? context.workspaceId);
    const projects = await listPersistedProjects(workspaceId);
    sendJson(res, 200, { projects: await attachProjectRunStats(projects, workspaceId) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ui/projects") {
    try {
      const body = await readJson<ProjectBody>(req);
      if (!body.name) {
        sendJson(res, 400, { error: "name_required" });
        return;
      }
      sendJson(res, 201, { project: await createPersistedProject({ ...body, workspace_id: context.workspaceId }) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const uiProjectRuns = req.method === "GET" ? matchUiProjectRuns(url) : null;
  if (uiProjectRuns) {
    try {
      const runs = await listPersistedRuns({
        workspaceId: context.workspaceId,
        projectId: uiProjectRuns.projectId,
        limit: readNumberParam(url, "limit") ?? 25
      });
      sendJson(res, 200, { runs: await attachReviewQueueDispositionCounts(runs) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const uiProject = req.method === "GET" || req.method === "PUT" ? matchUiProject(url) : null;
  if (uiProject && req.method === "GET") {
    const project = await getPersistedProject(uiProject.projectId, context.workspaceId);
    if (!project) {
      sendJson(res, 404, { error: "project_not_found", project_id: uiProject.projectId });
      return;
    }
    sendJson(res, 200, { project });
    return;
  }

  if (uiProject && req.method === "PUT") {
    try {
      const body = await readJson<ProjectBody>(req);
      const updated = await updatePersistedProject(uiProject.projectId, { ...body, workspace_id: context.workspaceId });
      if (!updated) {
        sendJson(res, 404, { error: "project_not_found", project_id: uiProject.projectId });
        return;
      }
      sendJson(res, 200, { project: updated });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/ui/documents") {
    sendJson(res, 200, { documents: await listPersistedUiDocuments(undefined, context) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ui/documents") {
    try {
      const body = await readJson<UiDocumentBody>(req);
      if (!body.title || !body.document_type || !body.content_text) {
        sendJson(res, 400, { error: "title_document_type_and_content_text_required" });
        return;
      }
      sendJson(res, 201, { document: await createPersistedUiDocument(body, undefined, context) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const uiDocument = req.method === "DELETE" ? matchUiDocument(url) : null;
  if (uiDocument) {
    const deleted = await deletePersistedUiDocument(uiDocument.documentId, undefined, context);
    if (!deleted) {
      sendJson(res, 404, { error: "document_not_found", document_id: uiDocument.documentId });
      return;
    }
    sendJson(res, 200, { deleted: true, document_id: uiDocument.documentId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/persistence/metadata") {
    try {
      const location = resolvePersistenceLocation({ dbMode: (url.searchParams.get("db_mode") as AuditRequest["db_mode"] | null) ?? undefined });
      sendJson(res, 200, { mode: location.mode, root: location.rootDir, metadata: await readPersistenceMetadata(location.rootDir) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/artifacts/retention/summary") {
    try {
      sendJson(res, 200, {
        artifact_retention_summary: await summarizeArtifacts({
          rootDir: url.searchParams.get("root") ?? undefined,
          kind: normalizeArtifactRetentionKind(url.searchParams.get("kind")),
          includeSize: readBooleanParam(url, "include_size") ?? false
        })
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && (url.pathname === "/artifacts/retention/preview" || url.pathname === "/artifacts/retention/prune")) {
    try {
      const body = await readJson<ArtifactRetentionBody>(req);
      const request = resolveArtifactRetentionRequest(body);
      const dryRun = url.pathname.endsWith("/preview");
      sendJson(res, 200, {
        artifact_retention: await pruneArtifacts({
          ...request,
          dryRun
        })
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/runs") {
    try {
      const request = applyRequestContextToAuditRequest(await readJson(req), context);
      const result = await engine.run(request);
      await emitConfiguredWebhookForRun(result.run_id, "run_completed", context.actorId, {
        trigger: "sync_run"
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/preflight") {
    try {
      const body = await readJson<{ request?: AuditRequest } & AuditRequest>(req);
      const request = (body.request && typeof body.request === "object" ? body.request : body) as AuditRequest;
      const summary = await buildPreflightSummary(request);
      sendJson(res, 200, { preflight: summary });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/static-tools") {
    const settingsResolution = await resolvePersistedUiSettings(undefined, context);
    const preflightSettings = settingsResolution.effective.preflight_json as Record<string, unknown>;
    sendJson(res, 200, {
      static_tools: buildStaticToolsReadiness({
        selectedToolIds: preflightSettings.external_audit_tool_ids
      })
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/runs/async") {
    try {
      const body = await readJson<AsyncRunRequestBody>(req);
      if (!body.request) {
        sendJson(res, 400, { error: "request_required" });
        return;
      }
      const job = await asyncJobs.createJob({
        request: applyRequestContextToAuditRequest(body.request, context),
        startImmediately: body.start_immediately,
        completionWebhookUrl: body.completion_webhook_url ?? null
      });
      sendJson(res, 202, job);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/runs/async") {
    sendJson(res, 200, { jobs: await asyncJobs.listJobs(undefined, context) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/runtime-followups") {
    sendJson(res, 200, {
      runtime_followups: await listPersistedRuntimeFollowups({
        workspaceId: context.workspaceId,
        projectId: context.projectId
      })
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/runtime-followups/summary") {
    const followups = await listPersistedRuntimeFollowups({
      workspaceId: context.workspaceId,
      projectId: context.projectId
    });
    sendJson(res, 200, {
      runtime_followup_summary: buildRuntimeFollowupSummary(followups),
      export_schema: buildExportEnvelope("runtime_followup_summary.v1", buildRuntimeFollowupSummary(followups))
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/runtime-followups/export") {
    const format = (url.searchParams.get("format") || "json").toLowerCase();
    const followups = await listPersistedRuntimeFollowups({
      workspaceId: context.workspaceId,
      projectId: context.projectId
    });
    const filename = `runtime-followups.${format === "csv" ? "csv" : "json"}`;
    if (format === "csv") {
      sendJson(res, 200, {
        format: "csv",
        filename,
        csv: buildRuntimeFollowupCsv(followups),
        runtime_followup_summary: buildRuntimeFollowupSummary(followups)
      });
      return;
    }
    sendJson(res, 200, {
      format: "json",
      filename,
      export_schema: buildExportEnvelope("runtime_followup_queue.v1", {
        runtime_followup_summary: buildRuntimeFollowupSummary(followups),
        runtime_followups: followups
      }),
      runtime_followup_summary: buildRuntimeFollowupSummary(followups),
      runtime_followups: followups
    });
    return;
  }

  const asyncRun = req.method === "GET" ? matchAsyncRun(url) : null;
  if (asyncRun) {
    const job = await asyncJobs.getJob(asyncRun.runId);
    if (!job || normalizeWorkspaceId(job.job.workspace_id) !== context.workspaceId || normalizeProjectId(job.job.project_id) !== context.projectId) {
      sendJson(res, 404, { error: "job_not_found", job_id: asyncRun.runId });
      return;
    }
    sendJson(res, 200, job);
    return;
  }

  const asyncRunAction = req.method === "POST" ? matchAsyncRunAction(url) : null;
  if (asyncRunAction) {
    try {
      const existing = await asyncJobs.getJob(asyncRunAction.runId);
      if (!existing || normalizeWorkspaceId(existing.job.workspace_id) !== context.workspaceId || normalizeProjectId(existing.job.project_id) !== context.projectId) {
        sendJson(res, 404, { error: "job_not_found", job_id: asyncRunAction.runId });
        return;
      }
      if (asyncRunAction.action === "cancel") {
        const canceled = await asyncJobs.cancelJob(asyncRunAction.runId);
        if (!canceled) {
          sendJson(res, 404, { error: "job_not_found", job_id: asyncRunAction.runId });
          return;
        }
        sendJson(res, 200, canceled);
        return;
      }
      const retried = await asyncJobs.retryJob(asyncRunAction.runId);
      if (!retried) {
        sendJson(res, 404, { error: "job_not_found", job_id: asyncRunAction.runId });
        return;
      }
      if (retried.job.status !== "running" && retried.job.status !== "queued" && retried.job.status !== "starting") {
        sendJson(res, 400, { error: "job_not_retryable", job_id: asyncRunAction.runId });
        return;
      }
      sendJson(res, 202, retried);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), job_id: asyncRunAction.runId });
    }
    return;
  }

  const runtimeFollowupAction = req.method === "POST" ? matchRuntimeFollowupAction(url) : null;
  const runtimeFollowupReport = req.method === "GET" ? matchRuntimeFollowupReport(url) : null;
  if (runtimeFollowupReport) {
    try {
      const followup = await readPersistedRuntimeFollowup(runtimeFollowupReport.followupId);
      if (!followup || normalizeWorkspaceId(followup.workspace_id) !== context.workspaceId || normalizeProjectId(followup.project_id) !== context.projectId) {
        sendJson(res, 404, { error: "runtime_followup_not_found", followup_id: runtimeFollowupReport.followupId });
        return;
      }
      const [sourceRun, sourceFindings, sourceActions, sourceComments, sourceDispositions, sourceSupervisorReview, sourceEvidenceRecords, sourceWorkflow, linkedSummary, linkedFindings, linkedEvaluations] = await Promise.all([
        getPersistedRun(followup.run_id),
        readPersistedFindings(followup.run_id),
        readPersistedReviewActions(followup.run_id),
        readPersistedReviewComments(followup.run_id),
        readPersistedFindingDispositions(followup.run_id),
        readPersistedSupervisorReview(followup.run_id),
        readPersistedEvidenceRecords(followup.run_id),
        readPersistedReviewWorkflow(followup.run_id),
        followup.linked_run_id ? buildRunSummary(followup.linked_run_id) : Promise.resolve(null),
        followup.linked_run_id ? readPersistedFindings(followup.linked_run_id) : Promise.resolve([]),
        followup.linked_run_id ? (async () => {
          const [workflow, findings, actions, comments, dispositions, supervisorReview, sandboxExecution, evidenceRecords, runtimeFollowups] = await Promise.all([
            readPersistedReviewWorkflow(followup.linked_run_id!),
            readPersistedFindings(followup.linked_run_id!),
            readPersistedReviewActions(followup.linked_run_id!),
            readPersistedReviewComments(followup.linked_run_id!),
            readPersistedFindingDispositions(followup.linked_run_id!),
            readPersistedSupervisorReview(followup.linked_run_id!),
            readPersistedStageArtifact(followup.linked_run_id!, "sandbox-execution"),
            readPersistedEvidenceRecords(followup.linked_run_id!),
            listPersistedRuntimeFollowups({ runId: followup.linked_run_id! })
          ]);
          return buildFindingEvaluationSummary({ workflow, findings, actions, comments, dispositions, supervisorReview, sandboxExecution: sandboxExecution as any, evidenceRecords, runtimeFollowups });
        })() : Promise.resolve(null)
      ]);
      const sourceFinding = sourceFindings.find((item: any) => item.id === followup.finding_id) ?? null;
      const sourceEvaluation = buildFindingEvaluationSummary({
        workflow: sourceWorkflow,
        findings: sourceFindings,
        actions: sourceActions,
        comments: sourceComments,
        dispositions: sourceDispositions,
        supervisorReview: sourceSupervisorReview,
        sandboxExecution: null as any,
        evidenceRecords: sourceEvidenceRecords,
        runtimeFollowups: [followup]
      }).evaluations.find((item: any) => item.finding_id === followup.finding_id) ?? null;
      sendJson(res, 200, {
        followup_id: followup.id,
        filename: `${followup.id}-runtime-followup-report.json`,
        export_schema: buildExportEnvelope("runtime_followup_report.v1", {
          followup,
          summary: buildRuntimeFollowupSummary([followup]),
          source_run: sourceRun,
          source_finding: sourceFinding,
          source_evaluation: sourceEvaluation,
          source_review_actions: sourceActions.filter((item: any) => item.finding_id === followup.finding_id),
          linked_rerun_summary: linkedSummary,
          linked_rerun_findings: linkedFindings,
          linked_rerun_evaluations: linkedEvaluations?.evaluations ?? []
        }),
        runtime_followup_report: {
          followup,
          summary: buildRuntimeFollowupSummary([followup]),
          source_run: sourceRun,
          source_finding: sourceFinding,
          source_evaluation: sourceEvaluation,
          source_review_actions: sourceActions.filter((item: any) => item.finding_id === followup.finding_id),
          linked_rerun_summary: linkedSummary,
          linked_rerun_findings: linkedFindings,
          linked_rerun_evaluations: linkedEvaluations?.evaluations ?? []
        }
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), followup_id: runtimeFollowupReport.followupId });
    }
    return;
  }
  if (runtimeFollowupAction) {
    try {
      const followup = await readPersistedRuntimeFollowup(runtimeFollowupAction.followupId);
      if (!followup || normalizeWorkspaceId(followup.workspace_id) !== context.workspaceId || normalizeProjectId(followup.project_id) !== context.projectId) {
        sendJson(res, 404, { error: "runtime_followup_not_found", followup_id: runtimeFollowupAction.followupId });
        return;
      }
      if (!followup.rerun_request_json) {
        sendJson(res, 400, { error: "runtime_followup_not_launchable", followup_id: runtimeFollowupAction.followupId });
        return;
      }
      const request = applyRequestContextToAuditRequest({
        ...followup.rerun_request_json,
        requested_by: context.actorId,
        hints: {
          ...((followup.rerun_request_json.hints as Record<string, unknown> | null) ?? {}),
          runtime_followup: {
            ...(((followup.rerun_request_json.hints as Record<string, any> | null)?.runtime_followup as Record<string, unknown> | null) ?? {}),
            followup_id: followup.id
          }
        }
      }, context);
      const startImmediately = readBooleanParam(url, "start_immediately") ?? true;
      const jobDetails = await asyncJobs.createJob({
        request,
        startImmediately
      });
      const launched = await markRuntimeFollowupLaunched({
        id: followup.id,
        job: jobDetails.job
      });
      sendJson(res, startImmediately ? 202 : 200, { runtime_followup: launched, async_job: jobDetails });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), followup_id: runtimeFollowupAction.followupId });
    }
    return;
  }

  if (req.method === "POST" && matchRunsReconstruct(url)) {
    try {
      const summary = await reconstructLocalRuns({
        dryRun: readBooleanParam(url, "dry_run") ?? false,
        targetId: url.searchParams.get("target_id") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        auditPackage: url.searchParams.get("audit_package") ?? undefined,
        runMode: url.searchParams.get("run_mode") ?? undefined,
        targetClass: url.searchParams.get("target_class") ?? undefined,
        rating: url.searchParams.get("rating") ?? undefined,
        publishabilityStatus: url.searchParams.get("publishability_status") ?? undefined,
        policyPackId: url.searchParams.get("policy_pack_id") ?? undefined,
        since: url.searchParams.get("since") ?? undefined,
        until: url.searchParams.get("until") ?? undefined,
        requiresHumanReview: readBooleanParam(url, "requires_human_review"),
        hasFindings: readBooleanParam(url, "has_findings"),
        limit: readNumberParam(url, "limit")
      });
      sendJson(res, 200, { reconstruction: summary });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const runReconstruct = req.method === "POST" ? matchRunReconstruct(url) : null;
  if (runReconstruct) {
    try {
      const summary = await reconstructLocalRun({
        runId: runReconstruct.runId,
        dryRun: readBooleanParam(url, "dry_run") ?? false
      });
      sendJson(res, 200, { reconstruction: summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isMissing = /ENOENT/i.test(message) || /Unable to reconstruct persisted run/i.test(message);
      sendJson(res, isMissing ? 404 : 400, { error: isMissing ? "run_not_found" : message, run_id: runReconstruct.runId });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/runs") {
    try {
      const runs = await listPersistedRuns({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        targetId: url.searchParams.get("target_id") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        auditPackage: url.searchParams.get("audit_package") ?? undefined,
        runMode: url.searchParams.get("run_mode") ?? undefined,
        targetClass: url.searchParams.get("target_class") ?? undefined,
        rating: url.searchParams.get("rating") ?? undefined,
        publishabilityStatus: url.searchParams.get("publishability_status") ?? undefined,
        policyPackId: url.searchParams.get("policy_pack_id") ?? undefined,
        since: url.searchParams.get("since") ?? undefined,
        until: url.searchParams.get("until") ?? undefined,
        requiresHumanReview: readBooleanParam(url, "requires_human_review"),
        hasFindings: readBooleanParam(url, "has_findings"),
        limit: readNumberParam(url, "limit")
      });
      sendJson(res, 200, { runs: await attachReviewQueueDispositionCounts(runs) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/stats/runs") {
    try {
      const stats = await getPersistedRunStats({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        targetId: url.searchParams.get("target_id") ?? undefined,
        auditPackage: url.searchParams.get("audit_package") ?? undefined,
        runMode: url.searchParams.get("run_mode") ?? undefined,
        targetClass: url.searchParams.get("target_class") ?? undefined,
        since: url.searchParams.get("since") ?? undefined,
        until: url.searchParams.get("until") ?? undefined
      });
      sendJson(res, 200, { stats });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/stats/observability") {
    try {
      const stats = await getPersistedObservabilityHistory({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        targetId: url.searchParams.get("target_id") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        auditPackage: url.searchParams.get("audit_package") ?? undefined,
        runMode: url.searchParams.get("run_mode") ?? undefined,
        targetClass: url.searchParams.get("target_class") ?? undefined,
        rating: url.searchParams.get("rating") ?? undefined,
        publishabilityStatus: url.searchParams.get("publishability_status") ?? undefined,
        policyPackId: url.searchParams.get("policy_pack_id") ?? undefined,
        since: url.searchParams.get("since") ?? undefined,
        until: url.searchParams.get("until") ?? undefined,
        requiresHumanReview: readBooleanParam(url, "requires_human_review"),
        hasFindings: readBooleanParam(url, "has_findings"),
        limit: readNumberParam(url, "limit")
      });
      sendJson(res, 200, stats);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/stats/targets") {
    try {
      const runs = await listPersistedRuns({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        limit: Number.MAX_SAFE_INTEGER
      });
      sendJson(res, 200, { stats: buildScopedTargetStats(buildScopedTargetList(runs)) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/stats/tool-adapters") {
    try {
      const stats = await getPersistedToolAdapterHistory({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        targetId: url.searchParams.get("target_id") ?? undefined,
        auditPackage: url.searchParams.get("audit_package") ?? undefined,
        runMode: url.searchParams.get("run_mode") ?? undefined,
        targetClass: url.searchParams.get("target_class") ?? undefined,
        since: url.searchParams.get("since") ?? undefined,
        until: url.searchParams.get("until") ?? undefined
      });
      sendJson(res, 200, { stats });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && /^\/runs\/[^/]+$/.test(url.pathname)) {
    try {
      const runId = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      const run = await getPersistedRun(runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runId });
        return;
      }
      sendJson(res, 200, { run });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const runArtifacts = req.method === "GET" ? matchRunArtifacts(url) : null;
  if (runArtifacts) {
    try {
      const run = await getPersistedRun(runArtifacts.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runArtifacts.runId });
        return;
      }
      sendJson(res, 200, {
        run_id: runArtifacts.runId,
        artifact_root: run?.artifact_root,
        artifacts: (await readPersistedArtifactIndex(runArtifacts.runId)).map((artifact) => ({
          ...artifact,
          policy: describeArtifactType(artifact.type)
        }))
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runArtifacts.runId });
    }
    return;
  }

  const runArtifact = req.method === "GET" ? matchRunArtifact(url) : null;
  if (runArtifact) {
    try {
      const run = await getPersistedRun(runArtifact.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runArtifact.runId });
        return;
      }

      const artifactIndex = await readPersistedArtifactIndex(runArtifact.runId);
      const artifact = artifactIndex.find((item) => item.type === runArtifact.artifactType);
      if (!artifact) {
        sendJson(res, 404, { error: "artifact_not_found", run_id: runArtifact.runId, artifact_type: runArtifact.artifactType });
        return;
      }

      if (!isArtifactPathWithinRoot(artifact.path, run?.artifact_root ?? "")) {
        sendJson(res, 400, { error: "artifact_path_outside_run_root", run_id: runArtifact.runId, artifact_type: runArtifact.artifactType });
        return;
      }

      const { format, payload } = await readArtifactPayload(artifact.path);
      sendJson(res, 200, {
        run_id: runArtifact.runId,
        artifact: {
          artifact_id: artifact.artifact_id,
          type: artifact.type,
          path: artifact.path,
          created_at: artifact.created_at,
          policy: describeArtifactType(artifact.type),
          format,
          payload
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isMissing = /ENOENT/i.test(message);
      sendJson(res, isMissing ? 404 : 400, {
        error: isMissing ? "artifact_not_found" : message,
        run_id: runArtifact.runId,
        artifact_type: runArtifact.artifactType
      });
    }
    return;
  }

  const runReviewActions = req.method === "POST" ? matchRunReviewActions(url) : null;
  if (runReviewActions) {
    try {
      const body = await readJson<{
        action_type: any;
        assigned_reviewer_id?: string | null;
        finding_id?: string | null;
        previous_severity?: string | null;
        updated_severity?: string | null;
        visibility_override?: string | null;
        notes?: string | null;
        metadata?: Record<string, unknown> | null;
      }>(req);
      const run = await getPersistedRun(runReviewActions.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runReviewActions.runId });
        return;
      }
      if (!body.action_type) {
        sendJson(res, 400, { error: "action_type_required", run_id: runReviewActions.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runReviewActions.runId);
      if (!canPerformReviewAction({
        roles: context.roles,
        actorId: context.actorId,
        workflow,
        actionType: body.action_type as any
      })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
        const submitted = await submitPersistedReviewAction({
          runId: runReviewActions.runId,
          input: {
          reviewer_id: context.actorId,
          action_type: body.action_type as any,
          assigned_reviewer_id: body.assigned_reviewer_id ?? null,
          finding_id: body.finding_id ?? null,
          previous_severity: body.previous_severity as any,
          updated_severity: body.updated_severity as any,
          visibility_override: body.visibility_override as any,
          notes: body.notes ?? null,
            metadata: body.metadata ?? null
          }
        });
        const runtimeFollowup = await upsertRuntimeFollowupFromReviewAction({
          runId: runReviewActions.runId,
          actionId: submitted.action.id,
          input: {
            reviewer_id: context.actorId,
            action_type: body.action_type as any,
            assigned_reviewer_id: body.assigned_reviewer_id ?? null,
            finding_id: body.finding_id ?? null,
            previous_severity: body.previous_severity as any,
            updated_severity: body.updated_severity as any,
            visibility_override: body.visibility_override as any,
            notes: body.notes ?? null,
            metadata: body.metadata ?? null
          }
        });
        if (body.action_type === "require_rerun" || body.action_type === "rerun_in_capable_env") {
          await emitConfiguredWebhookForRun(runReviewActions.runId, "review_requires_rerun", context.actorId, {
            review_action_id: submitted.action.id,
            finding_id: submitted.action.finding_id ?? null
          });
        }
        sendJson(res, 200, {
          run_id: runReviewActions.runId,
          workflow: submitted.workflow,
          action: submitted.action,
          notification: submitted.notification ?? null,
          runtime_followup: runtimeFollowup
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message === "run_not_found" ? 404 : 400;
      sendJson(res, status, { error: message, run_id: runReviewActions.runId });
    }
    return;
  }

  const runReviewComments = req.method === "POST" ? ((): { runId: string } | null => {
    const match = url.pathname.match(/^\/runs\/([^/]+)\/review-comments$/);
    if (!match) return null;
    return { runId: decodeURIComponent(match[1] ?? "") };
  })() : null;
  if (runReviewComments) {
    try {
      const run = await getPersistedRun(runReviewComments.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runReviewComments.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runReviewComments.runId);
      if (!canCommentOnReview({ roles: context.roles, actorId: context.actorId, workflow })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      const body = await readJson<{ body?: string | null; finding_id?: string | null; metadata?: Record<string, unknown> | null; }>(req);
      const comment = await createPersistedReviewComment({
        runId: runReviewComments.runId,
        authorId: context.actorId,
        body: body.body ?? "",
        findingId: body.finding_id ?? null,
        metadata: body.metadata ?? null
      });
      sendJson(res, 200, { run_id: runReviewComments.runId, review_comment: comment });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runReviewComments.runId });
    }
    return;
  }

  const runFindingDispositions = req.method === "POST" ? matchRunFindingDispositions(url) : null;
  if (runFindingDispositions) {
    try {
      const run = await getPersistedRun(runFindingDispositions.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runFindingDispositions.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runFindingDispositions.runId);
      if (!canPerformReviewAction({ roles: context.roles, actorId: context.actorId, workflow, actionType: "suppress_finding" })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      const body = await readJson<FindingDispositionBody>(req);
      const findings = await readPersistedFindings(runFindingDispositions.runId);
      const finding = findings.find((item) => item.id === body.finding_id);
      if (!finding) {
        sendJson(res, 404, { error: "finding_not_found", finding_id: body.finding_id });
        return;
      }
      const scopeLevel = body.scope_level ?? (body.disposition_type === "waiver" ? "project" : "run");
      if (scopeLevel === "project" && body.disposition_type === "waiver") {
        if (!String(body.owner_id ?? "").trim()) {
          sendJson(res, 400, { error: "waiver_owner_required", finding_id: body.finding_id });
          return;
        }
        if (!String(body.reviewed_at ?? "").trim()) {
          sendJson(res, 400, { error: "waiver_reviewed_at_required", finding_id: body.finding_id });
          return;
        }
      }
      const disposition = await createPersistedFindingDisposition({
        runId: runFindingDispositions.runId,
        input: {
          disposition_type: body.disposition_type,
          scope_level: scopeLevel,
          finding_id: finding.id,
          finding_signature: findingDispositionSignature(finding),
          reason: body.reason,
          notes: body.notes ?? null,
          expires_at: body.expires_at ?? null,
          created_by: context.actorId,
          metadata: {
            created_via: "api",
            workspace_id: context.workspaceId,
            project_id: context.projectId,
            owner_id: scopeLevel === "project" ? String(body.owner_id ?? "").trim() || null : null,
            reviewed_at: scopeLevel === "project" ? String(body.reviewed_at ?? "").trim() || null : null,
            review_due_by: scopeLevel === "project" ? String(body.review_due_by ?? "").trim() || null : null,
            evidence_fingerprint: buildFindingEvidenceFingerprint(finding)
          }
        }
      });
      const dispositions = await readPersistedFindingDispositions(runFindingDispositions.runId);
      sendJson(res, 201, {
        run_id: runFindingDispositions.runId,
        finding_disposition: disposition,
        resolved_finding_dispositions: resolveFindingDispositions({ findings, dispositions })
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runFindingDispositions.runId });
    }
    return;
  }

  const runFindingDispositionItem = (req.method === "PATCH" || req.method === "POST") ? matchRunFindingDispositionItem(url) : null;
  if (runFindingDispositionItem) {
    try {
      const run = await getPersistedRun(runFindingDispositionItem.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runFindingDispositionItem.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runFindingDispositionItem.runId);
      if (!canPerformReviewAction({ roles: context.roles, actorId: context.actorId, workflow, actionType: "suppress_finding" })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      const findings = await readPersistedFindings(runFindingDispositionItem.runId);
      const dispositions = await readPersistedFindingDispositions(runFindingDispositionItem.runId);
      const existing = dispositions.find((item) => item.id === runFindingDispositionItem.dispositionId);
      if (!existing) {
        sendJson(res, 404, { error: "finding_disposition_not_found", disposition_id: runFindingDispositionItem.dispositionId });
        return;
      }
      if (runFindingDispositionItem.action === "revoke") {
        const body = await readJson<{ notes?: string | null }>(req);
        const revoked = await revokePersistedFindingDisposition({
          runId: runFindingDispositionItem.runId,
          dispositionId: runFindingDispositionItem.dispositionId,
          revokedBy: context.actorId,
          notes: body.notes ?? null
        });
        sendJson(res, 200, {
          run_id: runFindingDispositionItem.runId,
          finding_disposition: revoked,
          resolved_finding_dispositions: resolveFindingDispositions({ findings, dispositions: await readPersistedFindingDispositions(runFindingDispositionItem.runId) })
        });
        return;
      }
      const body = await readJson<FindingDispositionUpdateBody>(req);
      const metadata = existing.metadata_json && typeof existing.metadata_json === "object"
        ? { ...(existing.metadata_json as Record<string, unknown>) }
        : {};
      if (existing.disposition_type === "waiver" && existing.scope_level === "project") {
        const ownerId = body.owner_id === undefined ? metadata.owner_id : String(body.owner_id ?? "").trim() || null;
        const reviewedAt = body.reviewed_at === undefined ? metadata.reviewed_at : String(body.reviewed_at ?? "").trim() || null;
        const reviewDueBy = body.review_due_by === undefined ? metadata.review_due_by : String(body.review_due_by ?? "").trim() || null;
        if (!ownerId) {
          sendJson(res, 400, { error: "waiver_owner_required", disposition_id: existing.id });
          return;
        }
        if (!reviewedAt) {
          sendJson(res, 400, { error: "waiver_reviewed_at_required", disposition_id: existing.id });
          return;
        }
        metadata.owner_id = ownerId;
        metadata.reviewed_at = reviewedAt;
        metadata.review_due_by = reviewDueBy;
      }
      const finding = findings.find((item) => item.id === existing.finding_id) ?? findings.find((item) => findingDispositionSignature(item) === existing.finding_signature);
      if (finding) {
        metadata.evidence_fingerprint = buildFindingEvidenceFingerprint(finding);
      }
      metadata.updated_by = context.actorId;
      metadata.updated_at = new Date().toISOString();
      const updated = await updatePersistedFindingDisposition({
        runId: runFindingDispositionItem.runId,
        dispositionId: runFindingDispositionItem.dispositionId,
        input: {
          reason: body.reason,
          notes: body.notes,
          expires_at: body.expires_at,
          metadata
        }
      });
      sendJson(res, 200, {
        run_id: runFindingDispositionItem.runId,
        finding_disposition: updated,
        resolved_finding_dispositions: resolveFindingDispositions({ findings, dispositions: await readPersistedFindingDispositions(runFindingDispositionItem.runId) })
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runFindingDispositionItem.runId });
    }
    return;
  }

  const runOutboundApproval = req.method === "POST" ? ((): { runId: string } | null => {
    const match = url.pathname.match(/^\/runs\/([^/]+)\/outbound-approval$/);
    if (!match) return null;
    return { runId: decodeURIComponent(match[1] ?? "") };
  })() : null;
  if (runOutboundApproval) {
    try {
      const run = await getPersistedRun(runOutboundApproval.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runOutboundApproval.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runOutboundApproval.runId);
      if (!canExportReviewAudit({ roles: context.roles, actorId: context.actorId, workflow })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      const body = await readJson<{ notes?: string[] | string | null }>(req);
      const approval: OutboundApprovalArtifact = {
        integration: "github",
        approved_by: context.actorId,
        approved_at: new Date().toISOString(),
        notes: Array.isArray(body.notes) ? body.notes.map((item) => String(item)) : body.notes ? [String(body.notes)] : []
      };
      await upsertPersistedStageArtifact({
        runId: runOutboundApproval.runId,
        artifactType: "outbound-approval",
        payload: approval,
        targetId: run?.target_id ?? null
      });
      sendJson(res, 200, { run_id: runOutboundApproval.runId, outbound_approval: approval });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runOutboundApproval.runId });
    }
    return;
  }

  const runOutboundVerification = req.method === "POST" ? ((): { runId: string } | null => {
    const match = url.pathname.match(/^\/runs\/([^/]+)\/outbound-verification$/);
    if (!match) return null;
    return { runId: decodeURIComponent(match[1] ?? "") };
  })() : null;
  if (runOutboundVerification) {
    try {
      const run = await getPersistedRun(runOutboundVerification.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runOutboundVerification.runId });
        return;
      }
      if (!run) {
        sendJson(res, 404, { error: "run_not_found", run_id: runOutboundVerification.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runOutboundVerification.runId);
      if (!canExportReviewAudit({ roles: context.roles, actorId: context.actorId, workflow })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      const settingsResolution = await resolvePersistedUiSettings(undefined, { workspaceId: run.workspace_id, projectId: run.project_id });
      const verification = await verifyGithubRepositoryAccess({
        repoUrl: run.target?.repo_url ?? run.target_summary?.repo_url ?? null,
        config: normalizeGithubExecutionConfig(settingsResolution.effective.credentials_json as Record<string, unknown>),
        actorId: context.actorId
      });
      await upsertPersistedStageArtifact({
        runId: runOutboundVerification.runId,
        artifactType: "outbound-verification",
        payload: verification,
        targetId: run.target_id
      });
      sendJson(res, 200, { run_id: runOutboundVerification.runId, outbound_verification: verification });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runOutboundVerification.runId });
    }
    return;
  }

  const runOutboundSend = req.method === "POST" ? ((): { runId: string } | null => {
    const match = url.pathname.match(/^\/runs\/([^/]+)\/outbound-send$/);
    if (!match) return null;
    return { runId: decodeURIComponent(match[1] ?? "") };
  })() : null;
  if (runOutboundSend) {
    try {
      const run = await getPersistedRun(runOutboundSend.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runOutboundSend.runId });
        return;
      }
      if (!run) {
        sendJson(res, 404, { error: "run_not_found", run_id: runOutboundSend.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runOutboundSend.runId);
      if (!canExportReviewAudit({ roles: context.roles, actorId: context.actorId, workflow })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      const body = await readJson<{ action_type?: string | null }>(req);
      const preview = await buildOutboundPreviewForRun(run);
      const selectedAction = Array.isArray(preview["proposed_actions"])
        ? (preview["proposed_actions"] as Array<Record<string, unknown>>).find((item) => String(item["action_type"]) === String(body.action_type || "pr_comment"))
          ?? (preview["proposed_actions"] as Array<Record<string, unknown>>)[0]
        : null;
      if (preview["readiness"] && typeof preview["readiness"] === "object" && (preview["readiness"] as any).send_allowed !== true) {
        sendJson(res, 409, { error: "outbound_send_not_allowed", outbound_preview: preview });
        return;
      }
      const sendRecord: OutboundSendArtifact = {
        integration: "github",
        action_type: String(selectedAction?.["action_type"] ?? body.action_type ?? "pr_comment"),
        attempted_by: context.actorId,
        attempted_at: new Date().toISOString(),
        executed: false,
        status: "manual_only",
        reason: "External connector execution is not enabled in the OSS harness. Use the preview payload manually or add a future connector adapter.",
        payload_preview: (selectedAction?.["payload_preview"] as Record<string, unknown> | null | undefined) ?? null
      };
      await upsertPersistedStageArtifact({
        runId: runOutboundSend.runId,
        artifactType: "outbound-send",
        payload: sendRecord,
        targetId: run.target_id
      });
      sendJson(res, 200, { run_id: runOutboundSend.runId, outbound_send: sendRecord, outbound_preview: preview });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runOutboundSend.runId });
    }
    return;
  }

  const runOutboundDelivery = req.method === "POST" ? ((): { runId: string } | null => {
    const match = url.pathname.match(/^\/runs\/([^/]+)\/outbound-delivery$/);
    if (!match) return null;
    return { runId: decodeURIComponent(match[1] ?? "") };
  })() : null;
  if (runOutboundDelivery) {
    try {
      const run = await getPersistedRun(runOutboundDelivery.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runOutboundDelivery.runId });
        return;
      }
      if (!run) {
        sendJson(res, 404, { error: "run_not_found", run_id: runOutboundDelivery.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runOutboundDelivery.runId);
      if (!canExportReviewAudit({ roles: context.roles, actorId: context.actorId, workflow })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      const body = await readJson<{ action_type?: string | null; target_number?: number | string | null }>(req);
      const preview = await buildOutboundPreviewForRun(run);
      if (preview["readiness"] && typeof preview["readiness"] === "object" && (preview["readiness"] as any).execute_allowed !== true) {
        sendJson(res, 409, { error: "outbound_delivery_not_allowed", outbound_preview: preview });
        return;
      }
      const selectedAction = Array.isArray(preview["proposed_actions"])
        ? (preview["proposed_actions"] as Array<Record<string, unknown>>).find((item) => String(item["action_type"]) === String(body.action_type || "pr_comment"))
          ?? (preview["proposed_actions"] as Array<Record<string, unknown>>)[0]
        : null;
      const settingsResolution = await resolvePersistedUiSettings(undefined, { workspaceId: run.workspace_id, projectId: run.project_id });
      const verification = await readPersistedStageArtifact<OutboundVerificationArtifact>(runOutboundDelivery.runId, "outbound-verification");
      const delivery = await executeGithubOutboundDelivery({
        config: normalizeGithubExecutionConfig(settingsResolution.effective.credentials_json as Record<string, unknown>),
        verification: verification ?? null,
        actionType: String(selectedAction?.["action_type"] ?? body.action_type ?? "pr_comment") as any,
        payloadPreview: (selectedAction?.["payload_preview"] as Record<string, unknown> | null | undefined) ?? null,
        actorId: context.actorId,
        targetNumber: body.target_number === null || body.target_number === undefined || body.target_number === "" ? null : Number(body.target_number)
      });
      await upsertPersistedStageArtifact({
        runId: runOutboundDelivery.runId,
        artifactType: "outbound-delivery",
        payload: delivery,
        targetId: run.target_id
      });
      await emitConfiguredWebhookForRun(
        runOutboundDelivery.runId,
        delivery.status === "sent" ? "outbound_delivery_sent" : "outbound_delivery_failed",
        context.actorId,
        {
          outbound_delivery: delivery
        }
      );
      sendJson(res, delivery.status === "sent" ? 200 : delivery.status === "blocked" ? 409 : 502, {
        run_id: runOutboundDelivery.runId,
        outbound_delivery: delivery
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runOutboundDelivery.runId });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/audit-packages") {
    try {
      sendJson(res, 200, { audit_packages: listBuiltinAuditPackages() });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/policy-packs") {
    try {
      sendJson(res, 200, { policy_packs: listBuiltinAuditPolicyPacks() });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/llm-providers") {
      try {
        const settingsResolution = await resolvePersistedUiSettings(undefined, context);
        sendJson(res, 200, {
          providers: attachLlmProviderCredentialStatus(
            listBuiltinLlmProviders(),
            settingsResolution.effective.credentials_json as Record<string, unknown>
          ),
          presets: listBuiltinLlmProviderPresets(),
          environment_defaults: describeEnvironmentLlmDefaults()
        });
      } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/llm-providers/openai_codex/connect") {
    try {
      sendJson(res, 200, await launchOpenAICodexLogin(context));
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (req.method === "GET" && url.pathname === "/llm-providers/openai_codex/status") {
    try {
      sendJson(res, 200, await getOpenAICodexLoginStatus(context));
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/integrations") {
    try {
      const settingsResolution = await resolvePersistedUiSettings(undefined, {
        workspaceId: context.workspaceId,
        projectId: context.projectId
      });
      const integrations = attachIntegrationCredentialStatus(
        listBuiltinIntegrations(),
        settingsResolution.effective.credentials_json as Record<string, unknown>,
        settingsResolution.effective.integrations_json as Record<string, unknown>
      );
      sendJson(res, 200, { integrations });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/review-notifications") {
    try {
      const reviewerId = url.searchParams.get("reviewer_id") ?? context.actorId;
      sendJson(res, 200, {
        review_notifications: await listPersistedReviewNotifications({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          reviewerId,
          status: (url.searchParams.get("status") as "unread" | "acknowledged" | null) ?? undefined,
          notificationType: (url.searchParams.get("type") as "review_assigned" | "review_reassigned" | "review_rerun_required" | null) ?? undefined
        })
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/webhook-deliveries") {
    try {
      sendJson(res, 200, {
        webhook_deliveries: await listPersistedWebhookDeliveries({
          workspaceId: context.workspaceId,
          projectId: context.projectId
        })
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const reviewNotification = req.method === "POST" ? matchReviewNotification(url) : null;
  if (reviewNotification) {
    try {
      const acknowledged = await acknowledgePersistedReviewNotification({
        notificationId: reviewNotification.notificationId,
        reviewerId: context.actorId
      });
      if (!acknowledged) {
        sendJson(res, 404, { error: "notification_not_found", notification_id: reviewNotification.notificationId });
        return;
      }
      sendJson(res, 200, { review_notification: acknowledged });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), notification_id: reviewNotification.notificationId });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/targets") {
    try {
      const runs = await listPersistedRuns({ workspaceId: context.workspaceId, projectId: context.projectId, limit: Number.MAX_SAFE_INTEGER });
      sendJson(res, 200, { targets: buildScopedTargetList(runs) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const target = req.method === "GET" ? matchTarget(url) : null;
  if (target) {
    try {
      const record = buildScopedTargetList(await listPersistedRuns({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        limit: Number.MAX_SAFE_INTEGER
      })).find((item) => item.id === target.targetId) ?? null;
      if (!record) {
        sendJson(res, 404, { error: "target_not_found", target_id: target.targetId });
        return;
      }
      sendJson(res, 200, { target: record });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), target_id: target.targetId });
    }
    return;
  }

  const targetSummary = req.method === "GET" ? matchTargetSummary(url) : null;
  if (targetSummary) {
    try {
      const record = buildScopedTargetList(await listPersistedRuns({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        targetId: targetSummary.targetId,
        limit: Number.MAX_SAFE_INTEGER
      })).find((item) => item.id === targetSummary.targetId) ?? null;
      sendJson(res, 200, { target_id: targetSummary.targetId, summary: record?.summary ?? null });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), target_id: targetSummary.targetId });
    }
    return;
  }

  const targetHistory = req.method === "GET" ? matchTargetHistory(url) : null;
  if (targetHistory) {
    try {
      sendJson(res, 200, {
        target_id: targetHistory.targetId,
        history: (await listPersistedRuns({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          targetId: targetHistory.targetId,
          limit: Number.MAX_SAFE_INTEGER
        })).sort((left, right) => left.created_at.localeCompare(right.created_at)).map((item) => ({
          run_id: item.id,
          created_at: item.created_at,
          overall_score: item.overall_score,
          static_score: item.static_score,
          rating: item.rating,
          publishability_status: item.review_decision?.publishability_status ?? null,
          audit_package: item.audit_package
        }))
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), target_id: targetHistory.targetId });
    }
    return;
  }

  const targetLaneSpecialists = req.method === "GET" ? matchTargetLaneSpecialists(url) : null;
  if (targetLaneSpecialists) {
    try {
      sendJson(res, 200, await getPersistedTargetLaneSpecialistHistory(targetLaneSpecialists.targetId));
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), target_id: targetLaneSpecialists.targetId });
    }
    return;
  }

  const targetToolAdapters = req.method === "GET" ? matchTargetToolAdapters(url) : null;
  if (targetToolAdapters) {
    try {
      sendJson(res, 200, { target_id: targetToolAdapters.targetId, stats: await getPersistedTargetToolAdapterHistory(targetToolAdapters.targetId) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), target_id: targetToolAdapters.targetId });
    }
    return;
  }

  const targetRuns = req.method === "GET" ? matchTargetRuns(url) : null;
  if (targetRuns) {
    try {
      sendJson(res, 200, { target_id: targetRuns.targetId, runs: await listPersistedRuns({ workspaceId: context.workspaceId, projectId: context.projectId, targetId: targetRuns.targetId, limit: Number.MAX_SAFE_INTEGER }) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), target_id: targetRuns.targetId });
    }
    return;
  }

  const runSubresource = req.method === "GET" ? matchRunSubresource(url) : null;
  if (runSubresource) {
    try {
      const run = await getPersistedRun(runSubresource.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runSubresource.runId });
        return;
      }
      if (!run) {
        sendJson(res, 404, { error: "run_not_found", run_id: runSubresource.runId });
        return;
      }
      if (runSubresource.resource === "observability") {
        sendJson(res, 200, { run_id: runSubresource.runId, ...(await readPersistedObservability(runSubresource.runId)) });
        return;
      }
      if (runSubresource.resource === "observations") {
        sendJson(res, 200, { run_id: runSubresource.runId, observations: await readPersistedStageArtifact(runSubresource.runId, "observations") });
        return;
      }
      if (runSubresource.resource === "events") {
        sendJson(res, 200, { run_id: runSubresource.runId, events: await readPersistedEvents(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "metrics") {
        sendJson(res, 200, { run_id: runSubresource.runId, metrics: await readPersistedMetrics(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "observability-summary") {
        sendJson(res, 200, await readPersistedObservabilitySummary(runSubresource.runId));
        return;
      }
      if (runSubresource.resource === "maintenance") {
        sendJson(res, 200, await readPersistedMaintenanceHistory(runSubresource.runId));
        return;
      }
      if (runSubresource.resource === "lane-plans") {
        sendJson(res, 200, { run_id: runSubresource.runId, lane_plans: await readPersistedLanePlans(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "lane-results") {
        sendJson(res, 200, { run_id: runSubresource.runId, lane_results: await readPersistedLaneResults(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "lane-specialists") {
        sendJson(res, 200, { run_id: runSubresource.runId, lane_specialists: await readPersistedLaneSpecialistOutputs(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "lane-reuse-decisions") {
        sendJson(res, 200, { run_id: runSubresource.runId, lane_reuse_decisions: await readPersistedLaneReuseDecisions(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "evidence-records") {
        sendJson(res, 200, { run_id: runSubresource.runId, evidence_records: await readPersistedEvidenceRecords(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "findings") {
        sendJson(res, 200, { run_id: runSubresource.runId, findings: await readPersistedFindings(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "control-results") {
        sendJson(res, 200, { run_id: runSubresource.runId, control_results: await readPersistedControlResults(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "tool-executions") {
        sendJson(res, 200, { run_id: runSubresource.runId, tool_executions: await readPersistedToolExecutions(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "tool-adapters") {
        sendJson(res, 200, await readPersistedToolAdapterSummary(runSubresource.runId));
        return;
      }
      if (runSubresource.resource === "agent-invocations") {
        sendJson(res, 200, { run_id: runSubresource.runId, agent_invocations: await readPersistedAgentInvocations(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "artifact-index") {
        sendJson(res, 200, { run_id: runSubresource.runId, artifact_index: await readPersistedArtifactIndex(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "score-summary") {
        sendJson(res, 200, { run_id: runSubresource.runId, score_summary: await readPersistedScoreSummary(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "dimension-scores") {
        sendJson(res, 200, { run_id: runSubresource.runId, dimension_scores: await readPersistedDimensionScores(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "usage-summary") {
        sendJson(res, 200, await readPersistedRunUsageSummary(runSubresource.runId));
        return;
      }
      if (runSubresource.resource === "review-decision") {
        sendJson(res, 200, { run_id: runSubresource.runId, review_decision: await readPersistedReviewDecision(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "review-workflow") {
        sendJson(res, 200, { run_id: runSubresource.runId, review_workflow: await readPersistedReviewWorkflow(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "review-actions") {
        sendJson(res, 200, { run_id: runSubresource.runId, review_actions: await readPersistedReviewActions(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "review-comments") {
        sendJson(res, 200, { run_id: runSubresource.runId, review_comments: await readPersistedReviewComments(runSubresource.runId) });
        return;
      }
        if (runSubresource.resource === "review-summary") {
          const [workflow, findings, actions, comments, dispositions] = await Promise.all([
            readPersistedReviewWorkflow(runSubresource.runId),
            readPersistedFindings(runSubresource.runId),
            readPersistedReviewActions(runSubresource.runId),
          readPersistedReviewComments(runSubresource.runId),
          readPersistedFindingDispositions(runSubresource.runId)
        ]);
        sendJson(res, 200, {
          run_id: runSubresource.runId,
            review_summary: buildReviewSummary({ workflow, findings, actions, comments, dispositions })
          });
          return;
        }
      if (runSubresource.resource === "runtime-followups") {
          sendJson(res, 200, {
            run_id: runSubresource.runId,
            runtime_followups: await listPersistedRuntimeFollowups({
              runId: runSubresource.runId,
              workspaceId: context.workspaceId,
              projectId: context.projectId
            })
          });
          return;
        }
        if (runSubresource.resource === "exports") {
          const compareToRunId = url.searchParams.get("compare_to") || (await readPersistedCommitDiff(runSubresource.runId))?.previous_run_id || null;
          sendJson(res, 200, {
            run_id: runSubresource.runId,
            export_schema: buildExportEnvelope("export_index.v1", buildRunExportIndex(runSubresource.runId, compareToRunId)),
            export_index: buildRunExportIndex(runSubresource.runId, compareToRunId)
          });
          return;
        }
        if (runSubresource.resource === "finding-dispositions") {
        const [findings, dispositions] = await Promise.all([
          readPersistedFindings(runSubresource.runId),
          readPersistedFindingDispositions(runSubresource.runId)
        ]);
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          finding_dispositions: dispositions,
          resolved_finding_dispositions: resolveFindingDispositions({ findings, dispositions })
        });
        return;
      }
      if (runSubresource.resource === "webhook-deliveries") {
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          webhook_deliveries: await listPersistedWebhookDeliveries({
            runId: runSubresource.runId,
            workspaceId: context.workspaceId,
            projectId: context.projectId
          })
        });
        return;
      }
      if (runSubresource.resource === "finding-evaluations") {
        const [workflow, findings, actions, comments, dispositions, supervisorReview, sandboxExecution, evidenceRecords, runtimeFollowups] = await Promise.all([
          readPersistedReviewWorkflow(runSubresource.runId),
          readPersistedFindings(runSubresource.runId),
          readPersistedReviewActions(runSubresource.runId),
          readPersistedReviewComments(runSubresource.runId),
          readPersistedFindingDispositions(runSubresource.runId),
          readPersistedSupervisorReview(runSubresource.runId),
          readPersistedStageArtifact(runSubresource.runId, "sandbox-execution"),
          readPersistedEvidenceRecords(runSubresource.runId),
          listPersistedRuntimeFollowups({ runId: runSubresource.runId })
        ]);
        const findingEvaluations = buildFindingEvaluationSummary({ workflow, findings, actions, comments, dispositions, supervisorReview, sandboxExecution: sandboxExecution as any, evidenceRecords, runtimeFollowups });
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          export_schema: buildExportEnvelope("finding_evaluations.v1", findingEvaluations),
          finding_evaluations: findingEvaluations
        });
        return;
      }
      if (runSubresource.resource === "report-markdown" || runSubresource.resource === "report-sarif" || runSubresource.resource === "report-executive") {
        const [summary, findings, workflow, actions, comments, dispositions, supervisorReview, reviewDecision, remediation, resolvedConfiguration, sandboxExecution, evidenceRecords, runtimeFollowups, toolExecutions, controlResults] = await Promise.all([
          buildRunSummary(runSubresource.runId),
          readPersistedFindings(runSubresource.runId),
          readPersistedReviewWorkflow(runSubresource.runId),
          readPersistedReviewActions(runSubresource.runId),
          readPersistedReviewComments(runSubresource.runId),
          readPersistedFindingDispositions(runSubresource.runId),
          readPersistedSupervisorReview(runSubresource.runId),
          readPersistedReviewDecision(runSubresource.runId),
          readPersistedRemediationMemo(runSubresource.runId),
          readPersistedResolvedConfiguration(runSubresource.runId),
          readPersistedStageArtifact(runSubresource.runId, "sandbox-execution"),
          readPersistedEvidenceRecords(runSubresource.runId),
          listPersistedRuntimeFollowups({ runId: runSubresource.runId }),
          readPersistedToolExecutions(runSubresource.runId),
          readPersistedControlResults(runSubresource.runId)
        ]);
        const evaluations = buildFindingEvaluationSummary({ workflow, findings, actions, comments, dispositions, supervisorReview, sandboxExecution: sandboxExecution as any, evidenceRecords, runtimeFollowups });
        if (runSubresource.resource === "report-executive") {
          const format = String(url.searchParams.get("format") || "json").toLowerCase() === "markdown" ? "markdown" : "json";
          if (format === "markdown") {
            sendJson(res, 200, {
              run_id: runSubresource.runId,
              format: "markdown",
              filename: `${runSubresource.runId}-executive-summary.md`,
              report_executive_markdown: buildExecutiveMarkdownReport({
                run,
                summary,
                findings,
                evaluations,
                reviewDecision,
                remediation,
                resolvedConfiguration
              })
            });
            return;
          }
          sendJson(res, 200, {
            run_id: runSubresource.runId,
            format: "json",
            filename: `${runSubresource.runId}-executive-summary.json`,
            export_schema: buildExportEnvelope("executive_summary.v1", buildExecutiveSummaryPayload({
              run,
              summary,
              findings,
              evaluations,
              reviewDecision,
              remediation,
              resolvedConfiguration
            })),
            report_executive: buildExecutiveSummaryPayload({
              run,
              summary,
              findings,
              evaluations,
              reviewDecision,
              remediation,
              resolvedConfiguration
            })
          });
          return;
        }
        if (runSubresource.resource === "report-markdown") {
          sendJson(res, 200, {
            run_id: runSubresource.runId,
            format: "markdown",
            filename: `${runSubresource.runId}-report.md`,
            report_markdown: buildMarkdownRunReport({
              run,
              summary,
              findings,
              evaluations,
              reviewDecision,
              remediation,
              resolvedConfiguration,
              toolExecutions: toolExecutions as any,
              controlResults: controlResults as any
            })
          });
          return;
        }
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          format: "sarif",
          filename: `${runSubresource.runId}-report.sarif.json`,
          report_sarif: buildSarifRunReport({
            run,
            findings,
            evaluations,
            evidenceRecords
          })
        });
        return;
      }
      if (runSubresource.resource === "report-compare") {
        const compareToRunId = url.searchParams.get("compare_to") || (await readPersistedCommitDiff(runSubresource.runId))?.previous_run_id || "";
        if (!compareToRunId) {
          sendJson(res, 400, { error: "compare_to_run_required", run_id: runSubresource.runId });
          return;
        }
        const compareRun = await getPersistedRun(compareToRunId);
        if (!runMatchesScope(compareRun, context)) {
          sendJson(res, 404, { error: "compare_to_run_not_found", compare_to_run_id: compareToRunId });
          return;
        }
        if (!compareRun) {
          sendJson(res, 404, { error: "compare_to_run_not_found", compare_to_run_id: compareToRunId });
          return;
        }
        const [
          currentSummary,
          currentFindings,
          currentWorkflow,
          currentActions,
          currentComments,
          currentDispositions,
          currentSupervisorReview,
          currentSandboxExecution,
          currentEvidenceRecords,
          currentRuntimeFollowups,
          previousSummary,
          previousFindings,
          previousWorkflow,
          previousActions,
          previousComments,
          previousDispositions,
          previousSupervisorReview,
          previousSandboxExecution,
          previousEvidenceRecords,
          previousRuntimeFollowups
        ] = await Promise.all([
          buildRunSummary(runSubresource.runId),
          readPersistedFindings(runSubresource.runId),
          readPersistedReviewWorkflow(runSubresource.runId),
          readPersistedReviewActions(runSubresource.runId),
          readPersistedReviewComments(runSubresource.runId),
          readPersistedFindingDispositions(runSubresource.runId),
          readPersistedSupervisorReview(runSubresource.runId),
          readPersistedStageArtifact(runSubresource.runId, "sandbox-execution"),
          readPersistedEvidenceRecords(runSubresource.runId),
          listPersistedRuntimeFollowups({ runId: runSubresource.runId }),
          buildRunSummary(compareToRunId),
          readPersistedFindings(compareToRunId),
          readPersistedReviewWorkflow(compareToRunId),
          readPersistedReviewActions(compareToRunId),
          readPersistedReviewComments(compareToRunId),
          readPersistedFindingDispositions(compareToRunId),
          readPersistedSupervisorReview(compareToRunId),
          readPersistedStageArtifact(compareToRunId, "sandbox-execution"),
          readPersistedEvidenceRecords(compareToRunId),
          listPersistedRuntimeFollowups({ runId: compareToRunId })
        ]);
        const currentEvaluations = buildFindingEvaluationSummary({
          workflow: currentWorkflow,
          findings: currentFindings,
          actions: currentActions,
          comments: currentComments,
          dispositions: currentDispositions,
          supervisorReview: currentSupervisorReview,
          sandboxExecution: currentSandboxExecution as any,
          evidenceRecords: currentEvidenceRecords,
          runtimeFollowups: currentRuntimeFollowups
        });
        const previousEvaluations = buildFindingEvaluationSummary({
          workflow: previousWorkflow,
          findings: previousFindings,
          actions: previousActions,
          comments: previousComments,
          dispositions: previousDispositions,
          supervisorReview: previousSupervisorReview,
          sandboxExecution: previousSandboxExecution as any,
          evidenceRecords: previousEvidenceRecords,
          runtimeFollowups: previousRuntimeFollowups
        });
        const comparison = buildRunComparisonReport({
          currentRunId: runSubresource.runId,
          compareToRunId,
          currentFindings,
          previousFindings,
          currentEvaluations,
          previousEvaluations,
          currentSummary,
          previousSummary
        });
        const format = String(url.searchParams.get("format") || "json").toLowerCase() === "markdown" ? "markdown" : "json";
        if (format === "markdown") {
          sendJson(res, 200, {
            run_id: runSubresource.runId,
            compare_to_run_id: compareToRunId,
            format: "markdown",
            filename: `${runSubresource.runId}-vs-${compareToRunId}-comparison.md`,
            report_compare_markdown: buildMarkdownComparisonReport(comparison)
          });
          return;
        }
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          compare_to_run_id: compareToRunId,
          format: "json",
          filename: `${runSubresource.runId}-vs-${compareToRunId}-comparison.json`,
          export_schema: buildExportEnvelope("run_comparison.v1", comparison),
          report_compare: comparison
        });
        return;
      }
      if (runSubresource.resource === "review-audit") {
        const workflow = await readPersistedReviewWorkflow(runSubresource.runId);
        if (!canExportReviewAudit({ roles: context.roles, actorId: context.actorId, workflow })) {
          sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
          return;
        }
        const [actions, comments, findings, dispositions] = await Promise.all([
          readPersistedReviewActions(runSubresource.runId),
          readPersistedReviewComments(runSubresource.runId),
          readPersistedFindings(runSubresource.runId),
          readPersistedFindingDispositions(runSubresource.runId)
        ]);
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          export_schema: buildExportEnvelope("review_audit.v1", {
            workflow,
            actions,
            comments,
            summary: buildReviewSummary({ workflow, findings, actions, comments, dispositions }),
            finding_dispositions: dispositions
          }),
          review_audit: {
            workflow,
            actions,
            comments,
            summary: buildReviewSummary({ workflow, findings, actions, comments, dispositions }),
            finding_dispositions: dispositions
          }
        });
        return;
      }
      if (runSubresource.resource === "outbound-preview") {
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          outbound_preview: await buildOutboundPreviewForRun(run)
        });
        return;
      }
      if (runSubresource.resource === "outbound-approval") {
        sendJson(res, 200, { run_id: runSubresource.runId, outbound_approval: await readPersistedStageArtifact(runSubresource.runId, "outbound-approval") });
        return;
      }
      if (runSubresource.resource === "outbound-send") {
        sendJson(res, 200, { run_id: runSubresource.runId, outbound_send: await readPersistedStageArtifact(runSubresource.runId, "outbound-send") });
        return;
      }
      if (runSubresource.resource === "outbound-verification") {
        sendJson(res, 200, { run_id: runSubresource.runId, outbound_verification: await readPersistedStageArtifact(runSubresource.runId, "outbound-verification") });
        return;
      }
      if (runSubresource.resource === "outbound-delivery") {
        sendJson(res, 200, { run_id: runSubresource.runId, outbound_delivery: await readPersistedStageArtifact(runSubresource.runId, "outbound-delivery") });
        return;
      }
      if (runSubresource.resource === "supervisor-review") {
        sendJson(res, 200, { run_id: runSubresource.runId, supervisor_review: await readPersistedSupervisorReview(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "remediation") {
        sendJson(res, 200, { run_id: runSubresource.runId, remediation_memo: await readPersistedRemediationMemo(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "summary") {
        sendJson(res, 200, { summary: await buildRunSummary(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "preflight") {
        sendJson(res, 200, { run_id: runSubresource.runId, preflight: await readPersistedStageArtifact(runSubresource.runId, "preflight-summary") });
        return;
      }
      if (runSubresource.resource === "launch-intent") {
        sendJson(res, 200, { run_id: runSubresource.runId, launch_intent: await readPersistedStageArtifact(runSubresource.runId, "launch-intent") });
        return;
      }
      if (runSubresource.resource === "sandbox-execution") {
        sendJson(res, 200, { run_id: runSubresource.runId, sandbox_execution: await readPersistedStageArtifact(runSubresource.runId, "sandbox-execution") });
        return;
      }
      if (runSubresource.resource === "commit-diff") {
        sendJson(res, 200, { run_id: runSubresource.runId, commit_diff: await readPersistedCommitDiff(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "stage-executions") {
        sendJson(res, 200, { run_id: runSubresource.runId, stage_executions: await readPersistedStageExecutions(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "publishability") {
        sendJson(res, 200, { run_id: runSubresource.runId, publishability: await readPersistedReviewDecision(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "policy-application") {
        sendJson(res, 200, { run_id: runSubresource.runId, policy_application: await readPersistedPolicyApplication(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "resolved-config") {
        sendJson(res, 200, { run_id: runSubresource.runId, resolved_configuration: await readPersistedResolvedConfiguration(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "correction-plan") {
        sendJson(res, 200, { run_id: runSubresource.runId, correction_plan: await readPersistedCorrectionPlan(runSubresource.runId) });
        return;
      }
      if (runSubresource.resource === "correction-result") {
        sendJson(res, 200, { run_id: runSubresource.runId, correction_result: await readPersistedCorrectionResult(runSubresource.runId) });
        return;
      }

      sendJson(res, 200, { run_id: runSubresource.runId, persistence: await readPersistedPersistenceSummary(runSubresource.runId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isMissing = /ENOENT/i.test(message) || message === "run_not_found";
      sendJson(res, isMissing ? 404 : 400, { error: isMissing ? "run_artifact_not_found" : message, run_id: runSubresource.runId });
    }
    return;
  }

    sendJson(res, 404, { error: "not_found" });
  });
}

const entryHref = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryHref && import.meta.url === entryHref) {
  const server = createApiServer();
  listenWithFriendlyErrors({ server, host, port, serviceName: "API", portEnvVar: "PORT", onListening: () => {
    console.log(`API listening on http://${host}:${port}`);
  } });
}


