export type AuditLaneName =
  | "repo_posture"
  | "supply_chain"
  | "agentic_controls"
  | "data_exposure"
  | "runtime_validation";

export interface AuditLaneDefinition {
  lane_name: AuditLaneName;
  title: string;
  summary: string;
}

export const AUDIT_LANES: AuditLaneDefinition[] = [
  {
    lane_name: "repo_posture",
    title: "Repository Posture",
    summary: "Repository hygiene, maintainer practices, security docs, release process, and baseline governance signals."
  },
  {
    lane_name: "supply_chain",
    title: "Supply Chain",
    summary: "Dependency, CI/CD, provenance, build trust, and workflow integrity analysis."
  },
  {
    lane_name: "agentic_controls",
    title: "Agentic Controls",
    summary: "Tool-use safety, MCP exposure, autonomy boundaries, and agent-specific control review."
  },
  {
    lane_name: "data_exposure",
    title: "Data Exposure",
    summary: "Secrets, logging leakage, model I/O handling, and sensitive data exposure review."
  },
  {
    lane_name: "runtime_validation",
    title: "Runtime Validation",
    summary: "Bounded build, runtime, and validation-oriented checks used only in deeper audit packages."
  }
];
