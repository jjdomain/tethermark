import { randomUUID } from "node:crypto";

import type { AnalysisSummary, AuditPackageId, AuditRequest, TargetClass } from "./contracts.js";
import { listBuiltinAuditPackages } from "./audit-packages.js";
import { CONTROL_CATALOG_VERSION, getCandidateControls, getControlCatalog } from "./standards.js";
import { normalizeProjectId, normalizeWorkspaceId } from "./request-scope.js";
import { hashObject } from "./utils.js";
import type { PersistenceReadOptions } from "./persistence/backend.js";
import { resolvePersistenceLocation } from "./persistence/backend.js";
import { ensureSqliteSchema, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./persistence/sqlite.js";

export const SYSTEM_POLICY_SCHEMA_VERSION = "2026-08-21.system-policy.v1";
export const SYSTEM_POLICY_RESOLUTION_SCHEMA_VERSION = "2026-08-21.resolved-system-policy.v1";

export type SystemPolicyStatus = "draft" | "active" | "archived";
export type SystemPolicyTemplateId = "baseline-static-safe" | "agentic-static-safe" | "extensive-static-safe" | "extensive-runtime-local-safe";

export interface SystemPolicyDefinition {
  schema_version: typeof SYSTEM_POLICY_SCHEMA_VERSION;
  template_id: SystemPolicyTemplateId | "custom";
  default_audit_package: AuditPackageId;
  allowed_audit_packages: AuditPackageId[];
  required_control_ids: string[];
  required_evidence_provider_ids: string[];
  evidence_failure_policy: "block" | "internal_only";
  providers: {
    allowed_provider_ids: Array<NonNullable<AuditRequest["llm_provider"]>>;
    allowed_workload_classes: Array<NonNullable<AuditRequest["llm_workload_class"]>>;
    allowed_credential_classes: Array<NonNullable<AuditRequest["llm_credential_class"]>>;
    allowed_model_ids: string[];
    maximum_agent_calls: number;
    maximum_total_tokens: number;
    maximum_wall_time_minutes: number;
    maximum_retries: number;
  };
  runtime: {
    allowed: boolean;
    require_isolation: boolean;
    no_host_fallback: boolean;
    network_policy: "deny" | "allowlisted_install_only";
  };
  review: {
    publishability_threshold: "low" | "medium" | "high";
    require_human_review_on_incomplete_evidence: boolean;
    require_human_review_severities: Array<"low" | "medium" | "high" | "critical">;
  };
  learning: {
    enabled: boolean;
    require_human_promotion: boolean;
  };
  retention: {
    source_days: number;
    artifact_days: number;
    trace_days: number;
    export_days: number;
  };
  exceptions: {
    allow_per_run_narrowing: boolean;
    allow_approved_weakening: boolean;
  };
}

export interface PersistedSystemPolicyRecord {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: SystemPolicyStatus;
  scope: "workspace";
  current_version_id: string;
  active_version_id: string | null;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

export interface PersistedSystemPolicyVersionRecord {
  id: string;
  policy_id: string;
  workspace_id: string;
  version: number;
  state: "draft" | "published" | "superseded";
  schema_version: string;
  definition_json: SystemPolicyDefinition;
  checksum: string;
  created_by: string;
  created_reason: string;
  created_at: string;
  published_at: string | null;
}

export interface PersistedSystemPolicyBindingRecord {
  id: string;
  workspace_id: string;
  project_id: string | null;
  target_ref: string | null;
  audit_package: AuditPackageId | null;
  binding_type: "default" | "project" | "target" | "package";
  policy_id: string;
  policy_version_id: string;
  priority: number;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PersistedSystemPolicyChangeEventRecord {
  id: string;
  workspace_id: string;
  policy_id: string;
  policy_version_id: string | null;
  event_type: "create" | "validate" | "publish" | "set_default" | "archive" | "rollback" | "import" | "bind" | "unbind";
  actor_id: string;
  reason: string;
  details_json: Record<string, unknown>;
  created_at: string;
}

export interface ResolvedSystemPolicySnapshot {
  schema_version: typeof SYSTEM_POLICY_RESOLUTION_SCHEMA_VERSION;
  run_id: string | null;
  workspace_id: string;
  project_id: string;
  target_ref: string | null;
  target_class: TargetClass | null;
  policy_id: string;
  policy_version_id: string;
  policy_version: number;
  policy_checksum: string;
  control_catalog_version: string;
  audit_package: AuditPackageId;
  applicable_required_control_ids: string[];
  required_evidence_provider_ids: string[];
  definition_json: SystemPolicyDefinition;
  resolution_layers: string[];
  warnings: string[];
  checksum: string;
  resolved_at: string;
}

export interface PersistedPolicyResolutionSnapshotRecord extends ResolvedSystemPolicySnapshot {
  run_id: string;
}

export interface SystemPolicyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checksum: string;
}

export interface SystemPolicyDetail {
  policy: PersistedSystemPolicyRecord;
  versions: PersistedSystemPolicyVersionRecord[];
  bindings: PersistedSystemPolicyBindingRecord[];
  events: PersistedSystemPolicyChangeEventRecord[];
  runs_using_versions: Array<{ policy_version_id: string; run_ids: string[] }>;
}

const EXTENSIVE_REQUIRED_CONTROL_IDS = getControlCatalog().map((item) => item.control_id).sort();
const REPO_REQUIRED_CONTROL_IDS = EXTENSIVE_REQUIRED_CONTROL_IDS.filter((controlId) => (
  controlId.startsWith("openssf.") || controlId.startsWith("slsa.") || controlId.startsWith("nist_ssdf.")
));
const AGENTIC_REQUIRED_CONTROL_IDS = EXTENSIVE_REQUIRED_CONTROL_IDS.filter((controlId) => (
  REPO_REQUIRED_CONTROL_IDS.includes(controlId)
  || controlId.startsWith("owasp_llm.")
  || controlId.startsWith("owasp_agentic.")
  || controlId.startsWith("mitre_atlas.")
  || controlId.startsWith("harness_internal.")
));

function policyDefinition(args: {
  templateId: SystemPolicyTemplateId;
  auditPackage: AuditPackageId;
  allowedPackages: AuditPackageId[];
  requiredControls: string[];
  requiredEvidence: string[];
  runtime: boolean;
  maximumAgentCalls: number;
  maximumTokens: number;
}): SystemPolicyDefinition {
  return {
    schema_version: SYSTEM_POLICY_SCHEMA_VERSION,
    template_id: args.templateId,
    default_audit_package: args.auditPackage,
    allowed_audit_packages: [...args.allowedPackages],
    required_control_ids: [...args.requiredControls],
    required_evidence_provider_ids: [...args.requiredEvidence],
    evidence_failure_policy: args.templateId.startsWith("extensive-") ? "block" : "internal_only",
    providers: {
      allowed_provider_ids: ["openai_codex", "openai", "mock"],
      allowed_workload_classes: ["interactive_operator", "unattended_local"],
      allowed_credential_classes: ["chatgpt_session", "api_key", "none"],
      allowed_model_ids: [],
      maximum_agent_calls: args.maximumAgentCalls,
      maximum_total_tokens: args.maximumTokens,
      maximum_wall_time_minutes: args.runtime ? 90 : 45,
      maximum_retries: args.templateId.startsWith("extensive-") ? 2 : 1
    },
    runtime: {
      allowed: args.runtime,
      require_isolation: args.runtime,
      no_host_fallback: true,
      network_policy: "deny"
    },
    review: {
      publishability_threshold: args.templateId === "baseline-static-safe" ? "medium" : "high",
      require_human_review_on_incomplete_evidence: true,
      require_human_review_severities: ["high", "critical"]
    },
    learning: { enabled: false, require_human_promotion: true },
    retention: { source_days: 7, artifact_days: 30, trace_days: 30, export_days: 90 },
    exceptions: { allow_per_run_narrowing: true, allow_approved_weakening: false }
  };
}

export function listBuiltinSystemPolicyTemplates(): Array<{ id: SystemPolicyTemplateId; name: string; description: string; definition: SystemPolicyDefinition }> {
  return [
    {
      id: "baseline-static-safe",
      name: "Baseline Static Safe",
      description: "Low-cost repository posture with no runtime execution.",
      definition: policyDefinition({ templateId: "baseline-static-safe", auditPackage: "baseline-static", allowedPackages: ["baseline-static"], requiredControls: REPO_REQUIRED_CONTROL_IDS, requiredEvidence: ["repo_analysis"], runtime: false, maximumAgentCalls: 8, maximumTokens: 80000 })
    },
    {
      id: "agentic-static-safe",
      name: "Agentic Static Safe",
      description: "Static repository, agent, tool, and data-boundary controls with no runtime execution.",
      definition: policyDefinition({ templateId: "agentic-static-safe", auditPackage: "agentic-static", allowedPackages: ["baseline-static", "agentic-static", "deep-static"], requiredControls: AGENTIC_REQUIRED_CONTROL_IDS, requiredEvidence: ["repo_analysis"], runtime: false, maximumAgentCalls: 18, maximumTokens: 240000 })
    },
    {
      id: "extensive-static-safe",
      name: "Extensive Static Safe",
      description: "All applicable catalog controls under the deep-static execution envelope.",
      definition: policyDefinition({ templateId: "extensive-static-safe", auditPackage: "deep-static", allowedPackages: ["deep-static"], requiredControls: EXTENSIVE_REQUIRED_CONTROL_IDS, requiredEvidence: ["repo_analysis", "scorecard", "semgrep", "trivy"], runtime: false, maximumAgentCalls: 18, maximumTokens: 240000 })
    },
    {
      id: "extensive-runtime-local-safe",
      name: "Extensive Runtime Local Safe",
      description: "Extensive static controls plus isolated local runtime validation with no host fallback.",
      definition: policyDefinition({ templateId: "extensive-runtime-local-safe", auditPackage: "runtime-validated", allowedPackages: ["runtime-validated", "comprehensive-local"], requiredControls: EXTENSIVE_REQUIRED_CONTROL_IDS, requiredEvidence: ["repo_analysis", "scorecard", "semgrep", "trivy", "local_runtime"], runtime: true, maximumAgentCalls: 28, maximumTokens: 400000 })
    }
  ];
}

export function getBuiltinSystemPolicyTemplate(id: string): ReturnType<typeof listBuiltinSystemPolicyTemplates>[number] | null {
  return listBuiltinSystemPolicyTemplates().find((item) => item.id === id) ?? null;
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))] : [];
}

export function normalizeSystemPolicyDefinition(value: unknown): SystemPolicyDefinition {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<SystemPolicyDefinition> : {};
  const fallback = getBuiltinSystemPolicyTemplate("agentic-static-safe")!.definition;
  return {
    ...fallback,
    ...input,
    schema_version: SYSTEM_POLICY_SCHEMA_VERSION,
    template_id: input.template_id ?? "custom",
    allowed_audit_packages: uniqueStrings(input.allowed_audit_packages ?? fallback.allowed_audit_packages) as AuditPackageId[],
    required_control_ids: uniqueStrings(input.required_control_ids ?? fallback.required_control_ids),
    required_evidence_provider_ids: uniqueStrings(input.required_evidence_provider_ids ?? fallback.required_evidence_provider_ids),
    providers: { ...fallback.providers, ...(input.providers ?? {}), allowed_provider_ids: uniqueStrings(input.providers?.allowed_provider_ids ?? fallback.providers.allowed_provider_ids) as any, allowed_workload_classes: uniqueStrings(input.providers?.allowed_workload_classes ?? fallback.providers.allowed_workload_classes) as any, allowed_credential_classes: uniqueStrings(input.providers?.allowed_credential_classes ?? fallback.providers.allowed_credential_classes) as any, allowed_model_ids: uniqueStrings(input.providers?.allowed_model_ids ?? fallback.providers.allowed_model_ids) },
    runtime: { ...fallback.runtime, ...(input.runtime ?? {}) },
    review: { ...fallback.review, ...(input.review ?? {}), require_human_review_severities: uniqueStrings(input.review?.require_human_review_severities ?? fallback.review.require_human_review_severities) as any },
    learning: { ...fallback.learning, ...(input.learning ?? {}) },
    retention: { ...fallback.retention, ...(input.retention ?? {}) },
    exceptions: { ...fallback.exceptions, ...(input.exceptions ?? {}) }
  };
}

export function validateSystemPolicyDefinition(value: unknown): SystemPolicyValidationResult {
  const definition = normalizeSystemPolicyDefinition(value);
  const errors: string[] = [];
  const warnings: string[] = [];
  const knownControls = new Set(getControlCatalog().map((item) => item.control_id));
  const knownPackages = new Set(listBuiltinAuditPackages().map((item) => item.id));
  if (!knownPackages.has(definition.default_audit_package)) errors.push(`Unknown default audit package '${definition.default_audit_package}'.`);
  if (!definition.allowed_audit_packages.length) errors.push("At least one allowed audit package is required.");
  for (const id of definition.allowed_audit_packages) if (!knownPackages.has(id)) errors.push(`Unknown allowed audit package '${id}'.`);
  if (!definition.allowed_audit_packages.includes(definition.default_audit_package)) errors.push("The default audit package must also be allowed.");
  for (const id of definition.required_control_ids) if (!knownControls.has(id)) errors.push(`Unknown required control '${id}'.`);
  if (!definition.providers.allowed_provider_ids.length) errors.push("At least one provider is required.");
  if (!definition.providers.allowed_workload_classes.length) errors.push("At least one provider workload class is required.");
  if (!definition.providers.allowed_credential_classes.length) errors.push("At least one provider credential class is required.");
  for (const [field, number] of Object.entries({ maximum_agent_calls: definition.providers.maximum_agent_calls, maximum_total_tokens: definition.providers.maximum_total_tokens, maximum_wall_time_minutes: definition.providers.maximum_wall_time_minutes, maximum_retries: definition.providers.maximum_retries })) {
    if (!Number.isInteger(number) || number < 0 || (field !== "maximum_retries" && number === 0)) errors.push(`${field} must be a bounded positive integer.`);
  }
  if (definition.runtime.allowed && (!definition.runtime.require_isolation || !definition.runtime.no_host_fallback)) errors.push("Runtime policies must require isolation and prohibit host fallback.");
  if (!definition.runtime.allowed && definition.allowed_audit_packages.some((id) => id === "runtime-validated" || id === "comprehensive-local")) errors.push("A non-runtime policy cannot allow runtime audit packages.");
  if (definition.template_id.startsWith("extensive-") && definition.required_control_ids.length !== knownControls.size) errors.push("Extensive policies must require every catalog control; target applicability is resolved per run.");
  if (definition.evidence_failure_policy === "block" && !definition.required_evidence_provider_ids.length) warnings.push("Blocking evidence policy has no required providers.");
  return { valid: errors.length === 0, errors, warnings, checksum: hashObject(definition) };
}

function nowIso(): string { return new Date().toISOString(); }
function policyKey(workspaceId: string, policyId: string): string { return `${workspaceId}:${policyId}`; }
function versionKey(workspaceId: string, versionId: string): string { return `${workspaceId}:${versionId}`; }
function eventId(policyId: string, eventType: string): string { return `${policyId}:event:${Date.now()}:${eventType}:${randomUUID()}`; }

async function openPolicyDb(rootDirOrOptions?: string | PersistenceReadOptions) {
  const options = typeof rootDirOrOptions === "string" ? { rootDir: rootDirOrOptions } : rootDirOrOptions;
  const location = resolvePersistenceLocation(options);
  const db = await openSqliteDatabase(location.rootDir);
  ensureSqliteSchema(db);
  return { db, location };
}

function writeEvent(db: any, event: PersistedSystemPolicyChangeEventRecord): void {
  upsertSqliteRecord({ db, tableName: "policy_change_events", recordKey: event.id, payload: event, createdAt: event.created_at, parentKey: policyKey(event.workspace_id, event.policy_id) });
}

function policyRows(db: any, workspaceId: string): PersistedSystemPolicyRecord[] {
  return readSqliteTable<PersistedSystemPolicyRecord>(db, "system_policies").filter((item) => item.workspace_id === workspaceId);
}

function versionRows(db: any, workspaceId: string, policyId?: string): PersistedSystemPolicyVersionRecord[] {
  return readSqliteTable<PersistedSystemPolicyVersionRecord>(db, "system_policy_versions").filter((item) => item.workspace_id === workspaceId && (!policyId || item.policy_id === policyId));
}

export async function listPersistedSystemPolicies(workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedSystemPolicyRecord[]> {
  const workspace = normalizeWorkspaceId(workspaceId);
  const { db } = await openPolicyDb(rootDirOrOptions);
  try { return policyRows(db, workspace).sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)); } finally { db.close(); }
}

export async function getPersistedSystemPolicy(policyId: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<SystemPolicyDetail | null> {
  const workspace = normalizeWorkspaceId(workspaceId);
  const { db } = await openPolicyDb(rootDirOrOptions);
  try {
    const policy = policyRows(db, workspace).find((item) => item.id === policyId);
    if (!policy) return null;
    const versions = versionRows(db, workspace, policyId).sort((a, b) => b.version - a.version);
    const bindings = readSqliteTable<PersistedSystemPolicyBindingRecord>(db, "system_policy_bindings").filter((item) => item.workspace_id === workspace && item.policy_id === policyId);
    const events = readSqliteTable<PersistedSystemPolicyChangeEventRecord>(db, "policy_change_events").filter((item) => item.workspace_id === workspace && item.policy_id === policyId).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const snapshots = readSqliteTable<PersistedPolicyResolutionSnapshotRecord>(db, "policy_resolution_snapshots").filter((item) => item.workspace_id === workspace && item.policy_id === policyId);
    return { policy, versions, bindings, events, runs_using_versions: versions.map((version) => ({ policy_version_id: version.id, run_ids: snapshots.filter((snapshot) => snapshot.policy_version_id === version.id).map((snapshot) => snapshot.run_id) })) };
  } finally { db.close(); }
}

export async function createPersistedSystemPolicy(input: { id?: string; name: string; description?: string; template_id?: SystemPolicyTemplateId; definition?: unknown; actor_id?: string; reason?: string; workspace_id?: string }, rootDirOrOptions?: string | PersistenceReadOptions): Promise<SystemPolicyDetail> {
  const workspace = normalizeWorkspaceId(input.workspace_id);
  const { db, location } = await openPolicyDb(rootDirOrOptions);
  try {
    const id = (input.id || input.name).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
    if (!id) throw new Error("system_policy_id_required");
    if (policyRows(db, workspace).some((item) => item.id === id)) throw new Error("system_policy_exists");
    const template = getBuiltinSystemPolicyTemplate(input.template_id ?? "agentic-static-safe");
    const definition = normalizeSystemPolicyDefinition(input.definition ?? template?.definition);
    const validation = validateSystemPolicyDefinition(definition);
    if (!validation.valid) throw new Error(`invalid_system_policy:${validation.errors.join(" ")}`);
    const timestamp = nowIso();
    const actor = input.actor_id?.trim() || "anonymous";
    const versionId = `${id}:v1`;
    const policy: PersistedSystemPolicyRecord = { id, workspace_id: workspace, name: input.name.trim(), description: input.description?.trim() || template?.description || "", status: "draft", scope: "workspace", current_version_id: versionId, active_version_id: null, is_default: false, created_by: actor, created_at: timestamp, updated_by: actor, updated_at: timestamp };
    const version: PersistedSystemPolicyVersionRecord = { id: versionId, policy_id: id, workspace_id: workspace, version: 1, state: "draft", schema_version: SYSTEM_POLICY_SCHEMA_VERSION, definition_json: definition, checksum: validation.checksum, created_by: actor, created_reason: input.reason?.trim() || `created from ${input.template_id ?? "agentic-static-safe"}`, created_at: timestamp, published_at: null };
    upsertSqliteRecord({ db, tableName: "system_policies", recordKey: policyKey(workspace, id), payload: policy, createdAt: timestamp, parentKey: workspace });
    upsertSqliteRecord({ db, tableName: "system_policy_versions", recordKey: versionKey(workspace, versionId), payload: version, createdAt: timestamp, parentKey: policyKey(workspace, id) });
    writeEvent(db, { id: eventId(id, "create"), workspace_id: workspace, policy_id: id, policy_version_id: versionId, event_type: input.reason === "import" ? "import" : "create", actor_id: actor, reason: input.reason?.trim() || "created", details_json: { template_id: input.template_id ?? "custom", checksum: version.checksum }, created_at: timestamp });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return { policy, versions: [version], bindings: [], events: [], runs_using_versions: [{ policy_version_id: versionId, run_ids: [] }] };
  } finally { db.close(); }
}

export async function createPersistedSystemPolicyVersion(policyId: string, input: { definition: unknown; actor_id?: string; reason: string; workspace_id?: string }, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedSystemPolicyVersionRecord> {
  const workspace = normalizeWorkspaceId(input.workspace_id);
  const { db, location } = await openPolicyDb(rootDirOrOptions);
  try {
    const policy = policyRows(db, workspace).find((item) => item.id === policyId);
    if (!policy || policy.status === "archived") throw new Error(policy ? "system_policy_archived" : "system_policy_not_found");
    const definition = normalizeSystemPolicyDefinition(input.definition);
    const validation = validateSystemPolicyDefinition(definition);
    if (!validation.valid) throw new Error(`invalid_system_policy:${validation.errors.join(" ")}`);
    const versions = versionRows(db, workspace, policyId);
    const nextNumber = Math.max(0, ...versions.map((item) => item.version)) + 1;
    const timestamp = nowIso();
    const actor = input.actor_id?.trim() || "anonymous";
    const version: PersistedSystemPolicyVersionRecord = { id: `${policyId}:v${nextNumber}`, policy_id: policyId, workspace_id: workspace, version: nextNumber, state: "draft", schema_version: SYSTEM_POLICY_SCHEMA_VERSION, definition_json: definition, checksum: validation.checksum, created_by: actor, created_reason: input.reason.trim(), created_at: timestamp, published_at: null };
    const updated: PersistedSystemPolicyRecord = { ...policy, current_version_id: version.id, updated_by: actor, updated_at: timestamp };
    upsertSqliteRecord({ db, tableName: "system_policy_versions", recordKey: versionKey(workspace, version.id), payload: version, createdAt: timestamp, parentKey: policyKey(workspace, policyId) });
    upsertSqliteRecord({ db, tableName: "system_policies", recordKey: policyKey(workspace, policyId), payload: updated, createdAt: policy.created_at, parentKey: workspace });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return version;
  } finally { db.close(); }
}

export async function validatePersistedSystemPolicy(policyId: string, workspaceId?: string, actorId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<SystemPolicyValidationResult> {
  const detail = await getPersistedSystemPolicy(policyId, workspaceId, rootDirOrOptions);
  if (!detail) throw new Error("system_policy_not_found");
  const current = detail.versions.find((item) => item.id === detail.policy.current_version_id);
  if (!current) throw new Error("system_policy_version_not_found");
  const validation = validateSystemPolicyDefinition(current.definition_json);
  const workspace = normalizeWorkspaceId(workspaceId);
  const { db, location } = await openPolicyDb(rootDirOrOptions);
  try {
    writeEvent(db, { id: eventId(policyId, "validate"), workspace_id: workspace, policy_id: policyId, policy_version_id: current.id, event_type: "validate", actor_id: actorId || "anonymous", reason: validation.valid ? "validation passed" : "validation failed", details_json: { ...validation }, created_at: nowIso() });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally { db.close(); }
  return validation;
}

async function activateVersion(args: { policyId: string; versionId: string; eventType: "publish" | "rollback"; actorId?: string; reason?: string; workspaceId?: string; rootDirOrOptions?: string | PersistenceReadOptions }): Promise<SystemPolicyDetail> {
  const workspace = normalizeWorkspaceId(args.workspaceId);
  const { db, location } = await openPolicyDb(args.rootDirOrOptions);
  try {
    const policy = policyRows(db, workspace).find((item) => item.id === args.policyId);
    const versions = versionRows(db, workspace, args.policyId);
    const selected = versions.find((item) => item.id === args.versionId);
    if (!policy || !selected) throw new Error(!policy ? "system_policy_not_found" : "system_policy_version_not_found");
    const validation = validateSystemPolicyDefinition(selected.definition_json);
    if (!validation.valid || validation.checksum !== selected.checksum) throw new Error(`invalid_system_policy:${validation.errors.join(" ") || "checksum mismatch"}`);
    const timestamp = nowIso();
    const actor = args.actorId || "anonymous";
    for (const version of versions) {
      const next = version.id === selected.id ? { ...version, state: "published" as const, published_at: version.published_at ?? timestamp } : version.state === "published" ? { ...version, state: "superseded" as const } : version;
      if (next !== version) upsertSqliteRecord({ db, tableName: "system_policy_versions", recordKey: versionKey(workspace, version.id), payload: next, createdAt: version.created_at, parentKey: policyKey(workspace, args.policyId) });
    }
    const updated: PersistedSystemPolicyRecord = { ...policy, status: "active", active_version_id: selected.id, current_version_id: selected.id, updated_by: actor, updated_at: timestamp };
    upsertSqliteRecord({ db, tableName: "system_policies", recordKey: policyKey(workspace, args.policyId), payload: updated, createdAt: policy.created_at, parentKey: workspace });
    writeEvent(db, { id: eventId(args.policyId, args.eventType), workspace_id: workspace, policy_id: args.policyId, policy_version_id: selected.id, event_type: args.eventType, actor_id: actor, reason: args.reason?.trim() || args.eventType, details_json: { checksum: selected.checksum }, created_at: timestamp });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally { db.close(); }
  return (await getPersistedSystemPolicy(args.policyId, workspace, args.rootDirOrOptions))!;
}

export async function publishPersistedSystemPolicy(policyId: string, actorId?: string, reason?: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<SystemPolicyDetail> {
  const detail = await getPersistedSystemPolicy(policyId, workspaceId, rootDirOrOptions);
  if (!detail) throw new Error("system_policy_not_found");
  return activateVersion({ policyId, versionId: detail.policy.current_version_id, eventType: "publish", actorId, reason, workspaceId, rootDirOrOptions });
}

export async function rollbackPersistedSystemPolicy(policyId: string, versionId: string, actorId?: string, reason?: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<SystemPolicyDetail> {
  return activateVersion({ policyId, versionId, eventType: "rollback", actorId, reason, workspaceId, rootDirOrOptions });
}

export async function setDefaultPersistedSystemPolicy(policyId: string, actorId?: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<SystemPolicyDetail> {
  const workspace = normalizeWorkspaceId(workspaceId);
  const { db, location } = await openPolicyDb(rootDirOrOptions);
  try {
    const policies = policyRows(db, workspace);
    const selected = policies.find((item) => item.id === policyId);
    if (!selected || selected.status !== "active" || !selected.active_version_id) throw new Error(!selected ? "system_policy_not_found" : "system_policy_not_active");
    const timestamp = nowIso();
    for (const policy of policies) {
      const next = { ...policy, is_default: policy.id === policyId, updated_by: actorId || "anonymous", updated_at: timestamp };
      upsertSqliteRecord({ db, tableName: "system_policies", recordKey: policyKey(workspace, policy.id), payload: next, createdAt: policy.created_at, parentKey: workspace });
    }
    const bindings = readSqliteTable<PersistedSystemPolicyBindingRecord>(db, "system_policy_bindings").filter((item) => item.workspace_id === workspace && item.binding_type === "default");
    for (const binding of bindings) upsertSqliteRecord({ db, tableName: "system_policy_bindings", recordKey: binding.id, payload: { ...binding, active: false, updated_at: timestamp }, createdAt: binding.created_at, parentKey: workspace });
    const binding: PersistedSystemPolicyBindingRecord = { id: `${workspace}:default`, workspace_id: workspace, project_id: null, target_ref: null, audit_package: null, binding_type: "default", policy_id: policyId, policy_version_id: selected.active_version_id, priority: 0, active: true, created_by: actorId || "anonymous", created_at: timestamp, updated_at: timestamp };
    upsertSqliteRecord({ db, tableName: "system_policy_bindings", recordKey: binding.id, payload: binding, createdAt: timestamp, parentKey: workspace });
    writeEvent(db, { id: eventId(policyId, "set_default"), workspace_id: workspace, policy_id: policyId, policy_version_id: selected.active_version_id, event_type: "set_default", actor_id: actorId || "anonymous", reason: "set as workspace default", details_json: {}, created_at: timestamp });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally { db.close(); }
  return (await getPersistedSystemPolicy(policyId, workspace, rootDirOrOptions))!;
}

export async function archivePersistedSystemPolicy(policyId: string, actorId?: string, reason?: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<SystemPolicyDetail> {
  const workspace = normalizeWorkspaceId(workspaceId);
  const { db, location } = await openPolicyDb(rootDirOrOptions);
  try {
    const policy = policyRows(db, workspace).find((item) => item.id === policyId);
    if (!policy) throw new Error("system_policy_not_found");
    if (policy.is_default) throw new Error("cannot_archive_default_system_policy");
    const timestamp = nowIso();
    const updated: PersistedSystemPolicyRecord = { ...policy, status: "archived", updated_by: actorId || "anonymous", updated_at: timestamp };
    upsertSqliteRecord({ db, tableName: "system_policies", recordKey: policyKey(workspace, policyId), payload: updated, createdAt: policy.created_at, parentKey: workspace });
    writeEvent(db, { id: eventId(policyId, "archive"), workspace_id: workspace, policy_id: policyId, policy_version_id: policy.active_version_id, event_type: "archive", actor_id: actorId || "anonymous", reason: reason?.trim() || "archived", details_json: {}, created_at: timestamp });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally { db.close(); }
  return (await getPersistedSystemPolicy(policyId, workspace, rootDirOrOptions))!;
}

export async function ensureBuiltinSystemPolicies(workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedSystemPolicyRecord[]> {
  const workspace = normalizeWorkspaceId(workspaceId);
  let policies = await listPersistedSystemPolicies(workspace, rootDirOrOptions);
  for (const template of listBuiltinSystemPolicyTemplates()) {
    if (policies.some((item) => item.id === template.id)) continue;
    await createPersistedSystemPolicy({ id: template.id, name: template.name, description: template.description, template_id: template.id, actor_id: "system", reason: "installed built-in safe policy", workspace_id: workspace }, rootDirOrOptions);
    await publishPersistedSystemPolicy(template.id, "system", "published built-in safe policy", workspace, rootDirOrOptions);
    policies = await listPersistedSystemPolicies(workspace, rootDirOrOptions);
  }
  if (!policies.some((item) => item.is_default && item.status === "active")) {
    await setDefaultPersistedSystemPolicy("agentic-static-safe", "system", workspace, rootDirOrOptions);
  }
  for (const [auditPackage, policyId] of [
    ["runtime-validated", "extensive-runtime-local-safe"],
    ["comprehensive-local", "extensive-runtime-local-safe"]
  ] as const) {
    const detail = await getPersistedSystemPolicy(policyId, workspace, rootDirOrOptions);
    const bindingId = `${workspace}:package:${auditPackage}`;
    if (detail?.bindings.some((item) => item.id === bindingId)) continue;
    await upsertPersistedSystemPolicyBinding({
      id: bindingId,
      policy_id: policyId,
      binding_type: "package",
      audit_package: auditPackage,
      priority: 10,
      actor_id: "system",
      workspace_id: workspace
    }, rootDirOrOptions);
  }
  return listPersistedSystemPolicies(workspace, rootDirOrOptions);
}

export async function upsertPersistedSystemPolicyBinding(input: {
  id?: string;
  policy_id: string;
  binding_type: "project" | "target" | "package";
  project_id?: string | null;
  target_ref?: string | null;
  audit_package?: AuditPackageId | null;
  priority?: number;
  actor_id?: string;
  workspace_id?: string;
}, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedSystemPolicyBindingRecord> {
  const workspace = normalizeWorkspaceId(input.workspace_id);
  const { db, location } = await openPolicyDb(rootDirOrOptions);
  try {
    const policy = policyRows(db, workspace).find((item) => item.id === input.policy_id && item.status === "active" && item.active_version_id);
    if (!policy?.active_version_id) throw new Error("system_policy_not_active");
    if (input.binding_type === "project" && !input.project_id) throw new Error("system_policy_project_binding_requires_project_id");
    if (input.binding_type === "target" && !input.target_ref) throw new Error("system_policy_target_binding_requires_target_ref");
    if (input.binding_type === "package" && !input.audit_package) throw new Error("system_policy_package_binding_requires_audit_package");
    const timestamp = nowIso();
    const id = input.id?.trim() || `${workspace}:${input.binding_type}:${input.project_id ?? input.target_ref ?? input.audit_package}`;
    const existing = readSqliteTable<PersistedSystemPolicyBindingRecord>(db, "system_policy_bindings").find((item) => item.id === id);
    const binding: PersistedSystemPolicyBindingRecord = {
      id,
      workspace_id: workspace,
      project_id: input.project_id?.trim() || null,
      target_ref: input.target_ref?.trim() || null,
      audit_package: input.audit_package ?? null,
      binding_type: input.binding_type,
      policy_id: policy.id,
      policy_version_id: policy.active_version_id,
      priority: Number.isInteger(input.priority) ? Math.max(0, Number(input.priority)) : 100,
      active: true,
      created_by: existing?.created_by ?? input.actor_id?.trim() ?? "anonymous",
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp
    };
    upsertSqliteRecord({ db, tableName: "system_policy_bindings", recordKey: id, payload: binding, createdAt: binding.created_at, parentKey: workspace });
    writeEvent(db, { id: eventId(policy.id, "bind"), workspace_id: workspace, policy_id: policy.id, policy_version_id: policy.active_version_id, event_type: "bind", actor_id: input.actor_id || "anonymous", reason: `set ${input.binding_type} binding`, details_json: { binding_id: id }, created_at: timestamp });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return binding;
  } finally { db.close(); }
}

export async function deactivatePersistedSystemPolicyBinding(bindingId: string, actorId?: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedSystemPolicyBindingRecord> {
  const workspace = normalizeWorkspaceId(workspaceId);
  const { db, location } = await openPolicyDb(rootDirOrOptions);
  try {
    const binding = readSqliteTable<PersistedSystemPolicyBindingRecord>(db, "system_policy_bindings").find((item) => item.id === bindingId && item.workspace_id === workspace);
    if (!binding) throw new Error("system_policy_binding_not_found");
    const updated = { ...binding, active: false, updated_at: nowIso() };
    upsertSqliteRecord({ db, tableName: "system_policy_bindings", recordKey: binding.id, payload: updated, createdAt: binding.created_at, parentKey: workspace });
    writeEvent(db, { id: eventId(binding.policy_id, "unbind"), workspace_id: workspace, policy_id: binding.policy_id, policy_version_id: binding.policy_version_id, event_type: "unbind", actor_id: actorId || "anonymous", reason: "deactivated binding", details_json: { binding_id: binding.id }, created_at: updated.updated_at });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return updated;
  } finally { db.close(); }
}

function requestTargetRef(request: AuditRequest): string | null { return request.repo_url ?? request.local_path ?? request.endpoint_url ?? null; }

export async function resolvePersistedSystemPolicy(args: { request: AuditRequest; target_class?: TargetClass | null; analysis?: AnalysisSummary | null; run_id?: string | null; rootDirOrOptions?: string | PersistenceReadOptions }): Promise<ResolvedSystemPolicySnapshot | null> {
  const workspace = normalizeWorkspaceId(args.request.workspace_id);
  const project = normalizeProjectId(args.request.project_id);
  const targetRef = requestTargetRef(args.request);
  await ensureBuiltinSystemPolicies(workspace, args.rootDirOrOptions);
  const { db } = await openPolicyDb(args.rootDirOrOptions);
  try {
    const policies = policyRows(db, workspace);
    const versions = versionRows(db, workspace);
    const bindings = readSqliteTable<PersistedSystemPolicyBindingRecord>(db, "system_policy_bindings").filter((item) => item.workspace_id === workspace && item.active);
    const candidates = bindings.filter((binding) => {
      if (binding.binding_type === "default") return true;
      if (binding.binding_type === "project") return binding.project_id === project;
      if (binding.binding_type === "target") return !!targetRef && binding.target_ref === targetRef;
      if (binding.binding_type === "package") return !!args.request.audit_package && binding.audit_package === args.request.audit_package;
      return false;
    }).sort((a, b) => b.priority - a.priority || ({ default: 0, package: 1, project: 2, target: 3 }[b.binding_type] - { default: 0, package: 1, project: 2, target: 3 }[a.binding_type]));
    const selectedBinding = candidates[0];
    const bindingSpecificity = (binding: PersistedSystemPolicyBindingRecord) => ({ default: 0, package: 1, project: 2, target: 3 })[binding.binding_type];
    if (selectedBinding && candidates[1] && candidates[1].priority === selectedBinding.priority && bindingSpecificity(candidates[1]) === bindingSpecificity(selectedBinding) && candidates[1].policy_id !== selectedBinding.policy_id) {
      throw new Error("ambiguous_system_policy_bindings");
    }
    const selectedPolicy = selectedBinding ? policies.find((item) => item.id === selectedBinding.policy_id && item.status === "active") : policies.find((item) => item.is_default && item.status === "active");
    if (!selectedPolicy?.active_version_id) return null;
    const selectedVersion = versions.find((item) => item.id === (selectedBinding?.policy_version_id ?? selectedPolicy.active_version_id));
    if (!selectedVersion || selectedVersion.state !== "published") throw new Error("ambiguous_or_invalid_system_policy_resolution");
    const definition = selectedVersion.definition_json;
    const requestedPackage = args.request.audit_package ?? definition.default_audit_package;
    if (!definition.allowed_audit_packages.includes(requestedPackage)) throw new Error(`system_policy_disallows_audit_package:${requestedPackage}`);
    if (!definition.exceptions.allow_per_run_narrowing && requestedPackage !== definition.default_audit_package) throw new Error("system_policy_disallows_per_run_package_override");
    const provider = args.request.llm_provider ?? "openai_codex";
    if (!definition.providers.allowed_provider_ids.includes(provider)) throw new Error(`system_policy_disallows_provider:${provider}`);
    const workload = args.request.llm_workload_class ?? "interactive_operator";
    if (!definition.providers.allowed_workload_classes.includes(workload)) throw new Error(`system_policy_disallows_workload:${workload}`);
    const credentialClass = args.request.llm_credential_class ?? (provider === "openai_codex" ? "chatgpt_session" : provider === "openai" ? "api_key" : "none");
    if (!definition.providers.allowed_credential_classes.includes(credentialClass)) throw new Error(`system_policy_disallows_credential_class:${credentialClass}`);
    if (definition.providers.allowed_model_ids.length && args.request.llm_model && !definition.providers.allowed_model_ids.includes(args.request.llm_model)) throw new Error(`system_policy_disallows_model:${args.request.llm_model}`);
    if ((args.request.llm_max_requests ?? definition.providers.maximum_agent_calls) > definition.providers.maximum_agent_calls) throw new Error("system_policy_agent_call_budget_exceeded");
    if ((args.request.llm_max_tokens ?? definition.providers.maximum_total_tokens) > definition.providers.maximum_total_tokens) throw new Error("system_policy_token_budget_exceeded");
    const runtimeRequested = ["build", "runtime", "validate"].includes(args.request.run_mode ?? "static") || ["runtime-validated", "comprehensive-local"].includes(requestedPackage);
    if (runtimeRequested && !definition.runtime.allowed) throw new Error("system_policy_disallows_runtime");
    const resolvedCatalog = args.analysis && args.target_class
      ? getCandidateControls({ analysis: args.analysis, targetClass: args.target_class, request: args.request })
      : getControlCatalog();
    const catalogIds = new Set(resolvedCatalog.map((item) => item.control_id));
    const requiredControlIds = definition.required_control_ids.filter((id) => catalogIds.has(id));
    const timestamp = nowIso();
    const snapshotBase: Omit<ResolvedSystemPolicySnapshot, "checksum"> = { schema_version: SYSTEM_POLICY_RESOLUTION_SCHEMA_VERSION, run_id: args.run_id ?? null, workspace_id: workspace, project_id: project, target_ref: targetRef, target_class: args.target_class ?? null, policy_id: selectedPolicy.id, policy_version_id: selectedVersion.id, policy_version: selectedVersion.version, policy_checksum: selectedVersion.checksum, control_catalog_version: CONTROL_CATALOG_VERSION, audit_package: requestedPackage, applicable_required_control_ids: requiredControlIds, required_evidence_provider_ids: definition.required_evidence_provider_ids, definition_json: definition, resolution_layers: ["builtin-safe-defaults", selectedBinding ? `${selectedBinding.binding_type}:${selectedBinding.id}` : `workspace-default:${selectedPolicy.id}`, "per-run-narrowing"], warnings: args.analysis && args.target_class ? [] : ["Target applicability is conservative until repository analysis completes."], resolved_at: timestamp };
    return { ...snapshotBase, checksum: hashObject({ ...snapshotBase, run_id: null, resolved_at: null }) };
  } finally { db.close(); }
}

export function applyResolvedSystemPolicyToRequest(request: AuditRequest, snapshot: ResolvedSystemPolicySnapshot): AuditRequest {
  const hints = request.hints && typeof request.hints === "object" ? request.hints : {};
  const constraints = (hints as any).planner_control_constraints && typeof (hints as any).planner_control_constraints === "object" ? (hints as any).planner_control_constraints : {};
  const previouslyApplied = new Set(uniqueStrings((hints as any).system_policy?.applied_required_control_ids));
  const requestedRequired = uniqueStrings(constraints.required_control_ids).filter((id) => !previouslyApplied.has(id));
  const requestedExcluded = new Set(uniqueStrings(constraints.excluded_control_ids));
  const required = [...new Set([...snapshot.applicable_required_control_ids, ...requestedRequired])];
  const externalTools = (hints as any).external_audit_tools && typeof (hints as any).external_audit_tools === "object" ? (hints as any).external_audit_tools : {};
  const requiredStaticTools = snapshot.required_evidence_provider_ids.filter((id) => id !== "local_runtime" && id !== "repo_analysis");
  const effectiveExternalTools = requiredStaticTools.length
    ? { ...externalTools, included_tool_ids: [...new Set([...uniqueStrings(externalTools.included_tool_ids), ...requiredStaticTools])] }
    : (hints as any).external_audit_tools;
  const requestedPackageOverrides = (hints as any).audit_package_overrides && typeof (hints as any).audit_package_overrides === "object" ? (hints as any).audit_package_overrides : {};
  const thresholdRank = { low: 0, medium: 1, high: 2 };
  const requestedThreshold = requestedPackageOverrides.publishability_threshold;
  const requiredThreshold = snapshot.definition_json.review.publishability_threshold;
  const effectiveThreshold = requestedThreshold in thresholdRank && thresholdRank[requestedThreshold as keyof typeof thresholdRank] > thresholdRank[requiredThreshold]
    ? requestedThreshold
    : requiredThreshold;
  const effectivePackageOverrides = {
    ...requestedPackageOverrides,
    enabled_lanes: undefined,
    max_agent_calls: Math.min(Number(requestedPackageOverrides.max_agent_calls) || snapshot.definition_json.providers.maximum_agent_calls, snapshot.definition_json.providers.maximum_agent_calls),
    max_total_tokens: Math.min(Number(requestedPackageOverrides.max_total_tokens) || snapshot.definition_json.providers.maximum_total_tokens, snapshot.definition_json.providers.maximum_total_tokens),
    max_rerun_rounds: Math.min(Number(requestedPackageOverrides.max_rerun_rounds) || snapshot.definition_json.providers.maximum_retries, snapshot.definition_json.providers.maximum_retries),
    publishability_threshold: effectiveThreshold
  };
  for (const id of snapshot.applicable_required_control_ids) {
    if (requestedExcluded.has(id) && !snapshot.definition_json.exceptions.allow_approved_weakening) throw new Error(`system_policy_required_control_cannot_be_excluded:${id}`);
  }
  return {
    ...request,
    audit_package: request.audit_package ?? snapshot.audit_package,
    llm_max_requests: Math.min(request.llm_max_requests ?? snapshot.definition_json.providers.maximum_agent_calls, snapshot.definition_json.providers.maximum_agent_calls),
    llm_max_tokens: Math.min(request.llm_max_tokens ?? snapshot.definition_json.providers.maximum_total_tokens, snapshot.definition_json.providers.maximum_total_tokens),
    hints: {
      ...hints,
      planner_control_constraints: { ...constraints, selection_mode: "constrained", required_control_ids: required, excluded_control_ids: uniqueStrings(constraints.excluded_control_ids).filter((id) => !snapshot.applicable_required_control_ids.includes(id)) },
      ...(effectiveExternalTools ? { external_audit_tools: effectiveExternalTools } : {}),
      audit_package_overrides: effectivePackageOverrides,
      evidence_failure_policy: snapshot.definition_json.evidence_failure_policy,
      runtime_sandbox: snapshot.definition_json.runtime.allowed ? { ...((hints as any).runtime_sandbox ?? {}), require_isolation: true, no_host_fallback: true, network_policy: snapshot.definition_json.runtime.network_policy } : (hints as any).runtime_sandbox,
      system_policy: { resolved_snapshot: snapshot, applied_required_control_ids: snapshot.applicable_required_control_ids, required_evidence_provider_ids: snapshot.required_evidence_provider_ids, evidence_failure_policy: snapshot.definition_json.evidence_failure_policy, runtime: snapshot.definition_json.runtime, review: snapshot.definition_json.review, retention: snapshot.definition_json.retention }
    }
  };
}

export async function resolveAndApplySystemPolicy(request: AuditRequest, args?: { target_class?: TargetClass | null; analysis?: AnalysisSummary | null; run_id?: string | null; rootDirOrOptions?: string | PersistenceReadOptions }): Promise<{ request: AuditRequest; snapshot: ResolvedSystemPolicySnapshot | null }> {
  const snapshot = await resolvePersistedSystemPolicy({ request, target_class: args?.target_class, analysis: args?.analysis, run_id: args?.run_id, rootDirOrOptions: args?.rootDirOrOptions });
  return { request: snapshot ? applyResolvedSystemPolicyToRequest(request, snapshot) : request, snapshot };
}

export async function persistPolicyResolutionSnapshot(snapshot: ResolvedSystemPolicySnapshot, runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedPolicyResolutionSnapshotRecord> {
  const { db, location } = await openPolicyDb(rootDirOrOptions);
  try {
    const existing = readSqliteTable<PersistedPolicyResolutionSnapshotRecord>(db, "policy_resolution_snapshots").find((item) => item.run_id === runId);
    if (existing) {
      if (existing.checksum !== snapshot.checksum || existing.policy_version_id !== snapshot.policy_version_id) throw new Error("policy_resolution_snapshot_is_immutable");
      return existing;
    }
    const record: PersistedPolicyResolutionSnapshotRecord = { ...snapshot, run_id: runId };
    upsertSqliteRecord({ db, tableName: "policy_resolution_snapshots", recordKey: runId, payload: record, runId, createdAt: record.resolved_at, parentKey: policyKey(record.workspace_id, record.policy_id) });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally { db.close(); }
}

export async function readPersistedPolicyResolutionSnapshot(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedPolicyResolutionSnapshotRecord | null> {
  const { db } = await openPolicyDb(rootDirOrOptions);
  try { return readSqliteTable<PersistedPolicyResolutionSnapshotRecord>(db, "policy_resolution_snapshots").find((item) => item.run_id === runId) ?? null; } finally { db.close(); }
}

export function exportSystemPolicy(detail: SystemPolicyDetail): Record<string, unknown> {
  return { export_schema: { schema_name: "system_policy.v1", schema_version: "1.0.0", generated_at: nowIso() }, policy: detail.policy, versions: detail.versions, bindings: detail.bindings, events: detail.events };
}

export async function importSystemPolicy(payload: any, actorId?: string, workspaceId?: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<SystemPolicyDetail> {
  const policy = payload?.policy;
  const version = Array.isArray(payload?.versions) ? payload.versions[0] : null;
  if (!policy?.name || !version?.definition_json) throw new Error("invalid_system_policy_import");
  return createPersistedSystemPolicy({ id: policy.id, name: policy.name, description: policy.description, definition: version.definition_json, actor_id: actorId, reason: "import", workspace_id: workspaceId }, rootDirOrOptions);
}
