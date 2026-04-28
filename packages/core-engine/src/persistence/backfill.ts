import fs from "node:fs/promises";
import path from "node:path";

import type { HarnessEvent, RepoContextArtifact, ResolvedConfigurationArtifact, TargetClass } from "../contracts.js";
import {
  deriveCanonicalTargetId,
  deriveCanonicalTargetName as deriveSharedCanonicalTargetName
} from "../target-identity.js";
import { deriveScopeId, normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import type {
  PersistedAuditBundle,
  PersistedLaneSpecialistRecord,
  PersistedMetricRecord,
  PersistedResolvedConfigurationRecord,
  PersistedRunRecord,
  PersistedStageArtifactRecord,
  PersistedTargetSummaryRecord
} from "./contracts.js";
import type { PersistedRunQuery } from "./query.js";
import { getPersistedRun, listPersistedRuns, readPersistedDimensionScores, readPersistedPolicyApplication, readPersistedTargetSummary } from "./query.js";
import { LocalPersistenceStore } from "./local-store.js";
import {
  readPersistedAgentInvocations,
  readPersistedCommitDiff,
  readPersistedControlResults,
  readPersistedCorrectionPlan,
  readPersistedCorrectionResult,
  readPersistedEvidenceRecords,
  readPersistedFindings,
  readPersistedLanePlans,
  readPersistedLaneResults,
  readPersistedLaneReuseDecisions,
  readPersistedLaneSpecialistOutputs,
  readPersistedPersistenceSummary,
  readPersistedResolvedConfiguration,
  readPersistedReviewDecision,
  readPersistedScoreSummary,
  readPersistedStageArtifacts,
  readPersistedToolExecutions
} from "./run-details.js";

function defaultPersistenceRoot(): string {
  return path.resolve(process.cwd(), ".artifacts", "state", "local-db");
}

function isTargetClass(value: unknown): value is TargetClass {
  return [
    "repo_posture_only",
    "runnable_local_app",
    "hosted_endpoint_black_box",
    "tool_using_multi_turn_agent",
    "mcp_server_plugin_skill_package"
  ].includes(String(value));
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readTable<T>(rootDir: string, tableName: string): Promise<T[]> {
  try {
    return await readJsonFile<T[]>(path.join(rootDir, `${tableName}.json`));
  } catch {
    return [];
  }
}

async function tryReadArtifactJson<T>(artifactRoot: string | null, artifactName: string): Promise<T | null> {
  if (!artifactRoot) return null;
  try {
    return await readJsonFile<T>(path.join(artifactRoot, `${artifactName}.json`));
  } catch {
    return null;
  }
}

async function tryReadArtifactEvents(artifactRoot: string | null): Promise<HarnessEvent[]> {
  if (!artifactRoot) return [];
  try {
    const raw = await fs.readFile(path.join(artifactRoot, "events.jsonl"), "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as HarnessEvent);
  } catch {
    return [];
  }
}

function deriveCanonicalTargetName(bundle: any): string {
  const target = bundle.target ?? {};
  const snapshot = bundle.target_snapshot ?? {};
  return deriveSharedCanonicalTargetName({
    targetType: target.target_type,
    repoUrl: target.repo_url ?? null,
    localPath: target.target_type === "path" ? snapshot.snapshot_value ?? target.local_path ?? null : target.local_path ?? null,
    endpointUrl: target.endpoint_url ?? null,
    snapshotValue: snapshot.snapshot_value ?? null,
    fallbackName: target.canonical_name ?? "target"
  });
}

function deriveBestLocalPath(bundle: any): string | null {
  const target = bundle.target ?? {};
  const snapshot = bundle.target_snapshot ?? {};
  if (target.target_type !== "path") return target.local_path ?? null;
  return snapshot.snapshot_value ?? target.local_path ?? null;
}

function inferInvocationStageName(invocation: any): string | null {
  const outputArtifact = String(invocation?.output_artifact ?? "").toLowerCase();
  const agentName = String(invocation?.agent_name ?? "").toLowerCase();
  if (outputArtifact.includes("planner-artifact")) return "plan_scope";
  if (outputArtifact.includes("threat-model")) return "threat_model";
  if (outputArtifact.includes("eval-selection")) return "select_evidence";
  if (outputArtifact.includes("skeptic-review-final")) return "skeptic_review_correction";
  if (outputArtifact.includes("skeptic-review")) return "skeptic_review";
  if (outputArtifact.includes("remediation")) return "remediation";
  if (agentName === "planner_agent") return "plan_scope";
  if (agentName === "threat_model_agent") return "threat_model";
  if (agentName === "eval_selection_agent") return "select_evidence";
  if (agentName === "audit_supervisor_agent") return "skeptic_review";
  if (agentName === "remediation_agent") return "remediation";
  return null;
}

function enrichAgentInvocations(invocations: any[]): { invocations: any[]; changed: boolean } {
  let changed = false;
  const nextInvocations = invocations.map((invocation) => {
    const nextStageName = invocation?.stage_name ?? inferInvocationStageName(invocation);
    const nextLaneName = invocation?.lane_name ?? null;
    if (nextStageName !== (invocation?.stage_name ?? null) || nextLaneName !== (invocation?.lane_name ?? null)) {
      changed = true;
      return {
        ...invocation,
        stage_name: nextStageName,
        lane_name: nextLaneName
      };
    }
    return invocation;
  });
  return { invocations: nextInvocations, changed };
}

function derivePackageEcosystemsFromAnalysis(analysis: any): string[] {
  if (Array.isArray(analysis?.package_ecosystems)) return analysis.package_ecosystems;
  const manifests = Array.isArray(analysis?.dependency_manifests) ? analysis.dependency_manifests : [];
  const ecosystems = new Set<string>();
  for (const manifest of manifests) {
    const lower = String(manifest).toLowerCase();
    if (/package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock/.test(lower)) ecosystems.add("javascript");
    if (/requirements|pyproject\.toml|poetry\.lock|pipfile/.test(lower)) ecosystems.add("python");
    if (/go\.mod/.test(lower)) ecosystems.add("go");
    if (/cargo\.toml|cargo\.lock/.test(lower)) ecosystems.add("rust");
  }
  return [...ecosystems].sort();
}

function emptyNormalized(resultType: string, extra?: Record<string, unknown>): any {
  return {
    result_type: resultType,
    signal_count: 0,
    issue_count: 0,
    warning_count: 0,
    error_count: 0,
    severity_counts: { low: 0, medium: 0, high: 0, critical: 0 },
    ecosystems: [],
    coverage_paths: [],
    notes: [],
    ...(extra ?? {})
  };
}

function pushSeverity(summary: any, severity: string | null | undefined): void {
  const normalized = String(severity ?? "").toLowerCase();
  if (normalized === "low") summary.severity_counts.low += 1;
  if (normalized === "medium") summary.severity_counts.medium += 1;
  if (normalized === "high") summary.severity_counts.high += 1;
  if (normalized === "critical") summary.severity_counts.critical += 1;
}

function normalizeScorecardParsed(parsed: any): any {
  const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
  const summary = emptyNormalized("scorecard", {
    signal_count: checks.length,
    issue_count: checks.filter((item: any) => typeof item?.score === "number" && item.score < 5).length,
    warning_count: checks.filter((item: any) => typeof item?.score === "number" && item.score < 7).length,
    notes: checks.length ? [] : ["No scorecard checks parsed."]
  });
  if (checks.some((item: any) => typeof item?.score === "number" && item.score < 3)) {
    summary.notes.push("At least one scorecard check scored below 3.");
  }
  return summary;
}

function normalizeSemgrepParsed(parsed: any): any {
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  const errors = Array.isArray(parsed?.errors) ? parsed.errors : [];
  const coverage = new Set<string>();
  const summary = emptyNormalized("semgrep", {
    signal_count: results.length,
    issue_count: results.length,
    error_count: errors.length
  });
  for (const result of results) {
    pushSeverity(summary, result?.extra?.severity);
    if (typeof result?.path === "string" && result.path) coverage.add(result.path);
  }
  summary.coverage_paths = [...coverage].sort().slice(0, 50);
  if (errors.length) summary.notes.push(`Semgrep reported ${errors.length} parser/runtime errors.`);
  return summary;
}

function normalizeTrivyParsed(parsed: any): any {
  const results = Array.isArray(parsed?.Results) ? parsed.Results : [];
  const coverage = new Set<string>();
  const summary = emptyNormalized("trivy");
  for (const result of results) {
    const vulnerabilities = Array.isArray(result?.Vulnerabilities) ? result.Vulnerabilities : [];
    const misconfigurations = Array.isArray(result?.Misconfigurations) ? result.Misconfigurations : [];
    summary.signal_count += vulnerabilities.length + misconfigurations.length;
    summary.issue_count += vulnerabilities.length + misconfigurations.length;
    for (const item of vulnerabilities) pushSeverity(summary, item?.Severity);
    for (const item of misconfigurations) pushSeverity(summary, item?.Severity);
    if (typeof result?.Target === "string" && result.Target) coverage.add(result.Target);
    if (typeof result?.Type === "string" && result.Type) summary.notes.push(`coverage_type:${result.Type}`);
  }
  summary.coverage_paths = [...coverage].sort().slice(0, 50);
  summary.notes = [...new Set(summary.notes)];
  return summary;
}

function normalizeRepoAnalysis(args: { analysis: any; repoContext: RepoContextArtifact | null; toolExecution: any }): any {
  const capabilitySignals = Array.isArray(args.repoContext?.capability_signals) ? args.repoContext.capability_signals : [];
  const entryPoints = Array.isArray(args.analysis?.entry_points) ? args.analysis.entry_points.slice(0, 25) : [];
  const ecosystems = derivePackageEcosystemsFromAnalysis(args.analysis);
  return {
    result_type: "repo_analysis",
    signal_count: capabilitySignals.length + ecosystems.length + Math.min(entryPoints.length, 10),
    issue_count: 0,
    warning_count: 0,
    error_count: args.toolExecution?.status === "failed" ? 1 : 0,
    severity_counts: { low: 0, medium: 0, high: 0, critical: 0 },
    ecosystems,
    coverage_paths: entryPoints,
    notes: capabilitySignals.slice(0, 10)
  };
}

function summarizeNormalizedFromProvider(args: { providerId: string; toolExecution: any; analysis: any; repoContext: RepoContextArtifact | null }): any {
  const notes = [] as string[];
  if (typeof args.toolExecution?.summary === "string" && args.toolExecution.summary) notes.push(args.toolExecution.summary);
  const base = emptyNormalized("unknown", {
    error_count: args.toolExecution?.status === "failed" ? 1 : 0,
    notes
  });

  if (args.providerId === "repo_analysis") {
    const parsed = args.toolExecution?.parsed?.analysis ? args.toolExecution.parsed : null;
    return normalizeRepoAnalysis({
      analysis: parsed?.analysis ?? args.analysis,
      repoContext: parsed?.repoContext ?? args.repoContext,
      toolExecution: args.toolExecution
    });
  }
  if ((args.providerId === "scorecard" || args.providerId === "scorecard_api") && args.toolExecution?.parsed) {
    return normalizeScorecardParsed(args.toolExecution.parsed);
  }
  if (args.providerId === "semgrep" && args.toolExecution?.parsed) {
    return normalizeSemgrepParsed(args.toolExecution.parsed);
  }
  if (args.providerId === "trivy" && args.toolExecution?.parsed) {
    return normalizeTrivyParsed(args.toolExecution.parsed);
  }
  if (args.providerId === "scorecard" || args.providerId === "scorecard_api") return { ...base, result_type: "scorecard" };
  if (args.providerId === "semgrep") return { ...base, result_type: "semgrep" };
  if (args.providerId === "trivy") return { ...base, result_type: "trivy" };
  if (args.providerId === "internal_python_worker") return { ...base, result_type: "python_worker" };
  return base;
}

function deriveTargetSummary(args: { bundle: any; resolvedConfiguration: PersistedResolvedConfigurationRecord; analysis: any }): PersistedTargetSummaryRecord {
  const bundle = args.bundle;
  const run = bundle.run ?? {};
  const target = bundle.target ?? {};
  const snapshot = bundle.target_snapshot ?? {};
  const scoreSummary = bundle.score_summary ?? {};
  const reviewDecision = bundle.review_decision ?? null;
  const findings = Array.isArray(bundle.findings) ? bundle.findings : [];
  const canonicalTargetId = deriveCanonicalTargetId({
    targetType: target.target_type ?? args.resolvedConfiguration.target_kind ?? "path",
    repoUrl: target.repo_url ?? null,
    localPath: target.target_type === "path" ? snapshot.snapshot_value ?? target.local_path ?? null : target.local_path ?? null,
    endpointUrl: target.endpoint_url ?? null,
    snapshotValue: snapshot.snapshot_value ?? null,
    fallbackTargetId: target.id
  });
  const workspaceId = normalizeWorkspaceId(run.workspace_id);
  const projectId = normalizeProjectId(run.project_id);
  return {
    id: `${deriveScopeId({ workspaceId, projectId })}:${target.id}`,
    target_id: target.id,
    canonical_target_id: canonicalTargetId,
    workspace_id: workspaceId,
    project_id: projectId,
    canonical_name: deriveCanonicalTargetName(bundle),
    target_type: target.target_type ?? args.resolvedConfiguration.target_kind ?? "path",
    repo_url: target.repo_url ?? null,
    local_path: deriveBestLocalPath(bundle),
    endpoint_url: target.endpoint_url ?? null,
    latest_run_id: run.id,
    latest_run_created_at: run.created_at ?? run.started_at ?? new Date().toISOString(),
    latest_status: run.status ?? "succeeded",
    latest_run_mode: args.resolvedConfiguration.run_mode,
    latest_audit_package: args.resolvedConfiguration.selected_audit_package ?? run.audit_package,
    latest_target_class: args.resolvedConfiguration.initial_target_class,
    latest_rating: scoreSummary.rating ?? run.rating ?? "fair",
    latest_overall_score: scoreSummary.overall_score ?? run.overall_score ?? 0,
    latest_static_score: run.static_score ?? 0,
    latest_publishability_status: reviewDecision?.publishability_status ?? null,
    latest_human_review_required: reviewDecision?.human_review_required ?? null,
    latest_finding_count: findings.length,
    latest_frameworks_json: Array.isArray(args.analysis?.frameworks) ? args.analysis.frameworks : [],
    latest_languages_json: Array.isArray(args.analysis?.languages) ? args.analysis.languages : [],
    latest_package_ecosystems_json: derivePackageEcosystemsFromAnalysis(args.analysis),
    updated_at: run.completed_at ?? run.created_at ?? new Date().toISOString()
  };
}

function toPersistedResolvedConfiguration(runId: string, resolved: ResolvedConfigurationArtifact): PersistedResolvedConfigurationRecord {
  return {
    run_id: runId,
    policy_pack_id: resolved.policy_pack.id,
    policy_pack_name: resolved.policy_pack.name,
    policy_pack_source: resolved.policy_pack.source ?? null,
    policy_profile: resolved.policy_pack.profile,
    policy_version: resolved.policy_pack.version,
    requested_policy_pack: resolved.request_summary.requested_policy_pack,
    requested_audit_package: resolved.request_summary.requested_audit_package,
    selected_audit_package: resolved.audit_package.selected_id,
    audit_package_title: resolved.audit_package.title,
    audit_package_selection_mode: resolved.audit_package.selection_mode,
    initial_target_class: resolved.audit_package.initial_target_class,
    run_mode: resolved.request_summary.run_mode,
    target_kind: resolved.request_summary.target_kind,
    db_mode: resolved.request_summary.db_mode,
    output_dir: resolved.request_summary.output_dir,
    validation_json: resolved.validation,
    request_summary_json: resolved.request_summary,
    policy_pack_json: resolved.policy_pack,
    audit_package_json: resolved.audit_package
  };
}

async function tryReadTargetClass(artifactRoot: string): Promise<TargetClass | null> {
  const targetProfile = await tryReadArtifactJson<any>(artifactRoot, "target-profile");
  const candidate = targetProfile?.semantic_review?.final_class ?? targetProfile?.heuristic?.primary_class ?? null;
  return isTargetClass(candidate) ? candidate : null;
}

function inferLegacyResolvedConfiguration(bundle: any, runId: string, initialTargetClass: TargetClass | null): PersistedResolvedConfigurationRecord {
  const policyPack = bundle.policy_pack ?? null;
  const packageDefinition = bundle.package_definition ?? {};
  const run = bundle.run ?? {};
  const target = bundle.target ?? {};
  const mode = bundle.mode ?? "local";

  return {
    run_id: runId,
    policy_pack_id: policyPack?.id ?? run.policy_pack_id ?? null,
    policy_pack_name: policyPack?.name ?? null,
    policy_pack_source: policyPack?.source ?? null,
    policy_profile: null,
    policy_version: policyPack?.version ?? null,
    requested_policy_pack: null,
    requested_audit_package: null,
    selected_audit_package: run.audit_package ?? packageDefinition.id ?? null,
    audit_package_title: packageDefinition.title ?? null,
    audit_package_selection_mode: "auto",
    initial_target_class: initialTargetClass,
    run_mode: run.run_mode ?? packageDefinition.run_mode ?? "static",
    target_kind: target.target_type ?? "path",
    db_mode: mode,
    output_dir: null,
    validation_json: {
      policy_pack_validated: !!(policyPack?.id ?? run.policy_pack_id),
      audit_package_validated: !!(run.audit_package ?? packageDefinition.id),
      notes: ["Legacy persistence backfill inferred resolved configuration from persisted bundle metadata and available artifacts."]
    },
    request_summary_json: {
      target_kind: target.target_type ?? "path",
      run_mode: run.run_mode ?? packageDefinition.run_mode ?? "static",
      requested_audit_package: null,
      requested_policy_pack: null,
      db_mode: mode,
      output_dir: null
    },
    policy_pack_json: {
      id: policyPack?.id ?? run.policy_pack_id ?? null,
      name: policyPack?.name ?? null,
      source: policyPack?.source ?? null,
      profile: null,
      version: policyPack?.version ?? null
    },
    audit_package_json: {
      selection_mode: "auto",
      selected_id: run.audit_package ?? packageDefinition.id ?? null,
      title: packageDefinition.title ?? null,
      initial_target_class: initialTargetClass
    }
  };
}

async function tryReadResolvedConfiguration(bundle: any): Promise<PersistedResolvedConfigurationRecord | null> {
  if (bundle.resolved_configuration?.run_id) {
    return bundle.resolved_configuration as PersistedResolvedConfigurationRecord;
  }

  const artifactRoot = typeof bundle.run?.artifact_root === "string" ? bundle.run.artifact_root : null;
  const runId = typeof bundle.run?.id === "string" ? bundle.run.id : null;
  if (!runId) return null;

  if (artifactRoot) {
    const resolved = await tryReadArtifactJson<ResolvedConfigurationArtifact>(artifactRoot, "resolved-config");
    if (resolved) return toPersistedResolvedConfiguration(runId, resolved);
    const initialTargetClass = await tryReadTargetClass(artifactRoot);
    return inferLegacyResolvedConfiguration(bundle, runId, initialTargetClass);
  }

  return inferLegacyResolvedConfiguration(bundle, runId, null);
}

export interface ReconstructionDiffPreview {
  changed_sections: string[];
  changed_tool_providers: string[];
  tool_change_count: number;
  analysis_changed: boolean;
  repo_context_changed: boolean;
  resolved_configuration_changed: boolean;
  target_summary_changed: boolean;
  run_metadata_changed: boolean;
  agent_invocations_changed: boolean;
}

function normalizeLaneSpecialists(runId: string, items: any[]): PersistedLaneSpecialistRecord[] {
  return items.map((item, index) => ({
    id: `${runId}:lane-specialist:${String(item?.lane_name ?? index)}`,
    run_id: runId,
    lane_name: String(item?.lane_name ?? `lane_${index}`),
    agent_name: String(item?.agent_name ?? "lane_specialist_agent"),
    output_artifact: String(item?.output_artifact ?? `lane-specialist-${String(item?.lane_name ?? index)}.json`),
    summary_json: Array.isArray(item?.summary) ? item.summary : [],
    observations_json: Array.isArray(item?.observations) ? item.observations : [],
    evidence_ids_json: Array.isArray(item?.evidence_ids) ? item.evidence_ids : [],
    tool_provider_ids_json: Array.isArray(item?.tool_provider_ids) ? item.tool_provider_ids : []
  }));
}

async function normalizeStageArtifacts(runId: string, artifactRoot: string | null, createdAt: string): Promise<PersistedStageArtifactRecord[]> {
  const artifactTypes = [
    "planner-artifact",
    "target-profile",
    "threat-model",
    "eval-selection",
    "run-plan",
    "findings-pre-skeptic",
    "score-summary",
    "observations"
  ];
  const rows: PersistedStageArtifactRecord[] = [];
  for (const artifactType of artifactTypes) {
    const payload = await tryReadArtifactJson<any>(artifactRoot, artifactType);
    if (payload === null) continue;
    rows.push({
      id: `${runId}:stage-artifact:${artifactType}`,
      run_id: runId,
      artifact_type: artifactType,
      payload_json: payload,
      created_at: createdAt
    });
  }
  return rows;
}

function buildDiffPreview(previousBundle: PersistedAuditBundle & Record<string, unknown>, nextBundle: PersistedAuditBundle, effectiveAnalysis: any, effectiveRepoContext: RepoContextArtifact | null): ReconstructionDiffPreview {
  const previousTools = Array.isArray((previousBundle as any).tool_executions) ? (previousBundle as any).tool_executions : [];
  const nextTools = Array.isArray(nextBundle.tool_executions) ? nextBundle.tool_executions : [];
  const previousToolMap = new Map<string, any>(previousTools.map((item: any) => [item.provider_id ?? item.tool, item]));
  const changedToolProviders = nextTools
    .filter((item: any) => {
      const previousItem = previousToolMap.get(item.provider_id ?? item.tool) as any;
      return JSON.stringify(previousItem?.normalized_json ?? previousItem?.normalized ?? null) !== JSON.stringify(item.normalized_json ?? null);
    })
    .map((item: any) => item.provider_id ?? item.tool)
    .sort();

  const analysisChanged = JSON.stringify((previousBundle as any).analysis ?? null) !== JSON.stringify(effectiveAnalysis ?? null);
  const repoContextChanged = JSON.stringify((previousBundle as any).repo_context ?? null) !== JSON.stringify(effectiveRepoContext ?? (previousBundle as any).repo_context ?? null);
  const resolvedConfigurationChanged = JSON.stringify((previousBundle as any).resolved_configuration ?? null) !== JSON.stringify(nextBundle.resolved_configuration ?? null);
  const targetSummaryChanged = JSON.stringify((previousBundle as any).target_summary ?? null) !== JSON.stringify(nextBundle.target_summary ?? null);
  const laneSpecialistsChanged = JSON.stringify((previousBundle as any).lane_specialists ?? []) !== JSON.stringify(nextBundle.lane_specialists ?? []);
  const commitDiffChanged = JSON.stringify((previousBundle as any).commit_diff ?? null) !== JSON.stringify(nextBundle.commit_diff ?? null);
  const correctionPlanChanged = JSON.stringify((previousBundle as any).correction_plan ?? null) !== JSON.stringify(nextBundle.correction_plan ?? null);
  const correctionResultChanged = JSON.stringify((previousBundle as any).correction_result ?? null) !== JSON.stringify(nextBundle.correction_result ?? null);
  const laneReuseChanged = JSON.stringify((previousBundle as any).lane_reuse_decisions ?? []) !== JSON.stringify(nextBundle.lane_reuse_decisions ?? []);
  const persistenceSummaryChanged = JSON.stringify((previousBundle as any).persistence_summary ?? null) !== JSON.stringify(nextBundle.persistence_summary ?? null);
  const stageArtifactsChanged = JSON.stringify((previousBundle as any).stage_artifacts ?? []) !== JSON.stringify(nextBundle.stage_artifacts ?? []);
  const agentInvocationsChanged = JSON.stringify((previousBundle as any).agent_invocations ?? []) !== JSON.stringify(nextBundle.agent_invocations ?? []);
  const runMetadataChanged = JSON.stringify({
    policy_pack_id: previousBundle.run?.policy_pack_id ?? null,
    audit_package: previousBundle.run?.audit_package ?? null,
    run_mode: previousBundle.run?.run_mode ?? null
  }) !== JSON.stringify({
    policy_pack_id: nextBundle.run?.policy_pack_id ?? null,
    audit_package: nextBundle.run?.audit_package ?? null,
    run_mode: nextBundle.run?.run_mode ?? null
  });

  const changedSections = [
    analysisChanged ? "analysis" : null,
    repoContextChanged ? "repo_context" : null,
    resolvedConfigurationChanged ? "resolved_configuration" : null,
    targetSummaryChanged ? "target_summary" : null,
    laneSpecialistsChanged ? "lane_specialists" : null,
    commitDiffChanged ? "commit_diff" : null,
    correctionPlanChanged ? "correction_plan" : null,
    correctionResultChanged ? "correction_result" : null,
    laneReuseChanged ? "lane_reuse_decisions" : null,
    persistenceSummaryChanged ? "persistence_summary" : null,
    stageArtifactsChanged ? "stage_artifacts" : null,
    runMetadataChanged ? "run_metadata" : null,
    agentInvocationsChanged ? "agent_invocations" : null,
    changedToolProviders.length ? "tool_normalization" : null
  ].filter((item): item is string => !!item);

  return {
    changed_sections: changedSections,
    changed_tool_providers: changedToolProviders,
    tool_change_count: changedToolProviders.length,
    analysis_changed: analysisChanged,
    repo_context_changed: repoContextChanged,
    resolved_configuration_changed: resolvedConfigurationChanged,
    target_summary_changed: targetSummaryChanged,
    run_metadata_changed: runMetadataChanged,
    agent_invocations_changed: agentInvocationsChanged
  };
}

function createMaintenanceEvent(args: {
  runId: string;
  changed: boolean;
  preview: ReconstructionDiffPreview;
}): HarnessEvent {
  return {
    event_id: `evt_reconstruct_${args.runId}_${Date.now()}`,
    run_id: args.runId,
    timestamp: new Date().toISOString(),
    level: "info",
    stage: "maintenance_reconstruct",
    actor: "persistence_backfill",
    event_type: "reconstruction_completed",
    status: args.changed ? "changed" : "unchanged",
    details: {
      changed_sections: args.preview.changed_sections,
      changed_tool_providers: args.preview.changed_tool_providers,
      tool_change_count: args.preview.tool_change_count,
      agent_invocations_changed: args.preview.agent_invocations_changed
    }
  };
}

function buildReconstructionMetrics(args: {
  runId: string;
  changed: boolean;
  preview: ReconstructionDiffPreview;
}): PersistedMetricRecord[] {
  return [
    {
      run_id: args.runId,
      name: "reconstruction_operations_total",
      kind: "counter",
      value: 1,
      count: null,
      min: null,
      max: null,
      avg: null,
      tags_json: {
        actor: "persistence_backfill",
        changed: args.changed ? "true" : "false"
      }
    },
    {
      run_id: args.runId,
      name: "reconstruction_changed_total",
      kind: "counter",
      value: args.changed ? 1 : 0,
      count: null,
      min: null,
      max: null,
      avg: null,
      tags_json: {
        actor: "persistence_backfill"
      }
    },
    {
      run_id: args.runId,
      name: "reconstruction_tool_change_count",
      kind: "gauge",
      value: args.preview.tool_change_count,
      count: null,
      min: null,
      max: null,
      avg: null,
      tags_json: {
        actor: "persistence_backfill"
      }
    }
  ];
}

function formatEventsJsonl(events: HarnessEvent[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function mergeRunObservability(args: {
  bundle: PersistedAuditBundle;
  changed: boolean;
  preview: ReconstructionDiffPreview;
}): PersistedAuditBundle {
  const event = createMaintenanceEvent({
    runId: args.bundle.run.id,
    changed: args.changed,
    preview: args.preview
  });
  return {
    ...args.bundle,
    events: [...(args.bundle.events ?? []), event],
    metrics: [...(args.bundle.metrics ?? []), ...buildReconstructionMetrics({ runId: args.bundle.run.id, changed: args.changed, preview: args.preview })]
  };
}

async function writeRunObservabilityArtifacts(args: {
  artifactRoot: string | null;
  bundle: PersistedAuditBundle;
  changed: boolean;
  preview: ReconstructionDiffPreview;
}): Promise<void> {
  if (!args.artifactRoot) return;
  const existingEvents = await tryReadArtifactEvents(args.artifactRoot);
  const event = createMaintenanceEvent({
    runId: args.bundle.run.id,
    changed: args.changed,
    preview: args.preview
  });
  await fs.mkdir(args.artifactRoot, { recursive: true });
  await fs.writeFile(path.join(args.artifactRoot, "events.jsonl"), formatEventsJsonl([...existingEvents, event]), "utf8");
  await writeJsonFile(path.join(args.artifactRoot, "metrics.json"), [...(args.bundle.metrics ?? []), ...buildReconstructionMetrics({ runId: args.bundle.run.id, changed: args.changed, preview: args.preview })]);
}

interface ReconstructedBundleResult {
  runId: string;
  artifactRoot: string | null;
  changed: boolean;
  bundle: PersistedAuditBundle;
  analysis: any;
  repoContext: RepoContextArtifact | null;
  preview: ReconstructionDiffPreview;
}

async function reconstructBundle(bundle: PersistedAuditBundle & Record<string, unknown>, runIdHint?: string): Promise<ReconstructedBundleResult | null> {
  const artifactRoot = typeof bundle.run?.artifact_root === "string" ? bundle.run.artifact_root : null;
  const runId = typeof bundle.run?.id === "string" ? bundle.run.id : runIdHint ?? null;
  if (!runId) return null;

  const resolvedConfiguration = await tryReadResolvedConfiguration(bundle);
  if (!resolvedConfiguration) return null;

  const artifactAnalysis = await tryReadArtifactJson<any>(artifactRoot, "analysis");
  const artifactRepoContext = await tryReadArtifactJson<RepoContextArtifact>(artifactRoot, "repo-context");
  const artifactToolExecutions = await tryReadArtifactJson<any[]>(artifactRoot, "tool-executions");
  const artifactEvidenceExecutions = await tryReadArtifactJson<any[]>(artifactRoot, "evidence-executions");
  const artifactLaneSpecialists = await tryReadArtifactJson<any[]>(artifactRoot, "lane-specialists");
  const artifactLaneReuseDecisions = await tryReadArtifactJson<any[]>(artifactRoot, "lane-reuse-decisions");
  const artifactPersistenceSummary = await tryReadArtifactJson<any>(artifactRoot, "persistence-summary");
  const artifactCommitDiff = await tryReadArtifactJson<any>(artifactRoot, "commit-diff");
  const artifactCorrectionPlan = await tryReadArtifactJson<any>(artifactRoot, "correction-plan");
  const artifactCorrectionResult = await tryReadArtifactJson<any>(artifactRoot, "correction-result");
  const artifactSupervisorReview = await tryReadArtifactJson<any>(artifactRoot, "skeptic-review-final")
    ?? await tryReadArtifactJson<any>(artifactRoot, "skeptic-review");
  const artifactRemediation = await tryReadArtifactJson<any>(artifactRoot, "remediation");
  const effectiveStageArtifacts = Array.isArray((bundle as any).stage_artifacts) && (bundle as any).stage_artifacts.length > 0
    ? (bundle as any).stage_artifacts
    : await normalizeStageArtifacts(runId, artifactRoot, bundle.run?.created_at ?? new Date().toISOString());
  const effectiveAnalysis = artifactAnalysis ?? (bundle as any).analysis ?? {};
  const effectiveRepoContext = artifactRepoContext ?? (bundle as any).repo_context ?? null;
  const artifactExecutionMap = new Map<string, any>();
  for (const item of [...(artifactToolExecutions ?? []), ...(artifactEvidenceExecutions ?? [])]) {
    if (item && typeof item.provider_id === "string") artifactExecutionMap.set(item.provider_id, item);
  }

  const enrichedAgentInvocations = enrichAgentInvocations(Array.isArray((bundle as any).agent_invocations) ? (bundle as any).agent_invocations : []);
  const effectiveLaneSpecialists = Array.isArray((bundle as any).lane_specialists) && (bundle as any).lane_specialists.length > 0
    ? (bundle as any).lane_specialists
    : normalizeLaneSpecialists(runId, Array.isArray(artifactLaneSpecialists) ? artifactLaneSpecialists : []);
  const effectiveLaneReuseDecisions = Array.isArray((bundle as any).lane_reuse_decisions) && (bundle as any).lane_reuse_decisions.length > 0
    ? (bundle as any).lane_reuse_decisions
    : (Array.isArray(artifactLaneReuseDecisions) ? artifactLaneReuseDecisions.map((item, index) => ({
      id: `${runId}:lane-reuse:${String(item?.lane_name ?? index)}`,
      run_id: runId,
      lane_name: String(item?.lane_name ?? `lane_${index}`),
      decision: String(item?.decision ?? "rerun"),
      rationale_json: Array.isArray(item?.rationale) ? item.rationale : []
    })) : []);
  const effectiveCommitDiff = (bundle as any).commit_diff?.run_id ? (bundle as any).commit_diff : artifactCommitDiff ? {
    run_id: runId,
    previous_run_id: artifactCommitDiff.previous_run_id ?? null,
    current_commit_sha: artifactCommitDiff.current_commit_sha ?? null,
    previous_commit_sha: artifactCommitDiff.previous_commit_sha ?? null,
    comparison_mode: artifactCommitDiff.comparison_mode ?? "no_prior_run",
    changed_files_json: artifactCommitDiff.changed_files ?? [],
    stage_decisions_json: artifactCommitDiff.stage_decisions ?? {},
    rationale_json: artifactCommitDiff.rationale ?? []
  } : {
    run_id: runId,
    previous_run_id: null,
    current_commit_sha: null,
    previous_commit_sha: null,
    comparison_mode: "no_prior_run",
    changed_files_json: [],
    stage_decisions_json: { planner: "rerun", threat_model: "rerun", eval_selection: "rerun" },
    rationale_json: ["Commit diff artifact unavailable during persistence reconstruction."]
  };
  const effectiveCorrectionPlan = (bundle as any).correction_plan?.run_id ? (bundle as any).correction_plan : artifactCorrectionPlan ? {
    run_id: runId,
    triggered: !!artifactCorrectionPlan.triggered,
    supervisor_action_count: Number(artifactCorrectionPlan.supervisor_action_count ?? 0),
    requested_actions_json: artifactCorrectionPlan.requested_actions ?? [],
    rerun_json: artifactCorrectionPlan.rerun ?? {},
    merge_strategy: artifactCorrectionPlan.merge_strategy ?? "no_rerun",
    notes_json: artifactCorrectionPlan.notes ?? []
  } : null;
  const effectiveCorrectionResult = (bundle as any).correction_result?.run_id ? (bundle as any).correction_result : artifactCorrectionResult ? {
    run_id: runId,
    triggered: !!artifactCorrectionResult.triggered,
    correction_pass_completed: !!artifactCorrectionResult.correction_pass_completed,
    merge_strategy: artifactCorrectionResult.merge_strategy ?? "no_rerun",
    rerun_json: artifactCorrectionResult.rerun ?? {},
    reused_json: artifactCorrectionResult.reused ?? {},
    merged_json: artifactCorrectionResult.merged ?? {},
    final_supervisor_action_count: Number(artifactCorrectionResult.final_supervisor_action_count ?? 0),
    notes_json: artifactCorrectionResult.notes ?? []
  } : null;
  const effectivePersistenceSummary = (bundle as any).persistence_summary?.run_id ? (bundle as any).persistence_summary : artifactPersistenceSummary ? {
    run_id: runId,
    mode: String(artifactPersistenceSummary.mode ?? "local"),
    root: String(artifactPersistenceSummary.root ?? "")
  } : (bundle as any).persistence ? {
    run_id: runId,
    mode: String((bundle as any).persistence.mode ?? "local"),
    root: String((bundle as any).persistence.root ?? "")
  } : null;
  const effectiveSupervisorReview = (bundle as any).supervisor_review?.run_id ? (bundle as any).supervisor_review : artifactSupervisorReview ? {
    run_id: runId,
    summary_json: artifactSupervisorReview.summary ?? {},
    grader_outputs_json: artifactSupervisorReview.grader_outputs ?? [],
    actions_json: artifactSupervisorReview.actions ?? [],
    notes_json: artifactSupervisorReview.notes ?? [],
    final_review: !!(artifactRoot && await tryReadArtifactJson<any>(artifactRoot, "skeptic-review-final"))
  } : null;
  const effectiveRemediationMemo = (bundle as any).remediation_memo?.run_id ? (bundle as any).remediation_memo : artifactRemediation ? {
    run_id: runId,
    summary: String(artifactRemediation.summary ?? ""),
    checklist_json: artifactRemediation.checklist ?? [],
    human_review_required: !!artifactRemediation.human_review_required
  } : null;

  const nextBundle: PersistedAuditBundle = {
    ...(bundle as PersistedAuditBundle),
    resolved_configuration: resolvedConfiguration,
    commit_diff: effectiveCommitDiff,
    correction_plan: effectiveCorrectionPlan,
    correction_result: effectiveCorrectionResult,
    lane_reuse_decisions: effectiveLaneReuseDecisions,
    persistence_summary: effectivePersistenceSummary,
    supervisor_review: effectiveSupervisorReview,
    remediation_memo: effectiveRemediationMemo,
    stage_artifacts: effectiveStageArtifacts,
    target_summary: deriveTargetSummary({ bundle, resolvedConfiguration, analysis: effectiveAnalysis }),
    run: {
      ...bundle.run,
      policy_pack_id: resolvedConfiguration.policy_pack_id,
      run_mode: resolvedConfiguration.run_mode,
      audit_package: resolvedConfiguration.selected_audit_package ?? bundle.run.audit_package
    },
    lane_specialists: effectiveLaneSpecialists,
    agent_invocations: enrichedAgentInvocations.invocations,
    tool_executions: (Array.isArray((bundle as any).tool_executions) ? (bundle as any).tool_executions : []).map((item: any) => {
      const artifactItem = artifactExecutionMap.get(item.provider_id ?? item.tool) ?? null;
      const effectiveToolExecution = {
        ...item,
        parsed: artifactItem?.parsed ?? item.parsed ?? null,
        stderr: artifactItem?.stderr ?? item.stderr,
        summary: artifactItem?.summary ?? item.summary
      };
      return {
        ...effectiveToolExecution,
        normalized_json: summarizeNormalizedFromProvider({
          providerId: effectiveToolExecution.provider_id ?? effectiveToolExecution.tool,
          toolExecution: effectiveToolExecution,
          analysis: effectiveAnalysis,
          repoContext: effectiveRepoContext
        })
      };
    })
  };

  const preview = buildDiffPreview(bundle, nextBundle, effectiveAnalysis, effectiveRepoContext);
  const changed = preview.changed_sections.length > 0;

  return {
    runId,
    artifactRoot,
    changed,
    bundle: nextBundle,
    analysis: effectiveAnalysis,
    repoContext: effectiveRepoContext,
    preview
  };
}

async function readRunBundle(rootDir: string, runId: string): Promise<{ filePath: string; bundle: PersistedAuditBundle & Record<string, unknown> }> {
  const normalizedRunId = runId.replace(/\.json$/i, "");
  const filePath = path.join(rootDir, "runs", `${normalizedRunId}.json`);
  return {
    filePath,
    bundle: await readJsonFile<PersistedAuditBundle & Record<string, unknown>>(filePath)
  };
}

export interface LocalRunReconstructionSummary {
  root: string;
  dry_run: boolean;
  run_id: string;
  artifact_root: string | null;
  changed: boolean;
  persisted: boolean;
  updated_bundle_file: boolean;
  preview: ReconstructionDiffPreview;
}

export interface LocalBatchRunPreview {
  run_id: string;
  changed: boolean;
  preview: ReconstructionDiffPreview;
}

export interface LocalBatchReconstructionSummary {
  root: string;
  dry_run: boolean;
  selected_runs: number;
  updated_runs: number;
  unchanged_runs: number;
  unresolved_runs: string[];
  run_ids: string[];
  changed_run_previews: LocalBatchRunPreview[];
}

export async function reconstructLocalRun(args: { runId: string; rootDir?: string; dryRun?: boolean }): Promise<LocalRunReconstructionSummary> {
  const resolvedRoot = path.resolve(args.rootDir ?? defaultPersistenceRoot());
  const dryRun = args.dryRun ?? false;
  const { filePath, bundle } = await readRunBundle(resolvedRoot, args.runId);
  const reconstructed = await reconstructBundle(bundle, args.runId);
  if (!reconstructed) {
    throw new Error(`Unable to reconstruct persisted run ${args.runId}.`);
  }
  const nextBundle = mergeRunObservability({
    bundle: reconstructed.bundle,
    changed: reconstructed.changed,
    preview: reconstructed.preview
  });

  if (!dryRun) {
    const sqliteStore = new LocalPersistenceStore(resolvedRoot);
    await sqliteStore.persistBundle(nextBundle);
    await writeRunObservabilityArtifacts({
      artifactRoot: reconstructed.artifactRoot,
      bundle: reconstructed.bundle,
      changed: reconstructed.changed,
      preview: reconstructed.preview
    });
    if (reconstructed.changed) {
      await writeJsonFile(filePath, {
        ...nextBundle,
        analysis: reconstructed.analysis,
        repo_context: reconstructed.repoContext ?? (bundle as any).repo_context
      });
    }
  }

  return {
    root: resolvedRoot,
    dry_run: dryRun,
    run_id: reconstructed.runId,
    artifact_root: reconstructed.artifactRoot,
    changed: reconstructed.changed,
    persisted: !dryRun,
    updated_bundle_file: !dryRun && reconstructed.changed,
    preview: reconstructed.preview
  };
}

export async function reconstructLocalRuns(args?: PersistedRunQuery & { rootDir?: string; dryRun?: boolean }): Promise<LocalBatchReconstructionSummary> {
  const resolvedRoot = path.resolve(args?.rootDir ?? defaultPersistenceRoot());
  const dryRun = args?.dryRun ?? false;
  const selectedRuns = await listPersistedRuns({
    ...args,
    rootDir: resolvedRoot,
    limit: args?.limit ?? Number.MAX_SAFE_INTEGER
  });

  let updatedRuns = 0;
  let unchangedRuns = 0;
  const unresolvedRuns: string[] = [];
  const changedRunPreviews: LocalBatchRunPreview[] = [];
  const sqliteStore = dryRun ? null : new LocalPersistenceStore(resolvedRoot);

  for (const run of selectedRuns) {
    const { filePath, bundle } = await readRunBundle(resolvedRoot, run.id);
    const reconstructed = await reconstructBundle(bundle, run.id);
    if (!reconstructed) {
      unresolvedRuns.push(run.id);
      continue;
    }

    if (reconstructed.changed) {
      changedRunPreviews.push({
        run_id: run.id,
        changed: true,
        preview: reconstructed.preview
      });
    }
    const nextBundle = mergeRunObservability({
      bundle: reconstructed.bundle,
      changed: reconstructed.changed,
      preview: reconstructed.preview
    });

    if (!dryRun) {
      await sqliteStore?.persistBundle(nextBundle);
      await writeRunObservabilityArtifacts({
        artifactRoot: reconstructed.artifactRoot,
        bundle: reconstructed.bundle,
        changed: reconstructed.changed,
        preview: reconstructed.preview
      });
    }

    if (!reconstructed.changed) {
      unchangedRuns += 1;
      continue;
    }

    if (!dryRun) {
      await writeJsonFile(filePath, {
        ...nextBundle,
        analysis: reconstructed.analysis,
        repo_context: reconstructed.repoContext ?? (bundle as any).repo_context
      });
    }
    updatedRuns += 1;
  }

  return {
    root: resolvedRoot,
    dry_run: dryRun,
    selected_runs: selectedRuns.length,
    updated_runs: updatedRuns,
    unchanged_runs: unchangedRuns,
    unresolved_runs: unresolvedRuns,
    run_ids: selectedRuns.map((item) => item.id),
    changed_run_previews: changedRunPreviews
  };
}

export interface LocalBackfillSummary {
  root: string;
  dry_run: boolean;
  scanned_runs: number;
  updated_runs: number;
  skipped_runs: number;
  unresolved_runs: string[];
}

export interface LocalRunValidationResult {
  run_id: string;
  valid: boolean;
  missing_sections: string[];
  count_mismatches: Array<{
    section: string;
    expected: number;
    actual: number;
  }>;
}

export interface LocalPersistenceValidationSummary {
  root: string;
  selected_runs: number;
  valid_runs: number;
  invalid_runs: number;
  run_ids: string[];
  results: LocalRunValidationResult[];
}

function bundleMatchesQuery(bundle: PersistedAuditBundle & Record<string, unknown>, args?: PersistedRunQuery): boolean {
  if (!args) return true;
  const run = bundle.run ?? {};
  const resolved = bundle.resolved_configuration ?? {};
  const targetSummary = bundle.target_summary ?? {};
  const review = bundle.review_decision ?? {};
  const findings = Array.isArray(bundle.findings) ? bundle.findings : [];
  const createdAt = String(run.created_at ?? "");

  if (args.targetId && args.targetId !== run.target_id && args.targetId !== targetSummary.canonical_target_id) return false;
  if (args.status && args.status !== run.status) return false;
  if (args.auditPackage && args.auditPackage !== run.audit_package && args.auditPackage !== resolved.selected_audit_package) return false;
  if (args.runMode && args.runMode !== run.run_mode && args.runMode !== resolved.run_mode) return false;
  if (args.targetClass && args.targetClass !== resolved.initial_target_class && args.targetClass !== targetSummary.latest_target_class) return false;
  if (args.rating && args.rating !== run.rating && args.rating !== bundle.score_summary?.rating) return false;
  if (args.publishabilityStatus && args.publishabilityStatus !== review.publishability_status) return false;
  if (args.policyPackId && args.policyPackId !== run.policy_pack_id && args.policyPackId !== resolved.policy_pack_id) return false;
  if (args.since && createdAt < args.since) return false;
  if (args.until && createdAt > args.until) return false;
  if (args.requiresHumanReview !== undefined && args.requiresHumanReview !== review.human_review_required) return false;
  if (args.hasFindings !== undefined && args.hasFindings !== (findings.length > 0)) return false;
  return true;
}

function countStageArtifactsByType(items: PersistedStageArtifactRecord[]): Set<string> {
  return new Set(items.map((item) => item.artifact_type));
}

async function validateLocalRun(rootDir: string, bundle: PersistedAuditBundle & Record<string, unknown>): Promise<LocalRunValidationResult> {
  const runId = String(bundle.run?.id ?? "");
  const run = await getPersistedRun(runId, rootDir);
  const targetSummary = bundle.target?.id ? await readPersistedTargetSummary(String(bundle.target.id), rootDir) : null;
  const [
    resolvedConfiguration,
    scoreSummary,
    reviewDecision,
    policyApplication,
    commitDiff,
    correctionPlan,
    correctionResult,
    laneReuseDecisions,
    persistenceSummary,
    stageArtifacts,
    lanePlans,
    evidenceRecords,
    laneResults,
    laneSpecialists,
    agentInvocations,
    toolExecutions,
    findings,
    controlResults,
    dimensionScores
  ] = await Promise.all([
    readPersistedResolvedConfiguration(runId, rootDir),
    readPersistedScoreSummary(runId, rootDir),
    readPersistedReviewDecision(runId, rootDir),
    readPersistedPolicyApplication(runId, rootDir),
    readPersistedCommitDiff(runId, rootDir),
    readPersistedCorrectionPlan(runId, rootDir),
    readPersistedCorrectionResult(runId, rootDir),
    readPersistedLaneReuseDecisions(runId, rootDir),
    readPersistedPersistenceSummary(runId, rootDir),
    readPersistedStageArtifacts(runId, rootDir),
    readPersistedLanePlans(runId, rootDir),
    readPersistedEvidenceRecords(runId, rootDir),
    readPersistedLaneResults(runId, rootDir),
    readPersistedLaneSpecialistOutputs(runId, rootDir),
    readPersistedAgentInvocations(runId, rootDir),
    readPersistedToolExecutions(runId, rootDir),
    readPersistedFindings(runId, rootDir),
    readPersistedControlResults(runId, rootDir),
    readPersistedDimensionScores(runId, rootDir)
  ]);

  const missingSections: string[] = [];
  if (!run) missingSections.push("run");
  if (!targetSummary) missingSections.push("target_summary");
  if (!resolvedConfiguration) missingSections.push("resolved_configuration");
  if (!scoreSummary) missingSections.push("score_summary");
  if (!reviewDecision) missingSections.push("review_decision");
  if (!policyApplication) missingSections.push("policy_application");
  if (!commitDiff) missingSections.push("commit_diff");
  if (!persistenceSummary) missingSections.push("persistence_summary");
  if ((Array.isArray(bundle.lane_reuse_decisions) ? bundle.lane_reuse_decisions.length : 0) > 0 && laneReuseDecisions.length === 0) missingSections.push("lane_reuse_decisions");
  if (bundle.correction_plan && !correctionPlan) missingSections.push("correction_plan");
  if (bundle.correction_result && !correctionResult) missingSections.push("correction_result");

  const requiredStageArtifactTypes = ["planner-artifact", "target-profile", "threat-model", "eval-selection", "run-plan", "findings-pre-skeptic", "score-summary", "observations"];
  const stageArtifactTypes = countStageArtifactsByType(stageArtifacts);
  for (const artifactType of requiredStageArtifactTypes) {
    if (!stageArtifactTypes.has(artifactType)) missingSections.push(`stage_artifact:${artifactType}`);
  }

  const countMismatches = [
    { section: "lane_plans", expected: Array.isArray(bundle.lane_plans) ? bundle.lane_plans.length : 0, actual: lanePlans.length },
    { section: "evidence_records", expected: Array.isArray(bundle.evidence_records) ? bundle.evidence_records.length : 0, actual: evidenceRecords.length },
    { section: "lane_results", expected: Array.isArray(bundle.lane_results) ? bundle.lane_results.length : 0, actual: laneResults.length },
    { section: "lane_specialists", expected: Array.isArray(bundle.lane_specialists) ? bundle.lane_specialists.length : 0, actual: laneSpecialists.length },
    { section: "agent_invocations", expected: Array.isArray(bundle.agent_invocations) ? bundle.agent_invocations.length : 0, actual: agentInvocations.length },
    { section: "tool_executions", expected: Array.isArray(bundle.tool_executions) ? bundle.tool_executions.length : 0, actual: toolExecutions.length },
    { section: "findings", expected: Array.isArray(bundle.findings) ? bundle.findings.length : 0, actual: findings.length },
    { section: "control_results", expected: Array.isArray(bundle.control_results) ? bundle.control_results.length : 0, actual: controlResults.length },
    { section: "dimension_scores", expected: Array.isArray(bundle.dimension_scores) ? bundle.dimension_scores.length : 0, actual: dimensionScores.length }
  ].filter((item) => item.expected !== item.actual);

  return {
    run_id: runId,
    valid: missingSections.length === 0 && countMismatches.length === 0,
    missing_sections: missingSections,
    count_mismatches: countMismatches
  };
}

export async function backfillLocalPersistence(args?: { rootDir?: string; dryRun?: boolean }): Promise<LocalBackfillSummary> {
  const resolvedRoot = path.resolve(args?.rootDir ?? defaultPersistenceRoot());
  const dryRun = args?.dryRun ?? false;
  const runsDir = path.join(resolvedRoot, "runs");
  const entries = await fs.readdir(runsDir, { withFileTypes: true });

  let scannedRuns = 0;
  let updatedRuns = 0;
  let skippedRuns = 0;
  const unresolvedRuns: string[] = [];
  const sqliteStore = dryRun ? null : new LocalPersistenceStore(resolvedRoot);

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    scannedRuns += 1;
    const filePath = path.join(runsDir, entry.name);
    const bundle = await readJsonFile<PersistedAuditBundle & Record<string, unknown>>(filePath);
    const runId = typeof bundle.run?.id === "string" ? bundle.run.id : entry.name.replace(/\.json$/, "");
    const reconstructed = await reconstructBundle(bundle, runId);

    if (!reconstructed) {
      skippedRuns += 1;
      unresolvedRuns.push(runId);
      continue;
    }
    const nextBundle = mergeRunObservability({
      bundle: reconstructed.bundle,
      changed: reconstructed.changed,
      preview: reconstructed.preview
    });

    if (!dryRun) {
      await sqliteStore?.persistBundle(nextBundle);
      await writeRunObservabilityArtifacts({
        artifactRoot: reconstructed.artifactRoot,
        bundle: reconstructed.bundle,
        changed: reconstructed.changed,
        preview: reconstructed.preview
      });
    }

    if (!reconstructed.changed) {
      skippedRuns += 1;
      continue;
    }

    if (!dryRun) {
      await writeJsonFile(filePath, {
        ...nextBundle,
        analysis: reconstructed.analysis,
        repo_context: reconstructed.repoContext ?? (bundle as any).repo_context
      });
    }
    updatedRuns += 1;
  }

  return {
    root: resolvedRoot,
    dry_run: dryRun,
    scanned_runs: scannedRuns,
    updated_runs: updatedRuns,
    skipped_runs: skippedRuns,
    unresolved_runs: unresolvedRuns
  };
}

export async function validateLocalPersistence(args?: PersistedRunQuery & { rootDir?: string }): Promise<LocalPersistenceValidationSummary> {
  const resolvedRoot = path.resolve(args?.rootDir ?? defaultPersistenceRoot());
  const runsDir = path.join(resolvedRoot, "runs");
  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const selectedBundles: Array<PersistedAuditBundle & Record<string, unknown>> = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const bundle = await readJsonFile<PersistedAuditBundle & Record<string, unknown>>(path.join(runsDir, entry.name));
    if (!bundleMatchesQuery(bundle, args)) continue;
    selectedBundles.push(bundle);
  }

  selectedBundles.sort((left, right) => String(right.run?.created_at ?? "").localeCompare(String(left.run?.created_at ?? "")));
  const limitedBundles = selectedBundles.slice(0, args?.limit ?? selectedBundles.length);
  const results: LocalRunValidationResult[] = [];
  for (const bundle of limitedBundles) {
    results.push(await validateLocalRun(resolvedRoot, bundle));
  }

  return {
    root: resolvedRoot,
    selected_runs: results.length,
    valid_runs: results.filter((item) => item.valid).length,
    invalid_runs: results.filter((item) => !item.valid).length,
    run_ids: results.map((item) => item.run_id),
    results
  };
}












export interface LocalJsonMirrorCleanupSummary {
  root: string;
  dry_run: boolean;
  removed_files: string[];
  kept_files: string[];
}

export async function cleanupLocalJsonMirrors(args?: { rootDir?: string; dryRun?: boolean }): Promise<LocalJsonMirrorCleanupSummary> {
  const resolvedRoot = path.resolve(args?.rootDir ?? defaultPersistenceRoot());
  const dryRun = args?.dryRun ?? false;
  const entries = await fs.readdir(resolvedRoot, { withFileTypes: true });
  const removedFiles: string[] = [];
  const keptFiles: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      keptFiles.push(entry.name);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.json')) {
      keptFiles.push(entry.name);
      continue;
    }
    if (entry.name === 'persistence-meta.json') {
      keptFiles.push(entry.name);
      continue;
    }

    removedFiles.push(entry.name);
    if (!dryRun) {
      await fs.unlink(path.join(resolvedRoot, entry.name));
    }
  }

  return {
    root: resolvedRoot,
    dry_run: dryRun,
    removed_files: removedFiles.sort(),
    kept_files: keptFiles.sort()
  };
}
