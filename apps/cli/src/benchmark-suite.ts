import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION, createEngine, type AuditPackageId, type AuditRequest, type AuditResult, type DatabaseMode, type RunVersionManifest, type TargetClass } from "../../../packages/core-engine/src/index.js";

export const BENCHMARK_FINDING_SUMMARY_SCHEMA_VERSION = "2026-08-19.benchmark-finding-summary.v1" as const;
export const BENCHMARK_SCORING_SUMMARY_SCHEMA_VERSION = "2026-08-19.benchmark-scoring-summary.v1" as const;
export const BENCHMARK_EVIDENCE_PLAN_SUMMARY_SCHEMA_VERSION = "2026-08-19.benchmark-evidence-plan-summary.v1" as const;

export interface BenchmarkAcceptanceThresholds {
  minimum_citation_coverage: number;
  minimum_control_traceability: number;
  maximum_false_negative_rate: number;
  maximum_false_positive_rate: number;
  maximum_duplicate_groups: number;
  maximum_conflict_pairs: number;
  maximum_score_drift: number;
  maximum_repeat_score_spread: number;
}

export interface BenchmarkReviewedExpectations {
  schema_version: "2026-08-18.review-labels.v1";
  review_status: "pending_human_review" | "human_reviewed";
  reviewed_by_role: string | null;
  reviewed_at: string | null;
  expected_controls: Array<{
    control_id: string;
    acceptable_statuses: Array<"pass" | "partial" | "fail" | "not_assessed" | "not_applicable">;
  }>;
  expected_findings: Array<{
    category: string;
    acceptable_severities: Array<"low" | "medium" | "high" | "critical">;
    minimum_count: number;
    maximum_count: number | null;
    evidence_requirement: "file_line_or_artifact";
  }>;
  expected_absent_finding_families: string[];
  acceptable_not_assessed_controls: string[];
}

export interface BenchmarkExternalGroundTruth {
  schema_version: "2026-08-18.external-advisory.v1";
  source: {
    source_type: "github_reviewed_advisory";
    source_id: string;
    url: string;
    reviewed_at: string;
    severity: "low" | "medium" | "high" | "critical";
    cwe_ids: string[];
  };
  scope: "known_finding_only";
  target_state: "vulnerable" | "fixed";
  known_finding: {
    ground_truth_id: string;
    title: string;
    category: string;
    acceptable_severities: Array<"low" | "medium" | "high" | "critical">;
    control_statuses: Array<{
      control_id: string;
      acceptable_statuses: Array<"pass" | "partial" | "fail" | "not_assessed" | "not_applicable">;
    }>;
    evidence_paths: string[];
    minimum_count: number;
    maximum_count: number;
  };
}

export interface BenchmarkSuiteManifest {
  suite_id: string;
  suite_version: string;
  title: string;
  summary: string;
  default_run_mode?: NonNullable<AuditRequest["run_mode"]>;
  default_audit_package?: AuditPackageId;
  acceptance_thresholds?: BenchmarkAcceptanceThresholds;
  cases: BenchmarkCaseManifest[];
}

export interface BenchmarkCaseManifest {
  id: string;
  target_id: string;
  target_name: string;
  repo_url?: string;
  local_path?: string;
  pinned_commit?: string;
  run_mode?: NonNullable<AuditRequest["run_mode"]>;
  audit_package?: AuditPackageId;
  tier: "smoke" | "core" | "extended" | "runtime_pending";
  enabled_by_default: boolean;
  categories: string[];
  posture?: "good" | "mixed" | "risky";
  target_family?: "ordinary" | "agentic" | "mcp" | "runnable";
  expected_target_classes: TargetClass[];
  expected_controls: string[];
  expected_finding_families: string[];
  critical_failures: string[];
  reviewed_expectations?: BenchmarkReviewedExpectations;
  external_ground_truth?: BenchmarkExternalGroundTruth;
  notes?: string[];
}

export interface BenchmarkCaseResult {
  suite_id: string;
  suite_version: string;
  case_id: string;
  target_id: string;
  target_name: string;
  repo_url: string | null;
  local_path: string | null;
  pinned_commit: string | null;
  run_mode: NonNullable<AuditRequest["run_mode"]>;
  audit_package: AuditPackageId;
  executed: boolean;
  passed: boolean;
  verdict: "pass" | "fail" | "dry_run" | "skipped";
  issues: string[];
  warnings: string[];
  drift: string[];
  run_id: string | null;
  observed_commit: string | null;
  target_class: TargetClass | null;
  finding_categories: string[];
  control_ids: string[];
  finding_count: number;
  finding_summaries: BenchmarkFindingSummary[];
  control_summaries: BenchmarkControlSummary[];
  dimension_score_summaries: BenchmarkDimensionScoreSummary[];
  evidence_plan: BenchmarkEvidencePlanSummary | null;
  evidence_count: number;
  finding_integrity_verdict: string | null;
  finding_integrity_blocking_count: number | null;
  static_score: number | null;
  citation_coverage: number | null;
  control_traceability: number | null;
  false_negative_rate: number | null;
  false_positive_rate: number | null;
  duplicate_group_count: number | null;
  conflict_pair_count: number | null;
  human_reviewed_labels: boolean;
  ground_truth_eligible: boolean;
  ground_truth_source_id: string | null;
  ground_truth_state: "vulnerable" | "fixed" | null;
  ground_truth_match_count: number | null;
  ground_truth_passed: boolean | null;
  version_manifest: RunVersionManifest | null;
}

export interface BenchmarkFindingSummary {
  finding_id: string;
  title: string;
  severity: AuditResult["findings"][number]["severity"];
  category: string;
  description_excerpt: string;
  evidence: string[];
  public_safe: boolean;
  confidence: number;
  score_impact: number;
  source: AuditResult["findings"][number]["source"];
  control_ids: string[];
  integrity: {
    evidence_support_verdict: string | null;
    control_mapping_verdict: string | null;
    qa_blocking: boolean | null;
    integrity_blocking: boolean | null;
    quality_score: number | null;
    unsupported_claims: string[];
    reasons: string[];
    next_action: string | null;
  };
}

export interface BenchmarkControlSummary {
  control_id: string;
  framework: string;
  standard_ref: string;
  title: string;
  applicability: AuditResult["control_results"][number]["applicability"];
  assessability: AuditResult["control_results"][number]["assessability"];
  status: AuditResult["control_results"][number]["status"];
  score_weight: number;
  max_score: number;
  score_awarded: number;
  score_unawarded: number;
  awarded_percentage: number | null;
  rationale: string[];
  evidence: string[];
  finding_ids: string[];
  sources: string[];
}

export interface BenchmarkDimensionScoreSummary {
  dimension: AuditResult["dimension_scores"][number]["dimension"];
  score: number;
  max_score: number;
  percentage: number;
  weight: number;
  weighted_contribution: number;
  assessed_controls: number;
  applicable_controls: number;
  control_ids: string[];
  frameworks: string[];
}

export interface BenchmarkEvidencePlanSummary {
  policy_version: typeof CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION;
  strategy: "fixed_static";
  baseline_provider_ids: string[];
  runtime_provider_ids: string[];
  control_tool_map: Array<{
    control_id: string;
    provider_ids: string[];
  }>;
  attempted_provider_ids: string[];
}

function comparableEvidencePlan(plan: BenchmarkEvidencePlanSummary | null): unknown {
  if (!plan) return null;
  return {
    policy_version: plan.policy_version,
    strategy: plan.strategy,
    baseline_provider_ids: plan.baseline_provider_ids,
    runtime_provider_ids: plan.runtime_provider_ids,
    control_tool_map: plan.control_tool_map
  };
}

export interface ExternalGroundTruthEvaluation {
  passed: boolean;
  match_count: number;
  false_negative_rate: number;
  false_positive_rate: number;
  issues: string[];
}

export interface BenchmarkRunSummary {
  suite_id: string;
  suite_version: string;
  finding_summary_schema_version: typeof BENCHMARK_FINDING_SUMMARY_SCHEMA_VERSION;
  scoring_summary_schema_version: typeof BENCHMARK_SCORING_SUMMARY_SCHEMA_VERSION;
  evidence_plan_summary_schema_version: typeof BENCHMARK_EVIDENCE_PLAN_SUMMARY_SCHEMA_VERSION;
  generated_at: string;
  executed: boolean;
  selected_cases: number;
  passed_cases: number;
  failed_cases: number;
  dry_run_cases: number;
  skipped_cases: number;
  acceptance_thresholds: BenchmarkAcceptanceThresholds | null;
  execution_configuration: {
    llm_provider: AuditRequest["llm_provider"];
    llm_model: string | null;
    llm_workload_class: AuditRequest["llm_workload_class"];
    llm_credential_class: AuditRequest["llm_credential_class"] | null;
    llm_max_requests: number | null;
    llm_max_tokens: number | null;
    audit_max_agent_calls: number | null;
    audit_max_total_tokens: number | null;
    audit_max_rerun_rounds: number | null;
  };
  results: BenchmarkCaseResult[];
}

export interface BenchmarkRunOptions {
  suitePath?: string;
  caseId?: string;
  caseIds?: string[];
  includeExtended?: boolean;
  includeRuntimePending?: boolean;
  execute?: boolean;
  strict?: boolean;
  outputDir?: string;
  persistenceRoot?: string;
  dbMode?: DatabaseMode;
  llmProvider?: AuditRequest["llm_provider"];
  llmModel?: string;
  llmWorkloadClass?: AuditRequest["llm_workload_class"];
  requestedBy?: string;
  llmCredentialClass?: AuditRequest["llm_credential_class"];
  llmMaxRequests?: number;
  llmMaxTokens?: number;
  auditMaxAgentCalls?: number;
  auditMaxTotalTokens?: number;
  auditMaxRerunRounds?: number;
}

export interface BenchmarkCompareResult {
  suite_id: string;
  suite_version: string;
  baseline_path: string;
  current_path: string;
  passed: boolean;
  comparison_allowed: boolean;
  issues: string[];
  drift: string[];
  baseline_summary: Pick<BenchmarkRunSummary, "selected_cases" | "passed_cases" | "failed_cases">;
  current_summary: Pick<BenchmarkRunSummary, "selected_cases" | "passed_cases" | "failed_cases">;
}

export interface BenchmarkVarianceCaseResult {
  case_id: string;
  comparison_kind: "repeat_run" | "cross_model";
  models: string[];
  scores: number[];
  score_spread: number | null;
  finding_counts: number[];
  finding_count_spread: number;
  finding_category_sets: string[][];
  passed: boolean;
  issues: string[];
  drift: string[];
}

export interface BenchmarkVarianceResult {
  suite_id: string;
  suite_version: string;
  report_paths: string[];
  passed: boolean;
  analysis_allowed: boolean;
  issues: string[];
  cases: BenchmarkVarianceCaseResult[];
}

const DEFAULT_SUITE_PATH = path.join(process.cwd(), "benchmarks", "suites", "ai-agent-static-v1.json");
const DEFAULT_SUITE_DIR = path.join(process.cwd(), "benchmarks", "suites");

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeCommit(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function resolveSuitePath(input?: string): string {
  if (!input) return DEFAULT_SUITE_PATH;
  const direct = path.resolve(input);
  if (input.endsWith(".json")) return direct;
  return path.resolve(process.cwd(), "benchmarks", "suites", `${input}.json`);
}

function assertRate(value: unknown, field: string, context: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${context}: ${field} must be a number from 0 to 1.`);
  }
}

function validateReviewedExpectations(item: BenchmarkCaseManifest, context: string): void {
  const labels = item.reviewed_expectations;
  if (!labels) return;
  if (labels.schema_version !== "2026-08-18.review-labels.v1") throw new Error(`${context}: unsupported review label schema.`);
  if (!Array.isArray(labels.expected_controls) || !Array.isArray(labels.expected_findings) || !Array.isArray(labels.expected_absent_finding_families) || !Array.isArray(labels.acceptable_not_assessed_controls)) {
    throw new Error(`${context}: reviewed expectations must contain control, finding, absence, and not-assessed label arrays.`);
  }
  if (labels.review_status === "human_reviewed" && (!labels.reviewed_by_role || !labels.reviewed_at)) {
    throw new Error(`${context}: human-reviewed labels require reviewed_by_role and reviewed_at.`);
  }
  for (const finding of labels.expected_findings) {
    if (!finding.category || !Number.isInteger(finding.minimum_count) || finding.minimum_count < 0 || (finding.maximum_count !== null && (!Number.isInteger(finding.maximum_count) || finding.maximum_count < finding.minimum_count))) {
      throw new Error(`${context}: invalid expected finding count range for '${finding.category || "unknown"}'.`);
    }
  }
}

function validateExternalGroundTruth(item: BenchmarkCaseManifest, context: string): void {
  const groundTruth = item.external_ground_truth;
  if (!groundTruth) return;
  if (item.reviewed_expectations) throw new Error(`${context}: reviewed_expectations and external_ground_truth are mutually exclusive.`);
  if (!item.repo_url || !item.pinned_commit || !/^[a-f0-9]{40}$/i.test(item.pinned_commit)) {
    throw new Error(`${context}: external advisory ground truth requires a public repository pinned to a full commit SHA.`);
  }
  if (groundTruth.schema_version !== "2026-08-18.external-advisory.v1" || groundTruth.scope !== "known_finding_only") {
    throw new Error(`${context}: unsupported external ground-truth schema or scope.`);
  }
  if (!groundTruth.source.source_id || groundTruth.source.source_type !== "github_reviewed_advisory" || !/^https:\/\//i.test(groundTruth.source.url) || Number.isNaN(Date.parse(groundTruth.source.reviewed_at))) {
    throw new Error(`${context}: external ground truth requires a valid reviewed advisory source.`);
  }
  const known = groundTruth.known_finding;
  if (!known.ground_truth_id || !known.category || known.acceptable_severities.length === 0 || known.control_statuses.length === 0 || known.evidence_paths.length === 0) {
    throw new Error(`${context}: external ground truth requires a finding id, category, severities, controls, and evidence paths.`);
  }
  if (!Number.isInteger(known.minimum_count) || !Number.isInteger(known.maximum_count) || known.minimum_count < 0 || known.maximum_count < known.minimum_count) {
    throw new Error(`${context}: external ground-truth finding count range is invalid.`);
  }
  if (groundTruth.target_state === "vulnerable" && known.minimum_count < 1) throw new Error(`${context}: a vulnerable target requires at least one known-finding match.`);
  if (groundTruth.target_state === "fixed" && (known.minimum_count !== 0 || known.maximum_count !== 0)) throw new Error(`${context}: a fixed target requires a zero-match known-finding range.`);
}

function validateSuiteManifest(parsed: BenchmarkSuiteManifest, suitePath: string): void {
  if (!parsed.suite_id || !parsed.suite_version || !Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error(`Invalid benchmark suite manifest: ${suitePath}`);
  }
  const ids = new Set<string>();
  for (const item of parsed.cases) {
    const context = `benchmark case '${item.id || "unknown"}'`;
    if (!item.id || ids.has(item.id)) throw new Error(`${context}: case id must be non-empty and unique.`);
    ids.add(item.id);
    if (Boolean(item.repo_url) === Boolean(item.local_path)) throw new Error(`${context}: exactly one of repo_url or local_path is required.`);
    if (item.repo_url && !item.pinned_commit) throw new Error(`${context}: public repository cases require pinned_commit.`);
    if (!Array.isArray(item.expected_target_classes) || !Array.isArray(item.expected_controls) || !Array.isArray(item.expected_finding_families)) {
      throw new Error(`${context}: expected target classes, controls, and finding families must be arrays.`);
    }
    validateReviewedExpectations(item, context);
    validateExternalGroundTruth(item, context);
  }
  const thresholds = parsed.acceptance_thresholds;
  if (thresholds) {
    assertRate(thresholds.minimum_citation_coverage, "minimum_citation_coverage", "acceptance_thresholds");
    assertRate(thresholds.minimum_control_traceability, "minimum_control_traceability", "acceptance_thresholds");
    assertRate(thresholds.maximum_false_negative_rate, "maximum_false_negative_rate", "acceptance_thresholds");
    assertRate(thresholds.maximum_false_positive_rate, "maximum_false_positive_rate", "acceptance_thresholds");
    for (const field of ["maximum_duplicate_groups", "maximum_conflict_pairs", "maximum_score_drift", "maximum_repeat_score_spread"] as const) {
      if (typeof thresholds[field] !== "number" || !Number.isFinite(thresholds[field]) || thresholds[field] < 0) throw new Error(`acceptance_thresholds: ${field} must be a non-negative number.`);
    }
  }
}

function hasEligibleGroundTruth(item: BenchmarkCaseManifest): boolean {
  return item.reviewed_expectations?.review_status === "human_reviewed" || Boolean(item.external_ground_truth);
}

export async function loadBenchmarkSuite(suitePathOrId?: string): Promise<BenchmarkSuiteManifest> {
  const suitePath = resolveSuitePath(suitePathOrId);
  const parsed = JSON.parse(await fs.readFile(suitePath, "utf8")) as BenchmarkSuiteManifest;
  validateSuiteManifest(parsed, suitePath);
  return parsed;
}

export async function listBenchmarkSuites(): Promise<BenchmarkSuiteManifest[]> {
  const entries = await fs.readdir(DEFAULT_SUITE_DIR, { withFileTypes: true });
  const suites: BenchmarkSuiteManifest[] = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json")).sort((left, right) => left.name.localeCompare(right.name))) {
    suites.push(await loadBenchmarkSuite(path.join(DEFAULT_SUITE_DIR, entry.name)));
  }
  return suites;
}

export function selectBenchmarkCases(suite: BenchmarkSuiteManifest, options?: Pick<BenchmarkRunOptions, "caseId" | "caseIds" | "includeExtended" | "includeRuntimePending">): BenchmarkCaseManifest[] {
  const requestedCaseIds = new Set([...(options?.caseIds ?? []), ...(options?.caseId ? [options.caseId] : [])].filter(Boolean));
  return suite.cases.filter((item) => {
    if (requestedCaseIds.size > 0) return requestedCaseIds.has(item.id);
    if (options?.caseId && item.id !== options.caseId) return false;
    if (options?.caseId) return true;
    if (item.tier === "runtime_pending") return Boolean(options?.includeRuntimePending);
    if (item.tier === "extended") return Boolean(options?.includeExtended);
    return item.enabled_by_default;
  });
}

function buildDryRunResult(suite: BenchmarkSuiteManifest, item: BenchmarkCaseManifest): BenchmarkCaseResult {
  const runMode = item.run_mode ?? suite.default_run_mode ?? "static";
  const auditPackage = item.audit_package ?? suite.default_audit_package ?? "agentic-static";
  return {
    suite_id: suite.suite_id,
    suite_version: suite.suite_version,
    case_id: item.id,
    target_id: item.target_id,
    target_name: item.target_name,
    repo_url: item.repo_url ?? null,
    local_path: item.local_path ? path.resolve(item.local_path) : null,
    pinned_commit: item.pinned_commit ?? null,
    run_mode: runMode,
    audit_package: auditPackage,
    executed: false,
    passed: true,
    verdict: item.tier === "runtime_pending" ? "skipped" : "dry_run",
    issues: [],
    warnings: item.tier === "runtime_pending" ? ["Runtime-pending case is excluded until runtime benchmark adapters are release-gated."] : ["Dry run only. Pass --execute to launch this benchmark case."],
    drift: [],
    run_id: null,
    observed_commit: null,
    target_class: null,
    finding_categories: [],
    control_ids: [],
    finding_count: 0,
    finding_summaries: [],
    control_summaries: [],
    dimension_score_summaries: [],
    evidence_plan: null,
    evidence_count: 0,
    finding_integrity_verdict: null,
    finding_integrity_blocking_count: null,
    static_score: null,
    citation_coverage: null,
    control_traceability: null,
    false_negative_rate: null,
    false_positive_rate: null,
    duplicate_group_count: null,
    conflict_pair_count: null,
    human_reviewed_labels: item.reviewed_expectations?.review_status === "human_reviewed",
    ground_truth_eligible: hasEligibleGroundTruth(item),
    ground_truth_source_id: item.external_ground_truth?.source.source_id ?? null,
    ground_truth_state: item.external_ground_truth?.target_state ?? null,
    ground_truth_match_count: null,
    ground_truth_passed: null,
    version_manifest: null
  };
}

function findingHasCitation(result: AuditResult, findingId: string): boolean {
  const finding = result.findings.find((item) => item.finding_id === findingId);
  if (!finding) return false;
  const evidenceById = new Map(result.evidence_records.map((item) => [item.evidence_id, item]));
  return finding.evidence.some((reference) => {
    const evidence = evidenceById.get(reference);
    if (evidence?.raw_artifact_path) return true;
    if (evidence?.locations?.some((location) => Boolean(location.uri) || Boolean(location.path && location.line))) return true;
    return /(?:^|[\\/])[^\s:]+:\d+(?::\d+)?$/i.test(reference) || /(?:artifact|report|transcript|trace):/i.test(reference);
  });
}

function normalizedFindingKey(finding: AuditResult["findings"][number]): string {
  const title = finding.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `${finding.category}|${[...finding.control_ids].sort().join(",")}|${title}`;
}

const benchmarkCredentialPatterns = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gi,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9._~+\/-]{8,}["']?/gi
];

function configuredBenchmarkSecrets(): string[] {
  return [...new Set(Object.entries(process.env)
    .filter(([key, value]) => /api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|password|secret|cookie/i.test(key)
      && typeof value === "string"
      && value.trim().length >= 8)
    .map(([, value]) => value!.trim()))];
}

function sanitizeBenchmarkReviewText(value: string, maximumLength: number): string {
  let sanitized = value;
  for (const secret of configuredBenchmarkSecrets()) sanitized = sanitized.split(secret).join("[redacted-secret]");
  for (const localPath of [os.homedir(), process.cwd()].filter((item) => item.length >= 3).sort((a, b) => b.length - a.length)) {
    sanitized = sanitized.split(localPath).join("[redacted-local-path]");
    sanitized = sanitized.split(localPath.replace(/\\/g, "/")).join("[redacted-local-path]");
  }
  for (const pattern of benchmarkCredentialPatterns) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, "[redacted-credential]");
  }
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  return sanitized.length <= maximumLength ? sanitized : `${sanitized.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`;
}

export function buildBenchmarkFindingSummaries(result: Pick<AuditResult, "findings" | "finding_quality">): BenchmarkFindingSummary[] {
  const qualityByFinding = new Map(result.finding_quality.findings.map((item) => [item.finding_id, item]));
  return result.findings.map((finding) => {
    const quality = qualityByFinding.get(finding.finding_id);
    return {
      finding_id: sanitizeBenchmarkReviewText(finding.finding_id, 160),
      title: sanitizeBenchmarkReviewText(finding.title, 240),
      severity: finding.severity,
      category: sanitizeBenchmarkReviewText(finding.category, 160),
      description_excerpt: sanitizeBenchmarkReviewText(finding.description, 800),
      evidence: finding.evidence.slice(0, 12).map((item) => sanitizeBenchmarkReviewText(item, 500)),
      public_safe: finding.public_safe,
      confidence: finding.confidence,
      score_impact: finding.score_impact,
      source: finding.source,
      control_ids: uniqueSorted(finding.control_ids).map((item) => sanitizeBenchmarkReviewText(item, 160)),
      integrity: {
        evidence_support_verdict: quality?.evidence_support_verdict ?? null,
        control_mapping_verdict: quality?.control_mapping_verdict ?? null,
        qa_blocking: quality?.qa_blocking ?? null,
        integrity_blocking: quality?.integrity_blocking ?? null,
        quality_score: quality?.quality_score ?? null,
        unsupported_claims: (quality?.unsupported_claims ?? []).slice(0, 8).map((item) => sanitizeBenchmarkReviewText(item, 500)),
        reasons: (quality?.reasons ?? []).slice(0, 8).map((item) => sanitizeBenchmarkReviewText(item, 500)),
        next_action: quality?.next_action ?? null
      }
    };
  });
}

export function buildBenchmarkScoringSummaries(result: Pick<AuditResult, "control_results" | "dimension_scores">): {
  controls: BenchmarkControlSummary[];
  dimensions: BenchmarkDimensionScoreSummary[];
} {
  const controls = result.control_results.map((control) => ({
    control_id: sanitizeBenchmarkReviewText(control.control_id, 160),
    framework: sanitizeBenchmarkReviewText(control.framework, 200),
    standard_ref: sanitizeBenchmarkReviewText(control.standard_ref, 240),
    title: sanitizeBenchmarkReviewText(control.title, 240),
    applicability: control.applicability,
    assessability: control.assessability,
    status: control.status,
    score_weight: control.score_weight,
    max_score: control.max_score,
    score_awarded: control.score_awarded,
    score_unawarded: Number(Math.max(0, control.max_score - control.score_awarded).toFixed(4)),
    awarded_percentage: control.max_score > 0 ? Number(((control.score_awarded / control.max_score) * 100).toFixed(4)) : null,
    rationale: control.rationale.slice(0, 8).map((item) => sanitizeBenchmarkReviewText(item, 500)),
    evidence: control.evidence.slice(0, 12).map((item) => sanitizeBenchmarkReviewText(item, 500)),
    finding_ids: uniqueSorted(control.finding_ids).map((item) => sanitizeBenchmarkReviewText(item, 160)),
    sources: uniqueSorted(control.sources).map((item) => sanitizeBenchmarkReviewText(item, 200))
  }));
  const dimensions = result.dimension_scores.map((dimension) => ({
    dimension: dimension.dimension,
    score: dimension.score,
    max_score: dimension.max_score,
    percentage: dimension.percentage,
    weight: dimension.weight,
    weighted_contribution: Number((dimension.percentage * dimension.weight).toFixed(4)),
    assessed_controls: dimension.assessed_controls,
    applicable_controls: dimension.applicable_controls,
    control_ids: uniqueSorted(dimension.control_ids).map((item) => sanitizeBenchmarkReviewText(item, 160)),
    frameworks: uniqueSorted(dimension.frameworks).map((item) => sanitizeBenchmarkReviewText(item, 200))
  }));
  return { controls, dimensions };
}

function normalizedEvidencePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

export function evaluateExternalGroundTruth(item: BenchmarkCaseManifest, result: Pick<AuditResult, "findings" | "control_results">): ExternalGroundTruthEvaluation | null {
  const groundTruth = item.external_ground_truth;
  if (!groundTruth) return null;
  const known = groundTruth.known_finding;
  const evidencePaths = known.evidence_paths.map(normalizedEvidencePath);
  const expectedControlIds = new Set(known.control_statuses.map((control) => control.control_id));
  const matches = result.findings.filter((finding) => {
    if (finding.category !== known.category) return false;
    if (!finding.control_ids.some((controlId) => expectedControlIds.has(controlId))) return false;
    return finding.evidence.some((reference) => {
      const normalized = normalizedEvidencePath(reference);
      return evidencePaths.some((evidencePath) => normalized.includes(evidencePath));
    });
  });
  const issues: string[] = [];
  if (matches.length < known.minimum_count || matches.length > known.maximum_count) {
    issues.push(`external ground truth ${known.ground_truth_id} matched ${matches.length} finding(s), expected ${known.minimum_count}..${known.maximum_count}`);
  }
  if (groundTruth.target_state === "vulnerable") {
    for (const finding of matches) {
      if (!known.acceptable_severities.includes(finding.severity)) {
        issues.push(`external ground truth ${known.ground_truth_id} finding ${finding.finding_id} severity ${finding.severity} was outside ${known.acceptable_severities.join("|")}`);
      }
    }
    for (const expectation of known.control_statuses) {
      const observed = result.control_results.find((control) => control.control_id === expectation.control_id);
      if (!observed) issues.push(`external ground truth ${known.ground_truth_id} control ${expectation.control_id} was not in scope`);
      else if (!expectation.acceptable_statuses.includes(observed.status)) issues.push(`external ground truth ${known.ground_truth_id} control ${expectation.control_id} status ${observed.status} was outside ${expectation.acceptable_statuses.join("|")}`);
    }
  }
  return {
    passed: issues.length === 0,
    match_count: matches.length,
    false_negative_rate: groundTruth.target_state === "vulnerable" && matches.length < known.minimum_count ? 1 : 0,
    false_positive_rate: groundTruth.target_state === "fixed" && matches.length > 0 ? 1 : 0,
    issues
  };
}

function computeQualityMetrics(item: BenchmarkCaseManifest, result: AuditResult): Pick<BenchmarkCaseResult, "citation_coverage" | "control_traceability" | "false_negative_rate" | "false_positive_rate" | "duplicate_group_count" | "conflict_pair_count"> {
  const citationCount = result.findings.filter((finding) => findingHasCitation(result, finding.finding_id)).length;
  const citationCoverage = result.findings.length === 0 ? 1 : citationCount / result.findings.length;
  const knownControls = new Set(result.control_results.map((control) => control.control_id));
  const tracedFindings = result.findings.filter((finding) => finding.control_ids.length > 0 && finding.control_ids.every((controlId) => knownControls.has(controlId))).length;
  const controlTraceability = result.findings.length === 0 ? 1 : tracedFindings / result.findings.length;
  const labels = item.reviewed_expectations;
  const externalEvaluation = evaluateExternalGroundTruth(item, result);
  const expectedCategories = labels?.expected_findings.map((finding) => finding.category) ?? item.expected_finding_families;
  const observedCategories = new Set(result.findings.map((finding) => finding.category));
  const falseNegatives = expectedCategories.filter((category) => !observedCategories.has(category)).length;
  const falseNegativeRate = externalEvaluation?.false_negative_rate ?? (expectedCategories.length === 0 ? 0 : falseNegatives / expectedCategories.length);
  const absentCategories = labels?.expected_absent_finding_families ?? [];
  const falsePositives = absentCategories.filter((category) => observedCategories.has(category)).length;
  const falsePositiveRate = externalEvaluation?.false_positive_rate ?? (absentCategories.length === 0 ? 0 : falsePositives / absentCategories.length);
  const groups = new Map<string, AuditResult["findings"]>();
  for (const finding of result.findings) groups.set(normalizedFindingKey(finding), [...(groups.get(normalizedFindingKey(finding)) ?? []), finding]);
  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  const conflictPairs = duplicateGroups.reduce((count, group) => {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        if (group[left]!.severity !== group[right]!.severity || group[left]!.public_safe !== group[right]!.public_safe) count += 1;
      }
    }
    return count;
  }, 0);
  return {
    citation_coverage: citationCoverage,
    control_traceability: controlTraceability,
    false_negative_rate: falseNegativeRate,
    false_positive_rate: falsePositiveRate,
    duplicate_group_count: duplicateGroups.length,
    conflict_pair_count: conflictPairs
  };
}

function findingHasEvidenceGaps(result: AuditResult): string[] {
  const issues: string[] = [];
  for (const finding of result.findings) {
    if (!finding.evidence.length) {
      issues.push(`finding_without_evidence:${finding.finding_id}`);
    }
  }
  return issues;
}

function unknownControlMappings(result: AuditResult): string[] {
  const knownControls = new Set(result.control_results.map((item) => item.control_id));
  const issues: string[] = [];
  for (const finding of result.findings) {
    for (const controlId of finding.control_ids) {
      if (!knownControls.has(controlId)) {
        issues.push(`unknown_control_mapping:${finding.finding_id}:${controlId}`);
      }
    }
  }
  return issues;
}

export function containsAffirmativeRuntimeClaim(title: string, description: string): boolean {
  const runtimeClaim = /\b(runtime|executed|reproduced|exploitable|rce|privilege escalation|exfiltrat)/i;
  const negatedRuntimeClaim = [
    /\b(?:does|do|did|is|are|was|were|has|have|had|can|could|would|will|may|might)\s+not\b.{0,100}\b(?:runtime|executed|reproduced|exploitable|rce|privilege escalation|exfiltrat)/i,
    /\b(?:no|never|neither|without|lacks?|insufficient|cannot|can't)\b.{0,100}\b(?:runtime|executed|reproduced|exploitable|rce|privilege escalation|exfiltrat)/i,
    /\b(?:runtime|executed|reproduced|exploitable|rce|privilege escalation|exfiltrat)\b.{0,100}\b(?:not|never|neither|unconfirmed|unproven|unsupported|unknown)\b/i
  ];
  const statements = [title, ...description.split(/(?<=[.!?;])\s+|[\r\n]+/)].map((item) => item.trim()).filter(Boolean);
  return statements.some((statement) => runtimeClaim.test(statement) && !negatedRuntimeClaim.some((pattern) => pattern.test(statement)));
}

function staticRuntimeOverclaims(result: AuditResult): string[] {
  if (result.run_plan.run_mode !== "static") return [];
  const fromFindingQuality = result.finding_quality.findings
    .flatMap((item) => item.unsupported_claims.map((claim) => `${item.finding_id}:${claim}`))
    .filter((item) => /runtime|execution|exploit|rce|privilege|exfiltrat/i.test(item));
  if (fromFindingQuality.length) return fromFindingQuality.map((item) => `static_runtime_overclaim:${item}`);

  const riskyText = result.findings.filter((finding) => containsAffirmativeRuntimeClaim(finding.title, finding.description)
    && !finding.evidence.some((evidence) => /runtime|trace|transcript|execution|sandbox/i.test(evidence)));
  return riskyText.map((finding) => `static_runtime_overclaim:${finding.finding_id}`);
}

function evaluateBenchmarkResult(suite: BenchmarkSuiteManifest, item: BenchmarkCaseManifest, result: AuditResult, strict: boolean): BenchmarkCaseResult {
  const runMode = item.run_mode ?? suite.default_run_mode ?? "static";
  const auditPackage = item.audit_package ?? suite.default_audit_package ?? "agentic-static";
  const targetClass = result.target_profile.semantic_review.final_class;
  const findingCategories = uniqueSorted(result.findings.map((finding) => finding.category));
  const controlIds = uniqueSorted(result.control_results.map((control) => control.control_id));
  const assessedControlIds = uniqueSorted(result.control_results.filter((control) => control.assessability !== "not_assessed" && control.status !== "not_assessed").map((control) => control.control_id));
  const issues: string[] = [];
  const warnings: string[] = [];
  const drift: string[] = [];
  const quality = computeQualityMetrics(item, result);
  const externalGroundTruth = evaluateExternalGroundTruth(item, result);
  const scoringSummaries = buildBenchmarkScoringSummaries(result);
  const evidencePlan: BenchmarkEvidencePlanSummary = {
    policy_version: CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION,
    strategy: "fixed_static",
    baseline_provider_ids: uniqueSorted(result.run_plan.baseline_tools),
    runtime_provider_ids: uniqueSorted(result.run_plan.runtime_tools),
    control_tool_map: [...result.run_plan.control_tool_map]
      .map((mapping) => ({ control_id: mapping.control_id, provider_ids: uniqueSorted(mapping.tools) }))
      .sort((left, right) => left.control_id.localeCompare(right.control_id)),
    attempted_provider_ids: uniqueSorted(result.evidence_executions.map((execution) => execution.provider_id))
  };
  const attemptedOrRequestedProviderIds = new Set(result.evidence_executions.flatMap((execution) => [
    execution.provider_id,
    execution.adapter?.requested_provider_id
  ].filter((providerId): providerId is string => Boolean(providerId))));

  if (!item.expected_target_classes.includes(targetClass)) {
    issues.push(`expected target class ${item.expected_target_classes.join("|")} but got ${targetClass}`);
  }

  const observedCommit = normalizeCommit(result.target.snapshot.commit_sha);
  const pinnedCommit = normalizeCommit(item.pinned_commit);
  if (pinnedCommit && observedCommit && observedCommit !== pinnedCommit) {
    issues.push(`expected pinned commit ${item.pinned_commit} but observed ${result.target.snapshot.commit_sha}`);
  } else if (pinnedCommit && !observedCommit) {
    issues.push(`expected pinned commit ${item.pinned_commit} but run did not record commit provenance`);
  }

  for (const controlId of item.expected_controls) {
    if (!controlIds.includes(controlId)) {
      issues.push(`expected control ${controlId} was not in scope`);
    } else if (!assessedControlIds.includes(controlId)) {
      warnings.push(`expected control ${controlId} was in scope but not assessed`);
    }
  }

  for (const family of item.expected_finding_families) {
    if (!findingCategories.includes(family)) {
      drift.push(`expected finding family ${family} was not produced`);
      if (strict) issues.push(`strict: expected finding family ${family} was not produced`);
    }
  }

  const reviewed = item.reviewed_expectations;
  if (reviewed?.review_status === "human_reviewed") {
    for (const expectation of reviewed.expected_controls) {
      const observed = result.control_results.find((control) => control.control_id === expectation.control_id);
      if (!observed) {
        issues.push(`reviewed expected control ${expectation.control_id} was not in scope`);
      } else if (!expectation.acceptable_statuses.includes(observed.status)) {
        issues.push(`reviewed expected control ${expectation.control_id} status ${observed.status} was outside ${expectation.acceptable_statuses.join("|")}`);
      }
    }
    for (const expectation of reviewed.expected_findings) {
      const matching = result.findings.filter((finding) => finding.category === expectation.category);
      if (matching.length < expectation.minimum_count || (expectation.maximum_count !== null && matching.length > expectation.maximum_count)) {
        issues.push(`reviewed finding ${expectation.category} count ${matching.length} was outside ${expectation.minimum_count}..${expectation.maximum_count ?? "unbounded"}`);
      }
      for (const finding of matching) {
        if (!expectation.acceptable_severities.includes(finding.severity)) issues.push(`reviewed finding ${finding.finding_id} severity ${finding.severity} was unexpected`);
        if (!findingHasCitation(result, finding.finding_id)) issues.push(`reviewed finding ${finding.finding_id} lacks a file/line or artifact citation`);
      }
    }
    for (const control of result.control_results.filter((control) => control.status === "not_assessed")) {
      if (!reviewed.acceptable_not_assessed_controls.includes(control.control_id)) warnings.push(`control ${control.control_id} was not assessed without a reviewed allowance`);
    }
  } else if (!externalGroundTruth) {
    warnings.push("Benchmark labels are not human reviewed; false-positive and false-negative metrics are provisional and this result is not baseline-eligible.");
  }

  if (externalGroundTruth) {
    issues.push(...externalGroundTruth.issues);
    warnings.push(`External ground truth is limited to known finding ${item.external_ground_truth!.known_finding.ground_truth_id}; unrelated findings are outside the advisory scope.`);
  }

  const thresholds = suite.acceptance_thresholds;
  if (thresholds) {
    if (quality.citation_coverage! < thresholds.minimum_citation_coverage) issues.push(`citation coverage ${quality.citation_coverage!.toFixed(3)} is below ${thresholds.minimum_citation_coverage.toFixed(3)}`);
    if (quality.control_traceability! < thresholds.minimum_control_traceability) issues.push(`control traceability ${quality.control_traceability!.toFixed(3)} is below ${thresholds.minimum_control_traceability.toFixed(3)}`);
    if (hasEligibleGroundTruth(item) && quality.false_negative_rate! > thresholds.maximum_false_negative_rate) issues.push(`false-negative rate ${quality.false_negative_rate!.toFixed(3)} exceeds ${thresholds.maximum_false_negative_rate.toFixed(3)}`);
    if (hasEligibleGroundTruth(item) && quality.false_positive_rate! > thresholds.maximum_false_positive_rate) issues.push(`false-positive rate ${quality.false_positive_rate!.toFixed(3)} exceeds ${thresholds.maximum_false_positive_rate.toFixed(3)}`);
    if (quality.duplicate_group_count! > thresholds.maximum_duplicate_groups) issues.push(`duplicate group count ${quality.duplicate_group_count} exceeds ${thresholds.maximum_duplicate_groups}`);
    if (quality.conflict_pair_count! > thresholds.maximum_conflict_pairs) issues.push(`conflict pair count ${quality.conflict_pair_count} exceeds ${thresholds.maximum_conflict_pairs}`);
  }

  issues.push(...findingHasEvidenceGaps(result));
  issues.push(...unknownControlMappings(result));
  issues.push(...staticRuntimeOverclaims(result));
  for (const providerId of [...evidencePlan.baseline_provider_ids, ...evidencePlan.runtime_provider_ids]) {
    if (!attemptedOrRequestedProviderIds.has(providerId)) {
      issues.push(`fixed evidence plan provider ${providerId} was not attempted`);
    }
  }

  if (result.finding_quality.overall_verdict === "fail") {
    issues.push(`post-supervisor integrity verdict is fail with ${result.finding_quality.blocking_count} blocker(s)`);
  } else if (result.finding_quality.overall_verdict === "needs_review") {
    warnings.push(`post-supervisor integrity verdict is needs_review with ${result.finding_quality.blocking_count} blocker(s)`);
  }

  for (const execution of result.evidence_executions) {
    if (execution.status === "failed" || execution.status === "skipped") {
      warnings.push(`evidence provider ${execution.provider_id} ${execution.status}`);
    }
  }

  return {
    suite_id: suite.suite_id,
    suite_version: suite.suite_version,
    case_id: item.id,
    target_id: item.target_id,
    target_name: item.target_name,
    repo_url: item.repo_url ?? null,
    local_path: item.local_path ? path.resolve(item.local_path) : null,
    pinned_commit: item.pinned_commit ?? null,
    run_mode: runMode,
    audit_package: auditPackage,
    executed: true,
    passed: issues.length === 0,
    verdict: issues.length === 0 ? "pass" : "fail",
    issues,
    warnings,
    drift,
    run_id: result.run_id,
    observed_commit: result.target.snapshot.commit_sha,
    target_class: targetClass,
    finding_categories: findingCategories,
    control_ids: controlIds,
    finding_count: result.findings.length,
    finding_summaries: buildBenchmarkFindingSummaries(result),
    control_summaries: scoringSummaries.controls,
    dimension_score_summaries: scoringSummaries.dimensions,
    evidence_plan: evidencePlan,
    evidence_count: result.evidence_records.length,
    finding_integrity_verdict: result.finding_quality.overall_verdict,
    finding_integrity_blocking_count: result.finding_quality.blocking_count,
    static_score: result.static_score,
    ...quality,
    human_reviewed_labels: reviewed?.review_status === "human_reviewed",
    ground_truth_eligible: hasEligibleGroundTruth(item),
    ground_truth_source_id: item.external_ground_truth?.source.source_id ?? null,
    ground_truth_state: item.external_ground_truth?.target_state ?? null,
    ground_truth_match_count: externalGroundTruth?.match_count ?? null,
    ground_truth_passed: externalGroundTruth?.passed ?? null,
    version_manifest: result.version_manifest ?? null
  };
}

async function ensureOutputDir(outputDir?: string): Promise<string> {
  const resolved = path.resolve(outputDir ?? path.join(process.cwd(), ".artifacts", "benchmarks"));
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}

function reportFileName(suite: BenchmarkSuiteManifest): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${suite.suite_id}.${suite.suite_version}.${stamp}.json`;
}

export async function runBenchmarkSuite(options?: BenchmarkRunOptions): Promise<BenchmarkRunSummary & { report_path?: string }> {
  const suite = await loadBenchmarkSuite(options?.suitePath);
  const selected = selectBenchmarkCases(suite, options);
  const results: BenchmarkCaseResult[] = [];
  const executed = Boolean(options?.execute);
  const workloadClass = options?.llmWorkloadClass ?? "interactive_operator";
  const requestedBy = options?.requestedBy?.trim();
  if (executed && workloadClass === "interactive_operator" && !requestedBy) {
    throw new Error("benchmark_operator_required");
  }
  const dbMode = options?.dbMode ?? "local";
  const envVar = "HARNESS_LOCAL_DB_ROOT";
  const previousRoot = process.env[envVar];
  const persistenceRoot = options?.persistenceRoot ? path.resolve(options.persistenceRoot) : await fs.mkdtemp(path.join(os.tmpdir(), `tethermark-benchmark-${dbMode}-`));

  if (selected.length === 0) {
    throw new Error("No benchmark cases selected.");
  }

  if (!executed) {
    for (const item of selected) results.push(buildDryRunResult(suite, item));
  } else {
    process.env[envVar] = persistenceRoot;
    const engine = createEngine();
    try {
      for (const item of selected) {
        if (item.tier === "runtime_pending" && !options?.includeRuntimePending) {
          results.push(buildDryRunResult(suite, item));
          continue;
        }

        const runMode = item.run_mode ?? suite.default_run_mode ?? "static";
        const auditPackage = item.audit_package ?? suite.default_audit_package ?? "agentic-static";
        const llmProvider = options?.llmProvider ?? "mock";
        const request: AuditRequest = {
          repo_url: item.repo_url,
          local_path: item.local_path ? path.resolve(item.local_path) : undefined,
          run_mode: runMode,
          audit_package: auditPackage,
          db_mode: dbMode,
          llm_provider: llmProvider,
          llm_model: options?.llmModel ?? (llmProvider === "mock" ? "mock-agent-runtime" : undefined),
          llm_workload_class: workloadClass,
          requested_by: requestedBy,
          llm_credential_class: options?.llmCredentialClass,
          llm_max_requests: options?.llmMaxRequests,
          llm_max_tokens: options?.llmMaxTokens,
          hints: {
            disable_stage_reuse: true,
            ...((options?.auditMaxAgentCalls || options?.auditMaxTotalTokens || options?.auditMaxRerunRounds) ? {
              audit_package_overrides: {
                max_agent_calls: options.auditMaxAgentCalls,
                max_total_tokens: options.auditMaxTotalTokens,
                max_rerun_rounds: options.auditMaxRerunRounds
              }
            } : {}),
            ...(item.pinned_commit ? { repo_checkout_ref: item.pinned_commit } : {}),
            benchmark: {
              suite_id: suite.suite_id,
              suite_version: suite.suite_version,
              case_id: item.id,
              target_id: item.target_id,
              evidence_plan_policy_version: CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION,
              categories: item.categories,
              expected_controls: item.expected_controls,
              expected_finding_families: item.expected_finding_families
            }
          }
        };
        const auditResult = await engine.run(request);
        results.push(evaluateBenchmarkResult(suite, item, auditResult, Boolean(options?.strict)));
      }
    } finally {
      if (previousRoot === undefined) delete process.env[envVar];
      else process.env[envVar] = previousRoot;

      if (!options?.persistenceRoot) {
        await fs.rm(persistenceRoot, { recursive: true, force: true });
      }
    }
  }

  const summary: BenchmarkRunSummary & { report_path?: string } = {
    suite_id: suite.suite_id,
    suite_version: suite.suite_version,
    finding_summary_schema_version: BENCHMARK_FINDING_SUMMARY_SCHEMA_VERSION,
    scoring_summary_schema_version: BENCHMARK_SCORING_SUMMARY_SCHEMA_VERSION,
    evidence_plan_summary_schema_version: BENCHMARK_EVIDENCE_PLAN_SUMMARY_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    executed,
    selected_cases: results.length,
    passed_cases: results.filter((item) => item.verdict === "pass").length,
    failed_cases: results.filter((item) => item.verdict === "fail").length,
    dry_run_cases: results.filter((item) => item.verdict === "dry_run").length,
    skipped_cases: results.filter((item) => item.verdict === "skipped").length,
    acceptance_thresholds: suite.acceptance_thresholds ?? null,
    execution_configuration: {
      llm_provider: options?.llmProvider ?? "mock",
      llm_model: options?.llmModel ?? ((options?.llmProvider ?? "mock") === "mock" ? "mock-agent-runtime" : null),
      llm_workload_class: options?.llmWorkloadClass ?? "interactive_operator",
      llm_credential_class: options?.llmCredentialClass ?? null,
      llm_max_requests: options?.llmMaxRequests ?? null,
      llm_max_tokens: options?.llmMaxTokens ?? null,
      audit_max_agent_calls: options?.auditMaxAgentCalls ?? null,
      audit_max_total_tokens: options?.auditMaxTotalTokens ?? null,
      audit_max_rerun_rounds: options?.auditMaxRerunRounds ?? null
    },
    results
  };

  const outputDir = await ensureOutputDir(options?.outputDir);
  const reportPath = path.join(outputDir, reportFileName(suite));
  await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  summary.report_path = reportPath;
  return summary;
}

export async function compareBenchmarkReports(args: { baselinePath: string; currentPath: string }): Promise<BenchmarkCompareResult> {
  const baseline = JSON.parse(await fs.readFile(path.resolve(args.baselinePath), "utf8")) as BenchmarkRunSummary;
  const current = JSON.parse(await fs.readFile(path.resolve(args.currentPath), "utf8")) as BenchmarkRunSummary;
  const issues: string[] = [];
  const drift: string[] = [];
  let comparisonAllowed = true;
  const blockComparison = (message: string): void => {
    comparisonAllowed = false;
    issues.push(message);
  };

  if (!baseline.executed || !current.executed) blockComparison("Only executed benchmark reports are eligible for comparison; dry-run reports have no audit evidence.");
  if (baseline.suite_id !== current.suite_id) blockComparison(`suite mismatch: baseline=${baseline.suite_id} current=${current.suite_id}`);
  if (baseline.suite_version !== current.suite_version) blockComparison(`suite version mismatch: baseline=${baseline.suite_version} current=${current.suite_version}`);
  if (JSON.stringify(baseline.acceptance_thresholds ?? null) !== JSON.stringify(current.acceptance_thresholds ?? null)) blockComparison("acceptance threshold mismatch between reports");
  if (JSON.stringify(baseline.execution_configuration ?? null) !== JSON.stringify(current.execution_configuration ?? null)) blockComparison("execution configuration mismatch between reports");

  const baselineByCase = new Map(baseline.results.map((item) => [item.case_id, item]));
  const currentByCase = new Map(current.results.map((item) => [item.case_id, item]));
  for (const [caseId, baselineCase] of baselineByCase) {
    const currentCase = currentByCase.get(caseId);
    if (!currentCase) {
      issues.push(`case ${caseId} missing from current report`);
      continue;
    }
    if (!(baselineCase.ground_truth_eligible || baselineCase.human_reviewed_labels) || !(currentCase.ground_truth_eligible || currentCase.human_reviewed_labels)) {
      blockComparison(`case ${caseId} is not comparison-eligible because it lacks reviewed or externally sourced ground truth`);
    }
    if (baselineCase.ground_truth_source_id !== currentCase.ground_truth_source_id || baselineCase.ground_truth_state !== currentCase.ground_truth_state) blockComparison(`case ${caseId} ground-truth source/state mismatch`);
    if (baselineCase.run_mode !== currentCase.run_mode) blockComparison(`case ${caseId} run mode mismatch: baseline=${baselineCase.run_mode} current=${currentCase.run_mode}`);
    if (baselineCase.audit_package !== currentCase.audit_package) blockComparison(`case ${caseId} audit package mismatch: baseline=${baselineCase.audit_package} current=${currentCase.audit_package}`);
    if (normalizeCommit(baselineCase.pinned_commit) !== normalizeCommit(currentCase.pinned_commit)) blockComparison(`case ${caseId} pinned commit mismatch`);
    if (!baselineCase.evidence_plan || !currentCase.evidence_plan) {
      blockComparison(`case ${caseId} is missing a benchmark evidence-plan summary`);
    } else if (JSON.stringify(comparableEvidencePlan(baselineCase.evidence_plan)) !== JSON.stringify(comparableEvidencePlan(currentCase.evidence_plan))) {
      blockComparison(`case ${caseId} evidence plan mismatch`);
    }
    const baselineVersions = baselineCase.version_manifest;
    const currentVersions = currentCase.version_manifest;
    if (!baselineVersions || !currentVersions) {
      blockComparison(`case ${caseId} is missing a run version manifest`);
    } else {
      for (const field of ["methodology_version", "static_baseline_version", "control_catalog_version", "policy_version", "audit_package_catalog_version", "audit_package_id", "prompt_set_version"] as const) {
        if (baselineVersions[field] !== currentVersions[field]) blockComparison(`case ${caseId} ${field} mismatch: baseline=${baselineVersions[field]} current=${currentVersions[field]}`);
      }
      if (JSON.stringify(baselineVersions.tool_versions) !== JSON.stringify(currentVersions.tool_versions)) blockComparison(`case ${caseId} tool version/capability mismatch`);
      if (JSON.stringify(baselineVersions.model_identities) !== JSON.stringify(currentVersions.model_identities)) blockComparison(`case ${caseId} model identity mismatch`);
    }
    if (baselineCase.verdict === "pass" && currentCase.verdict === "fail") {
      issues.push(`case ${caseId} regressed from pass to fail`);
    }
    const missingControls = baselineCase.control_ids.filter((controlId) => !currentCase.control_ids.includes(controlId));
    if (missingControls.length) drift.push(`case ${caseId} missing previously observed controls: ${missingControls.join(",")}`);
    const missingFamilies = baselineCase.finding_categories.filter((category) => !currentCase.finding_categories.includes(category));
    if (missingFamilies.length) drift.push(`case ${caseId} missing previously observed finding families: ${missingFamilies.join(",")}`);
    const maximumScoreDrift = current.acceptance_thresholds?.maximum_score_drift;
    if (maximumScoreDrift !== undefined && baselineCase.static_score !== null && currentCase.static_score !== null) {
      const scoreDrift = Math.abs(currentCase.static_score - baselineCase.static_score);
      if (scoreDrift > maximumScoreDrift) issues.push(`case ${caseId} score drift ${scoreDrift.toFixed(2)} exceeds ${maximumScoreDrift.toFixed(2)}`);
      const maximumRepeatSpread = current.acceptance_thresholds?.maximum_repeat_score_spread;
      if (maximumRepeatSpread !== undefined && baselineVersions && currentVersions
        && JSON.stringify(baselineVersions) === JSON.stringify(currentVersions)
        && scoreDrift > maximumRepeatSpread) {
        issues.push(`case ${caseId} repeat-run score spread ${scoreDrift.toFixed(2)} exceeds ${maximumRepeatSpread.toFixed(2)}`);
      }
    }
  }

  for (const caseId of currentByCase.keys()) {
    if (!baselineByCase.has(caseId)) drift.push(`case ${caseId} is new in current report`);
  }

  return {
    suite_id: current.suite_id,
    suite_version: current.suite_version,
    baseline_path: path.resolve(args.baselinePath),
    current_path: path.resolve(args.currentPath),
    passed: issues.length === 0,
    comparison_allowed: comparisonAllowed,
    issues,
    drift,
    baseline_summary: {
      selected_cases: baseline.selected_cases,
      passed_cases: baseline.passed_cases,
      failed_cases: baseline.failed_cases
    },
    current_summary: {
      selected_cases: current.selected_cases,
      passed_cases: current.passed_cases,
      failed_cases: current.failed_cases
    }
  };
}

export function formatBenchmarkCaseLine(item: BenchmarkCaseManifest): string {
  const target = item.repo_url ? `${item.repo_url}@${item.pinned_commit!.slice(0, 12)}` : path.resolve(item.local_path!);
  return `${item.id}: tier=${item.tier} default=${item.enabled_by_default ? "yes" : "no"} mode=${item.run_mode ?? "suite-default"} package=${item.audit_package ?? "suite-default"} target=${target} categories=${item.categories.join(",")}`;
}

function modelIdentityLabel(item: BenchmarkCaseResult): string {
  const identities = item.version_manifest?.model_identities ?? [];
  return identities
    .map((identity) => `${identity.provider}:${identity.model}:${identity.credential_class}`)
    .sort((left, right) => left.localeCompare(right))
    .join(",") || "unknown";
}

export async function analyzeBenchmarkVariance(args: { reportPaths: string[] }): Promise<BenchmarkVarianceResult> {
  if (args.reportPaths.length < 2) throw new Error("Variance analysis requires at least two executed benchmark reports.");
  const reportPaths = args.reportPaths.map((item) => path.resolve(item));
  const reports = await Promise.all(reportPaths.map(async (reportPath) => JSON.parse(await fs.readFile(reportPath, "utf8")) as BenchmarkRunSummary));
  const reference = reports[0]!;
  const issues: string[] = [];
  let analysisAllowed = true;
  const blockAnalysis = (message: string): void => {
    analysisAllowed = false;
    issues.push(message);
  };

  for (const [index, report] of reports.entries()) {
    const label = `report ${index + 1}`;
    if (!report.executed) blockAnalysis(`${label} is a dry run and has no audit evidence`);
    if (report.suite_id !== reference.suite_id) blockAnalysis(`${label} suite mismatch: ${report.suite_id}`);
    if (report.suite_version !== reference.suite_version) blockAnalysis(`${label} suite version mismatch: ${report.suite_version}`);
    if (JSON.stringify(report.acceptance_thresholds ?? null) !== JSON.stringify(reference.acceptance_thresholds ?? null)) blockAnalysis(`${label} acceptance threshold mismatch`);
    const comparableReferenceConfig = { ...(reference.execution_configuration ?? {}) } as any;
    const comparableReportConfig = { ...(report.execution_configuration ?? {}) } as any;
    delete comparableReferenceConfig.llm_model;
    delete comparableReportConfig.llm_model;
    if (JSON.stringify(comparableReportConfig) !== JSON.stringify(comparableReferenceConfig)) blockAnalysis(`${label} execution configuration mismatch`);
  }

  const referenceCaseIds = reference.results.map((item) => item.case_id).sort((left, right) => left.localeCompare(right));
  const caseResults: BenchmarkVarianceCaseResult[] = [];
  for (const report of reports.slice(1)) {
    const caseIds = report.results.map((item) => item.case_id).sort((left, right) => left.localeCompare(right));
    if (JSON.stringify(caseIds) !== JSON.stringify(referenceCaseIds)) blockAnalysis("reports do not contain the same case set");
  }

  for (const caseId of referenceCaseIds) {
    const variants = reports.map((report) => report.results.find((item) => item.case_id === caseId)).filter((item): item is BenchmarkCaseResult => Boolean(item));
    const caseIssues: string[] = [];
    const caseDrift: string[] = [];
    const referenceCase = variants[0]!;
    for (const [index, variant] of variants.entries()) {
      if (!variant.executed) blockAnalysis(`case ${caseId} in report ${index + 1} was not executed`);
      if (!(variant.ground_truth_eligible || variant.human_reviewed_labels)) blockAnalysis(`case ${caseId} lacks reviewed or externally sourced ground truth`);
      if (variant.ground_truth_source_id !== referenceCase.ground_truth_source_id || variant.ground_truth_state !== referenceCase.ground_truth_state) blockAnalysis(`case ${caseId} ground-truth source/state mismatch`);
      if (variant.run_mode !== referenceCase.run_mode || variant.audit_package !== referenceCase.audit_package || normalizeCommit(variant.pinned_commit) !== normalizeCommit(referenceCase.pinned_commit)) blockAnalysis(`case ${caseId} target or audit configuration mismatch`);
      if (!variant.evidence_plan || !referenceCase.evidence_plan) {
        blockAnalysis(`case ${caseId} is missing a benchmark evidence-plan summary`);
      } else if (JSON.stringify(comparableEvidencePlan(variant.evidence_plan)) !== JSON.stringify(comparableEvidencePlan(referenceCase.evidence_plan))) {
        blockAnalysis(`case ${caseId} evidence plan mismatch`);
      }
      if (!variant.version_manifest || !referenceCase.version_manifest) {
        blockAnalysis(`case ${caseId} is missing a run version manifest`);
      } else {
        for (const field of ["methodology_version", "static_baseline_version", "control_catalog_version", "policy_version", "audit_package_catalog_version", "audit_package_id", "prompt_set_version"] as const) {
          if (variant.version_manifest[field] !== referenceCase.version_manifest[field]) blockAnalysis(`case ${caseId} ${field} mismatch`);
        }
        if (JSON.stringify(variant.version_manifest.tool_versions) !== JSON.stringify(referenceCase.version_manifest.tool_versions)) blockAnalysis(`case ${caseId} tool version/capability mismatch`);
      }
      if (variant.verdict !== "pass") caseIssues.push(`report ${index + 1} benchmark verdict is ${variant.verdict}`);
      if (variant.ground_truth_passed === false) caseIssues.push(`report ${index + 1} failed external ground truth`);
    }
    const models = variants.map(modelIdentityLabel);
    const comparisonKind = new Set(models).size === 1 ? "repeat_run" : "cross_model";
    const scores = variants.map((item) => item.static_score).filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    const scoreSpread = scores.length === variants.length ? Math.max(...scores) - Math.min(...scores) : null;
    if (scoreSpread === null) caseIssues.push("one or more reports lack a static score");
    const maximumDrift = comparisonKind === "repeat_run"
      ? reference.acceptance_thresholds?.maximum_repeat_score_spread
      : reference.acceptance_thresholds?.maximum_score_drift;
    if (scoreSpread !== null && maximumDrift !== undefined && scoreSpread > maximumDrift) {
      caseIssues.push(`${comparisonKind === "repeat_run" ? "repeat-run" : "cross-model"} score spread ${scoreSpread.toFixed(2)} exceeds ${maximumDrift.toFixed(2)}`);
    }
    const findingCounts = variants.map((item) => item.finding_count);
    const findingCountSpread = Math.max(...findingCounts) - Math.min(...findingCounts);
    if (findingCountSpread > 0) caseDrift.push(`finding count spread is ${findingCountSpread} across counts ${findingCounts.join(",")}`);
    const findingCategorySets = variants.map((item) => uniqueSorted(item.finding_categories));
    if (new Set(findingCategorySets.map((item) => JSON.stringify(item))).size > 1) {
      caseDrift.push(`finding categories differ: ${findingCategorySets.map((item) => item.join(",") || "none").join(" | ")}`);
    }
    const attemptedProviderSets = variants.map((item) => uniqueSorted(item.evidence_plan?.attempted_provider_ids ?? []));
    if (new Set(attemptedProviderSets.map((item) => JSON.stringify(item))).size > 1) {
      caseDrift.push(`attempted evidence providers differ: ${attemptedProviderSets.map((item) => item.join(",") || "none").join(" | ")}`);
    }
    caseResults.push({
      case_id: caseId,
      comparison_kind: comparisonKind,
      models,
      scores,
      score_spread: scoreSpread,
      finding_counts: findingCounts,
      finding_count_spread: findingCountSpread,
      finding_category_sets: findingCategorySets,
      passed: caseIssues.length === 0,
      issues: caseIssues,
      drift: caseDrift
    });
  }

  return {
    suite_id: reference.suite_id,
    suite_version: reference.suite_version,
    report_paths: reportPaths,
    passed: analysisAllowed && issues.length === 0 && caseResults.every((item) => item.passed),
    analysis_allowed: analysisAllowed,
    issues,
    cases: caseResults
  };
}

export function printBenchmarkSummary(summary: BenchmarkRunSummary & { report_path?: string }): void {
  console.log(`Suite: ${summary.suite_id}@${summary.suite_version}`);
  console.log(`Executed: ${summary.executed ? "yes" : "no"}`);
  console.log(`Cases: ${summary.selected_cases}, passed=${summary.passed_cases}, failed=${summary.failed_cases}, dry_run=${summary.dry_run_cases}, skipped=${summary.skipped_cases}`);
  for (const result of summary.results) {
    console.log(`- ${result.case_id}: ${result.verdict}${result.run_id ? ` run=${result.run_id}` : ""}${result.target_class ? ` class=${result.target_class}` : ""} findings=${result.finding_count} controls=${result.control_ids.length}`);
    for (const issue of result.issues) console.log(`  issue: ${issue}`);
    for (const warning of result.warnings.slice(0, 5)) console.log(`  warning: ${warning}`);
    for (const item of result.drift.slice(0, 5)) console.log(`  drift: ${item}`);
  }
  if (summary.report_path) console.log(`Report: ${summary.report_path}`);
}

export function printBenchmarkCompare(result: BenchmarkCompareResult): void {
  console.log(`Suite: ${result.suite_id}@${result.suite_version}`);
  console.log(`Baseline: ${result.baseline_path}`);
  console.log(`Current: ${result.current_path}`);
  console.log(`Verdict: ${result.passed ? "pass" : "fail"}`);
  console.log(`Baseline cases: ${result.baseline_summary.selected_cases}, passed=${result.baseline_summary.passed_cases}, failed=${result.baseline_summary.failed_cases}`);
  console.log(`Current cases: ${result.current_summary.selected_cases}, passed=${result.current_summary.passed_cases}, failed=${result.current_summary.failed_cases}`);
  for (const issue of result.issues) console.log(`issue: ${issue}`);
  for (const item of result.drift) console.log(`drift: ${item}`);
}

export function printBenchmarkVariance(result: BenchmarkVarianceResult): void {
  console.log(`Suite: ${result.suite_id}@${result.suite_version}`);
  console.log(`Reports: ${result.report_paths.length}`);
  console.log(`Analysis allowed: ${result.analysis_allowed ? "yes" : "no"}`);
  console.log(`Verdict: ${result.passed ? "pass" : "fail"}`);
  for (const item of result.cases) {
    console.log(`- ${item.case_id}: ${item.passed ? "pass" : "fail"} kind=${item.comparison_kind} score_spread=${item.score_spread ?? "unknown"} scores=${item.scores.join(",")} finding_spread=${item.finding_count_spread} findings=${item.finding_counts.join(",")} models=${item.models.join(" | ")}`);
    for (const issue of item.issues) console.log(`  issue: ${issue}`);
    for (const drift of item.drift) console.log(`  drift: ${drift}`);
  }
  for (const issue of result.issues) console.log(`issue: ${issue}`);
}

export { DEFAULT_SUITE_PATH };
