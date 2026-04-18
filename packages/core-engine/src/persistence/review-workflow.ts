import type { HumanReviewActionInput, HumanReviewStatus } from "../contracts.js";
import { normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./backend.js";
import type {
  PersistedRemediationMemoRecord,
  PersistedReviewActionRecord,
  PersistedReviewNotificationRecord,
  PersistedReviewDecisionRecord,
  PersistedReviewWorkflowRecord,
  PersistedRunRecord
} from "./contracts.js";
import { getPersistedRun, listPersistedRuns, type PersistedRunQuery } from "./query.js";
import { hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

function resolveLocation(rootDirOrOptions?: string | PersistenceReadOptions) {
  return typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
}

async function readTable<T>(rootDir: string, tableName: string): Promise<T[]> {
  if (!(await hasSqliteDatabase(rootDir))) return [];
  const db = await openSqliteDatabase(rootDir);
  try {
    return readSqliteTable<T>(db, tableName);
  } finally {
    db.close();
  }
}

export function deriveInitialReviewWorkflow(args: {
  run: Pick<PersistedRunRecord, "id" | "created_at" | "workspace_id" | "project_id">;
  reviewDecision: PersistedReviewDecisionRecord | null;
  remediationMemo?: PersistedRemediationMemoRecord | null;
}): PersistedReviewWorkflowRecord {
  const humanReviewRequired = Boolean(
    args.reviewDecision?.human_review_required
    || args.remediationMemo?.human_review_required
  );
  const status: HumanReviewStatus = humanReviewRequired ? "review_required" : "not_required";
  const workspaceId = normalizeWorkspaceId(args.run.workspace_id);
  const projectId = normalizeProjectId(args.run.project_id);
  return {
    run_id: args.run.id,
    workspace_id: workspaceId,
    project_id: projectId,
    status,
    human_review_required: humanReviewRequired,
    publishability_status: args.reviewDecision?.publishability_status ?? null,
    recommended_visibility: args.reviewDecision?.recommended_visibility ?? null,
    opened_at: args.run.created_at,
    started_at: null,
    completed_at: humanReviewRequired ? null : args.run.created_at,
    current_reviewer_id: null,
    last_action_at: null,
    last_action_type: null,
    notes_json: []
  };
}

export async function readPersistedReviewWorkflow(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedReviewWorkflowRecord | null> {
  const location = resolveLocation(rootDirOrOptions);
  const rows = await readTable<PersistedReviewWorkflowRecord>(location.rootDir, "review_workflows");
  return rows.find((item) => item.run_id === runId) ?? null;
}

export async function readPersistedReviewActions(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedReviewActionRecord[]> {
  const location = resolveLocation(rootDirOrOptions);
  const rows = await readTable<PersistedReviewActionRecord>(location.rootDir, "review_actions");
  return rows
    .filter((item) => item.run_id === runId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export async function listPersistedReviewNotifications(args?: {
  rootDir?: string;
  dbMode?: "embedded" | "local" | "hosted";
  workspaceId?: string;
  projectId?: string;
  reviewerId?: string;
  status?: "unread" | "acknowledged";
  notificationType?: PersistedReviewNotificationRecord["notification_type"];
}): Promise<PersistedReviewNotificationRecord[]> {
  const location = resolveLocation(args);
  const rows = await readTable<PersistedReviewNotificationRecord>(location.rootDir, "review_notifications");
  return rows
    .filter((item) => !args?.workspaceId || item.workspace_id === args.workspaceId)
    .filter((item) => !args?.projectId || item.project_id === args.projectId)
    .filter((item) => !args?.reviewerId || item.reviewer_id === args.reviewerId)
    .filter((item) => !args?.status || item.status === args.status)
    .filter((item) => !args?.notificationType || item.notification_type === args.notificationType)
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));
}

export async function acknowledgePersistedReviewNotification(args: {
  notificationId: string;
  reviewerId: string;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedReviewNotificationRecord | null> {
  const location = resolveLocation(args.rootDirOrOptions);
  const rows = await readTable<PersistedReviewNotificationRecord>(location.rootDir, "review_notifications");
  const existing = rows.find((item) => item.id === args.notificationId && item.reviewer_id === args.reviewerId) ?? null;
  if (!existing) return null;
  const next: PersistedReviewNotificationRecord = {
    ...existing,
    status: "acknowledged",
    acknowledged_at: new Date().toISOString()
  };
  const db = await openSqliteDatabase(location.rootDir);
  try {
    upsertSqliteRecord({
      db,
      tableName: "review_notifications",
      recordKey: next.id,
      payload: next,
      runId: next.run_id,
      createdAt: next.created_at,
      targetId: null,
      parentKey: next.run_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return next;
}

export interface PersistedReviewWorkflowListItem extends PersistedReviewWorkflowRecord {
  run: Awaited<ReturnType<typeof getPersistedRun>>;
}

export async function listPersistedReviewWorkflows(args?: PersistedRunQuery & { reviewStatus?: HumanReviewStatus }): Promise<PersistedReviewWorkflowListItem[]> {
  const runs = await listPersistedRuns({ ...args, limit: Number.MAX_SAFE_INTEGER });
  const workflows = await Promise.all(
    runs.map(async (run) => ({
      run,
      workflow: await readPersistedReviewWorkflow(run.id, { rootDir: args?.rootDir, dbMode: args?.dbMode })
    }))
  );
  return workflows
    .filter((item) => item.workflow)
    .map((item) => ({
      ...(item.workflow as PersistedReviewWorkflowRecord),
      run: item.run
    }))
    .filter((item) => !args?.reviewStatus || item.status === args.reviewStatus)
    .sort((left, right) => (right.last_action_at ?? right.opened_at).localeCompare(left.last_action_at ?? left.opened_at));
}

function applyReviewAction(workflow: PersistedReviewWorkflowRecord, action: PersistedReviewActionRecord): PersistedReviewWorkflowRecord {
  const notes = [...((workflow.notes_json as string[] | null) ?? [])];
  if (action.notes) notes.push(action.notes);
  if (action.action_type === "assign_reviewer" && action.assigned_reviewer_id) {
    notes.push(`assigned reviewer ${action.assigned_reviewer_id}`);
  }

  const next: PersistedReviewWorkflowRecord = {
    ...workflow,
    current_reviewer_id: action.action_type === "assign_reviewer" ? (action.assigned_reviewer_id ?? workflow.current_reviewer_id) : action.reviewer_id,
    last_action_at: action.created_at,
    last_action_type: action.action_type,
    notes_json: notes
  };

  if (action.action_type === "assign_reviewer") {
    next.completed_at = null;
    if (next.status === "not_required") next.status = "review_required";
    return next;
  }

  if (action.action_type === "start_review") {
    next.status = "in_review";
    next.started_at = next.started_at ?? action.created_at;
    next.completed_at = null;
    return next;
  }

  if (action.action_type === "approve_run") {
    next.status = "approved";
    next.started_at = next.started_at ?? action.created_at;
    next.completed_at = action.created_at;
    return next;
  }

  if (action.action_type === "reject_run") {
    next.status = "rejected";
    next.started_at = next.started_at ?? action.created_at;
    next.completed_at = action.created_at;
    return next;
  }

  if (
    action.action_type === "require_rerun"
    || action.action_type === "request_validation"
    || action.action_type === "rerun_in_capable_env"
  ) {
    next.status = "requires_rerun";
    next.started_at = next.started_at ?? action.created_at;
    next.completed_at = action.created_at;
    return next;
  }

  if (action.action_type === "adopt_rerun_outcome") {
    next.status = "in_review";
    next.started_at = next.started_at ?? action.created_at;
    next.completed_at = null;
    return next;
  }

  if (next.status === "review_required" || next.status === "not_required") {
    next.status = "in_review";
  }
  next.started_at = next.started_at ?? action.created_at;
  next.completed_at = null;
  return next;
}

export async function submitPersistedReviewAction(args: {
  runId: string;
  input: HumanReviewActionInput;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<{ workflow: PersistedReviewWorkflowRecord; action: PersistedReviewActionRecord; notification?: PersistedReviewNotificationRecord | null }> {
  const location = resolveLocation(args.rootDirOrOptions);
  const run = await getPersistedRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!run) {
    throw new Error("run_not_found");
  }

  const currentWorkflow = await readPersistedReviewWorkflow(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  const workflow = currentWorkflow ?? deriveInitialReviewWorkflow({
    run,
    reviewDecision: run.review_decision ?? null
  });
  const workspaceId = normalizeWorkspaceId(run.workspace_id);
  const projectId = normalizeProjectId(run.project_id);
  const createdAt = args.input.created_at ?? new Date().toISOString();
  const actionId = `${args.runId}:review-action:${createdAt}:${args.input.reviewer_id}:${args.input.action_type}:${Math.random().toString(36).slice(2, 10)}`;
  const action: PersistedReviewActionRecord = {
    id: actionId,
    run_id: args.runId,
    workspace_id: workspaceId,
    project_id: projectId,
    reviewer_id: args.input.reviewer_id,
    assigned_reviewer_id: args.input.assigned_reviewer_id ?? null,
    action_type: args.input.action_type,
    created_at: createdAt,
    finding_id: args.input.finding_id ?? null,
    previous_severity: args.input.previous_severity ?? null,
    updated_severity: args.input.updated_severity ?? null,
    visibility_override: args.input.visibility_override ?? null,
    notes: args.input.notes ?? null,
    metadata_json: args.input.metadata ?? null
  };
  const nextWorkflow = applyReviewAction(workflow, action);
  const notification = (() => {
    if (action.action_type === "assign_reviewer" && action.assigned_reviewer_id) {
      const reassigned = Boolean(workflow.current_reviewer_id && workflow.current_reviewer_id !== action.assigned_reviewer_id);
      const notificationType: PersistedReviewNotificationRecord["notification_type"] = reassigned ? "review_reassigned" : "review_assigned";
      return {
        id: `${args.runId}:review-notification:${createdAt}:${action.assigned_reviewer_id}:${reassigned ? "reassigned" : "assigned"}`,
        run_id: args.runId,
        workspace_id: workspaceId,
        project_id: projectId,
        reviewer_id: action.assigned_reviewer_id,
        notification_type: notificationType,
        status: "unread" as const,
        message: reassigned ? `Review reassigned for run ${args.runId}` : `Review assigned for run ${args.runId}`,
        created_at: createdAt,
        acknowledged_at: null,
        metadata_json: {
          assigned_by: args.input.reviewer_id,
          previous_reviewer_id: workflow.current_reviewer_id,
          publishability_status: nextWorkflow.publishability_status,
          human_review_required: nextWorkflow.human_review_required
        }
      };
    }
    if (
      action.action_type === "require_rerun"
      || action.action_type === "request_validation"
      || action.action_type === "rerun_in_capable_env"
    ) {
      const reviewerId = workflow.current_reviewer_id ?? action.reviewer_id;
      return {
        id: `${args.runId}:review-notification:${createdAt}:${reviewerId}:rerun`,
        run_id: args.runId,
        workspace_id: workspaceId,
        project_id: projectId,
        reviewer_id: reviewerId,
        notification_type: "review_rerun_required" as const,
        status: "unread" as const,
        message: `Review requires rerun follow-up for run ${args.runId}`,
        created_at: createdAt,
        acknowledged_at: null,
        metadata_json: {
          requested_by: args.input.reviewer_id,
          action_type: action.action_type,
          publishability_status: nextWorkflow.publishability_status,
          human_review_required: nextWorkflow.human_review_required
        }
      };
    }
    return null;
  })();
  const db = await openSqliteDatabase(location.rootDir);
  try {
    upsertSqliteRecord({
      db,
      tableName: "review_workflows",
      recordKey: args.runId,
      payload: nextWorkflow,
      runId: args.runId,
      createdAt: nextWorkflow.opened_at,
      targetId: run.target_id,
      parentKey: args.runId
    });
    upsertSqliteRecord({
      db,
      tableName: "review_actions",
      recordKey: action.id,
      payload: action,
      runId: args.runId,
      createdAt: action.created_at,
      targetId: run.target_id,
      parentKey: args.runId
    });
    if (notification) {
      upsertSqliteRecord({
        db,
        tableName: "review_notifications",
        recordKey: notification.id,
        payload: notification,
        runId: args.runId,
        createdAt: notification.created_at,
        targetId: run.target_id,
        parentKey: args.runId
      });
    }
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }

  return { workflow: nextWorkflow, action, notification };
}
