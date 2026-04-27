import type { ArtifactRecord, AsyncJobStatus, AuditRequest, AuditResult, DatabaseMode, HarnessEvent, HarnessMetricSnapshot, HumanReviewActionType, HumanReviewStatus, ResolvedConfigurationArtifact, ReviewActorRole } from "../contracts.js";
import type { AuditPackageDefinition } from "../audit-packages.js";

export interface PersistedTargetRecord {
  id: string;
  target_type: string;
  canonical_name: string;
  repo_url: string | null;
  local_path: string | null;
  endpoint_url: string | null;
  created_at: string;
}

export interface PersistedTargetSnapshotRecord {
  id: string;
  target_id: string;
  snapshot_value: string;
  commit_sha: string | null;
  captured_at: string;
  analysis_hash: string | null;
}

export interface PersistedTargetSummaryRecord {
  id: string;
  target_id: string;
  canonical_target_id: string;
  workspace_id: string;
  project_id: string;
  canonical_name: string;
  target_type: string;
  repo_url: string | null;
  local_path: string | null;
  endpoint_url: string | null;
  latest_run_id: string;
  latest_run_created_at: string;
  latest_status: string;
  latest_run_mode: string;
  latest_audit_package: string;
  latest_target_class: string | null;
  latest_rating: string;
  latest_overall_score: number;
  latest_static_score: number;
  latest_publishability_status: string | null;
  latest_human_review_required: boolean | null;
  latest_finding_count: number;
  latest_frameworks_json: unknown;
  latest_languages_json: unknown;
  latest_package_ecosystems_json: unknown;
  updated_at: string;
}

export interface PersistedPolicyPackRecord {
  id: string;
  name: string;
  version: string;
  source: string;
  definition_json: unknown;
  created_at: string;
}

export interface PersistedRunRecord {
  id: string;
  target_id: string;
  target_snapshot_id: string;
  workspace_id: string;
  project_id: string;
  requested_by: string | null;
  policy_pack_id: string | null;
  status: string;
  run_mode: string;
  audit_package: string;
  artifact_root: string;
  started_at: string;
  completed_at: string | null;
  static_score: number;
  overall_score: number;
  rating: string;
  created_at: string;
}

export interface PersistedResolvedConfigurationRecord {
  run_id: string;
  policy_pack_id: string | null;
  policy_pack_name: string | null;
  policy_pack_source: string | null;
  policy_profile: string | null;
  policy_version: string | null;
  requested_policy_pack: string | null;
  requested_audit_package: string | null;
  selected_audit_package: string | null;
  audit_package_title: string | null;
  audit_package_selection_mode: string;
  initial_target_class: string | null;
  run_mode: string;
  target_kind: string;
  db_mode: string;
  output_dir: string | null;
  validation_json: ResolvedConfigurationArtifact["validation"];
  request_summary_json: ResolvedConfigurationArtifact["request_summary"];
  policy_pack_json: ResolvedConfigurationArtifact["policy_pack"];
  audit_package_json: ResolvedConfigurationArtifact["audit_package"];
}

export interface PersistedCommitDiffRecord {
  run_id: string;
  previous_run_id: string | null;
  current_commit_sha: string | null;
  previous_commit_sha: string | null;
  comparison_mode: string;
  changed_files_json: unknown;
  stage_decisions_json: unknown;
  rationale_json: unknown;
}

export interface PersistedCorrectionPlanRecord {
  run_id: string;
  triggered: boolean;
  supervisor_action_count: number;
  requested_actions_json: unknown;
  rerun_json: unknown;
  merge_strategy: string;
  notes_json: unknown;
}

export interface PersistedCorrectionResultRecord {
  run_id: string;
  triggered: boolean;
  correction_pass_completed: boolean;
  merge_strategy: string;
  rerun_json: unknown;
  reused_json: unknown;
  merged_json: unknown;
  final_supervisor_action_count: number;
  notes_json: unknown;
}

export interface PersistedLaneReuseDecisionRecord {
  id: string;
  run_id: string;
  lane_name: string;
  decision: string;
  rationale_json: unknown;
}

export interface PersistedPersistenceSummaryRecord {
  run_id: string;
  mode: string;
  root: string;
}

export interface PersistedStageArtifactRecord {
  id: string;
  run_id: string;
  artifact_type: string;
  payload_json: unknown;
  created_at: string;
}

export interface PersistedStageExecutionRecord {
  id: string;
  run_id: string;
  stage_name: string;
  actor: string;
  status: string;
  reused_from_run_id: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  details_json: unknown;
}

export interface PersistedAgentInvocationRecord {
  id: string;
  run_id: string;
  stage_name: string | null;
  lane_name: string | null;
  agent_name: string;
  provider: string;
  model: string;
  status: string;
  attempts: number;
  context_bytes: number | null;
  user_prompt_bytes: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  started_at: string;
  completed_at: string;
  input_artifacts_json: unknown;
  output_artifact: string;
}

export interface PersistedLanePlanRecord {
  id: string;
  run_id: string;
  lane_name: string;
  controls_in_scope_json: unknown;
  evidence_requirements_json: unknown;
  allowed_tools_json: unknown;
  rationale_json: unknown;
  token_budget: number;
  rerun_budget: number;
}

export interface PersistedEvidenceRecord {
  id: string;
  run_id: string;
  lane_name: string | null;
  source_type: string;
  source_id: string;
  control_ids_json: unknown;
  summary: string;
  confidence: number;
  raw_artifact_path: string | null;
  locations_json: unknown;
  metadata_json: unknown;
}

export interface PersistedLaneResultRecord {
  id: string;
  run_id: string;
  lane_name: string;
  finding_ids_json: unknown;
  control_ids_json: unknown;
  evidence_used_json: unknown;
  summary_json: unknown;
}

export interface PersistedLaneSpecialistRecord {
  id: string;
  run_id: string;
  lane_name: string;
  agent_name: string;
  output_artifact: string;
  summary_json: unknown;
  observations_json: unknown;
  evidence_ids_json: unknown;
  tool_provider_ids_json: unknown;
}

export interface PersistedToolExecutionRecord {
  id: string;
  run_id: string;
  lane_name: string | null;
  provider_id: string;
  provider_kind: string;
  tool: string;
  status: string;
  exit_code: number | null;
  summary: string;
  command_json: unknown;
  artifact_type: string;
  artifact_path: string | null;
  parsed_json: unknown;
  normalized_json: unknown;
  adapter_json: unknown;
  stderr: string | null;
}

export interface PersistedFindingRecord {
  id: string;
  run_id: string;
  lane_name: string | null;
  title: string;
  severity: string;
  category: string;
  description: string;
  confidence: number;
  source: string;
  publication_state: string;
  needs_human_review: boolean;
  score_impact: number;
  control_ids_json: unknown;
  standards_refs_json: unknown;
  evidence_json: unknown;
  created_at: string;
}

export interface PersistedControlResultRecord {
  id: string;
  run_id: string;
  lane_name: string | null;
  control_id: string;
  framework: string;
  standard_ref: string;
  title: string;
  applicability: string;
  assessability: string;
  status: string;
  score_weight: number;
  max_score: number;
  score_awarded: number;
  rationale_json: unknown;
  evidence_json: unknown;
  finding_ids_json: unknown;
  sources_json: unknown;
}

export interface PersistedScoreSummaryRecord {
  run_id: string;
  methodology_version: string;
  overall_score: number;
  rating: string;
  leaderboard_summary: string;
  limitations_json: unknown;
}

export interface PersistedReviewDecisionRecord {
  run_id: string;
  publishability_status: string;
  human_review_required: boolean;
  public_summary_safe: boolean;
  threshold: string;
  rationale_json: unknown;
  gating_findings_json: unknown;
  recommended_visibility: string;
}

export interface PersistedSupervisorReviewRecord {
  run_id: string;
  summary_json: unknown;
  grader_outputs_json: unknown;
  actions_json: unknown;
  notes_json: unknown;
  final_review: boolean;
}

export interface PersistedRemediationMemoRecord {
  run_id: string;
  summary: string;
  checklist_json: unknown;
  human_review_required: boolean;
}

export interface PersistedReviewWorkflowRecord {
  run_id: string;
  workspace_id: string;
  project_id: string;
  status: HumanReviewStatus;
  human_review_required: boolean;
  publishability_status: string | null;
  recommended_visibility: string | null;
  opened_at: string;
  started_at: string | null;
  completed_at: string | null;
  current_reviewer_id: string | null;
  last_action_at: string | null;
  last_action_type: HumanReviewActionType | null;
  notes_json: unknown;
}

export interface PersistedReviewActionRecord {
  id: string;
  run_id: string;
  workspace_id: string;
  project_id: string;
  reviewer_id: string;
  assigned_reviewer_id: string | null;
  action_type: HumanReviewActionType;
  created_at: string;
  finding_id: string | null;
  previous_severity: string | null;
  updated_severity: string | null;
  visibility_override: string | null;
  notes: string | null;
  metadata_json: unknown;
}

export interface PersistedReviewNotificationRecord {
  id: string;
  run_id: string;
  workspace_id: string;
  project_id: string;
  reviewer_id: string;
  notification_type: "review_assigned" | "review_reassigned" | "review_rerun_required";
  status: "unread" | "acknowledged";
  message: string;
  created_at: string;
  acknowledged_at: string | null;
  metadata_json: unknown;
}

export interface PersistedWebhookDeliveryRecord {
  id: string;
  run_id: string;
  workspace_id: string;
  project_id: string;
  event_type: "run_completed" | "review_required" | "review_requires_rerun" | "outbound_delivery_sent" | "outbound_delivery_failed";
  target_url: string;
  status: "sent" | "failed";
  http_status: number | null;
  response_summary: string | null;
  attempted_at: string;
  triggered_by: string | null;
  payload_json: unknown;
}

export interface PersistedReviewCommentRecord {
  id: string;
  run_id: string;
  workspace_id: string;
  project_id: string;
  author_id: string;
  finding_id: string | null;
  body: string;
  created_at: string;
  metadata_json: unknown;
}

export interface PersistedFindingDispositionRecord {
  id: string;
  run_id: string;
  workspace_id: string;
  project_id: string;
  finding_id: string | null;
  finding_signature: string | null;
  disposition_type: "suppression" | "waiver";
  scope_level: "run" | "project";
  status: "active" | "revoked";
  reason: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  metadata_json: unknown;
}

export interface PersistedUiSettingsRecord {
  id: string;
  scope: "global" | "project";
  scope_id: string;
  workspace_id: string | null;
  project_id: string | null;
  updated_at: string;
  providers_json: unknown;
  credentials_json: unknown;
  audit_defaults_json: unknown;
  preflight_json: unknown;
  review_json: unknown;
  integrations_json: unknown;
  test_mode_json: unknown;
}

export interface PersistedUiDocumentRecord {
  id: string;
  scope: "workspace_project";
  scope_id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  document_type: "policy" | "reference" | "runbook" | "checklist";
  filename: string | null;
  media_type: string;
  content_text: string;
  notes: string | null;
  tags_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface PersistedProjectRecord {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  target_defaults_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface PersistedAsyncJobRecord {
  job_id: string;
  status: AsyncJobStatus;
  request_json: AuditRequest;
  db_mode: DatabaseMode;
  workspace_id: string;
  project_id: string;
  requested_by: string | null;
  current_run_id: string | null;
  latest_attempt_number: number;
  completion_webhook_url: string | null;
  completion_webhook_status: "pending" | "delivered" | "failed" | null;
  completion_webhook_last_attempt_at: string | null;
  completion_webhook_error: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
}

export interface PersistedRuntimeFollowupRecord {
  id: string;
  run_id: string;
  workspace_id: string;
  project_id: string;
  finding_id: string;
  finding_title: string | null;
  status: "pending" | "launched" | "completed" | "resolved" | "canceled";
  followup_policy: "rerun_in_capable_env" | "manual_runtime_review" | "runtime_validation_recommended";
  requested_by: string;
  requested_at: string;
  source_review_action_id: string | null;
  rerun_request_json: AuditRequest | null;
  linked_job_id: string | null;
  linked_run_id: string | null;
  launch_attempted_at: string | null;
  completed_at: string | null;
  completed_status: AsyncJobStatus | null;
  rerun_outcome: "pending" | "confirmed" | "not_reproduced" | "still_inconclusive";
  rerun_outcome_summary: string | null;
  rerun_outcome_finding_ids_json: unknown;
  rerun_reconciled_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_action_type: HumanReviewActionType | null;
  resolution_notes: string | null;
  metadata_json: unknown;
}

export interface PersistedAsyncJobAttemptRecord {
  id: string;
  job_id: string;
  attempt_number: number;
  run_id: string;
  status: AsyncJobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  retry_of_run_id: string | null;
}

export interface PersistedPolicyApplicationRecord {
  run_id: string;
  applied_suppressions_json: unknown;
  applied_waivers_json: unknown;
  effective_finding_ids_json: unknown;
  effective_control_ids_json: unknown;
  notes_json: unknown;
}

export interface PersistedDimensionScoreRecord {
  run_id: string;
  dimension: string;
  score: number;
  max_score: number;
  percentage: number;
  weight: number;
  assessed_controls: number;
  applicable_controls: number;
  control_ids_json: unknown;
  frameworks_json: unknown;
}

export interface PersistedMetricRecord {
  run_id: string;
  name: string;
  kind: string;
  value: number;
  count: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  tags_json: unknown;
}

export interface PersistedEventRecord extends HarnessEvent {}
export interface PersistedArtifactIndexRecord extends ArtifactRecord {
  sha256: string | null;
  size_bytes: number | null;
}

export interface PersistedAuditBundle {
  mode: DatabaseMode;
  package_definition: AuditPackageDefinition;
  target: PersistedTargetRecord;
  target_snapshot: PersistedTargetSnapshotRecord;
  target_summary: PersistedTargetSummaryRecord;
  policy_pack: PersistedPolicyPackRecord | null;
  run: PersistedRunRecord;
  resolved_configuration: PersistedResolvedConfigurationRecord;
  commit_diff: PersistedCommitDiffRecord;
  correction_plan: PersistedCorrectionPlanRecord | null;
  correction_result: PersistedCorrectionResultRecord | null;
  lane_reuse_decisions: PersistedLaneReuseDecisionRecord[];
  persistence_summary: PersistedPersistenceSummaryRecord | null;
  stage_artifacts?: PersistedStageArtifactRecord[];
  stage_executions: PersistedStageExecutionRecord[];
  lane_plans: PersistedLanePlanRecord[];
  evidence_records: PersistedEvidenceRecord[];
  lane_results: PersistedLaneResultRecord[];
  lane_specialists: PersistedLaneSpecialistRecord[];
  agent_invocations: PersistedAgentInvocationRecord[];
  tool_executions: PersistedToolExecutionRecord[];
  findings: PersistedFindingRecord[];
  control_results: PersistedControlResultRecord[];
  score_summary: PersistedScoreSummaryRecord;
  review_decision: PersistedReviewDecisionRecord;
  supervisor_review?: PersistedSupervisorReviewRecord | null;
  remediation_memo?: PersistedRemediationMemoRecord | null;
  review_workflow?: PersistedReviewWorkflowRecord | null;
  review_actions?: PersistedReviewActionRecord[];
  review_comments?: PersistedReviewCommentRecord[];
  finding_dispositions?: PersistedFindingDispositionRecord[];
  ui_settings?: PersistedUiSettingsRecord | null;
  ui_documents?: PersistedUiDocumentRecord[];
  policy_application: PersistedPolicyApplicationRecord;
  dimension_scores: PersistedDimensionScoreRecord[];
  metrics: PersistedMetricRecord[];
  events: PersistedEventRecord[];
  artifact_index: PersistedArtifactIndexRecord[];
}

export interface PersistenceStore {
  readonly mode: DatabaseMode;
  persistBundle(bundle: PersistedAuditBundle): Promise<{ root: string }>;
}
