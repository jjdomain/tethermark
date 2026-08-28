import type { AuditRequest, EvalSelectionArtifact, PlannerArtifact, StandardControlDefinition } from "./contracts.js";

export const CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION = "2026-08-19.calibration-evidence-plan.v1" as const;
export const CALIBRATION_STATIC_EVIDENCE_PROVIDER_IDS = [
  "repo_analysis",
  "scorecard",
  "semgrep",
  "trivy"
] as const;

function requestedCalibrationPolicyVersion(request: AuditRequest): string | null {
  const directValue = request.hints && typeof request.hints === "object"
    ? (request.hints as Record<string, unknown>).evidence_plan_policy_version
    : null;
  if (typeof directValue === "string" && directValue.trim()) return directValue.trim();
  const benchmark = request.hints?.benchmark;
  if (!benchmark || typeof benchmark !== "object") return null;
  const value = (benchmark as Record<string, unknown>).evidence_plan_policy_version;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getFixedCalibrationEvidenceProviderIds(request: AuditRequest): string[] | null {
  const requestedVersion = requestedCalibrationPolicyVersion(request);
  if (!requestedVersion) return null;
  if (requestedVersion !== CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION) {
    throw new Error(`Unsupported calibration evidence-plan policy version '${requestedVersion}'.`);
  }
  if ((request.run_mode ?? "static") !== "static") {
    throw new Error("The fixed calibration evidence-plan policy currently supports static audits only.");
  }
  return [...CALIBRATION_STATIC_EVIDENCE_PROVIDER_IDS];
}

export function buildFixedCalibrationEvidenceSelection(args: {
  request: AuditRequest;
  plannerArtifact: PlannerArtifact;
  controlCatalog: StandardControlDefinition[];
}): EvalSelectionArtifact | null {
  const fixedProviderIds = getFixedCalibrationEvidenceProviderIds(args.request);
  if (!fixedProviderIds) return null;

  const catalogControlIds = new Set(args.controlCatalog.map((control) => control.control_id));
  const applicableControlIds = [...new Set(args.plannerArtifact.applicable_control_ids)]
    .filter((controlId) => catalogControlIds.has(controlId))
    .sort((left, right) => left.localeCompare(right));
  const baselineTools = fixedProviderIds;

  return {
    baseline_tools: baselineTools,
    runtime_tools: [],
    custom_eval_packs: [],
    validation_candidates: [],
    control_tool_map: applicableControlIds.map((controlId) => ({
      control_id: controlId,
      tools: [...baselineTools],
      rationale: `Required by fixed calibration evidence plan ${CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION}.`
    })),
    rationale: [
      `Applied fixed calibration evidence plan ${CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION}.`,
      "Every applicable control receives the same non-downgradable static provider set; unavailable providers must report an explicit skipped or failed execution."
    ]
  };
}
