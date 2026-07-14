import crypto from "node:crypto";

import { createModelProvider, resolveAgentProviderConfig, type ProviderConfig } from "../../../llm-provider/src/index.js";
import type { DatabaseMode } from "../contracts.js";
import { normalizeProjectId, normalizeWorkspaceId } from "../request-scope.js";
import { findingDispositionSignature } from "./finding-dispositions.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./backend.js";
import type {
  PersistedFindingDispositionRecord,
  PersistedFindingQualityRecord,
  PersistedFindingRecord,
  PersistedLearningCandidateRecord,
  PersistedLearningCandidateType,
  PersistedLearningEventRecord,
  PersistedLearningEventType,
  PersistedLearningExperimentRecord,
  PersistedLearningJobRecord,
  PersistedLearningPromotionRecord,
  PersistedLearningScopeType,
  PersistedRemediationItemRecord,
  PersistedReviewActionRecord,
  PersistedRuntimeFollowupRecord,
  PersistedRunRecord
} from "./contracts.js";
import { getPersistedRun, listPersistedRuns } from "./query.js";
import { readPersistedFindings, readPersistedFindingQuality } from "./run-details.js";
import { readPersistedReviewActions } from "./review-workflow.js";
import { readPersistedFindingDispositionsForRun } from "./finding-dispositions.js";
import { readPersistedRuntimeFollowup, listPersistedRuntimeFollowups } from "./runtime-followups.js";
import { readPersistedRemediationItemsForRun } from "./remediation-items.js";
import { ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

type AnyRecord = Record<string, any>;

export interface LearningSettings {
  enabled: boolean;
  trigger_mode: "manual" | "event_driven" | "scheduled" | "hybrid";
  event_driven_enabled: boolean;
  scheduled_enabled: boolean;
  scheduled_interval_minutes: number;
  sync_limit: number;
  llm_synthesis_enabled: boolean;
  llm_min_source_signals: number;
  llm_min_distinct_runs: number;
  llm_always_high_risk: boolean;
  llm_always_governance_impacting: boolean;
  llm_nightly_consolidation: boolean;
  llm_manual_synthesis_enabled: boolean;
  llm_max_calls_per_day: number;
  llm_send_source_excerpts: boolean;
  require_dry_run_before_promotion: boolean;
  auto_expire_days: number;
}

export type LearningTrigger = PersistedLearningJobRecord["trigger"];

interface LearningSynthesisPayload {
  title?: string;
  summary?: string;
  rationale?: string;
  recommended_review?: string;
  risk_notes?: string[];
  experiment_plan?: string[];
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function resolveLocation(rootDirOrOptions?: string | PersistenceReadOptions) {
  return typeof rootDirOrOptions === "string" || !rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: rootDirOrOptions })
    : resolvePersistenceLocation(rootDirOrOptions);
}

async function readTable<T>(rootDir: string, tableName: string): Promise<T[]> {
  if (!(await hasSqliteDatabase(rootDir))) return [];
  const db = await openSqliteDatabase(rootDir);
  try {
    ensureSqliteSchema(db);
    return readSqliteTable<T>(db, tableName);
  } finally {
    db.close();
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function asObject(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function boolSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberSetting(value: unknown, fallback: number, minimum = 1): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

export function normalizeLearningSettings(value: unknown): LearningSettings {
  const raw = asObject(value);
  const triggerMode = ["manual", "event_driven", "scheduled", "hybrid"].includes(String(raw.trigger_mode))
    ? String(raw.trigger_mode) as LearningSettings["trigger_mode"]
    : "hybrid";
  return {
    enabled: boolSetting(raw.enabled, true),
    trigger_mode: triggerMode,
    event_driven_enabled: boolSetting(raw.event_driven_enabled, true),
    scheduled_enabled: boolSetting(raw.scheduled_enabled, false),
    scheduled_interval_minutes: numberSetting(raw.scheduled_interval_minutes, 60, 5),
    sync_limit: numberSetting(raw.sync_limit, 100, 1),
    llm_synthesis_enabled: boolSetting(raw.llm_synthesis_enabled, true),
    llm_min_source_signals: numberSetting(raw.llm_min_source_signals, 3, 1),
    llm_min_distinct_runs: numberSetting(raw.llm_min_distinct_runs, 2, 1),
    llm_always_high_risk: boolSetting(raw.llm_always_high_risk, true),
    llm_always_governance_impacting: boolSetting(raw.llm_always_governance_impacting, true),
    llm_nightly_consolidation: boolSetting(raw.llm_nightly_consolidation, true),
    llm_manual_synthesis_enabled: boolSetting(raw.llm_manual_synthesis_enabled, true),
    llm_max_calls_per_day: numberSetting(raw.llm_max_calls_per_day, 50, 1),
    llm_send_source_excerpts: boolSetting(raw.llm_send_source_excerpts, true),
    require_dry_run_before_promotion: boolSetting(raw.require_dry_run_before_promotion, true),
    auto_expire_days: numberSetting(raw.auto_expire_days, 90, 1)
  };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function normalizeSignature(input: { category?: string | null; title?: string | null }): string {
  return findingDispositionSignature(input);
}

function findingById(findings: PersistedFindingRecord[], findingId: string | null | undefined): PersistedFindingRecord | null {
  if (!findingId) return null;
  return findings.find((item) => item.id === findingId) ?? null;
}

function findingByIdOrSignature(findings: PersistedFindingRecord[], findingId: string | null | undefined, signature: string | null | undefined): PersistedFindingRecord | null {
  return findingById(findings, findingId)
    ?? (signature ? findings.find((item) => normalizeSignature(item) === signature) ?? null : null);
}

function dispositionAppliesToRunFinding(disposition: PersistedFindingDispositionRecord, finding: PersistedFindingRecord | null): boolean {
  if (!finding) return false;
  if (disposition.scope_level === "run") return disposition.finding_id === finding.id;
  return Boolean(disposition.finding_signature && normalizeSignature(finding) === disposition.finding_signature);
}

function buildEventId(args: { runId: string | null; sourceTable: string; sourceId: string; eventType: string }): string {
  return `learn_event:${args.runId ?? "scope"}:${args.sourceTable}:${args.sourceId}:${args.eventType}`;
}

function baseEvent(args: {
  run: PersistedRunRecord;
  targetId: string | null;
  eventType: PersistedLearningEventType;
  sourceTable: string;
  sourceId: string;
  finding: PersistedFindingRecord | null;
  findingSignature?: string | null;
  signalSummary: string;
  confidence: number;
  actorId?: string | null;
  evidenceRefs?: string[];
  payload?: unknown;
}): PersistedLearningEventRecord {
  return {
    id: buildEventId({ runId: args.run.id, sourceTable: args.sourceTable, sourceId: args.sourceId, eventType: args.eventType }),
    run_id: args.run.id,
    target_id: args.targetId,
    workspace_id: normalizeWorkspaceId(args.run.workspace_id),
    project_id: normalizeProjectId(args.run.project_id),
    event_type: args.eventType,
    source_table: args.sourceTable,
    source_id: args.sourceId,
    finding_id: args.finding?.id ?? null,
    finding_signature: args.finding ? normalizeSignature(args.finding) : args.findingSignature ?? null,
    control_ids_json: args.finding ? asStringArray(args.finding.control_ids_json) : [],
    signal_summary: args.signalSummary,
    confidence: clampConfidence(args.confidence),
    actor_id: args.actorId ?? null,
    evidence_refs_json: args.evidenceRefs ?? asStringArray(args.finding?.evidence_json),
    payload_json: args.payload ?? null,
    created_at: new Date().toISOString()
  };
}

export async function extractLearningEventsForRun(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedLearningEventRecord[]> {
  const location = resolveLocation(rootDirOrOptions);
  const run = await getPersistedRun(runId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!run) return [];
  const [findings, reviewActions, dispositions, findingQuality, runtimeFollowups, remediationItems] = await Promise.all([
    readPersistedFindings(runId, { rootDir: location.rootDir, dbMode: location.mode }),
    readPersistedReviewActions(runId, { rootDir: location.rootDir, dbMode: location.mode }),
    readPersistedFindingDispositionsForRun(runId, { rootDir: location.rootDir, dbMode: location.mode }),
    readPersistedFindingQuality(runId, { rootDir: location.rootDir, dbMode: location.mode }),
    listPersistedRuntimeFollowups({ runId, rootDirOrOptions: { rootDir: location.rootDir, dbMode: location.mode } }),
    readPersistedRemediationItemsForRun(runId, { rootDir: location.rootDir, dbMode: location.mode })
  ]);
  return extractLearningEventsFromRecords({ run, findings, reviewActions, dispositions, findingQuality, runtimeFollowups, remediationItems });
}

export function extractLearningEventsFromRecords(args: {
  run: PersistedRunRecord;
  findings: PersistedFindingRecord[];
  reviewActions?: PersistedReviewActionRecord[];
  dispositions?: PersistedFindingDispositionRecord[];
  findingQuality?: PersistedFindingQualityRecord | null;
  runtimeFollowups?: PersistedRuntimeFollowupRecord[];
  remediationItems?: PersistedRemediationItemRecord[];
}): PersistedLearningEventRecord[] {
  const events = new Map<string, PersistedLearningEventRecord>();
  const targetId = args.run.target_id ?? null;
  const add = (event: PersistedLearningEventRecord) => events.set(event.id, event);

  for (const action of args.reviewActions ?? []) {
    const finding = findingById(args.findings, action.finding_id);
    const triage = action.triage_decision;
    const eventType: PersistedLearningEventType | null =
      triage === "false_positive" ? "review_false_positive"
        : triage === "out_of_scope" ? "review_out_of_scope"
          : triage === "accepted_risk" ? "review_accepted_risk"
            : triage === "needs_validation" ? "review_needs_validation"
              : null;
    if (eventType) {
      add(baseEvent({
        run: args.run,
        targetId,
        eventType,
        sourceTable: "review_actions",
        sourceId: action.id,
        finding,
        signalSummary: `${action.action_type} recorded ${triage} for ${finding?.title ?? action.finding_id ?? "run"}.`,
        confidence: finding ? 0.84 : 0.55,
        actorId: action.reviewer_id,
        payload: action
      }));
    }
    if (action.updated_severity && action.previous_severity && action.updated_severity !== action.previous_severity) {
      add(baseEvent({
        run: args.run,
        targetId,
        eventType: "review_accepted_risk",
        sourceTable: "review_actions",
        sourceId: `${action.id}:severity`,
        finding,
        signalSummary: `Reviewer changed severity from ${action.previous_severity} to ${action.updated_severity}.`,
        confidence: finding ? 0.75 : 0.5,
        actorId: action.reviewer_id,
        payload: action
      }));
    }
  }

  for (const disposition of args.dispositions ?? []) {
    const finding = findingByIdOrSignature(args.findings, disposition.finding_id, disposition.finding_signature);
    if (disposition.status !== "active") continue;
    if (!dispositionAppliesToRunFinding(disposition, finding)) continue;
    add(baseEvent({
      run: args.run,
      targetId,
      eventType: "finding_disposition",
      sourceTable: "finding_dispositions",
      sourceId: disposition.id,
      finding,
      findingSignature: disposition.finding_signature,
      signalSummary: `Active ${disposition.disposition_type} disposition at ${disposition.scope_level} scope${disposition.reason ? `: ${disposition.reason}` : ""}.`,
      confidence: finding || disposition.finding_signature ? 0.86 : 0.5,
      actorId: disposition.created_by,
      payload: disposition
    }));
  }

  const qualityFindings = Array.isArray((args.findingQuality as AnyRecord | null)?.findings)
    ? ((args.findingQuality as AnyRecord).findings as AnyRecord[])
    : [];
  for (const item of qualityFindings) {
    const finding = findingById(args.findings, String(item.finding_id ?? item.id ?? ""));
    const evidenceVerdict = String(item.evidence_support_verdict ?? item.evidence_support ?? "");
    const qaBlocking = Boolean(item.qa_blocking);
    const reasons = asStringArray(item.reasons ?? item.blocking_reasons ?? item.validation_reasons);
    if (qaBlocking || ["unsupported", "partially_supported"].includes(evidenceVerdict)) {
      add(baseEvent({
        run: args.run,
        targetId,
        eventType: "finding_quality_gap",
        sourceTable: "finding_quality",
        sourceId: `${args.run.id}:finding-quality:${String(item.finding_id ?? item.id ?? "unknown")}`,
        finding,
        signalSummary: `Finding quality flagged ${evidenceVerdict || "a QA gap"}${qaBlocking ? " with blocking status" : ""}.`,
        confidence: 0.8,
        evidenceRefs: reasons,
        payload: item
      }));
    }
    const duplicateIds = asStringArray(item.duplicate_with_finding_ids);
    const conflictIds = asStringArray(item.conflict_with_finding_ids);
    if (duplicateIds.length || conflictIds.length) {
      add(baseEvent({
        run: args.run,
        targetId,
        eventType: "duplicate_or_conflict",
        sourceTable: "finding_quality",
        sourceId: `${args.run.id}:finding-quality:${String(item.finding_id ?? item.id ?? "unknown")}:dupe-conflict`,
        finding,
        signalSummary: `Finding quality detected ${duplicateIds.length} duplicate(s) and ${conflictIds.length} conflict(s).`,
        confidence: 0.72,
        payload: item
      }));
    }
  }

  for (const followup of args.runtimeFollowups ?? []) {
    if (followup.rerun_outcome === "pending") continue;
    const finding = findingById(args.findings, followup.finding_id);
    add(baseEvent({
      run: args.run,
      targetId,
      eventType: "runtime_followup_outcome",
      sourceTable: "runtime_followups",
      sourceId: followup.id,
      finding,
      signalSummary: `Runtime follow-up outcome is ${followup.rerun_outcome}.`,
      confidence: followup.rerun_outcome === "confirmed" || followup.rerun_outcome === "not_reproduced" ? 0.86 : 0.62,
      actorId: followup.resolved_by ?? followup.requested_by,
      payload: followup
    }));
  }

  for (const item of args.remediationItems ?? []) {
    if (!["resolved", "reopened", "verification_pending"].includes(item.status)) continue;
    const finding = findingById(args.findings, item.finding_id);
    add(baseEvent({
      run: args.run,
      targetId,
      eventType: "remediation_state",
      sourceTable: "remediation_items",
      sourceId: item.id,
      finding,
      signalSummary: `Remediation item moved to ${item.status}.`,
      confidence: item.validation_run_id ? 0.84 : 0.64,
      actorId: item.updated_by,
      payload: item
    }));
  }

  return [...events.values()].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export async function syncLearningEventsForRun(runId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedLearningEventRecord[]> {
  const location = resolveLocation(rootDirOrOptions);
  const events = await extractLearningEventsForRun(runId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!events.length) return [];
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    for (const event of events) {
      upsertSqliteRecord({
        db,
        tableName: "learning_events",
        recordKey: event.id,
        payload: event,
        runId: event.run_id,
        targetId: event.target_id,
        createdAt: event.created_at,
        parentKey: event.finding_id ?? event.run_id
      });
    }
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return events;
}

export async function listPersistedLearningEvents(args?: {
  rootDir?: string;
  dbMode?: DatabaseMode;
  workspaceId?: string;
  projectId?: string;
  runId?: string;
  targetId?: string;
  eventType?: PersistedLearningEventType;
  limit?: number;
}): Promise<PersistedLearningEventRecord[]> {
  const location = resolveLocation(args);
  const rows = await readTable<PersistedLearningEventRecord>(location.rootDir, "learning_events");
  const workspaceId = args?.workspaceId ? normalizeWorkspaceId(args.workspaceId) : null;
  const projectId = args?.projectId ? normalizeProjectId(args.projectId) : null;
  return rows
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .filter((item) => !projectId || item.project_id === projectId)
    .filter((item) => !args?.runId || item.run_id === args.runId)
    .filter((item) => !args?.targetId || item.target_id === args.targetId)
    .filter((item) => !args?.eventType || item.event_type === args.eventType)
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
    .slice(0, args?.limit ?? 250);
}

export async function listPersistedLearningJobs(args?: {
  rootDir?: string;
  dbMode?: DatabaseMode;
  workspaceId?: string;
  projectId?: string;
  runId?: string;
  limit?: number;
}): Promise<PersistedLearningJobRecord[]> {
  const location = resolveLocation(args);
  const rows = await readTable<PersistedLearningJobRecord>(location.rootDir, "learning_jobs");
  const workspaceId = args?.workspaceId ? normalizeWorkspaceId(args.workspaceId) : null;
  const projectId = args?.projectId ? normalizeProjectId(args.projectId) : null;
  return rows
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .filter((item) => !projectId || item.project_id === projectId)
    .filter((item) => !args?.runId || item.run_id === args.runId)
    .sort((left, right) => right.started_at.localeCompare(left.started_at) || right.id.localeCompare(left.id))
    .slice(0, args?.limit ?? 100);
}

async function writeLearningJob(job: PersistedLearningJobRecord, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedLearningJobRecord> {
  const location = resolveLocation(rootDirOrOptions);
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({
      db,
      tableName: "learning_jobs",
      recordKey: job.id,
      payload: job,
      runId: job.run_id,
      createdAt: job.started_at,
      parentKey: `${job.workspace_id}:${job.project_id}`
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return job;
}

function dispositionTypeForEvent(event: PersistedLearningEventRecord): string {
  if (event.event_type !== "finding_disposition") return "";
  const payloadType = String(asObject(event.payload_json).disposition_type ?? "");
  if (payloadType) return payloadType;
  const summary = String(event.signal_summary ?? "").toLowerCase();
  if (summary.includes("suppression")) return "suppression";
  if (summary.includes("waiver")) return "waiver";
  return "";
}

function candidateKindForEvent(event: PersistedLearningEventRecord): PersistedLearningCandidateType {
  if (event.event_type === "review_false_positive" || event.event_type === "review_out_of_scope") return "scoped_suppression_suggestion";
  if (event.event_type === "review_accepted_risk") return "severity_calibration_suggestion";
  if (event.event_type === "review_needs_validation" || event.event_type === "finding_quality_gap") return "evidence_requirement_adjustment";
  if (event.event_type === "runtime_followup_outcome") return "runtime_followup_heuristic";
  if (event.event_type === "duplicate_or_conflict") return "duplicate_grouping_signature";
  const dispositionType = dispositionTypeForEvent(event);
  if (dispositionType === "suppression") return "scoped_suppression_suggestion";
  if (dispositionType === "waiver") return "severity_calibration_suggestion";
  return "eval_fixture_candidate";
}

function scopeForEvents(events: PersistedLearningEventRecord[]): { scope_type: PersistedLearningScopeType; scope_id: string } {
  const targetIds = new Set(events.map((item) => item.target_id).filter(Boolean));
  if (targetIds.size === 1) return { scope_type: "target", scope_id: [...targetIds][0] as string };
  return { scope_type: "project", scope_id: events[0]?.project_id ?? "default" };
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
}

function humanizeIdentifier(value: string): string {
  return sentenceCase(value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());
}

function signatureDisplayName(signature: string): string {
  const normalized = signature.trim();
  if (!normalized || normalized === "run-level-signal") return "Run-level review activity";
  const [, title] = normalized.includes("::") ? normalized.split("::", 2) : ["", normalized];
  return humanizeIdentifier(title || normalized);
}

function scopeDisplayName(scope: { scope_type: PersistedLearningScopeType; scope_id: string }): string {
  if (scope.scope_type === "run") return "this run";
  if (scope.scope_type === "target") return "this target";
  return scope.scope_id === "default" ? "the project" : `project ${scope.scope_id}`;
}

function learningEventLabel(eventType: PersistedLearningEventType): string {
  if (eventType === "review_false_positive") return "false-positive review";
  if (eventType === "review_out_of_scope") return "out-of-scope review";
  if (eventType === "review_accepted_risk") return "accepted-risk review";
  if (eventType === "review_needs_validation") return "validation request";
  if (eventType === "finding_disposition") return "active disposition";
  if (eventType === "finding_quality_gap") return "finding quality gap";
  if (eventType === "runtime_followup_outcome") return "runtime follow-up outcome";
  if (eventType === "remediation_state") return "remediation status change";
  if (eventType === "duplicate_or_conflict") return "duplicate or conflict signal";
  return "assistant-confirmed action";
}

function learningEventSourceLabel(event: PersistedLearningEventRecord): string {
  if (event.event_type === "finding_disposition") {
    const dispositionType = dispositionTypeForEvent(event);
    if (dispositionType === "waiver") return "active accepted-risk waiver";
    if (dispositionType === "suppression") return "active suppression";
  }
  return learningEventLabel(event.event_type);
}

function eventActionLabel(event: PersistedLearningEventRecord): string {
  const payload = asObject(event.payload_json);
  if (event.event_type === "finding_disposition") {
    if (!payload.disposition_type && !payload.scope_level && !payload.reason && event.signal_summary) return event.signal_summary;
    const dispositionType = String(payload.disposition_type ?? dispositionTypeForEvent(event));
    const reason = String(payload.reason ?? "").trim();
    const scope = String(payload.scope_level ?? "").trim();
    const typeLabel = dispositionType === "waiver" ? "accepted-risk waiver" : dispositionType === "suppression" ? "suppression" : "disposition";
    return `${scope ? `${humanizeIdentifier(scope)}-scope ` : ""}${typeLabel}${reason ? `: ${reason}` : ""}`;
  }
  const actionType = String(payload.action_type ?? "").trim();
  if (event.event_type === "review_needs_validation") {
    const intent = String(payload.validation_intent ?? "").trim();
    if (intent === "rerun_required") return "requested a rerun in a capable environment";
    if (intent === "runtime_validation") return "requested runtime validation before publication";
    if (intent === "manual_review") return "requested manual validation";
    return actionType ? `${humanizeIdentifier(actionType)} requested validation` : "requested validation";
  }
  if (event.event_type === "review_accepted_risk") {
    const previousSeverity = String(payload.previous_severity ?? "").trim();
    const updatedSeverity = String(payload.updated_severity ?? "").trim();
    if (previousSeverity && updatedSeverity) return `changed severity from ${previousSeverity} to ${updatedSeverity}`;
    return "accepted risk or calibrated severity";
  }
  return event.signal_summary || learningEventLabel(event.event_type);
}

function compactSignalSummaries(events: PersistedLearningEventRecord[]): string[] {
  const seen = new Set<string>();
  const summaries: string[] = [];
  for (const event of events) {
    const summary = sentenceCase(eventActionLabel(event).replace(/\s+/g, " ").trim());
    if (!summary || seen.has(summary.toLowerCase())) continue;
    seen.add(summary.toLowerCase());
    summaries.push(summary.endsWith(".") ? summary : `${summary}.`);
  }
  return summaries;
}

function candidateDisplayCopy(args: {
  kind: PersistedLearningCandidateType;
  signature: string;
  scope: { scope_type: PersistedLearningScopeType; scope_id: string };
  events: PersistedLearningEventRecord[];
}): { title: string; summary: string; rationale: string } {
  const subject = signatureDisplayName(args.signature);
  const scope = scopeDisplayName(args.scope);
  const count = args.events.length;
  const runCount = sourceRunIdsForEvents(args.events).length;
  const eventTypes = [...new Set(args.events.map((event) => learningEventSourceLabel(event)))];
  const signalPhrase = `${count} ${count === 1 ? "signal" : "signals"}`;
  const sourcePhrase = eventTypes.length ? `${signalPhrase} from ${eventTypes.join(", ")}` : signalPhrase;
  const details = compactSignalSummaries(args.events).slice(0, 3);
  const rationale = details.length
    ? `Observed reviewer decisions: ${details.join(" ")}`
    : `Observed ${sourcePhrase}.`;
  const recurrence = runCount > 1 ? `across ${runCount} runs` : "in this run";

  if (args.kind === "scoped_suppression_suggestion") {
    return {
      title: `Review suppression pattern: ${subject}`,
      summary: `${sourcePhrase} ${recurrence} indicate reviewers may be suppressing this pattern for ${scope}. Promotion remains approval-gated and does not change audit behavior until approved.`,
      rationale
    };
  }
  if (args.kind === "evidence_requirement_adjustment") {
    return {
      title: `Review evidence requirements: ${subject}`,
      summary: `${sourcePhrase} ${recurrence} indicate this pattern needs stronger evidence before it should be considered review-ready.`,
      rationale
    };
  }
  if (args.kind === "runtime_followup_heuristic") {
    return {
      title: `Tune runtime follow-up handling: ${subject}`,
      summary: `${sourcePhrase} can help decide when similar findings need rerun validation, manual runtime review, or no further runtime action.`,
      rationale
    };
  }
  if (args.kind === "duplicate_grouping_signature") {
    return {
      title: `Improve duplicate grouping: ${subject}`,
      summary: `${sourcePhrase} show similar findings may need stronger duplicate or conflict grouping before review.`,
      rationale
    };
  }
  if (args.kind === "severity_calibration_suggestion") {
    const hasWaiver = args.events.some((event) => dispositionTypeForEvent(event) === "waiver");
    return {
      title: `${hasWaiver ? "Review accepted-risk pattern" : "Review severity calibration"}: ${subject}`,
      summary: hasWaiver
        ? `${sourcePhrase} ${recurrence} indicate reviewers accepted this pattern as risk for ${scope}. Promotion remains approval-gated and does not change audit behavior until approved.`
        : `${sourcePhrase} ${recurrence} indicate reviewers may be lowering severity for this pattern in ${scope}. Promotion remains approval-gated and does not change audit behavior until approved.`,
      rationale
    };
  }
  if (args.kind === "prompt_improvement_candidate") {
    return {
      title: `Review prompt improvement: ${subject}`,
      summary: `${sourcePhrase} suggest the audit prompt or reviewer guidance may need clarification for this pattern.`,
      rationale
    };
  }
  return {
    title: `Add eval fixture: ${subject}`,
    summary: `${sourcePhrase} are suitable for a governed regression fixture so future runs can detect this pattern consistently.`,
    rationale
  };
}

function hasConcreteFindingPattern(events: PersistedLearningEventRecord[]): boolean {
  return events.some((event) => Boolean(event.finding_id || (event.finding_signature && event.finding_signature !== "run-level-signal")));
}

function sourceRunIdsForEvents(events: PersistedLearningEventRecord[]): string[] {
  return [...new Set(events.map((event) => event.run_id).filter(Boolean).map((runId) => String(runId)))];
}

function hasCandidateSupport(kind: PersistedLearningCandidateType, events: PersistedLearningEventRecord[]): boolean {
  const sourceRunIds = sourceRunIdsForEvents(events);
  const highRiskBehaviorChange = kind === "scoped_suppression_suggestion" || kind === "severity_calibration_suggestion";
  if (highRiskBehaviorChange) return sourceRunIds.length >= 2;
  return events.length >= 2;
}

function isGenericRunLevelCandidate(candidate: PersistedLearningCandidateRecord): boolean {
  const signatures = asStringArray(candidate.affected_finding_signatures_json);
  const proposedSignature = String(asObject(candidate.proposed_change_json).finding_signature ?? "");
  const signature = signatures[0] || proposedSignature;
  const eventTypes = asStringArray(asObject(candidate.metadata_json).event_types);
  return candidate.candidate_type === "scoped_suppression_suggestion"
    && (!signature || signature === "run-level-signal")
    && (eventTypes.length === 0 || eventTypes.every((type) => type === "finding_disposition"));
}

function isUnderSupportedCandidate(candidate: PersistedLearningCandidateRecord): boolean {
  const sourceRunIds = asStringArray(asObject(candidate.expected_effect_json).source_run_ids);
  const sourceEventCount = Number(asObject(candidate.expected_effect_json).source_event_count ?? asStringArray(candidate.source_event_ids_json).length);
  const highRiskBehaviorChange = candidate.candidate_type === "scoped_suppression_suggestion" || candidate.candidate_type === "severity_calibration_suggestion";
  if (highRiskBehaviorChange) return sourceRunIds.length < 2;
  return !Number.isFinite(sourceEventCount) || sourceEventCount < 2;
}

function isMismatchedDispositionCandidate(candidate: PersistedLearningCandidateRecord, sourceEvents: PersistedLearningEventRecord[] = []): boolean {
  const dispositionTypes = new Set(sourceEvents.map((event) => dispositionTypeForEvent(event)).filter(Boolean));
  if (!dispositionTypes.size) return false;
  if (candidate.candidate_type === "scoped_suppression_suggestion") return dispositionTypes.has("waiver");
  if (candidate.candidate_type === "severity_calibration_suggestion") return dispositionTypes.has("suppression");
  return false;
}

function isMixedKindCandidate(candidate: PersistedLearningCandidateRecord, sourceEvents: PersistedLearningEventRecord[] = []): boolean {
  const eventTypes = asStringArray(asObject(candidate.metadata_json).event_types);
  if (isMismatchedDispositionCandidate(candidate, sourceEvents)) return true;
  if (!eventTypes.length) return false;
  const allowedByKind: Record<PersistedLearningCandidateType, string[]> = {
    scoped_suppression_suggestion: ["review_false_positive", "review_out_of_scope", "finding_disposition"],
    severity_calibration_suggestion: ["review_accepted_risk", "finding_disposition"],
    evidence_requirement_adjustment: ["finding_quality_gap", "review_needs_validation"],
    prompt_improvement_candidate: ["assistant_confirmed_action"],
    eval_fixture_candidate: ["remediation_state", "assistant_confirmed_action"],
    runtime_followup_heuristic: ["runtime_followup_outcome"],
    duplicate_grouping_signature: ["duplicate_or_conflict"]
  };
  const allowed = new Set(allowedByKind[candidate.candidate_type] ?? []);
  return eventTypes.some((eventType) => !allowed.has(eventType));
}

function isInvalidLearningCandidate(candidate: PersistedLearningCandidateRecord, sourceEvents: PersistedLearningEventRecord[] = []): boolean {
  return isGenericRunLevelCandidate(candidate) || isUnderSupportedCandidate(candidate) || isMixedKindCandidate(candidate, sourceEvents);
}

function sourceEventsForCandidate(candidate: PersistedLearningCandidateRecord, events: PersistedLearningEventRecord[]): PersistedLearningEventRecord[] {
  const sourceEventIds = new Set(asStringArray(candidate.source_event_ids_json));
  return events.filter((event) => sourceEventIds.has(event.id));
}

function refreshCandidateDisplayCopy(candidate: PersistedLearningCandidateRecord, sourceEvents: PersistedLearningEventRecord[]): PersistedLearningCandidateRecord {
  if (!sourceEvents.length) return candidate;
  const signature = asStringArray(candidate.affected_finding_signatures_json)[0]
    || String(asObject(candidate.proposed_change_json).finding_signature ?? "")
    || "run-level-signal";
  const scope = {
    scope_type: candidate.scope_type,
    scope_id: candidate.scope_id
  };
  const displayCopy = candidateDisplayCopy({ kind: candidate.candidate_type, signature, scope, events: sourceEvents });
  return {
    ...candidate,
    title: displayCopy.title,
    summary: displayCopy.summary,
    rationale: displayCopy.rationale
  };
}

export function generateLearningCandidatesFromEvents(events: PersistedLearningEventRecord[], existing: PersistedLearningCandidateRecord[] = []): PersistedLearningCandidateRecord[] {
  const groups = new Map<string, PersistedLearningEventRecord[]>();
  for (const event of events) {
    const signature = event.finding_signature || event.finding_id || `${event.event_type}:${event.source_id}`;
    const kind = candidateKindForEvent(event);
    const key = `${event.workspace_id}:${event.project_id}:${kind}:${signature}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const existingKeys = new Set(existing.map((candidate) => {
    const signatures = asStringArray(candidate.affected_finding_signatures_json);
    return `${candidate.workspace_id}:${candidate.project_id}:${candidate.candidate_type}:${signatures[0] ?? candidate.id}:${candidate.scope_type}:${candidate.scope_id}`;
  }));
  const now = new Date().toISOString();
  const candidates: PersistedLearningCandidateRecord[] = [];
  for (const groupedEvents of groups.values()) {
    const signature = groupedEvents[0]?.finding_signature || groupedEvents[0]?.finding_id || "run-level-signal";
    const kind = candidateKindForEvent(groupedEvents[0]);
    const highRiskBehaviorChange = kind === "scoped_suppression_suggestion" || kind === "severity_calibration_suggestion";
    if (highRiskBehaviorChange && !hasConcreteFindingPattern(groupedEvents)) continue;
    if (!hasCandidateSupport(kind, groupedEvents)) continue;
    const scope = scopeForEvents(groupedEvents);
    const dedupeKey = `${groupedEvents[0].workspace_id}:${groupedEvents[0].project_id}:${kind}:${signature}:${scope.scope_type}:${scope.scope_id}`;
    if (existingKeys.has(dedupeKey)) continue;
    const sourceEventIds = groupedEvents.map((item) => item.id);
    const runIds = sourceRunIdsForEvents(groupedEvents);
    const displayCopy = candidateDisplayCopy({ kind, signature, scope, events: groupedEvents });
    const candidate: PersistedLearningCandidateRecord = {
      id: `learn_candidate:${crypto.createHash("sha256").update(dedupeKey).digest("hex").slice(0, 24)}`,
      workspace_id: groupedEvents[0].workspace_id,
      project_id: groupedEvents[0].project_id,
      scope_type: scope.scope_type,
      scope_id: scope.scope_id,
      target_id: scope.scope_type === "target" ? scope.scope_id : groupedEvents[0].target_id,
      candidate_type: kind,
      status: "proposed",
      title: displayCopy.title,
      summary: displayCopy.summary,
      rationale: displayCopy.rationale,
      proposed_change_json: {
        mode: "advisory_candidate",
        candidate_type: kind,
        finding_signature: signature,
        scope,
        v1_behavior: "Candidate is not applied to audit execution unless explicitly promoted."
      },
      source_event_ids_json: sourceEventIds,
      affected_finding_signatures_json: signature ? [signature] : [],
      expected_effect_json: {
        source_event_count: groupedEvents.length,
        source_run_ids: runIds,
        expected_operator_value: kind === "evidence_requirement_adjustment"
          ? "Improve evidence sufficiency and reduce reviewer rework."
          : kind === "scoped_suppression_suggestion"
            ? "Reduce repeated review of known false-positive or out-of-scope signatures after approval."
            : kind === "severity_calibration_suggestion"
              ? "Improve reviewer consistency for accepted-risk and severity calibration decisions."
              : "Improve reviewer prioritization and follow-up consistency."
      },
      risk_level: highRiskBehaviorChange ? "high" : "medium",
      requires_human_approval: true,
      created_at: now,
      updated_at: now,
      created_by: "system_learning",
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      expires_at: null,
      metadata_json: {
        dedupe_key: dedupeKey,
        event_types: [...new Set(groupedEvents.map((item) => item.event_type))]
      }
    };
    candidates.push(candidate);
  }
  return candidates.sort((left, right) => left.id.localeCompare(right.id));
}

export async function generateAndPersistLearningCandidates(args?: {
  rootDir?: string;
  dbMode?: DatabaseMode;
  workspaceId?: string;
  projectId?: string;
  runId?: string;
}): Promise<PersistedLearningCandidateRecord[]> {
  const location = resolveLocation(args);
  if (args?.runId) await syncLearningEventsForRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode });
  const events = await listPersistedLearningEvents({
    rootDir: location.rootDir,
    dbMode: location.mode,
    workspaceId: args?.workspaceId,
    projectId: args?.projectId,
    runId: args?.runId,
    limit: Number.MAX_SAFE_INTEGER
  });
  const existing = await listPersistedLearningCandidates({ rootDir: location.rootDir, dbMode: location.mode, workspaceId: args?.workspaceId, projectId: args?.projectId });
  const candidates = generateLearningCandidatesFromEvents(events, existing);
  if (!candidates.length) return [];
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    for (const candidate of candidates) {
      upsertSqliteRecord({
        db,
        tableName: "learning_candidates",
        recordKey: candidate.id,
        payload: candidate,
        targetId: candidate.target_id,
        createdAt: candidate.created_at,
        parentKey: candidate.scope_id
      });
    }
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return candidates;
}

function isGovernanceImpactingCandidate(candidate: PersistedLearningCandidateRecord): boolean {
  return ["scoped_suppression_suggestion", "severity_calibration_suggestion"].includes(candidate.candidate_type);
}

function hasExistingSynthesis(candidate: PersistedLearningCandidateRecord): boolean {
  const metadata = asObject(candidate.metadata_json);
  return Boolean(asObject(metadata.llm_synthesis).status === "completed");
}

function shouldRunLlmSynthesis(args: {
  candidate: PersistedLearningCandidateRecord;
  sourceEvents: PersistedLearningEventRecord[];
  settings: LearningSettings;
}): { eligible: boolean; reason: string } {
  if (!args.settings.enabled) return { eligible: false, reason: "learning_disabled" };
  if (!args.settings.llm_synthesis_enabled) return { eligible: false, reason: "llm_synthesis_disabled" };
  if (hasExistingSynthesis(args.candidate)) return { eligible: false, reason: "already_synthesized" };
  const sourceCount = asStringArray(args.candidate.source_event_ids_json).length || args.sourceEvents.length;
  const runCount = sourceRunIdsForEvents(args.sourceEvents).length || asStringArray(args.candidate.expected_effect_json && asObject(args.candidate.expected_effect_json).source_run_ids).length;
  if (args.settings.llm_always_governance_impacting && isGovernanceImpactingCandidate(args.candidate) && sourceCount >= 2 && runCount >= 2) {
    return { eligible: true, reason: "governance_threshold" };
  }
  if (args.settings.llm_always_high_risk && args.candidate.risk_level === "high" && sourceCount >= 2 && runCount >= 2) {
    return { eligible: true, reason: "high_risk_threshold" };
  }
  if (sourceCount >= args.settings.llm_min_source_signals && runCount >= args.settings.llm_min_distinct_runs) {
    return { eligible: true, reason: "recurrence_threshold" };
  }
  return { eligible: false, reason: "below_threshold" };
}

const learningSynthesisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    rationale: { type: "string" },
    recommended_review: { type: "string" },
    risk_notes: { type: "array", items: { type: "string" } },
    experiment_plan: { type: "array", items: { type: "string" } }
  },
  required: ["title", "summary", "rationale", "recommended_review", "risk_notes", "experiment_plan"]
};

function compactEventForSynthesis(event: PersistedLearningEventRecord, includeSourceExcerpts: boolean): AnyRecord {
  const payload = asObject(event.payload_json);
  return {
    id: event.id,
    run_id: event.run_id,
    event_type: event.event_type,
    finding_id: event.finding_id,
    finding_signature: event.finding_signature,
    confidence: event.confidence,
    signal_summary: includeSourceExcerpts ? event.signal_summary : learningEventLabel(event.event_type),
    source_table: event.source_table,
    actor_id: event.actor_id,
    disposition_type: payload.disposition_type ?? null,
    review_action: payload.action_type ?? null,
    triage_decision: payload.triage_decision ?? null
  };
}

function providerConfigFromSettings(providers: unknown): ProviderConfig {
  const raw = asObject(providers);
  const overrides = asObject(raw.agent_overrides);
  const learningOverride = asObject(overrides.learning_synthesizer_agent);
  const normalizedOverride: ProviderConfig["agentOverrides"] = {};
  if (learningOverride.provider || learningOverride.model || learningOverride.api_key) {
    normalizedOverride.learning_synthesizer_agent = {
      provider: ["openai", "openai_codex", "mock"].includes(String(learningOverride.provider)) ? learningOverride.provider : undefined,
      model: typeof learningOverride.model === "string" ? learningOverride.model : undefined,
      apiKey: typeof learningOverride.api_key === "string" ? learningOverride.api_key : undefined
    };
  }
  return {
    provider: ["openai", "openai_codex", "mock"].includes(String(raw.default_provider)) ? raw.default_provider : undefined,
    model: typeof raw.default_model === "string" ? raw.default_model : undefined,
    agentOverrides: normalizedOverride
  };
}

async function synthesizeCandidateWithLlm(args: {
  candidate: PersistedLearningCandidateRecord;
  sourceEvents: PersistedLearningEventRecord[];
  settings: LearningSettings;
  providerConfig?: ProviderConfig;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<{ candidate: PersistedLearningCandidateRecord; synthesized: boolean; reason: string }> {
  const eligibility = shouldRunLlmSynthesis({ candidate: args.candidate, sourceEvents: args.sourceEvents, settings: args.settings });
  if (!eligibility.eligible) {
    return { candidate: args.candidate, synthesized: false, reason: eligibility.reason };
  }
  const providerConfig = args.providerConfig ?? {};
  const resolved = resolveAgentProviderConfig("learning_synthesizer_agent", providerConfig);
  if (resolved.provider === "mock") {
    const now = new Date().toISOString();
    const candidate = await writeCandidate({
      ...args.candidate,
      updated_at: now,
      metadata_json: {
        ...asObject(args.candidate.metadata_json),
        llm_synthesis: {
          status: "inactive",
          reason: "provider_not_configured",
          agent_name: "learning_synthesizer_agent",
          provider: resolved.provider,
          model: resolved.model ?? null,
          updated_at: now
        }
      }
    }, args.rootDirOrOptions);
    return { candidate, synthesized: false, reason: "provider_not_configured" };
  }
  const sourceEvents = args.sourceEvents.map((event) => compactEventForSynthesis(event, args.settings.llm_send_source_excerpts));
  let result;
  let modelProvider: ReturnType<typeof createModelProvider> | null = null;
  try {
    modelProvider = createModelProvider(providerConfig, "learning_synthesizer_agent");
    result = await modelProvider.generateStructured<LearningSynthesisPayload>({
      agentName: "learning_synthesizer_agent",
      schemaName: "learning_candidate_synthesis",
      schema: learningSynthesisSchema,
      systemPrompt: [
        "You synthesize governed self-learning candidates for a security audit engine.",
        "Use only the supplied candidate and source events.",
        "Do not promote candidates, suppress findings, lower severity, or claim behavior has changed.",
        "Write concise reviewer-facing copy and explicitly preserve human approval."
      ].join("\n"),
      userPrompt: JSON.stringify({
        candidate: {
          id: args.candidate.id,
          candidate_type: args.candidate.candidate_type,
          title: args.candidate.title,
          summary: args.candidate.summary,
          rationale: args.candidate.rationale,
          risk_level: args.candidate.risk_level,
          scope_type: args.candidate.scope_type,
          scope_id: args.candidate.scope_id
        },
        source_events: sourceEvents
      }),
      metadata: { candidate_id: args.candidate.id },
      temperature: 0.1,
      maxRetries: 1
    });
  } catch (error) {
    const now = new Date().toISOString();
    const reason = /api key|requires an API key|not recognized|ENOENT|access is denied/i.test(error instanceof Error ? error.message : String(error))
      ? "provider_not_configured"
      : "synthesis_failed";
    const candidate = await writeCandidate({
      ...args.candidate,
      updated_at: now,
      metadata_json: {
        ...asObject(args.candidate.metadata_json),
        llm_synthesis: {
          status: "inactive",
          reason,
          agent_name: "learning_synthesizer_agent",
          provider: modelProvider?.providerName ?? resolved.provider,
          model: modelProvider?.modelName ?? resolved.model ?? null,
          error: error instanceof Error ? error.message : String(error),
          updated_at: now
        }
      }
    }, args.rootDirOrOptions);
    return { candidate, synthesized: false, reason };
  }
  const now = new Date().toISOString();
  const nextCandidate = await writeCandidate({
    ...args.candidate,
    title: result.parsed.title?.trim() || args.candidate.title,
    summary: result.parsed.summary?.trim() || args.candidate.summary,
    rationale: result.parsed.rationale?.trim() || args.candidate.rationale,
    updated_at: now,
    metadata_json: {
      ...asObject(args.candidate.metadata_json),
      llm_synthesis: {
        status: "completed",
        reason: eligibility.reason,
        agent_name: "learning_synthesizer_agent",
        provider: result.provider,
        model: result.model,
        usage: result.usage ?? null,
        recommended_review: result.parsed.recommended_review ?? null,
        risk_notes: Array.isArray(result.parsed.risk_notes) ? result.parsed.risk_notes : [],
        experiment_plan: Array.isArray(result.parsed.experiment_plan) ? result.parsed.experiment_plan : [],
        updated_at: now
      }
    }
  }, args.rootDirOrOptions);
  return { candidate: nextCandidate, synthesized: true, reason: eligibility.reason };
}

export async function syncLearningEventsForScope(args: {
  rootDir?: string;
  dbMode?: DatabaseMode;
  workspaceId?: string;
  projectId?: string;
  limit?: number;
}): Promise<number> {
  const location = resolveLocation(args);
  const runs = await listPersistedRuns({
    rootDir: location.rootDir,
    dbMode: location.mode,
    workspaceId: args.workspaceId,
    projectId: args.projectId,
    limit: args.limit ?? 100
  });
  await Promise.all(runs.map((run) => syncLearningEventsForRun(run.id, { rootDir: location.rootDir, dbMode: location.mode })));
  return runs.length;
}

export async function runLearningPipeline(args: {
  rootDir?: string;
  dbMode?: DatabaseMode;
  workspaceId?: string;
  projectId?: string;
  runId?: string | null;
  trigger?: LearningTrigger;
  actorId?: string | null;
  settings?: unknown;
  providers?: unknown;
}): Promise<{ job: PersistedLearningJobRecord; candidates: PersistedLearningCandidateRecord[] }> {
  const location = resolveLocation(args);
  const settings = normalizeLearningSettings(args.settings);
  const workspaceId = normalizeWorkspaceId(args.workspaceId);
  const projectId = normalizeProjectId(args.projectId);
  const startedAt = new Date().toISOString();
  const baseJob = {
    id: `learn_job:${crypto.randomUUID()}`,
    workspace_id: workspaceId,
    project_id: projectId,
    run_id: args.runId ?? null,
    trigger: args.trigger ?? "api",
    events_synced: 0,
    candidates_generated: 0,
    candidates_synthesized: 0,
    synthesis_skipped: 0,
    settings_snapshot_json: settings,
    metadata_json: {},
    error: null,
    created_by: args.actorId ?? "system_learning",
    started_at: startedAt
  };
  if (!settings.enabled) {
    const completedAt = new Date().toISOString();
    const job: PersistedLearningJobRecord = {
      ...baseJob,
      status: "skipped",
      error: "learning_disabled",
      completed_at: completedAt
    };
    await writeLearningJob(job, { rootDir: location.rootDir, dbMode: location.mode });
    return { job, candidates: [] };
  }
  try {
    const eventsSynced = args.runId
      ? (await syncLearningEventsForRun(args.runId, { rootDir: location.rootDir, dbMode: location.mode })).length
      : await syncLearningEventsForScope({
        rootDir: location.rootDir,
        dbMode: location.mode,
        workspaceId,
        projectId,
        limit: settings.sync_limit
      });
    const generated = await generateAndPersistLearningCandidates({
      rootDir: location.rootDir,
      dbMode: location.mode,
      workspaceId,
      projectId
    });
    const allCandidates = await listPersistedLearningCandidates({
      rootDir: location.rootDir,
      dbMode: location.mode,
      workspaceId,
      projectId,
      limit: Number.MAX_SAFE_INTEGER
    });
    const events = await listPersistedLearningEvents({
      rootDir: location.rootDir,
      dbMode: location.mode,
      workspaceId,
      projectId,
      limit: Number.MAX_SAFE_INTEGER
    });
    const providerConfig = providerConfigFromSettings(args.providers);
    const today = new Date().toISOString().slice(0, 10);
    const existingJobs = await listPersistedLearningJobs({
      rootDir: location.rootDir,
      dbMode: location.mode,
      workspaceId,
      projectId,
      limit: Number.MAX_SAFE_INTEGER
    });
    const usedSynthesisCallsToday = existingJobs
      .filter((job) => String(job.completed_at || job.started_at).startsWith(today))
      .reduce((sum, job) => sum + (job.candidates_synthesized || 0), 0);
    let remainingSynthesisCalls = Math.max(0, settings.llm_max_calls_per_day - usedSynthesisCallsToday);
    let synthesized = 0;
    let skipped = 0;
    for (const candidate of allCandidates.filter((item) => ["proposed", "experimented"].includes(item.status))) {
      const sourceEvents = sourceEventsForCandidate(candidate, events);
      const eligibility = shouldRunLlmSynthesis({ candidate, sourceEvents, settings });
      if (eligibility.eligible && remainingSynthesisCalls <= 0) {
        skipped += 1;
        continue;
      }
      const result = await synthesizeCandidateWithLlm({
        candidate,
        sourceEvents,
        settings,
        providerConfig,
        rootDirOrOptions: { rootDir: location.rootDir, dbMode: location.mode }
      });
      if (result.synthesized) {
        synthesized += 1;
        remainingSynthesisCalls -= 1;
      }
      else skipped += 1;
    }
    const completedAt = new Date().toISOString();
    const job: PersistedLearningJobRecord = {
      ...baseJob,
      status: "completed",
      events_synced: eventsSynced,
      candidates_generated: generated.length,
      candidates_synthesized: synthesized,
      synthesis_skipped: skipped,
      completed_at: completedAt
      ,
      metadata_json: {
        synthesis_budget_used_today: usedSynthesisCallsToday,
        synthesis_budget_remaining_after_job: remainingSynthesisCalls
      }
    };
    await writeLearningJob(job, { rootDir: location.rootDir, dbMode: location.mode });
    const candidates = await listPersistedLearningCandidates({
      rootDir: location.rootDir,
      dbMode: location.mode,
      workspaceId,
      projectId,
      runId: args.runId ?? undefined,
      limit: Number.MAX_SAFE_INTEGER
    });
    return { job, candidates };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const job: PersistedLearningJobRecord = {
      ...baseJob,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      completed_at: completedAt
    };
    await writeLearningJob(job, { rootDir: location.rootDir, dbMode: location.mode });
    throw error;
  }
}

export async function listPersistedLearningCandidates(args?: {
  rootDir?: string;
  dbMode?: DatabaseMode;
  workspaceId?: string;
  projectId?: string;
  status?: string;
  runId?: string;
  targetId?: string;
  limit?: number;
}): Promise<PersistedLearningCandidateRecord[]> {
  const location = resolveLocation(args);
  const rows = await readTable<PersistedLearningCandidateRecord>(location.rootDir, "learning_candidates");
  const events = await readTable<PersistedLearningEventRecord>(location.rootDir, "learning_events");
  const workspaceId = args?.workspaceId ? normalizeWorkspaceId(args.workspaceId) : null;
  const projectId = args?.projectId ? normalizeProjectId(args.projectId) : null;
  return rows
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .filter((item) => !projectId || item.project_id === projectId)
    .filter((item) => !isInvalidLearningCandidate(item, sourceEventsForCandidate(item, events)))
    .map((item) => refreshCandidateDisplayCopy(item, sourceEventsForCandidate(item, events)))
    .filter((item) => !args?.status || item.status === args.status)
    .filter((item) => !args?.targetId || item.target_id === args.targetId)
    .filter((item) => !args?.runId || asStringArray(item.source_event_ids_json).some((eventId) => eventId.includes(args.runId ?? "")))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id))
    .slice(0, args?.limit ?? 250);
}

export async function readPersistedLearningCandidate(candidateId: string, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedLearningCandidateRecord | null> {
  const location = resolveLocation(rootDirOrOptions);
  const [rows, events] = await Promise.all([
    readTable<PersistedLearningCandidateRecord>(location.rootDir, "learning_candidates"),
    readTable<PersistedLearningEventRecord>(location.rootDir, "learning_events")
  ]);
  const candidate = rows.find((item) => item.id === candidateId) ?? null;
  if (!candidate) return null;
  const sourceEvents = sourceEventsForCandidate(candidate, events);
  return !isInvalidLearningCandidate(candidate, sourceEvents) ? refreshCandidateDisplayCopy(candidate, sourceEvents) : null;
}

async function writeCandidate(candidate: PersistedLearningCandidateRecord, rootDirOrOptions?: string | PersistenceReadOptions): Promise<PersistedLearningCandidateRecord> {
  const location = resolveLocation(rootDirOrOptions);
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({
      db,
      tableName: "learning_candidates",
      recordKey: candidate.id,
      payload: candidate,
      targetId: candidate.target_id,
      createdAt: candidate.created_at,
      parentKey: candidate.scope_id
    });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return candidate;
}

export async function createLearningExperiment(args: {
  candidateId: string;
  actorId: string;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<{ candidate: PersistedLearningCandidateRecord; experiment: PersistedLearningExperimentRecord }> {
  const location = resolveLocation(args.rootDirOrOptions);
  const candidate = await readPersistedLearningCandidate(args.candidateId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!candidate) throw new Error("learning_candidate_not_found");
  const sourceEventIds = asStringArray(candidate.source_event_ids_json);
  const events = (await listPersistedLearningEvents({ rootDir: location.rootDir, dbMode: location.mode, workspaceId: candidate.workspace_id, projectId: candidate.project_id, limit: Number.MAX_SAFE_INTEGER }))
    .filter((item) => sourceEventIds.includes(item.id));
  const recentRuns = await listPersistedRuns({ rootDir: location.rootDir, dbMode: location.mode, workspaceId: candidate.workspace_id, projectId: candidate.project_id, limit: 25 });
  const highRiskRelaxation = ["scoped_suppression_suggestion", "severity_calibration_suggestion"].includes(candidate.candidate_type);
  const regressions = highRiskRelaxation
    ? ["Candidate can reduce finding visibility or severity and therefore requires explicit human approval before any future-run effect."]
    : [];
  const experiment: PersistedLearningExperimentRecord = {
    id: newId("learn_exp"),
    candidate_id: candidate.id,
    workspace_id: candidate.workspace_id,
    project_id: candidate.project_id,
    status: regressions.length ? "inconclusive" : "passed",
    baseline_metrics_json: {
      recent_run_count: recentRuns.length,
      source_event_count: events.length,
      source_event_types: [...new Set(events.map((item) => item.event_type))]
    },
    candidate_metrics_json: {
      replay_mode: "dry_run",
      audit_behavior_changed: false,
      candidate_would_affect_future_runs_only_after_promotion: true,
      expected_source_events_addressed: events.length
    },
    regressions_json: regressions,
    notes_json: [
      "V1 experiment is a governed dry run. It records expected effect and approval risk, but does not mutate prompts, policy packs, suppressions, or audit execution."
    ],
    created_at: new Date().toISOString(),
    created_by: args.actorId
  };
  const nextCandidate: PersistedLearningCandidateRecord = {
    ...candidate,
    status: "experimented",
    updated_at: experiment.created_at,
    metadata_json: {
      ...asObject(candidate.metadata_json),
      latest_experiment_id: experiment.id,
      latest_experiment_status: experiment.status
    }
  };
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({ db, tableName: "learning_experiments", recordKey: experiment.id, payload: experiment, createdAt: experiment.created_at, parentKey: candidate.id });
    upsertSqliteRecord({ db, tableName: "learning_candidates", recordKey: nextCandidate.id, payload: nextCandidate, targetId: nextCandidate.target_id, createdAt: nextCandidate.created_at, parentKey: nextCandidate.scope_id });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return { candidate: nextCandidate, experiment };
}

export async function listPersistedLearningExperiments(args?: {
  rootDir?: string;
  dbMode?: DatabaseMode;
  candidateId?: string;
  workspaceId?: string;
  projectId?: string;
  limit?: number;
}): Promise<PersistedLearningExperimentRecord[]> {
  const location = resolveLocation(args);
  const rows = await readTable<PersistedLearningExperimentRecord>(location.rootDir, "learning_experiments");
  const workspaceId = args?.workspaceId ? normalizeWorkspaceId(args.workspaceId) : null;
  const projectId = args?.projectId ? normalizeProjectId(args.projectId) : null;
  return rows
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .filter((item) => !projectId || item.project_id === projectId)
    .filter((item) => !args?.candidateId || item.candidate_id === args.candidateId)
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
    .slice(0, args?.limit ?? 250);
}

export async function promoteLearningCandidate(args: {
  candidateId: string;
  actorId: string;
  expiresAt?: string | null;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<{ candidate: PersistedLearningCandidateRecord; promotion: PersistedLearningPromotionRecord }> {
  const location = resolveLocation(args.rootDirOrOptions);
  const candidate = await readPersistedLearningCandidate(args.candidateId, { rootDir: location.rootDir, dbMode: location.mode });
  if (!candidate) throw new Error("learning_candidate_not_found");
  if (candidate.status === "promoted") throw new Error("learning_candidate_already_promoted");
  if (candidate.status === "rejected") throw new Error("learning_candidate_rejected");
  const experiments = await listPersistedLearningExperiments({ rootDir: location.rootDir, dbMode: location.mode, candidateId: candidate.id });
  const latestExperiment = experiments[0] ?? null;
  const now = new Date().toISOString();
  const promotion: PersistedLearningPromotionRecord = {
    id: newId("learn_promo"),
    candidate_id: candidate.id,
    experiment_id: latestExperiment?.id ?? null,
    workspace_id: candidate.workspace_id,
    project_id: candidate.project_id,
    scope_type: candidate.scope_type,
    scope_id: candidate.scope_id,
    target_id: candidate.target_id,
    promoted_artifact_type: candidate.candidate_type,
    promoted_artifact_version: `learning-overlay-${now}`,
    applied_change_json: {
      ...asObject(candidate.proposed_change_json),
      v1_application: "Recorded as approved learning overlay. Core audit execution is unchanged unless future code explicitly consumes this overlay."
    },
    rollback_pointer_json: {
      candidate_status_before_promotion: candidate.status,
      promotion_can_be_rolled_back: true
    },
    status: "active",
    promoted_by: args.actorId,
    promoted_at: now,
    rolled_back_by: null,
    rolled_back_at: null,
    rollback_reason: null,
    expires_at: args.expiresAt ?? candidate.expires_at,
    metadata_json: {
      human_approved: true,
      v1_no_automatic_live_behavior_change: true
    }
  };
  const nextCandidate: PersistedLearningCandidateRecord = {
    ...candidate,
    status: "promoted",
    updated_at: now,
    reviewed_by: args.actorId,
    reviewed_at: now,
    expires_at: args.expiresAt ?? candidate.expires_at,
    metadata_json: {
      ...asObject(candidate.metadata_json),
      promotion_id: promotion.id
    }
  };
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({ db, tableName: "learning_promotions", recordKey: promotion.id, payload: promotion, targetId: promotion.target_id, createdAt: promotion.promoted_at, parentKey: promotion.candidate_id });
    upsertSqliteRecord({ db, tableName: "learning_candidates", recordKey: nextCandidate.id, payload: nextCandidate, targetId: nextCandidate.target_id, createdAt: nextCandidate.created_at, parentKey: nextCandidate.scope_id });
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return { candidate: nextCandidate, promotion };
}

export async function rejectLearningCandidate(args: {
  candidateId: string;
  actorId: string;
  reason?: string | null;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<PersistedLearningCandidateRecord> {
  const candidate = await readPersistedLearningCandidate(args.candidateId, args.rootDirOrOptions);
  if (!candidate) throw new Error("learning_candidate_not_found");
  const now = new Date().toISOString();
  return writeCandidate({
    ...candidate,
    status: "rejected",
    updated_at: now,
    reviewed_by: args.actorId,
    reviewed_at: now,
    rejection_reason: args.reason ?? "Rejected by reviewer."
  }, args.rootDirOrOptions);
}

export async function listPersistedLearningPromotions(args?: {
  rootDir?: string;
  dbMode?: DatabaseMode;
  workspaceId?: string;
  projectId?: string;
  status?: string;
  limit?: number;
}): Promise<PersistedLearningPromotionRecord[]> {
  const location = resolveLocation(args);
  const rows = await readTable<PersistedLearningPromotionRecord>(location.rootDir, "learning_promotions");
  const workspaceId = args?.workspaceId ? normalizeWorkspaceId(args.workspaceId) : null;
  const projectId = args?.projectId ? normalizeProjectId(args.projectId) : null;
  return rows
    .filter((item) => !workspaceId || item.workspace_id === workspaceId)
    .filter((item) => !projectId || item.project_id === projectId)
    .filter((item) => !args?.status || item.status === args.status)
    .sort((left, right) => right.promoted_at.localeCompare(left.promoted_at) || right.id.localeCompare(left.id))
    .slice(0, args?.limit ?? 250);
}

export async function rollbackLearningPromotion(args: {
  promotionId: string;
  actorId: string;
  reason?: string | null;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<{ candidate: PersistedLearningCandidateRecord | null; promotion: PersistedLearningPromotionRecord }> {
  const location = resolveLocation(args.rootDirOrOptions);
  const promotions = await readTable<PersistedLearningPromotionRecord>(location.rootDir, "learning_promotions");
  const promotion = promotions.find((item) => item.id === args.promotionId) ?? null;
  if (!promotion) throw new Error("learning_promotion_not_found");
  if (promotion.status === "rolled_back") throw new Error("learning_promotion_already_rolled_back");
  const now = new Date().toISOString();
  const nextPromotion: PersistedLearningPromotionRecord = {
    ...promotion,
    status: "rolled_back",
    rolled_back_by: args.actorId,
    rolled_back_at: now,
    rollback_reason: args.reason ?? "Rolled back by reviewer."
  };
  const candidate = await readPersistedLearningCandidate(promotion.candidate_id, { rootDir: location.rootDir, dbMode: location.mode });
  const nextCandidate = candidate ? {
    ...candidate,
    status: "rolled_back" as const,
    updated_at: now,
    metadata_json: {
      ...asObject(candidate.metadata_json),
      rolled_back_promotion_id: promotion.id
    }
  } : null;
  const db = await openSqliteDatabase(location.rootDir);
  try {
    ensureSqliteSchema(db);
    upsertSqliteRecord({ db, tableName: "learning_promotions", recordKey: nextPromotion.id, payload: nextPromotion, targetId: nextPromotion.target_id, createdAt: nextPromotion.promoted_at, parentKey: nextPromotion.candidate_id });
    if (nextCandidate) {
      upsertSqliteRecord({ db, tableName: "learning_candidates", recordKey: nextCandidate.id, payload: nextCandidate, targetId: nextCandidate.target_id, createdAt: nextCandidate.created_at, parentKey: nextCandidate.scope_id });
    }
    await saveSqliteDatabase(location.rootDir, db, location.mode);
  } finally {
    db.close();
  }
  return { candidate: nextCandidate, promotion: nextPromotion };
}
