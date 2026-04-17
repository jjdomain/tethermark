import fs from "node:fs/promises";
import path from "node:path";

import { AgentRuntime } from "../../agent-runtime/src/index.js";
import type {
  AuditRequest,
  AuditResult,
  CommitDiffGateArtifact,
  ControlResult,
  Finding,
  LaunchIntentArtifact,
  MethodologyArtifact,
  PlannerArtifact,
  PreflightSummary,
  ResolvedConfigurationArtifact,
  RunEnvelope,
  ScoreSummary,
  SkepticArtifact,
  TargetProfileArtifact,
  ThreatModelArtifact,
  TraceRecord
} from "./contracts.js";
import { resolveAuditPolicy } from "./audit-policy.js";
import { getBuiltinAuditPackage, resolveAuditPackage } from "./audit-packages.js";
import { ArtifactStore } from "./artifact-store.js";
import { computeCommitDiffGate } from "./commit-diff.js";
import { refreshLaneArtifacts } from "./lane-analyzers.js";
import { formatEventJsonl } from "./observability/events.js";
import { buildStageExecutions, persistAuditResult, persistPersistenceSummary } from "./persistence/index.js";
import { buildPreflightSummary } from "./preflight.js";
import { registerRunArtifactLocation } from "./run-registry.js";
import { RunObserver } from "./observability/run-observer.js";
import { InMemoryJobQueue } from "./queue.js";
import { computeBaselineDimensionScores, computeStaticBaselineScore, getCandidateControls, getMethodologyArtifact, getStaticBaselineMethodology } from "./standards.js";
import { createId, nowIso } from "./utils.js";
import { stageAssessControls } from "./stages/stage-assess-controls.js";
import { stageAllocateLanes } from "./stages/stage-allocate-lanes.js";
import { applyControlDowngrades, applyUnsupportedFindingDrops, buildCorrectionPlanArtifact, buildCorrectionResultArtifact, hasSkepticActions, mergeSelectiveAssessmentCycle, selectEvidenceSubset, selectLaneSubset, selectToolSubset } from "./stages/stage-corrections.js";
import { stagePlanScope } from "./stages/stage-plan-scope.js";
import { stagePrepareTarget } from "./stages/stage-prepare-target.js";
import { computeLaneReuseDecisions } from "./lane-reuse.js";
import { getPersistedRun, readPersistedDimensionScores } from "./persistence/query.js";
import {
  readPersistedControlResults,
  readPersistedEvidenceRecords,
  readPersistedFindings,
  readPersistedLaneResults,
  readPersistedLaneSpecialistOutputs,
  readPersistedStageArtifact,
  readPersistedToolExecutions
} from "./persistence/run-details.js";
import { stageRemediation } from "./stages/stage-remediation.js";
import { stageSelectEvidence } from "./stages/stage-select-evidence.js";
import { stageSkepticReview } from "./stages/stage-skeptic-review.js";
import { stageThreatModel } from "./stages/stage-threat-model.js";
import { stageScoreAndPublishability } from "./stages/stage-score-and-publishability.js";
import { stageApplyPolicyOverrides } from "./stages/stage-apply-policy-overrides.js";
import { stageResolveConfig } from "./stages/stage-resolve-config.js";

type AssessmentCycle = Awaited<ReturnType<typeof stageAssessControls>>;

class CanceledRunError extends Error {
  constructor(readonly runId: string) {
    super(`Run ${runId} was canceled.`);
    this.name = "CanceledRunError";
  }
}

function defaultArtifactRoot(): string {
  return path.resolve(process.cwd(), ".artifacts", "runs");
}
function deriveRunLabel(request: AuditRequest): string {
  const source = request.repo_url ?? request.local_path ?? request.endpoint_url ?? "audit";
  const normalized = source.replace(/\\/g, "/").replace(/\/$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? "audit";
}
function resolveArtifactStore(_request: AuditRequest): ArtifactStore {
  return new ArtifactStore(defaultArtifactRoot(), true);
}

async function exportArtifactsToOutputDir(runId: string, canonicalArtifactDir: string, outputDir?: string): Promise<void> {
  if (!outputDir) return;
  const resolvedOutputDir = path.resolve(outputDir);
  if (resolvedOutputDir === canonicalArtifactDir) return;
  await fs.mkdir(resolvedOutputDir, { recursive: true });
  await fs.cp(canonicalArtifactDir, resolvedOutputDir, { recursive: true, force: true });
  await fs.writeFile(
    path.join(resolvedOutputDir, "export-manifest.json"),
    `${JSON.stringify({ run_id: runId, canonical_artifact_dir: canonicalArtifactDir, exported_at: nowIso() }, null, 2)}\n`,
    "utf8"
  );
}

function applySkepticReview(findings: Finding[], skeptic: SkepticArtifact): Finding[] {
  const graderMap = new Map(skeptic.grader_outputs.map((item) => [item.finding_id, item]));
  return applyUnsupportedFindingDrops(findings, skeptic).map((finding) => {
    const grader = graderMap.get(finding.finding_id);
    if (!grader) return finding;
    const confidenceAdjustment = grader.evidence_sufficiency === "high"
      ? 0.08
      : grader.evidence_sufficiency === "low"
        ? -0.12
        : 0;
    const falsePositiveAdjustment = grader.false_positive_risk === "high"
      ? -0.18
      : grader.false_positive_risk === "medium"
        ? -0.08
        : 0.04;
    return {
      ...finding,
      description: `${finding.description} Skeptic review: ${grader.reasoning_summary}`,
      confidence: Math.max(0.1, Math.min(0.99, Number((finding.confidence + confidenceAdjustment + falsePositiveAdjustment).toFixed(2))))
    };
  });
}

function updateControlResultsWithFindings(controlResults: ControlResult[], findings: Finding[]): ControlResult[] {
  return controlResults.map((control) => {
    const linkedFindings = findings.filter((finding) => finding.control_ids.includes(control.control_id));
    if (linkedFindings.length === 0) return control;
    const worstSeverity = linkedFindings.some((finding) => finding.severity === "critical")
      ? "critical"
      : linkedFindings.some((finding) => finding.severity === "high")
        ? "high"
        : linkedFindings.some((finding) => finding.severity === "medium")
          ? "medium"
          : "low";
    const scorePenalty = linkedFindings.reduce((sum, finding) => {
      const multiplier = finding.confidence >= 0.9 ? 1 : finding.confidence >= 0.75 ? 0.9 : finding.confidence >= 0.6 ? 0.75 : 0.55;
      return sum + (Math.min(control.max_score, finding.score_impact) * multiplier);
    }, 0);
    const adjustedScore = Math.max(0, Math.round(control.max_score - Math.min(control.max_score, scorePenalty)));
    return {
      ...control,
      status: control.status === "not_assessed" || control.status === "not_applicable"
        ? control.status
        : worstSeverity === "critical" || worstSeverity === "high"
          ? "fail"
          : worstSeverity === "medium"
            ? "partial"
            : control.status,
      score_awarded: control.status === "not_assessed" || control.status === "not_applicable" ? control.score_awarded : adjustedScore,
      finding_ids: [...new Set([...control.finding_ids, ...linkedFindings.map((finding) => finding.finding_id)])]
    };
  });
}

function recomputeScoreSummary(methodology: MethodologyArtifact, analysisProjectName: string, controlResults: ControlResult[], findings: Finding[]): ScoreSummary {
  const frameworkMap = new Map<string, { score: number; max: number; assessed: number; applicable: number; controlIds: string[] }>();
  for (const control of controlResults) {
    if (!frameworkMap.has(control.framework)) {
      frameworkMap.set(control.framework, { score: 0, max: 0, assessed: 0, applicable: 0, controlIds: [] });
    }
    const record = frameworkMap.get(control.framework)!;
    record.controlIds.push(control.control_id);
    if (control.applicability === "applicable") {
      record.applicable += 1;
      record.max += control.max_score;
      record.score += control.score_awarded;
      if (control.assessability !== "not_assessed") record.assessed += 1;
    }
  }
  const frameworkScores = [...frameworkMap.entries()].map(([framework, item]) => ({
    framework,
    score: item.score,
    max_score: item.max,
    percentage: item.max > 0 ? Math.max(0, Math.min(100, Math.round((item.score / item.max) * 100))) : 0,
    assessed_controls: item.assessed,
    applicable_controls: item.applicable,
    control_ids: item.controlIds
  }));
  const numerator = frameworkScores.reduce((sum, item) => sum + item.score, 0);
  const denominator = frameworkScores.reduce((sum, item) => sum + item.max_score, 0);
  const overallScore = denominator > 0 ? Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100))) : 0;
  const rating = overallScore >= 90 ? "excellent" : overallScore >= 80 ? "strong" : overallScore >= 65 ? "good" : overallScore >= 45 ? "fair" : "poor";
  const highSeverityCount = findings.filter((finding) => finding.severity === "high" || finding.severity === "critical").length;
  return {
    methodology_version: methodology.version,
    overall_score: overallScore,
    rating,
    framework_scores: frameworkScores,
    limitations: [
      "Static mode does not execute target code, build pipelines, or runtime validation paths.",
      "Controls that depend on hosted repository settings or build provenance remain not_assessed in this run.",
      "Evidence provider results depend on configured binaries or APIs; skipped providers reduce assessability but should not be mistaken for passing posture."
    ],
    leaderboard_summary: `${analysisProjectName} received a ${overallScore}/100 standards-based static audit score (${rating}). ${findings.length} findings were emitted, including ${highSeverityCount} high or critical issues, from assessed controls across ${frameworkScores.length} framework groups.`
  };
}

function buildLaunchIntentArtifact(args: {
  request: AuditRequest;
  preflightSummary: PreflightSummary;
  submittedAt: string;
}): LaunchIntentArtifact {
  const launchIntentHints = typeof args.request.hints?.launch_intent === "object" && args.request.hints?.launch_intent
    ? args.request.hints.launch_intent as Record<string, unknown>
    : {};
  const checkedAt = typeof launchIntentHints.preflight_checked_at === "string" ? launchIntentHints.preflight_checked_at : null;
  const acceptedAt = typeof launchIntentHints.preflight_accepted_at === "string" ? launchIntentHints.preflight_accepted_at : null;
  const stale = Boolean(launchIntentHints.preflight_stale);
  const notes = Array.isArray(launchIntentHints.notes) ? launchIntentHints.notes.filter((item): item is string => typeof item === "string") : [];
  return {
    source_surface: typeof launchIntentHints.source_surface === "string" ? launchIntentHints.source_surface : "api",
    submitted_at: args.submittedAt,
    requested_by: args.request.requested_by ?? null,
    workspace_id: args.request.workspace_id ?? null,
    project_id: args.request.project_id ?? null,
    target: {
      kind: args.preflightSummary.target.kind,
      input: args.preflightSummary.target.input
    },
    requested_profile: args.preflightSummary.launch_profile,
    preflight: {
      summary_status: args.preflightSummary.readiness.status,
      checked_at: checkedAt,
      accepted_at: acceptedAt,
      stale,
      accepted: Boolean(acceptedAt) && !stale
    },
    notes
  };
}

function mergeLaneArtifacts<T>(args: { current: T[]; reused: T[]; key: (item: T) => string }): T[] {
  const map = new Map(args.reused.map((item) => [args.key(item), item]));
  for (const item of args.current) map.set(args.key(item), item);
  return [...map.values()];
}

function dedupeObservations<T extends { title: string; summary: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(`${item.title}::${item.summary}`, item);
  }
  return [...map.values()];
}

function reconcileLaneResultsWithPolicy(laneResults: any[], findings: Finding[], controlResults: ControlResult[]): any[] {
  const findingMap = new Map(findings.map((item) => [item.finding_id, item]));
  const controlMap = new Map(controlResults.map((item) => [item.control_id, item]));
  return laneResults.map((lane) => ({
    ...lane,
    findings: lane.findings.filter((finding: Finding) => findingMap.has(finding.finding_id)).map((finding: Finding) => findingMap.get(finding.finding_id) ?? finding),
    control_results: lane.control_results.map((control: ControlResult) => controlMap.get(control.control_id)).filter(Boolean)
  }));
}

function aggregateInvocationUsage(invocations: Array<{
  context_bytes?: number;
  user_prompt_bytes?: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  estimated_cost_usd?: number | null;
}>): {
  contextBytesTotal: number;
  userPromptBytesTotal: number;
  promptTokensTotal: number;
  completionTokensTotal: number;
  totalTokensTotal: number;
  estimatedCostUsdTotal: number;
} {
  return invocations.reduce((acc, invocation) => {
    acc.contextBytesTotal += invocation.context_bytes ?? 0;
    acc.userPromptBytesTotal += invocation.user_prompt_bytes ?? 0;
    acc.promptTokensTotal += invocation.prompt_tokens ?? 0;
    acc.completionTokensTotal += invocation.completion_tokens ?? 0;
    acc.totalTokensTotal += invocation.total_tokens ?? 0;
    acc.estimatedCostUsdTotal += invocation.estimated_cost_usd ?? 0;
    return acc;
  }, {
    contextBytesTotal: 0,
    userPromptBytesTotal: 0,
    promptTokensTotal: 0,
    completionTokensTotal: 0,
    totalTokensTotal: 0,
    estimatedCostUsdTotal: 0
  });
}

function toFinding(record: any): Finding {
  return {
    finding_id: record.id,
    title: record.title,
    severity: record.severity,
    category: record.category,
    description: record.description,
    evidence: Array.isArray(record.evidence_json) ? record.evidence_json : [],
    public_safe: record.publication_state === "public_safe",
    confidence: record.confidence,
    score_impact: record.score_impact,
    source: record.source,
    control_ids: Array.isArray(record.control_ids_json) ? record.control_ids_json : [],
    standards_refs: Array.isArray(record.standards_refs_json) ? record.standards_refs_json : []
  };
}

function toControlResult(record: any): ControlResult {
  return {
    control_id: record.control_id,
    framework: record.framework,
    standard_ref: record.standard_ref,
    title: record.title,
    applicability: record.applicability,
    assessability: record.assessability,
    status: record.status,
    score_weight: record.score_weight,
    max_score: record.max_score,
    score_awarded: record.score_awarded,
    rationale: Array.isArray(record.rationale_json) ? record.rationale_json : [],
    evidence: Array.isArray(record.evidence_json) ? record.evidence_json : [],
    finding_ids: Array.isArray(record.finding_ids_json) ? record.finding_ids_json : [],
    sources: Array.isArray(record.sources_json) ? record.sources_json : []
  };
}

function toEvidenceRecord(record: any): any {
  return {
    evidence_id: record.id,
    run_id: record.run_id,
    lane_name: record.lane_name ?? undefined,
    source_type: record.source_type,
    source_id: record.source_id,
    control_ids: Array.isArray(record.control_ids_json) ? record.control_ids_json : [],
    summary: record.summary,
    confidence: record.confidence,
    raw_artifact_path: record.raw_artifact_path ?? undefined,
    metadata: (record.metadata_json ?? {}) as Record<string, unknown>
  };
}

function toToolExecution(record: any): any {
  return {
    tool: record.tool,
    provider_id: record.provider_id,
    provider_kind: record.provider_kind,
    status: record.status,
    command: Array.isArray(record.command_json) ? record.command_json : [],
    exit_code: record.exit_code,
    summary: record.summary,
    artifact_type: record.artifact_type,
    parsed: record.parsed_json ?? null,
    stderr: record.stderr ?? undefined,
    adapter: record.adapter_json ?? null,
    normalized: record.normalized_json ?? null
  };
}

function toLaneSpecialistOutput(record: any): any {
  return {
    lane_name: record.lane_name,
    agent_name: record.agent_name,
    output_artifact: record.output_artifact,
    summary: Array.isArray(record.summary_json) ? record.summary_json : [],
    observations: Array.isArray(record.observations_json) ? record.observations_json : [],
    evidence_ids: Array.isArray(record.evidence_ids_json) ? record.evidence_ids_json : [],
    tool_provider_ids: Array.isArray(record.tool_provider_ids_json) ? record.tool_provider_ids_json : []
  };
}

function buildLaneResultsFromPersistedRecords(laneResultRecords: any[], findings: Finding[], controlResults: ControlResult[]): any[] {
  const findingMap = new Map(findings.map((item) => [item.finding_id, item]));
  const controlMap = new Map(controlResults.map((item) => [item.control_id, item]));
  return laneResultRecords.map((item) => ({
    lane_name: item.lane_name,
    findings: (Array.isArray(item.finding_ids_json) ? item.finding_ids_json : []).map((id: string) => findingMap.get(id)).filter(Boolean),
    control_results: (Array.isArray(item.control_ids_json) ? item.control_ids_json : []).map((id: string) => controlMap.get(id)).filter(Boolean),
    evidence_used: Array.isArray(item.evidence_used_json) ? item.evidence_used_json : [],
    summary: Array.isArray(item.summary_json) ? item.summary_json : []
  }));
}

async function loadReusedStageArtifacts(commitDiff: CommitDiffGateArtifact): Promise<{
  plannerArtifact: PlannerArtifact | null;
  targetProfile: TargetProfileArtifact | null;
  threatModel: ThreatModelArtifact | null;
  evalSelection: any | null;
}> {
  if (!commitDiff.previous_run_id) {
    return { plannerArtifact: null, targetProfile: null, threatModel: null, evalSelection: null };
  }

  const plannerArtifact = commitDiff.stage_decisions.planner === "reuse"
    ? await readPersistedStageArtifact<PlannerArtifact>(commitDiff.previous_run_id, "planner-artifact")
    : null;
  const targetProfile = commitDiff.stage_decisions.planner === "reuse"
    ? await readPersistedStageArtifact<TargetProfileArtifact>(commitDiff.previous_run_id, "target-profile")
    : null;
  const threatModel = commitDiff.stage_decisions.threat_model === "reuse"
    ? await readPersistedStageArtifact<ThreatModelArtifact>(commitDiff.previous_run_id, "threat-model")
    : null;
  const evalSelection = commitDiff.stage_decisions.eval_selection === "reuse"
    ? await readPersistedStageArtifact<any>(commitDiff.previous_run_id, "eval-selection")
    : null;

  return { plannerArtifact, targetProfile, threatModel, evalSelection };
}

async function materializeLaneSpecialistArtifacts(runId: string, artifactStore: ArtifactStore, laneSpecialistOutputs: any[]): Promise<any[]> {
  const artifacts: any[] = [];
  artifacts.push(await artifactStore.writeJson(runId, "lane-specialists", laneSpecialistOutputs));
  for (const item of laneSpecialistOutputs) {
    artifacts.push(await artifactStore.writeJson(runId, `lane-specialist-${item.lane_name}`, item));
  }
  return artifacts;
}

async function loadReusedAssessmentCycle(previousRunId: string): Promise<AssessmentCycle> {
  const [
    runPlan,
    toolExecutions,
    evidenceRecordRows,
    laneResultRows,
    laneSpecialistRows,
    findingsPreSkeptic,
    controlResultRows,
    observations,
    scoreSummary,
    dimensionScoreRows,
    run
  ] = await Promise.all([
    readPersistedStageArtifact<any>(previousRunId, "run-plan"),
    readPersistedToolExecutions(previousRunId),
    readPersistedEvidenceRecords(previousRunId),
    readPersistedLaneResults(previousRunId),
    readPersistedLaneSpecialistOutputs(previousRunId),
    readPersistedStageArtifact<any[]>(previousRunId, "findings-pre-skeptic"),
    readPersistedControlResults(previousRunId),
    readPersistedStageArtifact<any[]>(previousRunId, "observations"),
    readPersistedStageArtifact<any>(previousRunId, "score-summary"),
    readPersistedDimensionScores(previousRunId),
    getPersistedRun(previousRunId)
  ]);
  if (!runPlan || !scoreSummary) {
    throw new Error(`Persisted selective-rerun inputs are incomplete for run ${previousRunId}.`);
  }
  const findings = Array.isArray(findingsPreSkeptic) ? findingsPreSkeptic : (await readPersistedFindings(previousRunId)).map(toFinding);
  const controlResults = controlResultRows.map(toControlResult);
  const laneResults = buildLaneResultsFromPersistedRecords(laneResultRows, findings, controlResults);

  return {
    runPlan,
    evidenceExecutions: toolExecutions.map(toToolExecution),
    evidenceRecords: evidenceRecordRows.map(toEvidenceRecord),
    laneResults,
    laneSpecialistOutputs: laneSpecialistRows.map(toLaneSpecialistOutput),
    findings,
    controlResults,
    observations: Array.isArray(observations) ? observations : [],
    scoreSummary,
    dimensionScores: dimensionScoreRows.map((item: any) => ({
      dimension: item.dimension,
      score: item.score,
      max_score: item.max_score,
      percentage: item.percentage,
      weight: item.weight,
      assessed_controls: item.assessed_controls,
      applicable_controls: item.applicable_controls,
      control_ids: Array.isArray(item.control_ids_json) ? item.control_ids_json : [],
      frameworks: Array.isArray(item.frameworks_json) ? item.frameworks_json : []
    })),
    staticScore: run?.static_score ?? computeStaticBaselineScore(dimensionScoreRows.map((item: any) => ({
      dimension: item.dimension,
      score: item.score,
      max_score: item.max_score,
      percentage: item.percentage,
      weight: item.weight,
      assessed_controls: item.assessed_controls,
      applicable_controls: item.applicable_controls,
      control_ids: Array.isArray(item.control_ids_json) ? item.control_ids_json : [],
      frameworks: Array.isArray(item.frameworks_json) ? item.frameworks_json : []
    })))
  };
}
export class AuditEngine {
  private readonly queue = new InMemoryJobQueue();
  private readonly cancelRequested = new Set<string>();

  private ensureRunNotCanceled(runId: string): void {
    if (this.cancelRequested.has(runId)) {
      throw new CanceledRunError(runId);
    }
  }

  async run(request: AuditRequest, options?: { runId?: string; retryOfRunId?: string }): Promise<AuditResult> {
    const runId = options?.runId ?? createId("run", deriveRunLabel(request));
    this.cancelRequested.delete(runId);
    const existing = this.queue.get(runId);
    if (existing) {
      this.queue.update(runId, { status: "running", error: undefined, result: undefined });
    } else {
      this.queue.add({
        run_id: runId,
        status: "running",
        request,
        created_at: nowIso(),
        updated_at: nowIso(),
        retry_of_run_id: options?.retryOfRunId
      });
    }
    const artifactStore = resolveArtifactStore(request);
    const artifactDir = artifactStore.resolveRunDir(runId);

    const methodology = getMethodologyArtifact();
    const staticBaseline = getStaticBaselineMethodology();
    const auditPolicy = resolveAuditPolicy(request);
    const requestedAuditPackage = request.audit_package ? getBuiltinAuditPackage(request.audit_package) : null;
    const agentRuntime = new AgentRuntime({ provider: request.llm_provider, model: request.llm_model, apiKey: request.llm_api_key });
    const trace: TraceRecord = { trace_id: createId("trace"), run_id: runId, steps: [] };
    const observer = new RunObserver(runId);
    observer.emit({ level: "info", stage: "run", actor: "orchestrator", eventType: "run_started", status: "running", details: { run_mode: request.run_mode ?? "static" } });

    try {
    const preflightSummary = await observer.observeStage({
      stage: "preflight",
      actor: "stage_preflight",
      details: { target_kind: request.repo_url ? "repo" : request.local_path ? "path" : "endpoint" },
      fn: async () => buildPreflightSummary(request)
    });
    const launchIntent = buildLaunchIntentArtifact({
      request,
      preflightSummary,
      submittedAt: nowIso()
    });
    trace.steps.push({ step: 1, actor: "stage_preflight", action: "preflight", summary: `Preflight classified target as ${preflightSummary.target.target_class} with readiness ${preflightSummary.readiness.status}.`, artifacts: ["preflight-summary.json"], timestamp: nowIso() });
    await artifactStore.writeJson(runId, "preflight-summary", preflightSummary);
    await artifactStore.writeJson(runId, "launch-intent", launchIntent);
    this.ensureRunNotCanceled(runId);

    const resolvedConfigInitial: ResolvedConfigurationArtifact = await observer.observeStage({
      stage: "resolve_config",
      actor: "stage_resolve_config",
      details: { requested_policy_pack: request.audit_policy_pack ?? null, requested_audit_package: request.audit_package ?? null },
      fn: async () => stageResolveConfig({
        runId,
        request,
        auditPolicy,
        auditPackage: requestedAuditPackage
      })
    });
    trace.steps.push({ step: trace.steps.length + 1, actor: "stage_resolve_config", action: "resolve_config", summary: `Resolved config with policy pack ${resolvedConfigInitial.policy_pack.id ?? "inline"} and package mode ${resolvedConfigInitial.audit_package.selection_mode}.`, artifacts: ["resolved-config.json"], timestamp: nowIso() });
    await artifactStore.writeJson(runId, "resolved-config", resolvedConfigInitial);
    this.ensureRunNotCanceled(runId);

    const prepared = await observer.observeStage({
      stage: "prepare_target",
      actor: "stage_prepare_target",
      details: { target_kind: request.repo_url ? "repo" : request.local_path ? "path" : "endpoint" },
      fn: async () => stagePrepareTarget(runId, request)
    });
    trace.steps.push({ step: trace.steps.length + 1, actor: "stage_prepare_target", action: "prepare_target", summary: `Prepared target with ${prepared.analysis.file_count} files and ${prepared.repoContext.documents.length} curated context documents.`, artifacts: [prepared.sandbox.target_dir], timestamp: nowIso() });
    await artifactStore.writeJson(runId, "sandbox", prepared.sandbox);
    if (prepared.sandbox.execution_plan || prepared.sandbox.execution_results) {
      await artifactStore.writeJson(runId, "sandbox-execution", {
        readiness_status: prepared.sandbox.execution_plan?.readiness_status ?? "blocked",
        runtime: prepared.sandbox.container_workspace?.runtime ?? "unconfigured",
        plan: prepared.sandbox.execution_plan ?? { readiness_status: "blocked", detected_stack: [], entry_signals: [], steps: [], warnings: ["No sandbox execution plan was generated."] },
        results: prepared.sandbox.execution_results ?? []
      });
    }
    await artifactStore.writeJson(runId, "target", prepared.target);
    await artifactStore.writeJson(runId, "analysis", prepared.analysis);
    await artifactStore.writeJson(runId, "repo-context", prepared.repoContext);
    await artifactStore.writeJson(runId, "methodology", methodology);
    await artifactStore.writeJson(runId, "static-baseline", staticBaseline);
    await artifactStore.writeJson(runId, "audit-policy", auditPolicy);
    this.ensureRunNotCanceled(runId);

    const commitDiff = await computeCommitDiffGate({
      currentRunId: runId,
      request,
      target: prepared.target,
      auditPolicy
    });
    await artifactStore.writeJson(runId, "commit-diff", commitDiff);
    this.ensureRunNotCanceled(runId);

    const initialTargetClass = prepared.analysis.mcp_indicators.length > 0 ? "mcp_server_plugin_skill_package" : prepared.analysis.agent_indicators.length > 0 || prepared.analysis.tool_execution_indicators.length > 0 ? "tool_using_multi_turn_agent" : prepared.analysis.entry_points.length > 0 ? "runnable_local_app" : "repo_posture_only";
    const auditPackage = resolveAuditPackage({ request, analysis: prepared.analysis, initialTargetClass: initialTargetClass as any });
    const resolvedConfiguration = stageResolveConfig({
      runId,
      request,
      auditPolicy,
      auditPackage,
      initialTargetClass: initialTargetClass as any
    });
    await artifactStore.writeJson(runId, "resolved-config", resolvedConfiguration);
    const controlCatalog = getCandidateControls({ analysis: prepared.analysis, targetClass: initialTargetClass as any, request });
    const reused = await loadReusedStageArtifacts(commitDiff);

    let plannerArtifact = reused.plannerArtifact;
    let targetProfile = reused.targetProfile;
    if (plannerArtifact && targetProfile) {
      observer.emit({ level: "info", stage: "plan_scope", actor: "orchestrator", eventType: "stage_reused", status: "reused", details: { source_run_id: commitDiff.previous_run_id } });
    } else {
      const planStage = await observer.observeStage({
        stage: "plan_scope",
        actor: "planner_agent",
        details: { control_catalog_size: controlCatalog.length },
        fn: async () => stagePlanScope({
          runId,
          request,
          sandbox: prepared.sandbox,
          target: prepared.target,
          analysis: prepared.analysis,
          repoContext: prepared.repoContext,
          methodology,
          auditPolicy,
          controlCatalog,
          agentRuntime
        })
      });
      plannerArtifact = planStage.plannerArtifact;
      targetProfile = planStage.targetProfile;
    }
    if (!plannerArtifact || !targetProfile) { throw new Error("Planner stage did not produce reusable artifacts."); }
    trace.steps.push({ step: 2, actor: "stage_plan_scope", action: "plan_scope", summary: `Planner selected ${plannerArtifact.selected_profile} and final class ${targetProfile.semantic_review.final_class}.`, artifacts: ["planner-artifact.json", "target-profile.json"], timestamp: nowIso() });
    await artifactStore.writeJson(runId, "planner-artifact", plannerArtifact);
    await artifactStore.writeJson(runId, "target-profile", targetProfile);
    this.ensureRunNotCanceled(runId);

    let threatModel = reused.threatModel;
    if (threatModel) {
      observer.emit({ level: "info", stage: "threat_model", actor: "orchestrator", eventType: "stage_reused", status: "reused", details: { source_run_id: commitDiff.previous_run_id } });
    } else {
      threatModel = await observer.observeStage({
        stage: "threat_model",
        actor: "threat_model_agent",
        details: { target_class: targetProfile!.semantic_review.final_class },
        fn: async () => stageThreatModel({
          runId,
          request,
          sandbox: prepared.sandbox,
          target: prepared.target,
          analysis: prepared.analysis,
          repoContext: prepared.repoContext,
          targetProfile: targetProfile!,
          plannerArtifact: plannerArtifact!,
          methodology,
          auditPolicy,
          agentRuntime
        })
      });
    }
    if (!threatModel) { throw new Error("Threat model stage did not produce a reusable artifact."); }
    trace.steps.push({ step: 3, actor: "stage_threat_model", action: "threat_model", summary: `Threat model identified ${threatModel.high_risk_components.length} high-risk components.`, artifacts: ["threat-model.json"], timestamp: nowIso() });
    await artifactStore.writeJson(runId, "threat-model", threatModel);
    this.ensureRunNotCanceled(runId);

    let evalSelection = reused.evalSelection;
    if (evalSelection) {
      observer.emit({ level: "info", stage: "select_evidence", actor: "orchestrator", eventType: "stage_reused", status: "reused", details: { source_run_id: commitDiff.previous_run_id } });
    } else {
      evalSelection = await observer.observeStage({
        stage: "select_evidence",
        actor: "eval_selection_agent",
        details: { target_class: targetProfile!.semantic_review.final_class },
        fn: async () => stageSelectEvidence({
          runId,
          request,
          sandbox: prepared.sandbox,
          target: prepared.target,
          analysis: prepared.analysis,
          repoContext: prepared.repoContext,
          targetProfile: targetProfile!,
          plannerArtifact: plannerArtifact!,
          threatModel: threatModel!,
          controlCatalog,
          methodology,
          auditPolicy,
          agentRuntime
        })
      });
    }
    if (!evalSelection) { throw new Error("Eval selection stage did not produce a reusable artifact."); }
    trace.steps.push({ step: 4, actor: "stage_select_evidence", action: "select_evidence", summary: `Selected ${evalSelection.baseline_tools.length + evalSelection.runtime_tools.length} evidence providers.`, artifacts: ["eval-selection.json"], timestamp: nowIso() });
    await artifactStore.writeJson(runId, "eval-selection", evalSelection);
    this.ensureRunNotCanceled(runId);

    const laneReuseDecisions = computeLaneReuseDecisions({ commitDiff, enabledLanes: auditPackage.enabled_lanes as any });
    const lanePlans = await observer.observeStage({
      stage: "allocate_audit_lanes",
      actor: "stage_allocate_audit_lanes",
      details: { enabled_lane_count: auditPackage.enabled_lanes.length },
      fn: async () => stageAllocateLanes({
        enabledLanes: auditPackage.enabled_lanes as any,
        plannerArtifact: plannerArtifact!,
        evalSelection,
        threatModel: threatModel!,
        controlCatalog
      })
    });
    trace.steps.push({ step: 5, actor: "stage_allocate_audit_lanes", action: "allocate_audit_lanes", summary: `Allocated ${lanePlans.length} active audit lanes.`, artifacts: ["lane-plans.json"], timestamp: nowIso() });
    await artifactStore.writeJson(runId, "lane-plans", lanePlans);
    await artifactStore.writeJson(runId, "lane-reuse-decisions", laneReuseDecisions);
    this.ensureRunNotCanceled(runId);

    const reusedLaneNames = laneReuseDecisions.filter((item) => item.decision === "reuse").map((item) => item.lane_name);
    const rerunLanePlans = lanePlans.filter((plan) => !reusedLaneNames.includes(plan.lane_name));

    let cycle: AssessmentCycle;
    if (commitDiff.previous_run_id && rerunLanePlans.length === 0 && reusedLaneNames.length === lanePlans.length) {
      observer.emit({
        level: "info",
        stage: "assess_controls",
        actor: "orchestrator",
        eventType: "stage_reused",
        status: "reused",
        details: { source_run_id: commitDiff.previous_run_id, reused_lane_count: reusedLaneNames.length }
      });
      cycle = await loadReusedAssessmentCycle(commitDiff.previous_run_id);
    } else {
      cycle = await observer.observeStage({
        stage: "assess_controls",
        actor: "stage_assess_controls",
        details: { provider_count: evalSelection.baseline_tools.length + evalSelection.runtime_tools.length, lane_count: rerunLanePlans.length || lanePlans.length },
        fn: async () => stageAssessControls({
          request,
          sandbox: prepared.sandbox,
          target: prepared.target,
          analysis: prepared.analysis,
          targetClass: targetProfile!.semantic_review.final_class,
          methodology,
          controlCatalog,
          threatModel: threatModel!,
          plannerArtifact: plannerArtifact!,
          evalSelectionArtifact: evalSelection,
          runId,
          repoContext: prepared.repoContext,
          auditPolicy,
          agentRuntime,
          lanePlans: rerunLanePlans.length ? rerunLanePlans : lanePlans,
          analysisSummaryForEvidence: { analysis: prepared.analysis, repoContext: prepared.repoContext },
          auditPackageId: auditPackage.id
        })
      });
    }

    if (commitDiff.previous_run_id && reusedLaneNames.length > 0 && rerunLanePlans.length > 0) {
      const [priorLaneResultRows, priorLaneSpecialistRows, priorEvidenceRecordRows, priorControlResultRows, priorFindingRows, priorObservations] = await Promise.all([
        readPersistedLaneResults(commitDiff.previous_run_id).catch(() => []),
        readPersistedLaneSpecialistOutputs(commitDiff.previous_run_id).catch(() => []),
        readPersistedEvidenceRecords(commitDiff.previous_run_id).catch(() => []),
        readPersistedControlResults(commitDiff.previous_run_id).catch(() => []),
        readPersistedFindings(commitDiff.previous_run_id).catch(() => []),
        readPersistedStageArtifact<any[]>(commitDiff.previous_run_id, "observations").then((value) => value ?? []).catch(() => [])
      ]);
      const priorFindings = priorFindingRows.map(toFinding);
      const priorControlResults = priorControlResultRows.map(toControlResult);
      const priorLaneResults = buildLaneResultsFromPersistedRecords(priorLaneResultRows, priorFindings, priorControlResults);
      const priorLaneSpecialistOutputs = priorLaneSpecialistRows.map(toLaneSpecialistOutput);
      const priorEvidenceRecords = priorEvidenceRecordRows.map(toEvidenceRecord);

      const reusedLaneResults = priorLaneResults.filter((lane) => reusedLaneNames.includes(lane.lane_name));
      const reusedControlIds = new Set(reusedLaneResults.flatMap((lane) => lane.control_results.map((control: any) => control.control_id)));
      const reusedFindingIds = new Set(reusedLaneResults.flatMap((lane) => lane.findings.map((finding: any) => finding.finding_id)));
      const reusedEvidenceIds = new Set(reusedLaneResults.flatMap((lane) => lane.evidence_used ?? []));

      cycle = {
        ...cycle,
        laneResults: mergeLaneArtifacts({ current: cycle.laneResults, reused: reusedLaneResults, key: (item: any) => item.lane_name }),
        laneSpecialistOutputs: mergeLaneArtifacts({ current: cycle.laneSpecialistOutputs ?? [], reused: priorLaneSpecialistOutputs.filter((item: any) => reusedLaneNames.includes(item.lane_name)), key: (item: any) => item.lane_name }),
        controlResults: mergeLaneArtifacts({ current: cycle.controlResults, reused: priorControlResults.filter((item) => reusedControlIds.has(item.control_id)), key: (item: any) => item.control_id }),
        findings: mergeLaneArtifacts({ current: cycle.findings, reused: priorFindings.filter((item) => reusedFindingIds.has(item.finding_id)), key: (item: any) => item.finding_id }),
        evidenceRecords: mergeLaneArtifacts({ current: cycle.evidenceRecords, reused: priorEvidenceRecords.filter((item) => reusedEvidenceIds.has(item.evidence_id)), key: (item: any) => item.evidence_id }),
        observations: mergeLaneArtifacts({ current: cycle.observations, reused: priorObservations, key: (item: any) => item.observation_id })
      };
      cycle.dimensionScores = computeBaselineDimensionScores(cycle.controlResults, controlCatalog);
      cycle.staticScore = computeStaticBaselineScore(cycle.dimensionScores);
      cycle.scoreSummary = recomputeScoreSummary(methodology, prepared.analysis.project_name, cycle.controlResults, cycle.findings);
    }

    trace.steps.push({ step: 6, actor: "stage_assess_controls", action: "assess_controls", summary: `Executed ${cycle.evidenceExecutions.length} evidence providers across ${cycle.laneResults.length} lanes and produced ${cycle.findings.length} findings.`, artifacts: ["run-plan.json", "tool-executions.json", "control-results.json", "lane-results.json"], timestamp: nowIso() });
    await artifactStore.writeJson(runId, "run-plan", cycle.runPlan);
    await artifactStore.writeJson(runId, "tool-executions", cycle.evidenceExecutions);
    await artifactStore.writeJson(runId, "evidence-executions", cycle.evidenceExecutions);
    await artifactStore.writeJson(runId, "evidence-records", cycle.evidenceRecords);
    await artifactStore.writeJson(runId, "lane-results", cycle.laneResults);
    await materializeLaneSpecialistArtifacts(runId, artifactStore, cycle.laneSpecialistOutputs ?? []);
    await artifactStore.writeJson(runId, "control-results", cycle.controlResults);
    await artifactStore.writeJson(runId, "findings-pre-skeptic", cycle.findings);
    await artifactStore.writeJson(runId, "score-summary", cycle.scoreSummary);
    await artifactStore.writeJson(runId, "stage-executions", buildStageExecutions(runId, observer.events));
    this.ensureRunNotCanceled(runId);

    let skepticReview = await observer.observeStage({
      stage: "skeptic_review",
      actor: "audit_supervisor_agent",
      details: { finding_count: cycle.findings.length },
      fn: async () => stageSkepticReview({
      runId,
      request,
      sandbox: prepared.sandbox,
      target: prepared.target,
      analysis: prepared.analysis,
      repoContext: prepared.repoContext,
      runPlan: cycle.runPlan,
      findings: cycle.findings,
      controlResults: cycle.controlResults,
      toolExecutions: cycle.evidenceExecutions,
          threatModel: threatModel!,
      scoreSummary: cycle.scoreSummary,
      controlCatalog,
      lanePlans,
      laneResults: cycle.laneResults,
      auditPolicy,
      agentRuntime
    })
    });
    trace.steps.push({ step: 7, actor: "stage_skeptic_review", action: "skeptic_review", summary: `Skeptic emitted ${skepticReview.actions.length} typed actions.`, artifacts: ["skeptic-review.json"], timestamp: nowIso() });
    await artifactStore.writeJson(runId, "skeptic-review", skepticReview);
    this.ensureRunNotCanceled(runId);

    let correctionPlan = null;
    let correctionResult = null;

    if (hasSkepticActions(skepticReview)) {
      correctionPlan = buildCorrectionPlanArtifact({ skeptic: skepticReview, lanePlans });
      await artifactStore.writeJson(runId, "correction-plan", correctionPlan);

      const needsPlanner = correctionPlan.rerun.planner;
      const needsThreat = correctionPlan.rerun.threat_model;
      const needsEval = correctionPlan.rerun.eval_selection;
      const evidenceSubset = correctionPlan.rerun.provider_ids;
      const toolSubset = correctionPlan.rerun.tool_provider_ids.length ? correctionPlan.rerun.tool_provider_ids : selectToolSubset(skepticReview.actions);
      const laneSubset = selectLaneSubset(skepticReview.actions);
      let mergedLaneNames: string[] = [];
      let mergedProviderIds: string[] = [];
      let mergedToolProviderIds: string[] = [];
      let mergedControlIds: string[] = [];
      let mergedFindingIds: string[] = [];
      let reusedLaneNames: string[] = [];
      let reusedProviderIds: string[] = [];
      let reusedToolProviderIds: string[] = [];

      if (needsPlanner) {
        const replanned = await stagePlanScope({
          runId,
          request,
          sandbox: prepared.sandbox,
          target: prepared.target,
          analysis: prepared.analysis,
          repoContext: prepared.repoContext,
          methodology,
          auditPolicy,
          controlCatalog,
          agentRuntime,
          skepticFeedback: skepticReview,
          priorPlannerArtifact: plannerArtifact,
          priorRunPlan: cycle.runPlan
        });
        plannerArtifact = replanned.plannerArtifact;
        targetProfile = replanned.targetProfile;
        await artifactStore.writeJson(runId, "planner-artifact-corrected", replanned.plannerArtifact);
        await artifactStore.writeJson(runId, "target-profile", replanned.targetProfile);
      }

      let currentThreatModel = threatModel;
      if (needsPlanner || needsThreat) {
        currentThreatModel = await stageThreatModel({
          runId,
          request,
          sandbox: prepared.sandbox,
          target: prepared.target,
          analysis: prepared.analysis,
          repoContext: prepared.repoContext,
          targetProfile: targetProfile!,
          plannerArtifact: plannerArtifact!,
          methodology,
          auditPolicy,
          agentRuntime
        });
        await artifactStore.writeJson(runId, "threat-model", currentThreatModel);
      }

      if (needsPlanner || needsThreat || needsEval) {
        evalSelection = await stageSelectEvidence({
          runId,
          request,
          sandbox: prepared.sandbox,
          target: prepared.target,
          analysis: prepared.analysis,
          repoContext: prepared.repoContext,
          targetProfile: targetProfile!,
          plannerArtifact: plannerArtifact!,
          threatModel: currentThreatModel,
          controlCatalog,
          methodology,
          auditPolicy,
          agentRuntime,
          skepticFeedback: skepticReview
        });
        await artifactStore.writeJson(runId, "eval-selection-corrected", evalSelection);
      }

      if (needsPlanner || needsThreat || needsEval || evidenceSubset.length > 0 || laneSubset.length > 0 || skepticReview.actions.some((action) => action.type === "reassess_control_subset" || action.type === "request_additional_evidence")) {
        const priorCycle = cycle;
        const reassessedCycle = await stageAssessControls({
          request,
          sandbox: prepared.sandbox,
          target: prepared.target,
          analysis: prepared.analysis,
          targetClass: targetProfile!.semantic_review.final_class,
          methodology,
          controlCatalog,
          threatModel: currentThreatModel,
          plannerArtifact: plannerArtifact!,
          evalSelectionArtifact: evalSelection,
          runId,
          repoContext: prepared.repoContext,
          auditPolicy,
          agentRuntime,
          lanePlans: laneSubset.length ? lanePlans.filter((plan) => laneSubset.includes(plan.lane_name)) : lanePlans,
          analysisSummaryForEvidence: { analysis: prepared.analysis, repoContext: prepared.repoContext },
          evidenceOverrideIds: evidenceSubset.length ? evidenceSubset : undefined,
          auditPackageId: auditPackage.id
        });
        if (correctionPlan.merge_strategy === "merge_selective") {
          const selectiveMerge = mergeSelectiveAssessmentCycle({
            baseCycle: priorCycle,
            patchCycle: reassessedCycle,
            methodology,
            analysisProjectName: prepared.analysis.project_name,
            controlCatalog
          });
          cycle = selectiveMerge.cycle;
          mergedLaneNames = selectiveMerge.mergeSummary.merged_lane_names;
          mergedProviderIds = selectiveMerge.mergeSummary.merged_provider_ids;
          mergedToolProviderIds = mergedProviderIds.filter((item) => toolSubset.includes(item));
          mergedControlIds = selectiveMerge.mergeSummary.merged_control_ids;
          mergedFindingIds = selectiveMerge.mergeSummary.merged_finding_ids;
          reusedLaneNames = selectiveMerge.mergeSummary.reused_lane_names;
          reusedProviderIds = selectiveMerge.mergeSummary.reused_provider_ids;
          reusedToolProviderIds = reusedProviderIds.filter((item) => toolSubset.includes(item));
        } else {
          cycle = reassessedCycle;
          mergedLaneNames = cycle.laneResults.map((item) => item.lane_name);
          mergedProviderIds = cycle.evidenceExecutions.map((item) => item.provider_id);
          mergedToolProviderIds = mergedProviderIds.filter((item) => toolSubset.includes(item));
          mergedControlIds = cycle.controlResults.map((item) => item.control_id);
          mergedFindingIds = cycle.findings.map((item) => item.finding_id);
        }
        await artifactStore.writeJson(runId, "run-plan", cycle.runPlan);
        await artifactStore.writeJson(runId, "tool-executions", cycle.evidenceExecutions);
        await artifactStore.writeJson(runId, "evidence-executions", cycle.evidenceExecutions);
        await artifactStore.writeJson(runId, "evidence-records", cycle.evidenceRecords);
        await artifactStore.writeJson(runId, "lane-results", cycle.laneResults);
        await materializeLaneSpecialistArtifacts(runId, artifactStore, cycle.laneSpecialistOutputs ?? []);
        await artifactStore.writeJson(runId, "control-results", cycle.controlResults);
        await artifactStore.writeJson(runId, "findings-pre-skeptic", cycle.findings);
        await artifactStore.writeJson(runId, "score-summary", cycle.scoreSummary);
        await artifactStore.writeJson(runId, "stage-executions", buildStageExecutions(runId, observer.events));
      }

      threatModel = currentThreatModel;

      skepticReview = await stageSkepticReview({
        runId,
        request,
        sandbox: prepared.sandbox,
        target: prepared.target,
        analysis: prepared.analysis,
        repoContext: prepared.repoContext,
        runPlan: cycle.runPlan,
        findings: cycle.findings,
        controlResults: cycle.controlResults,
        toolExecutions: cycle.evidenceExecutions,
        threatModel: currentThreatModel,
        scoreSummary: cycle.scoreSummary,
        controlCatalog,
        lanePlans,
        laneResults: cycle.laneResults,
        auditPolicy,
        agentRuntime,
        correctionPass: true
      });
      correctionResult = buildCorrectionResultArtifact({
        correctionPlan,
        finalSkepticReview: skepticReview,
        mergedLaneNames,
        mergedProviderIds,
        mergedToolProviderIds,
        mergedControlIds,
        mergedFindingIds,
        reusedLaneNames,
        reusedProviderIds,
        reusedToolProviderIds
      });
      await artifactStore.writeJson(runId, "skeptic-review-final", skepticReview);
      await artifactStore.writeJson(runId, "correction-result", correctionResult);
      await artifactStore.writeJson(runId, "stage-executions", buildStageExecutions(runId, observer.events));
      trace.steps.push({ step: 7, actor: "stage_corrections", action: "apply_skeptic_actions", summary: `Applied correction flow using ${correctionPlan.merge_strategy} strategy and completed final skeptic review with ${skepticReview.actions.length} remaining actions.`, artifacts: ["correction-plan.json", "correction-result.json", "skeptic-review-final.json"], timestamp: nowIso() });
      this.ensureRunNotCanceled(runId);
    }

    for (const execution of cycle.evidenceExecutions) {
      observer.emit({
        level:
          execution.status === "failed"
            ? "error"
            : execution.status === "skipped" && (execution.failure_category === "sandbox_blocked" || execution.failure_category === "command_unavailable")
              ? "info"
              : execution.status === "skipped"
                ? "warn"
                : "info",
        stage: "evidence_execution",
        actor: execution.provider_id,
        eventType: "provider_completed",
        status: execution.status,
        details: { tool: execution.tool, provider_kind: execution.provider_kind, summary: execution.summary }
      });
      observer.metrics.increment("provider_execution_total", 1, { provider_id: execution.provider_id, status: execution.status });
    }

    const findingsPrePolicy = applySkepticReview(cycle.findings, skepticReview);
    let controlResultsPrePolicy = updateControlResultsWithFindings(cycle.controlResults, findingsPrePolicy);
    controlResultsPrePolicy = applyControlDowngrades(controlResultsPrePolicy, skepticReview);
    const policyApplied = stageApplyPolicyOverrides({
      auditPolicy,
      findings: findingsPrePolicy,
      controlResults: controlResultsPrePolicy
    });
    const findings = policyApplied.findings;
    const controlResults = policyApplied.controlResults;
    const policyApplication = policyApplied.policyApplication;
    const reconciledLaneResults = reconcileLaneResultsWithPolicy(cycle.laneResults, findings, controlResults);
    const refreshedLaneArtifacts = refreshLaneArtifacts({
      auditPackageId: auditPackage.id,
      lanePlans,
      laneResults: reconciledLaneResults,
      analysis: prepared.analysis,
      threatModel: threatModel!,
      toolExecutions: cycle.evidenceExecutions,
      evidenceRecords: cycle.evidenceRecords
    });
    const finalLaneResults = refreshedLaneArtifacts.laneResults;
    const finalObservations = dedupeObservations(mergeLaneArtifacts({ current: refreshedLaneArtifacts.laneObservations, reused: cycle.observations, key: (item: any) => item.observation_id }));
    const scoreSummary = recomputeScoreSummary(methodology, prepared.analysis.project_name, controlResults, findings);
    const dimensionScores = computeBaselineDimensionScores(controlResults, controlCatalog);
    const staticScore = computeStaticBaselineScore(dimensionScores);

    await artifactStore.writeJson(runId, "findings-pre-policy", findingsPrePolicy);
    await artifactStore.writeJson(runId, "control-results-pre-policy", controlResultsPrePolicy);
    await artifactStore.writeJson(runId, "policy-application", policyApplication);
    await artifactStore.writeJson(runId, "findings", findings);
    await artifactStore.writeJson(runId, "control-results", controlResults);
    await artifactStore.writeJson(runId, "final-score-summary", scoreSummary);
    await artifactStore.writeJson(runId, hasSkepticActions(skepticReview) ? "skeptic-review-final" : "skeptic-review", skepticReview);
    this.ensureRunNotCanceled(runId);

    const remediation = await observer.observeStage({
      stage: "remediation",
      actor: "remediation_agent",
      details: { final_finding_count: findings.length },
      fn: async () => stageRemediation({
      runId,
      request,
      sandbox: prepared.sandbox,
      target: prepared.target,
      analysis: prepared.analysis,
      repoContext: prepared.repoContext,
      runPlan: cycle.runPlan,
      findings,
      controlResults,
      observations: finalObservations,
      skepticReview,
      scoreSummary,
      auditPolicy,
      agentRuntime,
      skepticArtifactName: hasSkepticActions(skepticReview) ? "skeptic-review-final.json" : "skeptic-review.json"
    })
    });
    trace.steps.push({ step: trace.steps.length + 1, actor: "stage_remediation", action: "remediation", summary: `Remediation memo generated with ${remediation.checklist.length} checklist items.`, artifacts: ["remediation.json"], timestamp: nowIso() });
    this.ensureRunNotCanceled(runId);

    const publishability = stageScoreAndPublishability({
      findings,
      skepticReview,
      remediation,
      auditPackage,
      auditPolicy
    });
    await artifactStore.writeJson(runId, "publishability", publishability);
    trace.steps.push({ step: trace.steps.length + 1, actor: "stage_score_and_publishability", action: "score_and_publishability", summary: `Publishability evaluated as ${publishability.publishability_status} with ${publishability.gating_findings.length} gating findings.`, artifacts: ["publishability.json"], timestamp: nowIso() });

    observer.metrics.gauge("findings_total", findings.length);
    observer.metrics.gauge("static_score", staticScore);
    observer.metrics.gauge("dimension_count", dimensionScores.length);
    observer.metrics.gauge("agent_call_count", agentRuntime.artifacts.invocations.length);
    const usageTotals = aggregateInvocationUsage(agentRuntime.artifacts.invocations);
    observer.metrics.gauge("llm_context_bytes_total", usageTotals.contextBytesTotal);
    observer.metrics.gauge("llm_user_prompt_bytes_total", usageTotals.userPromptBytesTotal);
    observer.metrics.gauge("llm_prompt_tokens_total", usageTotals.promptTokensTotal);
    observer.metrics.gauge("llm_completion_tokens_total", usageTotals.completionTokensTotal);
    observer.metrics.gauge("llm_total_tokens_total", usageTotals.totalTokensTotal);
    observer.metrics.gauge("llm_estimated_cost_usd", Number(usageTotals.estimatedCostUsdTotal.toFixed(8)));

    observer.emit({ level: "info", stage: "run", actor: "orchestrator", eventType: "run_completed", status: "success", details: { static_score: staticScore, findings: findings.length } });

    const artifacts = [
      await artifactStore.writeJson(runId, "preflight-summary", preflightSummary),
      await artifactStore.writeJson(runId, "launch-intent", launchIntent),
      await artifactStore.writeJson(runId, "sandbox", prepared.sandbox),
      await artifactStore.writeJson(runId, "target", prepared.target),
      await artifactStore.writeJson(runId, "analysis", prepared.analysis),
      await artifactStore.writeJson(runId, "repo-context", prepared.repoContext),
      await artifactStore.writeJson(runId, "target-profile", targetProfile),
      await artifactStore.writeJson(runId, "methodology", methodology),
      await artifactStore.writeJson(runId, "static-baseline", staticBaseline),
      await artifactStore.writeJson(runId, "audit-policy", auditPolicy),
      await artifactStore.writeJson(runId, "resolved-config", resolvedConfiguration),
      await artifactStore.writeJson(runId, "commit-diff", commitDiff),
      await artifactStore.writeJson(runId, "planner-artifact", plannerArtifact),
      await artifactStore.writeJson(runId, "threat-model", threatModel),
      await artifactStore.writeJson(runId, "eval-selection", evalSelection),
      await artifactStore.writeJson(runId, "run-plan", cycle.runPlan),
      await artifactStore.writeJson(runId, "evidence-executions", cycle.evidenceExecutions),
      await artifactStore.writeJson(runId, "evidence-records", cycle.evidenceRecords),
      await artifactStore.writeJson(runId, "lane-results", finalLaneResults),
      ...(await materializeLaneSpecialistArtifacts(runId, artifactStore, cycle.laneSpecialistOutputs ?? [])),
      await artifactStore.writeJson(runId, "tool-executions", cycle.evidenceExecutions),
      await artifactStore.writeJson(runId, "control-results", controlResults),
      await artifactStore.writeJson(runId, "findings-pre-skeptic", cycle.findings),
      await artifactStore.writeJson(runId, "score-summary", cycle.scoreSummary),
      await artifactStore.writeJson(runId, "skeptic-review", skepticReview),
      ...(correctionPlan ? [await artifactStore.writeJson(runId, "correction-plan", correctionPlan)] : []),
      ...(correctionResult ? [await artifactStore.writeJson(runId, "correction-result", correctionResult)] : []),
      await artifactStore.writeJson(runId, "findings-pre-policy", findingsPrePolicy),
      await artifactStore.writeJson(runId, "control-results-pre-policy", controlResultsPrePolicy),
      await artifactStore.writeJson(runId, "policy-application", policyApplication),
      await artifactStore.writeJson(runId, "findings", findings),
      await artifactStore.writeJson(runId, "final-control-results", controlResults),
      await artifactStore.writeJson(runId, "observations", finalObservations),
      await artifactStore.writeJson(runId, "final-score-summary", scoreSummary),
      await artifactStore.writeJson(runId, "dimension-scores", dimensionScores),
      await artifactStore.writeJson(runId, "static-score", { score: staticScore, methodology_version: staticBaseline.version }),
      await artifactStore.writeJson(runId, "remediation", remediation),
      await artifactStore.writeJson(runId, "publishability", publishability),
      await artifactStore.writeJson(runId, "agent-config-summary", agentRuntime.artifacts.configSummary),
      await artifactStore.writeJson(runId, "agent-invocations", agentRuntime.artifacts.invocations),
      await artifactStore.writeJson(runId, "handoffs", agentRuntime.artifacts.handoffs),
      await artifactStore.writeJson(runId, "trace", trace),
      await artifactStore.writeJson(runId, "stage-executions", buildStageExecutions(runId, observer.events)),
      await artifactStore.writeText(runId, "events", "events.jsonl", formatEventJsonl(observer.events)),
      await artifactStore.writeJson(runId, "metrics", observer.snapshotMetrics())
    ];

    const result: AuditResult = {
      run_id: runId,
      status: "succeeded",
      audit_package: auditPackage.id,
      audit_lanes: auditPackage.enabled_lanes,
      preflight_summary: preflightSummary,
      launch_intent: launchIntent,
      sandbox: prepared.sandbox,
      target: prepared.target,
      analysis: prepared.analysis,
      repo_context: prepared.repoContext,
      audit_policy: auditPolicy,
      resolved_configuration: resolvedConfiguration,
      commit_diff: commitDiff,
      lane_reuse_decisions: laneReuseDecisions,
      lane_plans: lanePlans,
      evidence_records: cycle.evidenceRecords,
      lane_results: finalLaneResults,
      lane_specialist_outputs: cycle.laneSpecialistOutputs ?? [],
      target_profile: targetProfile,
      run_plan: cycle.runPlan,
      threat_model: threatModel,
      evidence_executions: cycle.evidenceExecutions,
      tool_executions: cycle.evidenceExecutions,
      findings,
      control_results: controlResults,
      methodology,
      static_baseline: staticBaseline,
      dimension_scores: dimensionScores,
      static_score: staticScore,
      observations: finalObservations,
      score_summary: scoreSummary,
      skeptic_review: skepticReview,
      correction_plan: correctionPlan,
      correction_result: correctionResult,
      remediation,
      publishability,
      policy_application: policyApplication,
      agent_config_summary: agentRuntime.artifacts.configSummary,
      agent_invocations: agentRuntime.artifacts.invocations,
      handoffs: agentRuntime.artifacts.handoffs,
      artifacts,
      trace,
      observability: {
        events: observer.events,
        metrics: observer.snapshotMetrics()
      }
    };

    const persistence = await persistAuditResult({ result, packageDefinition: auditPackage, request });
    result.persistence = persistence;
    await persistPersistenceSummary({
      runId,
      targetId: prepared.target.target_id,
      createdAt: result.trace.steps[0]?.timestamp ?? new Date().toISOString(),
      summary: persistence,
      request
    });
    result.artifacts.push(await artifactStore.writeJson(runId, "persistence-summary", persistence));

    await exportArtifactsToOutputDir(runId, artifactDir, request.output_dir);

    await registerRunArtifactLocation({
      runId,
      artifactDir,
      request,
      status: "succeeded"
    });

    this.queue.update(runId, { status: "succeeded", result });
    this.cancelRequested.delete(runId);
    return result;
    } catch (error) {
      const canceled = error instanceof CanceledRunError || this.cancelRequested.has(runId);
      this.cancelRequested.delete(runId);
      observer.emit({
        level: canceled ? "warn" : "error",
        stage: "run",
        actor: "orchestrator",
        eventType: "run_completed",
        status: canceled ? "canceled" : "failed",
        details: { error: canceled ? "canceled_by_user" : (error instanceof Error ? error.message : String(error)) }
      });
      await registerRunArtifactLocation({
        runId,
        artifactDir,
        request,
        status: canceled ? "canceled" : "failed"
      }).catch(() => undefined);
      this.queue.update(runId, {
        status: canceled ? "canceled" : "failed",
        error: canceled ? "canceled_by_user" : (error instanceof Error ? error.message : String(error))
      });
      if (canceled) {
        throw new CanceledRunError(runId);
      }
      throw error;
    }
  }

  enqueue(request: AuditRequest, options?: { retryOfRunId?: string }): RunEnvelope {
    const runId = createId("run", deriveRunLabel(request));
    return this.queue.add({
      run_id: runId,
      status: "queued",
      request,
      created_at: nowIso(),
      updated_at: nowIso(),
      retry_of_run_id: options?.retryOfRunId
    });
  }

  listRuns(): RunEnvelope[] {
    return this.queue.list();
  }

  hydrateRun(envelope: RunEnvelope): RunEnvelope {
    return this.queue.add(envelope);
  }

  async startRun(runId: string): Promise<RunEnvelope | undefined> {
    const run = this.queue.get(runId);
    if (!run || run.status !== "queued") return run;
    this.queue.update(runId, { status: "running", error: undefined, result: undefined });
    void this.run(run.request, { runId, retryOfRunId: run.retry_of_run_id }).catch(() => undefined);
    return this.queue.get(runId);
  }

  cancelRun(runId: string): RunEnvelope | undefined {
    const run = this.queue.get(runId);
    if (!run) return undefined;
    if (run.status === "queued") {
      return this.queue.update(runId, { status: "canceled", error: "canceled_by_user", result: undefined });
    }
    if (run.status === "running") {
      this.cancelRequested.add(runId);
      return this.queue.update(runId, { error: "cancel_requested" });
    }
    return run;
  }

  retryRun(runId: string): RunEnvelope | undefined {
    const run = this.queue.get(runId);
    if (!run || (run.status !== "failed" && run.status !== "canceled")) return undefined;
    return this.enqueue(run.request, { retryOfRunId: runId });
  }

  getRun(runId: string): RunEnvelope | undefined {
    return this.queue.get(runId);
  }
}

export function createEngine(): AuditEngine {
  return new AuditEngine();
}





























