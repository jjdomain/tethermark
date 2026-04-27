import type { HandoffRecord } from "../../handoff-contracts/src/index.js";
import type { AgentInvocationRecord } from "../../trace-recorder/src/index.js";

export type TargetKind = "path" | "repo" | "endpoint";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type AsyncJobStatus = "queued" | "starting" | "running" | "succeeded" | "failed" | "canceled";
export type TargetClass =
  | "repo_posture_only"
  | "runnable_local_app"
  | "hosted_endpoint_black_box"
  | "tool_using_multi_turn_agent"
  | "mcp_server_plugin_skill_package";

export type ApplicableStatus = "applicable" | "not_applicable";
export type AssessabilityStatus = "assessed" | "partially_assessed" | "not_assessed";
export type ControlStatus = "pass" | "partial" | "fail" | "not_assessed" | "not_applicable";
export type BaselineDimensionKey =
  | "repo_posture"
  | "agentic_guardrails"
  | "ai_data_exposure"
  | "observability_auditability"
  | "evidence_readiness";
export type EvidenceProviderKind = "local_binary" | "public_api" | "internal_plugin";
export type EvidenceExecutionStatus = "completed" | "skipped" | "failed";
export type SkepticActionType =
  | "rerun_planner"
  | "rerun_threat_model"
  | "rerun_eval_selection"
  | "rerun_evidence_subset"
  | "rerun_lane"
  | "rerun_tool"
  | "reassess_control_subset"
  | "drop_findings"
  | "downgrade_controls"
  | "request_additional_evidence";
export type HarnessEventLevel = "debug" | "info" | "warn" | "error";
export type HarnessMetricKind = "counter" | "gauge" | "histogram";
export type DatabaseMode = "embedded" | "local";
export type AuditPackageId = "baseline-static" | "agentic-static" | "deep-static" | "runtime-validated" | "premium-comprehensive";
export type HumanReviewStatus = "not_required" | "review_required" | "in_review" | "approved" | "rejected" | "requires_rerun";
export type ProviderReadinessStatus = "available" | "blocked" | "conditional" | "deferred";
export type PreflightReadinessStatus = "ready" | "ready_with_warnings" | "blocked";
export type ScopeDefaults = {
  workspace_id: string;
  project_id: string;
};
export type ReviewActorRole = "admin" | "triage_lead" | "reviewer" | "viewer";
export type HumanReviewActionType =
    | "assign_reviewer"
    | "start_review"
    | "approve_run"
    | "reject_run"
    | "require_rerun"
    | "rerun_in_capable_env"
    | "adopt_rerun_outcome"
    | "confirm_finding"
    | "suppress_finding"
    | "downgrade_severity"
    | "request_validation"
    | "mark_manual_runtime_review_complete"
    | "accept_without_runtime_validation"
    | "mark_internal_only";

export interface AuditRequest {
  local_path?: string;
  repo_url?: string;
  endpoint_url?: string;
  output_dir?: string;
  run_mode?: "static" | "build" | "runtime" | "validate";
  llm_provider?: "openai" | "mock";
  llm_model?: string;
  llm_api_key?: string;
  audit_policy_pack?: string;
  audit_policy?: AuditPolicyArtifact;
  db_mode?: DatabaseMode;
  audit_package?: AuditPackageId;
  hints?: Record<string, unknown>;
  workspace_id?: string;
  project_id?: string;
  requested_by?: string;
}

export interface SandboxCommandPolicy {
  allow_install_commands: boolean;
  allow_target_execution: boolean;
  allow_network_egress: boolean;
  allowed_command_prefixes: string[];
  blocked_command_patterns: string[];
}

export interface ContainerWorkspaceContract {
  runtime: "docker" | "podman" | "unconfigured";
  image: string;
  workspace_mount: string;
  artifact_mount: string;
  network_mode: "none" | "bridge" | "bounded";
  notes: string[];
}

export interface SandboxExecutionStep {
  step_id: string;
  phase: "install" | "build" | "test" | "runtime_probe";
  adapter: "node_npm" | "python_pytest" | "http_service";
  command: string[];
  rationale: string;
  requires_network: boolean;
  enabled: boolean;
  expected_artifact?: string | null;
  artifact_context?: Record<string, unknown>;
}

export interface SandboxExecutionPlan {
  readiness_status: "ready" | "ready_with_warnings" | "blocked";
  detected_stack: string[];
  entry_signals: string[];
  steps: SandboxExecutionStep[];
  warnings: string[];
}

export interface SandboxExecutionResult {
  step_id: string;
  status: "ready" | "completed" | "failed" | "blocked" | "skipped";
  checked_at: string;
  execution_runtime: "container" | "host_probe" | "host_bounded";
  summary: string;
  adapter?: SandboxExecutionStep["adapter"];
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  exit_code?: number | null;
  stdout_excerpt?: string | null;
  stderr_excerpt?: string | null;
  normalized_artifact?: {
    type: "install" | "build" | "test" | "runtime_probe";
    title: string;
    summary: string;
    details_json: Record<string, unknown>;
  } | null;
}

export interface SandboxExecutionArtifact {
  readiness_status: SandboxExecutionPlan["readiness_status"];
  runtime: ContainerWorkspaceContract["runtime"] | "unconfigured";
  plan: SandboxExecutionPlan;
  results: SandboxExecutionResult[];
}

export interface SandboxSourceProvenance {
  source_type: "repo" | "path" | "endpoint";
  source_value: string;
  commit_sha: string | null;
  upstream_repo_url?: string | null;
}

export interface SandboxStorageUsage {
  target_bytes: number;
  target_file_count: number;
}

export interface SandboxSession {
  sandbox_id: string;
  backend: string;
  platform: NodeJS.Platform;
  root_dir: string;
  target_dir: string;
  run_mode: NonNullable<AuditRequest["run_mode"]>;
  enforcement_notes: string[];
  command_policy: SandboxCommandPolicy;
  container_workspace?: ContainerWorkspaceContract;
  execution_plan?: SandboxExecutionPlan;
  execution_results?: SandboxExecutionResult[];
  source_provenance: SandboxSourceProvenance;
  storage_usage: SandboxStorageUsage;
}

export interface TargetDescriptor {
  target_id: string;
  target_type: TargetKind;
  repo_url: string | null;
  local_path: string | null;
  endpoint_url: string | null;
  snapshot: {
    type: "filesystem" | "repo_url" | "endpoint";
    value: string;
    captured_at: string;
    commit_sha: string | null;
  };
  hints: Record<string, unknown>;
}

export interface AnalysisSummary {
  root_path: string;
  project_name: string;
  file_count: number;
  frameworks: string[];
  languages: string[];
  entry_points: string[];
  mcp_indicators: string[];
  agent_indicators: string[];
  tool_execution_indicators: string[];
  dependency_manifests: string[];
  lockfiles: string[];
  package_ecosystems: string[];
  package_managers: string[];
  ci_workflows: string[];
  security_docs: string[];
  release_files: string[];
  container_files: string[];
}

export interface RepoContextDocument {
  path: string;
  kind: "readme" | "docs" | "manifest" | "workflow" | "security" | "config" | "entrypoint" | "other";
  excerpt: string;
}

export interface RepoContextArtifact {
  summary: string[];
  capability_signals: string[];
  documents: RepoContextDocument[];
}

export interface PreflightSummary {
  target: {
    kind: "path" | "repo" | "endpoint";
    input: string;
    analysis_available: boolean;
    target_class: TargetClass;
    confidence: number;
    evidence: string[];
    project_name: string | null;
    file_count: number | null;
    frameworks: string[];
    languages: string[];
  };
  readiness: {
    status: PreflightReadinessStatus;
    blockers: string[];
    warnings: string[];
  };
  provider_readiness: Array<{
    provider_id: string;
    provider_kind: "internal_plugin" | "local_binary" | "public_api";
    status: ProviderReadinessStatus;
    summary: string;
  }>;
  recommended_audit_package: {
    id: string;
    title: string;
    rationale: string;
  };
  selected_policy_pack: {
    id: string | null;
    name: string | null;
    source: string | null;
  };
  launch_profile: {
    run_mode: string;
    audit_package: string;
    audit_policy_pack: string;
    llm_provider: string;
    llm_model: string | null;
    preflight_strictness: string;
    runtime_allowed: string;
    review_severity: string;
    review_visibility: string;
  };
  repo_signals: {
    package_ecosystems: string[];
    package_managers: string[];
    ci_workflows: number;
    security_docs: number;
    entry_points: number;
    agentic_markers: number;
    mcp_markers: number;
  };
}

export interface LaunchIntentArtifact {
  source_surface: string;
  submitted_at: string;
  requested_by: string | null;
  workspace_id: string | null;
  project_id: string | null;
  target: {
    kind: "path" | "repo" | "endpoint";
    input: string;
  };
  requested_profile: {
    run_mode: string;
    audit_package: string;
    audit_policy_pack: string;
    llm_provider: string;
    llm_model: string | null;
    preflight_strictness: string;
    runtime_allowed: string;
    review_severity: string;
    review_visibility: string;
  };
  preflight: {
    summary_status: PreflightReadinessStatus;
    checked_at: string | null;
    accepted_at: string | null;
    stale: boolean;
    accepted: boolean;
  };
  notes: string[];
}

export interface OutboundApprovalArtifact {
  integration: "github";
  approved_by: string;
  approved_at: string;
  notes: string[];
}

export interface OutboundSendArtifact {
  integration: "github";
  action_type: string;
  attempted_by: string;
  attempted_at: string;
  executed: false;
  status: "manual_only" | "blocked";
  reason: string;
  payload_preview: Record<string, unknown> | null;
}

export interface OutboundVerificationArtifact {
  integration: "github";
  verified_by: string;
  verified_at: string;
  repo_full_name: string | null;
  api_base_url: string | null;
  status: "verified" | "blocked" | "error";
  reason: string;
  permissions: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  } | null;
}

export interface OutboundDeliveryArtifact {
  integration: "github";
  action_type: string;
  attempted_by: string;
  attempted_at: string;
  status: "sent" | "failed" | "blocked";
  reason: string;
  target_number: number | null;
  external_url: string | null;
  response_status: number | null;
  payload_preview: Record<string, unknown> | null;
  response_body: Record<string, unknown> | null;
}

export interface HeuristicTargetProfile {
  primary_class: TargetClass;
  secondary_traits: string[];
  confidence: number;
  evidence: string[];
}

export interface SemanticClassificationReview {
  semantic_class: TargetClass;
  final_class: TargetClass;
  secondary_traits: string[];
  confidence: number;
  evidence: string[];
  override_reason?: string;
}

export interface TargetProfileArtifact {
  heuristic: HeuristicTargetProfile;
  semantic_review: SemanticClassificationReview;
}

export interface PlannerArtifact {
  selected_profile: string;
  classification_review: SemanticClassificationReview;
  frameworks_in_scope: string[];
  applicable_control_ids: string[];
  deferred_control_ids: string[];
  non_applicable_control_ids: string[];
  rationale: string[];
  constraints: {
    max_runtime_minutes: number;
    network_mode: "none" | "bounded" | "bounded_remote";
    sandbox_required: boolean;
    install_allowed: boolean;
    read_only_analysis_only: boolean;
    target_execution_allowed: boolean;
  };
}

export interface ControlToolMapping {
  control_id: string;
  tools: string[];
  rationale: string;
}

export interface AuditLanePlan {
  lane_name: string;
  controls_in_scope: string[];
  evidence_requirements: string[];
  allowed_tools: string[];
  rationale: string[];
  token_budget: number;
  rerun_budget: number;
}

export interface EvidenceRecord {
  evidence_id: string;
  run_id: string;
  lane_name?: string;
  source_type: "tool" | "analysis" | "repo_context" | "agent";
  source_id: string;
  control_ids: string[];
  summary: string;
  confidence: number;
  raw_artifact_path?: string;
  locations?: EvidenceLocation[];
  metadata: Record<string, unknown>;
}

export interface EvidenceLocation {
  source_kind: "file" | "uri" | "symbol";
  path?: string | null;
  uri?: string | null;
  line?: number | null;
  column?: number | null;
  end_line?: number | null;
  end_column?: number | null;
  symbol?: string | null;
  label?: string | null;
}

export interface LaneResult {
  lane_name: string;
  findings: Finding[];
  control_results: ControlResult[];
  evidence_used: string[];
  summary: string[];
}

export interface LaneSpecialistArtifact {
  summary: string[];
  observations: Array<{
    title: string;
    summary: string;
    evidence: string[];
  }>;
}

export interface LaneSpecialistRunArtifact {
  lane_name: string;
  agent_name: string;
  output_artifact: string;
  summary: string[];
  observations: Array<{
    title: string;
    summary: string;
    evidence: string[];
  }>;
  evidence_ids: string[];
  tool_provider_ids: string[];
}

export interface EvalSelectionArtifact {
  baseline_tools: string[];
  runtime_tools: string[];
  custom_eval_packs: string[];
  validation_candidates: string[];
  control_tool_map: ControlToolMapping[];
  rationale: string[];
}

export interface RunPlan {
  run_id: string;
  target_id: string;
  selected_profile: string;
  target_class: TargetClass;
  run_mode: NonNullable<AuditRequest["run_mode"]>;
  frameworks_in_scope: string[];
  applicable_control_ids: string[];
  deferred_control_ids: string[];
  non_applicable_control_ids: string[];
  baseline_tools: string[];
  runtime_tools: string[];
  custom_eval_packs: string[];
  validation_candidates: string[];
  control_tool_map: ControlToolMapping[];
  rationale: string[];
  constraints: {
    sandbox_required: boolean;
    network_mode: "none" | "bounded" | "bounded_remote";
    install_allowed: boolean;
    read_only_analysis_only: boolean;
    target_execution_allowed: boolean;
  };
}

export interface ThreatModelArtifact {
  summary: {
    system_type: string;
    stack_guess: string[];
    confidence: number;
  };
  assets: string[];
  entry_points: string[];
  trust_boundaries: string[];
  attack_surfaces: string[];
  likely_abuse_cases: string[];
  high_risk_components: string[];
  assumptions: string[];
  questions_for_reviewer: string[];
  framework_focus: string[];
}

export interface Finding {
  finding_id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  description: string;
  evidence: string[];
  public_safe: boolean;
  confidence: number;
  score_impact: number;
  source: "tool" | "heuristic" | "agent_synthesis";
  control_ids: string[];
  standards_refs: string[];
}

export interface GraderOutput {
  finding_id: string;
  evidence_sufficiency: "low" | "medium" | "high";
  false_positive_risk: "low" | "medium" | "high";
  validation_recommendation: "yes" | "no";
  reasoning_summary: string;
}

export interface SkepticAction {
  type: SkepticActionType;
  reason: string;
  lane_names?: string[];
  control_ids?: string[];
  finding_ids?: string[];
  provider_ids?: string[];
}

export interface SkepticArtifact {
  summary: {
    overall_evidence_sufficiency: "low" | "medium" | "high";
    overall_false_positive_risk: "low" | "medium" | "high";
    publication_safety_note: string;
  };
  grader_outputs: GraderOutput[];
  actions: SkepticAction[];
  notes: string[];
}

export interface CorrectionPlanArtifact {
  triggered: boolean;
  supervisor_action_count: number;
  requested_actions: SkepticAction[];
  rerun: {
    planner: boolean;
    threat_model: boolean;
    eval_selection: boolean;
    lane_names: string[];
    provider_ids: string[];
    tool_provider_ids: string[];
    control_ids: string[];
    requested_additional_evidence: boolean;
    selective_only: boolean;
  };
  merge_strategy: "no_rerun" | "merge_selective" | "replace_cycle";
  notes: string[];
}

export interface CorrectionResultArtifact {
  triggered: boolean;
  correction_pass_completed: boolean;
  merge_strategy: CorrectionPlanArtifact["merge_strategy"];
  rerun: {
    planner: boolean;
    threat_model: boolean;
    eval_selection: boolean;
    lane_names: string[];
    provider_ids: string[];
    tool_provider_ids: string[];
  };
  reused: {
    lane_names: string[];
    provider_ids: string[];
    tool_provider_ids: string[];
  };
  merged: {
    lane_names: string[];
    provider_ids: string[];
    tool_provider_ids: string[];
    control_ids: string[];
    finding_ids: string[];
  };
  final_supervisor_action_count: number;
  notes: string[];
}

export interface RemediationArtifact {
  summary: string;
  checklist: string[];
  human_review_required: boolean;
}

export interface PublishabilityArtifact {
  publishability_status: "publishable" | "internal_only" | "review_required" | "blocked";
  human_review_required: boolean;
  public_summary_safe: boolean;
  threshold: "low" | "medium" | "high";
  rationale: string[];
  gating_findings: string[];
  recommended_visibility: "public" | "internal";
}

export interface FindingSuppressionRule {
  rule_id: string;
  reason: string;
  finding_ids?: string[];
  categories?: string[];
  control_ids?: string[];
  title_contains?: string[];
  expires_at?: string | null;
}

export interface ControlWaiverRule {
  rule_id: string;
  reason: string;
  control_ids: string[];
  finding_ids?: string[];
  expires_at?: string | null;
}

export interface PolicyApplicationArtifact {
  applied_suppressions: Array<{
    rule_id: string;
    reason: string;
    finding_ids: string[];
  }>;
  applied_waivers: Array<{
    rule_id: string;
    reason: string;
    control_ids: string[];
    finding_ids: string[];
  }>;
  effective_finding_ids: string[];
  effective_control_ids: string[];
  notes: string[];
}

export interface AuditPolicyArtifact {
  version?: string;
  profile?: string;
  policy_pack_id?: string | null;
  policy_pack_name?: string | null;
  policy_pack_source?: "builtin" | "file" | "request" | "merged";
  organization?: string | null;
  objectives?: string[];
  control_decision_rules?: string[];
  evidence_requirements?: string[];
  publication_rules?: string[];
  custom_context?: string[];
  finding_suppressions?: FindingSuppressionRule[];
  control_waivers?: ControlWaiverRule[];
}

export interface AgentConfigSummary {
  agent_name: string;
  provider: string;
  model: string;
  api_key_source: "agent-specific" | "request-level" | "global-audit-llm" | "global-generic" | "none";
}

export interface StandardControlDefinition {
  control_id: string;
  framework: string;
  standard_ref: string;
  title: string;
  description: string;
  weight: number;
  static_assessable: boolean;
  baseline_dimension: BaselineDimensionKey;
  catalog: "external_standard" | "harness_internal";
  applicability: Array<"all" | "repo" | "agentic" | "mcp" | "ci" | "dependency" | "container">;
}

export interface BaselineDimensionScore {
  dimension: BaselineDimensionKey;
  score: number;
  weight: number;
  max_score: number;
  percentage: number;
  assessed_controls: number;
  applicable_controls: number;
  control_ids: string[];
  frameworks: string[];
}

export interface StaticBaselineMethodology {
  version: string;
  summary: string;
  dimensions: Array<{
    dimension: BaselineDimensionKey;
    weight: number;
    title: string;
    summary: string;
    frameworks: string[];
  }>;
  scoring_rules: string[];
}

export interface ControlResult {
  control_id: string;
  framework: string;
  standard_ref: string;
  title: string;
  applicability: ApplicableStatus;
  assessability: AssessabilityStatus;
  status: ControlStatus;
  score_weight: number;
  max_score: number;
  score_awarded: number;
  rationale: string[];
  evidence: string[];
  finding_ids: string[];
  sources: string[];
}

export interface FrameworkScore {
  framework: string;
  score: number;
  max_score: number;
  percentage: number;
  assessed_controls: number;
  applicable_controls: number;
  control_ids: string[];
}

export interface ScoreSummary {
  methodology_version: string;
  overall_score: number;
  rating: "poor" | "fair" | "good" | "strong" | "excellent";
  framework_scores: FrameworkScore[];
  limitations: string[];
  leaderboard_summary: string;
}

export interface MethodologyArtifact {
  version: string;
  summary: string;
  frameworks: Array<{
    framework: string;
    purpose: string;
    scoring_notes: string[];
  }>;
  scoring_rules: string[];
}

export interface AuditObservation {
  observation_id: string;
  title: string;
  summary: string;
  evidence: string[];
}

export interface CommitDiffGateArtifact {
  previous_run_id: string | null;
  current_commit_sha: string | null;
  previous_commit_sha: string | null;
  comparison_mode: "no_prior_run" | "policy_changed" | "same_commit" | "git_diff" | "git_diff_unavailable" | "non_git_target";
  changed_files: string[];
  stage_decisions: {
    planner: "reuse" | "rerun";
    threat_model: "reuse" | "rerun";
    eval_selection: "reuse" | "rerun";
  };
  rationale: string[];
}

export interface LaneReuseDecision {
  lane_name: string;
  decision: "reuse" | "rerun";
  rationale: string[];
}

export interface EvidenceProviderDescriptor {
  id: string;
  kind: EvidenceProviderKind;
  title: string;
  summary: string;
  supports_modes: Array<NonNullable<AuditRequest["run_mode"]>>;
}

export interface NormalizedEvidenceSummary {
  result_type: "repo_analysis" | "scorecard" | "semgrep" | "trivy" | "python_worker" | "unknown";
  signal_count: number;
  issue_count: number;
  warning_count: number;
  error_count: number;
  severity_counts: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  ecosystems: string[];
  coverage_paths: string[];
  locations?: EvidenceLocation[];
  notes: string[];
}

export interface EvidenceAdapterDecision {
  requested_provider_id: string;
  requested_tool: string;
  adapter_action: "direct" | "fallback";
  fallback_reason?: string | null;
  fallback_candidates?: string[];
  attempt_order: number;
}

export interface EvidenceExecutionRecord {
  tool: string;
  provider_id: string;
  provider_kind: EvidenceProviderKind;
  status: EvidenceExecutionStatus;
  command: string[];
  exit_code: number | null;
  summary: string;
  artifact_type: string;
  parsed: unknown;
  stderr?: string;
  failure_category?: "command_unavailable" | "sandbox_blocked" | "api_unavailable" | "runtime_error" | "parse_error" | null;
  capability_status?: "available" | "unavailable" | "blocked" | "unknown";
  fallback_from?: string | null;
  adapter?: EvidenceAdapterDecision | null;
  normalized?: NormalizedEvidenceSummary | null;
}

export type ToolExecutionRecord = EvidenceExecutionRecord;

export interface HarnessEvent {
  event_id: string;
  run_id: string;
  timestamp: string;
  level: HarnessEventLevel;
  stage: string;
  actor: string;
  event_type: string;
  status?: string;
  duration_ms?: number;
  details?: Record<string, unknown>;
}

export interface HarnessMetricSnapshot {
  name: string;
  kind: HarnessMetricKind;
  value: number;
  count?: number;
  min?: number;
  max?: number;
  avg?: number;
  tags?: Record<string, string>;
}

export interface ObservabilityArtifacts {
  events: HarnessEvent[];
  metrics: HarnessMetricSnapshot[];
}

export interface ArtifactRecord {
  artifact_id: string;
  run_id: string;
  type: string;
  path: string;
  created_at: string;
}

export interface TraceStep {
  step: number;
  actor: string;
  action: string;
  summary: string;
  artifacts: string[];
  timestamp: string;
}

export interface TraceRecord {
  trace_id: string;
  run_id: string;
  steps: TraceStep[];
}

export interface ResolvedConfigurationArtifact {
  run_id: string;
  request_summary: {
    target_kind: TargetKind;
    run_mode: NonNullable<AuditRequest["run_mode"]>;
    requested_audit_package: AuditPackageId | null;
    requested_policy_pack: string | null;
    db_mode: DatabaseMode;
    output_dir: string | null;
  };
  policy_pack: {
    id: string | null;
    name: string | null;
    source: AuditPolicyArtifact["policy_pack_source"] | null;
    profile: string | null;
    version: string | null;
  };
  audit_package: {
    selection_mode: "explicit" | "deferred_auto" | "auto";
    selected_id: AuditPackageId | null;
    title: string | null;
    initial_target_class: TargetClass | null;
  };
  validation: {
    policy_pack_validated: boolean;
    audit_package_validated: boolean;
    notes: string[];
  };
}

export interface PersistenceSummary {
  mode: DatabaseMode;
  root: string;
}

export interface HumanReviewWorkflow {
  run_id: string;
  status: HumanReviewStatus;
  human_review_required: boolean;
  publishability_status: PublishabilityArtifact["publishability_status"] | null;
  recommended_visibility: PublishabilityArtifact["recommended_visibility"] | null;
  opened_at: string;
  started_at: string | null;
  completed_at: string | null;
  current_reviewer_id: string | null;
  last_action_at: string | null;
  last_action_type: HumanReviewActionType | null;
  notes: string[];
}

export interface HumanReviewAction {
  action_id: string;
  run_id: string;
  reviewer_id: string;
  action_type: HumanReviewActionType;
  created_at: string;
  finding_id?: string | null;
  previous_severity?: Finding["severity"] | null;
  updated_severity?: Finding["severity"] | null;
  visibility_override?: PublishabilityArtifact["recommended_visibility"] | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface HumanReviewActionInput {
  reviewer_id: string;
  action_type: HumanReviewActionType;
  assigned_reviewer_id?: string | null;
  finding_id?: string | null;
  previous_severity?: Finding["severity"] | null;
  updated_severity?: Finding["severity"] | null;
  visibility_override?: PublishabilityArtifact["recommended_visibility"] | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export interface AuditResult {
  run_id: string;
  status: RunStatus;
  audit_package: AuditPackageId;
  audit_lanes: string[];
  preflight_summary: PreflightSummary;
  launch_intent: LaunchIntentArtifact;
  sandbox: SandboxSession;
  target: TargetDescriptor;
  analysis: AnalysisSummary;
  repo_context: RepoContextArtifact;
  audit_policy: AuditPolicyArtifact;
  resolved_configuration: ResolvedConfigurationArtifact;
  commit_diff: CommitDiffGateArtifact;
  lane_reuse_decisions: LaneReuseDecision[];
  lane_plans: AuditLanePlan[];
  evidence_records: EvidenceRecord[];
  lane_results: LaneResult[];
  lane_specialist_outputs: LaneSpecialistRunArtifact[];
  target_profile: TargetProfileArtifact;
  run_plan: RunPlan;
  threat_model: ThreatModelArtifact;
  evidence_executions: EvidenceExecutionRecord[];
  tool_executions: ToolExecutionRecord[];
  findings: Finding[];
  control_results: ControlResult[];
  methodology: MethodologyArtifact;
  static_baseline: StaticBaselineMethodology;
  dimension_scores: BaselineDimensionScore[];
  static_score: number;
  observations: AuditObservation[];
  score_summary: ScoreSummary;
  skeptic_review: SkepticArtifact;
  correction_plan?: CorrectionPlanArtifact | null;
  correction_result?: CorrectionResultArtifact | null;
  remediation: RemediationArtifact;
  publishability: PublishabilityArtifact;
  policy_application: PolicyApplicationArtifact;
  agent_config_summary: AgentConfigSummary[];
  agent_invocations: AgentInvocationRecord[];
  handoffs: HandoffRecord[];
  artifacts: ArtifactRecord[];
  trace: TraceRecord;
  observability: ObservabilityArtifacts;
  persistence?: PersistenceSummary;
}

export interface RunEnvelope {
  run_id: string;
  status: RunStatus;
  request: AuditRequest;
  created_at: string;
  updated_at: string;
  result?: AuditResult;
  error?: string;
  retry_of_run_id?: string;
}





