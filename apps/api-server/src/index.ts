import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { listenWithFriendlyErrors } from "../../shared/src/listen.js";
import { compareBenchmarkReports, listBenchmarkSuites, loadBenchmarkSuite, runBenchmarkSuite, selectBenchmarkCases } from "../../cli/src/benchmark-suite.js";
import { buildRuntimeSetupPlan, executeRuntimeSetupPlan, runtimeSetupCommandLine } from "../../cli/src/setup-runtime.js";
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
  getControlCatalog,
  getMethodologyArtifact,
  getStaticBaselineMethodology,
  listBuiltinLlmProviders,
  listBuiltinLlmProviderPresets,
  attachLlmProviderCredentialStatus,
  listBuiltinIntegrations,
  attachIntegrationCredentialStatus,
  createArtifactRetentionScheduler,
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
  readPersistedStageArtifacts,
  readPersistedStageExecutions,
  readPersistedSupervisorReview,
  readPersistedFindingQuality,
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
  buildFindingQualitySummary,
  createPersistedFindingDisposition,
  updatePersistedFindingDisposition,
  revokePersistedFindingDisposition,
  readPersistedRemediationItemsForRun,
  upsertPersistedRemediationItem,
  updatePersistedRemediationItem,
  resolveFindingDispositions,
  findingDispositionSignature,
  buildFindingEvidenceFingerprint,
  buildMarkdownRunReport,
  buildExecutiveMarkdownReport,
  buildExecutiveSummaryPayload,
  buildTethermarkExportEnvelope,
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
  createLearningExperiment,
  createHumanApprovalRecord,
  listPersistedLearningCandidates,
  listPersistedLearningEvents,
  listPersistedLearningExperiments,
  listPersistedLearningJobs,
  listPersistedLearningPromotions,
  learningSynthesisApprovalSubject,
  normalizeLearningSettings,
  promoteLearningCandidate,
  readPersistedLearningCandidate,
  rejectLearningCandidate,
  rollbackLearningPromotion,
  runLearningPipeline,
  syncLearningEventsForScope,
  syncLearningEventsForRun,
  buildPreflightSummary,
  buildStaticToolsReadiness,
  buildRuntimeExecutionPolicy,
  buildRuntimeSandboxReadiness,
  getRuntimeSandboxProviders,
  normalizeRuntimeSandboxSettings,
  archivePersistedSystemPolicy,
  createPersistedSystemPolicy,
  createPersistedSystemPolicyVersion,
  deactivatePersistedSystemPolicyBinding,
  ensureBuiltinSystemPolicies,
  exportSystemPolicy,
  getPersistedSystemPolicy,
  importSystemPolicy,
  listBuiltinSystemPolicyTemplates,
  publishPersistedSystemPolicy,
  resolveAndApplySystemPolicy,
  readPersistedPolicyResolutionSnapshot,
  rollbackPersistedSystemPolicy,
  setDefaultPersistedSystemPolicy,
  upsertPersistedSystemPolicyBinding,
  validatePersistedSystemPolicy,
  canCommentOnReview,
  canExportReviewAudit,
  canPerformReviewAction,
  buildGithubOutboundPreview,
  normalizeGithubIntegrationPolicy,
  assistantEnabled,
  createDefaultAssistantToolRegistry,
  DefaultAssistantContextBuilder,
  deriveAssistantSessionScope,
  EvidenceGroundedAssistantProvider,
  LlmBackedAssistantProvider,
  resolveAssistantProductMode,
  SqliteAssistantStorage,
  normalizeActorId,
  normalizeProjectId,
  normalizeWorkspaceId,
  type PersistenceReadOptions,
  type ReviewActorRole,
  type GenericWebhookEventType,
  type OutboundApprovalArtifact,
  type OutboundSendArtifact,
  type OutboundVerificationArtifact,
  type AuditRequest,
  type AssistantActionProposalRecord,
  type AssistantSessionRecord,
  type AssistantScopeType,
  type ArtifactRetentionKind,
  type PersistedProjectRecord,
  type RemediationItemStatus,
  type PersistedRunListItem,
  type PersistedTargetListItem
} from "../../../packages/core-engine/src/index.js";

loadEnvironment();

const engine = createEngine();
const TETHERMARK_VERSION = process.env.TETHERMARK_VERSION ?? "0.2.0";
const assistantToolRegistry = createDefaultAssistantToolRegistry();
const assistantContextBuilder = new DefaultAssistantContextBuilder();
const assistantProvider = new LlmBackedAssistantProvider(new EvidenceGroundedAssistantProvider());
const asyncJobs = new PersistedAsyncJobManager(engine, {
  onTerminalJob: async ({ job, attempt, rootDirOrOptions }) => {
    await markRuntimeFollowupJobTerminal({
      jobId: job.job_id,
      status: job.status,
      linkedRunId: attempt.run_id,
      rootDirOrOptions
    });
    if (!attempt.run_id) return;
    try {
      const settingsResolution = await resolvePersistedUiSettings(rootDirOrOptions, {
        workspaceId: job.workspace_id,
        projectId: job.project_id
      });
      const learningSettings = normalizeLearningSettings(settingsResolution.effective.learning_json);
      if (learningSettings.enabled
        && learningSettings.event_driven_enabled
        && ["event_driven", "hybrid"].includes(learningSettings.trigger_mode)) {
        await runLearningPipeline({
          rootDir: typeof rootDirOrOptions === "string" ? rootDirOrOptions : rootDirOrOptions?.rootDir,
          dbMode: typeof rootDirOrOptions === "string" ? "local" : rootDirOrOptions?.dbMode ?? "local",
          workspaceId: job.workspace_id,
          projectId: job.project_id,
          runId: attempt.run_id,
          trigger: "run_completed",
          actorId: "system_async",
          settings: settingsResolution.effective.learning_json,
          providers: settingsResolution.effective.providers_json
        });
      }
    } catch (error) {
      console.warn("Learning trigger failed after terminal job:", error);
    }
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
  | "agent-trace"
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
  | "remediation-items"
  | "learning"
  | "exports"
  | "finding-dispositions"
  | "finding-evaluations"
  | "finding-integrity-pre-supervisor"
  | "post-supervisor-integrity"
  | "finding-quality"
  | "webhook-deliveries"
  | "report-markdown"
  | "report-sarif"
  | "report-executive"
  | "report-compare"
  | "sandbox-execution"
  | "runtime-validation"
  | "review-audit"
  | "outbound-preview"
  | "outbound-verification"
  | "supervisor-review"
  | "remediation"
  | "summary"
  | "preflight"
  | "launch-intent"
  | "resolved-system-policy"
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
  return buildTethermarkExportEnvelope({
    schemaName,
    tethermarkVersion: TETHERMARK_VERSION,
    payload
  });
}

function canGovernLearning(context: { roles: ReviewActorRole[] }): boolean {
  return context.roles.some((role) => role === "admin" || role === "triage_lead" || role === "reviewer");
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
      { export_type: "finding_quality", format: "json", filename: `${runId}-finding-quality.json`, route: `/runs/${encodeURIComponent(runId)}/finding-quality`, schema_name: "finding_quality.v1" },
      { export_type: "review_audit", format: "json", filename: `${runId}-review-audit.json`, route: `/runs/${encodeURIComponent(runId)}/review-audit`, schema_name: "review_audit.v1" },
      { export_type: "resolved_system_policy", format: "json", filename: `${runId}-resolved-system-policy.json`, route: `/runs/${encodeURIComponent(runId)}/resolved-system-policy`, schema_name: "resolved_system_policy.v1" },
      { export_type: "learning_candidates", format: "json", filename: `${runId}-learning-candidates.json`, route: `/runs/${encodeURIComponent(runId)}/learning`, schema_name: "learning_candidates.v1" },
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

function describeControlCrosswalk(control: any): {
  source_framework: string;
  mapped_frameworks: string[];
  evidence_providers: string[];
  mapping_basis: "direct_tool_check" | "standards_crosswalk" | "internal_methodology";
  methodology_note: string;
} {
  const providerMap: Record<string, string[]> = {
    "openssf.security_policy": ["repo_analysis", "scorecard"],
    "openssf.dependency_update_tool": ["repo_analysis", "scorecard"],
    "openssf.pinned_dependencies": ["repo_analysis", "scorecard", "trivy"],
    "openssf.token_permissions": ["repo_analysis", "scorecard", "semgrep"],
    "openssf.dangerous_workflow": ["scorecard", "semgrep"],
    "openssf.branch_protection": ["scorecard"],
    "slsa.pinned_build_dependencies": ["repo_analysis", "semgrep"],
    "slsa.provenance": ["repo_analysis"],
    "nist_ssdf.disclosure_process": ["repo_analysis", "scorecard"],
    "nist_ssdf.automated_security_checks": ["repo_analysis", "scorecard", "semgrep", "trivy"],
    "owasp_llm.prompt_injection_guardrails": ["repo_analysis", "semgrep"],
    "owasp_llm.sensitive_information_disclosure": ["repo_analysis", "trivy", "semgrep"],
    "owasp_agentic.tool_misuse_boundary": ["repo_analysis", "semgrep"],
    "mitre_atlas.tool_misuse_mitigation": ["repo_analysis", "semgrep"],
    "harness_internal.audit_traceability": ["repo_analysis"],
    "harness_internal.security_logging": ["repo_analysis"],
    "harness_internal.eval_harness_presence": ["repo_analysis"],
    "harness_internal.architecture_evidence": ["repo_analysis"],
    "harness_internal.agent_tool_allowlist": ["repo_analysis", "semgrep"],
    "harness_internal.agent_permission_boundaries": ["repo_analysis", "semgrep"],
    "harness_internal.untrusted_content_prompt_injection": ["repo_analysis", "semgrep"],
    "harness_internal.secret_env_isolation": ["repo_analysis", "trivy", "semgrep"],
    "harness_internal.mcp_plugin_permissions": ["repo_analysis", "semgrep"],
    "harness_internal.browser_automation_safety": ["repo_analysis", "semgrep"],
    "harness_internal.telemetry_log_redaction": ["repo_analysis"]
  };
  const mappedFrameworkMap: Record<string, string[]> = {
    "nist_ssdf.disclosure_process": ["OpenSSF Scorecard / Security-Policy"],
    "nist_ssdf.automated_security_checks": ["OpenSSF Scorecard", "Semgrep", "Trivy"],
    "slsa.pinned_build_dependencies": ["OpenSSF Scorecard / Pinned-Dependencies"],
    "owasp_agentic.tool_misuse_boundary": ["MITRE ATLAS / Tool misuse mitigation"],
    "mitre_atlas.tool_misuse_mitigation": ["OWASP Agentic Applications / Tool misuse boundaries"],
    "harness_internal.agent_tool_allowlist": ["OWASP Agentic Applications", "MITRE ATLAS"],
    "harness_internal.agent_permission_boundaries": ["OWASP Agentic Applications", "MITRE ATLAS"],
    "harness_internal.untrusted_content_prompt_injection": ["OWASP LLM Applications", "NIST AI RMF"],
    "harness_internal.secret_env_isolation": ["OWASP LLM Applications", "NIST AI RMF"],
    "harness_internal.mcp_plugin_permissions": ["OWASP Agentic Applications", "MITRE ATLAS"],
    "harness_internal.browser_automation_safety": ["OWASP Agentic Applications", "NIST AI RMF"],
    "harness_internal.telemetry_log_redaction": ["NIST AI RMF", "NIST SP 800-218A"],
    "harness_internal.audit_traceability": ["NIST SSDF", "NIST AI RMF"],
    "harness_internal.security_logging": ["NIST SSDF", "NIST AI RMF"],
    "harness_internal.eval_harness_presence": ["NIST SSDF", "NIST SP 800-218A"],
    "harness_internal.architecture_evidence": ["NIST AI RMF", "NIST SP 800-218A"]
  };
  const isHarnessInternal = String(control.control_id || "").startsWith("harness_internal.");
  const isOpenSsf = control.framework === "OpenSSF Scorecard";
  const isDirect = isOpenSsf || ["slsa.pinned_build_dependencies", "owasp_llm.sensitive_information_disclosure"].includes(control.control_id);
  return {
    source_framework: control.framework,
    mapped_frameworks: mappedFrameworkMap[control.control_id] ?? [],
    evidence_providers: providerMap[control.control_id] ?? ["repo_analysis"],
    mapping_basis: isHarnessInternal ? "internal_methodology" : isDirect ? "direct_tool_check" : "standards_crosswalk",
    methodology_note: isHarnessInternal
      ? "Harness-defined control used to operationalize external AI security, evidence-readiness, and auditability concerns."
      : isDirect
        ? "Tool-native or directly observable evidence is used as the primary assessment signal."
        : "Engine-owned standards crosswalk maps tool and repository evidence into this framework control."
  };
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
  learning?: Record<string, unknown>;
};

const LLM_AGENT_ENV_PREFIXES: Record<string, string[]> = {
  planner_agent: ["AUDIT_LLM_PLANNER"],
  threat_model_agent: ["AUDIT_LLM_THREAT_MODEL"],
  eval_selection_agent: ["AUDIT_LLM_EVIDENCE_SELECTION"],
  lane_specialist_agent: ["AUDIT_LLM_AREA_REVIEW"],
  audit_supervisor_agent: ["AUDIT_LLM_SUPERVISOR"],
  remediation_agent: ["AUDIT_LLM_REMEDIATION"],
  learning_synthesizer_agent: ["AUDIT_LLM_LEARNING_SYNTHESIZER"]
};
const ASSISTANT_LLM_ENV_PREFIX = "AUDIT_LLM_ASSISTANT";
const MASKED_SECRET_PLACEHOLDER = "************";
const STATIC_TOOLS_PATH_ENV = "HARNESS_STATIC_TOOLS_PATH";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = readEnv(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stringifyEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function parseEnvFileValue(contents: string, key: string): { exists: boolean; value: string } {
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match || match[1] !== key) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return { exists: true, value };
  }
  return { exists: false, value: "" };
}

async function readEnvFileValue(key: string): Promise<{ env_path: string; env_file_exists: boolean; file_value: string; effective_value: string; delimiter: string }> {
  const envPath = path.resolve(process.cwd(), ".env");
  let contents = "";
  let envFileExists = true;
  try {
    contents = await fs.readFile(envPath, "utf8");
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    envFileExists = false;
  }
  const parsed = parseEnvFileValue(contents, key);
  return {
    env_path: envPath,
    env_file_exists: envFileExists,
    file_value: parsed.value,
    effective_value: process.env[key] ?? parsed.value,
    delimiter: path.delimiter
  };
}

async function writeEnvFileValue(key: string, value: string): Promise<{ env_path: string; env_file_exists: boolean; file_value: string; effective_value: string; delimiter: string }> {
  if (/[\r\n]/.test(value)) {
    throw new Error("env_value_must_be_single_line");
  }
  const envPath = path.resolve(process.cwd(), ".env");
  let contents = "";
  let envFileExists = true;
  try {
    contents = await fs.readFile(envPath, "utf8");
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    envFileExists = false;
  }
  const trimmedValue = value.trim();
  const lines = contents ? contents.split(/\r?\n/) : [];
  let wrote = false;
  const nextLines: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || match[1] !== key) {
      nextLines.push(line);
      continue;
    }
    if (!trimmedValue) {
      wrote = true;
      continue;
    }
    if (!wrote) {
      nextLines.push(`${key}=${trimmedValue}`);
      wrote = true;
    }
  }
  if (!wrote && trimmedValue) nextLines.push(`${key}=${trimmedValue}`);
  const nextContents = `${nextLines.join("\n").replace(/\n*$/, "")}${nextLines.length ? "\n" : ""}`;
  await fs.writeFile(envPath, nextContents, "utf8");
  if (trimmedValue) process.env[key] = trimmedValue;
  else delete process.env[key];
  return {
    env_path: envPath,
    env_file_exists: envFileExists || true,
    file_value: trimmedValue,
    effective_value: process.env[key] ?? "",
    delimiter: path.delimiter
  };
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
  const envAssistantModel = readEnv(`${ASSISTANT_LLM_ENV_PREFIX}_MODEL`);
  const envAssistantProvider = readEnv(`${ASSISTANT_LLM_ENV_PREFIX}_PROVIDER`) ?? inferLlmProviderForModel(envAssistantModel);
  const assistantCanUseEnv = currentProviders.assistant_inherit_default !== false
    && !currentProviders.assistant_provider
    && !currentProviders.assistant_model;
  if (assistantCanUseEnv && (envAssistantProvider || envAssistantModel)) {
    nextProviders.assistant_inherit_default = false;
    nextProviders.assistant_provider = envAssistantProvider || "";
    nextProviders.assistant_model = envAssistantModel || "";
  } else {
    nextProviders.assistant_inherit_default = currentProviders.assistant_inherit_default !== false;
    nextProviders.assistant_provider = currentProviders.assistant_provider || "";
    nextProviders.assistant_model = currentProviders.assistant_model || "";
  }
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
    assistant_provider: readEnv(`${ASSISTANT_LLM_ENV_PREFIX}_PROVIDER`) ?? inferLlmProviderForModel(readEnv(`${ASSISTANT_LLM_ENV_PREFIX}_MODEL`)) ?? null,
    assistant_provider_env_var: readEnv(`${ASSISTANT_LLM_ENV_PREFIX}_PROVIDER`) ? `${ASSISTANT_LLM_ENV_PREFIX}_PROVIDER` : null,
    assistant_model: readEnv(`${ASSISTANT_LLM_ENV_PREFIX}_MODEL`) ?? null,
    assistant_model_env_var: readEnv(`${ASSISTANT_LLM_ENV_PREFIX}_MODEL`) ? `${ASSISTANT_LLM_ENV_PREFIX}_MODEL` : null,
    default_api_key_configured: Boolean(defaultApiKey),
    default_api_key_env_var: defaultApiKey,
    default_api_key_value: null,
    agent_overrides: agentOverrides
  };
}

function resolveAssistantModelConfig(settings: any) {
  const providers = settings?.providers_json && typeof settings.providers_json === "object"
    ? settings.providers_json as Record<string, any>
    : {};
  const envModel = readEnv(`${ASSISTANT_LLM_ENV_PREFIX}_MODEL`);
  const envProvider = readEnv(`${ASSISTANT_LLM_ENV_PREFIX}_PROVIDER`) ?? inferLlmProviderForModel(envModel);
  const canUseEnv = providers.assistant_inherit_default !== false && !providers.assistant_provider && !providers.assistant_model;
  if (canUseEnv && (envProvider || envModel)) {
    return {
      inherit_default: false,
      provider: envProvider ?? null,
      model: envModel ?? null,
      source: "environment" as const
    };
  }
  if (providers.assistant_inherit_default === false) {
    return {
      inherit_default: false,
      provider: providers.assistant_provider || null,
      model: providers.assistant_model || null,
      source: providers.assistant_provider || providers.assistant_model ? "assistant_override" as const : "unset" as const
    };
  }
  return {
    inherit_default: true,
    provider: providers.default_provider || null,
    model: providers.default_model || null,
    source: providers.default_provider || providers.default_model ? "global_default" as const : "unset" as const
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

interface CodexCommandProbe {
  command_available: boolean;
  executable_ready: boolean;
  execution_status: "ready" | "command_missing" | "command_inaccessible" | "status_failed" | "status_timeout" | "spawn_failed";
  execution_note: string;
}

const DEFAULT_CODEX_STATUS_TIMEOUT_MS = 10_000;
const MAX_CODEX_STATUS_TIMEOUT_MS = 30_000;

function resolveCodexCommand(configuredCommand: string): CodexCommandResolution {
  const command = configuredCommand.trim() || "codex";
  const executable = process.platform === "win32" && command.toLowerCase() === "codex" ? "codex.exe" : command;
  return {
    command: executable,
    argsPrefix: [],
    displayCommand: executable,
    note: "Tethermark never downloads or installs Codex during a status check or audit. Install the CLI explicitly if this command is unavailable."
  };
}

function buildCodexArgs(resolution: CodexCommandResolution, args: string[]): string[] {
  return [...resolution.argsPrefix, ...args];
}

function codexStatusTimeoutMs(): number {
  const configured = Number.parseInt(readEnv("AUDIT_LLM_CODEX_STATUS_TIMEOUT_MS") ?? "", 10);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_CODEX_STATUS_TIMEOUT_MS;
  return Math.min(configured, MAX_CODEX_STATUS_TIMEOUT_MS);
}

function codexCommandProbeFailure(error: unknown): CodexCommandProbe {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "ENOENT") {
    return {
      command_available: false,
      executable_ready: false,
      execution_status: "command_missing",
      execution_note: "The configured Codex CLI command was not found. Install Codex or set the advanced Codex CLI command to a runnable executable."
    };
  }
  if (code === "EACCES" || code === "EPERM") {
    return {
      command_available: false,
      executable_ready: false,
      execution_status: "command_inaccessible",
      execution_note: "The configured Codex CLI command exists but the API server cannot execute it. Configure a standalone runnable Codex CLI executable."
    };
  }
  return {
    command_available: false,
    executable_ready: false,
    execution_status: "spawn_failed",
    execution_note: "The configured Codex CLI command could not be started. Check the advanced Codex CLI command and try again."
  };
}

async function resolvesToProtectedWindowsApp(command: string): Promise<boolean> {
  if (process.platform !== "win32" || path.isAbsolute(command) || command.includes("/") || command.includes("\\")) return false;
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const whereCommand = path.join(systemRoot, "System32", "where.exe");
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let stdout = "";
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(whereCommand, [command], {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
        shell: false
      });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, 2_000);
    child.stdout?.on("data", (chunk: Buffer | string) => {
      if (stdout.length < 8_192) stdout += String(chunk).slice(0, 8_192 - stdout.length);
    });
    child.once("error", () => finish(false));
    child.once("close", (code) => {
      if (code !== 0) {
        finish(false);
        return;
      }
      const firstMatch = stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean) ?? "";
      finish(firstMatch.toLowerCase().includes("\\program files\\windowsapps\\"));
    });
  });
}

async function probeCodexCommand(resolution: CodexCommandResolution): Promise<CodexCommandProbe> {
  if (await resolvesToProtectedWindowsApp(resolution.command)) {
    return codexCommandProbeFailure({ code: "EPERM" });
  }
  return await new Promise<CodexCommandProbe>((resolve) => {
    let settled = false;
    let spawned = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (result: CodexCommandProbe): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(resolution.command, buildCodexArgs(resolution, ["login", "status"]), {
        stdio: "ignore",
        windowsHide: true,
        shell: false
      });
    } catch (error) {
      finish(codexCommandProbeFailure(error));
      return;
    }
    const timeoutMs = codexStatusTimeoutMs();
    timer = setTimeout(() => {
      child.kill();
      finish({
        command_available: spawned,
        executable_ready: false,
        execution_status: "status_timeout",
        execution_note: `Codex CLI authentication verification exceeded the ${timeoutMs} ms safety limit.`
      });
    }, timeoutMs);
    child.once("spawn", () => {
      spawned = true;
    });
    child.once("error", (error) => {
      finish(codexCommandProbeFailure(error));
    });
    child.once("close", (code) => {
      if (code === 0) {
        finish({
          command_available: true,
          executable_ready: true,
          execution_status: "ready",
          execution_note: "The configured Codex CLI completed its bounded authentication status check."
        });
        return;
      }
      finish({
        command_available: true,
        executable_ready: false,
        execution_status: "status_failed",
        execution_note: "The configured Codex CLI ran, but its authentication status check did not succeed. Run Codex login and try again."
      });
    });
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function codexHomeDirectory(): string {
  const configured = readEnv("CODEX_HOME");
  if (configured) return configured;
  const home = process.env.USERPROFILE || process.env.HOME;
  return home ? path.join(home, ".codex") : ".codex";
}

async function readCodexAuthFileStatus(): Promise<Record<string, unknown> | null> {
  const authPath = path.join(codexHomeDirectory(), "auth.json");
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(await fs.readFile(authPath, "utf8")) as Record<string, any>;
  } catch {
    return null;
  }
  const authMode = typeof parsed.auth_mode === "string" ? parsed.auth_mode : null;
  const tokens = parsed.tokens && typeof parsed.tokens === "object" ? parsed.tokens as Record<string, unknown> : {};
  const accessToken = typeof tokens.access_token === "string" ? tokens.access_token : "";
  const idToken = typeof tokens.id_token === "string" ? tokens.id_token : "";
  const refreshToken = typeof tokens.refresh_token === "string" ? tokens.refresh_token : "";
  const apiKey = typeof parsed.OPENAI_API_KEY === "string" && parsed.OPENAI_API_KEY.trim() ? parsed.OPENAI_API_KEY.trim() : "";
  const tokenPayload = decodeJwtPayload(accessToken) ?? decodeJwtPayload(idToken);
  const exp = typeof tokenPayload?.exp === "number" ? tokenPayload.exp : null;
  const expiresAt = exp ? new Date(exp * 1000).toISOString() : null;
  const expired = exp ? exp * 1000 <= Date.now() : false;
  const openaiAuth = tokenPayload?.["https://api.openai.com/auth"];
  const planType = openaiAuth && typeof openaiAuth === "object" && "chatgpt_plan_type" in openaiAuth
    ? String((openaiAuth as Record<string, unknown>).chatgpt_plan_type ?? "")
    : null;
  const hasChatGptTokens = Boolean(accessToken && idToken && refreshToken);
  if (authMode === "chatgpt" && hasChatGptTokens && !expired) {
    return {
      connected: true,
      status: "connected",
      credential_source: "codex_auth_file",
      auth_mode: "chatgpt",
      expires_at: expiresAt,
      chatgpt_plan_type: planType,
      note: "Codex ChatGPT OAuth credentials are present in the local Codex auth file."
    };
  }
  if (apiKey) {
    return {
      connected: true,
      status: "connected",
      credential_source: "codex_auth_file",
      auth_mode: "api_key",
      note: "Codex API key credentials are present in the local Codex auth file."
    };
  }
  return {
    connected: false,
    status: expired ? "expired" : "not_connected",
    credential_source: "codex_auth_file",
    auth_mode: authMode,
    expires_at: expiresAt,
    note: expired
      ? "Codex auth file is present, but the cached access token is expired. Run codex login or codex login status to refresh it."
      : "Codex auth file is present, but it does not contain complete ChatGPT OAuth or API key credentials."
  };
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
  if (readEnv("HARNESS_LOCAL_OAUTH_CONNECT_DRY_RUN") === "1") {
    return {
      provider_id: "openai_codex",
      command: resolvedCommand.displayCommand,
      status: "started",
      dry_run: true,
      checked_at: new Date().toISOString(),
      note: resolvedCommand.note
        ? `${resolvedCommand.note} Dry run only; no local login command was launched.`
        : "Dry run only; no local login command was launched."
    };
  }
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(resolvedCommand.command, buildCodexArgs(resolvedCommand, ["login"]), {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: false
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  } catch (error) {
    throw new Error(`Codex could not be opened: ${error instanceof Error ? error.message : String(error)}. Install Codex, then try Connect ChatGPT account again.`);
  }
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
  const [authFileStatus, commandProbe] = await Promise.all([
    readCodexAuthFileStatus(),
    probeCodexCommand(resolvedCommand)
  ]);
  const authStatus = authFileStatus ?? {
    connected: false,
    status: "not_connected",
    credential_source: "none",
    note: "No local Codex OAuth session was found. Install Codex explicitly, choose Connect ChatGPT account, and complete sign-in."
  };
  const authenticated = authStatus.connected === true;
  const ready = authenticated && commandProbe.executable_ready;
  const authNote = typeof authStatus.note === "string" ? authStatus.note : "";
  return {
    provider_id: "openai_codex",
    command: resolvedCommand.displayCommand,
    checked_at: new Date().toISOString(),
    ...authStatus,
    connected: authenticated,
    authenticated,
    ...commandProbe,
    ready,
    status: ready
      ? "ready"
      : authenticated
        ? "authenticated_cli_unavailable"
        : authStatus.status,
    note: ready
      ? "ChatGPT authentication is present and the configured Codex CLI is ready for local audits."
      : authenticated
        ? `${authNote} ${commandProbe.execution_note} Local model-backed audits are blocked until both checks pass.`.trim()
        : `${authNote} ${commandProbe.execution_note}`.trim()
  };
}

async function persistLlmEnvironmentSettings(input: UiSettingsBody): Promise<void> {
  const updates: Record<string, string | null | undefined> = {};
  const providers = input.providers && typeof input.providers === "object" ? input.providers as Record<string, any> : {};
  const credentials = input.credentials && typeof input.credentials === "object" ? input.credentials as Record<string, any> : {};
  if (typeof providers.default_provider === "string" && providers.default_provider) updates.AUDIT_LLM_PROVIDER = providers.default_provider;
  if (typeof providers.default_model === "string" && providers.default_model) updates.AUDIT_LLM_MODEL = providers.default_model;
  if (providers.assistant_inherit_default === false) {
    if (typeof providers.assistant_provider === "string" && providers.assistant_provider) updates[`${ASSISTANT_LLM_ENV_PREFIX}_PROVIDER`] = providers.assistant_provider;
    if (typeof providers.assistant_model === "string" && providers.assistant_model) updates[`${ASSISTANT_LLM_ENV_PREFIX}_MODEL`] = providers.assistant_model;
  }
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
  triage_decision?: string | null;
  review_priority?: string | null;
  validation_intent?: string | null;
};

type FindingDispositionUpdateBody = {
  reason?: string;
  notes?: string | null;
  expires_at?: string | null;
  owner_id?: string | null;
  reviewed_at?: string | null;
  review_due_by?: string | null;
  triage_decision?: string | null;
  review_priority?: string | null;
  validation_intent?: string | null;
};

type ArtifactRetentionBody = {
  root?: string;
  kind?: ArtifactRetentionKind;
  older_than_days?: number | null;
  retention_days?: number | null;
  max_gb?: number | null;
  max_bytes?: number | null;
};

type BenchmarkRunBody = {
  case_id?: string;
  case_ids?: string[];
  include_extended?: boolean;
  include_runtime_pending?: boolean;
  execute?: boolean;
  strict?: boolean;
  db_mode?: string;
  llm_provider?: AuditRequest["llm_provider"];
  llm_model?: string;
  use_settings_provider?: boolean;
};

type BenchmarkCompareBody = {
  baseline?: string;
  current?: string;
  baseline_path?: string;
  current_path?: string;
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

function benchmarkReportRoot(): string {
  return path.resolve(process.env.HARNESS_BENCHMARK_REPORT_ROOT ?? path.join(process.cwd(), ".artifacts", "benchmarks"));
}

function safeBenchmarkReportPath(input: string): string {
  const root = benchmarkReportRoot();
  const fileName = path.basename(input);
  const resolved = path.resolve(root, fileName);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("invalid_benchmark_report_path");
  }
  return resolved;
}

async function listBenchmarkReports(): Promise<Array<{
  file_name: string;
  path: string;
  suite_id: string | null;
  suite_version: string | null;
  generated_at: string | null;
  executed: boolean | null;
  selected_cases: number | null;
  passed_cases: number | null;
  failed_cases: number | null;
  dry_run_cases: number | null;
  skipped_cases: number | null;
  size_bytes: number;
  modified_at: string;
}>> {
  const root = benchmarkReportRoot();
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const reports = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map(async (entry) => {
      const reportPath = path.join(root, entry.name);
      const stat = await fs.stat(reportPath);
      let parsed: any = {};
      try {
        parsed = JSON.parse(await fs.readFile(reportPath, "utf8"));
      } catch {
        parsed = {};
      }
      return {
        file_name: entry.name,
        path: reportPath,
        suite_id: typeof parsed.suite_id === "string" ? parsed.suite_id : null,
        suite_version: typeof parsed.suite_version === "string" ? parsed.suite_version : null,
        generated_at: typeof parsed.generated_at === "string" ? parsed.generated_at : null,
        executed: typeof parsed.executed === "boolean" ? parsed.executed : null,
        selected_cases: typeof parsed.selected_cases === "number" ? parsed.selected_cases : null,
        passed_cases: typeof parsed.passed_cases === "number" ? parsed.passed_cases : null,
        failed_cases: typeof parsed.failed_cases === "number" ? parsed.failed_cases : null,
        dry_run_cases: typeof parsed.dry_run_cases === "number" ? parsed.dry_run_cases : null,
        skipped_cases: typeof parsed.skipped_cases === "number" ? parsed.skipped_cases : null,
        size_bytes: stat.size,
        modified_at: stat.mtime.toISOString()
      };
    }));
  return reports.sort((left, right) => String(right.generated_at ?? right.modified_at).localeCompare(String(left.generated_at ?? left.modified_at)));
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

async function applySettingsToAuditRequest(request: AuditRequest, context: RequestContext): Promise<AuditRequest> {
  const scoped = applyRequestContextToAuditRequest(request, context);
  const settingsResolution = await resolvePersistedUiSettings(undefined, context);
  const preflightSettings = settingsResolution.effective.preflight_json && typeof settingsResolution.effective.preflight_json === "object"
    ? settingsResolution.effective.preflight_json as Record<string, unknown>
    : {};
  const hints = scoped.hints && typeof scoped.hints === "object" ? scoped.hints as Record<string, unknown> : {};
  return {
    ...scoped,
    hints: {
      ...hints,
      runtime_sandbox: hints.runtime_sandbox ?? preflightSettings.runtime_sandbox
    }
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

function assistantUnavailable(res: http.ServerResponse): boolean {
  if (assistantEnabled()) return false;
  sendJson(res, 403, { error: "assistant_disabled", guidance: "The Community Edition assistant is disabled by environment override. Remove HARNESS_DISABLE_ASSISTANT or set HARNESS_ENABLE_ASSISTANT=true to enable assistant endpoints." });
  return true;
}

function scopedSessionAllowed(session: { workspace_id: string; project_id: string } | null | undefined, context: RequestContext): boolean {
  return !!session && normalizeWorkspaceId(session.workspace_id) === context.workspaceId && normalizeProjectId(session.project_id) === context.projectId;
}

async function executeAssistantAction(args: {
  proposal: AssistantActionProposalRecord;
  session: AssistantSessionRecord;
  context: RequestContext;
}): Promise<Record<string, unknown>> {
  const payload = args.proposal.payload_json ?? {};
  const payloadRunId = typeof payload.run_id === "string" ? payload.run_id : null;
  if (payloadRunId && args.session.run_id && payloadRunId !== args.session.run_id) {
    throw new Error("assistant_action_scope_mismatch");
  }
  if (args.proposal.action_type === "generate_export") {
    return {
      status: "prepared",
      route: payload.route ?? null,
      export_type: payload.export_type ?? "executive_summary",
      note: "Export route prepared. The caller can download it from the canonical report endpoint."
    };
  }
  if (args.proposal.action_type === "draft_finding_disposition") {
    const runId = String(payload.run_id ?? "");
    const findingId = String(payload.finding_id ?? "");
    const findings = await readPersistedFindings(runId);
    const finding = findings.find((item) => item.id === findingId);
    if (!finding) throw new Error("finding_not_found");
    const disposition = await createPersistedFindingDisposition({
      runId,
      input: {
        disposition_type: payload.disposition_type === "waiver" ? "waiver" : "suppression",
        scope_level: payload.scope_level === "project" ? "project" : "run",
        finding_id: findingId,
        finding_signature: payload.scope_level === "project" ? findingDispositionSignature(finding) : null,
        reason: String(payload.reason ?? "Assistant-confirmed disposition."),
        notes: typeof payload.notes === "string" ? payload.notes : null,
        created_by: args.context.actorId,
        metadata: {
          triage_decision: payload.triage_decision ?? null,
          evidence_fingerprint: buildFindingEvidenceFingerprint(finding),
          assistant_action_id: args.proposal.id
        }
      }
    });
    await triggerLearningForReviewMutation({ runId, context: args.context, source: "assistant_finding_disposition" });
    return { status: "saved", finding_disposition: disposition };
  }
  if (args.proposal.action_type === "add_review_comment") {
    const runId = String(payload.run_id ?? "");
    const body = String(payload.body ?? "").trim();
    const comment = await createPersistedReviewComment({
      runId,
      authorId: args.context.actorId,
      body,
      findingId: typeof payload.finding_id === "string" ? payload.finding_id : null,
      metadata: { assistant_action_id: args.proposal.id }
    });
    return { status: "saved", review_comment: comment };
  }
  if (args.proposal.action_type === "launch_run") {
    const request = payload.request_json as AuditRequest | undefined;
    if (!request || typeof request !== "object") throw new Error("request_required");
    const job = await asyncJobs.createJob({
      request: applyRequestContextToAuditRequest({
        ...request,
        llm_workload_class: request.llm_workload_class ?? "interactive_operator"
      }, args.context)
    });
    return { status: "queued", async_job: job };
  }
  if (args.proposal.action_type === "retry_job") {
    const jobId = String(payload.job_id ?? "");
    const existing = await asyncJobs.getJob(jobId);
    if (!existing || !scopedSessionAllowed(existing.job, args.context)) throw new Error("job_not_found");
    const retried = await asyncJobs.retryJob(jobId);
    if (!retried) throw new Error("job_not_retryable");
    return { status: "queued", async_job: retried };
  }
  if (args.proposal.action_type === "cancel_job") {
    const jobId = String(payload.job_id ?? "");
    const existing = await asyncJobs.getJob(jobId);
    if (!existing || !scopedSessionAllowed(existing.job, args.context)) throw new Error("job_not_found");
    const canceled = await asyncJobs.cancelJob(jobId);
    if (!canceled) throw new Error("job_not_found");
    return { status: "canceled", async_job: canceled };
  }
  if (args.proposal.action_type === "queue_runtime_followup") {
    const followupId = String(payload.followup_id ?? "");
    const followup = await readPersistedRuntimeFollowup(followupId);
    if (!followup) throw new Error("runtime_followup_not_found");
    if (!followup.rerun_request_json) throw new Error("runtime_followup_not_launchable");
    const request = applyRequestContextToAuditRequest({
      ...followup.rerun_request_json,
      llm_workload_class: followup.rerun_request_json.llm_workload_class ?? "interactive_operator",
      requested_by: args.context.actorId,
      hints: {
        ...((followup.rerun_request_json.hints as Record<string, unknown> | null) ?? {}),
        runtime_followup: {
          ...(((followup.rerun_request_json.hints as Record<string, any> | null)?.runtime_followup as Record<string, unknown> | null) ?? {}),
          followup_id: followup.id
        }
      }
    }, args.context);
    const job = await asyncJobs.createJob({
      request
    });
    const launched = await markRuntimeFollowupLaunched({
      id: followupId,
      job: job.job
    });
    return { status: "queued", runtime_followup: launched, async_job: job };
  }
  if (args.proposal.action_type === "external_outbound_preview") {
    return {
      status: "draft_only",
      note: "Community Edition assistant mode can draft external payloads, but automatic connector execution requires Tethermark Cloud or manual operator action."
    };
  }
  throw new Error("assistant_action_not_supported");
}

function originalUserRequestFromAssistantAction(proposal: AssistantActionProposalRecord): string | null {
  const value = proposal.payload_json?.requested_from;
  return typeof value === "string" && value.trim() ? value : null;
}

async function readAssistantActionStateSnapshot(proposal: AssistantActionProposalRecord): Promise<Record<string, unknown> | null> {
  const payload = proposal.payload_json ?? {};
  if (proposal.action_type === "draft_finding_disposition") {
    const runId = typeof payload.run_id === "string" ? payload.run_id : "";
    return {
      run_id: runId,
      finding_id: typeof payload.finding_id === "string" ? payload.finding_id : null,
      dispositions: await readPersistedFindingDispositions(runId)
    };
  }
  if (proposal.action_type === "add_review_comment") {
    const runId = typeof payload.run_id === "string" ? payload.run_id : "";
    return {
      run_id: runId,
      review_comments: await readPersistedReviewComments(runId)
    };
  }
  if (proposal.action_type === "launch_run") {
    return {
      request_json: payload.request_json ?? null
    };
  }
  if (proposal.action_type === "retry_job" || proposal.action_type === "cancel_job") {
    const jobId = typeof payload.job_id === "string" ? payload.job_id : "";
    return {
      job_id: jobId,
      async_job: jobId ? await asyncJobs.getJob(jobId) : null
    };
  }
  if (proposal.action_type === "queue_runtime_followup") {
    const followupId = typeof payload.followup_id === "string" ? payload.followup_id : "";
    return {
      followup_id: followupId,
      runtime_followup: followupId ? await readPersistedRuntimeFollowup(followupId) : null
    };
  }
  return null;
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
  const match = url.pathname.match(/^\/runs\/([^/]+)\/(observability|observations|events|metrics|observability-summary|maintenance|lane-plans|lane-results|lane-specialists|lane-reuse-decisions|evidence-records|findings|control-results|tool-executions|tool-adapters|agent-invocations|agent-trace|artifact-index|score-summary|dimension-scores|usage-summary|review-decision|review-workflow|review-actions|review-comments|review-summary|runtime-followups|remediation-items|learning|exports|finding-dispositions|finding-evaluations|finding-integrity-pre-supervisor|post-supervisor-integrity|finding-quality|webhook-deliveries|report-markdown|report-sarif|report-executive|report-compare|sandbox-execution|runtime-validation|review-audit|outbound-preview|outbound-approval|outbound-send|outbound-verification|outbound-delivery|supervisor-review|remediation|summary|preflight|launch-intent|resolved-system-policy|commit-diff|persistence|stage-executions|publishability|policy-application|resolved-config|correction-plan|correction-result)$/);
  if (!match) return null;
  return { runId: match[1] ?? "", resource: match[2] as RunSubresource };
}

function matchLearningCandidate(url: URL): { candidateId: string; action: "detail" | "experiment" | "promote" | "reject" } | null {
  const match = url.pathname.match(/^\/learning\/candidates\/([^/]+)(?:\/(experiment|promote|reject))?$/);
  if (!match) return null;
  return {
    candidateId: decodeURIComponent(match[1] ?? ""),
    action: (match[2] ?? "detail") as "detail" | "experiment" | "promote" | "reject"
  };
}

function matchLearningPromotion(url: URL): { promotionId: string; action: "rollback" } | null {
  const match = url.pathname.match(/^\/learning\/promotions\/([^/]+)\/(rollback)$/);
  if (!match) return null;
  return {
    promotionId: decodeURIComponent(match[1] ?? ""),
    action: "rollback"
  };
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

function matchRunRemediationItems(url: URL): { runId: string } | null {
  const match = url.pathname.match(/^\/runs\/([^/]+)\/remediation-items$/);
  if (!match) return null;
  return { runId: decodeURIComponent(match[1] ?? "") };
}

function matchRunRemediationItem(url: URL): { runId: string; remediationItemId: string } | null {
  const match = url.pathname.match(/^\/runs\/([^/]+)\/remediation-items\/([^/]+)$/);
  if (!match) return null;
  return {
    runId: decodeURIComponent(match[1] ?? ""),
    remediationItemId: decodeURIComponent(match[2] ?? "")
  };
}

function reviewActionForRemediationStatus(status: RemediationItemStatus) {
  if (status === "open") return "open_remediation";
  if (status === "fix_in_progress") return "mark_fix_in_progress";
  if (status === "fix_ready_for_validation") return "mark_fix_ready_for_validation";
  if (status === "verification_pending") return "mark_verification_pending";
  if (status === "resolved") return "resolve_finding";
  if (status === "reopened") return "reopen_finding";
  return "open_remediation";
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

function matchBenchmarkSuite(url: URL): { suiteId: string } | null {
  const match = url.pathname.match(/^\/benchmarks\/suites\/([^/]+)$/);
  if (!match) return null;
  return { suiteId: decodeURIComponent(match[1] ?? "") };
}

function matchBenchmarkSuiteRun(url: URL): { suiteId: string } | null {
  const match = url.pathname.match(/^\/benchmarks\/suites\/([^/]+)\/run$/);
  if (!match) return null;
  return { suiteId: decodeURIComponent(match[1] ?? "") };
}

function matchBenchmarkReport(url: URL): { fileName: string } | null {
  const match = url.pathname.match(/^\/benchmarks\/reports\/([^/]+)$/);
  if (!match) return null;
  return { fileName: decodeURIComponent(match[1] ?? "") };
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

function matchAssistantSession(url: URL): { sessionId: string } | null {
  const match = url.pathname.match(/^\/assistant\/sessions\/([^/]+)$/);
  if (!match) return null;
  return { sessionId: decodeURIComponent(match[1] ?? "") };
}

function matchAssistantMessages(url: URL): { sessionId: string } | null {
  const match = url.pathname.match(/^\/assistant\/sessions\/([^/]+)\/messages$/);
  if (!match) return null;
  return { sessionId: decodeURIComponent(match[1] ?? "") };
}

function matchAssistantAction(url: URL): { sessionId: string; actionId: string; decision: "confirm" | "reject" } | null {
  const match = url.pathname.match(/^\/assistant\/sessions\/([^/]+)\/actions\/([^/]+)\/(confirm|reject)$/);
  if (!match) return null;
  return {
    sessionId: decodeURIComponent(match[1] ?? ""),
    actionId: decodeURIComponent(match[2] ?? ""),
    decision: (match[3] ?? "reject") as "confirm" | "reject"
  };
}

function matchUiDocument(url: URL): { documentId: string } | null {
  const match = url.pathname.match(/^\/ui\/documents\/([^/]+)$/);
  if (!match) return null;
  return { documentId: decodeURIComponent(match[1] ?? "") };
}

function matchSystemPolicy(url: URL): { policyId: string; action: "detail" | "validate" | "publish" | "archive" | "rollback" | "set-default" | "export" | "bindings" } | null {
  const match = url.pathname.match(/^\/system\/policies\/([^/]+?)(?:\/(validate|publish|archive|rollback|set-default|export|bindings))?$/);
  if (!match) return null;
  return { policyId: decodeURIComponent(match[1]), action: (match[2] || "detail") as "detail" | "validate" | "publish" | "archive" | "rollback" | "set-default" | "export" | "bindings" };
}

function matchSystemPolicyBinding(url: URL): { bindingId: string } | null {
  const match = url.pathname.match(/^\/system\/policy-bindings\/([^/]+)$/);
  return match ? { bindingId: decodeURIComponent(match[1]) } : null;
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

async function buildRunSummary(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<Record<string, unknown>> {
  const [run, scoreSummary, reviewDecision, reviewWorkflow, findings, controlResults, evidenceRecords, toolExecutions, stageExecutions, laneSpecialists, sandboxExecution, findingDispositions, runtimeFollowups] = await Promise.all([
    getPersistedRun(runId, rootDirOrOptions),
    readPersistedScoreSummary(runId, rootDirOrOptions),
    readPersistedReviewDecision(runId, rootDirOrOptions),
    readPersistedReviewWorkflow(runId, rootDirOrOptions),
    readPersistedFindings(runId, rootDirOrOptions),
    readPersistedControlResults(runId, rootDirOrOptions),
    readPersistedEvidenceRecords(runId, rootDirOrOptions),
    readPersistedToolExecutions(runId, rootDirOrOptions),
    readPersistedStageExecutions(runId, rootDirOrOptions),
    readPersistedLaneSpecialistOutputs(runId, rootDirOrOptions),
    readPersistedStageArtifact(runId, "sandbox-execution", rootDirOrOptions),
    readPersistedFindingDispositions(runId, rootDirOrOptions),
    listPersistedRuntimeFollowups({ runId, rootDirOrOptions })
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
    executionConfig: null,
    approval: approval ? { approved_by: approval.approved_by, approved_at: approval.approved_at } : null,
    verification: verification ?? null
  });
}

async function emitConfiguredWebhookForRun(
  runId: string,
  eventType: GenericWebhookEventType,
  triggeredBy: string | null,
  data: Record<string, unknown>,
  rootDirOrOptions?: string | PersistenceReadOptions
): Promise<void> {
  const run = await getPersistedRun(runId, rootDirOrOptions);
  if (!run) return;
  const [summary, settingsResolution, reviewWorkflow, reviewDecision] = await Promise.all([
    buildRunSummary(runId, rootDirOrOptions),
    resolvePersistedUiSettings(rootDirOrOptions, { workspaceId: run.workspace_id, projectId: run.project_id }),
    readPersistedReviewWorkflow(runId, rootDirOrOptions),
    readPersistedReviewDecision(runId, rootDirOrOptions)
  ]);
  const config = normalizeGenericWebhookConfig(settingsResolution.effective.integrations_json as Record<string, unknown>);
  await emitGenericWebhookEvent({
    config,
    run,
    eventType,
    summary,
    triggeredBy,
    rootDirOrOptions,
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
      rootDirOrOptions,
      data: {
        review_workflow_status: reviewWorkflow.status,
        publishability_status: reviewDecision?.publishability_status ?? null,
        trigger: "run_completed"
      }
    });
  }
}

async function triggerLearningForReviewMutation(args: {
  runId: string;
  context: RequestContext;
  source: string;
}): Promise<void> {
  try {
    const run = await getPersistedRun(args.runId);
    if (!runMatchesScope(run, args.context)) return;
    const settingsResolution = await resolvePersistedUiSettings(undefined, {
      workspaceId: args.context.workspaceId,
      projectId: args.context.projectId
    });
    const learningSettings = normalizeLearningSettings(settingsResolution.effective.learning_json);
    if (!learningSettings.enabled
      || !learningSettings.event_driven_enabled
      || !["event_driven", "hybrid"].includes(learningSettings.trigger_mode)) return;
    await runLearningPipeline({
      workspaceId: args.context.workspaceId,
      projectId: args.context.projectId,
      runId: args.runId,
      trigger: "review_action",
      actorId: args.context.actorId,
      settings: settingsResolution.effective.learning_json,
      providers: settingsResolution.effective.providers_json
    });
  } catch (error) {
    console.warn(`Learning review_action trigger failed after ${args.source}:`, error);
  }
}

function learningSchedulerPollMs(): number {
  const parsed = Number(process.env.HARNESS_LEARNING_SCHEDULER_POLL_MS);
  return Number.isFinite(parsed) && parsed >= 10_000 ? parsed : 60_000;
}

function learningSchedulerDisabled(): boolean {
  return /^(1|true|yes)$/i.test(String(process.env.HARNESS_DISABLE_LEARNING_SCHEDULER ?? ""));
}

function sameUtcDay(left: string | null | undefined, right: string): boolean {
  return Boolean(left && left.slice(0, 10) === right.slice(0, 10));
}

function scheduledLearningDue(args: {
  settings: ReturnType<typeof normalizeLearningSettings>;
  jobs: Awaited<ReturnType<typeof listPersistedLearningJobs>>;
  now: Date;
}): boolean {
  if (!args.settings.enabled) return false;
  if (!args.settings.scheduled_enabled) return false;
  if (!["scheduled", "hybrid"].includes(args.settings.trigger_mode)) return false;
  const scheduledJobs = args.jobs.filter((job) => job.trigger === "scheduled");
  const lastScheduled = scheduledJobs[0] ?? null;
  const intervalMs = Math.max(5, args.settings.scheduled_interval_minutes) * 60 * 1000;
  const lastStarted = lastScheduled ? Date.parse(lastScheduled.started_at) : 0;
  if (!lastScheduled || !Number.isFinite(lastStarted) || args.now.getTime() - lastStarted >= intervalMs) {
    return true;
  }
  if (args.settings.llm_nightly_consolidation && args.settings.llm_synthesis_enabled) {
    const today = args.now.toISOString();
    return !scheduledJobs.some((job) => sameUtcDay(job.completed_at || job.started_at, today));
  }
  return false;
}

function createSelfLearningScheduler(): { start(): void; stop(): void } {
  let timer: NodeJS.Timeout | null = null;
  let startupTimer: NodeJS.Timeout | null = null;
  let running = false;
  let stopped = true;

  const tick = async () => {
    if (stopped || running || learningSchedulerDisabled()) return;
    running = true;
    try {
      const workspaceId = "default";
      const projects = await listPersistedProjects(workspaceId).catch(() => []);
      const projectIds = [...new Set(["default", ...projects.map((project) => normalizeProjectId(project.id))])];
      const now = new Date();
      for (const projectId of projectIds) {
        const settingsResolution = await resolvePersistedUiSettings(undefined, { workspaceId, projectId });
        const settings = normalizeLearningSettings(settingsResolution.effective.learning_json);
        const jobs = await listPersistedLearningJobs({ workspaceId, projectId, limit: 100 });
        if (!scheduledLearningDue({ settings, jobs, now })) continue;
        await runLearningPipeline({
          workspaceId,
          projectId,
          trigger: "scheduled",
          actorId: "system_learning_scheduler",
          settings: settingsResolution.effective.learning_json,
          providers: settingsResolution.effective.providers_json
        });
      }
    } catch (error) {
      console.warn("Self-learning scheduler tick failed:", error);
    } finally {
      running = false;
    }
  };

  return {
    start() {
      if (timer || learningSchedulerDisabled()) return;
      stopped = false;
      timer = setInterval(() => { void tick(); }, learningSchedulerPollMs());
      timer.unref?.();
      startupTimer = setTimeout(() => {
        startupTimer = null;
        void tick();
      }, 2_000);
      startupTimer.unref?.();
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (startupTimer) clearTimeout(startupTimer);
      timer = null;
      startupTimer = null;
    }
  };
}

export function createApiServer(options: { enableArtifactRetentionScheduler?: boolean } = {}): http.Server {
  void asyncJobs.recoverJobs();
  const scheduler = createSelfLearningScheduler();
  const artifactRetentionScheduler = options.enableArtifactRetentionScheduler
    ? createArtifactRetentionScheduler({
      onError: (error) => console.warn("Artifact retention scheduler tick failed:", error)
    })
    : null;
  const server = http.createServer(async (req, res) => {
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

  if (req.method === "GET" && url.pathname === "/system/controls") {
    sendJson(res, 200, { control_catalog: getControlCatalog() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/system/audit-packages") {
    sendJson(res, 200, { audit_packages: listBuiltinAuditPackages() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/system/policies") {
    try {
      const policies = await ensureBuiltinSystemPolicies(context.workspaceId);
      const details = (await Promise.all(policies.map((policy) => getPersistedSystemPolicy(policy.id, context.workspaceId)))).filter(Boolean);
      sendJson(res, 200, { policies, policy_details: details, templates: listBuiltinSystemPolicyTemplates(), control_catalog: getControlCatalog(), audit_packages: listBuiltinAuditPackages(), auth: buildAuthInfo() });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/system/policies") {
    if (!context.roles.includes("admin")) {
      sendJson(res, 403, { error: "forbidden", required_roles: ["admin"] });
      return;
    }
    try {
      const body = await readJson<{ id?: string; name?: string; description?: string; template_id?: any; definition?: unknown; reason?: string }>(req);
      if (!body.name) throw new Error("system_policy_name_required");
      const policy = await createPersistedSystemPolicy({ ...body, name: body.name, actor_id: context.actorId, workspace_id: context.workspaceId });
      sendJson(res, 201, { system_policy: policy });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/system/policies/import") {
    if (!context.roles.includes("admin")) {
      sendJson(res, 403, { error: "forbidden", required_roles: ["admin"] });
      return;
    }
    try {
      const body = await readJson<{ payload?: unknown } & Record<string, unknown>>(req);
      const policy = await importSystemPolicy(body.payload ?? body, context.actorId, context.workspaceId);
      sendJson(res, 201, { system_policy: policy });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/system/policies/resolve-preview") {
    try {
      const body = await readJson<{ request?: AuditRequest; target_class?: any }>(req);
      if (!body.request) throw new Error("request_required");
      const configured = await applySettingsToAuditRequest(body.request, context);
      const resolved = await resolveAndApplySystemPolicy(configured, { target_class: body.target_class ?? null });
      sendJson(res, 200, { resolved_policy: resolved.snapshot, effective_request: resolved.request });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const systemPolicyRoute = matchSystemPolicy(url);
  if (systemPolicyRoute) {
    try {
      if (req.method === "GET" && systemPolicyRoute.action === "detail") {
        const detail = await getPersistedSystemPolicy(systemPolicyRoute.policyId, context.workspaceId);
        if (!detail) { sendJson(res, 404, { error: "system_policy_not_found" }); return; }
        sendJson(res, 200, { system_policy: detail });
        return;
      }
      if (req.method === "GET" && systemPolicyRoute.action === "export") {
        const detail = await getPersistedSystemPolicy(systemPolicyRoute.policyId, context.workspaceId);
        if (!detail) { sendJson(res, 404, { error: "system_policy_not_found" }); return; }
        sendJson(res, 200, exportSystemPolicy(detail));
        return;
      }
      if (!context.roles.includes("admin")) { sendJson(res, 403, { error: "forbidden", required_roles: ["admin"] }); return; }
      const body = req.method === "POST" || req.method === "PATCH" ? await readJson<Record<string, any>>(req) : {};
      if (req.method === "PATCH" && systemPolicyRoute.action === "detail") {
        const version = await createPersistedSystemPolicyVersion(systemPolicyRoute.policyId, { definition: body.definition, reason: String(body.reason || "edited in policy administration"), actor_id: context.actorId, workspace_id: context.workspaceId });
        sendJson(res, 200, { policy_version: version });
        return;
      }
      if (req.method === "POST" && systemPolicyRoute.action === "validate") {
        sendJson(res, 200, { validation: await validatePersistedSystemPolicy(systemPolicyRoute.policyId, context.workspaceId, context.actorId) });
        return;
      }
      if (req.method === "POST" && systemPolicyRoute.action === "publish") {
        sendJson(res, 200, { system_policy: await publishPersistedSystemPolicy(systemPolicyRoute.policyId, context.actorId, String(body.reason || "published"), context.workspaceId) });
        return;
      }
      if (req.method === "POST" && systemPolicyRoute.action === "archive") {
        sendJson(res, 200, { system_policy: await archivePersistedSystemPolicy(systemPolicyRoute.policyId, context.actorId, String(body.reason || "archived"), context.workspaceId) });
        return;
      }
      if (req.method === "POST" && systemPolicyRoute.action === "rollback") {
        sendJson(res, 200, { system_policy: await rollbackPersistedSystemPolicy(systemPolicyRoute.policyId, String(body.version_id || ""), context.actorId, String(body.reason || "rollback"), context.workspaceId) });
        return;
      }
      if (req.method === "POST" && systemPolicyRoute.action === "set-default") {
        sendJson(res, 200, { system_policy: await setDefaultPersistedSystemPolicy(systemPolicyRoute.policyId, context.actorId, context.workspaceId) });
        return;
      }
      if (req.method === "POST" && systemPolicyRoute.action === "bindings") {
        sendJson(res, 201, { binding: await upsertPersistedSystemPolicyBinding({ ...body, policy_id: systemPolicyRoute.policyId, actor_id: context.actorId, workspace_id: context.workspaceId } as any) });
        return;
      }
      sendJson(res, 405, { error: "method_not_allowed" });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const systemPolicyBindingRoute = matchSystemPolicyBinding(url);
  if (systemPolicyBindingRoute && req.method === "DELETE") {
    if (!context.roles.includes("admin")) { sendJson(res, 403, { error: "forbidden", required_roles: ["admin"] }); return; }
    try {
      sendJson(res, 200, { binding: await deactivatePersistedSystemPolicyBinding(systemPolicyBindingRoute.bindingId, context.actorId, context.workspaceId) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/assistant/capabilities") {
    const productMode = resolveAssistantProductMode();
    sendJson(res, 200, {
      enabled: assistantEnabled(),
      ...assistantToolRegistry.capabilities(productMode)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/assistant/sessions") {
    if (assistantUnavailable(res)) return;
    const productMode = resolveAssistantProductMode();
    const scopeType = (url.searchParams.get("scope_type") || "run") as AssistantScopeType;
    const scopeId = String(url.searchParams.get("scope_id") || "").trim();
    const contextKey = String(url.searchParams.get("context_key") || "").trim();
    const statusParam = String(url.searchParams.get("status") || "active").trim();
    const sessionStatus = statusParam === "all" || statusParam === "archived" || statusParam === "closed"
      ? statusParam as AssistantSessionRecord["status"] | "all"
      : "active";
    if (!assistantToolRegistry.isScopeAllowed(scopeType, productMode)) {
      sendJson(res, 403, { error: "hosted_only", scope_type: scopeType });
      return;
    }
    const storage = new SqliteAssistantStorage();
    const sessions = (await storage.listSessions({
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      scopeType,
      scopeId: scopeId || undefined,
      status: sessionStatus
    })).filter((session) => {
      if (!contextKey) return true;
      return String(session.metadata_json?.context_key || "") === contextKey;
    });
    const summaries = await Promise.all(sessions.slice(0, 20).map(async (session) => {
      const messages = await storage.listMessages(session.id);
      const firstUser = messages.find((message) => message.role === "user");
      const lastMessage = messages[messages.length - 1] || null;
      return {
        ...session,
        message_count: messages.length,
        title: String(session.metadata_json?.title || firstUser?.body || "New chat").slice(0, 96),
        last_message: lastMessage ? {
          role: lastMessage.role,
          body: lastMessage.body.slice(0, 160),
          created_at: lastMessage.created_at
        } : null
      };
    }));
    sendJson(res, 200, { assistant_sessions: summaries });
    return;
  }

  if (req.method === "POST" && url.pathname === "/assistant/sessions") {
    if (assistantUnavailable(res)) return;
    try {
      const body = await readJson<{ scope_type?: AssistantScopeType; scope_id?: string; context_key?: string; title?: string }>(req);
      const scopeType = body.scope_type ?? "run";
      const scopeId = String(body.scope_id ?? "").trim();
      if (!scopeId) {
        sendJson(res, 400, { error: "scope_id_required" });
        return;
      }
      const productMode = resolveAssistantProductMode();
      if (!assistantToolRegistry.isScopeAllowed(scopeType, productMode)) {
        sendJson(res, 403, { error: "hosted_only", scope_type: scopeType });
        return;
      }
      const assistantContext = await assistantContextBuilder.buildContext({ scopeType, scopeId });
      if (assistantContext.run && !runMatchesScope(assistantContext.run, context)) {
        sendJson(res, 404, { error: "assistant_scope_not_found", scope_type: scopeType, scope_id: scopeId });
        return;
      }
      const settingsResolution = await resolvePersistedUiSettings(undefined, {
        workspaceId: assistantContext.run?.workspace_id,
        projectId: assistantContext.run?.project_id
      });
      const assistantModelConfig = resolveAssistantModelConfig(settingsResolution.effective);
      const storage = new SqliteAssistantStorage();
      const sessionInput = deriveAssistantSessionScope({
        scopeType,
        scopeId,
        context: assistantContext,
        actorId: context.actorId,
        productMode
      });
      const session = await storage.createSession({
        ...sessionInput,
        metadata_json: {
          ...(sessionInput.metadata_json || {}),
          assistant_model_config: assistantModelConfig,
          context_key: typeof body.context_key === "string" ? body.context_key.slice(0, 300) : null,
          title: typeof body.title === "string" ? body.title.slice(0, 120) : null
        }
      });
      sendJson(res, 201, {
        assistant_session: session,
        capabilities: assistantToolRegistry.capabilities(productMode),
        assistant_model_config: assistantModelConfig
      });
    } catch (error) {
      sendJson(res, error instanceof Error && error.message === "hosted_only_scope" ? 403 : 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const assistantSession = ["GET", "PATCH", "DELETE"].includes(req.method || "") ? matchAssistantSession(url) : null;
  if (assistantSession) {
    if (assistantUnavailable(res)) return;
    const storage = new SqliteAssistantStorage();
    const session = await storage.getSession(assistantSession.sessionId);
    if (!scopedSessionAllowed(session, context)) {
      sendJson(res, 404, { error: "assistant_session_not_found", session_id: assistantSession.sessionId });
      return;
    }
    if (req.method === "PATCH") {
      const body = await readJson<{ title?: string | null; status?: AssistantSessionRecord["status"] }>(req);
      const nextTitle = typeof body.title === "string" ? body.title.trim().slice(0, 120) : undefined;
      const nextStatus = body.status === "active" || body.status === "archived" || body.status === "closed"
        ? body.status
        : undefined;
      if (body.status && !nextStatus) {
        sendJson(res, 400, { error: "assistant_session_status_invalid", status: body.status });
        return;
      }
      const metadata = {
        ...(session!.metadata_json || {})
      };
      if (nextTitle !== undefined) {
        if (nextTitle) metadata.title = nextTitle;
        else delete metadata.title;
      }
      const updated = await storage.updateSession({
        ...session!,
        status: nextStatus || session!.status,
        metadata_json: metadata
      });
      sendJson(res, 200, { assistant_session: updated });
      return;
    }
    if (req.method === "DELETE") {
      const updated = await storage.updateSession({
        ...session!,
        status: "deleted"
      });
      sendJson(res, 200, { assistant_session: updated, deleted: true });
      return;
    }
    sendJson(res, 200, { assistant_session: session });
    return;
  }

  const assistantMessages = req.method === "GET" || req.method === "POST" ? matchAssistantMessages(url) : null;
  if (assistantMessages) {
    if (assistantUnavailable(res)) return;
    const storage = new SqliteAssistantStorage();
    const session = await storage.getSession(assistantMessages.sessionId);
    if (!scopedSessionAllowed(session, context)) {
      sendJson(res, 404, { error: "assistant_session_not_found", session_id: assistantMessages.sessionId });
      return;
    }
    if (req.method === "GET") {
      sendJson(res, 200, { assistant_session: session, messages: await storage.listMessages(assistantMessages.sessionId) });
      return;
    }
    try {
      const body = await readJson<{ message?: string }>(req);
      const prompt = String(body.message ?? "").trim();
      if (!prompt) {
        sendJson(res, 400, { error: "message_required" });
        return;
      }
      const userMessage = await storage.appendMessage({
        session_id: session!.id,
        role: "user",
        body: prompt,
        response_json: null
      });
      const assistantContext = await assistantContextBuilder.buildContext({
        scopeType: session!.scope_type,
        scopeId: session!.scope_id
      });
      const settingsResolution = await resolvePersistedUiSettings(undefined, {
        workspaceId: assistantContext.run?.workspace_id,
        projectId: assistantContext.run?.project_id
      });
      const assistantModelConfig = resolveAssistantModelConfig(settingsResolution.effective);
      const capabilities = assistantToolRegistry.capabilities(session!.product_mode);
      const response = await assistantProvider.answer({
        prompt,
        session: session!,
        context: assistantContext,
        capabilities,
        modelConfig: assistantModelConfig
      });
      const assistantMessage = await storage.appendMessage({
        session_id: session!.id,
        role: "assistant",
        body: response.message,
        response_json: response
      });
      const artifacts = await storage.persistResponseArtifacts({
        sessionId: session!.id,
        messageId: assistantMessage.id,
        response
      });
      sendJson(res, 200, {
        assistant_session: session,
        user_message: userMessage,
        assistant_message: assistantMessage,
        response,
        citations: artifacts.citations,
        proposed_actions: artifacts.actions
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), session_id: assistantMessages.sessionId });
    }
    return;
  }

  const assistantAction = req.method === "POST" ? matchAssistantAction(url) : null;
  if (assistantAction) {
    if (assistantUnavailable(res)) return;
    const storage = new SqliteAssistantStorage();
    const session = await storage.getSession(assistantAction.sessionId);
    if (!scopedSessionAllowed(session, context)) {
      sendJson(res, 404, { error: "assistant_session_not_found", session_id: assistantAction.sessionId });
      return;
    }
    const proposal = await storage.getActionProposal(assistantAction.sessionId, assistantAction.actionId);
    if (!proposal) {
      sendJson(res, 404, { error: "assistant_action_not_found", action_id: assistantAction.actionId });
      return;
    }
    if (proposal.status !== "proposed") {
      sendJson(res, 409, { error: "assistant_action_already_resolved", action: proposal });
      return;
    }
    if (assistantAction.decision === "reject") {
      const resolved = await storage.updateActionProposal({
        ...proposal,
        status: "rejected",
        resolved_at: new Date().toISOString(),
        resolved_by: context.actorId
      });
      const execution = await storage.createActionExecution({
        session_id: session!.id,
        action_id: proposal.id,
        actor_id: context.actorId,
        status: "rejected",
        original_user_request: originalUserRequestFromAssistantAction(proposal),
        proposed_action_json: proposal,
        confirmation_result: "rejected",
        before_state_json: await readAssistantActionStateSnapshot(proposal),
        after_state_json: await readAssistantActionStateSnapshot(proposal),
        request_json: proposal.payload_json,
        result_json: { status: "rejected" },
        error: null
      });
      sendJson(res, 200, { assistant_action: resolved, assistant_execution: execution });
      return;
    }
    const capabilities = assistantToolRegistry.capabilities(session!.product_mode);
    if (proposal.hosted_only || !capabilities.enabled_capabilities.includes(proposal.capability)) {
      sendJson(res, 403, { error: "hosted_only", action_type: proposal.action_type, capability: proposal.capability });
      return;
    }
    try {
      const beforeState = await readAssistantActionStateSnapshot(proposal);
      const result = await executeAssistantAction({ proposal, session: session!, context });
      const afterState = await readAssistantActionStateSnapshot(proposal);
      const resolved = await storage.updateActionProposal({
        ...proposal,
        status: "confirmed",
        resolved_at: new Date().toISOString(),
        resolved_by: context.actorId
      });
      const execution = await storage.createActionExecution({
        session_id: session!.id,
        action_id: proposal.id,
        actor_id: context.actorId,
        status: "succeeded",
        original_user_request: originalUserRequestFromAssistantAction(proposal),
        proposed_action_json: proposal,
        confirmation_result: "confirmed",
        before_state_json: beforeState,
        after_state_json: afterState,
        request_json: proposal.payload_json,
        result_json: result,
        error: null
      });
      sendJson(res, 200, { assistant_action: resolved, assistant_execution: execution, result });
    } catch (error) {
      const execution = await storage.createActionExecution({
        session_id: session!.id,
        action_id: proposal.id,
        actor_id: context.actorId,
        status: "failed",
        original_user_request: originalUserRequestFromAssistantAction(proposal),
        proposed_action_json: proposal,
        confirmation_result: "failed",
        before_state_json: await readAssistantActionStateSnapshot(proposal),
        after_state_json: await readAssistantActionStateSnapshot(proposal),
        request_json: proposal.payload_json,
        result_json: null,
        error: error instanceof Error ? error.message : String(error)
      });
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), assistant_execution: execution });
    }
    return;
  }

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
      const request = await applySettingsToAuditRequest(await readJson(req), context);
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
      const configured = await applySettingsToAuditRequest((body.request && typeof body.request === "object" ? body.request : body) as AuditRequest, context);
      const resolved = await resolveAndApplySystemPolicy(configured);
      const summary = await buildPreflightSummary(resolved.request);
      sendJson(res, 200, { preflight: summary, resolved_policy: resolved.snapshot });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/runtime-sandbox/providers") {
    sendJson(res, 200, {
      providers: getRuntimeSandboxProviders()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/runtime-sandbox/setup-plan") {
    const plan = buildRuntimeSetupPlan();
    sendJson(res, 200, {
      runtime_sandbox_setup: {
        plan: plan.map((item) => ({
          ...item,
          command_line: runtimeSetupCommandLine(item)
        })),
        can_auto_install: plan.some((item) => item.auto_run),
        guidance: "Auto install commands are executed only after explicit operator action. Manual steps remain visible when no supported package manager is detected."
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/runtime-sandbox/setup") {
    try {
      const body = await readJson<{ confirm?: boolean }>(req);
      if (!body.confirm) {
        sendJson(res, 400, { error: "confirmation_required", guidance: "Set confirm=true to execute auto-supported runtime setup commands." });
        return;
      }
      const before = buildRuntimeSandboxReadiness();
      const summary = executeRuntimeSetupPlan();
      const after = buildRuntimeSandboxReadiness();
      sendJson(res, 200, {
        runtime_sandbox_setup: {
          ...summary,
          plan: summary.plan.map((item) => ({ ...item, command_line: runtimeSetupCommandLine(item) })),
          skipped: summary.skipped.map((item) => ({ ...item, command_line: runtimeSetupCommandLine(item) })),
          readiness_before: before,
          readiness_after: after
        }
      });
    } catch (error) {
      const setupSummary = error && typeof error === "object" && "setup_summary" in error
        ? (error as { setup_summary?: unknown }).setup_summary
        : null;
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
        runtime_sandbox_setup: setupSummary
      });
    }
    return;
  }

  if ((req.method === "GET" || req.method === "POST") && url.pathname === "/runtime-sandbox/readiness") {
    try {
      const body = req.method === "POST" ? await readJson<{ request?: AuditRequest; settings?: Record<string, unknown>; provider_id?: string }>(req) : {};
      const providerId = body.provider_id ?? url.searchParams.get("provider_id") ?? "local_runtime";
      if (providerId !== "local_runtime") {
        sendJson(res, 403, { error: "hosted_only", provider_id: providerId });
        return;
      }
      const settingsResolution = await resolvePersistedUiSettings(undefined, context);
      const settings = body.settings ?? ((settingsResolution.effective.preflight_json as Record<string, unknown>)?.runtime_sandbox as Record<string, unknown> | undefined);
      const request = body.request ? await applySettingsToAuditRequest(body.request, context) : null;
      const readiness = buildRuntimeSandboxReadiness({
        settings,
        target: request
          ? {
              source_type: request.repo_url ? "repo" : request.local_path ? "path" : request.endpoint_url ? "endpoint" : null,
              trusted: Boolean(request.local_path)
            }
          : null
      });
      sendJson(res, 200, { runtime_sandbox: readiness });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/runtime-sandbox/policy/defaults") {
    const providerId = url.searchParams.get("provider_id") ?? "local_runtime";
    if (providerId !== "local_runtime") {
      sendJson(res, 403, { error: "hosted_only", provider_id: providerId });
      return;
    }
    const settingsResolution = await resolvePersistedUiSettings(undefined, context);
    const settings = normalizeRuntimeSandboxSettings((settingsResolution.effective.preflight_json as Record<string, unknown>)?.runtime_sandbox);
    const readiness = buildRuntimeSandboxReadiness({ settings });
    sendJson(res, 200, {
      runtime_sandbox_settings: settings,
      runtime_execution_policy: buildRuntimeExecutionPolicy({
        settings,
        selectedBackend: readiness.resolution.selected_backend
      })
    });
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

  if (req.method === "GET" && url.pathname === "/static-tools/path") {
    try {
      sendJson(res, 200, {
        static_tools_path: await readEnvFileValue(STATIC_TOOLS_PATH_ENV)
      });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname === "/static-tools/path") {
    try {
      const body = await readJson<{ value?: string }>(req);
      const nextPath = await writeEnvFileValue(STATIC_TOOLS_PATH_ENV, String(body.value ?? ""));
      const settingsResolution = await resolvePersistedUiSettings(undefined, context);
      const preflightSettings = settingsResolution.effective.preflight_json as Record<string, unknown>;
      sendJson(res, 200, {
        static_tools_path: nextPath,
        static_tools: buildStaticToolsReadiness({
          selectedToolIds: preflightSettings.external_audit_tool_ids
        })
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/runs/async") {
    try {
      const body = await readJson<AsyncRunRequestBody>(req);
      if (!body.request) {
        sendJson(res, 400, { error: "request_required" });
        return;
      }
      const configured = await applySettingsToAuditRequest(body.request, context);
      const resolved = await resolveAndApplySystemPolicy(configured);
      const job = await asyncJobs.createJob({
        request: resolved.request,
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

  if (req.method === "GET" && url.pathname === "/learning/events") {
    try {
      const runId = url.searchParams.get("run_id") || undefined;
      if (runId) {
        const runForSync = await getPersistedRun(runId);
        if (!runMatchesScope(runForSync, context)) {
          sendJson(res, 404, { error: "run_not_found", run_id: runId });
          return;
        }
        await syncLearningEventsForRun(runId);
      } else {
        await syncLearningEventsForScope({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          limit: readNumberParam(url, "sync_limit") ?? 100
        });
      }
      const events = await listPersistedLearningEvents({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        runId,
        targetId: url.searchParams.get("target_id") || undefined,
        eventType: (url.searchParams.get("event_type") || undefined) as any,
        limit: readNumberParam(url, "limit") ?? 250
      });
      sendJson(res, 200, {
        export_schema: buildExportEnvelope("learning_events.v1", { learning_events: events }),
        learning_events: events
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/learning/run") {
    try {
      const body = await readJson<{ run_id?: string; sync_limit?: number }>(req);
      const runId = typeof body.run_id === "string" && body.run_id.trim() ? body.run_id.trim() : undefined;
      if (runId) {
        const runForSync = await getPersistedRun(runId);
        if (!runMatchesScope(runForSync, context)) {
          sendJson(res, 404, { error: "run_not_found", run_id: runId });
          return;
        }
      }
      const settingsResolution = await resolvePersistedUiSettings(undefined, context);
      const syncLimit = Number.isFinite(Number(body.sync_limit)) && Number(body.sync_limit) > 0
        ? Math.trunc(Number(body.sync_limit))
        : undefined;
      const learningSettings = {
        ...((settingsResolution.effective.learning_json && typeof settingsResolution.effective.learning_json === "object") ? settingsResolution.effective.learning_json as Record<string, unknown> : {}),
        ...(syncLimit ? { sync_limit: syncLimit } : {})
      };
      const synthesisActorId = getAuthMode() === "none" && context.actorId === "anonymous"
        ? "local-operator"
        : context.actorId;
      const approvedAt = new Date().toISOString();
      const synthesisOperatorApproval = createHumanApprovalRecord({
        approvalId: `operator-learning:${approvedAt}:${synthesisActorId}`,
        action: "learning_model_synthesis",
        subject: learningSynthesisApprovalSubject({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          runId
        }),
        approvedBy: synthesisActorId,
        approvedAt,
        reason: "Operator submitted an explicit learning synthesis request.",
        source: "operator_launch"
      });
      const result = await runLearningPipeline({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        runId,
        trigger: "api",
        actorId: synthesisActorId,
        synthesisOperatorApproval,
        settings: learningSettings,
        providers: settingsResolution.effective.providers_json
      });
      const candidates = await listPersistedLearningCandidates({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        runId,
        targetId: url.searchParams.get("target_id") || undefined,
        status: url.searchParams.get("status") || undefined,
        limit: readNumberParam(url, "limit") ?? 250
      });
      sendJson(res, 200, {
        generated_count: result.job.candidates_generated,
        learning_job: result.job,
        export_schema: buildExportEnvelope("learning_candidates.v1", { learning_candidates: candidates }),
        learning_candidates: candidates
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/learning/candidates") {
    try {
      const runId = url.searchParams.get("run_id") || undefined;
      if (runId) {
        const run = await getPersistedRun(runId);
        if (!runMatchesScope(run, context)) {
          sendJson(res, 404, { error: "run_not_found", run_id: runId });
          return;
        }
      }
      const candidates = await listPersistedLearningCandidates({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        runId,
        targetId: url.searchParams.get("target_id") || undefined,
        status: url.searchParams.get("status") || undefined,
        limit: readNumberParam(url, "limit") ?? 250
      });
      sendJson(res, 200, {
        export_schema: buildExportEnvelope("learning_candidates.v1", { learning_candidates: candidates }),
        learning_candidates: candidates
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/learning/jobs") {
    try {
      const jobs = await listPersistedLearningJobs({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        runId: url.searchParams.get("run_id") || undefined,
        limit: readNumberParam(url, "limit") ?? 50
      });
      sendJson(res, 200, {
        export_schema: buildExportEnvelope("learning_jobs.v1", { learning_jobs: jobs }),
        learning_jobs: jobs
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const learningCandidate = ["GET", "POST"].includes(req.method || "") ? matchLearningCandidate(url) : null;
  if (learningCandidate) {
    try {
      const candidate = await readPersistedLearningCandidate(learningCandidate.candidateId);
      if (!candidate || normalizeWorkspaceId(candidate.workspace_id) !== context.workspaceId || normalizeProjectId(candidate.project_id) !== context.projectId) {
        sendJson(res, 404, { error: "learning_candidate_not_found", candidate_id: learningCandidate.candidateId });
        return;
      }
      if (req.method === "GET" && learningCandidate.action === "detail") {
        const [experiments, promotions] = await Promise.all([
          listPersistedLearningExperiments({ candidateId: candidate.id, workspaceId: context.workspaceId, projectId: context.projectId }),
          listPersistedLearningPromotions({ workspaceId: context.workspaceId, projectId: context.projectId })
        ]);
        sendJson(res, 200, {
          learning_candidate: candidate,
          learning_experiments: experiments,
          learning_promotions: promotions.filter((item) => item.candidate_id === candidate.id)
        });
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method_not_allowed" });
        return;
      }
      if (learningCandidate.action === "experiment") {
        const result = await createLearningExperiment({ candidateId: candidate.id, actorId: context.actorId });
        sendJson(res, 200, {
          export_schema: buildExportEnvelope("learning_experiments.v1", { learning_experiments: [result.experiment] }),
          learning_candidate: result.candidate,
          learning_experiment: result.experiment
        });
        return;
      }
      if (!canGovernLearning(context)) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      if (learningCandidate.action === "promote") {
        const body = await readJson<{ expires_at?: string | null }>(req);
        const result = await promoteLearningCandidate({
          candidateId: candidate.id,
          actorId: context.actorId,
          expiresAt: body.expires_at ?? null
        });
        sendJson(res, 200, {
          export_schema: buildExportEnvelope("learning_promotions.v1", { learning_promotions: [result.promotion] }),
          learning_candidate: result.candidate,
          learning_promotion: result.promotion
        });
        return;
      }
      if (learningCandidate.action === "reject") {
        const body = await readJson<{ reason?: string | null }>(req);
        const rejected = await rejectLearningCandidate({
          candidateId: candidate.id,
          actorId: context.actorId,
          reason: body.reason ?? null
        });
        sendJson(res, 200, { learning_candidate: rejected });
        return;
      }
      sendJson(res, 404, { error: "learning_candidate_action_not_found", action: learningCandidate.action });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), candidate_id: learningCandidate.candidateId });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/learning/promotions") {
    try {
      const promotions = await listPersistedLearningPromotions({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        status: url.searchParams.get("status") || undefined,
        limit: readNumberParam(url, "limit") ?? 250
      });
      sendJson(res, 200, {
        export_schema: buildExportEnvelope("learning_promotions.v1", { learning_promotions: promotions }),
        learning_promotions: promotions
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const learningPromotion = req.method === "POST" ? matchLearningPromotion(url) : null;
  if (learningPromotion) {
    try {
      if (!canGovernLearning(context)) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      const scopedPromotions = await listPersistedLearningPromotions({
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        limit: Number.MAX_SAFE_INTEGER
      });
      if (!scopedPromotions.some((item) => item.id === learningPromotion.promotionId)) {
        sendJson(res, 404, { error: "learning_promotion_not_found", promotion_id: learningPromotion.promotionId });
        return;
      }
      const body = await readJson<{ reason?: string | null }>(req);
      const result = await rollbackLearningPromotion({
        promotionId: learningPromotion.promotionId,
        actorId: context.actorId,
        reason: body.reason ?? null
      });
      sendJson(res, 200, {
        export_schema: buildExportEnvelope("learning_promotions.v1", { learning_promotions: [result.promotion] }),
        learning_candidate: result.candidate,
        learning_promotion: result.promotion
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), promotion_id: learningPromotion.promotionId });
    }
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
      const request = await applySettingsToAuditRequest({
        ...followup.rerun_request_json,
        llm_workload_class: followup.rerun_request_json.llm_workload_class ?? "interactive_operator",
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
        triage_decision?: any;
        review_priority?: any;
        validation_intent?: any;
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
          triage_decision: body.triage_decision as any,
          review_priority: body.review_priority as any,
          validation_intent: body.validation_intent as any,
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
            triage_decision: body.triage_decision as any,
            review_priority: body.review_priority as any,
            validation_intent: body.validation_intent as any,
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
        await triggerLearningForReviewMutation({ runId: runReviewActions.runId, context, source: "review_action" });
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
      if (body.disposition_type === "waiver") {
        if (!String(body.owner_id ?? "").trim()) {
          sendJson(res, 400, { error: "waiver_owner_required", finding_id: body.finding_id });
          return;
        }
        if (!String(body.reviewed_at ?? "").trim()) {
          sendJson(res, 400, { error: "waiver_reviewed_at_required", finding_id: body.finding_id });
          return;
        }
      }
      const dispositionReview = await submitPersistedReviewAction({
        runId: runFindingDispositions.runId,
        input: {
          reviewer_id: context.actorId,
          action_type: body.disposition_type === "waiver" ? "waive_control" : "suppress_finding",
          finding_id: finding.id,
          triage_decision: (body.triage_decision ?? (body.disposition_type === "waiver" ? "accepted_risk" : "out_of_scope")) as any,
          review_priority: body.review_priority as any,
          validation_intent: body.validation_intent as any,
          notes: body.reason,
          metadata: { governance_operation: "create", disposition_type: body.disposition_type, scope_level: scopeLevel }
        }
      });
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
            approval_review_action_id: dispositionReview.action.id,
            workspace_id: context.workspaceId,
            project_id: context.projectId,
            owner_id: body.disposition_type === "waiver" ? String(body.owner_id ?? "").trim() || null : null,
            reviewed_at: body.disposition_type === "waiver" ? String(body.reviewed_at ?? "").trim() || null : null,
            review_due_by: body.disposition_type === "waiver" ? String(body.review_due_by ?? "").trim() || null : null,
            triage_decision: String(body.triage_decision ?? (body.disposition_type === "waiver" ? "accepted_risk" : "out_of_scope")).trim() || null,
            review_priority: String(body.review_priority ?? "").trim() || null,
            validation_intent: String(body.validation_intent ?? "").trim() || null,
            evidence_fingerprint: buildFindingEvidenceFingerprint(finding)
          }
        }
      });
      const dispositions = await readPersistedFindingDispositions(runFindingDispositions.runId);
      await triggerLearningForReviewMutation({ runId: runFindingDispositions.runId, context, source: "finding_disposition_create" });
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
        await triggerLearningForReviewMutation({ runId: runFindingDispositionItem.runId, context, source: "finding_disposition_revoke" });
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
      if (existing.disposition_type === "waiver") {
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
      if (body.triage_decision !== undefined) metadata.triage_decision = String(body.triage_decision ?? "").trim() || null;
      if (body.review_priority !== undefined) metadata.review_priority = String(body.review_priority ?? "").trim() || null;
      if (body.validation_intent !== undefined) metadata.validation_intent = String(body.validation_intent ?? "").trim() || null;
      const finding = findings.find((item) => item.id === existing.finding_id) ?? findings.find((item) => findingDispositionSignature(item) === existing.finding_signature);
      if (finding) {
        metadata.evidence_fingerprint = buildFindingEvidenceFingerprint(finding);
      }
      const dispositionReview = await submitPersistedReviewAction({
        runId: runFindingDispositionItem.runId,
        input: {
          reviewer_id: context.actorId,
          action_type: existing.disposition_type === "waiver" ? "waive_control" : "suppress_finding",
          finding_id: existing.finding_id,
          notes: body.reason ?? existing.reason,
          metadata: { governance_operation: "update", disposition_id: existing.id, disposition_type: existing.disposition_type }
        }
      });
      metadata.updated_by = context.actorId;
      metadata.updated_at = new Date().toISOString();
      metadata.approval_review_action_id = dispositionReview.action.id;
      const updated = await updatePersistedFindingDisposition({
        runId: runFindingDispositionItem.runId,
        dispositionId: runFindingDispositionItem.dispositionId,
        input: {
          reason: body.reason,
          notes: body.notes,
          expires_at: body.expires_at,
          metadata,
          approved_by: context.actorId
        }
      });
      await triggerLearningForReviewMutation({ runId: runFindingDispositionItem.runId, context, source: "finding_disposition_update" });
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

  const runRemediationItems = req.method === "POST" ? matchRunRemediationItems(url) : null;
  if (runRemediationItems) {
    try {
      const body = await readJson<{
        finding_id?: string;
        status?: RemediationItemStatus;
        owner_id?: string | null;
        priority?: any;
        due_at?: string | null;
        summary?: string | null;
        acceptance_criteria?: string | null;
        external_provider?: "manual" | "github" | "jira" | null;
        external_issue_url?: string | null;
        external_issue_number?: string | null;
        external_pr_url?: string | null;
        external_pr_number?: string | null;
        fix_commit_sha?: string | null;
        validation_run_id?: string | null;
        resolution_notes?: string | null;
      }>(req);
      const run = await getPersistedRun(runRemediationItems.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runRemediationItems.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runRemediationItems.runId);
      if (!canPerformReviewAction({ roles: context.roles, actorId: context.actorId, workflow, actionType: "open_remediation" })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      if (!body.finding_id) {
        sendJson(res, 400, { error: "finding_id_required", run_id: runRemediationItems.runId });
        return;
      }
      const item = await upsertPersistedRemediationItem({
        runId: runRemediationItems.runId,
        input: {
          finding_id: body.finding_id,
          status: body.status ?? "open",
          owner_id: body.owner_id ?? null,
          priority: body.priority ?? null,
          due_at: body.due_at ?? null,
          summary: body.summary ?? null,
          acceptance_criteria: body.acceptance_criteria ?? null,
          external_provider: body.external_provider ?? null,
          external_issue_url: body.external_issue_url ?? null,
          external_issue_number: body.external_issue_number ?? null,
          external_pr_url: body.external_pr_url ?? null,
          external_pr_number: body.external_pr_number ?? null,
          fix_commit_sha: body.fix_commit_sha ?? null,
          validation_run_id: body.validation_run_id ?? null,
          resolution_notes: body.resolution_notes ?? null,
          actor_id: context.actorId,
          metadata: { created_via: "api" }
        }
      });
      const actionType = reviewActionForRemediationStatus(item.status);
      const submitted = await submitPersistedReviewAction({
        runId: runRemediationItems.runId,
        input: {
          reviewer_id: context.actorId,
          action_type: actionType as any,
          finding_id: item.finding_id,
          review_priority: item.priority ?? null,
          validation_intent: item.status === "verification_pending" || item.status === "fix_ready_for_validation" ? "rerun_required" : null,
          notes: item.resolution_notes || item.summary || `Remediation ${item.status}`,
          metadata: { remediation_item_id: item.id, remediation_status: item.status }
        }
      });
      await triggerLearningForReviewMutation({ runId: runRemediationItems.runId, context, source: "remediation_item_create" });
      sendJson(res, 201, {
        run_id: runRemediationItems.runId,
        remediation_item: item,
        review_action: submitted.action,
        remediation_items: await readPersistedRemediationItemsForRun(runRemediationItems.runId)
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runRemediationItems.runId });
    }
    return;
  }

  const runRemediationItem = req.method === "PATCH" ? matchRunRemediationItem(url) : null;
  if (runRemediationItem) {
    try {
      const body = await readJson<{
        status?: RemediationItemStatus;
        owner_id?: string | null;
        priority?: any;
        due_at?: string | null;
        summary?: string | null;
        acceptance_criteria?: string | null;
        external_provider?: "manual" | "github" | "jira" | null;
        external_issue_url?: string | null;
        external_issue_number?: string | null;
        external_pr_url?: string | null;
        external_pr_number?: string | null;
        fix_commit_sha?: string | null;
        validation_run_id?: string | null;
        resolution_notes?: string | null;
      }>(req);
      const run = await getPersistedRun(runRemediationItem.runId);
      if (!runMatchesScope(run, context)) {
        sendJson(res, 404, { error: "run_not_found", run_id: runRemediationItem.runId });
        return;
      }
      const workflow = await readPersistedReviewWorkflow(runRemediationItem.runId);
      if (!canPerformReviewAction({ roles: context.roles, actorId: context.actorId, workflow, actionType: "open_remediation" })) {
        sendJson(res, 403, { error: "forbidden", required_roles: ["admin", "triage_lead", "reviewer"] });
        return;
      }
      const item = await updatePersistedRemediationItem({
        runId: runRemediationItem.runId,
        remediationItemId: runRemediationItem.remediationItemId,
        input: { ...body, actor_id: context.actorId }
      });
      const actionType = reviewActionForRemediationStatus(item.status);
      const submitted = await submitPersistedReviewAction({
        runId: runRemediationItem.runId,
        input: {
          reviewer_id: context.actorId,
          action_type: actionType as any,
          finding_id: item.finding_id,
          review_priority: item.priority ?? null,
          validation_intent: item.status === "verification_pending" || item.status === "fix_ready_for_validation" ? "rerun_required" : null,
          notes: item.resolution_notes || item.summary || `Remediation ${item.status}`,
          metadata: { remediation_item_id: item.id, remediation_status: item.status }
        }
      });
      await triggerLearningForReviewMutation({ runId: runRemediationItem.runId, context, source: "remediation_item_update" });
      sendJson(res, 200, {
        run_id: runRemediationItem.runId,
        remediation_item: item,
        review_action: submitted.action,
        remediation_items: await readPersistedRemediationItemsForRun(runRemediationItem.runId)
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), run_id: runRemediationItem.runId });
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
    sendJson(res, 403, {
      error: "hosted_only",
      capability: "github_outbound_verification",
      message: "Automatic GitHub repository verification is available in Tethermark Cloud. Community Edition can generate outbound preview payloads for manual use."
    });
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
        reason: "Automatic external connector execution is not enabled in Community Edition. Use the preview payload manually or configure a Cloud connector.",
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
    sendJson(res, 403, {
      error: "hosted_only",
      capability: "github_outbound_delivery",
      message: "Automatic GitHub issue, comment, label, and check delivery is available in Tethermark Cloud. Community Edition can prepare the payload for manual posting."
    });
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

  if (req.method === "GET" && url.pathname === "/methodology") {
    try {
      const controlCatalog = getControlCatalog();
      sendJson(res, 200, {
        methodology: getMethodologyArtifact(),
        static_baseline: getStaticBaselineMethodology(),
        audit_packages: listBuiltinAuditPackages(),
        control_catalog: controlCatalog.map((control) => ({
          ...control,
          crosswalk: describeControlCrosswalk(control)
        })),
        management: {
          builtin_catalog_editable: false,
          custom_overlays_supported: false,
          note: "Built-in methodology is read-only. Custom methodology overlays should be versioned and validated before enabling edits."
        }
      });
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

  if (req.method === "GET" && url.pathname === "/benchmarks/suites") {
    try {
      const suites = await listBenchmarkSuites();
      sendJson(res, 200, {
        suites: suites.map((suite) => ({
          suite_id: suite.suite_id,
          suite_version: suite.suite_version,
          title: suite.title,
          summary: suite.summary,
          default_run_mode: suite.default_run_mode,
          default_audit_package: suite.default_audit_package,
          case_count: suite.cases.length,
          default_case_count: selectBenchmarkCases(suite, {}).length,
          extended_case_count: selectBenchmarkCases(suite, { includeExtended: true }).length,
          runtime_pending_case_count: suite.cases.filter((item) => item.tier === "runtime_pending").length
        }))
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const benchmarkSuite = req.method === "GET" ? matchBenchmarkSuite(url) : null;
  if (benchmarkSuite) {
    try {
      const suite = await loadBenchmarkSuite(benchmarkSuite.suiteId);
      sendJson(res, 200, {
        suite,
        selected_default_cases: selectBenchmarkCases(suite, {}).map((item) => item.id),
        selected_extended_cases: selectBenchmarkCases(suite, { includeExtended: true }).map((item) => item.id),
        reports: await listBenchmarkReports()
      });
    } catch (error) {
      sendJson(res, 404, { error: error instanceof Error ? error.message : String(error), suite_id: benchmarkSuite.suiteId });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/benchmarks/reports") {
    try {
      sendJson(res, 200, { reports: await listBenchmarkReports(), report_root: benchmarkReportRoot() });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const benchmarkReport = req.method === "GET" ? matchBenchmarkReport(url) : null;
  if (benchmarkReport) {
    try {
      const reportPath = safeBenchmarkReportPath(benchmarkReport.fileName);
      const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
      sendJson(res, 200, { report, file_name: path.basename(reportPath), path: reportPath });
    } catch (error) {
      sendJson(res, 404, { error: error instanceof Error ? error.message : String(error), report: benchmarkReport.fileName });
    }
    return;
  }

  const benchmarkSuiteRun = req.method === "POST" ? matchBenchmarkSuiteRun(url) : null;
  if (benchmarkSuiteRun) {
    try {
      const body = await readJson<BenchmarkRunBody>(req);
      const settingsResolution = body.use_settings_provider
        ? await resolvePersistedUiSettings(undefined, {
          workspaceId: context.workspaceId,
          projectId: context.projectId
        })
        : null;
      const providers = (settingsResolution?.effective.providers_json ?? {}) as Record<string, unknown>;
      const summary = await runBenchmarkSuite({
        suitePath: benchmarkSuiteRun.suiteId,
        caseId: body.case_id,
        caseIds: Array.isArray(body.case_ids) ? body.case_ids.map((item) => String(item)).filter(Boolean) : undefined,
        includeExtended: Boolean(body.include_extended),
        includeRuntimePending: Boolean(body.include_runtime_pending),
        execute: Boolean(body.execute),
        strict: Boolean(body.strict),
        outputDir: benchmarkReportRoot(),
        dbMode: body.db_mode as any,
        llmProvider: body.llm_provider ?? (typeof providers.default_provider === "string" ? providers.default_provider as AuditRequest["llm_provider"] : undefined),
        llmModel: body.llm_model ?? (typeof providers.default_model === "string" ? providers.default_model : undefined)
      });
      sendJson(res, 200, {
        benchmark_summary: summary,
        reports: await listBenchmarkReports()
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error), suite_id: benchmarkSuiteRun.suiteId });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/benchmarks/compare") {
    try {
      const body = await readJson<BenchmarkCompareBody>(req);
      const baseline = body.baseline_path ?? body.baseline;
      const current = body.current_path ?? body.current;
      if (!baseline || !current) {
        sendJson(res, 400, { error: "benchmark_compare_reports_required" });
        return;
      }
      const comparison = await compareBenchmarkReports({
        baselinePath: safeBenchmarkReportPath(baseline),
        currentPath: safeBenchmarkReportPath(current)
      });
      sendJson(res, 200, { comparison });
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
      if (runSubresource.resource === "agent-trace") {
        const [
          stageExecutions,
          agentInvocations,
          handoffs,
          stageArtifacts,
          laneSpecialists,
          toolExecutions,
          evidenceRecords,
          supervisorReview,
          correctionPlan,
          correctionResult,
          persistedQuality,
          events,
          metrics
        ] = await Promise.all([
          readPersistedStageExecutions(runSubresource.runId),
          readPersistedAgentInvocations(runSubresource.runId),
          readPersistedStageArtifact(runSubresource.runId, "handoffs"),
          readPersistedStageArtifacts(runSubresource.runId),
          readPersistedLaneSpecialistOutputs(runSubresource.runId),
          readPersistedToolExecutions(runSubresource.runId),
          readPersistedEvidenceRecords(runSubresource.runId),
          readPersistedSupervisorReview(runSubresource.runId),
          readPersistedCorrectionPlan(runSubresource.runId),
          readPersistedCorrectionResult(runSubresource.runId),
          readPersistedFindingQuality(runSubresource.runId),
          readPersistedEvents(runSubresource.runId),
          readPersistedMetrics(runSubresource.runId)
        ]);
        const findingQuality = persistedQuality ?? buildFindingQualitySummary({
          runId: runSubresource.runId,
          request: { run_mode: ((await readPersistedResolvedConfiguration(runSubresource.runId))?.run_mode as AuditRequest["run_mode"] | undefined) ?? "static" },
          findings: await readPersistedFindings(runSubresource.runId),
          evidenceRecords,
          controlResults: await readPersistedControlResults(runSubresource.runId),
          controlCatalog: getControlCatalog(),
          toolExecutions,
          mode: "post_supervisor_integrity"
        });
        const handoffItems = Array.isArray(handoffs) ? handoffs : Array.isArray((handoffs as any)?.handoffs) ? (handoffs as any).handoffs : [];
        const timeline = [
          ...stageExecutions.map((item) => ({
            kind: "stage",
            id: item.id,
            at: item.started_at,
            completed_at: item.completed_at,
            actor: item.actor,
            stage_name: item.stage_name,
            status: item.status,
            summary: `${item.stage_name} by ${item.actor}: ${item.status}`,
            details: item.details_json
          })),
          ...agentInvocations.map((item) => ({
            kind: "agent",
            id: item.id,
            at: item.started_at,
            completed_at: item.completed_at,
            actor: item.agent_name,
            stage_name: item.stage_name,
            status: item.status,
            summary: `${item.agent_name} ${item.status}${item.output_artifact ? ` -> ${item.output_artifact}` : ""}`,
            details: {
              lane_name: item.lane_name,
              provider: item.provider,
              model: item.model,
              workload_class: item.workload_class,
              credential_class: item.credential_class,
              initiation_mode: item.initiation_mode,
              request_index: item.request_index,
              attempts: item.attempts,
              input_artifacts: item.input_artifacts_json,
              output_artifact: item.output_artifact,
              tokens: {
                prompt: item.prompt_tokens,
                completion: item.completion_tokens,
                total: item.total_tokens
              },
              estimated_cost_usd: item.estimated_cost_usd,
              terminal_reason: item.terminal_reason
            }
          })),
          ...handoffItems.map((item: any, index: number) => ({
            kind: "handoff",
            id: String(item.id ?? item.handoff_id ?? `${runSubresource.runId}:handoff:${index}`),
            at: String(item.created_at ?? item.timestamp ?? item.completed_at ?? ""),
            completed_at: String(item.completed_at ?? item.created_at ?? item.timestamp ?? ""),
            actor: String(item.from_agent ?? item.source_agent ?? item.actor ?? "agent"),
            stage_name: String(item.stage_name ?? item.stage ?? "handoff"),
            status: String(item.status ?? "recorded"),
            summary: `${String(item.from_agent ?? item.source_agent ?? "agent")} -> ${String(item.to_agent ?? item.target_agent ?? "next")}`,
            details: item
          }))
        ].sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")) || left.kind.localeCompare(right.kind));
        const intermediateArtifacts = stageArtifacts
          .filter((item) => [
            "preflight-summary",
            "launch-intent",
            "planner-artifact",
            "target-profile",
            "threat-model",
            "eval-selection",
            "run-plan",
            "findings-pre-skeptic",
            "finding-integrity-pre-supervisor",
            "finding-quality-pre-skeptic",
            "post-supervisor-integrity",
            "finding-quality",
            "handoffs",
            "score-summary",
            "observations"
          ].includes(item.artifact_type))
          .map((item) => ({
            artifact_type: item.artifact_type,
            created_at: item.created_at,
            payload_json: item.payload_json
          }));
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          trace_policy: {
            hidden_chain_of_thought_stored: false,
            note: "This endpoint exposes structured agent inputs, outputs, rationale summaries, handoffs, QA verdicts, corrections, tool evidence, and persisted artifacts. It does not store or reveal hidden model chain-of-thought."
          },
          summary: {
            stage_execution_count: stageExecutions.length,
            agent_invocation_count: agentInvocations.length,
            handoff_count: handoffItems.length,
            tool_execution_count: toolExecutions.length,
            evidence_record_count: evidenceRecords.length,
            event_count: events.length,
            metric_count: metrics.length,
            finding_quality_verdict: findingQuality.overall_verdict,
            finding_quality_blocking_count: findingQuality.blocking_count,
            post_supervisor_integrity_verdict: findingQuality.overall_verdict,
            post_supervisor_integrity_blocking_count: findingQuality.blocking_count,
            supervisor_action_count: Array.isArray(supervisorReview?.actions_json) ? supervisorReview.actions_json.length : 0,
            correction_triggered: Boolean(correctionPlan?.triggered || correctionResult?.triggered)
          },
          timeline,
          agent_invocations: agentInvocations,
          handoffs: handoffItems,
          stage_executions: stageExecutions,
          intermediate_outputs: intermediateArtifacts,
          lane_specialists: laneSpecialists,
          tool_executions: toolExecutions,
          evidence_records: evidenceRecords,
          supervisor_review: supervisorReview,
          correction_plan: correctionPlan,
          correction_result: correctionResult,
          finding_quality: findingQuality,
          events,
          metrics
        });
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
      if (runSubresource.resource === "remediation-items") {
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          remediation_items: await readPersistedRemediationItemsForRun(runSubresource.runId)
        });
        return;
      }
      if (runSubresource.resource === "learning") {
        const [events, candidates] = await Promise.all([
          listPersistedLearningEvents({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            runId: runSubresource.runId,
            limit: Number.MAX_SAFE_INTEGER
          }),
          listPersistedLearningCandidates({
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            runId: runSubresource.runId,
            limit: Number.MAX_SAFE_INTEGER
          })
        ]);
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          export_schema: buildExportEnvelope("learning_candidates.v1", { learning_events: events, learning_candidates: candidates }),
          learning_events: events,
          learning_candidates: candidates
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
      if (runSubresource.resource === "finding-integrity-pre-supervisor") {
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          finding_integrity_pre_supervisor: await readPersistedStageArtifact(runSubresource.runId, "finding-integrity-pre-supervisor")
            ?? await readPersistedStageArtifact(runSubresource.runId, "finding-quality-pre-skeptic")
        });
        return;
      }
      if (runSubresource.resource === "post-supervisor-integrity") {
        const persistedQuality = await readPersistedFindingQuality(runSubresource.runId);
        const postSupervisorIntegrity = await readPersistedStageArtifact(runSubresource.runId, "post-supervisor-integrity") ?? persistedQuality;
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          post_supervisor_integrity: postSupervisorIntegrity
        });
        return;
      }
      if (runSubresource.resource === "finding-quality") {
        const persistedQuality = await readPersistedFindingQuality(runSubresource.runId);
        const findingQuality = persistedQuality ?? buildFindingQualitySummary({
          runId: runSubresource.runId,
          request: { run_mode: ((await readPersistedResolvedConfiguration(runSubresource.runId))?.run_mode as AuditRequest["run_mode"] | undefined) ?? "static" },
          findings: await readPersistedFindings(runSubresource.runId),
          evidenceRecords: await readPersistedEvidenceRecords(runSubresource.runId),
          controlResults: await readPersistedControlResults(runSubresource.runId),
          controlCatalog: getControlCatalog(),
          toolExecutions: await readPersistedToolExecutions(runSubresource.runId),
          mode: "post_supervisor_integrity"
        });
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          export_schema: buildExportEnvelope("finding_quality.v1", findingQuality),
          finding_quality: findingQuality
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
        const [summary, findings, workflow, actions, comments, dispositions, supervisorReview, reviewDecision, remediation, resolvedConfiguration, sandboxExecution, evidenceRecords, runtimeFollowups, toolExecutions, controlResults, stageExecutions, agentInvocations] = await Promise.all([
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
          readPersistedControlResults(runSubresource.runId),
          readPersistedStageExecutions(runSubresource.runId),
          readPersistedAgentInvocations(runSubresource.runId)
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
                resolvedConfiguration,
                toolExecutions,
                controlResults,
                stageExecutions,
                agentInvocations
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
              resolvedConfiguration,
              toolExecutions,
              controlResults,
              stageExecutions,
              agentInvocations
            })),
            report_executive: buildExecutiveSummaryPayload({
              run,
              summary,
              findings,
              evaluations,
              reviewDecision,
              remediation,
              resolvedConfiguration,
              toolExecutions,
              controlResults,
              stageExecutions,
              agentInvocations
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
              controlResults: controlResults as any,
              stageExecutions: stageExecutions as any,
              agentInvocations: agentInvocations as any
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
        const [actions, comments, findings, dispositions, remediationItems] = await Promise.all([
          readPersistedReviewActions(runSubresource.runId),
          readPersistedReviewComments(runSubresource.runId),
          readPersistedFindings(runSubresource.runId),
          readPersistedFindingDispositions(runSubresource.runId),
          readPersistedRemediationItemsForRun(runSubresource.runId)
        ]);
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          export_schema: buildExportEnvelope("review_audit.v1", {
            workflow,
            actions,
            comments,
            summary: buildReviewSummary({ workflow, findings, actions, comments, dispositions }),
            finding_dispositions: dispositions,
            remediation_items: remediationItems
          }),
          review_audit: {
            workflow,
            actions,
            comments,
            summary: buildReviewSummary({ workflow, findings, actions, comments, dispositions }),
            finding_dispositions: dispositions,
            remediation_items: remediationItems
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
      if (runSubresource.resource === "resolved-system-policy") {
        const resolvedPolicy = await readPersistedPolicyResolutionSnapshot(runSubresource.runId);
        sendJson(res, 200, { run_id: runSubresource.runId, export_schema: buildExportEnvelope("resolved_system_policy.v1", resolvedPolicy), resolved_system_policy: resolvedPolicy });
        return;
      }
      if (runSubresource.resource === "sandbox-execution") {
        sendJson(res, 200, { run_id: runSubresource.runId, sandbox_execution: await readPersistedStageArtifact(runSubresource.runId, "sandbox-execution") });
        return;
      }
      if (runSubresource.resource === "runtime-validation") {
        const sandboxExecution = await readPersistedStageArtifact<any>(runSubresource.runId, "sandbox-execution");
        sendJson(res, 200, {
          run_id: runSubresource.runId,
          runtime_validation: {
            provider_id: sandboxExecution?.runtime_sandbox?.provider_id ?? "local_runtime",
            selected_backend: sandboxExecution?.runtime_sandbox?.selected_backend ?? sandboxExecution?.runtime_sandbox?.readiness?.resolution?.selected_backend ?? "unavailable",
            readiness: sandboxExecution?.runtime_sandbox?.readiness ?? null,
            policy: sandboxExecution?.runtime_sandbox?.policy ?? null,
            plan: sandboxExecution?.plan ?? null,
            results: sandboxExecution?.results ?? [],
            artifact: sandboxExecution ?? null
          }
        });
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
  server.on("listening", () => {
    scheduler.start();
    artifactRetentionScheduler?.start();
  });
  server.on("close", () => {
    scheduler.stop();
    artifactRetentionScheduler?.stop();
  });
  return server;
}

const entryHref = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryHref && import.meta.url === entryHref) {
  const server = createApiServer({ enableArtifactRetentionScheduler: true });
  listenWithFriendlyErrors({ server, host, port, serviceName: "API", portEnvVar: "PORT", onListening: () => {
    console.log(`API listening on http://${host}:${port}`);
  } });
}


