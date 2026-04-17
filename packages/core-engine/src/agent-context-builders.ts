import type { AuditLanePlan, AuditPolicyArtifact, ControlResult, EvalSelectionArtifact, Finding, PlannerArtifact, RepoContextArtifact, ScoreSummary, StandardControlDefinition, TargetDescriptor, TargetProfileArtifact, ThreatModelArtifact } from "./contracts.js";

function truncate(text: string, max = 400): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function compactRepoContext(repoContext: RepoContextArtifact): { summary: string[]; capability_signals: string[]; documents: Array<{ path: string; kind: string; excerpt: string }> } {
  return {
    summary: repoContext.summary.slice(0, 3),
    capability_signals: repoContext.capability_signals.slice(0, 12),
    documents: repoContext.documents.slice(0, 6).map((doc) => ({ path: doc.path, kind: doc.kind, excerpt: truncate(doc.excerpt, 600) }))
  };
}

function compactAnalysis(analysis: any): Record<string, unknown> {
  return {
    project_name: analysis.project_name,
    file_count: analysis.file_count,
    frameworks: analysis.frameworks,
    languages: analysis.languages,
    entry_points: analysis.entry_points.slice(0, 10),
    ci_workflows: analysis.ci_workflows.slice(0, 10),
    security_docs: analysis.security_docs.slice(0, 10),
    dependency_manifests: analysis.dependency_manifests.slice(0, 12),
    mcp_indicators: analysis.mcp_indicators.slice(0, 10),
    agent_indicators: analysis.agent_indicators.slice(0, 10),
    tool_execution_indicators: analysis.tool_execution_indicators.slice(0, 10)
  };
}

function compactControlCatalog(controlCatalog: StandardControlDefinition[], applicableIds?: string[]): Array<Record<string, unknown>> {
  const selected = applicableIds?.length ? controlCatalog.filter((control) => applicableIds.includes(control.control_id)) : controlCatalog;
  return selected.slice(0, 40).map((control) => ({
    control_id: control.control_id,
    framework: control.framework,
    standard_ref: control.standard_ref,
    title: control.title,
    static_assessable: control.static_assessable,
    applicability: control.applicability,
    baseline_dimension: control.baseline_dimension,
    weight: control.weight
  }));
}

export function buildPlannerContext(args: {
  request: any;
  sandbox: any;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  targetProfile: TargetProfileArtifact;
  controlCatalog: StandardControlDefinition[];
  methodology: any;
  auditPolicy: AuditPolicyArtifact;
  skepticFeedback?: unknown;
  priorPlannerArtifact?: PlannerArtifact;
  priorRunPlan?: unknown;
}): Record<string, unknown> {
  return {
    request: { run_mode: args.request.run_mode ?? "static", target_kind: args.target.target_type },
    sandbox: { run_mode: args.sandbox.run_mode, backend: args.sandbox.backend, target_dir: args.sandbox.target_dir },
    target: { target_type: args.target.target_type, snapshot: args.target.snapshot },
    analysis: compactAnalysis(args.analysis),
    repoContext: compactRepoContext(args.repoContext),
    targetProfile: args.targetProfile,
    controlCatalog: compactControlCatalog(args.controlCatalog),
    methodology: { version: args.methodology.version, summary: args.methodology.summary },
    auditPolicy: args.auditPolicy,
    skepticFeedback: args.skepticFeedback ?? null,
    priorPlannerArtifact: args.priorPlannerArtifact ?? null,
    priorRunPlan: args.priorRunPlan ?? null
  };
}

export function buildThreatModelContext(args: {
  request: any;
  sandbox: any;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  targetProfile: TargetProfileArtifact;
  plannerArtifact: PlannerArtifact;
  methodology: any;
  auditPolicy: AuditPolicyArtifact;
}): Record<string, unknown> {
  return {
    request: { run_mode: args.request.run_mode ?? "static" },
    target: { target_type: args.target.target_type, snapshot: args.target.snapshot },
    analysis: compactAnalysis(args.analysis),
    repoContext: compactRepoContext(args.repoContext),
    targetProfile: args.targetProfile,
    plannerArtifact: {
      selected_profile: args.plannerArtifact.selected_profile,
      classification_review: args.plannerArtifact.classification_review,
      applicable_control_ids: args.plannerArtifact.applicable_control_ids,
      rationale: args.plannerArtifact.rationale,
      constraints: args.plannerArtifact.constraints
    },
    methodology: { version: args.methodology.version },
    auditPolicy: args.auditPolicy
  };
}

export function buildEvalSelectionContext(args: {
  request: any;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  targetProfile: TargetProfileArtifact;
  plannerArtifact: PlannerArtifact;
  threatModel: ThreatModelArtifact;
  controlCatalog: StandardControlDefinition[];
  methodology: any;
  auditPolicy: AuditPolicyArtifact;
  skepticFeedback?: unknown;
}): Record<string, unknown> {
  return {
    request: { run_mode: args.request.run_mode ?? "static" },
    target: { target_type: args.target.target_type },
    analysis: compactAnalysis(args.analysis),
    repoSignals: { capability_signals: args.repoContext.capability_signals },
    targetProfile: args.targetProfile,
    plannerArtifact: {
      selected_profile: args.plannerArtifact.selected_profile,
      applicable_control_ids: args.plannerArtifact.applicable_control_ids,
      deferred_control_ids: args.plannerArtifact.deferred_control_ids,
      non_applicable_control_ids: args.plannerArtifact.non_applicable_control_ids,
      constraints: args.plannerArtifact.constraints
    },
    threatModel: {
      summary: args.threatModel.summary,
      attack_surfaces: args.threatModel.attack_surfaces.slice(0, 10),
      high_risk_components: args.threatModel.high_risk_components.slice(0, 10),
      framework_focus: args.threatModel.framework_focus
    },
    controlCatalog: compactControlCatalog(args.controlCatalog, args.plannerArtifact.applicable_control_ids),
    methodology: { version: args.methodology.version },
    auditPolicy: args.auditPolicy,
    skepticFeedback: args.skepticFeedback ?? null
  };
}

export function buildSupervisorContext(args: {
  request: any;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  runPlan: any;
  findings: Finding[];
  controlResults: ControlResult[];
  toolExecutions: any[];
  threatModel: ThreatModelArtifact;
  scoreSummary: ScoreSummary;
  controlCatalog: StandardControlDefinition[];
  auditPolicy: AuditPolicyArtifact;
  lanePlans?: any[];
  laneResults?: any[];
  correctionPass?: boolean;
}): Record<string, unknown> {
  return {
    request: { run_mode: args.request.run_mode ?? "static" },
    target: { target_type: args.target.target_type, snapshot: args.target.snapshot },
    analysis: compactAnalysis(args.analysis),
    repoSignals: { capability_signals: args.repoContext.capability_signals },
    runPlan: {
      selected_profile: args.runPlan.selected_profile,
      target_class: args.runPlan.target_class,
      applicable_control_ids: args.runPlan.applicable_control_ids,
      baseline_tools: args.runPlan.baseline_tools,
      runtime_tools: args.runPlan.runtime_tools
    },
    findings: args.findings.map((finding) => ({
      finding_id: finding.finding_id,
      title: finding.title,
      severity: finding.severity,
      category: finding.category,
      confidence: finding.confidence,
      source: finding.source,
      control_ids: finding.control_ids,
      evidence: finding.evidence.slice(0, 5),
      description: truncate(finding.description, 320)
    })),
    controlResults: args.controlResults.map((control) => ({
      control_id: control.control_id,
      framework: control.framework,
      status: control.status,
      applicability: control.applicability,
      assessability: control.assessability,
      score_awarded: control.score_awarded,
      max_score: control.max_score,
      finding_ids: control.finding_ids,
      evidence: control.evidence.slice(0, 4)
    })),
    toolExecutions: args.toolExecutions.map((tool) => ({
      provider_id: tool.provider_id,
      tool: tool.tool,
      status: tool.status,
      summary: tool.summary,
      exit_code: tool.exit_code
    })),
    threatModel: {
      summary: args.threatModel.summary,
      high_risk_components: args.threatModel.high_risk_components.slice(0, 10),
      attack_surfaces: args.threatModel.attack_surfaces.slice(0, 10)
    },
    scoreSummary: {
      overall_score: args.scoreSummary.overall_score,
      rating: args.scoreSummary.rating,
      framework_scores: args.scoreSummary.framework_scores
    },
    controlCatalog: compactControlCatalog(args.controlCatalog, args.runPlan.applicable_control_ids),
    lanePlans: (args.lanePlans ?? []).map((plan) => ({ lane_name: plan.lane_name, controls_in_scope: plan.controls_in_scope, allowed_tools: plan.allowed_tools })),
    laneResults: (args.laneResults ?? []).map((lane) => ({ lane_name: lane.lane_name, finding_count: lane.findings.length, control_count: lane.control_results.length, evidence_used: lane.evidence_used })),
    auditPolicy: args.auditPolicy,
    correctionPass: args.correctionPass ?? false
  };
}

export function buildRemediationContext(args: {
  request: any;
  target: TargetDescriptor;
  analysis: any;
  runPlan: any;
  findings: Finding[];
  controlResults: ControlResult[];
  observations: any[];
  skepticReview: any;
  scoreSummary: ScoreSummary;
  auditPolicy: AuditPolicyArtifact;
}): Record<string, unknown> {
  return {
    request: { run_mode: args.request.run_mode ?? "static" },
    target: { target_type: args.target.target_type, snapshot: args.target.snapshot },
    analysis: compactAnalysis(args.analysis),
    runPlan: { selected_profile: args.runPlan.selected_profile, target_class: args.runPlan.target_class },
    findings: args.findings.map((finding) => ({ title: finding.title, severity: finding.severity, control_ids: finding.control_ids, description: truncate(finding.description, 300) })),
    controlResults: args.controlResults.filter((control) => control.status === "fail" || control.status === "partial").map((control) => ({ control_id: control.control_id, framework: control.framework, status: control.status, rationale: control.rationale.slice(0, 3) })),
    observations: args.observations.slice(0, 10),
    skepticReview: {
      summary: args.skepticReview.summary,
      actions: args.skepticReview.actions,
      notes: args.skepticReview.notes.slice(0, 8)
    },
    scoreSummary: { overall_score: args.scoreSummary.overall_score, rating: args.scoreSummary.rating },
    auditPolicy: args.auditPolicy
  };
}


export function buildLaneSpecialistContext(args: {
  request: any;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  threatModel: ThreatModelArtifact;
  plan: AuditLanePlan;
  findings: Finding[];
  controlResults: ControlResult[];
  evidenceRecords: any[];
  toolExecutions: any[];
  auditPolicy: AuditPolicyArtifact;
}): Record<string, unknown> {
  return {
    request: { run_mode: args.request.run_mode ?? "static" },
    target: { target_type: args.target.target_type, snapshot: args.target.snapshot },
    analysis: compactAnalysis(args.analysis),
    repoContext: compactRepoContext(args.repoContext),
    threatModel: {
      summary: args.threatModel.summary,
      attack_surfaces: args.threatModel.attack_surfaces.slice(0, 8),
      high_risk_components: args.threatModel.high_risk_components.slice(0, 8)
    },
    lanePlan: {
      lane_name: args.plan.lane_name,
      controls_in_scope: args.plan.controls_in_scope,
      evidence_requirements: args.plan.evidence_requirements,
      allowed_tools: args.plan.allowed_tools,
      rationale: args.plan.rationale
    },
    findings: args.findings.map((finding) => ({
      finding_id: finding.finding_id,
      title: finding.title,
      severity: finding.severity,
      category: finding.category,
      confidence: finding.confidence,
      control_ids: finding.control_ids,
      evidence: finding.evidence.slice(0, 4),
      description: truncate(finding.description, 280)
    })),
    controlResults: args.controlResults.map((control) => ({
      control_id: control.control_id,
      framework: control.framework,
      title: control.title,
      status: control.status,
      assessability: control.assessability,
      score_awarded: control.score_awarded,
      max_score: control.max_score,
      evidence: control.evidence.slice(0, 4)
    })),
    evidenceRecords: args.evidenceRecords.slice(0, 12).map((record) => ({
      source_type: record.source_type,
      source_id: record.source_id,
      lane_name: record.lane_name ?? null,
      summary: truncate(record.summary, 240),
      confidence: record.confidence,
      control_ids: record.control_ids.slice(0, 8)
    })),
    toolExecutions: args.toolExecutions.map((tool) => ({
      provider_id: tool.provider_id,
      tool: tool.tool,
      status: tool.status,
      summary: truncate(tool.summary, 240),
      normalized: tool.normalized ?? null
    })),
    auditPolicy: args.auditPolicy
  };
}
