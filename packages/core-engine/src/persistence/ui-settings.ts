import { createHash, randomUUID } from "node:crypto";

import { deriveScopeId, normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import type { PersistenceReadOptions } from "./backend.js";
import { resolvePersistenceLocation } from "./backend.js";
import type {
  PersistedApiKeyRecord,
  PersistedProjectRecord,
  PersistedUiDocumentRecord,
  PersistedUiSettingsRecord,
  PersistedWorkspaceRecord,
  PersistedWorkspaceRoleBindingRecord
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
    workspace: PersistedUiSettingsRecord;
    project: PersistedUiSettingsRecord;
  };
}

export interface WorkspaceInput {
  id?: string;
  name: string;
  description?: string | null;
  default_project_id?: string | null;
  settings_inheritance_enabled?: boolean;
}

export interface ProjectInput {
  id?: string;
  workspace_id?: string;
  name: string;
  description?: string | null;
  target_defaults?: Record<string, unknown>;
}

export interface ApiKeyInput {
  label: string;
  created_by?: string | null;
  workspace_id?: string;
}

export interface WorkspaceRoleBindingInput {
  workspace_id?: string;
  actor_id: string;
  role: PersistedWorkspaceRoleBindingRecord["role"];
  created_by?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
    : args.scope === "workspace"
      ? `workspace/${workspaceId}`
      : deriveScopeId({ workspaceId: workspaceId ?? "default", projectId: projectId ?? "default" });
  return {
    id: scopeId,
    scope: args.scope,
    scope_id: scopeId,
    workspace_id: workspaceId,
    project_id: projectId,
    updated_at: updatedAt,
    providers_json: args.scope === "global" ? {
      default_provider: "mock",
      default_model: "mock-agent-runtime",
      mock_mode: true,
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
    providers_json: mergeJson(mergeJson(layers.global.providers_json as Record<string, unknown>, layers.workspace.providers_json), layers.project.providers_json),
    credentials_json: mergeJson(mergeJson(layers.global.credentials_json as Record<string, unknown>, layers.workspace.credentials_json), layers.project.credentials_json),
    audit_defaults_json: mergeJson(mergeJson(layers.global.audit_defaults_json as Record<string, unknown>, layers.workspace.audit_defaults_json), layers.project.audit_defaults_json),
    preflight_json: mergeJson(mergeJson(layers.global.preflight_json as Record<string, unknown>, layers.workspace.preflight_json), layers.project.preflight_json),
    review_json: mergeJson(mergeJson(layers.global.review_json as Record<string, unknown>, layers.workspace.review_json), layers.project.review_json),
    integrations_json: mergeJson(mergeJson(layers.global.integrations_json as Record<string, unknown>, layers.workspace.integrations_json), layers.project.integrations_json),
    test_mode_json: mergeJson(mergeJson(layers.global.test_mode_json as Record<string, unknown>, layers.workspace.test_mode_json), layers.project.test_mode_json)
  };
}

async function openUiDb(rootDirOrOptions?: string | PersistenceReadOptions) {
  const location = resolveLocation(rootDirOrOptions);
  const db = await openSqliteDatabase(location.rootDir);
  ensureSqliteSchema(db);
  return { db, location };
}

function listWorkspaceRows(db: any): PersistedWorkspaceRecord[] {
  return readSqliteTable<PersistedWorkspaceRecord>(db, "workspaces")
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listProjectRows(db: any, workspaceId?: string): PersistedProjectRecord[] {
  return readSqliteTable<PersistedProjectRecord>(db, "projects")
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listSettingRows(db: any): PersistedUiSettingsRecord[] {
  return readSqliteTable<PersistedUiSettingsRecord>(db, "ui_settings");
}

function listApiKeyRows(db: any, workspaceId?: string): PersistedApiKeyRecord[] {
  return readSqliteTable<PersistedApiKeyRecord>(db, "api_keys")
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function listWorkspaceRoleBindingRows(db: any, workspaceId?: string): PersistedWorkspaceRoleBindingRecord[] {
  return readSqliteTable<PersistedWorkspaceRoleBindingRecord>(db, "workspace_role_bindings")
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .filter((item) => !item.revoked_at)
    .sort((left, right) => left.actor_id.localeCompare(right.actor_id) || left.created_at.localeCompare(right.created_at));
}

function findSetting(rows: PersistedUiSettingsRecord[], args: { scope: PersistedUiSettingsRecord["scope"]; workspaceId?: string; projectId?: string }): PersistedUiSettingsRecord {
  if (args.scope === "global") {
    return rows.find((item) => item.scope === "global") ?? defaultUiSettingsForScope({ scope: "global" });
  }
  if (args.scope === "workspace") {
    const workspaceId = normalizeWorkspaceId(args.workspaceId);
    return rows.find((item) => item.scope === "workspace" && item.workspace_id === workspaceId)
      ?? defaultUiSettingsForScope({ scope: "workspace", workspaceId });
  }
  const workspaceId = normalizeWorkspaceId(args.workspaceId);
  const projectId = normalizeProjectId(args.projectId);
  return rows.find((item) => item.scope === "project" && item.workspace_id === workspaceId && item.project_id === projectId)
    ?? defaultUiSettingsForScope({ scope: "project", workspaceId, projectId });
}

export async function listPersistedWorkspaces(rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedWorkspaceRecord[]> {
  const { db } = await openUiDb(rootDirOrOptions);
  try {
    return listWorkspaceRows(db);
  } finally {
    db.close();
  }
}

export async function createPersistedWorkspace(input: WorkspaceInput & { created_by?: string | null }, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedWorkspaceRecord> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const timestamp = nowIso();
    const id = normalizeWorkspaceId(input.id ?? input.name);
    const record: PersistedWorkspaceRecord = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      default_project_id: input.default_project_id ? normalizeProjectId(input.default_project_id) : null,
      settings_inheritance_enabled: input.settings_inheritance_enabled ?? true,
      created_at: timestamp,
      updated_at: timestamp
    };
    upsertSqliteRecord({
      db,
      tableName: "workspaces",
      recordKey: record.id,
      payload: record,
      createdAt: record.created_at
    });
    if (input.created_by?.trim()) {
      const binding: PersistedWorkspaceRoleBindingRecord = {
        id: `${record.id}:${input.created_by.trim()}`,
        workspace_id: record.id,
        actor_id: input.created_by.trim(),
        role: "admin",
        created_by: input.created_by.trim(),
        created_at: timestamp,
        updated_at: timestamp,
        revoked_at: null
      };
      upsertSqliteRecord({
        db,
        tableName: "workspace_role_bindings",
        recordKey: binding.id,
        payload: binding,
        createdAt: binding.created_at,
        parentKey: binding.workspace_id
      });
    }
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
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
    const workspaces = listWorkspaceRows(db);
    const existingWorkspace = workspaces.find((item) => item.id === workspaceId);
    upsertSqliteRecord({
      db,
      tableName: "projects",
      recordKey: `${record.workspace_id}:${record.id}`,
      payload: record,
      createdAt: record.created_at,
      parentKey: record.workspace_id
    });
    if (existingWorkspace && !existingWorkspace.default_project_id) {
      upsertSqliteRecord({
        db,
        tableName: "workspaces",
        recordKey: existingWorkspace.id,
        payload: {
          ...existingWorkspace,
          default_project_id: record.id,
          updated_at: timestamp
        },
        createdAt: existingWorkspace.created_at
      });
    }
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

export async function listPersistedApiKeys(workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedApiKeyRecord[]> {
  const { db } = await openUiDb(rootDirOrOptions);
  try {
    return listApiKeyRows(db, workspaceId ? normalizeWorkspaceId(workspaceId) : undefined);
  } finally {
    db.close();
  }
}

export async function createPersistedApiKey(input: ApiKeyInput, rootDirOrOptions?: string | PersistenceReadOptions): Promise<{ record: PersistedApiKeyRecord; api_key: string }> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const workspaceId = normalizeWorkspaceId(input.workspace_id);
    const timestamp = nowIso();
    const apiKey = `hsk_${randomUUID().replace(/-/g, "")}`;
    const record: PersistedApiKeyRecord = {
      id: randomUUID(),
      workspace_id: workspaceId,
      label: input.label.trim(),
      key_prefix: apiKey.slice(0, 12),
      secret_sha256: sha256(apiKey),
      created_by: input.created_by?.trim() || null,
      created_at: timestamp,
      last_used_at: null,
      revoked_at: null
    };
    upsertSqliteRecord({
      db,
      tableName: "api_keys",
      recordKey: `${workspaceId}:${record.id}`,
      payload: record,
      createdAt: record.created_at,
      parentKey: workspaceId
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return { record, api_key: apiKey };
  } finally {
    db.close();
  }
}

export async function revokePersistedApiKey(apiKeyId: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedApiKeyRecord | null> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const normalizedWorkspace = normalizeWorkspaceId(workspaceId);
    const existing = listApiKeyRows(db, normalizedWorkspace).find((item) => item.id === apiKeyId && !item.revoked_at);
    if (!existing) return null;
    const revoked: PersistedApiKeyRecord = {
      ...existing,
      revoked_at: nowIso()
    };
    upsertSqliteRecord({
      db,
      tableName: "api_keys",
      recordKey: `${revoked.workspace_id}:${revoked.id}`,
      payload: revoked,
      createdAt: revoked.created_at,
      parentKey: revoked.workspace_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return revoked;
  } finally {
    db.close();
  }
}

export async function authenticatePersistedApiKey(apiKey: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedApiKeyRecord | null> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const normalizedWorkspace = normalizeWorkspaceId(workspaceId);
    const hashed = sha256(apiKey);
    const existing = listApiKeyRows(db, normalizedWorkspace).find((item) => item.secret_sha256 === hashed && !item.revoked_at);
    if (!existing) return null;
    const updated: PersistedApiKeyRecord = {
      ...existing,
      last_used_at: nowIso()
    };
    upsertSqliteRecord({
      db,
      tableName: "api_keys",
      recordKey: `${updated.workspace_id}:${updated.id}`,
      payload: updated,
      createdAt: updated.created_at,
      parentKey: updated.workspace_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return updated;
  } finally {
    db.close();
  }
}

export async function listPersistedWorkspaceRoleBindings(workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedWorkspaceRoleBindingRecord[]> {
  const { db } = await openUiDb(rootDirOrOptions);
  try {
    return listWorkspaceRoleBindingRows(db, workspaceId ? normalizeWorkspaceId(workspaceId) : undefined);
  } finally {
    db.close();
  }
}

export async function upsertPersistedWorkspaceRoleBinding(input: WorkspaceRoleBindingInput, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedWorkspaceRoleBindingRecord> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const workspaceId = normalizeWorkspaceId(input.workspace_id);
    const actorId = input.actor_id.trim();
    if (!actorId) throw new Error("actor_id_required");
    const existing = listWorkspaceRoleBindingRows(db, workspaceId).find((item) => item.actor_id === actorId) ?? null;
    const timestamp = nowIso();
    const record: PersistedWorkspaceRoleBindingRecord = {
      id: `${workspaceId}:${actorId}`,
      workspace_id: workspaceId,
      actor_id: actorId,
      role: input.role,
      created_by: existing?.created_by ?? input.created_by?.trim() ?? null,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
      revoked_at: null
    };
    upsertSqliteRecord({
      db,
      tableName: "workspace_role_bindings",
      recordKey: record.id,
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

export async function revokePersistedWorkspaceRoleBinding(workspaceId: string, actorId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedWorkspaceRoleBindingRecord | null> {
  const { db, location } = await openUiDb(rootDirOrOptions);
  try {
    const normalizedWorkspace = normalizeWorkspaceId(workspaceId);
    const normalizedActor = actorId.trim();
    const existing = listWorkspaceRoleBindingRows(db, normalizedWorkspace).find((item) => item.actor_id === normalizedActor) ?? null;
    if (!existing) return null;
    const revoked: PersistedWorkspaceRoleBindingRecord = {
      ...existing,
      updated_at: nowIso(),
      revoked_at: nowIso()
    };
    upsertSqliteRecord({
      db,
      tableName: "workspace_role_bindings",
      recordKey: revoked.id,
      payload: revoked,
      createdAt: revoked.created_at,
      parentKey: revoked.workspace_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return revoked;
  } finally {
    db.close();
  }
}

export async function readPersistedUiSettings(rootDirOrOptions?: string | PersistenceReadOptions, scope?: UiScopeInput): Promise<PersistedUiSettingsRecord> {
  const resolution = await resolvePersistedUiSettings(rootDirOrOptions, scope);
  return resolution.effective;
}

export async function readPersistedUiSettingsLayer(
  scopeLevel: "global" | "workspace" | "project",
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
      workspace: findSetting(settingsRows, { scope: "workspace", workspaceId: resolvedProject.workspaceId }),
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
  scope?: UiScopeInput & { scopeLevel?: "global" | "workspace" | "project" }
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
      id: scopeLevel === "global" ? "global/default" : scopeLevel === "workspace" ? `workspace/${workspaceId}` : projectScopeId(workspaceId, projectId),
      scope: scopeLevel,
      scope_id: scopeLevel === "global" ? "global/default" : scopeLevel === "workspace" ? `workspace/${workspaceId}` : projectScopeId(workspaceId, projectId),
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
