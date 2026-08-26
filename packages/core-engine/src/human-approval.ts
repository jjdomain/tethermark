import type { AuditRequest } from "./contracts.js";
import { hashObject } from "./utils.js";

export const HUMAN_APPROVAL_SCHEMA_VERSION = "2026-08-26.human-approval.v1";

export type HumanApprovalAction =
  | "policy_change"
  | "control_change"
  | "severity_downgrade"
  | "finding_suppression"
  | "control_waiver"
  | "evidence_reduction"
  | "runtime_probe_removal"
  | "learning_model_synthesis";

export interface HumanApprovalRecord {
  schema_version: typeof HUMAN_APPROVAL_SCHEMA_VERSION;
  approval_id: string;
  action: HumanApprovalAction;
  subject: string;
  approved_by: string;
  approved_at: string;
  reason: string;
  source: "review_action" | "policy_administration" | "operator_launch";
  checksum: string;
}

const NON_HUMAN_ACTORS = new Set(["", "anonymous", "automation", "learning", "model", "system"]);

function approvalPayload(record: Omit<HumanApprovalRecord, "checksum">): Omit<HumanApprovalRecord, "checksum"> {
  return {
    schema_version: record.schema_version,
    approval_id: record.approval_id,
    action: record.action,
    subject: record.subject,
    approved_by: record.approved_by,
    approved_at: record.approved_at,
    reason: record.reason,
    source: record.source
  };
}

export function createHumanApprovalRecord(args: {
  approvalId: string;
  action: HumanApprovalAction;
  subject: string;
  approvedBy: string;
  approvedAt?: string;
  reason: string;
  source: HumanApprovalRecord["source"];
}): HumanApprovalRecord {
  const approvedBy = args.approvedBy.trim();
  const reason = args.reason.trim();
  const subject = args.subject.trim();
  if (NON_HUMAN_ACTORS.has(approvedBy.toLowerCase())) throw new Error("human_approval_actor_required");
  if (!reason) throw new Error("human_approval_reason_required");
  if (!subject) throw new Error("human_approval_subject_required");
  const approvedAt = args.approvedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(approvedAt))) throw new Error("human_approval_timestamp_invalid");
  const payload = approvalPayload({
    schema_version: HUMAN_APPROVAL_SCHEMA_VERSION,
    approval_id: args.approvalId.trim(),
    action: args.action,
    subject,
    approved_by: approvedBy,
    approved_at: approvedAt,
    reason,
    source: args.source
  });
  if (!payload.approval_id) throw new Error("human_approval_id_required");
  return { ...payload, checksum: hashObject(payload) };
}

export function isValidHumanApprovalRecord(value: unknown, expected?: { action?: HumanApprovalAction; subject?: string }): value is HumanApprovalRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as HumanApprovalRecord;
  if (record.schema_version !== HUMAN_APPROVAL_SCHEMA_VERSION) return false;
  if (!record.approval_id || !record.subject || !record.reason || !record.approved_by || !record.approved_at || !record.source || !record.action) return false;
  if (NON_HUMAN_ACTORS.has(record.approved_by.trim().toLowerCase())) return false;
  if (Number.isNaN(Date.parse(record.approved_at))) return false;
  if (expected?.action && record.action !== expected.action) return false;
  if (expected?.subject && record.subject !== expected.subject) return false;
  const { checksum: _checksum, ...payload } = record;
  return record.checksum === hashObject(approvalPayload(payload));
}

export function requireHumanApproval(value: unknown, expected: { action: HumanApprovalAction; subject?: string }): HumanApprovalRecord {
  if (!isValidHumanApprovalRecord(value, expected)) throw new Error(`human_approval_required:${expected.action}`);
  return value;
}

function requestApprovals(request: AuditRequest): HumanApprovalRecord[] {
  const raw = (request.hints as any)?.human_approvals;
  const actor = request.requested_by?.trim();
  if (!actor || (request.llm_workload_class ?? "interactive_operator") !== "interactive_operator") return [];
  return Array.isArray(raw) ? raw.filter((item): item is HumanApprovalRecord => (
    isValidHumanApprovalRecord(item)
    && item.source === "operator_launch"
    && item.approved_by === actor
  )) : [];
}

function requestApprovalSubject(request: AuditRequest, action: HumanApprovalAction): string {
  const hints = request.hints && typeof request.hints === "object" ? request.hints as Record<string, any> : {};
  const constraints = hints.planner_control_constraints && typeof hints.planner_control_constraints === "object" ? hints.planner_control_constraints : {};
  const packageOverrides = hints.audit_package_overrides && typeof hints.audit_package_overrides === "object" ? hints.audit_package_overrides : {};
  const details = action === "control_change"
    ? {
        excluded_control_ids: Array.isArray(constraints.excluded_control_ids) ? [...constraints.excluded_control_ids].map(String).sort() : [],
        excluded_frameworks: Array.isArray(constraints.excluded_frameworks) ? [...constraints.excluded_frameworks].map(String).sort() : []
      }
    : {
        audit_package: request.audit_package ?? null,
        enabled_lanes: Array.isArray(packageOverrides.enabled_lanes) ? [...packageOverrides.enabled_lanes].map(String).sort() : []
      };
  return `audit-request:${hashObject({ action, details })}`;
}

export function requireRequestHumanApproval(request: AuditRequest, action: HumanApprovalAction): HumanApprovalRecord {
  const subject = requestApprovalSubject(request, action);
  const approval = requestApprovals(request).find((item) => item.action === action && item.subject === subject);
  if (!approval) throw new Error(`human_approval_required:${action}`);
  return approval;
}

export function attachOperatorLaunchApprovals(request: AuditRequest): AuditRequest {
  const hints = request.hints && typeof request.hints === "object" ? request.hints : {};
  const constraints = (hints as any).planner_control_constraints;
  const packageOverrides = (hints as any).audit_package_overrides;
  const actions = new Set<HumanApprovalAction>();
  if (constraints && typeof constraints === "object" && (
    (Array.isArray(constraints.excluded_control_ids) && constraints.excluded_control_ids.length)
    || (Array.isArray(constraints.excluded_frameworks) && constraints.excluded_frameworks.length)
  )) actions.add("control_change");
  if (packageOverrides && typeof packageOverrides === "object" && Array.isArray(packageOverrides.enabled_lanes)) {
    actions.add("evidence_reduction");
    if (!packageOverrides.enabled_lanes.includes("runtime_validation")) actions.add("runtime_probe_removal");
  }
  if (request.audit_package) {
    actions.add("evidence_reduction");
    if (request.audit_package === "baseline-static" || request.audit_package === "agentic-static" || request.audit_package === "deep-static") {
      actions.add("runtime_probe_removal");
    }
  }
  if (!actions.size) return request;
  if ((request.llm_workload_class ?? "interactive_operator") !== "interactive_operator") return request;
  const actor = request.requested_by?.trim();
  if (!actor || NON_HUMAN_ACTORS.has(actor.toLowerCase())) return request;
  const existing = requestApprovals(request);
  const approvedAt = new Date().toISOString();
  const additions = [...actions]
    .filter((action) => !existing.some((item) => item.action === action && item.subject === requestApprovalSubject(request, action)))
    .map((action) => createHumanApprovalRecord({
      approvalId: `operator-launch:${approvedAt}:${actor}:${action}`,
      action,
      subject: requestApprovalSubject(request, action),
      approvedBy: actor,
      approvedAt,
      reason: `Operator submitted an interactive audit request containing ${action.replaceAll("_", " ")}.`,
      source: "operator_launch"
    }));
  return additions.length ? { ...request, hints: { ...hints, human_approvals: [...existing, ...additions] } } : request;
}
