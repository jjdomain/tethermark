import fs from "node:fs/promises";
import path from "node:path";

import type { ArtifactRecord, AuditResult, DatabaseMode, HarnessEvent, HarnessMetricSnapshot, PersistenceSummary } from "../contracts.js";
import type { AuditPackageDefinition } from "../audit-packages.js";
import { deriveRequestScope, deriveScopeId } from "../request-scope.js";
import { deriveCanonicalTargetId, deriveCanonicalTargetName } from "../target-identity.js";
import type {
  PersistedArtifactIndexRecord,
  PersistedAuditBundle,
  PersistedEventRecord,
  PersistedMetricRecord,
  PersistedPolicyPackRecord,
  PersistedResolvedConfigurationRecord,
  PersistedStageArtifactRecord,
  PersistedStageExecutionRecord,
  PersistedTargetSummaryRecord,
} from "./contracts.js";
import { createPersistenceStore, defaultPersistenceRoot, resolvePersistenceMode } from "./backend.js";
import { deriveInitialReviewWorkflow } from "./review-workflow.js";
import { openSqliteDatabase, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

function deriveResultCanonicalTargetName(result: AuditResult): string {
  return deriveCanonicalTargetName({
    targetType: result.target.target_type,
    repoUrl: result.target.repo_url,
    localPath: result.target.target_type === "path" ? result.target.snapshot.value : result.target.local_path,
    endpointUrl: result.target.endpoint_url,
    snapshotValue: result.target.snapshot.value,
    fallbackName: result.analysis.project_name
  });
}

function derivePolicyPack(result: AuditResult): PersistedPolicyPackRecord | null {
  const resolved = result.resolved_configuration;
  if (!resolved.policy_pack.id && (!result.audit_policy || Object.keys(result.audit_policy).length === 0)) return null;
  const version = resolved.policy_pack.version ?? result.audit_policy.version ?? "unversioned";
  const profile = resolved.policy_pack.profile ?? result.audit_policy.profile ?? "custom";
  const packId = resolved.policy_pack.id ?? result.audit_policy.policy_pack_id ?? `policy:${profile}:${version}`;
  return {
    id: packId,
    name: resolved.policy_pack.name ?? result.audit_policy.policy_pack_name ?? profile,
    version,
    source: resolved.policy_pack.source ?? result.audit_policy.policy_pack_source ?? "audit_policy",
    definition_json: result.audit_policy,
    created_at: result.artifacts[0]?.created_at ?? new Date().toISOString()
  };
}

function deriveResolvedConfiguration(result: AuditResult): PersistedResolvedConfigurationRecord {
  const resolved = result.resolved_configuration;
  return {
    run_id: result.run_id,
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

function deriveTargetSummary(result: AuditResult, scope: { workspace_id: string; project_id: string }): PersistedTargetSummaryRecord {
  const canonicalTargetId = deriveCanonicalTargetId({
    targetType: result.target.target_type,
    repoUrl: result.target.repo_url,
    localPath: result.target.target_type === "path" ? result.target.snapshot.value : result.target.local_path,
    endpointUrl: result.target.endpoint_url,
    snapshotValue: result.target.snapshot.value,
    fallbackTargetId: result.target.target_id
  });
  return {
    id: `${deriveScopeId({ workspaceId: scope.workspace_id, projectId: scope.project_id })}:${result.target.target_id}`,
    target_id: result.target.target_id,
    canonical_target_id: canonicalTargetId,
    workspace_id: scope.workspace_id,
    project_id: scope.project_id,
    canonical_name: deriveResultCanonicalTargetName(result),
    target_type: result.target.target_type,
    repo_url: result.target.repo_url,
    local_path: result.target.target_type === "path" ? result.target.snapshot.value : result.target.local_path,
    endpoint_url: result.target.endpoint_url,
    latest_run_id: result.run_id,
    latest_run_created_at: result.trace.steps[0]?.timestamp ?? new Date().toISOString(),
    latest_status: result.status,
    latest_run_mode: result.resolved_configuration.request_summary.run_mode,
    latest_audit_package: result.resolved_configuration.audit_package.selected_id ?? result.audit_package,
    latest_target_class: result.resolved_configuration.audit_package.initial_target_class,
    latest_rating: result.score_summary.rating,
    latest_overall_score: result.score_summary.overall_score,
    latest_static_score: result.static_score,
    latest_publishability_status: result.publishability.publishability_status,
    latest_human_review_required: result.publishability.human_review_required,
    latest_finding_count: result.findings.length,
    latest_frameworks_json: result.analysis.frameworks,
    latest_languages_json: result.analysis.languages,
    latest_package_ecosystems_json: result.analysis.package_ecosystems,
    updated_at: result.trace.steps.at(-1)?.timestamp ?? new Date().toISOString()
  };
}

function indexArtifacts(artifacts: ArtifactRecord[]): PersistedArtifactIndexRecord[] {
  return artifacts.map((artifact) => ({
    ...artifact,
    sha256: null,
    size_bytes: null
  }));
}

async function deriveStageArtifacts(result: AuditResult): Promise<PersistedStageArtifactRecord[]> {
  const createdAt = result.trace.steps[0]?.timestamp ?? new Date().toISOString();
  const artifactTypes = [
    "preflight-summary",
    "launch-intent",
    "sandbox-execution",
    "planner-artifact",
    "target-profile",
    "threat-model",
    "eval-selection",
    "run-plan",
    "findings-pre-skeptic",
    "score-summary",
    "observations"
  ];
  const persisted: PersistedStageArtifactRecord[] = [];

  for (const artifactType of artifactTypes) {
    const artifact = result.artifacts.find((item) => item.type === artifactType);
    if (!artifact) continue;
    const payload = JSON.parse(await fs.readFile(artifact.path, "utf8"));
    persisted.push({
      id: `${result.run_id}:stage-artifact:${artifactType}`,
      run_id: result.run_id,
      artifact_type: artifactType,
      payload_json: payload,
      created_at: createdAt
    });
  }

  return persisted;
}

function laneForToolExecution(result: AuditResult, item: AuditResult["tool_executions"][number]): string | null {
  return result.lane_plans.find((plan) => (
    plan.allowed_tools.includes(item.tool)
    || plan.allowed_tools.includes(item.provider_id)
    || plan.allowed_tools.includes(item.adapter?.requested_provider_id ?? "")
  ))?.lane_name ?? null;
}

function persistMetrics(runId: string, metrics: HarnessMetricSnapshot[]): PersistedMetricRecord[] {
  return metrics.map((metric) => ({
    run_id: runId,
    name: metric.name,
    kind: metric.kind,
    value: metric.value,
    count: metric.count ?? null,
    min: metric.min ?? null,
    max: metric.max ?? null,
    avg: metric.avg ?? null,
    tags_json: metric.tags ?? null
  }));
}

export function buildStageExecutions(runId: string, events: HarnessEvent[]): PersistedStageExecutionRecord[] {
  const stageMap = new Map<string, PersistedStageExecutionRecord>();
  for (const event of events) {
    if (!["stage_started", "stage_completed", "stage_failed", "stage_reused"].includes(event.event_type)) continue;
    const key = `${runId}:${event.stage}:${event.actor}`;
    const current = stageMap.get(key) ?? {
      id: key,
      run_id: runId,
      stage_name: event.stage,
      actor: event.actor,
      status: event.status ?? "unknown",
      reused_from_run_id: null,
      started_at: event.timestamp,
      completed_at: null,
      duration_ms: null,
      details_json: event.details ?? null
    };
    if (event.event_type === "stage_started") {
      current.started_at = event.timestamp;
      current.status = event.status ?? current.status;
    }
    if (event.event_type === "stage_completed" || event.event_type === "stage_failed") {
      current.completed_at = event.timestamp;
      current.duration_ms = event.duration_ms ?? null;
      current.status = event.status ?? current.status;
      current.details_json = event.details ?? current.details_json;
    }
    if (event.event_type === "stage_reused") {
      current.status = "reused";
      current.reused_from_run_id = typeof event.details?.source_run_id === "string" ? event.details.source_run_id : null;
      current.details_json = event.details ?? current.details_json;
      current.completed_at = event.timestamp;
    }
    stageMap.set(key, current);
  }
  return [...stageMap.values()];
}

export async function persistPersistenceSummary(args: {
  runId: string;
  targetId: string;
  createdAt: string;
  summary: PersistenceSummary;
  request: { db_mode?: DatabaseMode };
}): Promise<{ mode: DatabaseMode; root: string }> {
  const mode = resolvePersistenceMode(args.request);
  const root = defaultPersistenceRoot(mode);
  const db = await openSqliteDatabase(root);
  upsertSqliteRecord({
    db,
    tableName: "persistence_summaries",
    recordKey: args.runId,
    payload: { run_id: args.runId, mode: args.summary.mode, root: args.summary.root },
    runId: args.runId,
    createdAt: args.createdAt,
    targetId: args.targetId,
    parentKey: args.runId
  });
  await saveSqliteDatabase(root, db, mode);
  db.close();
  return { mode, root };
}

export async function persistAuditResult(args: {
  result: AuditResult;
  packageDefinition: AuditPackageDefinition;
  request: { db_mode?: DatabaseMode; workspace_id?: string; project_id?: string; requested_by?: string };
}): Promise<{ mode: DatabaseMode; root: string }> {
  const mode = resolvePersistenceMode(args.request);
  const store = createPersistenceStore(mode);
  const scope = deriveRequestScope(args.request);
  const policyPack = derivePolicyPack(args.result);
  const resolvedConfiguration = deriveResolvedConfiguration(args.result);
  const targetSummary = deriveTargetSummary(args.result, scope);
  const stageArtifacts = await deriveStageArtifacts(args.result);
  const targetId = args.result.target.target_id;
  const snapshotId = `${targetId}:${args.result.target.snapshot.value}:${args.result.target.snapshot.commit_sha ?? "none"}`;
  const createdAt = args.result.trace.steps[0]?.timestamp ?? new Date().toISOString();
  const reviewDecision = {
    run_id: args.result.run_id,
    publishability_status: args.result.publishability.publishability_status,
    human_review_required: args.result.publishability.human_review_required,
    public_summary_safe: args.result.publishability.public_summary_safe,
    threshold: args.result.publishability.threshold,
    rationale_json: args.result.publishability.rationale,
    gating_findings_json: args.result.publishability.gating_findings,
    recommended_visibility: args.result.publishability.recommended_visibility
  };
  const remediationMemo = {
    run_id: args.result.run_id,
    summary: args.result.remediation.summary,
    checklist_json: args.result.remediation.checklist,
    human_review_required: args.result.remediation.human_review_required
  };
  const bundle: PersistedAuditBundle = {
    mode,
    package_definition: args.packageDefinition,
    target: {
      id: targetId,
      target_type: args.result.target.target_type,
      canonical_name: deriveResultCanonicalTargetName(args.result),
      repo_url: args.result.target.repo_url,
      local_path: args.result.target.local_path,
      endpoint_url: args.result.target.endpoint_url,
      created_at: createdAt
    },
    target_snapshot: {
      id: snapshotId,
      target_id: targetId,
      snapshot_value: args.result.target.snapshot.value,
      commit_sha: args.result.target.snapshot.commit_sha,
      captured_at: args.result.target.snapshot.captured_at,
      analysis_hash: null
    },
    target_summary: targetSummary,
    policy_pack: policyPack,
    run: {
      id: args.result.run_id,
      target_id: targetId,
      target_snapshot_id: snapshotId,
      workspace_id: scope.workspace_id,
      project_id: scope.project_id,
      requested_by: scope.requested_by,
      policy_pack_id: resolvedConfiguration.policy_pack_id,
      status: args.result.status,
      run_mode: resolvedConfiguration.run_mode,
      audit_package: resolvedConfiguration.selected_audit_package ?? args.result.audit_package,
      artifact_root: path.dirname(args.result.artifacts[0]?.path ?? defaultPersistenceRoot()),
      started_at: createdAt,
      completed_at: args.result.trace.steps.at(-1)?.timestamp ?? null,
      static_score: args.result.static_score,
      overall_score: args.result.score_summary.overall_score,
      rating: args.result.score_summary.rating,
      created_at: createdAt
    },
    resolved_configuration: resolvedConfiguration,
    commit_diff: {
      run_id: args.result.run_id,
      previous_run_id: args.result.commit_diff.previous_run_id,
      current_commit_sha: args.result.commit_diff.current_commit_sha,
      previous_commit_sha: args.result.commit_diff.previous_commit_sha,
      comparison_mode: args.result.commit_diff.comparison_mode,
      changed_files_json: args.result.commit_diff.changed_files,
      stage_decisions_json: args.result.commit_diff.stage_decisions,
      rationale_json: args.result.commit_diff.rationale
    },
    correction_plan: args.result.correction_plan ? {
      run_id: args.result.run_id,
      triggered: args.result.correction_plan.triggered,
      supervisor_action_count: args.result.correction_plan.supervisor_action_count,
      requested_actions_json: args.result.correction_plan.requested_actions,
      rerun_json: args.result.correction_plan.rerun,
      merge_strategy: args.result.correction_plan.merge_strategy,
      notes_json: args.result.correction_plan.notes
    } : null,
    correction_result: args.result.correction_result ? {
      run_id: args.result.run_id,
      triggered: args.result.correction_result.triggered,
      correction_pass_completed: args.result.correction_result.correction_pass_completed,
      merge_strategy: args.result.correction_result.merge_strategy,
      rerun_json: args.result.correction_result.rerun,
      reused_json: args.result.correction_result.reused,
      merged_json: args.result.correction_result.merged,
      final_supervisor_action_count: args.result.correction_result.final_supervisor_action_count,
      notes_json: args.result.correction_result.notes
    } : null,
    lane_reuse_decisions: args.result.lane_reuse_decisions.map((item) => ({
      id: `${args.result.run_id}:lane-reuse:${item.lane_name}`,
      run_id: args.result.run_id,
      lane_name: item.lane_name,
      decision: item.decision,
      rationale_json: item.rationale
    })),
    persistence_summary: args.result.persistence ? {
      run_id: args.result.run_id,
      mode: args.result.persistence.mode,
      root: args.result.persistence.root
    } : null,
    stage_artifacts: stageArtifacts,
    stage_executions: buildStageExecutions(args.result.run_id, args.result.observability.events),
    lane_plans: args.result.lane_plans.map((item) => ({
      id: `${args.result.run_id}:${item.lane_name}`,
      run_id: args.result.run_id,
      lane_name: item.lane_name,
      controls_in_scope_json: item.controls_in_scope,
      evidence_requirements_json: item.evidence_requirements,
      allowed_tools_json: item.allowed_tools,
      rationale_json: item.rationale,
      token_budget: item.token_budget,
      rerun_budget: item.rerun_budget
    })),
    evidence_records: args.result.evidence_records.map((item) => ({
      id: item.evidence_id,
      run_id: item.run_id,
      lane_name: item.lane_name ?? null,
      source_type: item.source_type,
      source_id: item.source_id,
      control_ids_json: item.control_ids,
      summary: item.summary,
      confidence: item.confidence,
      raw_artifact_path: item.raw_artifact_path ?? null,
      locations_json: item.locations ?? [],
      metadata_json: item.metadata
    })),
    lane_results: args.result.lane_results.map((item) => ({
      id: `${args.result.run_id}:${item.lane_name}`,
      run_id: args.result.run_id,
      lane_name: item.lane_name,
      finding_ids_json: item.findings.map((finding) => finding.finding_id),
      control_ids_json: item.control_results.map((control) => control.control_id),
      evidence_used_json: item.evidence_used,
      summary_json: item.summary
    })),
    lane_specialists: args.result.lane_specialist_outputs.map((item) => ({
      id: `${args.result.run_id}:lane-specialist:${item.lane_name}`,
      run_id: args.result.run_id,
      lane_name: item.lane_name,
      agent_name: item.agent_name,
      output_artifact: item.output_artifact,
      summary_json: item.summary,
      observations_json: item.observations,
      evidence_ids_json: item.evidence_ids,
      tool_provider_ids_json: item.tool_provider_ids
    })),
    agent_invocations: args.result.agent_invocations.map((item) => ({
      id: item.agent_call_id,
      run_id: item.run_id,
      stage_name: item.stage_name ?? null,
      lane_name: item.lane_name ?? null,
      agent_name: item.agent_name,
      provider: item.model_provider,
      model: item.model_name,
      status: item.status,
      attempts: item.attempts,
      context_bytes: item.context_bytes ?? null,
      user_prompt_bytes: item.user_prompt_bytes ?? null,
      prompt_tokens: item.prompt_tokens ?? null,
      completion_tokens: item.completion_tokens ?? null,
      total_tokens: item.total_tokens ?? null,
      estimated_cost_usd: item.estimated_cost_usd ?? null,
      started_at: item.started_at,
      completed_at: item.completed_at,
      input_artifacts_json: item.input_artifacts,
      output_artifact: item.output_artifact
    })),
    tool_executions: args.result.tool_executions.map((item, index) => ({
      id: `${args.result.run_id}:tool:${index}:${item.provider_id}`,
      run_id: args.result.run_id,
      lane_name: laneForToolExecution(args.result, item),
      provider_id: item.provider_id,
      provider_kind: item.provider_kind,
      tool: item.tool,
      status: item.status,
      exit_code: item.exit_code,
      summary: item.summary,
      command_json: item.command,
      artifact_type: item.artifact_type,
      artifact_path: null,
      parsed_json: item.parsed,
      normalized_json: item.normalized ?? null,
      adapter_json: item.adapter ?? null,
      stderr: item.stderr ?? null
    })),
    findings: args.result.findings.map((item) => ({
      id: item.finding_id,
      run_id: args.result.run_id,
      lane_name: args.result.lane_results.find((lane) => lane.findings.some((finding) => finding.finding_id === item.finding_id))?.lane_name ?? null,
      title: item.title,
      severity: item.severity,
      category: item.category,
      description: item.description,
      confidence: item.confidence,
      source: item.source,
      publication_state: item.public_safe ? "public_safe" : "internal_only",
      needs_human_review: !item.public_safe,
      score_impact: item.score_impact,
      control_ids_json: item.control_ids,
      standards_refs_json: item.standards_refs,
      evidence_json: item.evidence,
      created_at: args.result.trace.steps.at(-1)?.timestamp ?? new Date().toISOString()
    })),
    control_results: args.result.control_results.map((item) => ({
      id: `${args.result.run_id}:${item.control_id}`,
      run_id: args.result.run_id,
      lane_name: args.result.lane_results.find((lane) => lane.control_results.some((control) => control.control_id === item.control_id))?.lane_name ?? null,
      control_id: item.control_id,
      framework: item.framework,
      standard_ref: item.standard_ref,
      title: item.title,
      applicability: item.applicability,
      assessability: item.assessability,
      status: item.status,
      score_weight: item.score_weight,
      max_score: item.max_score,
      score_awarded: item.score_awarded,
      rationale_json: item.rationale,
      evidence_json: item.evidence,
      finding_ids_json: item.finding_ids,
      sources_json: item.sources
    })),
    score_summary: {
      run_id: args.result.run_id,
      methodology_version: args.result.score_summary.methodology_version,
      overall_score: args.result.score_summary.overall_score,
      rating: args.result.score_summary.rating,
      leaderboard_summary: args.result.score_summary.leaderboard_summary,
      limitations_json: args.result.score_summary.limitations
    },
    review_decision: reviewDecision,
    supervisor_review: {
      run_id: args.result.run_id,
      summary_json: args.result.skeptic_review.summary,
      grader_outputs_json: args.result.skeptic_review.grader_outputs,
      actions_json: args.result.skeptic_review.actions,
      notes_json: args.result.skeptic_review.notes,
      final_review: !!args.result.correction_result?.correction_pass_completed
    },
    remediation_memo: remediationMemo,
    review_workflow: deriveInitialReviewWorkflow({
      run: {
        id: args.result.run_id,
        created_at: createdAt,
        workspace_id: scope.workspace_id,
        project_id: scope.project_id
      },
      reviewDecision,
      remediationMemo
    }),
    review_actions: [],
    policy_application: {
      run_id: args.result.run_id,
      applied_suppressions_json: args.result.policy_application.applied_suppressions,
      applied_waivers_json: args.result.policy_application.applied_waivers,
      effective_finding_ids_json: args.result.policy_application.effective_finding_ids,
      effective_control_ids_json: args.result.policy_application.effective_control_ids,
      notes_json: args.result.policy_application.notes
    },
    dimension_scores: args.result.dimension_scores.map((item) => ({
      run_id: args.result.run_id,
      dimension: item.dimension,
      score: item.score,
      max_score: item.max_score,
      percentage: item.percentage,
      weight: item.weight,
      assessed_controls: item.assessed_controls,
      applicable_controls: item.applicable_controls,
      control_ids_json: item.control_ids,
      frameworks_json: item.frameworks
    })),
    metrics: persistMetrics(args.result.run_id, args.result.observability.metrics),
    events: args.result.observability.events as PersistedEventRecord[],
    artifact_index: indexArtifacts(args.result.artifacts)
  };

  return store.persistBundle(bundle).then((persisted) => ({ mode, root: persisted.root }));
}
