import type { AnalysisSummary, AuditObservation, EvidenceExecutionRecord } from "./contracts.js";
import { createId } from "./utils.js";

function completedExecutions(executions: EvidenceExecutionRecord[]): EvidenceExecutionRecord[] {
  return executions.filter((item) => item.status === "completed");
}

function packageToolSignals(executions: EvidenceExecutionRecord[]): string[] {
  return completedExecutions(executions)
    .filter((item) => (item.normalized?.issue_count ?? 0) > 0 || (item.normalized?.signal_count ?? 0) > 0)
    .map((item) => `${item.provider_id}:${item.normalized?.issue_count ?? item.normalized?.signal_count ?? 0}`)
    .slice(0, 6);
}

export function analyzeDeepPackageSurface(args: {
  analysis: AnalysisSummary;
  toolExecutions: EvidenceExecutionRecord[];
  laneName: string;
}): { summary: string[]; observations: AuditObservation[] } {
  const ecosystems = args.analysis.package_ecosystems;
  const managers = args.analysis.package_managers;
  if (!ecosystems.length && !managers.length) {
    return {
      summary: ["Deep package analysis found no recognizable package ecosystems."],
      observations: []
    };
  }

  const observations: AuditObservation[] = [];
  if (ecosystems.length > 1) {
    observations.push({
      observation_id: createId("observation"),
      title: "Deep package review spans multiple ecosystems",
      summary: `Lane '${args.laneName}' spans ${ecosystems.length} package ecosystems, which increases dependency-review breadth and selective rerun value.`,
      evidence: ecosystems
    });
  }
  if (args.analysis.dependency_manifests.length > 0 && args.analysis.lockfiles.length === 0) {
    observations.push({
      observation_id: createId("observation"),
      title: "Deep package review lacks lockfile parity",
      summary: `Lane '${args.laneName}' detected dependency manifests without matching lockfiles, reducing reproducibility confidence for deep package review.`,
      evidence: args.analysis.dependency_manifests.slice(0, 10)
    });
  }

  const toolSignals = packageToolSignals(args.toolExecutions);
  return {
    summary: [
      `Deep package analysis focused on ecosystems [${ecosystems.join(", ") || "none"}] using managers [${managers.join(", ") || "none"}].`,
      toolSignals.length ? `Deep package tools emitted normalized signals from ${toolSignals.join(", ")}.` : "Deep package tools did not emit normalized dependency signals."
    ],
    observations
  };
}
