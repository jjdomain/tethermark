import type { HumanReviewActionType, ReviewActorRole } from "./contracts.js";
import type { PersistedReviewWorkflowRecord } from "./persistence/contracts.js";

export type ReviewPermission =
  | "assign_reviewer"
  | "review_action"
  | "comment"
  | "export_review_audit";

function canOperateOnReview(args: {
  roles: ReviewActorRole[];
  actorId: string;
  workflow: PersistedReviewWorkflowRecord | null;
}): boolean {
  if (args.roles.includes("admin") || args.roles.includes("triage_lead")) return true;
  if (!args.roles.includes("reviewer")) return false;
  const currentReviewer = args.workflow?.current_reviewer_id ?? null;
  return !currentReviewer || currentReviewer === args.actorId;
}

export function canPerformReviewAction(args: {
  roles: ReviewActorRole[];
  actorId: string;
  workflow: PersistedReviewWorkflowRecord | null;
  actionType: HumanReviewActionType;
}): boolean {
  if (args.actionType === "assign_reviewer") {
    return args.roles.includes("admin") || args.roles.includes("triage_lead");
  }
  return canOperateOnReview(args);
}

export function canCommentOnReview(args: {
  roles: ReviewActorRole[];
  actorId: string;
  workflow: PersistedReviewWorkflowRecord | null;
}): boolean {
  return canOperateOnReview(args);
}

export function canExportReviewAudit(args: {
  roles: ReviewActorRole[];
  actorId: string;
  workflow: PersistedReviewWorkflowRecord | null;
}): boolean {
  return canOperateOnReview(args);
}
