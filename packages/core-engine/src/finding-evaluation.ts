import type { SandboxExecutionArtifact } from "./contracts.js";
import type { PersistedFindingDispositionRecord, PersistedFindingRecord, PersistedReviewActionRecord, PersistedReviewCommentRecord, PersistedReviewWorkflowRecord, PersistedRuntimeFollowupRecord, PersistedSupervisorReviewRecord } from "./persistence/contracts.js";
import { buildReviewSummary } from "./review-summary.js";

export interface SandboxExecutionSummary {
  readiness_status: "ready" | "ready_with_warnings" | "blocked";
  total_steps: number;
  completed_step_count: number;
  failed_step_count: number;
  blocked_step_count: number;
  skipped_step_count: number;
  execution_runtime: "container" | "host_probe" | "host_bounded" | "unconfigured" | "mixed";
  attention_required: boolean;
  attention_reasons: string[];
}

export interface FindingEvaluationRecord {
  finding_id: string;
  title: string;
  category: string;
  original_severity: string;
  current_severity: string;
  current_visibility: string;
  review_disposition: string;
  disposition_status: "active" | "expired" | "revoked" | "none";
  active_disposition_type: "suppression" | "waiver" | null;
  active_disposition_scope: "run" | "project" | null;
  active_disposition_reason: string | null;
  active_disposition_expires_at: string | null;
  active_disposition_due_soon: boolean;
  active_disposition_hours_until_expiry: number | null;
  active_disposition_owner_id: string | null;
  active_disposition_reviewed_at: string | null;
  active_disposition_review_due_by: string | null;
  disposition_review_reason: string | null;
  needs_disposition_review: boolean;
  confidence: number;
  evidence_sufficiency: "low" | "medium" | "high";
  false_positive_risk: "low" | "medium" | "high";
  runtime_validation_status: "validated" | "blocked" | "failed" | "recommended" | "not_applicable";
  runtime_followup_policy: "none" | "rerun_in_capable_env" | "manual_runtime_review" | "runtime_validation_recommended" | "not_applicable";
  runtime_followup_resolution: "none" | "rerun_requested" | "manual_review_completed" | "accepted_without_runtime_validation";
  runtime_followup_resolution_at: string | null;
  runtime_followup_resolution_by: string | null;
  runtime_followup_resolution_notes: string | null;
  runtime_followup_outcome: "none" | "pending" | "confirmed" | "not_reproduced" | "still_inconclusive";
  runtime_followup_outcome_summary: string | null;
  runtime_followup_linked_run_id: string | null;
  runtime_followup_linked_job_id: string | null;
  runtime_followup_reconciled_at: string | null;
  runtime_impact: "none" | "strengthened" | "weakened" | "generated";
  runtime_impact_reasons: string[];
  runtime_evidence_ids: string[];
  runtime_evidence_summaries: string[];
  evidence_quality_summary: string;
  validation_recommendation: "yes" | "no";
  validation_reasons: string[];
  duplicate_with_finding_ids: string[];
  conflict_with_finding_ids: string[];
  next_action: "ready_for_review" | "request_validation" | "deduplicate" | "review_conflict" | "manual_review" | "suppressed" | "waived" | "review_expired_disposition" | "rerun_in_capable_env";
  reasoning_summary: string;
}

export interface FindingEvaluationSummary {
  overall_evidence_sufficiency: "low" | "medium" | "high";
  overall_false_positive_risk: "low" | "medium" | "high";
  findings_needing_validation_count: number;
  duplicate_groups: string[][];
  conflict_pairs: Array<{ left_finding_id: string; right_finding_id: string; reason: string }>;
  sandbox_execution: SandboxExecutionSummary | null;
  runtime_validation_validated_count: number;
  runtime_validation_blocked_count: number;
  runtime_validation_failed_count: number;
  runtime_validation_recommended_count: number;
  runtime_validation_not_applicable_count: number;
  runtime_followup_required_count: number;
  runtime_followup_resolved_count: number;
  runtime_followup_rerun_requested_count: number;
  runtime_followup_completed_count: number;
  runtime_strengthened_finding_count: number;
  runtime_weakened_finding_count: number;
  runtime_generated_finding_count: number;
  runtime_validated_finding_count: number;
  suppressed_finding_count: number;
  waived_finding_count: number;
  expired_disposition_count: number;
  reopened_disposition_count: number;
  findings_needing_disposition_review_count: number;
  evaluations: FindingEvaluationRecord[];
}

type TriageLevel = "low" | "medium" | "high";

function normalizeTokens(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function tokenOverlap(left: string, right: string): boolean {
  const leftTokens = new Set(normalizeTokens(left));
  const rightTokens = new Set(normalizeTokens(right));
  if (!leftTokens.size || !rightTokens.size) return false;
  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) matches += 1;
  }
  return matches >= Math.min(2, Math.min(leftTokens.size, rightTokens.size));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function deriveEvidenceSufficiency(finding: PersistedFindingRecord): "low" | "medium" | "high" {
  const evidenceCount = asStringArray(finding.evidence_json).length;
  if (evidenceCount >= 3 && finding.confidence >= 0.8) return "high";
  if (evidenceCount >= 1 || finding.confidence >= 0.65) return "medium";
  return "low";
}

function parseTriageLevel(value: unknown, fallback: TriageLevel): TriageLevel {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

function compareSeverity(left: string, right: string): number {
  const ranking = ["info", "low", "medium", "high", "critical"];
  return Math.abs(ranking.indexOf(left) - ranking.indexOf(right));
}

function increaseTriageLevel(level: TriageLevel): TriageLevel {
  if (level === "low") return "medium";
  if (level === "medium") return "high";
  return "high";
}

function decreaseTriageLevel(level: TriageLevel): TriageLevel {
  if (level === "high") return "medium";
  if (level === "medium") return "low";
  return "low";
}

function isRuntimeGeneratedCategory(category: string): boolean {
  return [
    "runtime_validation",
    "runtime_install_failure",
    "runtime_build_failure",
    "runtime_test_failure",
    "runtime_service_unhealthy"
  ].includes(category);
}

function isRuntimeSensitiveFinding(finding: PersistedFindingRecord): boolean {
  const controls = new Set(asStringArray(finding.control_ids_json));
  if (controls.has("harness_internal.eval_harness_presence")) return true;
  if (controls.has("nist_ssdf.automated_security_checks")) return true;
  if (isRuntimeGeneratedCategory(String(finding.category ?? ""))) return true;
  const normalized = `${finding.title ?? ""} ${finding.category ?? ""} ${finding.description ?? ""}`.toLowerCase();
  return ["runtime", "service", "startup", "health", "probe", "build", "install", "test"].some((item) => normalized.includes(item));
}

function runtimeMetadata(record: Record<string, any>): Record<string, any> {
  return (record.metadata_json ?? record.metadata ?? {}) as Record<string, any>;
}

function resolveRuntimeFollowupResolution(actions: PersistedReviewActionRecord[]): {
  resolution: FindingEvaluationRecord["runtime_followup_resolution"];
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedNotes: string | null;
} {
  const related = [...actions].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
  let resolution: FindingEvaluationRecord["runtime_followup_resolution"] = "none";
  let resolvedAt: string | null = null;
  let resolvedBy: string | null = null;
  let resolvedNotes: string | null = null;
  for (const action of related) {
    if (action.action_type === "rerun_in_capable_env") {
      resolution = "rerun_requested";
      resolvedAt = action.created_at;
      resolvedBy = action.reviewer_id;
      resolvedNotes = action.notes ?? null;
    } else if (action.action_type === "mark_manual_runtime_review_complete") {
      resolution = "manual_review_completed";
      resolvedAt = action.created_at;
      resolvedBy = action.reviewer_id;
      resolvedNotes = action.notes ?? null;
    } else if (action.action_type === "accept_without_runtime_validation") {
      resolution = "accepted_without_runtime_validation";
      resolvedAt = action.created_at;
      resolvedBy = action.reviewer_id;
      resolvedNotes = action.notes ?? null;
    }
  }
  return { resolution, resolvedAt, resolvedBy, resolvedNotes };
}

function collectRelatedRuntimeEvidence(args: {
  finding: PersistedFindingRecord;
  runtimeEvidenceRecords: Array<Record<string, any>>;
  conflicts: Map<string, Array<{ other: string; reason: string }>>;
  duplicates: Map<string, Set<string>>;
}): Array<Record<string, any>> {
  const findingControls = new Set(asStringArray(args.finding.control_ids_json));
  const duplicateIds = args.duplicates.get(args.finding.id) ?? new Set<string>();
  const conflictIds = new Set((args.conflicts.get(args.finding.id) ?? []).map((item) => item.other));
  return args.runtimeEvidenceRecords.filter((record) => {
    const recordControls = new Set(asStringArray(record.control_ids_json ?? record.control_ids));
    const overlappingControls = [...findingControls].some((item) => recordControls.has(item));
    if (overlappingControls) return true;
    const summary = String(record.summary ?? "");
    const metadata = runtimeMetadata(record);
    const category = String(args.finding.category ?? "");
    if (isRuntimeGeneratedCategory(category) && metadata.phase) {
      const phase = String(metadata.phase);
      if (category === "runtime_service_unhealthy" && phase === "runtime_probe") return true;
      if (category === "runtime_build_failure" && phase === "build") return true;
      if (category === "runtime_test_failure" && phase === "test") return true;
      if (category === "runtime_install_failure" && phase === "install") return true;
      if (category === "runtime_validation") return true;
    }
    if (duplicateIds.size > 0 || conflictIds.size > 0) {
      const normalizedTitle = String(args.finding.title ?? "");
      if (tokenOverlap(summary, normalizedTitle)) return true;
    }
    return false;
  });
}

export function summarizeSandboxExecution(artifact: SandboxExecutionArtifact | null | undefined): SandboxExecutionSummary | null {
  if (!artifact) return null;
  const results = Array.isArray(artifact.results) ? artifact.results : [];
  const runtimes = [...new Set(results.map((item) => item.execution_runtime).filter(Boolean))];
  const completedStepCount = results.filter((item) => item.status === "completed").length;
  const failedStepCount = results.filter((item) => item.status === "failed").length;
  const blockedStepCount = results.filter((item) => item.status === "blocked").length;
  const skippedStepCount = results.filter((item) => item.status === "skipped").length;
  const attentionReasons: string[] = [];
  if (artifact.readiness_status === "blocked") attentionReasons.push("sandbox execution plan was blocked before bounded runtime validation could complete");
  if (failedStepCount > 0) attentionReasons.push(`${failedStepCount} bounded sandbox step(s) failed during execution`);
  if (blockedStepCount > 0) attentionReasons.push(`${blockedStepCount} bounded sandbox step(s) were blocked by runtime or host constraints`);
  if (Array.isArray(artifact.plan?.warnings) && artifact.plan.warnings.length > 0) {
    attentionReasons.push(...artifact.plan.warnings.map((item) => String(item)));
  }
  const normalizedArtifactRuntime = artifact.runtime === "docker" || artifact.runtime === "podman"
    ? "container"
    : artifact.runtime ?? "unconfigured";
  return {
    readiness_status: artifact.readiness_status,
    total_steps: results.length,
    completed_step_count: completedStepCount,
    failed_step_count: failedStepCount,
    blocked_step_count: blockedStepCount,
    skipped_step_count: skippedStepCount,
    execution_runtime: runtimes.length === 1
      ? (runtimes[0] as SandboxExecutionSummary["execution_runtime"])
      : runtimes.length > 1
        ? "mixed"
        : normalizedArtifactRuntime,
    attention_required: attentionReasons.length > 0,
    attention_reasons: [...new Set(attentionReasons)]
  };
}

export function buildFindingEvaluationSummary(args: {
  findings: PersistedFindingRecord[];
  supervisorReview: PersistedSupervisorReviewRecord | null;
  workflow: PersistedReviewWorkflowRecord | null;
  actions: PersistedReviewActionRecord[];
  comments?: PersistedReviewCommentRecord[];
  dispositions?: PersistedFindingDispositionRecord[];
  sandboxExecution?: SandboxExecutionArtifact | null;
  evidenceRecords?: Array<Record<string, any>>;
  runtimeFollowups?: PersistedRuntimeFollowupRecord[];
}): FindingEvaluationSummary {
  const reviewSummary = buildReviewSummary({
    workflow: args.workflow,
    findings: args.findings,
    actions: args.actions,
    comments: args.comments
    ,
    dispositions: args.dispositions
  });
  const graderOutputs = Array.isArray(args.supervisorReview?.grader_outputs_json)
    ? args.supervisorReview?.grader_outputs_json as Array<Record<string, unknown>>
    : [];
  const graderByFinding = new Map(graderOutputs.map((item) => [String(item.finding_id), item]));
  const sandboxSummary = summarizeSandboxExecution(args.sandboxExecution);
  const runtimeEvidenceRecords = Array.isArray(args.evidenceRecords)
    ? args.evidenceRecords
    : [];
  const runtimeFollowupsByFinding = new Map(
    (Array.isArray(args.runtimeFollowups) ? args.runtimeFollowups : [])
      .map((item) => [item.finding_id, item] as const)
  );

  const duplicates = new Map<string, Set<string>>();
  const conflicts = new Map<string, Array<{ other: string; reason: string }>>();
  for (let i = 0; i < args.findings.length; i += 1) {
    for (let j = i + 1; j < args.findings.length; j += 1) {
      const left = args.findings[i]!;
      const right = args.findings[j]!;
      const leftControls = new Set(asStringArray(left.control_ids_json));
      const rightControls = new Set(asStringArray(right.control_ids_json));
      const overlappingControls = [...leftControls].filter((item) => rightControls.has(item));
      const similarTitle = tokenOverlap(left.title, right.title);
      const sameCategory = left.category === right.category;
      if ((sameCategory && similarTitle) || (overlappingControls.length > 0 && similarTitle)) {
        duplicates.set(left.id, new Set([...(duplicates.get(left.id) ?? []), right.id]));
        duplicates.set(right.id, new Set([...(duplicates.get(right.id) ?? []), left.id]));
      }
      if (overlappingControls.length > 0 && (compareSeverity(left.severity, right.severity) >= 2 || left.publication_state !== right.publication_state)) {
        const reason = left.publication_state !== right.publication_state
          ? "linked controls have conflicting visibility/publication posture"
          : "linked controls have materially different severity outcomes";
        conflicts.set(left.id, [...(conflicts.get(left.id) ?? []), { other: right.id, reason }]);
        conflicts.set(right.id, [...(conflicts.get(right.id) ?? []), { other: left.id, reason }]);
      }
    }
  }

  const evaluations = args.findings.map((finding) => {
    const reviewFinding = reviewSummary.finding_summaries.find((item) => item.finding_id === finding.id) ?? null;
    const relatedReviewActions = args.actions.filter((action) => action.finding_id === finding.id);
    const runtimeFollowup = runtimeFollowupsByFinding.get(finding.id) ?? null;
    const grade = graderByFinding.get(finding.id);
    let evidenceSufficiency: TriageLevel = parseTriageLevel(grade?.evidence_sufficiency, deriveEvidenceSufficiency(finding));
    let falsePositiveRisk: TriageLevel = parseTriageLevel(
      grade?.false_positive_risk,
      finding.confidence >= 0.85 ? "low" : finding.confidence >= 0.65 ? "medium" : "high"
    );
    const relatedRuntimeEvidence = collectRelatedRuntimeEvidence({
      finding,
      runtimeEvidenceRecords,
      conflicts,
      duplicates
    });
    const relatedRuntimeCompleted = relatedRuntimeEvidence.filter((item) => runtimeMetadata(item).status === "completed");
    const relatedRuntimeBlocked = relatedRuntimeEvidence.filter((item) => runtimeMetadata(item).status === "blocked");
    const relatedRuntimeFailed = relatedRuntimeEvidence.filter((item) => runtimeMetadata(item).status === "failed");
    const runtimeSensitive = isRuntimeSensitiveFinding(finding);
    const runtimeImpactReasons: string[] = [];
    let runtimeImpact: FindingEvaluationRecord["runtime_impact"] = "none";
    if (relatedRuntimeCompleted.length > 0) {
      runtimeImpact = isRuntimeGeneratedCategory(finding.category) ? "generated" : "strengthened";
      evidenceSufficiency = increaseTriageLevel(evidenceSufficiency);
      falsePositiveRisk = decreaseTriageLevel(falsePositiveRisk);
      runtimeImpactReasons.push(`bounded runtime validation produced ${relatedRuntimeCompleted.length} completed step(s) directly relevant to this finding`);
    }
    if (relatedRuntimeFailed.length > 0 || relatedRuntimeBlocked.length > 0) {
      if (isRuntimeGeneratedCategory(finding.category)) runtimeImpact = "generated";
      else if (runtimeImpact === "none") runtimeImpact = "strengthened";
      evidenceSufficiency = increaseTriageLevel(evidenceSufficiency);
      runtimeImpactReasons.push(`bounded runtime validation reported ${relatedRuntimeFailed.length + relatedRuntimeBlocked.length} failed or blocked step(s) linked to this finding`);
    }
    if (!relatedRuntimeEvidence.length && sandboxSummary?.attention_required && runtimeSensitive) {
      runtimeImpact = runtimeImpact === "none" ? "weakened" : runtimeImpact;
      runtimeImpactReasons.push("no direct runtime validation evidence was captured for this finding while sandbox execution still required attention");
    }
    const validationReasons: string[] = [];
    const duplicateWith = [...(duplicates.get(finding.id) ?? [])];
    const conflictWith = [...new Set((conflicts.get(finding.id) ?? []).map((item) => item.other))];
    const explicitValidation = grade?.validation_recommendation === "yes";
    if (explicitValidation) validationReasons.push("supervisor recommended additional validation");
    if (reviewFinding?.disposition === "needs_validation") validationReasons.push("review workflow still requests validation");
    if (evidenceSufficiency === "low") validationReasons.push("evidence sufficiency is low");
    if (falsePositiveRisk === "high") validationReasons.push("false-positive risk remains high");
    if (conflictWith.length) validationReasons.push("conflicting finding outcomes should be reconciled");
    if (duplicateWith.length) validationReasons.push("possible duplicate findings should be deduplicated");
    if (sandboxSummary?.attention_required) validationReasons.push("bounded sandbox execution did not complete cleanly for this run");
    if (runtimeImpact === "weakened") validationReasons.push("runtime validation did not produce direct evidence strong enough to close uncertainty for this finding");
    if (reviewFinding?.needs_disposition_review) validationReasons.push("an existing suppression or waiver expired and needs explicit re-review");
    const validationRecommendation: "yes" | "no" = validationReasons.length ? "yes" : "no";
    let runtimeValidationStatus: FindingEvaluationRecord["runtime_validation_status"] = "not_applicable";
    let runtimeFollowupPolicy: FindingEvaluationRecord["runtime_followup_policy"] = runtimeSensitive ? "runtime_validation_recommended" : "not_applicable";
    if (runtimeSensitive) {
      if (relatedRuntimeBlocked.length > 0 || (sandboxSummary?.blocked_step_count ?? 0) > 0) {
        runtimeValidationStatus = "blocked";
        runtimeFollowupPolicy = "rerun_in_capable_env";
      } else if (relatedRuntimeFailed.length > 0) {
        runtimeValidationStatus = "failed";
        runtimeFollowupPolicy = "manual_runtime_review";
      } else if (relatedRuntimeCompleted.length > 0) {
        runtimeValidationStatus = "validated";
        runtimeFollowupPolicy = "none";
      } else {
        runtimeValidationStatus = "recommended";
        runtimeFollowupPolicy = "runtime_validation_recommended";
      }
    }
    const runtimeResolution = resolveRuntimeFollowupResolution(relatedReviewActions);
    const runtimeFollowupOutcome: FindingEvaluationRecord["runtime_followup_outcome"] = runtimeFollowup
      ? runtimeFollowup.rerun_outcome
      : "none";
    if (runtimeFollowup) {
      runtimeFollowupPolicy = runtimeFollowup.followup_policy;
      if (runtimeFollowupOutcome === "confirmed" || runtimeFollowupOutcome === "not_reproduced") {
        runtimeValidationStatus = "validated";
      }
    }
    let nextAction: FindingEvaluationRecord["next_action"] = "ready_for_review";
    if (reviewFinding?.disposition === "suppressed") nextAction = "suppressed";
    else if (reviewFinding?.disposition === "waived") nextAction = "waived";
    else if (reviewFinding?.needs_disposition_review) nextAction = "review_expired_disposition";
    else if (runtimeFollowupPolicy === "rerun_in_capable_env") {
      nextAction = runtimeFollowupOutcome !== "none" && runtimeFollowupOutcome !== "pending"
        ? "manual_review"
        : "rerun_in_capable_env";
    } else if (runtimeFollowupPolicy === "manual_runtime_review") {
      nextAction = ["manual_review_completed", "accepted_without_runtime_validation"].includes(runtimeResolution.resolution)
        ? "ready_for_review"
        : "request_validation";
    } else if (runtimeFollowupPolicy === "runtime_validation_recommended") {
      nextAction = runtimeResolution.resolution === "accepted_without_runtime_validation"
        ? "ready_for_review"
        : "request_validation";
    } else if (validationRecommendation === "yes") nextAction = "request_validation";
    else if (duplicateWith.length) nextAction = "deduplicate";
    else if (conflictWith.length) nextAction = "review_conflict";
    else if (falsePositiveRisk === "high") nextAction = "manual_review";
    const evidenceCount = asStringArray(finding.evidence_json).length;
    const evidenceQualitySummary = grade?.reasoning_summary
      ? String(grade.reasoning_summary)
      : `Derived from ${evidenceCount} persisted evidence item(s) with ${Math.round(finding.confidence * 100)}% confidence.`;
    const runtimeEvidenceSummaries = relatedRuntimeEvidence.map((item) => String(item.summary ?? "")).filter(Boolean);
    const runtimeEvidenceIds = relatedRuntimeEvidence.map((item) => String(item.evidence_id ?? item.id ?? "")).filter(Boolean);
    return {
      finding_id: finding.id,
      title: finding.title,
      category: finding.category,
      original_severity: finding.severity,
      current_severity: reviewFinding?.current_severity ?? finding.severity,
      current_visibility: reviewFinding?.current_visibility ?? finding.publication_state,
      review_disposition: reviewFinding?.disposition ?? "open",
      disposition_status: reviewFinding?.disposition_status ?? "none",
      active_disposition_type: reviewFinding?.active_disposition_type ?? null,
      active_disposition_scope: reviewFinding?.active_disposition_scope ?? null,
      active_disposition_reason: reviewFinding?.active_disposition_reason ?? null,
      active_disposition_expires_at: reviewFinding?.active_disposition_expires_at ?? null,
      active_disposition_due_soon: reviewFinding?.active_disposition_due_soon ?? false,
      active_disposition_hours_until_expiry: reviewFinding?.active_disposition_hours_until_expiry ?? null,
      active_disposition_owner_id: reviewFinding?.active_disposition_owner_id ?? null,
      active_disposition_reviewed_at: reviewFinding?.active_disposition_reviewed_at ?? null,
      active_disposition_review_due_by: reviewFinding?.active_disposition_review_due_by ?? null,
      disposition_review_reason: reviewFinding?.disposition_review_reason ?? null,
      needs_disposition_review: reviewFinding?.needs_disposition_review ?? false,
      confidence: finding.confidence,
      evidence_sufficiency: evidenceSufficiency,
      false_positive_risk: falsePositiveRisk,
      runtime_validation_status: runtimeValidationStatus,
      runtime_followup_policy: runtimeFollowupPolicy,
      runtime_followup_resolution: runtimeResolution.resolution,
      runtime_followup_resolution_at: runtimeResolution.resolvedAt,
      runtime_followup_resolution_by: runtimeResolution.resolvedBy,
      runtime_followup_resolution_notes: runtimeResolution.resolvedNotes,
      runtime_followup_outcome: runtimeFollowupOutcome,
      runtime_followup_outcome_summary: runtimeFollowup?.rerun_outcome_summary ?? null,
      runtime_followup_linked_run_id: runtimeFollowup?.linked_run_id ?? null,
      runtime_followup_linked_job_id: runtimeFollowup?.linked_job_id ?? null,
      runtime_followup_reconciled_at: runtimeFollowup?.rerun_reconciled_at ?? null,
      runtime_impact: runtimeImpact,
      runtime_impact_reasons: runtimeImpactReasons,
      runtime_evidence_ids: runtimeEvidenceIds,
      runtime_evidence_summaries: runtimeEvidenceSummaries,
      evidence_quality_summary: evidenceQualitySummary,
      validation_recommendation: validationRecommendation,
      validation_reasons: validationReasons,
      duplicate_with_finding_ids: duplicateWith,
      conflict_with_finding_ids: conflictWith,
      next_action: nextAction,
      reasoning_summary: grade?.reasoning_summary ? String(grade.reasoning_summary) : evidenceQualitySummary
    };
  });

  const severityRank: Record<TriageLevel, number> = { low: 1, medium: 2, high: 3 };
  const overallEvidence = (args.supervisorReview?.summary_json as Record<string, unknown> | null)?.overall_evidence_sufficiency;
  const overallFalsePositive = (args.supervisorReview?.summary_json as Record<string, unknown> | null)?.overall_false_positive_risk;

  return {
    overall_evidence_sufficiency: parseTriageLevel(
      overallEvidence,
      evaluations.reduce<TriageLevel>((current, item) => severityRank[item.evidence_sufficiency] < severityRank[current] ? item.evidence_sufficiency : current, "high")
    ),
    overall_false_positive_risk: parseTriageLevel(
      overallFalsePositive,
      evaluations.reduce<TriageLevel>((current, item) => severityRank[item.false_positive_risk] > severityRank[current] ? item.false_positive_risk : current, "low")
    ),
    findings_needing_validation_count: evaluations.filter((item) => item.validation_recommendation === "yes").length,
    duplicate_groups: [...duplicates.entries()]
      .filter(([_, related]) => related.size > 0)
      .map(([findingId, related]) => [findingId, ...related].sort())
      .filter((group, index, all) => all.findIndex((candidate) => candidate.join("|") === group.join("|")) === index),
    conflict_pairs: [...conflicts.entries()].flatMap(([findingId, related]) =>
      related
        .filter((item) => findingId < item.other)
        .map((item) => ({ left_finding_id: findingId, right_finding_id: item.other, reason: item.reason }))
    ),
    sandbox_execution: sandboxSummary,
    runtime_validation_validated_count: evaluations.filter((item) => item.runtime_validation_status === "validated").length,
    runtime_validation_blocked_count: evaluations.filter((item) => item.runtime_validation_status === "blocked").length,
    runtime_validation_failed_count: evaluations.filter((item) => item.runtime_validation_status === "failed").length,
    runtime_validation_recommended_count: evaluations.filter((item) => item.runtime_validation_status === "recommended").length,
    runtime_validation_not_applicable_count: evaluations.filter((item) => item.runtime_validation_status === "not_applicable").length,
    runtime_followup_required_count: evaluations.filter((item) => {
      if (item.runtime_followup_policy === "none" || item.runtime_followup_policy === "not_applicable") return false;
      if (item.runtime_followup_policy === "rerun_in_capable_env") return true;
      if (item.runtime_followup_policy === "manual_runtime_review") {
        return !["manual_review_completed", "accepted_without_runtime_validation"].includes(item.runtime_followup_resolution);
      }
      if (item.runtime_followup_policy === "runtime_validation_recommended") {
        return item.runtime_followup_resolution !== "accepted_without_runtime_validation";
      }
      return true;
    }).length,
    runtime_followup_resolved_count: evaluations.filter((item) => item.runtime_followup_resolution !== "none").length,
    runtime_followup_rerun_requested_count: evaluations.filter((item) => item.runtime_followup_resolution === "rerun_requested").length,
    runtime_followup_completed_count: evaluations.filter((item) => item.runtime_followup_outcome !== "none" && item.runtime_followup_outcome !== "pending").length,
    runtime_strengthened_finding_count: evaluations.filter((item) => item.runtime_impact === "strengthened").length,
    runtime_weakened_finding_count: evaluations.filter((item) => item.runtime_impact === "weakened").length,
    runtime_generated_finding_count: evaluations.filter((item) => item.runtime_impact === "generated").length,
    runtime_validated_finding_count: evaluations.filter((item) => item.runtime_evidence_ids.length > 0).length,
    suppressed_finding_count: evaluations.filter((item) => item.review_disposition === "suppressed").length,
    waived_finding_count: evaluations.filter((item) => item.review_disposition === "waived").length,
    expired_disposition_count: evaluations.filter((item) => item.disposition_status === "expired").length,
    reopened_disposition_count: evaluations.filter((item) => item.needs_disposition_review && item.disposition_status !== "expired").length,
    findings_needing_disposition_review_count: evaluations.filter((item) => item.needs_disposition_review).length,
    evaluations
  };
}
