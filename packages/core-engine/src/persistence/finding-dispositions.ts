import { normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import type { PersistenceReadOptions } from "./backend.js";
import { resolvePersistenceLocation } from "./backend.js";
import type { PersistedFindingDispositionRecord } from "./contracts.js";
import { getPersistedRun } from "./query.js";
import { ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

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

export function findingDispositionSignature(input: { category?: string | null; title?: string | null }): string {
  return `${String(input.category ?? "unknown").trim().toLowerCase()}::${String(input.title ?? "").trim().toLowerCase()}`;
}

export function buildFindingEvidenceFingerprint(input: {
  category?: string | null;
  title?: string | null;
  severity?: string | null;
  publication_state?: string | null;
  evidence_json?: unknown;
}): string {
  const evidence = Array.isArray(input.evidence_json) ? input.evidence_json.map((item) => String(item)).sort() : [];
  return JSON.stringify({
    signature: findingDispositionSignature(input),
    severity: String(input.severity ?? ""),
    publication_state: String(input.publication_state ?? ""),
    evidence
  });
}

function isDispositionExpired(record: PersistedFindingDispositionRecord, nowIso = new Date().toISOString()): boolean {
  return Boolean(record.expires_at && record.expires_at < nowIso);
}

function matchesFinding(record: PersistedFindingDispositionRecord, finding: { id: string; category?: string | null; title?: string | null }): boolean {
  if (record.scope_level === "run") return record.finding_id === finding.id;
  return Boolean(record.finding_signature && record.finding_signature === findingDispositionSignature(finding));
}

function compareDispositionPrecedence(left: PersistedFindingDispositionRecord, right: PersistedFindingDispositionRecord): number {
  const scopeRank = (value: PersistedFindingDispositionRecord["scope_level"]): number => value === "run" ? 2 : 1;
  if (scopeRank(right.scope_level) !== scopeRank(left.scope_level)) return scopeRank(right.scope_level) - scopeRank(left.scope_level);
  if (right.created_at !== left.created_at) return right.created_at.localeCompare(left.created_at);
  return right.id.localeCompare(left.id);
}

export interface FindingDispositionInput {
  disposition_type: PersistedFindingDispositionRecord["disposition_type"];
  scope_level: PersistedFindingDispositionRecord["scope_level"];
  finding_id: string;
  finding_signature?: string | null;
  reason: string;
  notes?: string | null;
  created_by: string;
  created_at?: string;
  expires_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface FindingDispositionUpdateInput {
  reason?: string;
  notes?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ResolvedFindingDisposition {
  finding_id: string;
  finding_signature: string;
  effective_status: "active" | "expired" | "revoked" | "none";
  effective_disposition: PersistedFindingDispositionRecord | null;
  active_dispositions: PersistedFindingDispositionRecord[];
  needs_review: boolean;
  review_reason: string | null;
  governance_owner_id: string | null;
  governance_reviewed_at: string | null;
  governance_review_due_by: string | null;
}

export async function readPersistedFindingDispositionsForRun(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedFindingDispositionRecord[]> {
  const location = resolveLocation(rootDirOrOptions);
  const run = await getPersistedRun(runId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!run) return [];
  const rows = await readTable<PersistedFindingDispositionRecord>(location.rootDir, "finding_dispositions");
  const workspaceId = normalizeWorkspaceId(run.workspace_id);
  const projectId = normalizeProjectId(run.project_id);
  return rows
    .filter((item) => item.workspace_id === workspaceId && item.project_id === projectId)
    .filter((item) => item.scope_level === "project" || item.run_id === runId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export function resolveFindingDispositions(args: {
  findings: Array<{ id: string; category?: string | null; title?: string | null; severity?: string | null; publication_state?: string | null; evidence_json?: unknown }>;
  dispositions: PersistedFindingDispositionRecord[];
  nowIso?: string;
}): ResolvedFindingDisposition[] {
  const nowIso = args.nowIso ?? new Date().toISOString();
  return args.findings.map((finding) => {
    const related = args.dispositions.filter((item) => matchesFinding(item, finding));
    const activeDispositions = related.filter((item) => item.status === "active" && !isDispositionExpired(item, nowIso));
    const effectiveDisposition = [...activeDispositions].sort(compareDispositionPrecedence)[0] ?? null;
    const latest = [...related].sort(compareDispositionPrecedence)[0] ?? null;
    const effectiveStatus: ResolvedFindingDisposition["effective_status"] = effectiveDisposition
      ? "active"
      : latest?.status === "revoked"
        ? "revoked"
        : related.some((item) => isDispositionExpired(item, nowIso))
          ? "expired"
          : "none";
    const metadata = effectiveDisposition?.metadata_json && typeof effectiveDisposition.metadata_json === "object"
      ? effectiveDisposition.metadata_json as Record<string, unknown>
      : {};
    const governanceOwnerId = typeof metadata.owner_id === "string" ? metadata.owner_id : null;
    const governanceReviewedAt = typeof metadata.reviewed_at === "string" ? metadata.reviewed_at : null;
    const governanceReviewDueBy = typeof metadata.review_due_by === "string" ? metadata.review_due_by : null;
    const storedEvidenceFingerprint = typeof metadata.evidence_fingerprint === "string" ? metadata.evidence_fingerprint : null;
    const currentEvidenceFingerprint = buildFindingEvidenceFingerprint(finding);
    let reviewReason: string | null = null;
    if (effectiveStatus === "expired") {
      reviewReason = "an earlier suppression or waiver expired and needs explicit re-review";
    } else if (effectiveDisposition?.scope_level === "project" && effectiveDisposition.disposition_type === "waiver" && (!governanceOwnerId || !governanceReviewedAt)) {
      reviewReason = "project waiver is missing explicit owner or review timestamp governance metadata";
    } else if (effectiveDisposition?.scope_level === "project" && effectiveDisposition.disposition_type === "waiver" && governanceReviewDueBy && governanceReviewDueBy < nowIso) {
      reviewReason = "project waiver review due date passed and needs explicit re-review";
    } else if (effectiveDisposition && storedEvidenceFingerprint && storedEvidenceFingerprint !== currentEvidenceFingerprint) {
      reviewReason = "finding evidence changed since the active suppression or waiver was reviewed";
    } else if (effectiveDisposition && !storedEvidenceFingerprint) {
      reviewReason = "active suppression or waiver predates evidence fingerprint tracking and should be re-reviewed";
    }
    return {
      finding_id: finding.id,
      finding_signature: findingDispositionSignature(finding),
      effective_status: effectiveStatus,
      effective_disposition: effectiveDisposition,
      active_dispositions: activeDispositions.sort(compareDispositionPrecedence),
      needs_review: Boolean(reviewReason),
      review_reason: reviewReason,
      governance_owner_id: governanceOwnerId,
      governance_reviewed_at: governanceReviewedAt,
      governance_review_due_by: governanceReviewDueBy
    };
  });
}

export async function createPersistedFindingDisposition(args: {
  runId: string;
  input: FindingDispositionInput;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedFindingDispositionRecord> {
  const location = resolveLocation(args.rootDirOrOptions);
  const run = await getPersistedRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!run) throw new Error("run_not_found");
  const createdAt = args.input.created_at ?? new Date().toISOString();
  const reason = String(args.input.reason ?? "").trim();
  if (!reason) throw new Error("disposition_reason_required");
  if (args.input.scope_level === "project" && !args.input.finding_signature) throw new Error("finding_signature_required");
  const record: PersistedFindingDispositionRecord = {
    id: `${args.runId}:finding-disposition:${createdAt}:${args.input.created_by}:${args.input.disposition_type}:${Math.random().toString(36).slice(2, 10)}`,
    run_id: args.runId,
    workspace_id: normalizeWorkspaceId(run.workspace_id),
    project_id: normalizeProjectId(run.project_id),
    finding_id: args.input.finding_id ?? null,
    finding_signature: args.input.finding_signature ?? null,
    disposition_type: args.input.disposition_type,
    scope_level: args.input.scope_level,
    status: "active",
    reason,
    notes: args.input.notes ?? null,
    created_by: args.input.created_by,
    created_at: createdAt,
    expires_at: args.input.expires_at ?? null,
    revoked_at: null,
    metadata_json: args.input.metadata ?? null
  };
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({
      db,
      tableName: "finding_dispositions",
      recordKey: record.id,
      payload: record,
      runId: record.run_id,
      createdAt: record.created_at,
      targetId: run.target_id,
      parentKey: record.run_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
}

export async function updatePersistedFindingDisposition(args: {
  runId: string;
  dispositionId: string;
  input: FindingDispositionUpdateInput;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedFindingDispositionRecord> {
  const location = resolveLocation(args.rootDirOrOptions);
  const run = await getPersistedRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!run) throw new Error("run_not_found");
  const rows = await readPersistedFindingDispositionsForRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  const existing = rows.find((item) => item.id === args.dispositionId);
  if (!existing) throw new Error("finding_disposition_not_found");
  if (existing.status !== "active") throw new Error("finding_disposition_not_editable");
  const reason = args.input.reason === undefined ? existing.reason : String(args.input.reason ?? "").trim();
  if (!reason) throw new Error("disposition_reason_required");
  const record: PersistedFindingDispositionRecord = {
    ...existing,
    reason,
    notes: args.input.notes === undefined ? existing.notes : args.input.notes ?? null,
    expires_at: args.input.expires_at === undefined ? existing.expires_at : args.input.expires_at ?? null,
    metadata_json: args.input.metadata === undefined ? existing.metadata_json : args.input.metadata ?? null
  };
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({
      db,
      tableName: "finding_dispositions",
      recordKey: record.id,
      payload: record,
      runId: record.run_id,
      createdAt: record.created_at,
      targetId: run.target_id,
      parentKey: record.run_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
}

export async function revokePersistedFindingDisposition(args: {
  runId: string;
  dispositionId: string;
  revokedBy: string;
  revokedAt?: string;
  notes?: string | null;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedFindingDispositionRecord> {
  const location = resolveLocation(args.rootDirOrOptions);
  const run = await getPersistedRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!run) throw new Error("run_not_found");
  const rows = await readPersistedFindingDispositionsForRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  const existing = rows.find((item) => item.id === args.dispositionId);
  if (!existing) throw new Error("finding_disposition_not_found");
  if (existing.status === "revoked") return existing;
  const revokedAt = args.revokedAt ?? new Date().toISOString();
  const metadata = existing.metadata_json && typeof existing.metadata_json === "object"
    ? { ...(existing.metadata_json as Record<string, unknown>) }
    : {};
  metadata.revoked_by = args.revokedBy;
  metadata.revoked_at = revokedAt;
  if (args.notes !== undefined) metadata.revocation_notes = args.notes ?? null;
  const record: PersistedFindingDispositionRecord = {
    ...existing,
    status: "revoked",
    revoked_at: revokedAt,
    metadata_json: metadata
  };
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({
      db,
      tableName: "finding_dispositions",
      recordKey: record.id,
      payload: record,
      runId: record.run_id,
      createdAt: record.created_at,
      targetId: run.target_id,
      parentKey: record.run_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
    return record;
  } finally {
    db.close();
  }
}
