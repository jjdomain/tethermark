import type { AuditRequest } from "./contracts.js";

export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_PROJECT_ID = "default";
export const DEFAULT_REQUESTED_BY = "anonymous";

function normalizeScopeValue(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function normalizeWorkspaceId(value: string | null | undefined): string {
  return normalizeScopeValue(value, DEFAULT_WORKSPACE_ID);
}

export function normalizeProjectId(value: string | null | undefined): string {
  return normalizeScopeValue(value, DEFAULT_PROJECT_ID);
}

export function normalizeActorId(value: string | null | undefined): string {
  return normalizeScopeValue(value, DEFAULT_REQUESTED_BY);
}

export function deriveRequestScope(request?: Pick<AuditRequest, "workspace_id" | "project_id" | "requested_by"> | null): {
  workspace_id: string;
  project_id: string;
  requested_by: string;
} {
  return {
    workspace_id: normalizeWorkspaceId(request?.workspace_id),
    project_id: normalizeProjectId(request?.project_id),
    requested_by: normalizeActorId(request?.requested_by)
  };
}

export function deriveScopeId(args: { workspaceId: string; projectId: string }): string {
  return `workspace/${normalizeWorkspaceId(args.workspaceId)}/project/${normalizeProjectId(args.projectId)}`;
}

