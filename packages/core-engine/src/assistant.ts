import { buildFindingEvaluationSummary } from "./finding-evaluation.js";
import { buildReviewSummary } from "./review-summary.js";
import { normalizeProjectId, normalizeWorkspaceId } from "./request-scope.js";
import { createModelProvider, type ProviderConfig } from "../../llm-provider/src/index.js";
import type { AuditRequest, SandboxExecutionArtifact } from "./contracts.js";
import type { PersistenceReadOptions } from "./persistence/backend.js";
import type {
  PersistedArtifactIndexRecord,
  PersistedEvidenceRecord,
  PersistedFindingRecord,
  PersistedRemediationItemRecord,
  PersistedRemediationMemoRecord,
  PersistedReviewActionRecord,
  PersistedReviewCommentRecord,
  PersistedReviewDecisionRecord,
  PersistedReviewWorkflowRecord,
  PersistedRunRecord,
  PersistedScoreSummaryRecord,
  PersistedToolExecutionRecord
} from "./persistence/contracts.js";
import { readPersistedFindingDispositionsForRun } from "./persistence/finding-dispositions.js";
import { readPersistedRemediationItemsForRun } from "./persistence/remediation-items.js";
import { getPersistedRun, getPersistedTarget, listPersistedRunsForTarget, type PersistedRunListItem, type PersistedTargetListItem } from "./persistence/query.js";
import {
  readPersistedArtifactIndex,
  readPersistedEvidenceRecords,
  readPersistedFindings,
  readPersistedRemediationMemo,
  readPersistedReviewActions,
  readPersistedReviewComments,
  readPersistedReviewDecision,
  readPersistedReviewWorkflow,
  readPersistedScoreSummary,
  readPersistedStageArtifact,
  readPersistedSupervisorReview,
  readPersistedToolExecutions
} from "./persistence/run-details.js";

export type AssistantProductMode = "oss" | "hosted";
export type AssistantCapability = "read" | "draft" | "confirm_internal" | "confirm_external" | "autonomous";
export type AssistantScopeType = "run" | "target" | "project" | "workspace" | "organization" | "portfolio";
export type AssistantConfidence = "high" | "medium" | "low" | "insufficient_evidence";
export type AssistantMessageRole = "user" | "assistant" | "system";
export type AssistantActionStatus = "proposed" | "confirmed" | "rejected" | "failed";

export interface AssistantCitation {
  citation_type: "run" | "target" | "finding" | "evidence" | "artifact" | "review_action" | "review_comment" | "tool_execution" | "report";
  id: string;
  label: string;
  run_id?: string | null;
  finding_id?: string | null;
  artifact_type?: string | null;
  timestamp?: string | null;
}

export interface AssistantProposedAction {
  id: string;
  action_type:
    | "generate_export"
    | "draft_finding_disposition"
    | "add_review_comment"
    | "launch_run"
    | "retry_job"
    | "cancel_job"
    | "queue_runtime_followup"
    | "external_outbound_preview"
    | "hosted_only";
  capability: AssistantCapability;
  title: string;
  summary: string;
  requires_confirmation: boolean;
  hosted_only: boolean;
  payload_json: Record<string, unknown>;
}

export type AssistantToolDefinition = {
  action_type: AssistantProposedAction["action_type"];
  capability: AssistantCapability;
  hosted_only: boolean;
  requires_confirmation: boolean;
};

export interface AssistantToolRegistryExtension {
  capabilities?: AssistantCapability[];
  scopes?: AssistantScopeType[];
  tools?: AssistantToolDefinition[];
}

export interface AssistantResponse {
  message: string;
  citations: AssistantCitation[];
  confidence: AssistantConfidence;
  proposed_actions: AssistantProposedAction[];
  limitations: string[];
}

export interface AssistantModelConfig {
  inherit_default: boolean;
  provider: string | null;
  model: string | null;
  source: "global_default" | "assistant_override" | "environment" | "unset";
}

export interface AssistantSessionRecord {
  id: string;
  scope_type: AssistantScopeType;
  scope_id: string;
  workspace_id: string;
  project_id: string;
  target_id: string | null;
  run_id: string | null;
  actor_id: string;
  product_mode: AssistantProductMode;
  status: "active" | "archived" | "deleted" | "closed";
  created_at: string;
  updated_at: string;
  metadata_json: Record<string, unknown> | null;
}

export interface AssistantMessageRecord {
  id: string;
  session_id: string;
  role: AssistantMessageRole;
  body: string;
  response_json: AssistantResponse | null;
  created_at: string;
}

export interface AssistantCitationRecord extends AssistantCitation {
  id: string;
  session_id: string;
  message_id: string;
  created_at: string;
}

export interface AssistantActionProposalRecord {
  id: string;
  session_id: string;
  message_id: string;
  action_type: AssistantProposedAction["action_type"];
  capability: AssistantCapability;
  status: AssistantActionStatus;
  title: string;
  summary: string;
  requires_confirmation: boolean;
  hosted_only: boolean;
  payload_json: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface AssistantActionExecutionRecord {
  id: string;
  session_id: string;
  action_id: string;
  actor_id: string;
  status: "succeeded" | "failed" | "rejected";
  original_user_request: string | null;
  proposed_action_json: AssistantActionProposalRecord | null;
  confirmation_result: "confirmed" | "rejected" | "failed";
  before_state_json: Record<string, unknown> | null;
  after_state_json: Record<string, unknown> | null;
  request_json: Record<string, unknown>;
  result_json: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

export interface AssistantCapabilities {
  product_mode: AssistantProductMode;
  enabled_capabilities: AssistantCapability[];
  allowed_scopes: AssistantScopeType[];
  hosted_only_scopes: AssistantScopeType[];
  tools: AssistantToolDefinition[];
}

export interface AssistantContext {
  scope_type: AssistantScopeType;
  scope_id: string;
  run: PersistedRunListItem | null;
  target: PersistedTargetListItem | null;
  target_runs: PersistedRunListItem[];
  score_summary: PersistedScoreSummaryRecord | null;
  review_decision: PersistedReviewDecisionRecord | null;
  review_workflow: PersistedReviewWorkflowRecord | null;
  review_actions: PersistedReviewActionRecord[];
  review_comments: PersistedReviewCommentRecord[];
  findings: PersistedFindingRecord[];
  target_history_findings: Record<string, PersistedFindingRecord[]>;
  evidence_records: PersistedEvidenceRecord[];
  tool_executions: PersistedToolExecutionRecord[];
  artifact_index: PersistedArtifactIndexRecord[];
  remediation_memo: PersistedRemediationMemoRecord | null;
  remediation_items: PersistedRemediationItemRecord[];
  review_summary: ReturnType<typeof buildReviewSummary> | null;
  finding_evaluations: ReturnType<typeof buildFindingEvaluationSummary> | null;
  executive_summary: Record<string, unknown> | null;
}

export interface AssistantContextBuilder {
  buildContext(args: {
    scopeType: AssistantScopeType;
    scopeId: string;
    rootDirOrOptions?: string | PersistenceReadOptions;
  }): Promise<AssistantContext>;
}

export interface AssistantProvider {
  answer(args: {
    prompt: string;
    session: AssistantSessionRecord;
    context: AssistantContext;
    capabilities: AssistantCapabilities;
    modelConfig?: AssistantModelConfig;
  }): Promise<AssistantResponse>;
}

export interface AssistantToolRegistry {
  capabilities(productMode: AssistantProductMode): AssistantCapabilities;
  isScopeAllowed(scopeType: AssistantScopeType, productMode: AssistantProductMode): boolean;
}

export interface AssistantStorage {
  createSession(input: Omit<AssistantSessionRecord, "id" | "status" | "created_at" | "updated_at">): Promise<AssistantSessionRecord>;
  getSession(sessionId: string): Promise<AssistantSessionRecord | null>;
  listSessions(filter?: {
    workspaceId?: string;
    projectId?: string;
    scopeType?: AssistantScopeType;
    scopeId?: string;
    status?: AssistantSessionRecord["status"] | "all";
  }): Promise<AssistantSessionRecord[]>;
  updateSession(session: AssistantSessionRecord): Promise<AssistantSessionRecord>;
  listMessages(sessionId: string): Promise<AssistantMessageRecord[]>;
  appendMessage(input: Omit<AssistantMessageRecord, "id" | "created_at">): Promise<AssistantMessageRecord>;
  persistResponseArtifacts(args: {
    sessionId: string;
    messageId: string;
    response: AssistantResponse;
  }): Promise<{ citations: AssistantCitationRecord[]; actions: AssistantActionProposalRecord[] }>;
  getActionProposal(sessionId: string, actionId: string): Promise<AssistantActionProposalRecord | null>;
  updateActionProposal(action: AssistantActionProposalRecord): Promise<AssistantActionProposalRecord>;
  createActionExecution(input: Omit<AssistantActionExecutionRecord, "id" | "created_at">): Promise<AssistantActionExecutionRecord>;
}

export function assistantEnabled(): boolean {
  return process.env.HARNESS_ENABLE_ASSISTANT === "1" || process.env.HARNESS_ENABLE_ASSISTANT === "true";
}

export function resolveAssistantProductMode(): AssistantProductMode {
  return process.env.HARNESS_PRODUCT_MODE === "hosted" ? "hosted" : "oss";
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

export function createDefaultAssistantToolRegistry(extensions: AssistantToolRegistryExtension[] = []): AssistantToolRegistry {
  const ossCapabilities: AssistantCapability[] = ["read", "draft", "confirm_internal"];
  const extensionCapabilities = extensions.flatMap((extension) => extension.capabilities ?? []);
  const hostedCapabilities: AssistantCapability[] = uniqueValues([...ossCapabilities, "confirm_external", "autonomous", ...extensionCapabilities]);
  const extensionScopes = extensions.flatMap((extension) => extension.scopes ?? []);
  const hostedScopes: AssistantScopeType[] = uniqueValues(["run", "target", "project", "workspace", "organization", "portfolio", ...extensionScopes]);
  const tools: AssistantCapabilities["tools"] = [
    { action_type: "generate_export", capability: "confirm_internal", hosted_only: false, requires_confirmation: true },
    { action_type: "draft_finding_disposition", capability: "confirm_internal", hosted_only: false, requires_confirmation: true },
    { action_type: "add_review_comment", capability: "confirm_internal", hosted_only: false, requires_confirmation: true },
    { action_type: "launch_run", capability: "confirm_internal", hosted_only: false, requires_confirmation: true },
    { action_type: "retry_job", capability: "confirm_internal", hosted_only: false, requires_confirmation: true },
    { action_type: "cancel_job", capability: "confirm_internal", hosted_only: false, requires_confirmation: true },
    { action_type: "queue_runtime_followup", capability: "confirm_internal", hosted_only: false, requires_confirmation: true },
    { action_type: "external_outbound_preview", capability: "draft", hosted_only: false, requires_confirmation: false },
    { action_type: "hosted_only", capability: "confirm_external", hosted_only: true, requires_confirmation: true },
    ...extensions.flatMap((extension) => extension.tools ?? [])
  ];
  return {
    capabilities(productMode) {
      return {
        product_mode: productMode,
        enabled_capabilities: productMode === "hosted" ? hostedCapabilities : ossCapabilities,
        allowed_scopes: productMode === "hosted" ? hostedScopes : ["run", "target"],
        hosted_only_scopes: ["project", "workspace", "organization", "portfolio"],
        tools: productMode === "hosted" ? tools : tools.filter((tool) => !tool.hosted_only && tool.capability !== "confirm_external" && tool.capability !== "autonomous")
      };
    },
    isScopeAllowed(scopeType, productMode) {
      return this.capabilities(productMode).allowed_scopes.includes(scopeType);
    }
  };
}

export class DefaultAssistantContextBuilder implements AssistantContextBuilder {
  async buildContext(args: {
    scopeType: AssistantScopeType;
    scopeId: string;
    rootDirOrOptions?: string | PersistenceReadOptions;
  }): Promise<AssistantContext> {
    if (args.scopeType === "run") {
      const run = await getPersistedRun(args.scopeId, args.rootDirOrOptions);
      if (!run) throw new Error("run_not_found");
      return buildRunContext(run, args.scopeType, args.scopeId, args.rootDirOrOptions);
    }
    if (args.scopeType === "target") {
      const target = await getPersistedTarget(args.scopeId, args.rootDirOrOptions);
      if (!target) throw new Error("target_not_found");
      const targetRuns = await listPersistedRunsForTarget(args.scopeId, args.rootDirOrOptions);
      const latestRun = targetRuns[0] ?? null;
      if (!latestRun) {
        return {
          scope_type: args.scopeType,
          scope_id: args.scopeId,
          run: null,
          target,
          target_runs: [],
          score_summary: null,
          review_decision: null,
          review_workflow: null,
          review_actions: [],
          review_comments: [],
          findings: [],
          target_history_findings: {},
          evidence_records: [],
          tool_executions: [],
          artifact_index: [],
          remediation_memo: null,
          remediation_items: [],
          review_summary: null,
          finding_evaluations: null,
          executive_summary: null
        };
      }
      return buildRunContext(latestRun, args.scopeType, args.scopeId, args.rootDirOrOptions, targetRuns, target);
    }
    throw new Error("hosted_only_scope");
  }
}

async function buildRunContext(
  run: PersistedRunListItem,
  scopeType: AssistantScopeType,
  scopeId: string,
  rootDirOrOptions?: string | PersistenceReadOptions,
  targetRuns?: PersistedRunListItem[],
  target?: PersistedTargetListItem | null
): Promise<AssistantContext> {
  const [
    scoreSummary,
    reviewDecision,
    reviewWorkflow,
    reviewActions,
    reviewComments,
    findings,
    evidenceRecords,
    toolExecutions,
    artifactIndex,
    remediationMemo,
    remediationItems,
    dispositions,
    executiveSummary
  ] = await Promise.all([
    readPersistedScoreSummary(run.id, rootDirOrOptions),
    readPersistedReviewDecision(run.id, rootDirOrOptions),
    readPersistedReviewWorkflow(run.id, rootDirOrOptions),
    readPersistedReviewActions(run.id, rootDirOrOptions),
    readPersistedReviewComments(run.id, rootDirOrOptions),
    readPersistedFindings(run.id, rootDirOrOptions),
    readPersistedEvidenceRecords(run.id, rootDirOrOptions),
    readPersistedToolExecutions(run.id, rootDirOrOptions),
    readPersistedArtifactIndex(run.id, rootDirOrOptions),
    readPersistedRemediationMemo(run.id, rootDirOrOptions),
    readPersistedRemediationItemsForRun(run.id, rootDirOrOptions),
    readPersistedFindingDispositionsForRun(run.id, rootDirOrOptions),
    readPersistedStageArtifact<Record<string, unknown>>(run.id, "executive-summary", rootDirOrOptions)
  ]);
  const [supervisorReview, sandboxExecution] = await Promise.all([
    readPersistedSupervisorReview(run.id, rootDirOrOptions),
    readPersistedStageArtifact<SandboxExecutionArtifact>(run.id, "sandbox-execution", rootDirOrOptions)
  ]);
  const reviewSummary = buildReviewSummary({
    workflow: reviewWorkflow,
    findings,
    actions: reviewActions,
    comments: reviewComments,
    dispositions
  });
  const findingEvaluations = buildFindingEvaluationSummary({
    findings,
    supervisorReview,
    workflow: reviewWorkflow,
    actions: reviewActions,
    comments: reviewComments,
    dispositions,
    sandboxExecution,
    evidenceRecords,
    runtimeFollowups: []
  });
  const historyRuns = targetRuns ?? await listPersistedRunsForTarget(run.canonical_target_id ?? run.target_id, rootDirOrOptions);
  const targetHistoryFindings = Object.fromEntries(await Promise.all(historyRuns.slice(0, 5).map(async (historyRun) => [
    historyRun.id,
    historyRun.id === run.id ? findings : await readPersistedFindings(historyRun.id, rootDirOrOptions)
  ] as const)));
  return {
    scope_type: scopeType,
    scope_id: scopeId,
    run,
    target: target ?? (run.canonical_target_id ? await getPersistedTarget(run.canonical_target_id, rootDirOrOptions) : null),
    target_runs: historyRuns,
    score_summary: scoreSummary,
    review_decision: reviewDecision,
    review_workflow: reviewWorkflow,
    review_actions: reviewActions,
    review_comments: reviewComments,
    findings,
    target_history_findings: targetHistoryFindings,
    evidence_records: evidenceRecords,
    tool_executions: toolExecutions,
    artifact_index: artifactIndex,
    remediation_memo: remediationMemo,
    remediation_items: remediationItems,
    review_summary: reviewSummary,
    finding_evaluations: findingEvaluations,
    executive_summary: executiveSummary
  };
}

function severityRank(value: string): number {
  return ["info", "low", "medium", "high", "critical"].indexOf(String(value || "").toLowerCase());
}

function findingCitation(finding: PersistedFindingRecord): AssistantCitation {
  return {
    citation_type: "finding",
    id: finding.id,
    label: finding.title,
    run_id: finding.run_id,
    finding_id: finding.id,
    timestamp: finding.created_at
  };
}

function evidenceCitation(record: PersistedEvidenceRecord): AssistantCitation {
  return {
    citation_type: "evidence",
    id: record.id,
    label: record.summary,
    run_id: record.run_id,
    timestamp: null
  };
}

function runCitation(run: Pick<PersistedRunRecord, "id" | "created_at">): AssistantCitation {
  return {
    citation_type: "run",
    id: run.id,
    label: `Run ${run.id}`,
    run_id: run.id,
    timestamp: run.created_at
  };
}

function compactFinding(finding: PersistedFindingRecord): string {
  return `${finding.id}: ${finding.title} (${finding.severity}, confidence ${finding.confidence})`;
}

function extractFindingId(prompt: string, findings: PersistedFindingRecord[]): string | null {
  const normalized = prompt.toLowerCase();
  return findings.find((finding) => normalized.includes(finding.id.toLowerCase()))?.id
    ?? findings.find((finding) => normalized.includes(finding.title.toLowerCase()))?.id
    ?? null;
}

function topFindings(findings: PersistedFindingRecord[], limit = 3): PersistedFindingRecord[] {
  return [...findings]
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || right.confidence - left.confidence || left.title.localeCompare(right.title))
    .slice(0, limit);
}

function uniqueCitations(citations: AssistantCitation[]): AssistantCitation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.citation_type}:${citation.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function proposeExportAction(session: AssistantSessionRecord, message: string): AssistantProposedAction {
  return {
    id: `${session.id}:action:generate-export:${Date.now()}`,
    action_type: "generate_export",
    capability: "confirm_internal",
    title: "Generate executive export",
    summary: "Prepare the current run executive summary export route for download or sharing.",
    requires_confirmation: true,
    hosted_only: false,
    payload_json: {
      run_id: session.run_id,
      export_type: "executive_summary",
      route: session.run_id ? `/runs/${encodeURIComponent(session.run_id)}/report-executive?format=markdown` : null,
      requested_from: message
    }
  };
}

function auditRequestFromContext(context: AssistantContext): AuditRequest | null {
  const run = context.run;
  const target = context.target;
  const targetType = target?.target_type ?? run?.target?.target_type ?? run?.target_summary?.target_type ?? null;
  const localPath = target?.local_path ?? run?.target?.local_path ?? run?.target_summary?.local_path ?? null;
  const repoUrl = target?.repo_url ?? run?.target?.repo_url ?? run?.target_summary?.repo_url ?? null;
  const endpointUrl = target?.endpoint_url ?? run?.target?.endpoint_url ?? run?.target_summary?.endpoint_url ?? null;
  const request: AuditRequest = {
    run_mode: (run?.run_mode as AuditRequest["run_mode"]) ?? "static",
    audit_package: (run?.audit_package ?? target?.summary?.latest_audit_package ?? "baseline-static") as AuditRequest["audit_package"],
    llm_provider: "mock"
  };
  if (targetType === "repo" && repoUrl) return { ...request, repo_url: repoUrl };
  if (targetType === "endpoint" && endpointUrl) return { ...request, endpoint_url: endpointUrl };
  if (localPath) return { ...request, local_path: localPath };
  if (repoUrl) return { ...request, repo_url: repoUrl };
  if (endpointUrl) return { ...request, endpoint_url: endpointUrl };
  return null;
}

function proposeLaunchRunAction(session: AssistantSessionRecord, context: AssistantContext, prompt: string): AssistantProposedAction | null {
  const request = auditRequestFromContext(context);
  if (!request) return null;
  return {
    id: `${session.id}:action:launch-run:${Date.now()}`,
    action_type: "launch_run",
    capability: "confirm_internal",
    title: "Start a new audit run",
    summary: "Queue a new async audit run using the current target and audit defaults from the selected context.",
    requires_confirmation: true,
    hosted_only: false,
    payload_json: {
      request_json: request,
      requested_from: prompt
    }
  };
}

function proposeDispositionAction(session: AssistantSessionRecord, finding: PersistedFindingRecord, prompt: string): AssistantProposedAction {
  const normalized = prompt.toLowerCase();
  const falsePositive = normalized.includes("false positive") || normalized.includes("suppress");
  const dispositionType = falsePositive ? "suppression" : "waiver";
  return {
    id: `${session.id}:action:disposition:${finding.id}:${Date.now()}`,
    action_type: "draft_finding_disposition",
    capability: "confirm_internal",
    title: `Save ${dispositionType} draft for ${finding.id}`,
    summary: `Save a ${dispositionType} disposition for "${finding.title}" after confirmation.`,
    requires_confirmation: true,
    hosted_only: false,
    payload_json: {
      run_id: finding.run_id,
      finding_id: finding.id,
      disposition_type: dispositionType,
      scope_level: "run",
      reason: falsePositive
        ? "Assistant-drafted false-positive suppression. Reviewer should verify evidence before confirming."
        : "Assistant-drafted accepted-risk waiver. Reviewer should fill owner and review window where required.",
      notes: `Drafted from assistant prompt: ${prompt.slice(0, 500)}`,
      triage_decision: falsePositive ? "false_positive" : "accepted_risk"
    }
  };
}

function proposeReviewCommentAction(session: AssistantSessionRecord, finding: PersistedFindingRecord | null, prompt: string): AssistantProposedAction | null {
  if (!session.run_id) return null;
  return {
    id: `${session.id}:action:review-comment:${finding?.id ?? "run"}:${Date.now()}`,
    action_type: "add_review_comment",
    capability: "confirm_internal",
    title: finding ? `Add review comment for ${finding.id}` : "Add review comment",
    summary: "Save an assistant-drafted review comment to the canonical review timeline after confirmation.",
    requires_confirmation: true,
    hosted_only: false,
    payload_json: {
      run_id: session.run_id,
      finding_id: finding?.id ?? null,
      body: finding
        ? `Assistant draft for ${finding.id}: ${finding.title}. ${prompt.slice(0, 500)}`
        : `Assistant draft: ${prompt.slice(0, 700)}`,
      requested_from: prompt
    }
  };
}

function recurringFindingSummary(context: AssistantContext): { lines: string[]; citations: AssistantCitation[] } {
  const counts = new Map<string, { title: string; category: string; runIds: Set<string>; severities: Set<string>; findingIds: string[] }>();
  for (const [runId, findings] of Object.entries(context.target_history_findings)) {
    for (const finding of findings) {
      const key = `${finding.category.toLowerCase()}::${finding.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
      const current = counts.get(key) ?? { title: finding.title, category: finding.category, runIds: new Set<string>(), severities: new Set<string>(), findingIds: [] };
      current.runIds.add(runId);
      current.severities.add(finding.severity);
      current.findingIds.push(finding.id);
      counts.set(key, current);
    }
  }
  const recurring = [...counts.values()]
    .filter((item) => item.runIds.size > 1)
    .sort((left, right) => right.runIds.size - left.runIds.size || left.title.localeCompare(right.title))
    .slice(0, 5);
  return {
    lines: recurring.map((item) => `- ${item.title} (${item.category}) appeared in ${item.runIds.size} runs: ${[...item.runIds].join(", ")}.`),
    citations: [...new Set(recurring.flatMap((item) => [...item.runIds]))]
      .map((runId) => context.target_runs.find((run) => run.id === runId))
      .filter((run): run is PersistedRunListItem => Boolean(run))
      .map(runCitation)
  };
}

export class EvidenceGroundedAssistantProvider implements AssistantProvider {
  async answer(args: {
    prompt: string;
    session: AssistantSessionRecord;
    context: AssistantContext;
    capabilities: AssistantCapabilities;
    modelConfig?: AssistantModelConfig;
  }): Promise<AssistantResponse> {
    const prompt = args.prompt.trim();
    const normalized = prompt.toLowerCase();
    const run = args.context.run;
    const findings = args.context.findings;
    const citations: AssistantCitation[] = run ? [runCitation(run)] : [];
    const limitations: string[] = [];
    const proposedActions: AssistantProposedAction[] = [];

    if (!run && args.context.scope_type === "target") {
      return {
        message: "No persisted runs are available for this target yet, so I cannot answer audit-specific questions from evidence.",
        citations: [],
        confidence: "insufficient_evidence",
        proposed_actions: [],
        limitations: ["Run-level evidence is required before assistant answers can cite findings or controls."]
      };
    }

    const selectedFindingId = extractFindingId(prompt, findings);
    const selectedFinding = selectedFindingId ? findings.find((finding) => finding.id === selectedFindingId) ?? null : null;
    if (selectedFinding) citations.push(findingCitation(selectedFinding));

    let message: string;
    let confidence: AssistantConfidence = findings.length ? "high" : "medium";

    if (normalized.includes("evidence") && selectedFinding) {
      const evidenceIds = new Set((Array.isArray(selectedFinding.evidence_json) ? selectedFinding.evidence_json : []).map((item) => String(item)));
      const evidence = args.context.evidence_records.filter((record) => evidenceIds.has(record.id) || evidenceIds.has(record.source_id));
      citations.push(...evidence.map(evidenceCitation));
      message = evidence.length
        ? `Evidence for ${selectedFinding.id} is grounded in ${evidence.length} persisted record(s):\n\n${evidence.map((item) => `- ${item.summary}`).join("\n")}`
        : `The finding ${selectedFinding.id} exists, but I do not see matching normalized evidence records for its evidence references.`;
      confidence = evidence.length ? "high" : "insufficient_evidence";
      if (!evidence.length) limitations.push("The finding references could not be matched to normalized evidence records.");
    } else if (normalized.includes("false positive") || normalized.includes("likely false") || normalized.includes("fp")) {
      const evaluations = args.context.finding_evaluations?.evaluations ?? [];
      const risky = evaluations.filter((item) => item.false_positive_risk === "high" || item.evidence_sufficiency === "low").slice(0, 5);
      message = risky.length
        ? `Findings most worth false-positive review:\n\n${risky.map((item) => `- ${item.finding_id}: ${item.title} (${item.false_positive_risk} false-positive risk, ${item.evidence_sufficiency} evidence sufficiency). ${item.reasoning_summary}`).join("\n")}`
        : "I do not see findings with high false-positive risk or low evidence sufficiency in the persisted evaluation summary.";
      citations.push(...risky.flatMap((item) => findings.find((finding) => finding.id === item.finding_id) ? [findingCitation(findings.find((finding) => finding.id === item.finding_id)!)] : []));
      confidence = evaluations.length ? "medium" : "insufficient_evidence";
      if (!evaluations.length) limitations.push("No finding evaluation summary was available.");
    } else if (normalized.includes("manager") || normalized.includes("executive") || normalized.includes("summary")) {
      const top = topFindings(findings, 3);
      citations.push(...top.map(findingCitation));
      const score = args.context.score_summary?.overall_score ?? run?.overall_score ?? "n/a";
      const rating = args.context.score_summary?.rating ?? run?.rating ?? "unknown";
      message = [
        `Manager summary for ${run?.target_summary?.canonical_name ?? run?.target?.canonical_name ?? run?.target_id ?? "this target"}: the latest run is ${run?.status ?? "unknown"} with score ${score}/100 and rating ${rating}.`,
        `Findings: ${findings.length}. Human review: ${args.context.review_decision?.human_review_required ? "required" : "not required or not recorded"}. Publishability: ${args.context.review_decision?.publishability_status ?? "unknown"}.`,
        top.length ? `Top items:\n${top.map((finding) => `- ${compactFinding(finding)}`).join("\n")}` : "No persisted findings are present for this run."
      ].join("\n\n");
    } else if (normalized.includes("block") || normalized.includes("release") || normalized.includes("publish")) {
      const gating = Array.isArray(args.context.review_decision?.gating_findings_json)
        ? args.context.review_decision?.gating_findings_json.map((item) => String(item))
        : [];
      citations.push(...findings.filter((finding) => gating.includes(finding.id)).map(findingCitation));
      message = gating.length
        ? `Release/publishability is gated by ${gating.length} finding(s): ${gating.join(", ")}. Current publishability status is ${args.context.review_decision?.publishability_status ?? "unknown"}.`
        : `I do not see persisted gating findings. Current publishability status is ${args.context.review_decision?.publishability_status ?? "unknown"}.`;
      confidence = args.context.review_decision ? "high" : "insufficient_evidence";
    } else if (normalized.includes("changed") || normalized.includes("previous") || normalized.includes("compare") || normalized.includes("recurring")) {
      const history = args.context.target_runs.slice(0, 5);
      citations.push(...history.map(runCitation));
      const recurring = recurringFindingSummary(args.context);
      citations.push(...recurring.citations);
      message = history.length > 1
        ? [
          `Recent target history:\n\n${history.map((item) => `- ${item.id}: ${item.created_at}, score ${item.overall_score}/100, rating ${item.rating}, findings ${item.finding_count ?? 0}`).join("\n")}`,
          recurring.lines.length ? `Recurring findings:\n${recurring.lines.join("\n")}` : "I do not see recurring findings across the loaded target history."
        ].join("\n\n")
        : "Only one persisted run is available for this target, so I cannot compare trends yet.";
      confidence = history.length > 1 ? "medium" : "insufficient_evidence";
      if (history.length <= 1) limitations.push("At least two runs are needed for meaningful comparison.");
    } else if (normalized.includes("remediation") || normalized.includes("fix") || normalized.includes("next step")) {
      const top = selectedFinding ? [selectedFinding] : topFindings(findings, 3);
      const relatedItems = selectedFinding
        ? args.context.remediation_items.filter((item) => item.finding_id === selectedFinding.id)
        : args.context.remediation_items.slice(0, 5);
      citations.push(...top.map(findingCitation));
      message = [
        args.context.remediation_memo?.summary ?? "No persisted remediation memo is available, so I am summarizing from finding records.",
        top.length ? `Priority remediation targets:\n${top.map((finding) => `- ${finding.id}: ${finding.title}. ${finding.description}`).join("\n")}` : "No findings are available for remediation guidance.",
        relatedItems.length
          ? `Current remediation records:\n${relatedItems.map((item) => `- ${item.finding_id}: ${item.status}${item.owner_id ? `, owner ${item.owner_id}` : ""}${item.external_issue_url ? `, issue ${item.external_issue_url}` : ""}${item.validation_run_id ? `, validation ${item.validation_run_id}` : ""}`).join("\n")}`
          : "No remediation item is open in Tethermark yet. In OSS, create the local remediation item and paste any manual GitHub issue or PR links into the Remediation tab."
      ].join("\n\n");
      confidence = args.context.remediation_memo || relatedItems.length ? "high" : findings.length ? "medium" : "insufficient_evidence";
    } else {
      const top = topFindings(findings, 3);
      citations.push(...top.map(findingCitation));
      message = [
        `I can answer questions about the selected ${args.context.scope_type}, using persisted Tethermark evidence rather than unsupported inference.`,
        run ? `Current run ${run.id}: ${run.status}, score ${run.overall_score}/100, rating ${run.rating}, findings ${findings.length}.` : "No run is selected.",
        top.length ? `Highest-priority findings:\n${top.map((finding) => `- ${compactFinding(finding)}`).join("\n")}` : "No persisted findings are available."
      ].join("\n\n");
    }

    if ((normalized.includes("export") || normalized.includes("download")) && args.session.run_id) {
      proposedActions.push(proposeExportAction(args.session, prompt));
    }
    if (/\b(start|launch|run again|rerun|new run|queue)\b/i.test(prompt)) {
      const action = proposeLaunchRunAction(args.session, args.context, prompt);
      if (action) proposedActions.push(action);
      else limitations.push("I could not infer a launchable target from the selected context.");
    }
    if (/\b(comment|note|handoff)\b/i.test(prompt)) {
      const action = proposeReviewCommentAction(args.session, selectedFinding, prompt);
      if (action) proposedActions.push(action);
    }
    if ((normalized.includes("triage") || normalized.includes("false positive") || normalized.includes("suppress") || normalized.includes("accepted risk") || normalized.includes("waiver")) && selectedFinding) {
      proposedActions.push(proposeDispositionAction(args.session, selectedFinding, prompt));
    }
    if (normalized.includes("jira") || normalized.includes("slack") || normalized.includes("email") || normalized.includes("github issue")) {
      proposedActions.push({
        id: `${args.session.id}:action:external-preview:${Date.now()}`,
        action_type: "external_outbound_preview",
        capability: "draft",
        title: "Draft outbound payload",
        summary: "OSS can draft external payloads, but connector execution is reserved for hosted or manual operator action.",
        requires_confirmation: false,
        hosted_only: false,
        payload_json: { run_id: args.session.run_id, requested_from: prompt }
      });
      limitations.push("External connector execution is not available in OSS assistant mode.");
    }

    return {
      message,
      citations: uniqueCitations(citations),
      confidence,
      proposed_actions: proposedActions,
      limitations
    };
  }
}

type LlmAssistantAnswer = {
  message: string;
  confidence: AssistantConfidence;
  limitations: string[];
};

const assistantAnswerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message", "confidence", "limitations"],
  properties: {
    message: {
      type: "string",
      description: "A concise audit-assistant answer grounded only in the supplied deterministic draft and evidence context."
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low", "insufficient_evidence"]
    },
    limitations: {
      type: "array",
      items: { type: "string" }
    }
  }
} satisfies Record<string, unknown>;

function providerFromAssistantModelConfig(config?: AssistantModelConfig): ProviderConfig["provider"] | null {
  return config?.provider === "openai" || config?.provider === "openai_codex" || config?.provider === "mock"
    ? config.provider
    : null;
}

function shouldUseAssistantLlm(config?: AssistantModelConfig): boolean {
  const provider = providerFromAssistantModelConfig(config);
  if (!provider || provider === "mock") return false;
  const model = String(config?.model || "");
  return !/mock-agent-runtime/i.test(model);
}

function compactFindingForAssistant(finding: PersistedFindingRecord): Record<string, unknown> {
  return {
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    category: finding.category,
    source: finding.source,
    description: String(finding.description || "").slice(0, 700),
    evidence: Array.isArray(finding.evidence_json) ? finding.evidence_json.slice(0, 4) : []
  };
}

function compactAssistantContext(context: AssistantContext): Record<string, unknown> {
  return {
    scope_type: context.scope_type,
    scope_id: context.scope_id,
    run: context.run ? {
      id: context.run.id,
      target_id: context.run.target_id,
      status: context.run.status,
      audit_package: context.run.audit_package,
      run_mode: context.run.run_mode,
      overall_score: context.run.overall_score,
      rating: context.run.rating,
      created_at: context.run.created_at
    } : null,
    target: context.target ? {
      id: context.target.id,
      canonical_name: context.target.canonical_name,
      target_type: context.target.target_type
    } : null,
    score_summary: context.score_summary,
    review_summary: context.review_summary ? {
      workflow_status: context.review_summary.workflow?.status ?? null,
      current_reviewer_id: context.review_summary.workflow?.current_reviewer_id ?? null,
      finding_count: context.review_summary.finding_summaries?.length ?? 0
    } : null,
    top_findings: topFindings(context.findings, 8).map(compactFindingForAssistant),
    evidence_records: context.evidence_records.slice(0, 12).map((item) => ({
      id: item.id,
      source_type: item.source_type,
      source_id: item.source_id,
      summary: item.summary,
      confidence: item.confidence,
      control_ids: item.control_ids_json
    })),
    artifacts: context.artifact_index.slice(0, 12).map((item) => ({
      artifact_type: item.type,
      path: item.path,
      created_at: item.created_at
    })),
    target_runs: context.target_runs.slice(0, 8).map((run) => ({
      id: run.id,
      status: run.status,
      overall_score: run.overall_score,
      rating: run.rating,
      created_at: run.created_at
    }))
  };
}

function mergeAssistantLimitations(primary: string[], fallback: string[]): string[] {
  return [...new Set([...primary, ...fallback].map((item) => String(item || "").trim()).filter(Boolean))];
}

function friendlyAssistantLlmFallbackMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/spawn npx ENOENT|spawn codex ENOENT|not recognized|access is denied/i.test(message)) {
    return "Assistant LLM unavailable; returned deterministic evidence-grounded fallback. Configure a local Codex command or choose a direct API-backed assistant model in Settings.";
  }
  if (/requires an API key|api key/i.test(message)) {
    return "Assistant LLM unavailable; returned deterministic evidence-grounded fallback. Configure the assistant provider credential in Settings.";
  }
  return "Assistant LLM unavailable; returned deterministic evidence-grounded fallback.";
}

export class LlmBackedAssistantProvider implements AssistantProvider {
  constructor(private readonly fallback = new EvidenceGroundedAssistantProvider()) {}

  async answer(args: {
    prompt: string;
    session: AssistantSessionRecord;
    context: AssistantContext;
    capabilities: AssistantCapabilities;
    modelConfig?: AssistantModelConfig;
  }): Promise<AssistantResponse> {
    const deterministic = await this.fallback.answer(args);
    if (!shouldUseAssistantLlm(args.modelConfig)) return deterministic;

    const provider = providerFromAssistantModelConfig(args.modelConfig);
    const config: ProviderConfig = {
      provider: provider ?? "mock",
      model: args.modelConfig?.model ?? undefined
    };

    try {
      const modelProvider = createModelProvider(config, "assistant_agent");
      const result = await modelProvider.generateStructured<LlmAssistantAnswer>({
        agentName: "assistant_agent",
        schemaName: "assistant_answer",
        schema: assistantAnswerSchema,
        systemPrompt: [
          "You are Tethermark's audit assistant.",
          "Answer only from the supplied deterministic draft and persisted audit context.",
          "Do not invent evidence, finding IDs, exploitability, project-wide facts, external action results, or citations.",
          "Keep all state-changing action recommendations as suggestions only; backend confirmation cards are canonical.",
          "If evidence is missing or too narrow, say so explicitly."
        ].join("\n"),
        userPrompt: JSON.stringify({
          user_question: args.prompt,
          deterministic_draft: {
            message: deterministic.message,
            confidence: deterministic.confidence,
            limitations: deterministic.limitations,
            citations: deterministic.citations,
            proposed_actions: deterministic.proposed_actions.map((action) => ({
              action_type: action.action_type,
              title: action.title,
              summary: action.summary,
              requires_confirmation: action.requires_confirmation,
              hosted_only: action.hosted_only
            }))
          },
          context: compactAssistantContext(args.context)
        }),
        metadata: {
          context: {
            session_id: args.session.id,
            scope_type: args.session.scope_type,
            model_config: args.modelConfig
          }
        },
        temperature: 0.1,
        maxRetries: 1
      });
      return {
        ...deterministic,
        message: result.parsed.message || deterministic.message,
        confidence: result.parsed.confidence || deterministic.confidence,
        limitations: mergeAssistantLimitations(result.parsed.limitations || [], deterministic.limitations)
      };
    } catch (error) {
      return {
        ...deterministic,
        limitations: mergeAssistantLimitations(deterministic.limitations, [
          friendlyAssistantLlmFallbackMessage(error)
        ])
      };
    }
  }
}

export function deriveAssistantSessionScope(args: {
  scopeType: AssistantScopeType;
  scopeId: string;
  context: AssistantContext;
  actorId: string;
  productMode: AssistantProductMode;
}): Omit<AssistantSessionRecord, "id" | "status" | "created_at" | "updated_at"> {
  const run = args.context.run;
  return {
    scope_type: args.scopeType,
    scope_id: args.scopeId,
    workspace_id: normalizeWorkspaceId(run?.workspace_id),
    project_id: normalizeProjectId(run?.project_id),
    target_id: args.context.target?.id ?? run?.canonical_target_id ?? run?.target_id ?? null,
    run_id: run?.id ?? null,
    actor_id: args.actorId,
    product_mode: args.productMode,
    metadata_json: null
  };
}
