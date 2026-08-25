import type { EvidenceExecutionRecord, EvidenceLocation, EvidenceRecord } from "./contracts.js";
import { createId } from "./utils.js";

export type RuntimeObservationOutcome = "finding" | "no_finding_observed" | "observed" | "inconclusive" | "error";

export interface NormalizedRuntimeObservation {
  observation_id: string;
  probe_id: string;
  title: string;
  outcome: RuntimeObservationOutcome;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  control_ids: string[];
  inconclusive_reason: string | null;
  locations: EvidenceLocation[];
}

export interface NormalizedRuntimeCoverage {
  status: "complete" | "partial" | "not_run";
  adequate: boolean;
  expected: number;
  attempted: number;
  completed: number;
  findings: number;
  inconclusive: number;
  errors: number;
  inconclusive_reasons: string[];
}

export interface NormalizedRuntimeEvaluation {
  provider_id: string;
  worker: string;
  eval_pack_id: string | null;
  eval_pack_version: string | null;
  control_ids: string[];
  coverage: NormalizedRuntimeCoverage;
  observations: NormalizedRuntimeObservation[];
  limitations: string[];
}

const RUNTIME_WORKERS = new Set(["inspect", "garak", "pyrit"]);
const ALLOWED_OUTCOMES = new Set<RuntimeObservationOutcome>([
  "finding",
  "no_finding_observed",
  "observed",
  "inconclusive",
  "error"
]);

const PACK_CONTROL_IDS: Record<string, string[]> = {
  "tethermark.inspect.ai-security-boundary": [
    "runtime.prompt_injection_resistance",
    "runtime.secret_retrieval_isolation",
    "runtime.tool_authorization_boundary"
  ],
  "tethermark.inspect.ai-data-boundary": [
    "runtime.indirect_prompt_injection_resistance",
    "runtime.data_exfiltration_boundary",
    "runtime.cross_session_memory_isolation",
    "runtime.secret_retrieval_isolation"
  ],
  "tethermark.inspect.mcp-boundary": ["runtime.mcp_plugin_boundary_abuse"],
  "tethermark.inspect.unsafe-output-boundary": ["runtime.unsafe_output_handling"],
  "tethermark.inspect.excessive-agency-boundary": ["runtime.excessive_agency_boundary"],
  "tethermark.inspect.resource-limit-boundary": ["runtime.resource_exhaustion_limits"],
  "tethermark.inspect.security-telemetry-boundary": ["runtime.security_telemetry_completeness"],
  "tethermark.garak.prompt-injection": ["runtime.prompt_injection_resistance"],
  "tethermark.pyrit.adversarial-boundary": [
    "runtime.prompt_injection_resistance",
    "runtime.secret_retrieval_isolation"
  ]
};

const PACK_EXPECTED_SAMPLES: Record<string, number> = {
  "tethermark.inspect.http-baseline": 2,
  "tethermark.inspect.ai-security-boundary": 2,
  "tethermark.inspect.ai-data-boundary": 2,
  "tethermark.inspect.mcp-boundary": 3,
  "tethermark.inspect.unsafe-output-boundary": 2,
  "tethermark.inspect.excessive-agency-boundary": 2,
  "tethermark.inspect.resource-limit-boundary": 2,
  "tethermark.inspect.security-telemetry-boundary": 2,
  "tethermark.garak.prompt-injection": 2,
  "tethermark.pyrit.adversarial-boundary": 2
};

function uniqueStrings(values: unknown[], limit = 50): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))].slice(0, limit);
}

function safeText(value: unknown, fallback: string, limit = 800): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/TM_SYNTHETIC_(?:SECRET|MEMORY|RECORD)_[A-Za-z0-9_-]+/g, "[REDACTED_SYNTHETIC_VALUE]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeSeverity(value: unknown): NormalizedRuntimeObservation["severity"] {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "critical" || normalized === "high" || normalized === "medium" || normalized === "low"
    ? normalized
    : "low";
}

function safeLocation(value: unknown): EvidenceLocation | null {
  if (!value || typeof value !== "object") return null;
  const location = value as Record<string, unknown>;
  const label = typeof location.label === "string" ? safeText(location.label, "runtime_probe", 96) : null;
  if (location.source_kind === "uri" && typeof location.uri === "string") {
    try {
      const uri = new URL(location.uri);
      if (uri.protocol !== "http:" && uri.protocol !== "https:") return null;
      uri.username = "";
      uri.password = "";
      uri.search = "";
      uri.hash = "";
      return { source_kind: "uri", uri: uri.toString(), label };
    } catch {
      return null;
    }
  }
  if (location.source_kind === "file" && typeof location.path === "string" && location.path.trim()) {
    return {
      source_kind: "file",
      path: location.path.replace(/\\/g, "/").slice(0, 500),
      line: nonNegativeInteger(location.line),
      column: nonNegativeInteger(location.column),
      end_line: nonNegativeInteger(location.end_line),
      end_column: nonNegativeInteger(location.end_column),
      label
    };
  }
  if (location.source_kind === "symbol" && typeof location.symbol === "string" && location.symbol.trim()) {
    return { source_kind: "symbol", symbol: safeText(location.symbol, "runtime_probe", 200), label };
  }
  return null;
}

function isRuntimeWorkerExecution(execution: EvidenceExecutionRecord): boolean {
  return RUNTIME_WORKERS.has(execution.tool)
    || RUNTIME_WORKERS.has(execution.provider_id)
    || (execution.provider_id === "internal_python_worker" && RUNTIME_WORKERS.has(execution.tool));
}

function expectedControlIds(evalPackId: string | null, allowedControlIds: Set<string>): string[] {
  return uniqueStrings((evalPackId ? PACK_CONTROL_IDS[evalPackId] ?? [] : []).filter((controlId) => allowedControlIds.has(controlId)));
}

export function normalizeRuntimeEvaluation(
  execution: EvidenceExecutionRecord,
  allowedControlIds: string[]
): NormalizedRuntimeEvaluation | null {
  if (!isRuntimeWorkerExecution(execution)) return null;
  const output = execution.parsed && typeof execution.parsed === "object" ? execution.parsed as Record<string, any> : null;
  const allowed = new Set(allowedControlIds.filter((controlId) => controlId.startsWith("runtime.")));
  const evalPackId = typeof output?.eval_pack?.id === "string" ? safeText(output.eval_pack.id, "", 160) || null : null;
  const evalPackVersion = typeof output?.eval_pack?.version === "string" ? safeText(output.eval_pack.version, "", 64) || null : null;
  const packControlIds = expectedControlIds(evalPackId, allowed);
  const rawObservations = Array.isArray(output?.observations) ? output.observations.slice(0, 256) : [];
  const observations: NormalizedRuntimeObservation[] = rawObservations.map((raw, index) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, any> : {};
    const rawOutcome = typeof item.outcome === "string" ? item.outcome as RuntimeObservationOutcome : "error";
    const outcome = ALLOWED_OUTCOMES.has(rawOutcome) ? rawOutcome : "error";
    const directControlIds = uniqueStrings(
      (Array.isArray(item.control_refs) ? item.control_refs : []).filter((controlId: unknown) => typeof controlId === "string" && allowed.has(controlId))
    );
    const probeId = safeText(item.probe_id ?? item.observation_id, `${execution.tool}-probe-${index + 1}`, 160);
    const locations = (Array.isArray(item.evidence_locations) ? item.evidence_locations : [])
      .map(safeLocation)
      .filter((location): location is EvidenceLocation => Boolean(location))
      .slice(0, 10);
    const reason = outcome === "inconclusive"
      ? safeText(item.inconclusive_reason, "runtime_observation_inconclusive", 160)
      : outcome === "error"
        ? safeText(item.inconclusive_reason, ALLOWED_OUTCOMES.has(rawOutcome) ? "runtime_observation_error" : "invalid_outcome_contract", 160)
        : null;
    return {
      observation_id: safeText(item.observation_id, `${execution.provider_id}:${probeId}`, 200),
      probe_id: probeId,
      title: safeText(item.title, `Runtime probe ${probeId}`, 240),
      outcome,
      severity: normalizeSeverity(item.severity),
      summary: safeText(item.summary, "Runtime probe returned no reviewable summary."),
      control_ids: directControlIds.length ? directControlIds : packControlIds,
      inconclusive_reason: reason,
      locations
    };
  });

  const findings = observations.filter((item) => item.outcome === "finding").length;
  const inconclusive = observations.filter((item) => item.outcome === "inconclusive").length;
  const errors = observations.filter((item) => item.outcome === "error").length;
  const completed = observations.filter((item) => ["finding", "no_finding_observed", "observed"].includes(item.outcome)).length;
  const hasCoverageContract = Boolean(output?.coverage && typeof output.coverage === "object" && !Array.isArray(output.coverage));
  const reportedCoverage = hasCoverageContract ? output!.coverage as Record<string, unknown> : {};
  const expected = (evalPackId ? PACK_EXPECTED_SAMPLES[evalPackId] ?? null : null)
    ?? nonNegativeInteger(output?.limits?.probe_count)
    ?? nonNegativeInteger(reportedCoverage.attempted)
    ?? observations.length;
  const reasons: string[] = [];
  if (execution.status !== "completed") reasons.push(`worker_execution_${execution.status}`);
  if (!output) reasons.push("worker_output_missing_or_malformed");
  if (output && output.status !== "completed") reasons.push(`worker_result_${safeText(output.status, "unknown", 80)}`);
  if (!evalPackId || PACK_EXPECTED_SAMPLES[evalPackId] === undefined) reasons.push("unknown_or_missing_eval_pack");
  const reportedExpected = nonNegativeInteger(output?.limits?.probe_count);
  if (reportedExpected !== null && reportedExpected !== expected) reasons.push("expected_sample_contract_mismatch");
  if (expected <= 0) reasons.push("no_expected_samples");
  if (!hasCoverageContract || reportedCoverage.status !== "complete") reasons.push("coverage_contract_missing_or_incomplete");
  if (observations.length === 0) reasons.push("no_runtime_observations");
  if (observations.length < expected || completed < expected) reasons.push("low_sample_count");
  if (observations.length > expected && expected > 0) reasons.push("unexpected_sample_count");
  if (inconclusive > 0) reasons.push(...observations.map((item) => item.inconclusive_reason).filter((item): item is string => Boolean(item)));
  if (errors > 0) reasons.push(...observations.filter((item) => item.outcome === "error").map((item) => item.inconclusive_reason ?? "runtime_observation_error"));
  if (typeof reportedCoverage.status === "string" && reportedCoverage.status !== "complete") {
    reasons.push(`coverage_${safeText(reportedCoverage.status, "unknown", 80)}`);
  }
  const actualCounts: Record<string, number> = { attempted: observations.length, completed, findings, inconclusive, errors };
  for (const [key, actual] of Object.entries(actualCounts)) {
    const reported = nonNegativeInteger(reportedCoverage[key]);
    if (reported === null) reasons.push("coverage_contract_missing_or_incomplete");
    else if (reported !== actual) reasons.push("coverage_contract_mismatch");
  }
  const inconclusiveReasons = uniqueStrings(reasons, 50);
  const adequate = inconclusiveReasons.length === 0;
  const status: NormalizedRuntimeCoverage["status"] = adequate
    ? "complete"
    : execution.status !== "completed" || observations.length === 0
      ? "not_run"
      : "partial";
  const observationControlIds = observations.flatMap((item) => item.control_ids);
  const controlIds = uniqueStrings(packControlIds.length ? packControlIds : observationControlIds.length ? observationControlIds : [...allowed]);

  return {
    provider_id: execution.provider_id,
    worker: RUNTIME_WORKERS.has(execution.tool) ? execution.tool : execution.provider_id,
    eval_pack_id: evalPackId,
    eval_pack_version: evalPackVersion,
    control_ids: controlIds,
    coverage: {
      status,
      adequate,
      expected,
      attempted: observations.length,
      completed,
      findings,
      inconclusive,
      errors,
      inconclusive_reasons: inconclusiveReasons
    },
    observations,
    limitations: uniqueStrings(Array.isArray(output?.limitations) ? output.limitations.map((item: unknown) => safeText(item, "", 500)) : [], 20)
  };
}

export function buildRuntimeEvidenceRecords(args: {
  execution: EvidenceExecutionRecord;
  runId: string;
  laneName?: string;
  allowedControlIds: string[];
}): EvidenceRecord[] {
  const evaluation = normalizeRuntimeEvaluation(args.execution, args.allowedControlIds);
  if (!evaluation) return [];
  const pack = evaluation.eval_pack_id
    ? `${evaluation.eval_pack_id}@${evaluation.eval_pack_version ?? "unknown"}`
    : `${evaluation.worker}:unknown-pack`;
  const coverageRecord: EvidenceRecord = {
    evidence_id: createId("evidence_runtime_coverage"),
    run_id: args.runId,
    lane_name: args.laneName,
    source_type: "tool",
    source_id: `${args.execution.provider_id}:runtime-coverage`,
    control_ids: evaluation.control_ids,
    summary: `${pack} coverage ${evaluation.coverage.status}: ${evaluation.coverage.completed}/${evaluation.coverage.expected} expected samples were assessable; ${evaluation.coverage.findings} findings, ${evaluation.coverage.inconclusive} inconclusive, ${evaluation.coverage.errors} errors.`,
    confidence: evaluation.coverage.adequate ? 0.9 : evaluation.coverage.status === "partial" ? 0.45 : 0.25,
    metadata: {
      category: "runtime_evaluation_coverage",
      provider_id: evaluation.provider_id,
      worker: evaluation.worker,
      eval_pack_id: evaluation.eval_pack_id,
      eval_pack_version: evaluation.eval_pack_version,
      status: evaluation.coverage.status,
      adequate: evaluation.coverage.adequate,
      expected: evaluation.coverage.expected,
      attempted: evaluation.coverage.attempted,
      completed: evaluation.coverage.completed,
      findings: evaluation.coverage.findings,
      inconclusive: evaluation.coverage.inconclusive,
      errors: evaluation.coverage.errors,
      inconclusive_reasons: evaluation.coverage.inconclusive_reasons,
      limitations: evaluation.limitations
    }
  };
  const observationRecords = evaluation.observations.map((observation) => ({
    evidence_id: createId("evidence_runtime_observation"),
    run_id: args.runId,
    lane_name: args.laneName,
    source_type: "tool" as const,
    source_id: `${args.execution.provider_id}:${observation.observation_id}`,
    control_ids: observation.control_ids,
    summary: observation.summary,
    confidence: observation.outcome === "finding" ? 0.9 : observation.outcome === "no_finding_observed" || observation.outcome === "observed" ? 0.7 : 0.35,
    locations: observation.locations,
    metadata: {
      category: "runtime_evaluation_observation",
      provider_id: evaluation.provider_id,
      worker: evaluation.worker,
      eval_pack_id: evaluation.eval_pack_id,
      eval_pack_version: evaluation.eval_pack_version,
      observation_id: observation.observation_id,
      probe_id: observation.probe_id,
      title: observation.title,
      outcome: observation.outcome,
      severity: observation.severity,
      inconclusive_reason: observation.inconclusive_reason,
      coverage_status: evaluation.coverage.status,
      coverage_adequate: evaluation.coverage.adequate
    }
  }));
  return [coverageRecord, ...observationRecords];
}
