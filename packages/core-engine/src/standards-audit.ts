import fs from "node:fs/promises";
import path from "node:path";

import type {
  AnalysisSummary,
  AuditObservation,
  BaselineDimensionScore,
  ControlResult,
  EvidenceRecord,
  Finding,
  FrameworkScore,
  MethodologyArtifact,
  ScoreSummary,
  StandardControlDefinition,
  TargetClass,
  ThreatModelArtifact,
  ToolExecutionRecord
} from "./contracts.js";
import { computeBaselineDimensionScores, computeStaticBaselineScore } from "./standards.js";
import { createId } from "./utils.js";

const MAX_FILE_READ_BYTES = 256 * 1024;

export function isLikelyPlaceholderSecretValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (/^(?:your|my|the)[_-]?(?:api[_-]?)?(?:key|secret|token|password)(?:[_-]?(?:here|value))?$/.test(normalized)) return true;
  if (/(?:^|[_-])x{3,}(?:[_-]|$)/.test(normalized)) return true;
  if (/x{6,}/.test(normalized)) return true;
  if (/(?:^|[_-])your(?:[_-][a-z0-9]+){0,5}[_-](?:key|secret|token|password)(?:[_-](?:here|value))?$/.test(normalized)) return true;
  if (/(?:example|sample|placeholder|dummy|fake|changeme|change[_-]?me|replace[_-]?me|insert[_-]?here|test[_-]?(?:key|secret|token|password))/.test(normalized)) return true;
  if (/^__+[a-z0-9]+(?:_[a-z0-9]+)+__+$/.test(normalized)) return true;
  if (/^[x*_-]{8,}$/.test(normalized)) return true;
  if (/^[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)$/.test(value.trim())) return true;
  return false;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function ratingForScore(score: number): ScoreSummary["rating"] {
  if (score >= 90) return "excellent";
  if (score >= 80) return "strong";
  if (score >= 65) return "good";
  if (score >= 45) return "fair";
  return "poor";
}

async function walk(root: string, current = root, acc: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if ([".git", "node_modules", ".artifacts", "dist", "build", "__pycache__", ".venv"].includes(entry.name)) {
      continue;
    }
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, acc);
    } else if (!entry.isSymbolicLink()) {
      acc.push(absolute);
    }
  }
  return acc;
}

async function readTextSafe(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_READ_BYTES) {
    return "";
  }
  return fs.readFile(filePath, "utf8");
}

async function collectTexts(rootPath: string): Promise<Array<{ relative: string; text: string }>> {
  const files = await walk(rootPath);
  const readableFiles = files
    .map((absolute) => ({ absolute, relative: path.relative(rootPath, absolute).split(path.sep).join("/") }))
    .filter((item) => /\.(ts|tsx|js|jsx|mjs|cjs|py|sh|ps1|json|toml|ya?ml|md|env|txt)$/i.test(item.relative))
    .filter((item) => !/(^|\/)validation-expectations\.json$/i.test(item.relative));
  const output: Array<{ relative: string; text: string }> = [];
  const batchSize = 64;
  for (let offset = 0; offset < readableFiles.length; offset += batchSize) {
    const batch = readableFiles.slice(offset, offset + batchSize);
    output.push(...await Promise.all(batch.map(async (item) => ({ relative: item.relative, text: await readTextSafe(item.absolute) }))));
  }
  return output;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function importedShellExecAliases(text: string): string[] {
  const aliases = new Set<string>();
  const namedImports = text.matchAll(/import\s*{([^}]*)}\s*from\s*["'](?:node:)?child_process["']/gis);
  for (const match of namedImports) {
    for (const binding of match[1].split(",")) {
      const execBinding = binding.trim().match(/^exec(?:Sync)?(?:\s+as\s+([A-Za-z_$][\w$]*))?$/i);
      if (execBinding) aliases.add(execBinding[1] ?? binding.trim());
    }
  }

  const destructuredRequires = text.matchAll(/(?:const|let|var)\s*{([^}]*)}\s*=\s*require\s*\(\s*["'](?:node:)?child_process["']\s*\)/gis);
  for (const match of destructuredRequires) {
    for (const binding of match[1].split(",")) {
      const execBinding = binding.trim().match(/^exec(?:Sync)?(?:\s*:\s*([A-Za-z_$][\w$]*))?$/i);
      if (execBinding) aliases.add(execBinding[1] ?? binding.trim());
    }
  }
  return [...aliases];
}

function importedShellExecEvidence(relative: string, text: string): string[] {
  if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(relative)) return [];
  const evidence = new Set<string>();
  for (const alias of importedShellExecAliases(text)) {
    const escapedAlias = escapeRegExp(alias);
    const safelyEscapedTemplateCall = text.includes("replace(/'/g, \"'\\\\''\")")
      && new RegExp("\\b" + escapedAlias + "\\s*\\(\\s*`[^`]*\\$\\{[^}]*\\.map\\(\\s*shellEscape\\s*\\)[^}]*\\}[^`]*`", "s").test(text);
    const directCall = new RegExp(`\\b${escapedAlias}\\s*\\(`).test(text) && !safelyEscapedTemplateCall;
    const promisifiedAliases = [...text.matchAll(new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:[A-Za-z_$][\\w$]*\\.)?promisify\\s*\\(\\s*${escapedAlias}\\s*\\)`, "g"))]
      .map((match) => match[1]);
    const promisifiedCall = promisifiedAliases.some((promisifiedAlias) => new RegExp(`\\b${escapeRegExp(promisifiedAlias)}\\s*\\(`).test(text));
    if (directCall || promisifiedCall) evidence.add(`${relative}: imported child_process.${/sync/i.test(alias) ? "execSync" : "exec"} shell invocation`);
  }

  const namespaceImports = [...text.matchAll(/import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*["'](?:node:)?child_process["']/gis)]
    .map((match) => match[1]);
  const requiredNamespaces = [...text.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*["'](?:node:)?child_process["']\s*\)/gis)]
    .map((match) => match[1]);
  for (const alias of [...namespaceImports, ...requiredNamespaces]) {
    if (new RegExp(`\\b${escapeRegExp(alias)}\\.exec(?:Sync)?\\s*\\(`).test(text)) {
      evidence.add(`${relative}: child_process namespace shell invocation`);
    }
  }
  return [...evidence];
}

function isTestOrFixturePath(relative: string): boolean {
  return /(^|\/)(?:tests?|testdata|fixtures?|__tests__)(\/|$)/i.test(relative)
    || /(^|\/)(?:test|spec)[._-][^/]+\.(?:py|ts|tsx|js|jsx|mjs|cjs)$/i.test(relative);
}

function resemblesKnownCredentialFormat(value: string): boolean {
  return /^(?:sk-(?:proj-)?|gh[pousr]_|github_pat_|AKIA|ASIA|AIza|xox[baprs]-|glpat-|npm_)/.test(value);
}

function executableScanText(relative: string, text: string): string {
  if (!/\.py$/i.test(relative)) return text;
  return text.replace(/(?:[rubf]{0,2})(?:"""[\s\S]*?"""|'''[\s\S]*?''')/gi, "");
}

function findTool(toolExecutions: ToolExecutionRecord[], tool: string): ToolExecutionRecord | undefined {
  return toolExecutions.find((item) => item.tool === tool);
}

function findScorecardTool(toolExecutions: ToolExecutionRecord[]): ToolExecutionRecord | undefined {
  return findTool(toolExecutions, "scorecard") ?? findTool(toolExecutions, "scorecard_api");
}

function scorecardCheck(toolExecutions: ToolExecutionRecord[], name: string): any | undefined {
  const parsed = findScorecardTool(toolExecutions)?.parsed as any;
  const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
  return checks.find((item: any) => typeof item?.name === "string" && item.name.toLowerCase() === name.toLowerCase());
}

function semgrepResults(toolExecutions: ToolExecutionRecord[]): any[] {
  const parsed = findTool(toolExecutions, "semgrep")?.parsed as any;
  return Array.isArray(parsed?.results) ? parsed.results : [];
}

function trivyResults(toolExecutions: ToolExecutionRecord[]): any[] {
  const parsed = findTool(toolExecutions, "trivy")?.parsed as any;
  return Array.isArray(parsed?.Results) ? parsed.Results : [];
}

function runtimeEvidenceRecords(evidenceRecords: EvidenceRecord[]): EvidenceRecord[] {
  return evidenceRecords.filter((item) => item.metadata?.category === "sandbox_execution");
}

function runtimeEvaluationCoverageRecords(evidenceRecords: EvidenceRecord[]): EvidenceRecord[] {
  return evidenceRecords.filter((item) => item.metadata?.category === "runtime_evaluation_coverage");
}

function runtimeEvaluationObservationRecords(evidenceRecords: EvidenceRecord[]): EvidenceRecord[] {
  return evidenceRecords.filter((item) => item.metadata?.category === "runtime_evaluation_observation");
}

function runtimeEvidenceReference(record: EvidenceRecord): string[] {
  const locations = (record.locations ?? []).map((location) => {
    if (location.source_kind === "uri" && location.uri) return `${location.label ?? "runtime_endpoint"}: ${location.uri}`;
    if (location.source_kind === "file" && location.path) return `${location.path}${location.line ? `:${location.line}` : ""}`;
    if (location.source_kind === "symbol" && location.symbol) return `${location.label ?? "runtime_symbol"}: ${location.symbol}`;
    return null;
  }).filter((item): item is string => Boolean(item));
  return [`evidence:${record.evidence_id}`, ...locations].slice(0, 8);
}

function runtimeEvidenceByPhase(evidenceRecords: EvidenceRecord[], phase: string): EvidenceRecord[] {
  return runtimeEvidenceRecords(evidenceRecords).filter((item) => String(item.metadata?.phase || "") === phase);
}

function runtimeEvidenceByStatus(evidenceRecords: EvidenceRecord[], statuses: string[]): EvidenceRecord[] {
  const allowed = new Set(statuses);
  return runtimeEvidenceRecords(evidenceRecords).filter((item) => allowed.has(String(item.metadata?.status || "")));
}

function runtimeEvidenceSummaries(evidenceRecords: EvidenceRecord[], limit = 5): string[] {
  return evidenceRecords.slice(0, limit).map((item) => summarizeRuntimeEvidence(item));
}

function runtimeArtifactDetails(record: EvidenceRecord): Record<string, unknown> {
  return (record.metadata?.normalized_artifact as any)?.details_json ?? {};
}

function summarizeRuntimeEvidence(record: EvidenceRecord): string {
  const details = runtimeArtifactDetails(record);
  const adapter = String(record.metadata?.adapter || details.adapter || "unknown");
  const phase = String(record.metadata?.phase || "step");
  const summaryParts = [record.summary];
  if (details.stack) summaryParts.push(`stack ${details.stack}`);
  if (details.framework) summaryParts.push(`framework ${details.framework}`);
  if (details.package_manager) summaryParts.push(`pkg ${details.package_manager}`);
  if (details.script_name) summaryParts.push(`script ${details.script_name}`);
  if (details.entrypoint) summaryParts.push(`entry ${details.entrypoint}`);
  if (adapter === "http_service") {
    const probe = (details.probe || {}) as any;
    const startup = (details.startup || {}) as any;
    if (probe.successful_target) {
      summaryParts.push(`healthy ${probe.successful_target}`);
    } else if (probe.attempted_targets?.length) {
      summaryParts.push(`checked ${probe.attempted_targets.join(", ")}`);
    }
    if (probe.classification) {
      summaryParts.push(`probe ${probe.classification}`);
    }
    if (probe.status_code) summaryParts.push(`status ${probe.status_code}`);
    if (startup.signaled_ready && startup.indicator) {
      summaryParts.push(`startup ${startup.indicator}`);
    }
    if (startup.failure_reason) {
      summaryParts.push(`startup-failure ${startup.failure_reason}`);
    }
  }
  if (adapter === "python_pytest" && details.test_runner) {
    summaryParts.push(`runner ${details.test_runner}`);
  }
  if (adapter === "node_npm" && details.lockfile) {
    summaryParts.push(`lockfile ${details.lockfile}`);
  }
  if (!details.stack && !details.package_manager && !details.entrypoint) {
    summaryParts.push(`${phase}/${adapter}`);
  }
  return summaryParts.filter(Boolean).join(" | ");
}

function addFinding(findings: Finding[], args: Omit<Finding, "finding_id">): string {
  const findingId = createId("finding");
  const evidence = [...args.evidence];
  if (!evidence.some((reference) => /(?:^|[\\/])[^\s:]+:\d+(?::\d+)?$/i.test(reference) || /(?:artifact|report|transcript|trace):/i.test(reference))) {
    evidence.push(args.source === "tool" ? "artifact:evidence-executions" : "artifact:repo-analysis");
  }
  findings.push({
    finding_id: findingId,
    ...args,
    evidence
  });
  return findingId;
}

function makeControlResult(control: StandardControlDefinition, overrides: Partial<ControlResult>): ControlResult {
  return {
    control_id: control.control_id,
    framework: control.framework,
    standard_ref: control.standard_ref,
    title: control.title,
    applicability: "applicable",
    assessability: "assessed",
    status: "pass",
    score_weight: control.weight,
    max_score: control.weight,
    score_awarded: control.weight,
    rationale: [],
    evidence: [],
    finding_ids: [],
    sources: [],
    ...overrides
  };
}

function hasAny(values: string[] | undefined, expected: string[]): boolean {
  const set = new Set(values ?? []);
  return expected.some((item) => set.has(item));
}

export async function evaluateStandardsAudit(args: {
  rootPath: string;
  analysis: AnalysisSummary;
  targetClass: TargetClass;
  threatModel: ThreatModelArtifact;
  toolExecutions: ToolExecutionRecord[];
  evidenceRecords: EvidenceRecord[];
  controlCatalog: StandardControlDefinition[];
  applicableControlIds: string[];
  deferredControlIds: string[];
  nonApplicableControlIds: string[];
  methodology: MethodologyArtifact;
}): Promise<{ findings: Finding[]; controlResults: ControlResult[]; observations: AuditObservation[]; scoreSummary: ScoreSummary; dimensionScores: BaselineDimensionScore[]; staticScore: number }> {
  const findings: Finding[] = [];
  const observations: AuditObservation[] = [];
  const controlResults: ControlResult[] = [];
  const texts = await collectTexts(args.rootPath);

  const hasSecurityMd = args.analysis.security_docs.some((file) => /(^|\/)SECURITY\.md$/i.test(file));
  const hasDependabot = args.analysis.security_docs.some((file) => /dependabot/i.test(file));
  const hasRenovate = args.analysis.security_docs.some((file) => /renovate/i.test(file));
  const hasLockfile = args.analysis.lockfiles.length > 0;
  const hasCi = args.analysis.ci_workflows.length > 0;
  const scorecard = findScorecardTool(args.toolExecutions);
  const semgrep = findTool(args.toolExecutions, "semgrep");
  const trivy = findTool(args.toolExecutions, "trivy");
  const semgrepFindingList = semgrepResults(args.toolExecutions);
  const trivyResultList = trivyResults(args.toolExecutions);
  const completedRuntimeChecks = runtimeEvidenceByStatus(args.evidenceRecords, ["completed"]);
  const failedRuntimeChecks = runtimeEvidenceByStatus(args.evidenceRecords, ["failed", "blocked"]);
  const completedRuntimeTests = runtimeEvidenceByPhase(completedRuntimeChecks, "test");
  const completedRuntimeBuilds = runtimeEvidenceByPhase(completedRuntimeChecks, "build");
  const completedRuntimeProbes = runtimeEvidenceByPhase(completedRuntimeChecks, "runtime_probe");
  const failedRuntimeInstalls = runtimeEvidenceByPhase(failedRuntimeChecks, "install");
  const failedRuntimeBuilds = runtimeEvidenceByPhase(failedRuntimeChecks, "build");
  const failedRuntimeTests = runtimeEvidenceByPhase(failedRuntimeChecks, "test");
  const runtimeProbeFailures = runtimeEvidenceByPhase(failedRuntimeChecks, "runtime_probe");
  const runtimeExecutionFailures = [
    ...failedRuntimeInstalls,
    ...failedRuntimeBuilds,
    ...failedRuntimeTests,
    ...runtimeProbeFailures
  ];
  const runtimeLogEvidence = runtimeEvidenceRecords(args.evidenceRecords).filter((item) => {
    const details = runtimeArtifactDetails(item);
    return Boolean(details.stdout_excerpt || details.stderr_excerpt);
  });
  const runtimeEvaluationCoverage = runtimeEvaluationCoverageRecords(args.evidenceRecords);
  const runtimeEvaluationObservations = runtimeEvaluationObservationRecords(args.evidenceRecords);
  const runtimeFindingIdsByControl = new Map<string, string[]>();
  for (const record of runtimeEvaluationObservations) {
    if (record.metadata?.outcome !== "finding") continue;
    const mappedControls = args.controlCatalog.filter((control) =>
      record.control_ids.includes(control.control_id)
      && args.applicableControlIds.includes(control.control_id)
      && !args.deferredControlIds.includes(control.control_id)
      && !args.nonApplicableControlIds.includes(control.control_id)
    );
    if (!mappedControls.length) continue;
    const rawSeverity = String(record.metadata?.severity ?? "high");
    const severity: Finding["severity"] = rawSeverity === "critical" || rawSeverity === "high" || rawSeverity === "medium" || rawSeverity === "low"
      ? rawSeverity
      : "high";
    const probeId = String(record.metadata?.probe_id ?? "behavioral-boundary").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
    const findingId = addFinding(findings, {
      title: String(record.metadata?.title ?? "Runtime evaluation detected a security boundary failure"),
      severity,
      category: `runtime_${probeId}`,
      description: record.summary,
      evidence: runtimeEvidenceReference(record),
      public_safe: true,
      confidence: record.confidence,
      score_impact: Math.max(...mappedControls.map((control) => control.weight)),
      source: "tool",
      control_ids: mappedControls.map((control) => control.control_id),
      standards_refs: [...new Set(mappedControls.map((control) => control.standard_ref))]
    });
    for (const control of mappedControls) {
      runtimeFindingIdsByControl.set(control.control_id, [...(runtimeFindingIdsByControl.get(control.control_id) ?? []), findingId]);
    }
  }
  for (const record of runtimeEvaluationObservations) {
    const outcome = String(record.metadata?.outcome ?? "error");
    const reason = typeof record.metadata?.inconclusive_reason === "string" ? ` Reason: ${record.metadata.inconclusive_reason}.` : "";
    observations.push({
      observation_id: createId("obs_runtime"),
      title: String(record.metadata?.title ?? "Runtime evaluation observation"),
      summary: `${record.summary} Outcome: ${outcome}.${reason}`,
      evidence: runtimeEvidenceReference(record)
    });
  }
  for (const record of runtimeEvaluationCoverage.filter((item) => item.metadata?.adequate !== true)) {
    const reasons = Array.isArray(record.metadata?.inconclusive_reasons)
      ? record.metadata.inconclusive_reasons.filter((item): item is string => typeof item === "string")
      : [];
    observations.push({
      observation_id: createId("obs_runtime_coverage"),
      title: "Runtime evaluation coverage is inconclusive",
      summary: `${record.summary}${reasons.length ? ` Inconclusive reasons: ${reasons.join(", ")}.` : ""}`,
      evidence: [`evidence:${record.evidence_id}`]
    });
  }
  const secretCandidateRecords = texts.flatMap((item) => {
    const matches = item.text.matchAll(/(api[_-]?key|secret|token|password)\s*[:=]\s*["']([A-Za-z0-9_\-]{16,})["']/gi);
    return [...matches]
      .filter((match) => !isLikelyPlaceholderSecretValue(match[2] ?? ""))
      .map((match) => ({ path: item.relative, key: match[1], value: match[2] ?? "" }));
  });
  const secretCandidates = secretCandidateRecords
    .filter((item) => !isTestOrFixturePath(item.path) || resemblesKnownCredentialFormat(item.value))
    .map((item) => `${item.path}: ${item.key} assignment with redacted literal (${item.value.length} characters)`);
  const excludedTestSecretCandidates = secretCandidateRecords
    .filter((item) => isTestOrFixturePath(item.path) && !resemblesKnownCredentialFormat(item.value))
    .map((item) => `${item.path}: ${item.key} test-fixture assignment with redacted literal (${item.value.length} characters)`);
  const dangerousExecRecords = texts.flatMap((item) => {
    if (isTestOrFixturePath(item.relative)) return [];
    const executableText = executableScanText(item.relative, item.text);
    const patterns = [
      /child_process\.exec\s*\(/i,
      /child_process\.execSync\s*\(/i,
      /subprocess\.(run|Popen|call)\([^\)]*shell\s*=\s*True/i,
      /os\.system\s*\(/i
    ];
    const evidence = [
      ...patterns.filter((pattern) => pattern.test(executableText)).map((pattern) => `${item.relative}: ${pattern.source}`),
      ...importedShellExecEvidence(item.relative, executableText)
    ];
    return evidence.map((reference) => ({ path: item.relative, reference, text: executableText }));
  });
  const agentDangerousExecMatches = dangerousExecRecords
    .filter((item) => /(?:^|\/)(?:mcp(?:-server)?|agents?|tools?)(?:[\/_.-]|$)/i.test(item.path)
      || /ReactCodeAgent|AgentExecutor|create_openai_tools_agent|McpServer|FastMCP|registerTool|server\.tool|tools\/call|tool_calls?/i.test(item.text))
    .map((item) => item.reference);
  const nonAgentDangerousExecMatches = dangerousExecRecords
    .filter((item) => !agentDangerousExecMatches.includes(item.reference))
    .map((item) => item.reference);
  const mcpPathBoundaryMatches = texts.flatMap((item) => {
    if (!/\.py$/i.test(item.relative)) return [];
    const unsafeGitAdd = /def\s+git_add\s*\([^)]*\bfiles\b[^)]*\)\s*(?:->\s*[^:]+)?\s*:[\s\S]{0,2000}?\brepo\.index\.add\s*\(\s*files\s*\)/i;
    return unsafeGitAdd.test(item.text)
      ? [`${item.relative}: git_add passes caller-supplied files to repo.index.add without a repository-boundary-enforcing API`]
      : [];
  });
  const filePayloadPathValidationMatches = (() => {
    const blocks = texts.find((item) => /(^|\/)gradio\/blocks\.py$/i.test(item.relative));
    const dataClasses = texts.find((item) => /(^|\/)gradio\/data_classes\.py$/i.test(item.relative));
    if (!blocks || !dataClasses) return [];

    const constructsFileDataWithoutValidation = /block\.data_model\s*\(\s*\*\*inputs_cached\s*\)/i.test(blocks.text)
      || /block\.data_model\s*\(\s*root\s*=\s*inputs_cached\s*\)/i.test(blocks.text);
    const fileDataHasTrustedMetaDefault = /class\s+FileData\s*\(\s*GradioModel\s*\)[\s\S]{0,3000}?meta\s*:\s*dict\s*=\s*\{\s*["']_type["']\s*:\s*["']gradio\.FileData["']/i.test(dataClasses.text);
    const validatesCallerProvidedMeta = /model_validate\s*\([\s\S]{0,300}?context\s*=\s*\{\s*["']validate_meta["']\s*:\s*True\s*\}/i.test(blocks.text)
      && /def\s+validate_model\s*\([^)]*\)[\s\S]{0,700}?is_file_obj_with_meta\s*\(\s*v\s*\)/i.test(dataClasses.text);
    if (!constructsFileDataWithoutValidation || !fileDataHasTrustedMetaDefault || validatesCallerProvidedMeta) return [];

    return [
      `${blocks.relative}: caller file payloads are instantiated without requiring explicit trusted-file metadata`,
      `${dataClasses.relative}: FileData supplies trusted metadata by default without validating that the caller provided it`
    ];
  })();
  const sensitiveOperationAuthentication = (() => {
    const validateApi = texts.find((item) => /(^|\/)langflow\/api\/v1\/validate\.py$/i.test(item.relative));
    if (!validateApi) return { present: false, authenticated: false, evidence: [] as string[] };

    const endpoint = validateApi.text.match(/@router\.post\(\s*["']\/code["'][\s\S]{0,400}?async\s+def\s+post_validate_code\s*\(([\s\S]{0,700}?)\)\s*(?:->\s*[^:]+)?\s*:/i);
    if (!endpoint || !/\bvalidate_code\s*\(\s*code\.code\s*\)/i.test(validateApi.text)) {
      return { present: false, authenticated: false, evidence: [] as string[] };
    }

    const signature = endpoint[1] ?? "";
    const authenticated = /\bCurrentActiveUser\b|\bDepends\s*\(\s*get_current_active_user\b/i.test(signature);
    return {
      present: true,
      authenticated,
      evidence: [authenticated
        ? `${validateApi.relative}: POST /code requires CurrentActiveUser before calling validate_code`
        : `${validateApi.relative}: POST /code calls validate_code without CurrentActiveUser or an authentication dependency`]
    };
  })();
  const unpinnedActions = texts.flatMap((item) => {
    if (!/^\.github\/workflows\//i.test(item.relative)) return [];
    const matches = item.text.match(/uses\s*:\s*[^\s@]+\/[^\s@]+@[A-Za-z0-9_.-]+/g) ?? [];
    return matches.filter((match) => !/@[a-f0-9]{40}$/i.test(match)).map((match) => `${item.relative}: ${match.trim()}`);
  });
  const broadPermissionWorkflows = texts
    .filter((item) => {
      if (!/^\.github\/workflows\//i.test(item.relative)) return false;
      if (/permissions\s*:\s*write-all/i.test(item.text)) return true;
      if (!/contents\s*:\s*write/i.test(item.text)) return false;
      const explicitlyPurposeBound = /contents\s*:\s*write\s*#\s*[^\r\n]*(?:gh-pages|publish|deploy|release)/i.test(item.text)
        || (/(?:docs?|pages|publish|deploy|release)/i.test(item.relative) && /(?:gh-pages|pages\s+deploy|publish|release)/i.test(item.text))
        || (/calibreapp\/image-actions@/i.test(item.text)
          && /pull_request\s*:/i.test(item.text)
          && /head\.repo\.full_name\s*==\s*github\.repository/i.test(item.text)
          && /pull-requests\s*:\s*write/i.test(item.text));
      return !explicitlyPurposeBound;
    })
    .map((item) => item.relative);
  const securityScanningWorkflowPresent = texts.some((item) => /^\.github\/workflows\//i.test(item.relative) && /codeql|semgrep|security|sast/i.test(item.text));
  const sandboxMentions = texts.filter((item) => /sandbox|allowlist|command_policy|read_only_analysis_only|tool policy/i.test(item.text)).map((item) => item.relative);
  const agenticTarget = args.targetClass === "tool_using_multi_turn_agent" || args.targetClass === "mcp_server_plugin_skill_package" || (args.analysis.ai_frameworks ?? []).length > 0 || (args.analysis.agentic_capabilities ?? []).length > 0;
  const agenticSignalEvidence = [
    ...(args.analysis.agentic_signal_files ?? []),
    ...(args.analysis.agent_indicators ?? []),
    ...(args.analysis.tool_execution_indicators ?? [])
  ].slice(0, 8);
  const approvalGateEvidence = texts.filter((item) => /approve|approval|confirm|human.?in.?the.?loop|require.?review|permission.?prompt/i.test(item.text)).map((item) => item.relative);
  const allowlistEvidence = texts.filter((item) => /allowlist|allowed_tools|tool.?policy|denylist|blocked_tools|capability.?policy/i.test(item.text)
    || /(?:ReactCodeAgent|AgentExecutor|create_openai_tools_agent)[\s\S]{0,400}\btools\s*=\s*\[/i.test(item.text)).map((item) => item.relative);
  const promptInjectionEvidence = texts.filter((item) => /prompt.?injection|ignore.?previous|instruction.?hierarchy|untrusted.?content|sanitize.?prompt/i.test(item.text)).map((item) => item.relative);
  const envAccessEvidence = texts.filter((item) => /process\.env|os\.environ|dotenv|api[_-]?key|secret|token|credential/i.test(item.text)).map((item) => item.relative);
  const secretRedactionEvidence = texts.filter((item) => /redact|mask.?secret|scrub|sanitize.?log|pii|sensitive.?data/i.test(item.text)).map((item) => item.relative);
  const mcpPermissionEvidence = texts.filter((item) => /@modelcontextprotocol|McpServer|FastMCP|registerTool|server\.tool|tools\/call|permission|capability|scope/i.test(item.text)).map((item) => item.relative);
  const mcpPermissionPolicyEvidence = texts.filter((item) => /permission|policy|scope|allow|deny|capability/i.test(item.text) && /mcp|plugin|skill|tool/i.test(item.text)).map((item) => item.relative);
  const browserSafetyEvidence = texts.filter((item) => /playwright|puppeteer|selenium|browser|download|navigation|origin|url.?allow|domain.?allow|credential/i.test(item.text)).map((item) => item.relative);
  const browserPolicyEvidence = texts.filter((item) => /allow|deny|origin|domain|download|credential|sandbox|permission/i.test(item.text) && /browser|playwright|puppeteer|selenium|navigation|url/i.test(item.text)).map((item) => item.relative);
  const telemetryEvidence = texts.filter((item) => /telemetry|trace|audit.?log|structured.?log|logger|console\.log|print\(/i.test(item.text)).map((item) => item.relative);
  const telemetryRedactionEvidence = texts.filter((item) => /redact|mask|scrub|sanitize|sensitive|secret|token|privacy/i.test(item.text) && /telemetry|trace|log|logger|console\.log|print\(/i.test(item.text)).map((item) => item.relative);

  let agentExecutionBoundaryFindingId: string | null = null;
  const agentExecutionBoundaryControlIds = [
    "harness_internal.agent_permission_boundaries",
    "owasp_llm.prompt_injection_guardrails",
    "owasp_agentic.tool_misuse_boundary",
    "mitre_atlas.tool_misuse_mitigation"
  ].filter((controlId) => args.applicableControlIds.includes(controlId));
  const ensureAgentExecutionBoundaryFinding = (): string => {
    if (agentExecutionBoundaryFindingId) return agentExecutionBoundaryFindingId;
    const mappedControls = args.controlCatalog.filter((item) => agentExecutionBoundaryControlIds.includes(item.control_id));
    agentExecutionBoundaryFindingId = addFinding(findings, {
      title: "Agentic execution path lacks a visible permission boundary",
      severity: "high",
      category: "agent_permission_boundary",
      description: "Static analysis connected an agent or MCP execution path to shell execution without visible sandbox or command-policy evidence.",
      evidence: agentDangerousExecMatches.slice(0, 5),
      public_safe: true,
      confidence: 0.88,
      score_impact: Math.max(0, ...mappedControls.map((item) => item.weight)),
      source: "heuristic",
      control_ids: agentExecutionBoundaryControlIds,
      standards_refs: mappedControls.map((item) => item.standard_ref)
    });
    return agentExecutionBoundaryFindingId;
  };

  if (excludedTestSecretCandidates.length > 0 && secretCandidates.length === 0) {
    observations.push({
      observation_id: createId("obs_test_secret_fixture"),
      title: "Credential-like literals are limited to test fixtures",
      summary: "Generic credential-like assignments were detected only in test or fixture paths. Their values were redacted and they were not promoted to a production secret-exposure finding.",
      evidence: excludedTestSecretCandidates.slice(0, 5)
    });
  }

  for (const control of args.controlCatalog) {
    if (args.nonApplicableControlIds.includes(control.control_id)) {
      controlResults.push(makeControlResult(control, {
        applicability: "not_applicable",
        assessability: "not_assessed",
        status: "not_applicable",
        score_awarded: 0,
        rationale: ["Planner marked this control not applicable for the current target."],
        sources: ["planner"]
      }));
      continue;
    }

    if (args.deferredControlIds.includes(control.control_id)) {
      controlResults.push(makeControlResult(control, {
        applicability: "applicable",
        assessability: "not_assessed",
        status: "not_assessed",
        score_awarded: 0,
        rationale: ["Planner deferred this control because the current run mode cannot assess it directly."],
        sources: ["planner"]
      }));
      continue;
    }

    if (!args.applicableControlIds.includes(control.control_id)) {
      controlResults.push(makeControlResult(control, {
        applicability: "not_applicable",
        assessability: "not_assessed",
        status: "not_applicable",
        score_awarded: 0,
        rationale: ["Control was not selected into the applicable audit scope."],
        sources: ["planner"]
      }));
      continue;
    }

    if (control.runtime_assessable && control.audit_lane === "runtime_validation") {
      const coverageRecords = runtimeEvaluationCoverage.filter((record) => record.control_ids.includes(control.control_id));
      const observationRecords = runtimeEvaluationObservations.filter((record) => record.control_ids.includes(control.control_id));
      const findingIds = runtimeFindingIdsByControl.get(control.control_id) ?? [];
      const assessableObservations = observationRecords.filter((record) => ["finding", "no_finding_observed", "observed"].includes(String(record.metadata?.outcome ?? "")));
      const incompleteCoverage = coverageRecords.filter((record) => record.metadata?.adequate !== true);
      const inconclusiveReasons = [...new Set([
        ...incompleteCoverage.flatMap((record) => Array.isArray(record.metadata?.inconclusive_reasons) ? record.metadata.inconclusive_reasons : []),
        ...observationRecords.map((record) => record.metadata?.inconclusive_reason).filter(Boolean)
      ].filter((item): item is string => typeof item === "string"))];
      const evidence = [
        ...coverageRecords.map((record) => `evidence:${record.evidence_id} ${record.summary}`),
        ...observationRecords.flatMap(runtimeEvidenceReference)
      ].slice(0, 20);
      const sources = [...new Set([...coverageRecords, ...observationRecords].map((record) => String(record.metadata?.provider_id ?? record.source_id)))];
      const coverageAdequate = coverageRecords.length > 0 && incompleteCoverage.length === 0;
      const hasFinding = findingIds.length > 0;
      const hasAssessableObservation = assessableObservations.length > 0;
      controlResults.push(makeControlResult(control, {
        assessability: hasFinding
          ? coverageAdequate ? "assessed" : "partially_assessed"
          : hasAssessableObservation ? "partially_assessed" : "not_assessed",
        status: hasFinding ? "fail" : hasAssessableObservation ? "partial" : "not_assessed",
        score_awarded: 0,
        rationale: [
          hasFinding
            ? `Bounded runtime evaluation produced ${findingIds.length} finding(s) mapped to this control${coverageAdequate ? "." : ", while coverage also remained incomplete."}`
            : hasAssessableObservation && coverageAdequate
              ? "The bounded runtime sample produced no finding, but a finite sample cannot establish a control pass."
              : hasAssessableObservation
                ? "Some bounded runtime samples were assessable, but incomplete coverage prevents a pass."
                : "No assessable bounded runtime sample was available for this control.",
          ...(inconclusiveReasons.length ? [`Inconclusive reasons: ${inconclusiveReasons.join(", ")}.`] : [])
        ],
        evidence,
        finding_ids: findingIds,
        sources: sources.length ? sources : ["runtime-evaluation"]
      }));
      continue;
    }

    if (control.control_id === "openssf.security_policy" || control.control_id === "nist_ssdf.disclosure_process") {
      const check = scorecardCheck(args.toolExecutions, "Security-Policy");
      const score = typeof check?.score === "number" ? check.score : undefined;
      const passed = hasSecurityMd || (typeof score === "number" && score >= 7);
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "Repository does not publish a visible security policy",
        severity: "medium",
        category: "security_policy",
        description: "Static audit did not find a visible SECURITY.md or equivalent disclosure policy. This weakens vulnerability intake and response posture.",
        evidence: hasSecurityMd ? [] : ["SECURITY.md not found", ...(typeof check?.reason === "string" ? [check.reason] : [])],
        public_safe: true,
        confidence: 0.95,
        score_impact: control.weight,
        source: scorecard?.status === "completed" ? "tool" : "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "Security policy evidence was detected." : "No visible security policy evidence was detected."],
        evidence: [hasSecurityMd ? "SECURITY.md present" : "SECURITY.md not found", ...(typeof check?.reason === "string" ? [check.reason] : [])],
        finding_ids: findingIds,
        sources: [scorecard?.status === "completed" ? "scorecard" : "repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "openssf.dependency_update_tool") {
      const check = scorecardCheck(args.toolExecutions, "Dependency-Update-Tool");
      const passed = hasDependabot || hasRenovate || (typeof check?.score === "number" && check.score >= 7);
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "No automated dependency update workflow detected",
        severity: "medium",
        category: "dependency_maintenance",
        description: "The repository contains dependency manifests, but static audit did not find Dependabot, Renovate, or equivalent automation evidence.",
        evidence: args.analysis.dependency_manifests.slice(0, 5),
        public_safe: true,
        confidence: 0.88,
        score_impact: control.weight,
        source: scorecard?.status === "completed" ? "tool" : "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "Dependency update automation evidence detected." : "Dependency update automation evidence not detected."],
        evidence: [...(hasDependabot || hasRenovate ? ["Dependabot or Renovate config present"] : []), ...(typeof check?.reason === "string" ? [check.reason] : [])],
        finding_ids: findingIds,
        sources: [scorecard?.status === "completed" ? "scorecard" : "repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "openssf.pinned_dependencies") {
      const check = scorecardCheck(args.toolExecutions, "Pinned-Dependencies");
      const passed = hasLockfile || (typeof check?.score === "number" && check.score >= 7);
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "Dependency manifests exist without recognized lockfile coverage",
        severity: "high",
        category: "dependency_locking",
        description: "Dependency manifests were detected, but static audit did not find strong lockfile evidence. That weakens reproducibility and supply-chain stability.",
        evidence: args.analysis.dependency_manifests.slice(0, 5),
        public_safe: true,
        confidence: 0.92,
        score_impact: control.weight,
        source: scorecard?.status === "completed" ? "tool" : "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref, "OWASP LLM Top 10 / Supply Chain"]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "Dependency pinning evidence detected." : "Dependency pinning evidence was not sufficient."],
        evidence: [...(hasLockfile ? args.analysis.lockfiles.slice(0, 5) : []), ...(typeof check?.reason === "string" ? [check.reason] : [])],
        finding_ids: findingIds,
        sources: [scorecard?.status === "completed" ? "scorecard" : "repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "openssf.token_permissions") {
      const check = scorecardCheck(args.toolExecutions, "Token-Permissions");
      const scorecardAssessed = typeof check?.score === "number" && check.score >= 0;
      const passed = broadPermissionWorkflows.length === 0 && (!scorecardAssessed || check.score >= 7);
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "Workflow token permissions appear broader than necessary",
        severity: "high",
        category: "workflow_permissions",
        description: "One or more workflows appear to request broad write permissions. In OSS projects, that increases CI/CD blast radius.",
        evidence: broadPermissionWorkflows.slice(0, 5),
        public_safe: true,
        confidence: 0.82,
        score_impact: control.weight,
        source: scorecard?.status === "completed" ? "tool" : "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : broadPermissionWorkflows.length > 0 ? "fail" : "partial",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "No broad workflow token permissions were detected." : "Workflow permission scope needs review."],
        evidence: [...broadPermissionWorkflows.slice(0, 5), ...(typeof check?.reason === "string" ? [check.reason] : [])],
        finding_ids: findingIds,
        sources: [scorecard?.status === "completed" ? "scorecard" : "repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "openssf.dangerous_workflow") {
      const check = scorecardCheck(args.toolExecutions, "Dangerous-Workflow");
      const semgrepWorkflowFindings = semgrepFindingList.filter((item: any) => typeof item?.path === "string" && item.path.includes(".github/workflows"));
      const failed = (typeof check?.score === "number" && check.score < 5) || semgrepWorkflowFindings.length > 0;
      const findingIds = failed ? [addFinding(findings, {
        title: "CI/CD workflow issues require manual review",
        severity: "high",
        category: "dangerous_workflow",
        description: "Static tools flagged CI/CD workflow patterns that may be unsafe or overly permissive.",
        evidence: [...semgrepWorkflowFindings.slice(0, 3).map((item: any) => `${item.path}: ${item.extra?.message ?? item.check_id ?? "workflow issue"}`), ...(typeof check?.reason === "string" ? [check.reason] : [])],
        public_safe: true,
        confidence: 0.78,
        score_impact: control.weight,
        source: semgrepWorkflowFindings.length > 0 || scorecard?.status === "completed" ? "tool" : "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })] : [];
      controlResults.push(makeControlResult(control, {
        status: failed ? "fail" : "pass",
        score_awarded: failed ? 0 : control.weight,
        rationale: [failed ? "Workflow scanners identified risky CI/CD patterns." : "No dangerous workflow patterns were detected by current static checks."],
        evidence: [...semgrepWorkflowFindings.slice(0, 3).map((item: any) => `${item.path}: ${item.extra?.message ?? item.check_id ?? "workflow issue"}`), ...(typeof check?.reason === "string" ? [check.reason] : [])],
        finding_ids: findingIds,
        sources: [semgrep?.status === "completed" ? "semgrep" : "repo-analysis", scorecard?.status === "completed" ? "scorecard" : "repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "openssf.branch_protection" || control.control_id === "slsa.provenance") {
      controlResults.push(makeControlResult(control, {
        assessability: "not_assessed",
        status: "not_assessed",
        score_awarded: 0,
        rationale: ["This control requires repository settings or build metadata that the static local run does not currently collect."],
        sources: ["planner"]
      }));
      continue;
    }

    if (control.control_id === "slsa.pinned_build_dependencies") {
      const passed = unpinnedActions.length === 0 && hasCi;
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "Build or workflow dependencies are not pinned strongly enough",
        severity: "medium",
        category: "build_integrity",
        description: "GitHub Actions are referenced by mutable tags or versions rather than full commit SHAs, which weakens CI supply-chain integrity.",
        evidence: unpinnedActions.slice(0, 5),
        public_safe: true,
        confidence: 0.93,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : hasCi ? "fail" : "not_assessed",
        assessability: hasCi ? "assessed" : "not_assessed",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "Workflow dependencies appear pinned more tightly." : hasCi ? "Workflow dependencies are not pinned to immutable SHAs." : "No CI workflows were present to assess build dependency pinning."],
        evidence: unpinnedActions.slice(0, 5),
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "nist_ssdf.automated_security_checks") {
      const runtimeAutomationEvidence = [...completedRuntimeTests, ...completedRuntimeBuilds, ...completedRuntimeProbes];
      const passed = securityScanningWorkflowPresent || semgrep?.status === "completed" || trivy?.status === "completed" || scorecard?.status === "completed" || runtimeAutomationEvidence.length > 0;
      const degradedByRuntimeFailure = !passed && runtimeExecutionFailures.length > 0;
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "No visible automated security checks were detected",
        severity: "medium",
        category: "automated_security_checks",
        description: "Static audit did not find visible security scanning workflows or successful security tool execution evidence for this run.",
        evidence: hasCi ? args.analysis.ci_workflows.slice(0, 5) : [".github/workflows not found"],
        public_safe: true,
        confidence: 0.78,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : degradedByRuntimeFailure ? "partial" : "fail",
        score_awarded: passed ? control.weight : degradedByRuntimeFailure ? Math.round(control.weight / 2) : 0,
        rationale: [passed ? "Automated security or validation evidence was present in workflows, tool results, or bounded runtime validation steps." : degradedByRuntimeFailure ? "Bounded validation steps were attempted but did not complete cleanly enough to count as successful automated security checks." : "Automated security or validation evidence was not found."],
        evidence: [
          securityScanningWorkflowPresent ? "Security-scanning workflow markers detected" : "No security-scanning workflow markers detected",
          semgrep?.summary ?? "",
          trivy?.summary ?? "",
          scorecard?.summary ?? "",
          ...runtimeEvidenceSummaries(runtimeAutomationEvidence),
          ...runtimeEvidenceSummaries(runtimeExecutionFailures)
        ].filter(Boolean),
        finding_ids: degradedByRuntimeFailure ? [] : findingIds,
        sources: ["repo-analysis", ...(semgrep ? ["semgrep"] : []), ...(trivy ? ["trivy"] : []), ...(scorecard ? ["scorecard"] : []), ...(runtimeAutomationEvidence.length || runtimeExecutionFailures.length ? ["runtime-validation"] : [])]
      }));
      continue;
    }

    if (control.control_id === "owasp_llm.sensitive_information_disclosure") {
      const hasSecretExposure = secretCandidates.length > 0;
      const findingIds = hasSecretExposure ? [addFinding(findings, {
        title: "Potential hardcoded secret material detected",
        severity: "critical",
        category: "secret_exposure",
        description: "Static audit found credential-like assignments in repository content. These may be fixtures or placeholders, but they need review before publication or deployment.",
        evidence: secretCandidates.slice(0, 5),
        public_safe: false,
        confidence: 0.72,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })] : [];
      controlResults.push(makeControlResult(control, {
        status: hasSecretExposure ? "fail" : "pass",
        score_awarded: hasSecretExposure ? 0 : control.weight,
        rationale: [hasSecretExposure ? "Potential credential exposure markers were detected." : "No obvious credential-like literal assignments were detected in sampled text files."],
        evidence: hasSecretExposure ? secretCandidates.slice(0, 5) : ["No obvious secret-like assignments detected in sampled files"],
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.audit_traceability") {
      const traceMarkers = texts.filter((item) => /trace|audit|artifact|run_id|observation/i.test(item.text)).map((item) => item.relative);
      const passed = traceMarkers.length > 0;
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "partial",
        score_awarded: passed ? control.weight : Math.round(control.weight / 2),
        rationale: [passed ? "Visible trace or artifact markers were detected." : "Only limited traceability markers were detected in the repo."],
        evidence: passed ? traceMarkers.slice(0, 5) : ["No strong traceability markers were detected in sampled files."],
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.security_logging") {
      const loggingMarkers = texts.filter((item) => /logg|audit|telemetry|monitor/i.test(item.text)).map((item) => item.relative);
      const passed = loggingMarkers.length > 0 || runtimeLogEvidence.length > 0;
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "partial",
        score_awarded: passed ? control.weight : Math.round(control.weight / 2),
        rationale: [passed ? "Security-relevant logging or monitoring markers were detected in code or runtime output." : "Security logging markers were sparse or absent in sampled files and bounded runtime output."],
        evidence: passed ? [...loggingMarkers.slice(0, 5), ...runtimeEvidenceSummaries(runtimeLogEvidence)] : ["No strong logging or monitoring markers were detected in sampled files."],
        sources: ["repo-analysis", ...(runtimeLogEvidence.length ? ["runtime-validation"] : [])]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.eval_harness_presence") {
      const evalMarkers = texts.filter((item) => /eval|benchmark|red.?team|promptfoo|garak|inspect|pyrit|test/i.test(item.relative) || /eval|benchmark|prompt injection|red team/i.test(item.text)).map((item) => item.relative);
      const runtimeValidationEvidence = [...completedRuntimeTests, ...completedRuntimeProbes, ...completedRuntimeBuilds];
      const passed = evalMarkers.length > 0 || runtimeValidationEvidence.length > 0;
      const runtimeFailureFindingIds: string[] = [];
      if (failedRuntimeInstalls.length > 0) {
        runtimeFailureFindingIds.push(addFinding(findings, {
          title: "Bounded runtime install step failed or was blocked",
          severity: "medium",
          category: "runtime_install_failure",
          description: "The run attempted bounded dependency installation inside the runtime validation path, but the install phase failed or was blocked. That reduces confidence in reproducibility and operational readiness for the target.",
          evidence: runtimeEvidenceSummaries(failedRuntimeInstalls),
          public_safe: true,
          confidence: 0.84,
          score_impact: control.weight,
          source: "tool",
          control_ids: [control.control_id, "nist_ssdf.automated_security_checks"],
          standards_refs: [control.standard_ref, "NIST SSDF / Automated security checks"]
        }));
      }
      if (failedRuntimeBuilds.length > 0) {
        runtimeFailureFindingIds.push(addFinding(findings, {
          title: "Bounded runtime build step failed or was blocked",
          severity: "high",
          category: "runtime_build_failure",
          description: "The run attempted a bounded build step for the target, but the build failed or was blocked. That indicates the runtime-backed validation path is not reproducible or operationally healthy enough for stronger audit confidence.",
          evidence: runtimeEvidenceSummaries(failedRuntimeBuilds),
          public_safe: true,
          confidence: 0.88,
          score_impact: control.weight,
          source: "tool",
          control_ids: [control.control_id, "nist_ssdf.automated_security_checks"],
          standards_refs: [control.standard_ref, "NIST SSDF / Automated security checks"]
        }));
      }
      if (failedRuntimeTests.length > 0) {
        runtimeFailureFindingIds.push(addFinding(findings, {
          title: "Bounded runtime test step failed or was blocked",
          severity: "high",
          category: "runtime_test_failure",
          description: "The run detected a bounded test phase, but the test execution failed or was blocked. That weakens confidence in repeatable validation claims and indicates operational issues that should be resolved before relying on test-backed assurances.",
          evidence: runtimeEvidenceSummaries(failedRuntimeTests),
          public_safe: true,
          confidence: 0.86,
          score_impact: control.weight,
          source: "tool",
          control_ids: [control.control_id, "nist_ssdf.automated_security_checks"],
          standards_refs: [control.standard_ref, "NIST SSDF / Automated security checks"]
        }));
      }
      if (runtimeProbeFailures.length > 0) {
        runtimeFailureFindingIds.push(addFinding(findings, {
          title: "Bounded runtime service probe did not reach a healthy endpoint",
          severity: "high",
          category: "runtime_service_unhealthy",
          description: "The run attempted a bounded runtime service probe, but it failed or was blocked before reaching a healthy endpoint. That indicates the target did not become operationally healthy enough for runtime-backed validation.",
          evidence: runtimeEvidenceSummaries(runtimeProbeFailures),
          public_safe: true,
          confidence: 0.9,
          score_impact: control.weight,
          source: "tool",
          control_ids: [control.control_id],
          standards_refs: [control.standard_ref]
        }));
      }
      if (!passed && failedRuntimeChecks.length > 0) {
        runtimeFailureFindingIds.push(addFinding(findings, {
          title: "Bounded runtime validation did not complete cleanly",
          severity: runtimeProbeFailures.length > 0 ? "high" : "medium",
          category: "runtime_validation",
          description: "The run attempted bounded build, test, or runtime validation, but one or more runtime validation steps failed or were blocked. That reduces confidence in recurring validation readiness and may indicate operational issues in the target.",
          evidence: runtimeEvidenceSummaries(failedRuntimeChecks),
          public_safe: true,
          confidence: 0.8,
          score_impact: control.weight,
          source: "tool",
          control_ids: [control.control_id],
          standards_refs: [control.standard_ref]
        }));
      }
      controlResults.push(makeControlResult(control, {
        status: passed ? (failedRuntimeChecks.length > 0 ? "partial" : "pass") : "partial",
        score_awarded: passed ? (failedRuntimeChecks.length > 0 ? Math.round(control.weight * 0.75) : control.weight) : Math.round(control.weight / 2),
        rationale: [passed ? (failedRuntimeChecks.length > 0 ? "Evaluation or validation harness markers were detected, but bounded runtime validation also surfaced operational gaps that should be reviewed." : "Evaluation or validation harness markers were detected in code or bounded runtime execution.") : failedRuntimeChecks.length > 0 ? "Evaluation harness evidence was limited, but bounded runtime validation attempted build, test, or runtime probing and surfaced operational gaps that should be reviewed." : "Evaluation harness evidence was limited for recurring reassessment."],
        evidence: passed ? [...evalMarkers.slice(0, 5), ...runtimeEvidenceSummaries(runtimeValidationEvidence), ...runtimeEvidenceSummaries(failedRuntimeChecks)] : [...runtimeEvidenceSummaries(failedRuntimeChecks), "No clear eval harness markers were detected in sampled files."].filter(Boolean),
        finding_ids: runtimeFailureFindingIds,
        sources: ["repo-analysis", ...(runtimeValidationEvidence.length || failedRuntimeChecks.length ? ["runtime-validation"] : [])]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.agent_tool_allowlist") {
      const hasToolSurface = hasAny(args.analysis.agentic_capabilities, ["shell_tool", "file_write_tool", "network_tool", "browser_tool", "mcp_tool_surface"]) || args.analysis.tool_execution_indicators.length > 0;
      const hasBoundary = allowlistEvidence.length > 0 || approvalGateEvidence.length > 0 || hasAny(args.analysis.agentic_control_indicators, ["tool_allowlist", "approval_gate"]);
      const passed = hasToolSurface && hasBoundary;
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "Agent tool surface lacks clear allowlist or approval gate evidence",
        severity: hasToolSurface ? "high" : "medium",
        category: "agent_tool_policy",
        description: "Static analysis detected agent/tool capability surfaces, but did not find strong evidence of tool allowlists, deny rules, or human approval gates for sensitive actions.",
        evidence: [...agenticSignalEvidence, ...allowlistEvidence.slice(0, 3), ...approvalGateEvidence.slice(0, 3)],
        public_safe: true,
        confidence: 0.78,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id, "owasp_agentic.tool_misuse_boundary"],
        standards_refs: [control.standard_ref, "OWASP Agentic Applications / Tool misuse boundaries"]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : hasToolSurface ? "fail" : "partial",
        score_awarded: passed ? control.weight : hasToolSurface ? 0 : Math.round(control.weight / 2),
        rationale: [passed ? "Tool allowlist or approval gate evidence was detected for agentic tool surfaces." : "Tool allowlist or approval gate evidence was insufficient for detected agentic surfaces."],
        evidence: [...allowlistEvidence.slice(0, 5), ...approvalGateEvidence.slice(0, 5), ...agenticSignalEvidence],
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.agent_permission_boundaries") {
      const riskyCapabilities = agentDangerousExecMatches.length > 0;
      const passed = agentDangerousExecMatches.length === 0;
      const findingIds = passed ? [] : [ensureAgentExecutionBoundaryFinding()];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "Permission-boundary evidence was detected or no risky agentic capability was found." : "Risky agentic capability was detected without visible permission-boundary evidence."],
        evidence: [...sandboxMentions.slice(0, 5), ...agentDangerousExecMatches.slice(0, 5)],
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.untrusted_content_prompt_injection") {
      const untrustedContentSurface = hasAny(args.analysis.agentic_risk_indicators, ["untrusted_content_ingest"]) || texts.some((item) => /webpage|scrape|retrieval|document loader|external content|browser content/i.test(item.text));
      const hasPromptDefense = promptInjectionEvidence.length > 0 || hasAny(args.analysis.agentic_control_indicators, ["prompt_injection_filter"]);
      const passed = !untrustedContentSurface || hasPromptDefense;
      controlResults.push(makeControlResult(control, {
        assessability: passed ? "assessed" : "not_assessed",
        status: passed ? "pass" : "not_assessed",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "Prompt-injection handling evidence was present or no untrusted content ingestion surface was detected." : "Untrusted-content indicators were detected, but static evidence did not establish source-to-prompt or source-to-tool dataflow."],
        evidence: [...promptInjectionEvidence.slice(0, 5), ...agenticSignalEvidence],
        finding_ids: [],
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.secret_env_isolation") {
      const envSurface = envAccessEvidence.length > 0 || hasAny(args.analysis.agentic_risk_indicators, ["secret_handling_surface"]);
      const hasRedaction = secretRedactionEvidence.length > 0 || hasAny(args.analysis.agentic_control_indicators, ["secret_redaction"]);
      const passed = !envSurface || hasRedaction;
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "Agent environment or secret access lacks redaction/isolation evidence",
        severity: "high",
        category: "secret_env_isolation",
        description: "Static analysis detected environment or credential access in an AI/agent context without visible secret redaction, masking, or environment isolation controls.",
        evidence: [...envAccessEvidence.slice(0, 5), ...secretRedactionEvidence.slice(0, 3)],
        public_safe: false,
        confidence: 0.74,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id, "owasp_llm.sensitive_information_disclosure"],
        standards_refs: [control.standard_ref, "OWASP LLM Top 10 / Sensitive Information Disclosure"]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "Secret redaction/isolation evidence was present or no environment secret surface was detected." : "Environment or secret access was detected without redaction/isolation evidence."],
        evidence: [...secretRedactionEvidence.slice(0, 5), ...envAccessEvidence.slice(0, 5)],
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.mcp_plugin_permissions") {
      const hasMcpSurface = args.targetClass === "mcp_server_plugin_skill_package" || hasAny(args.analysis.ai_frameworks, ["mcp"]) || hasAny(args.analysis.agentic_capabilities, ["mcp_tool_surface"]);
      const hasPolicy = mcpPermissionPolicyEvidence.length > 0 || allowlistEvidence.length > 0 || approvalGateEvidence.length > 0;
      const passed = !hasMcpSurface || hasPolicy;
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "MCP/plugin tool surface lacks explicit permission policy evidence",
        severity: "high",
        category: "mcp_permission_surface",
        description: "The repository appears to expose MCP, plugin, or skill tools, but static analysis did not find clear permission, scope, allowlist, or approval policy evidence for externally callable capabilities.",
        evidence: [...mcpPermissionEvidence.slice(0, 5), ...agenticSignalEvidence],
        public_safe: true,
        confidence: 0.78,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id, "owasp_agentic.tool_misuse_boundary"],
        standards_refs: [control.standard_ref, "OWASP Agentic Applications / Tool misuse boundaries"]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "MCP/plugin permission policy evidence was present or no MCP surface was detected." : "MCP/plugin surface was detected without explicit permission policy evidence."],
        evidence: [...mcpPermissionEvidence.slice(0, 5), ...mcpPermissionPolicyEvidence.slice(0, 3), ...allowlistEvidence.slice(0, 3), ...approvalGateEvidence.slice(0, 3)],
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.mcp_path_boundaries") {
      const passed = mcpPathBoundaryMatches.length === 0;
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "MCP git_add accepts paths without an enforced repository boundary",
        severity: "medium",
        category: "mcp_path_boundary",
        description: "The MCP git_add tool passes caller-supplied paths to GitPython's index API without using a repository-boundary-enforcing Git CLI path operation, allowing traversal outside the intended working tree.",
        evidence: mcpPathBoundaryMatches.slice(0, 5),
        public_safe: true,
        confidence: 0.94,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id, "owasp_agentic.tool_misuse_boundary", "mitre_atlas.tool_misuse_mitigation"],
        standards_refs: [control.standard_ref, "OWASP Agentic Applications / Tool misuse boundaries", "MITRE ATLAS / Tool misuse mitigation"]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "No known unsafe MCP git_add path-boundary pattern was detected." : "MCP git_add uses repo.index.add with caller-supplied paths without an enforced repository boundary."],
        evidence: passed ? ["No unsafe repo.index.add(files) git_add pattern detected in sampled Python sources."] : mcpPathBoundaryMatches.slice(0, 5),
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.file_payload_path_validation") {
      const passed = filePayloadPathValidationMatches.length === 0;
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "File payload metadata can bypass server-side path validation",
        severity: "medium",
        category: "file_payload_path_validation",
        description: "Gradio file payloads can omit the trusted-file metadata marker and still be instantiated with a default marker, allowing a caller-controlled server path to bypass the cache path validation boundary.",
        evidence: filePayloadPathValidationMatches,
        public_safe: true,
        confidence: 0.96,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id, "owasp_llm.sensitive_information_disclosure"],
        standards_refs: [control.standard_ref, "OWASP LLM Top 10 / Sensitive Information Disclosure"]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "No known file-payload metadata bypass pattern was detected." : "Caller file payloads can receive trusted metadata by default without proving that the client supplied it."],
        evidence: passed ? ["No vulnerable Gradio FileData metadata-validation pattern detected in sampled Python sources."] : filePayloadPathValidationMatches,
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "owasp_api.sensitive_operation_authentication") {
      if (!sensitiveOperationAuthentication.present) {
        controlResults.push(makeControlResult(control, {
          applicability: "not_applicable",
          assessability: "not_assessed",
          status: "not_applicable",
          score_awarded: 0,
          rationale: ["No Langflow code-validation endpoint matched the endpoint-specific deterministic evaluator."],
          evidence: ["The evaluator does not infer authentication posture for unrelated API operations."],
          sources: ["repo-analysis"]
        }));
        continue;
      }

      const findingIds = sensitiveOperationAuthentication.authenticated ? [] : [addFinding(findings, {
        title: "Langflow code-validation endpoint lacks authentication",
        severity: "critical",
        category: "api_broken_authentication",
        description: "The Langflow POST /code route accepts caller-supplied code and passes it to validate_code without requiring an authenticated user in the endpoint signature. Static evidence establishes the missing authentication boundary; runtime exploitability is not asserted by this check.",
        evidence: sensitiveOperationAuthentication.evidence,
        public_safe: true,
        confidence: 0.98,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })];
      controlResults.push(makeControlResult(control, {
        status: sensitiveOperationAuthentication.authenticated ? "pass" : "fail",
        score_awarded: sensitiveOperationAuthentication.authenticated ? control.weight : 0,
        rationale: [sensitiveOperationAuthentication.authenticated
          ? "The sensitive code-validation operation requires an authenticated active user."
          : "The sensitive code-validation operation has no authenticated-user dependency."],
        evidence: sensitiveOperationAuthentication.evidence,
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.browser_automation_safety") {
      const hasBrowserSurface = hasAny(args.analysis.agentic_capabilities, ["browser_tool"]) || hasAny(args.analysis.ai_frameworks, ["browser_automation"]) || browserSafetyEvidence.length > 0;
      const hasSafety = browserPolicyEvidence.length > 0 || allowlistEvidence.length > 0 || promptInjectionEvidence.length > 0;
      const passed = !hasBrowserSurface || hasSafety;
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "Browser automation surface lacks visible safety policy",
        severity: "medium",
        category: "browser_automation_safety",
        description: "Static analysis detected browser automation capability without clear navigation, download, credential, or untrusted-page instruction safety controls.",
        evidence: browserSafetyEvidence.slice(0, 5),
        public_safe: true,
        confidence: 0.72,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [passed ? "Browser automation safety evidence was present or no browser automation surface was detected." : "Browser automation was detected without visible safety policy evidence."],
        evidence: [...browserSafetyEvidence.slice(0, 5), ...browserPolicyEvidence.slice(0, 3), ...allowlistEvidence.slice(0, 3), ...promptInjectionEvidence.slice(0, 3)],
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.telemetry_log_redaction") {
      const hasTelemetrySurface = telemetryEvidence.length > 0 || hasAny(args.analysis.agentic_control_indicators, ["telemetry_redaction"]);
      const passed = !hasTelemetrySurface || telemetryRedactionEvidence.length > 0 || hasAny(args.analysis.agentic_control_indicators, ["telemetry_redaction", "secret_redaction"]);
      const findingIds = passed ? [] : [addFinding(findings, {
        title: "Telemetry/logging surface lacks redaction evidence",
        severity: "medium",
        category: "telemetry_log_redaction",
        description: "Static analysis detected logging, trace, or telemetry surfaces without clear redaction or minimization evidence for prompts, tool arguments, secrets, or user data.",
        evidence: telemetryEvidence.slice(0, 5),
        public_safe: true,
        confidence: 0.7,
        score_impact: control.weight,
        source: "heuristic",
        control_ids: [control.control_id],
        standards_refs: [control.standard_ref]
      })];
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "partial",
        score_awarded: passed ? control.weight : Math.round(control.weight / 2),
        rationale: [passed ? "Telemetry/log redaction or minimization evidence was detected." : "Telemetry/logging exists, but redaction evidence was limited."],
        evidence: [...telemetryRedactionEvidence.slice(0, 5), ...telemetryEvidence.slice(0, 5)],
        finding_ids: findingIds,
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "harness_internal.architecture_evidence") {
      const architectureMarkers = texts.filter((item) => /architecture|threat model|trust boundary|system overview|design/i.test(item.text)).map((item) => item.relative);
      const passed = architectureMarkers.length > 0 || args.analysis.security_docs.length > 0;
      controlResults.push(makeControlResult(control, {
        status: passed ? "pass" : "partial",
        score_awarded: passed ? control.weight : Math.round(control.weight / 2),
        rationale: [passed ? "Architecture or system-context evidence was detected." : "Architecture evidence was limited in sampled docs and configs."],
        evidence: passed ? [...architectureMarkers.slice(0, 5), ...args.analysis.security_docs.slice(0, 2)] : ["No clear architecture or threat-model evidence was detected in sampled files."],
        sources: ["repo-analysis"]
      }));
      continue;
    }

    if (control.control_id === "owasp_llm.prompt_injection_guardrails" || control.control_id === "owasp_agentic.tool_misuse_boundary" || control.control_id === "mitre_atlas.tool_misuse_mitigation") {
      const applicable = agenticTarget;
      if (!applicable) {
        controlResults.push(makeControlResult(control, {
          applicability: "not_applicable",
          assessability: "not_assessed",
          status: "not_applicable",
          score_awarded: 0,
          rationale: ["Repository does not appear to expose an agentic or MCP-style tool-use surface for this control."],
          sources: ["planner"]
        }));
        continue;
      }
      const assessable = sandboxMentions.length > 0 || agentDangerousExecMatches.length > 0;
      const passed = assessable && sandboxMentions.length > 0 && agentDangerousExecMatches.length === 0;
      const findingIds = !assessable || passed ? [] : [ensureAgentExecutionBoundaryFinding()];
      controlResults.push(makeControlResult(control, {
        assessability: assessable ? "assessed" : "not_assessed",
        status: !assessable ? "not_assessed" : passed ? "pass" : "fail",
        score_awarded: passed ? control.weight : 0,
        rationale: [!assessable ? "Agentic applicability was established, but static evidence did not connect a dangerous execution path to the agent surface." : passed ? "Visible guardrail or sandbox markers were detected around agentic surfaces." : "An agentic execution path was connected to shell execution without visible boundary evidence."],
        evidence: [...sandboxMentions.slice(0, 5), ...agentDangerousExecMatches.slice(0, 5)],
        finding_ids: findingIds,
        sources: ["repo-analysis", "threat-model"]
      }));
      continue;
    }

    controlResults.push(makeControlResult(control, {
      assessability: "not_assessed",
      status: "not_assessed",
      score_awarded: 0,
      rationale: ["No evaluator was implemented for this control in the current static audit path."],
      sources: ["planner"]
    }));
  }

  if (completedRuntimeProbes.length > 0) {
    observations.push({
      observation_id: createId("obs"),
      title: "Runtime service probing reached a healthy endpoint",
      summary: `Bounded runtime probing successfully reached ${completedRuntimeProbes.length} service probe step(s).`,
      evidence: runtimeEvidenceSummaries(completedRuntimeProbes)
    });
  }

  if (runtimeExecutionFailures.length > 0) {
    observations.push({
      observation_id: createId("obs"),
      title: "Runtime validation surfaced operational attention items",
      summary: `Bounded runtime validation reported ${runtimeExecutionFailures.length} failed or blocked install, build, test, or runtime-probe step(s).`,
      evidence: runtimeEvidenceSummaries(runtimeExecutionFailures)
    });
  }

  if (nonAgentDangerousExecMatches.length > 0) {
    observations.push({
      observation_id: createId("obs"),
      title: "Direct shell-execution patterns require application-security triage",
      summary: `Static analysis found ${nonAgentDangerousExecMatches.length} shell-execution pattern(s) that were not connected to an agent or MCP execution path. They are retained as triage evidence without borrowing agentic control mappings or assigning a publishable severity.`,
      evidence: nonAgentDangerousExecMatches.slice(0, 8)
    });
  }

  for (const semgrepFinding of semgrepFindingList.slice(0, 5)) {
    const message = semgrepFinding?.extra?.message ?? semgrepFinding?.check_id ?? "Semgrep finding";
    const severity = typeof semgrepFinding?.extra?.severity === "string" && /error|high/i.test(semgrepFinding.extra.severity) ? "high" : "medium";
    addFinding(findings, {
      title: `Semgrep: ${message}`,
      severity,
      category: "static_analysis",
      description: "Semgrep identified a code pattern that should be reviewed as part of the standards-based audit.",
      evidence: [`${semgrepFinding?.path ?? "unknown"}: ${message}`],
      public_safe: true,
      confidence: 0.7,
      score_impact: severity === "high" ? 6 : 4,
      source: "tool",
      control_ids: ["nist_ssdf.automated_security_checks"],
      standards_refs: ["NIST SSDF / Automated security checks"]
    });
  }

  const trivyHighIssues = trivyResultList.flatMap((result: any) => {
    const vulnerabilities = Array.isArray(result?.Vulnerabilities) ? result.Vulnerabilities : [];
    const misconfigurations = Array.isArray(result?.Misconfigurations) ? result.Misconfigurations : [];
    return [...vulnerabilities, ...misconfigurations].filter((item: any) => /HIGH|CRITICAL/i.test(item?.Severity ?? ""));
  }).slice(0, 5);
  for (const issue of trivyHighIssues) {
    addFinding(findings, {
      title: `Trivy: ${issue?.Title ?? issue?.VulnerabilityID ?? "High-severity issue"}`,
      severity: /CRITICAL/i.test(issue?.Severity ?? "") ? "critical" : "high",
      category: "dependency_or_misconfig",
      description: "Trivy reported a high-severity dependency or configuration issue during the static audit.",
      evidence: [issue?.PkgName ?? issue?.Type ?? "unknown component", issue?.Severity ?? "unknown severity"].filter(Boolean),
      public_safe: true,
      confidence: 0.82,
      score_impact: /CRITICAL/i.test(issue?.Severity ?? "") ? 8 : 6,
      source: "tool",
      control_ids: ["openssf.pinned_dependencies", "nist_ssdf.automated_security_checks"],
      standards_refs: ["OpenSSF Scorecard / Pinned-Dependencies", "NIST SSDF / Automated security checks"]
    });
  }

  observations.push({
    observation_id: createId("obs"),
    title: "Audit scope observation",
    summary: `Static run assessed ${controlResults.filter((item) => item.status !== "not_applicable").length} in-scope controls across ${new Set(controlResults.filter((item) => item.status !== "not_applicable").map((item) => item.framework)).size} frameworks.`,
    evidence: [args.methodology.version]
  });
  observations.push({
    observation_id: createId("obs"),
    title: "Threat concentration",
    summary: `Threat-model focus areas were ${args.threatModel.framework_focus.join(", ") || "not specified"}, with high-risk components including ${args.threatModel.high_risk_components.slice(0, 3).join(", ") || "none"}.`,
    evidence: args.threatModel.high_risk_components.slice(0, 5)
  });

  const frameworkMap = new Map<string, FrameworkScore>();
  for (const result of controlResults) {
    if (!frameworkMap.has(result.framework)) {
      frameworkMap.set(result.framework, {
        framework: result.framework,
        score: 0,
        max_score: 0,
        percentage: 0,
        assessed_controls: 0,
        applicable_controls: 0,
        control_ids: []
      });
    }
    const score = frameworkMap.get(result.framework)!;
    score.control_ids.push(result.control_id);
    if (result.applicability === "applicable") {
      score.applicable_controls += 1;
      score.max_score += result.max_score;
      score.score += result.score_awarded;
      if (result.assessability !== "not_assessed") {
        score.assessed_controls += 1;
      }
    }
  }

  const frameworkScores = [...frameworkMap.values()].map((frameworkScore) => ({
    ...frameworkScore,
    percentage: frameworkScore.max_score > 0 ? clampScore((frameworkScore.score / frameworkScore.max_score) * 100) : 0
  }));
  const overallNumerator = frameworkScores.reduce((sum, item) => sum + item.score, 0);
  const overallDenominator = frameworkScores.reduce((sum, item) => sum + item.max_score, 0);
  const overallScore = overallDenominator > 0 ? clampScore((overallNumerator / overallDenominator) * 100) : 0;
  const dimensionScores = computeBaselineDimensionScores(controlResults, args.controlCatalog);
  const staticScore = computeStaticBaselineScore(dimensionScores);
  const highSeverityCount = findings.filter((finding) => finding.severity === "high" || finding.severity === "critical").length;

  return {
    findings,
    controlResults,
    observations,
    dimensionScores,
    staticScore,
    scoreSummary: {
      methodology_version: args.methodology.version,
      overall_score: overallScore,
      rating: ratingForScore(overallScore),
      framework_scores: frameworkScores,
      limitations: [
        "Static mode does not execute target code, build pipelines, or runtime validation paths.",
        "Controls that depend on hosted repository settings or build provenance remain not_assessed in this run.",
        "Tool results depend on local binary availability; skipped tools reduce assessability but should not be mistaken for passing posture."
      ],
      leaderboard_summary: `${args.analysis.project_name} received a ${overallScore}/100 standards-based static audit score (${ratingForScore(overallScore)}). ${findings.length} findings were emitted, including ${highSeverityCount} high or critical issues, from assessed controls across ${frameworkScores.length} framework groups.`
    }
  };
}
