import fs from "node:fs/promises";
import path from "node:path";

import type { FindingReviewPriority } from "../contracts.js";
import { buildFindingEvidenceFingerprint, findingDispositionSignature } from "./finding-dispositions.js";
import type { PersistenceReadOptions } from "./backend.js";
import { resolvePersistenceLocation } from "./backend.js";
import type { PersistedFindingRecord, PersistedRemediationItemRecord, RemediationItemStatus } from "./contracts.js";
import { normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import { getPersistedRun } from "./query.js";
import { ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";
import { readPersistedFindings } from "./run-details.js";

export interface RemediationItemInput {
  finding_id: string;
  status?: RemediationItemStatus;
  owner_id?: string | null;
  priority?: FindingReviewPriority | null;
  due_at?: string | null;
  summary?: string | null;
  acceptance_criteria?: string | null;
  external_provider?: "manual" | "github" | "jira" | null;
  external_issue_url?: string | null;
  external_issue_number?: string | null;
  external_pr_url?: string | null;
  external_pr_number?: string | null;
  fix_commit_sha?: string | null;
  validation_run_id?: string | null;
  resolution_notes?: string | null;
  actor_id: string;
  metadata?: Record<string, unknown> | null;
}

export interface RemediationItemUpdateInput extends Partial<Omit<RemediationItemInput, "finding_id" | "actor_id">> {
  actor_id: string;
}

const tableName = "remediation_items";

async function readJsonTable<T>(rootDir: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(path.join(rootDir, `${tableName}.json`), "utf8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

async function readTable<T>(rootDir: string): Promise<T[]> {
  if (await hasSqliteDatabase(rootDir)) {
    const db = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(db);
      return readSqliteTable<T>(db, tableName);
    } finally {
      db.close();
    }
  }
  return readJsonTable<T>(rootDir);
}

function compactString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeStatus(value: unknown, fallback: RemediationItemStatus): RemediationItemStatus {
  const candidate = String(value ?? "");
  if (["open", "fix_in_progress", "fix_ready_for_validation", "verification_pending", "resolved", "reopened"].includes(candidate)) {
    return candidate as RemediationItemStatus;
  }
  return fallback;
}

function defaultSummary(finding: PersistedFindingRecord): string {
  return `Remediate confirmed finding: ${finding.title || finding.id}`;
}

function buildMetadata(input: Record<string, unknown> | null | undefined, finding: PersistedFindingRecord): Record<string, unknown> {
  return {
    ...(input ?? {}),
    evidence_fingerprint: buildFindingEvidenceFingerprint(finding),
    finding_title: finding.title ?? null,
    finding_severity: finding.severity ?? null
  };
}

export async function readPersistedRemediationItemsForRun(
  runId: string,
  rootDirOrOptions?: string | PersistenceReadOptions
): Promise<PersistedRemediationItemRecord[]> {
  const location = typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
  return (await readTable<PersistedRemediationItemRecord>(location.rootDir))
    .filter((item) => item.run_id === runId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export async function upsertPersistedRemediationItem(args: {
  runId: string;
  input: RemediationItemInput;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedRemediationItemRecord> {
  const location = typeof args.rootDirOrOptions === "string" || !args.rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: args.rootDirOrOptions })
    : resolvePersistenceLocation(args.rootDirOrOptions);
  const run = await getPersistedRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!run) throw new Error("run_not_found");
  const findings = await readPersistedFindings(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  const finding = findings.find((item) => item.id === args.input.finding_id);
  if (!finding) throw new Error("finding_not_found");
  const existing = (await readPersistedRemediationItemsForRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode }))
    .find((item) => item.finding_id === args.input.finding_id);
  const nowIso = new Date().toISOString();
  const record: PersistedRemediationItemRecord = {
    id: existing?.id ?? `${args.runId}:remediation-item:${args.input.finding_id}`,
    run_id: args.runId,
    workspace_id: normalizeWorkspaceId(run.workspace_id),
    project_id: normalizeProjectId(run.project_id),
    finding_id: args.input.finding_id,
    finding_signature: existing?.finding_signature ?? findingDispositionSignature(finding),
    status: normalizeStatus(args.input.status, existing?.status ?? "open"),
    owner_id: compactString(args.input.owner_id) ?? existing?.owner_id ?? null,
    priority: args.input.priority ?? existing?.priority ?? null,
    due_at: compactString(args.input.due_at) ?? existing?.due_at ?? null,
    summary: compactString(args.input.summary) ?? existing?.summary ?? defaultSummary(finding),
    acceptance_criteria: compactString(args.input.acceptance_criteria) ?? existing?.acceptance_criteria ?? null,
    external_provider: args.input.external_provider ?? existing?.external_provider ?? null,
    external_issue_url: compactString(args.input.external_issue_url) ?? existing?.external_issue_url ?? null,
    external_issue_number: compactString(args.input.external_issue_number) ?? existing?.external_issue_number ?? null,
    external_pr_url: compactString(args.input.external_pr_url) ?? existing?.external_pr_url ?? null,
    external_pr_number: compactString(args.input.external_pr_number) ?? existing?.external_pr_number ?? null,
    fix_commit_sha: compactString(args.input.fix_commit_sha) ?? existing?.fix_commit_sha ?? null,
    validation_run_id: compactString(args.input.validation_run_id) ?? existing?.validation_run_id ?? null,
    resolution_notes: compactString(args.input.resolution_notes) ?? existing?.resolution_notes ?? null,
    created_by: existing?.created_by ?? args.input.actor_id,
    created_at: existing?.created_at ?? nowIso,
    updated_by: args.input.actor_id,
    updated_at: nowIso,
    resolved_at: normalizeStatus(args.input.status, existing?.status ?? "open") === "resolved" ? existing?.resolved_at ?? nowIso : null,
    metadata_json: buildMetadata(args.input.metadata, finding)
  };
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({
      db,
      tableName,
      recordKey: record.id,
      payload: record,
      runId: record.run_id,
      createdAt: record.created_at,
      targetId: run.target_id,
      parentKey: record.run_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return record;
}

export async function updatePersistedRemediationItem(args: {
  runId: string;
  remediationItemId: string;
  input: RemediationItemUpdateInput;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedRemediationItemRecord> {
  const location = typeof args.rootDirOrOptions === "string" || !args.rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: args.rootDirOrOptions })
    : resolvePersistenceLocation(args.rootDirOrOptions);
  const existing = (await readPersistedRemediationItemsForRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode }))
    .find((item) => item.id === args.remediationItemId);
  if (!existing) throw new Error("remediation_item_not_found");
  return upsertPersistedRemediationItem({
    runId: args.runId,
    rootDirOrOptions: { rootDir: location.rootDir, dbMode: location.mode },
    input: {
      finding_id: existing.finding_id,
      status: args.input.status ?? existing.status,
      owner_id: args.input.owner_id !== undefined ? args.input.owner_id : existing.owner_id,
      priority: args.input.priority !== undefined ? args.input.priority : existing.priority,
      due_at: args.input.due_at !== undefined ? args.input.due_at : existing.due_at,
      summary: args.input.summary !== undefined ? args.input.summary : existing.summary,
      acceptance_criteria: args.input.acceptance_criteria !== undefined ? args.input.acceptance_criteria : existing.acceptance_criteria,
      external_provider: args.input.external_provider !== undefined ? args.input.external_provider : existing.external_provider,
      external_issue_url: args.input.external_issue_url !== undefined ? args.input.external_issue_url : existing.external_issue_url,
      external_issue_number: args.input.external_issue_number !== undefined ? args.input.external_issue_number : existing.external_issue_number,
      external_pr_url: args.input.external_pr_url !== undefined ? args.input.external_pr_url : existing.external_pr_url,
      external_pr_number: args.input.external_pr_number !== undefined ? args.input.external_pr_number : existing.external_pr_number,
      fix_commit_sha: args.input.fix_commit_sha !== undefined ? args.input.fix_commit_sha : existing.fix_commit_sha,
      validation_run_id: args.input.validation_run_id !== undefined ? args.input.validation_run_id : existing.validation_run_id,
      resolution_notes: args.input.resolution_notes !== undefined ? args.input.resolution_notes : existing.resolution_notes,
      actor_id: args.input.actor_id,
      metadata: existing.metadata_json && typeof existing.metadata_json === "object" ? existing.metadata_json as Record<string, unknown> : null
    }
  });
}
