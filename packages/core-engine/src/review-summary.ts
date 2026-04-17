import type { PersistedFindingDispositionRecord, PersistedFindingRecord, PersistedReviewActionRecord, PersistedReviewCommentRecord, PersistedReviewWorkflowRecord } from "./persistence/contracts.js";
import { resolveFindingDispositions } from "./persistence/finding-dispositions.js";

export type FindingReviewDisposition = "open" | "confirmed" | "suppressed" | "waived" | "downgraded" | "needs_validation";

export interface FindingReviewSummary {
  finding_id: string;
  title: string;
  original_severity: string;
  current_severity: string;
  current_visibility: string;
  disposition: FindingReviewDisposition;
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
  needs_human_review: boolean;
  last_action_at: string | null;
  last_action_type: string | null;
  last_reviewer_id: string | null;
  notes: string[];
}

export interface ReviewHandoffSummary {
  status: string;
  current_reviewer_id: string | null;
  unresolved_finding_count: number;
  unresolved_finding_ids: string[];
  expired_disposition_count: number;
  due_soon_disposition_count: number;
  reopened_disposition_count: number;
  findings_needing_disposition_review_count: number;
  due_soon_disposition_ids: string[];
  due_soon_by_owner: Array<{ owner_id: string; count: number; next_review_due_at: string | null }>;
  findings_needing_disposition_review_ids: string[];
  next_disposition_expiry_at: string | null;
  next_disposition_review_due_at: string | null;
  latest_notes: string[];
  latest_comments: string[];
  last_action_at: string | null;
  last_action_type: string | null;
  opened_at: string | null;
  age_hours: number;
}

export interface ReviewSummary {
  workflow: PersistedReviewWorkflowRecord | null;
  handoff: ReviewHandoffSummary;
  finding_summaries: FindingReviewSummary[];
  recent_comments: PersistedReviewCommentRecord[];
  suppression_count: number;
  waiver_count: number;
  expired_disposition_count: number;
  due_soon_disposition_count: number;
  reopened_disposition_count: number;
  findings_needing_disposition_review_count: number;
}

function hoursSince(value: string | null | undefined): number {
  if (!value) return 0;
  return Math.max(0, Math.round(((Date.now() - new Date(value).getTime()) / 36e5) * 10) / 10);
}

function hoursUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.round((((new Date(value).getTime()) - Date.now()) / 36e5) * 10) / 10;
}

function configuredDueSoonHours(reviewDueBy: string | null | undefined, expiresAt: string | null | undefined): string | null {
  return reviewDueBy || expiresAt || null;
}

export function buildReviewSummary(args: {
  workflow: PersistedReviewWorkflowRecord | null;
  findings: PersistedFindingRecord[];
  actions: PersistedReviewActionRecord[];
  comments?: PersistedReviewCommentRecord[];
  dispositions?: PersistedFindingDispositionRecord[];
}): ReviewSummary {
  const resolvedDispositions = resolveFindingDispositions({
    findings: args.findings,
    dispositions: args.dispositions ?? []
  });
  const findingSummaries = args.findings.map((finding) => {
    const related = args.actions.filter((action) => action.finding_id === finding.id);
    const notes = related.map((action) => action.notes).filter((item): item is string => Boolean(item));
    const latest = related.length ? related[related.length - 1] : null;
    const resolvedDisposition = resolvedDispositions.find((item) => item.finding_id === finding.id) ?? null;
    const dispositionRecord = resolvedDisposition?.effective_disposition ?? null;
    const dispositionStatus = resolvedDisposition?.effective_status ?? "none";
    const dispositionReviewDueAt = configuredDueSoonHours(resolvedDisposition?.governance_review_due_by ?? null, dispositionRecord?.expires_at ?? null);
    const dispositionHoursUntilExpiry = hoursUntil(dispositionReviewDueAt);
    const dispositionDueSoon = dispositionStatus === "active"
      && dispositionHoursUntilExpiry !== null
      && dispositionHoursUntilExpiry >= 0
      && dispositionHoursUntilExpiry <= 72;
    let disposition: FindingReviewDisposition = "open";
    let currentSeverity = finding.severity;
    let currentVisibility = finding.publication_state;

    for (const action of related) {
      if (action.action_type === "confirm_finding") disposition = "confirmed";
      if (action.action_type === "suppress_finding") disposition = "suppressed";
      if (action.action_type === "request_validation") disposition = "needs_validation";
      if (action.action_type === "downgrade_severity") {
        disposition = "downgraded";
        currentSeverity = action.updated_severity ?? currentSeverity;
      }
      if (action.visibility_override) {
        currentVisibility = action.visibility_override;
      }
    }
    if (dispositionRecord?.disposition_type === "waiver") disposition = "waived";
    if (dispositionRecord?.disposition_type === "suppression") disposition = "suppressed";

    return {
      finding_id: finding.id,
      title: finding.title,
      original_severity: finding.severity,
      current_severity: currentSeverity,
      current_visibility: currentVisibility,
      disposition,
      disposition_status: dispositionStatus,
      active_disposition_type: dispositionRecord?.disposition_type ?? null,
      active_disposition_scope: dispositionRecord?.scope_level ?? null,
      active_disposition_reason: dispositionRecord?.reason ?? null,
      active_disposition_expires_at: dispositionRecord?.expires_at ?? null,
      active_disposition_due_soon: dispositionDueSoon,
      active_disposition_hours_until_expiry: dispositionDueSoon || dispositionRecord?.expires_at ? dispositionHoursUntilExpiry : null,
      active_disposition_owner_id: resolvedDisposition?.governance_owner_id ?? null,
      active_disposition_reviewed_at: resolvedDisposition?.governance_reviewed_at ?? null,
      active_disposition_review_due_by: resolvedDisposition?.governance_review_due_by ?? null,
      disposition_review_reason: resolvedDisposition?.review_reason ?? null,
      needs_disposition_review: resolvedDisposition?.needs_review ?? false,
      needs_human_review: finding.needs_human_review,
      last_action_at: latest?.created_at ?? null,
      last_action_type: latest?.action_type ?? null,
      last_reviewer_id: latest?.reviewer_id ?? null,
      notes
    };
  });

  const unresolved = findingSummaries.filter((item) => ["open", "needs_validation"].includes(item.disposition));
  const expiredDispositionFindings = findingSummaries.filter((item) => item.disposition_status === "expired");
  const dueSoonDispositionFindings = findingSummaries.filter((item) => item.active_disposition_due_soon);
  const findingsNeedingDispositionReview = findingSummaries.filter((item) => item.needs_disposition_review);
  const reopenedDispositionFindings = findingsNeedingDispositionReview.filter((item) => item.disposition_status !== "expired");
  const nextDispositionExpiryAt = dueSoonDispositionFindings
    .map((item) => item.active_disposition_expires_at)
    .filter((item): item is string => Boolean(item))
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
  const nextDispositionReviewDueAt = dueSoonDispositionFindings
    .map((item) => item.active_disposition_review_due_by || item.active_disposition_expires_at)
    .filter((item): item is string => Boolean(item))
    .sort((left, right) => left.localeCompare(right))[0] ?? null;
  const dueSoonByOwner = [...dueSoonDispositionFindings.reduce((acc, item) => {
    const ownerId = item.active_disposition_owner_id || "unassigned";
    const entry = acc.get(ownerId) ?? { owner_id: ownerId, count: 0, next_review_due_at: null as string | null };
    entry.count += 1;
    const candidateDueAt = item.active_disposition_review_due_by || item.active_disposition_expires_at || null;
    if (candidateDueAt && (!entry.next_review_due_at || candidateDueAt < entry.next_review_due_at)) {
      entry.next_review_due_at = candidateDueAt;
    }
    acc.set(ownerId, entry);
    return acc;
  }, new Map<string, { owner_id: string; count: number; next_review_due_at: string | null }>()).values()]
    .sort((left, right) => right.count - left.count || (left.next_review_due_at || "").localeCompare(right.next_review_due_at || ""));
  const latestNotes = args.actions
    .map((action) => action.notes)
    .filter((item): item is string => Boolean(item))
    .slice(-5)
    .reverse();
  const recentComments = [...(args.comments ?? [])]
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
    .slice(0, 10);
  const anchor = args.workflow?.last_action_at ?? args.workflow?.opened_at ?? null;

  return {
    workflow: args.workflow,
    handoff: {
      status: args.workflow?.status ?? "not_required",
      current_reviewer_id: args.workflow?.current_reviewer_id ?? null,
      unresolved_finding_count: unresolved.length,
      unresolved_finding_ids: unresolved.map((item) => item.finding_id),
      expired_disposition_count: expiredDispositionFindings.length,
      due_soon_disposition_count: dueSoonDispositionFindings.length,
      reopened_disposition_count: reopenedDispositionFindings.length,
      findings_needing_disposition_review_count: findingsNeedingDispositionReview.length,
      due_soon_disposition_ids: dueSoonDispositionFindings.map((item) => item.finding_id),
      due_soon_by_owner: dueSoonByOwner,
      findings_needing_disposition_review_ids: findingsNeedingDispositionReview.map((item) => item.finding_id),
      next_disposition_expiry_at: nextDispositionExpiryAt,
      next_disposition_review_due_at: nextDispositionReviewDueAt,
      latest_notes: latestNotes,
      latest_comments: recentComments.map((item) => item.body),
      last_action_at: args.workflow?.last_action_at ?? null,
      last_action_type: args.workflow?.last_action_type ?? null,
      opened_at: args.workflow?.opened_at ?? null,
      age_hours: hoursSince(anchor)
    },
    finding_summaries: findingSummaries,
    recent_comments: recentComments,
    suppression_count: findingSummaries.filter((item) => item.disposition === "suppressed").length,
    waiver_count: findingSummaries.filter((item) => item.disposition === "waived").length,
    expired_disposition_count: expiredDispositionFindings.length,
    due_soon_disposition_count: dueSoonDispositionFindings.length,
    reopened_disposition_count: reopenedDispositionFindings.length,
    findings_needing_disposition_review_count: findingsNeedingDispositionReview.length
  };
}
