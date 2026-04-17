export type ArtifactDisposition = "queryable_persisted" | "artifact_only";

export interface ArtifactPolicy {
  disposition: ArtifactDisposition;
  persisted_table: string | null;
  rationale: string;
}

const exactPolicies = new Map<string, ArtifactPolicy>([
  ["resolved-config", { disposition: "queryable_persisted", persisted_table: "resolved_configurations", rationale: "Normalized run configuration is persisted and queryable." }],
  ["commit-diff", { disposition: "queryable_persisted", persisted_table: "commit_diffs", rationale: "Commit diff state is normalized for reruns and query APIs." }],
  ["preflight-summary", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Preflight planning state is persisted as a normalized stage artifact for planned-versus-executed inspection." }],
  ["launch-intent", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Launch intent is persisted as a normalized stage artifact to capture approved operator posture at submission time." }],
  ["sandbox-execution", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Sandbox execution plan/results are persisted as a normalized stage artifact for runtime execution inspection." }],
  ["outbound-approval", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Outbound approval is persisted as a normalized stage artifact so external-sharing approval is auditable per run." }],
  ["outbound-send", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Latest outbound send/preparation record is persisted as a normalized stage artifact for outbound audit history." }],
  ["outbound-verification", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Repository verification is persisted as a normalized stage artifact so write-access checks are auditable per run." }],
  ["outbound-delivery", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Outbound delivery results are persisted as a normalized stage artifact for integration audit history." }],
  ["planner-artifact", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Planner output is normalized as a reusable stage artifact." }],
  ["target-profile", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Target profile is normalized as a reusable stage artifact." }],
  ["threat-model", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Threat model output is normalized as a reusable stage artifact." }],
  ["eval-selection", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Eval selection output is normalized as a reusable stage artifact." }],
  ["run-plan", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Run plan is normalized as a reusable stage artifact." }],
  ["lane-plans", { disposition: "queryable_persisted", persisted_table: "lane_plans", rationale: "Lane plans are persisted in normalized query tables." }],
  ["lane-reuse-decisions", { disposition: "queryable_persisted", persisted_table: "lane_reuse_decisions", rationale: "Lane reuse decisions are normalized for selective reruns and history." }],
  ["tool-executions", { disposition: "queryable_persisted", persisted_table: "tool_executions", rationale: "Tool execution records are persisted in normalized query tables." }],
  ["evidence-executions", { disposition: "queryable_persisted", persisted_table: "tool_executions", rationale: "Evidence execution artifacts mirror persisted tool execution records." }],
  ["evidence-records", { disposition: "queryable_persisted", persisted_table: "evidence_records", rationale: "Evidence records are persisted in normalized query tables." }],
  ["lane-results", { disposition: "queryable_persisted", persisted_table: "lane_results", rationale: "Lane results are persisted in normalized query tables." }],
  ["lane-specialists", { disposition: "queryable_persisted", persisted_table: "lane_specialists", rationale: "Lane specialist outputs are persisted in normalized query tables." }],
  ["control-results", { disposition: "queryable_persisted", persisted_table: "control_results", rationale: "Control results are persisted in normalized query tables." }],
  ["findings-pre-skeptic", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Pre-skeptic findings are normalized as a reusable stage artifact." }],
  ["score-summary", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Intermediate score summary is normalized as a reusable stage artifact." }],
  ["stage-executions", { disposition: "queryable_persisted", persisted_table: "stage_executions", rationale: "Stage execution records are persisted in normalized query tables." }],
  ["correction-plan", { disposition: "queryable_persisted", persisted_table: "correction_plans", rationale: "Correction plans are persisted in normalized query tables." }],
  ["correction-result", { disposition: "queryable_persisted", persisted_table: "correction_results", rationale: "Correction results are persisted in normalized query tables." }],
  ["findings-pre-policy", { disposition: "artifact_only", persisted_table: null, rationale: "Pre-policy findings remain archival debug output for audit review." }],
  ["control-results-pre-policy", { disposition: "artifact_only", persisted_table: null, rationale: "Pre-policy control results remain archival debug output for audit review." }],
  ["policy-application", { disposition: "queryable_persisted", persisted_table: "policy_applications", rationale: "Policy application is persisted in normalized query tables." }],
  ["findings", { disposition: "queryable_persisted", persisted_table: "findings", rationale: "Final findings are persisted in normalized query tables." }],
  ["final-control-results", { disposition: "queryable_persisted", persisted_table: "control_results", rationale: "Final control result artifacts mirror persisted control result records." }],
  ["observations", { disposition: "queryable_persisted", persisted_table: "stage_artifacts", rationale: "Observations remain persisted as normalized stage artifacts for reruns/debug." }],
  ["final-score-summary", { disposition: "queryable_persisted", persisted_table: "score_summaries", rationale: "Final score summaries are persisted in normalized query tables." }],
  ["dimension-scores", { disposition: "queryable_persisted", persisted_table: "dimension_scores", rationale: "Dimension scores are persisted in normalized query tables." }],
  ["static-score", { disposition: "artifact_only", persisted_table: null, rationale: "Static score snapshot is a derived archival convenience artifact." }],
  ["skeptic-review", { disposition: "queryable_persisted", persisted_table: "supervisor_reviews", rationale: "Supervisor review is persisted in a normalized query table." }],
  ["skeptic-review-final", { disposition: "queryable_persisted", persisted_table: "supervisor_reviews", rationale: "Final supervisor review is persisted in a normalized query table." }],
  ["remediation", { disposition: "queryable_persisted", persisted_table: "remediation_memos", rationale: "Remediation memo is persisted in a normalized query table." }],
  ["publishability", { disposition: "queryable_persisted", persisted_table: "review_decisions", rationale: "Publishability decisions are persisted in normalized query tables." }],
  ["agent-config-summary", { disposition: "artifact_only", persisted_table: null, rationale: "Agent config summary remains archival/debug JSON for runtime inspection." }],
  ["agent-invocations", { disposition: "queryable_persisted", persisted_table: "agent_invocations", rationale: "Agent invocations are persisted in normalized query tables." }],
  ["handoffs", { disposition: "artifact_only", persisted_table: null, rationale: "Handoff records remain archival/debug JSON for agent trace inspection." }],
  ["trace", { disposition: "artifact_only", persisted_table: null, rationale: "Execution trace remains archival/debug JSON for step-by-step inspection." }],
  ["events", { disposition: "queryable_persisted", persisted_table: "events", rationale: "Event streams are persisted in normalized query tables." }],
  ["metrics", { disposition: "queryable_persisted", persisted_table: "metrics", rationale: "Metrics are persisted in normalized query tables." }],
  ["persistence-summary", { disposition: "queryable_persisted", persisted_table: "persistence_summaries", rationale: "Persistence summaries are persisted in normalized query tables." }],
  ["sandbox", { disposition: "artifact_only", persisted_table: null, rationale: "Sandbox metadata remains archival/debug JSON for execution context inspection." }],
  ["target", { disposition: "artifact_only", persisted_table: null, rationale: "Target descriptor JSON remains an archival/debug snapshot; normalized target state is persisted separately." }],
  ["analysis", { disposition: "artifact_only", persisted_table: null, rationale: "Analysis summary remains archival/debug JSON; durable query surfaces use normalized target summary fields." }],
  ["repo-context", { disposition: "artifact_only", persisted_table: null, rationale: "Repo-context excerpts remain archival/debug JSON." }],
  ["methodology", { disposition: "artifact_only", persisted_table: null, rationale: "Methodology artifacts remain archival/debug JSON." }],
  ["static-baseline", { disposition: "artifact_only", persisted_table: null, rationale: "Static baseline methodology remains archival/debug JSON." }],
  ["audit-policy", { disposition: "artifact_only", persisted_table: null, rationale: "Audit policy artifacts remain archival/debug JSON aside from normalized applied policy outputs." }],
  ["planner-artifact-corrected", { disposition: "artifact_only", persisted_table: null, rationale: "Corrected planner artifacts remain archival/debug deltas while the canonical reusable planner artifact is persisted." }],
  ["eval-selection-corrected", { disposition: "artifact_only", persisted_table: null, rationale: "Corrected eval-selection artifacts remain archival/debug deltas while the canonical reusable selection artifact is persisted." }]
]);

export function describeArtifactType(type: string): ArtifactPolicy {
  const exact = exactPolicies.get(type);
  if (exact) return exact;
  if (type.startsWith("lane-specialist-")) {
    return {
      disposition: "artifact_only",
      persisted_table: null,
      rationale: "Per-lane specialist JSON remains archival/debug output; normalized specialist summaries are persisted separately."
    };
  }
  return {
    disposition: "artifact_only",
    persisted_table: null,
    rationale: "Unclassified artifacts default to archival/debug handling until explicitly normalized."
  };
}
