import { randomUUID } from "node:crypto";

import { deriveScopeId, normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import type { PersistenceReadOptions } from "./backend.js";
import { resolvePersistenceLocation } from "./backend.js";
import type {
  PersistedProjectRecord,
  PersistedUiDocumentRecord,
  PersistedUiSettingsRecord
} from "./contracts.js";
import { ensureSqliteSchema, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

export interface UiSettingsInput {
  providers?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  audit_defaults?: Record<string, unknown>;
  preflight?: Record<string, unknown>;
  review?: Record<string, unknown>;
  integrations?: Record<string, unknown>;
  test_mode?: Record<string, unknown>;
}

export interface UiDocumentInput {
  title: string;
  document_type: PersistedUiDocumentRecord["document_type"];
  filename?: string | null;
  media_type?: string | null;
  content_text: string;
  notes?: string | null;
  tags?: string[];
}

export interface UiScopeInput {
  workspaceId?: string;
  projectId?: string;
}

export interface UiSettingsResolution {
  effective: PersistedUiSettingsRecord;
  layers: {
    global: PersistedUiSettingsRecord;
    project: PersistedUiSettingsRecord;
  };
}

export interface ProjectInput {
  id?: string;
  workspace_id?: string;
  name: string;
  description?: string | null;
  target_defaults?: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mergeJson(base: Record<string, unknown>, override: unknown): Record<string, unknown> {
  return {
    ...base,
    ...((override && typeof override === "object" && !Array.isArray(override)) ? override as Record<string, unknown> : {})
  };
}

function normalizedWorkspace(scope?: UiScopeInput): string {
  return normalizeWorkspaceId(scope?.workspaceId);
}

function normalizedProject(scope?: UiScopeInput): string {
  return normalizeProjectId(scope?.projectId);
}

function defaultUiSettingsForScope(args: {
  scope: PersistedUiSettingsRecord["scope"];
  workspaceId?: string | null;
  projectId?: string | null;
}): PersistedUiSettingsRecord {
  const updatedAt = nowIso();
  const workspaceId = args.workspaceId ? normalizeWorkspaceId(args.workspaceId) : null;
  const projectId = args.projectId ? normalizeProjectId(args.projectId) : null;
  const scopeId = args.scope === "global"
    ? "global/default"
    : deriveScopeId({ workspaceId: workspaceId ?? "default", projectId: projectId ?? "default" });
  return {
    id: scopeId,
    scope: args.scope,
    scope_id: scopeId,
    workspace_id: workspaceId,
    project_id: projectId,
    updated_at: updatedAt,
    providers_json: args.scope === "global" ? {
      default_provider: "",
      default_model: "",
      mock_mode: false,
      agent_overrides: {}
    } : {},
    credentials_json: args.scope === "global" ? {
      prefer_env_credentials: true,
      configured_endpoints: [],
      github_api_base_url: "https://api.github.com",
      github_token: null
    } : {},
    audit_defaults_json: args.scope === "global" ? {
      audit_package: "agentic-static",
      run_mode: "static",
      retry_limit: 1,
      budget_usd: null,
      timeout_minutes: 30
    } : {},
    preflight_json: args.scope === "global" ? {
      enabled: true,
      strictness: "standard",
      readiness_gate_policy: "risk_or_drift",
      runtime_allowed: "targeted_only",
      isolation_preference: "restricted_container_no_egress",
      include_defaults: [],
      exclude_defaults: ["examples", "fixtures", "generated"]
    } : {},
    review_json: args.scope === "global" ? {
      require_human_review_for_severity: "high",
      default_visibility: "internal",
      publishability_threshold: "standard",
      disposition_renewal_days: 30,
      disposition_review_window_days: 30
    } : {},
    integrations_json: args.scope === "global" ? {
      completion_webhook_url: null,
      generic_webhook_url: null,
      generic_webhook_secret: null,
      generic_webhook_events: ["run_completed", "review_required", "review_requires_rerun", "outbound_delivery_failed"],
      github_mode: "disabled",
      github_allowed_actions: [],
      github_owned_repo_only: true,
      github_owned_repo_prefixes: [],
      github_require_per_run_approval: true,
      oidc_enabled: false,
      oidc_issuer: null
    } : {},
    test_mode_json: args.scope === "global" ? {
      preset: "mock_provider",
      deterministic_planning: true,
      fixture_validation_enabled: true,
      reduced_cost_mode: true
    } : {}
  };
}

function resolveLocation(rootDirOrOptions?: string | PersistenceReadOptions) {
  return typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
}

function resolveProjectRecord(scope?: UiScopeInput, projects?: PersistedProjectRecord[]): { workspaceId: string; projectId: string } {
  const workspaceId = normalizedWorkspace(scope);
  const projectId = normalizedProject(scope);
  const matchingProject = projects?.find((item) => item.workspace_id === workspaceId && item.id === projectId);
  return {
    workspaceId,
    projectId: matchingProject?.id ?? projectId
  };
}

function projectScopeId(workspaceId: string, projectId: string): string {
  return deriveScopeId({ workspaceId, projectId });
}

function mergeSettingsLayers(layers: UiSettingsResolution["layers"]): PersistedUiSettingsRecord {
  return {
    ...layers.project,
    scope: "project",
    scope_id: layers.project.scope_id,
    workspace_id: layers.project.workspace_id,
    project_id: layers.project.project_id,
    updated_at: layers.project.updated_at,
    providers_json: mergeJson(layers.global.providers_json as Record<string, unknown>, layers.project.providers_json),
    credentials_json: mergeJson(layers.global.credentials_json as Record<string, unknown>, layers.project.credentials_json),
    audit_defaults_json: mergeJson(layers.global.audit_defaults_json as Record<string, unknown>, layers.project.audit_defaults_json),
    preflight_json: mergeJson(layers.global.preflight_json as Record<string, unknown>, layers.project.preflight_json),
    review_json: mergeJson(layers.global.review_json as Record<string, unknown>, layers.project.review_json),
    integrations_json: mergeJson(layers.global.integrations_json as Record<string, unknown>, layers.project.integrations_json),
    test_mode_json: mergeJson(layers.global.test_mode_json as Record<string, unknown>, layers.project.test_mode_json)
  };
}

async function openUiDb(rootDirOrOptions?: string | PersistenceReadOptions) {
  const location = resolveLocation(rootDirOrOptions);
  const db = await openSqliteDatabase(location.rootDir);
  ensureSqliteSchema(db);
  return { db, location };
}

function listProjectRows(db: any, workspaceId?: string): PersistedProjectRecord[] {
  return readSqliteTable<PersistedProjectRecord>(db, "projects")
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listSettingRows(db: any): PersistedUiSettingsRecord[] {
  return readSqliteTable<PersistedUiSettingsRecord>(db, "ui_settings");
}

function findSetting(rows: PersistedUiSettingsRecord[], args: { scope: PersistedUiSettingsRecord["scope"]; workspaceId?: string; projectId?: string }): PersistedUiSettingsRecord {
  if (args.scope === "global") {
    return rows.find((item) => item.scope === "global") ?? defaultUiSettingsForScope({ scope: "global" });
  }
  const workspaceId = normalizeWorkspaceId(args.workspaceId);
  const projectId = normalizeProjectId(args.projectId);
  return rows.find((item) => item.scope === "project" && item.workspace_id === workspaceId && item.project_id === projectId)
    ?? defaultUiSettingsForScope({ scope: "project", workspaceId, projectId });
}

export async function listPersistedProjects(workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedProjectRecord[]> {
  const { db } = await openUiDb(rootDirOrOptions);
  try {
    return listProjectRows(db, workspaceId ? normalizeWorkspaceId(workspaceId) : undefined);
  } finally {
    db.close();
  }
}

export async function getPersistedProject(projectId: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedProjectRecord | null> {
  const { db } = await openUiDb(rootDirOrOptions);
  try {
    const normalizedWorkspace = normalizeWorkspaceId(workspaceId);
    const normalizedProject = normalizeProjectId(projectId);
    return listProjectRows(db, normalizedWorkspace).find((item) => item.id === normalizedProject) ?? null;
  } finally {
    db.close();
  }
}

export async function createPersistedProject(input: ProjectInput, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedProjectRecord> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const timestamp = nowIso();
    const workspaceId = normalizeWorkspaceId(input.workspace_id);
    const record: PersistedProjectRecord = {
      id: normalizeProjectId(input.id ?? input.name),
      workspace_id: workspaceId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      target_defaults_json: input.target_defaults ?? {},
      created_at: timestamp,
      updated_at: timestamp
    };
    upsertSqliteRecord({
      db,
      tableName: "projects",
      recordKey: `${record.workspace_id}:${record.id}`,
      payload: record,
      createdAt: record.created_at,
      parentKey: record.workspace_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
}

export async function updatePersistedProject(projectId: string, input: ProjectInput, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedProjectRecord | null> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const workspaceId = normalizeWorkspaceId(input.workspace_id);
    const existing = listProjectRows(db, workspaceId).find((item) => item.id === normalizeProjectId(projectId));
    if (!existing) return null;
    const record: PersistedProjectRecord = {
      ...existing,
      name: input.name?.trim() || existing.name,
      description: input.description === undefined ? existing.description : (input.description?.trim() || null),
      target_defaults_json: input.target_defaults ?? existing.target_defaults_json,
      updated_at: nowIso()
    };
    upsertSqliteRecord({
      db,
      tableName: "projects",
      recordKey: `${record.workspace_id}:${record.id}`,
      payload: record,
      createdAt: existing.created_at,
      parentKey: record.workspace_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
}

export async function readPersistedUiSettings(rootDirOrOptions?: string | PersistenceReadOptions, scope?: UiScopeInput): Promise<PersistedUiSettingsRecord> {
  const resolution = await resolvePersistedUiSettings(rootDirOrOptions, scope);
  return resolution.effective;
}

export async function readPersistedUiSettingsLayer(
  scopeLevel: "global" | "project",
  rootDirOrOptions?: string | PersistenceReadOptions,
  scope?: UiScopeInput
): Promise<PersistedUiSettingsRecord> {
  const { db } = await openUiDb(rootDirOrOptions);
  try {
    const settingsRows = listSettingRows(db);
    const workspaceId = normalizedWorkspace(scope);
    const projectId = normalizedProject(scope);
    return findSetting(settingsRows, { scope: scopeLevel, workspaceId, projectId });
  } finally {
    db.close();
  }
}

export async function resolvePersistedUiSettings(rootDirOrOptions?: string | PersistenceReadOptions, scope?: UiScopeInput): Promise<UiSettingsResolution> {
  const { db } = await openUiDb(rootDirOrOptions);
  try {
    const settingsRows = listSettingRows(db);
    const projects = listProjectRows(db, normalizedWorkspace(scope));
    const resolvedProject = resolveProjectRecord(scope, projects);
    const layers = {
      global: findSetting(settingsRows, { scope: "global" }),
      project: findSetting(settingsRows, { scope: "project", workspaceId: resolvedProject.workspaceId, projectId: resolvedProject.projectId })
    };
    return {
      layers,
      effective: mergeSettingsLayers(layers)
    };
  } finally {
    db.close();
  }
}

export async function updatePersistedUiSettings(
  input: UiSettingsInput,
  rootDirOrOptions?: string | PersistenceReadOptions,
  scope?: UiScopeInput & { scopeLevel?: "global" | "project" }
): Promise<PersistedUiSettingsRecord> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const timestamp = nowIso();
    const settingsRows = listSettingRows(db);
    const scopeLevel = scope?.scopeLevel ?? "project";
    const workspaceId = normalizedWorkspace(scope);
    const projectId = normalizedProject(scope);
    const current = findSetting(settingsRows, { scope: scopeLevel, workspaceId, projectId });
    const next: PersistedUiSettingsRecord = {
      ...current,
      id: scopeLevel === "global" ? "global/default" : projectScopeId(workspaceId, projectId),
      scope: scopeLevel,
      scope_id: scopeLevel === "global" ? "global/default" : projectScopeId(workspaceId, projectId),
      workspace_id: scopeLevel === "global" ? null : workspaceId,
      project_id: scopeLevel === "project" ? projectId : null,
      updated_at: timestamp,
      providers_json: input.providers ?? current.providers_json,
      credentials_json: input.credentials ?? current.credentials_json,
      audit_defaults_json: input.audit_defaults ?? current.audit_defaults_json,
      preflight_json: input.preflight ?? current.preflight_json,
      review_json: input.review ?? current.review_json,
      integrations_json: input.integrations ?? current.integrations_json,
      test_mode_json: input.test_mode ?? current.test_mode_json
    };
    upsertSqliteRecord({
      db,
      tableName: "ui_settings",
      recordKey: next.id,
      payload: next,
      createdAt: next.updated_at,
      parentKey: next.workspace_id ?? undefined
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return next;
  } finally {
    db.close();
  }
}

export async function listPersistedUiDocuments(rootDirOrOptions?: string | PersistenceReadOptions, scope?: UiScopeInput): Promise<PersistedUiDocumentRecord[]> {
  const { db } = await openUiDb(rootDirOrOptions);
  try {
    const workspaceId = normalizedWorkspace(scope);
    const projectId = normalizedProject(scope);
    return readSqliteTable<PersistedUiDocumentRecord>(db, "ui_documents")
      .filter((item) => item.workspace_id === workspaceId && item.project_id === projectId)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  } finally {
    db.close();
  }
}

export async function createPersistedUiDocument(input: UiDocumentInput, rootDirOrOptions?: string | PersistenceReadOptions, scope?: UiScopeInput): Promise<PersistedUiDocumentRecord> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const workspaceId = normalizedWorkspace(scope);
    const projectId = normalizedProject(scope);
    const timestamp = nowIso();
    const record: PersistedUiDocumentRecord = {
      id: randomUUID(),
      scope: "workspace_project",
      scope_id: projectScopeId(workspaceId, projectId),
      workspace_id: workspaceId,
      project_id: projectId,
      title: input.title.trim(),
      document_type: input.document_type,
      filename: input.filename?.trim() || null,
      media_type: input.media_type?.trim() || "text/plain",
      content_text: input.content_text,
      notes: input.notes?.trim() || null,
      tags_json: input.tags ?? [],
      created_at: timestamp,
      updated_at: timestamp
    };
    upsertSqliteRecord({
      db,
      tableName: "ui_documents",
      recordKey: record.id,
      payload: record,
      createdAt: record.created_at,
      parentKey: `${workspaceId}:${projectId}`
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
}

export async function deletePersistedUiDocument(documentId: string, rootDirOrOptions?: string | PersistenceReadOptions, scope?: UiScopeInput): Promise<boolean> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const workspaceId = normalizedWorkspace(scope);
    const projectId = normalizedProject(scope);
    const rows = readSqliteTable<PersistedUiDocumentRecord>(db, "ui_documents");
    const record = rows.find((item) => item.id === documentId && item.workspace_id === workspaceId && item.project_id === projectId);
    if (!record) return false;
    const statement = db.prepare("DELETE FROM records WHERE table_name = ? AND record_key = ?");
    statement.run(["ui_documents", documentId]);
    statement.free();
    const changed = Number(db.exec("SELECT changes() AS count")[0]?.values?.[0]?.[0] ?? 0) > 0;
    if (changed) await saveSqliteDatabase(location.rootDir, db, location.mode);
    return changed;
  } finally {
    db.close();
  }
}
