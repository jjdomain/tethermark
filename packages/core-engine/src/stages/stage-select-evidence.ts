import type { AgentRuntime } from "../../../agent-runtime/src/index.js";
import { buildEvalSelectionContext } from "../agent-context-builders.js";
import type { AuditPolicyArtifact, AuditRequest, EvalSelectionArtifact, MethodologyArtifact, PlannerArtifact, RepoContextArtifact, SandboxSession, StandardControlDefinition, TargetDescriptor, TargetProfileArtifact, ThreatModelArtifact } from "../contracts.js";
import { buildFixedCalibrationEvidenceSelection } from "../evidence-selection-policy.js";
import { getEvidenceProviders } from "../evidence-providers.js";

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

export function normalizeEvalSelectionForExecution(selection: EvalSelectionArtifact, request: AuditRequest): EvalSelectionArtifact {
  const providers = getEvidenceProviders();
  const baselineProviderIds = new Set(providers.filter((provider) => provider.supports_modes.includes("static")).map((provider) => provider.id));
  const runMode = request.run_mode ?? "static";
  const runtimeProviderIds = new Set(
    runMode === "static"
      ? []
      : providers.filter((provider) => provider.supports_modes.includes(runMode) && !provider.supports_modes.includes("static")).map((provider) => provider.id)
  );
  const requestedProviderIds = uniqueStrings([
    ...selection.baseline_tools,
    ...selection.runtime_tools,
    ...selection.control_tool_map.flatMap((mapping) => mapping.tools)
  ]);
  const baselineTools = uniqueStrings(["repo_analysis", ...selection.baseline_tools.filter((providerId) => baselineProviderIds.has(providerId))]);
  const runtimeTools = uniqueStrings(selection.runtime_tools.filter((providerId) => runtimeProviderIds.has(providerId)));
  const allowedProviderIds = new Set([...baselineTools, ...runtimeTools]);
  const droppedProviderIds = requestedProviderIds.filter((providerId) => !allowedProviderIds.has(providerId));

  return {
    ...selection,
    baseline_tools: baselineTools,
    runtime_tools: runtimeTools,
    control_tool_map: selection.control_tool_map.map((mapping) => {
      const tools = uniqueStrings(mapping.tools.filter((providerId) => allowedProviderIds.has(providerId)));
      return {
        ...mapping,
        tools: tools.length ? tools : ["repo_analysis"]
      };
    }),
    rationale: droppedProviderIds.length
      ? [...selection.rationale, `Ignored unregistered or mode-incompatible evidence providers: ${droppedProviderIds.join(", ")}.`]
      : selection.rationale
  };
}

export async function stageSelectEvidence(args: {
  runId: string;
  request: AuditRequest;
  auditPolicy: AuditPolicyArtifact;
  sandbox: SandboxSession;
  target: TargetDescriptor;
  analysis: any;
  repoContext: RepoContextArtifact;
  targetProfile: TargetProfileArtifact;
  plannerArtifact: PlannerArtifact;
  threatModel: ThreatModelArtifact;
  controlCatalog: StandardControlDefinition[];
  methodology: MethodologyArtifact;
  agentRuntime: AgentRuntime;
  skepticFeedback?: unknown;
}): Promise<EvalSelectionArtifact> {
  const fixedCalibrationSelection = buildFixedCalibrationEvidenceSelection({
    request: args.request,
    plannerArtifact: args.plannerArtifact,
    controlCatalog: args.controlCatalog
  });
  if (fixedCalibrationSelection) return fixedCalibrationSelection;

  const call = await args.agentRuntime.callAgent<EvalSelectionArtifact>({
    runId: args.runId,
    agentName: "eval_selection_agent",
    context: buildEvalSelectionContext({
      request: args.request,
      target: args.target,
      analysis: args.analysis,
      repoContext: args.repoContext,
      targetProfile: args.targetProfile,
      plannerArtifact: args.plannerArtifact,
      threatModel: args.threatModel,
      controlCatalog: args.controlCatalog,
      methodology: args.methodology,
      auditPolicy: args.auditPolicy,
      skepticFeedback: args.skepticFeedback
    }),
    inputArtifacts: ["analysis.json", "repo-context.json", "planner-artifact.json", "threat-model.json", "methodology.json", "audit-policy.json"],
    outputArtifact: args.skepticFeedback ? "eval-selection-corrected.json" : "eval-selection.json",
    stageName: "select_evidence"
  });
  return normalizeEvalSelectionForExecution(call.artifact, args.request);
}
