import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createEngine, type AuditPackageId, type AuditRequest, type AuditResult, type DatabaseMode, type TargetClass } from "../../../packages/core-engine/src/index.js";

export interface BenchmarkSuiteManifest {
  suite_id: string;
  suite_version: string;
  title: string;
  summary: string;
  default_run_mode?: NonNullable<AuditRequest["run_mode"]>;
  default_audit_package?: AuditPackageId;
  cases: BenchmarkCaseManifest[];
}

export interface BenchmarkCaseManifest {
  id: string;
  target_id: string;
  target_name: string;
  repo_url: string;
  pinned_commit: string;
  run_mode?: NonNullable<AuditRequest["run_mode"]>;
  audit_package?: AuditPackageId;
  tier: "smoke" | "core" | "extended" | "runtime_pending";
  enabled_by_default: boolean;
  categories: string[];
  expected_target_classes: TargetClass[];
  expected_controls: string[];
  expected_finding_families: string[];
  critical_failures: string[];
  notes?: string[];
}

export interface BenchmarkCaseResult {
  suite_id: string;
  suite_version: string;
  case_id: string;
  target_id: string;
  target_name: string;
  repo_url: string;
  pinned_commit: string;
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
  evidence_count: number;
  finding_integrity_verdict: string | null;
  finding_integrity_blocking_count: number | null;
}

export interface BenchmarkRunSummary {
  suite_id: string;
  suite_version: string;
  generated_at: string;
  executed: boolean;
  selected_cases: number;
  passed_cases: number;
  failed_cases: number;
  dry_run_cases: number;
  skipped_cases: number;
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
}

export interface BenchmarkCompareResult {
  suite_id: string;
  suite_version: string;
  baseline_path: string;
  current_path: string;
  passed: boolean;
  issues: string[];
  drift: string[];
  baseline_summary: Pick<BenchmarkRunSummary, "selected_cases" | "passed_cases" | "failed_cases">;
  current_summary: Pick<BenchmarkRunSummary, "selected_cases" | "passed_cases" | "failed_cases">;
}

const DEFAULT_SUITE_PATH = path.join(process.cwd(), "benchmarks", "suites", "ai-agent-static-v1.json");

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

export async function loadBenchmarkSuite(suitePathOrId?: string): Promise<BenchmarkSuiteManifest> {
  const suitePath = resolveSuitePath(suitePathOrId);
  const parsed = JSON.parse(await fs.readFile(suitePath, "utf8")) as BenchmarkSuiteManifest;
  if (!parsed.suite_id || !Array.isArray(parsed.cases)) {
    throw new Error(`Invalid benchmark suite manifest: ${suitePath}`);
  }
  return parsed;
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
    repo_url: item.repo_url,
    pinned_commit: item.pinned_commit,
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
    evidence_count: 0,
    finding_integrity_verdict: null,
    finding_integrity_blocking_count: null
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

function staticRuntimeOverclaims(result: AuditResult): string[] {
  if (result.run_plan.run_mode !== "static") return [];
  const fromFindingQuality = result.finding_quality.findings
    .flatMap((item) => item.unsupported_claims.map((claim) => `${item.finding_id}:${claim}`))
    .filter((item) => /runtime|execution|exploit|rce|privilege|exfiltrat/i.test(item));
  if (fromFindingQuality.length) return fromFindingQuality.map((item) => `static_runtime_overclaim:${item}`);

  const riskyText = result.findings.filter((finding) => {
    const text = `${finding.title} ${finding.description}`.toLowerCase();
    return /\b(runtime|executed|reproduced|exploitable|rce|privilege escalation|exfiltrat)/i.test(text)
      && !finding.evidence.some((evidence) => /runtime|trace|transcript|execution|sandbox/i.test(evidence));
  });
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

  issues.push(...findingHasEvidenceGaps(result));
  issues.push(...unknownControlMappings(result));
  issues.push(...staticRuntimeOverclaims(result));

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
    repo_url: item.repo_url,
    pinned_commit: item.pinned_commit,
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
    evidence_count: result.evidence_records.length,
    finding_integrity_verdict: result.finding_quality.overall_verdict,
    finding_integrity_blocking_count: result.finding_quality.blocking_count
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
        const request: AuditRequest = {
          repo_url: item.repo_url,
          run_mode: runMode,
          audit_package: auditPackage,
          db_mode: dbMode,
          llm_provider: options?.llmProvider ?? "mock",
          llm_model: options?.llmModel,
          hints: {
            repo_checkout_ref: item.pinned_commit,
            benchmark: {
              suite_id: suite.suite_id,
              suite_version: suite.suite_version,
              case_id: item.id,
              target_id: item.target_id,
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
    generated_at: new Date().toISOString(),
    executed,
    selected_cases: results.length,
    passed_cases: results.filter((item) => item.verdict === "pass").length,
    failed_cases: results.filter((item) => item.verdict === "fail").length,
    dry_run_cases: results.filter((item) => item.verdict === "dry_run").length,
    skipped_cases: results.filter((item) => item.verdict === "skipped").length,
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

  if (baseline.suite_id !== current.suite_id) issues.push(`suite mismatch: baseline=${baseline.suite_id} current=${current.suite_id}`);
  if (baseline.suite_version !== current.suite_version) drift.push(`suite version changed: baseline=${baseline.suite_version} current=${current.suite_version}`);

  const baselineByCase = new Map(baseline.results.map((item) => [item.case_id, item]));
  const currentByCase = new Map(current.results.map((item) => [item.case_id, item]));
  for (const [caseId, baselineCase] of baselineByCase) {
    const currentCase = currentByCase.get(caseId);
    if (!currentCase) {
      issues.push(`case ${caseId} missing from current report`);
      continue;
    }
    if (baselineCase.verdict === "pass" && currentCase.verdict === "fail") {
      issues.push(`case ${caseId} regressed from pass to fail`);
    }
    const missingControls = baselineCase.control_ids.filter((controlId) => !currentCase.control_ids.includes(controlId));
    if (missingControls.length) drift.push(`case ${caseId} missing previously observed controls: ${missingControls.join(",")}`);
    const missingFamilies = baselineCase.finding_categories.filter((category) => !currentCase.finding_categories.includes(category));
    if (missingFamilies.length) drift.push(`case ${caseId} missing previously observed finding families: ${missingFamilies.join(",")}`);
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
  return `${item.id}: tier=${item.tier} default=${item.enabled_by_default ? "yes" : "no"} mode=${item.run_mode ?? "suite-default"} package=${item.audit_package ?? "suite-default"} target=${item.repo_url}@${item.pinned_commit.slice(0, 12)} categories=${item.categories.join(",")}`;
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

export { DEFAULT_SUITE_PATH };
