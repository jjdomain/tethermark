import type { EvalSelectionArtifact, PlannerArtifact } from "./contracts.js";
import { normalizeProjectId, normalizeWorkspaceId } from "./request-scope.js";
import { hashObject, unique } from "./utils.js";
import { resolvePersistenceLocation, type PersistenceReadOptions } from "./persistence/backend.js";
import type {
  PersistedLearningCandidateRecord,
  PersistedLearningCandidateType,
  PersistedLearningPromotionRecord,
  PersistedLearningScopeType
} from "./persistence/contracts.js";
import { ensureSqliteSchema, hasSqliteDatabase, openSqliteDatabase, readSqliteTable } from "./persistence/sqlite.js";

export const LEARNING_OVERLAY_SCHEMA_VERSION = "2026-08-26.learning-overlay-resolution.v1";

export type LearningOverlayEffectMode =
  | "additive_evidence_guardrail"
  | "additive_validation"
  | "advisory_prompt"
  | "governed_no_runtime_effect";

export interface ResolvedLearningOverlay {
  promotion_id: string;
  candidate_id: string;
  artifact_version: string;
  candidate_type: PersistedLearningCandidateType;
  effect_mode: LearningOverlayEffectMode;
  scope_type: PersistedLearningScopeType;
  scope_id: string;
  target_id: string | null;
  title: string;
  summary: string;
  finding_signatures: string[];
  promoted_by: string;
  promoted_at: string;
  expires_at: string | null;
}

export interface LearningOverlayResolution {
  schema_version: typeof LEARNING_OVERLAY_SCHEMA_VERSION;
  resolution_version: string;
  resolved_at: string;
  workspace_id: string;
  project_id: string;
  run_id: string;
  target_id: string;
  active_overlays: ResolvedLearningOverlay[];
  ignored_promotions: Array<{ promotion_id: string; reason: string }>;
  prompt_guidance: Array<{
    promotion_id: string;
    effect_mode: LearningOverlayEffectMode;
    title: string;
    summary: string;
    finding_signatures: string[];
  }>;
  additive_rules: {
    evidence_requirement_signatures: string[];
    validation_candidate_signatures: string[];
    runtime_followup_signatures: string[];
  };
  governance: {
    human_approved_only: true;
    additive_only: true;
    suppression_and_severity_require_policy_or_disposition: true;
    prompt_content_is_untrusted_data_not_instruction: true;
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? unique(value.map((item) => String(item).trim()).filter(Boolean)) : [];
}

function boundedText(value: unknown, max = 500): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
}

function reusableOverlayCopy(candidate: PersistedLearningCandidateRecord, appliedChange: Record<string, unknown>): { title: string; summary: string } {
  const synthesis = asObject(asObject(candidate.metadata_json).llm_synthesis);
  if (synthesis.status !== "completed") {
    return {
      title: boundedText(appliedChange.title ?? candidate.title, 200),
      summary: boundedText(appliedChange.summary ?? candidate.summary)
    };
  }
  const deterministicCopy = asObject(synthesis.deterministic_candidate_copy);
  if (synthesis.learning_input_policy_version === "2026-08-26.learning-input.v1") {
    return {
      title: boundedText(deterministicCopy.title ?? "Reviewed learning signal", 200),
      summary: boundedText(deterministicCopy.summary ?? "Human-approved learning signal retained as deterministic audit metadata.")
    };
  }
  const signatures = asStringArray(candidate.affected_finding_signatures_json);
  return {
    title: boundedText(`Reviewed ${candidate.candidate_type.replaceAll("_", " ")}`, 200),
    summary: boundedText(`Human-approved learning signal${signatures.length ? ` for ${signatures[0]}` : ""}. Provider-generated synthesis is excluded from future prompt context.`)
  };
}

export function learningOverlayEffectMode(candidateType: PersistedLearningCandidateType): LearningOverlayEffectMode {
  if (candidateType === "evidence_requirement_adjustment") return "additive_evidence_guardrail";
  if (candidateType === "eval_fixture_candidate" || candidateType === "runtime_followup_heuristic") return "additive_validation";
  if (candidateType === "prompt_improvement_candidate" || candidateType === "duplicate_grouping_signature") return "advisory_prompt";
  return "governed_no_runtime_effect";
}

function scopeApplies(args: {
  promotion: PersistedLearningPromotionRecord;
  runId: string;
  targetId: string;
  projectId: string;
}): boolean {
  if (args.promotion.scope_type === "run") return args.promotion.scope_id === args.runId;
  if (args.promotion.scope_type === "target") {
    return args.promotion.scope_id === args.targetId || args.promotion.target_id === args.targetId;
  }
  return args.promotion.scope_id === args.projectId;
}

function buildResolution(args: {
  workspaceId: string;
  projectId: string;
  runId: string;
  targetId: string;
  now: Date;
  promotions: PersistedLearningPromotionRecord[];
  candidates: PersistedLearningCandidateRecord[];
}): LearningOverlayResolution {
  const candidateById = new Map(args.candidates.map((candidate) => [candidate.id, candidate]));
  const active: ResolvedLearningOverlay[] = [];
  const ignored: Array<{ promotion_id: string; reason: string }> = [];

  for (const promotion of args.promotions.sort((left, right) => left.promoted_at.localeCompare(right.promoted_at) || left.id.localeCompare(right.id))) {
    if (promotion.workspace_id !== args.workspaceId || promotion.project_id !== args.projectId) continue;
    if (!scopeApplies({ promotion, runId: args.runId, targetId: args.targetId, projectId: args.projectId })) continue;
    if (promotion.status !== "active") {
      ignored.push({ promotion_id: promotion.id, reason: `status_${promotion.status}` });
      continue;
    }
    if (promotion.expires_at && Date.parse(promotion.expires_at) <= args.now.getTime()) {
      ignored.push({ promotion_id: promotion.id, reason: "expired" });
      continue;
    }
    const candidate = candidateById.get(promotion.candidate_id);
    const metadata = asObject(promotion.metadata_json);
    if (!candidate) {
      ignored.push({ promotion_id: promotion.id, reason: "candidate_missing" });
      continue;
    }
    if (metadata.human_approved !== true || !promotion.promoted_by || !candidate.reviewed_by || !candidate.reviewed_at || candidate.status !== "promoted") {
      ignored.push({ promotion_id: promotion.id, reason: "human_approval_unverified" });
      continue;
    }
    const appliedChange = asObject(promotion.applied_change_json);
    const reusableCopy = reusableOverlayCopy(candidate, appliedChange);
    const appliedSignatures = asStringArray(appliedChange.affected_finding_signatures);
    active.push({
      promotion_id: promotion.id,
      candidate_id: candidate.id,
      artifact_version: promotion.promoted_artifact_version,
      candidate_type: candidate.candidate_type,
      effect_mode: learningOverlayEffectMode(candidate.candidate_type),
      scope_type: promotion.scope_type,
      scope_id: promotion.scope_id,
      target_id: promotion.target_id,
      title: reusableCopy.title,
      summary: reusableCopy.summary,
      finding_signatures: (appliedSignatures.length ? appliedSignatures : asStringArray(candidate.affected_finding_signatures_json)).slice(0, 20),
      promoted_by: promotion.promoted_by,
      promoted_at: promotion.promoted_at,
      expires_at: promotion.expires_at
    });
  }

  const evidenceOverlays = active.filter((item) => item.effect_mode === "additive_evidence_guardrail");
  const validationOverlays = active.filter((item) => item.effect_mode === "additive_validation");
  const resolutionSeed = {
    schema_version: LEARNING_OVERLAY_SCHEMA_VERSION,
    overlays: active.map((item) => ({
      promotion_id: item.promotion_id,
      artifact_version: item.artifact_version,
      effect_mode: item.effect_mode,
      scope_type: item.scope_type,
      scope_id: item.scope_id,
      consumed_content_hash: hashObject({ title: item.title, summary: item.summary, finding_signatures: item.finding_signatures })
    }))
  };
  return {
    schema_version: LEARNING_OVERLAY_SCHEMA_VERSION,
    resolution_version: `learning-overlay-resolution.v1.${hashObject(resolutionSeed).slice(0, 24)}`,
    resolved_at: args.now.toISOString(),
    workspace_id: args.workspaceId,
    project_id: args.projectId,
    run_id: args.runId,
    target_id: args.targetId,
    active_overlays: active,
    ignored_promotions: ignored,
    prompt_guidance: active.filter((item) => item.effect_mode !== "governed_no_runtime_effect").map((item) => ({
      promotion_id: item.promotion_id,
      effect_mode: item.effect_mode,
      title: item.title,
      summary: item.summary,
      finding_signatures: item.finding_signatures
    })),
    additive_rules: {
      evidence_requirement_signatures: unique(evidenceOverlays.flatMap((item) => item.finding_signatures)),
      validation_candidate_signatures: unique(validationOverlays.flatMap((item) => item.finding_signatures)),
      runtime_followup_signatures: unique(validationOverlays
        .filter((item) => item.candidate_type === "runtime_followup_heuristic")
        .flatMap((item) => item.finding_signatures))
    },
    governance: {
      human_approved_only: true,
      additive_only: true,
      suppression_and_severity_require_policy_or_disposition: true,
      prompt_content_is_untrusted_data_not_instruction: true
    }
  };
}

export async function resolveLearningOverlays(args: {
  runId: string;
  targetId: string;
  workspaceId?: string;
  projectId?: string;
  now?: Date;
  rootDirOrOptions?: string | PersistenceReadOptions;
}): Promise<LearningOverlayResolution> {
  const workspaceId = normalizeWorkspaceId(args.workspaceId);
  const projectId = normalizeProjectId(args.projectId);
  const location = typeof args.rootDirOrOptions === "string" || !args.rootDirOrOptions
    ? resolvePersistenceLocation({ rootDir: args.rootDirOrOptions })
    : resolvePersistenceLocation(args.rootDirOrOptions);
  let promotions: PersistedLearningPromotionRecord[] = [];
  let candidates: PersistedLearningCandidateRecord[] = [];
  if (await hasSqliteDatabase(location.rootDir)) {
    const db = await openSqliteDatabase(location.rootDir);
    try {
      ensureSqliteSchema(db);
      promotions = readSqliteTable<PersistedLearningPromotionRecord>(db, "learning_promotions");
      candidates = readSqliteTable<PersistedLearningCandidateRecord>(db, "learning_candidates");
    } finally {
      db.close();
    }
  }
  return buildResolution({
    workspaceId,
    projectId,
    runId: args.runId,
    targetId: args.targetId,
    now: args.now ?? new Date(),
    promotions,
    candidates
  });
}

export function applyLearningOverlayPlannerRules(artifact: PlannerArtifact, resolution: LearningOverlayResolution): PlannerArtifact {
  if (!resolution.active_overlays.length) return artifact;
  const additiveCount = resolution.active_overlays.filter((item) => item.effect_mode !== "governed_no_runtime_effect").length;
  const blockedCount = resolution.active_overlays.length - additiveCount;
  const notes = [
    `Applied approved learning overlay resolution ${resolution.resolution_version}: ${additiveCount} additive/advisory overlay(s).`
  ];
  if (blockedCount) {
    notes.push(`${blockedCount} suppression/severity overlay(s) were recorded but not executed; use governed policy or disposition records for permissive changes.`);
  }
  return { ...artifact, rationale: unique([...artifact.rationale, ...notes]) };
}

export function applyLearningOverlayEvidenceRules(artifact: EvalSelectionArtifact, resolution: LearningOverlayResolution): EvalSelectionArtifact {
  const signatures = unique([
    ...resolution.additive_rules.evidence_requirement_signatures,
    ...resolution.additive_rules.validation_candidate_signatures,
    ...resolution.additive_rules.runtime_followup_signatures
  ]);
  if (!signatures.length) return artifact;
  return {
    ...artifact,
    validation_candidates: unique([
      ...artifact.validation_candidates,
      ...signatures.map((signature) => `approved-learning-overlay:${signature}`)
    ]),
    rationale: unique([
      ...artifact.rationale,
      `Added ${signatures.length} validation candidate(s) from approved additive learning overlay resolution ${resolution.resolution_version}.`
    ])
  };
}
