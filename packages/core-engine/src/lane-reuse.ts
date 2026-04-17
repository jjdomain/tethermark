import type { CommitDiffGateArtifact, LaneReuseDecision } from "./contracts.js";
import type { AuditLaneName } from "./audit-lanes.js";

const LANE_PATTERNS: Record<AuditLaneName, RegExp[]> = {
  repo_posture: [/readme/i, /security/i, /^docs\//i, /license/i, /codeowners/i],
  supply_chain: [/package(-lock)?\.json$/i, /pnpm-lock\.ya?ml$/i, /yarn\.lock$/i, /requirements/i, /poetry\.lock$/i, /cargo\.toml$/i, /go\.mod$/i, /^\.github\/workflows\//i, /docker/i, /compose/i],
  agentic_controls: [/agent/i, /mcp/i, /tool/i, /prompt/i, /sandbox/i, /policy/i, /(server|cli|app|main)\.(ts|js|py)$/i],
  data_exposure: [/secret/i, /token/i, /auth/i, /credential/i, /env/i, /log/i, /telemetry/i, /config/i],
  runtime_validation: [/docker/i, /compose/i, /runtime/i, /validate/i, /test/i, /integration/i]
};

function laneShouldRerun(changedFiles: string[], laneName: AuditLaneName): boolean {
  const patterns = LANE_PATTERNS[laneName];
  return changedFiles.some((file) => patterns.some((pattern) => pattern.test(file)));
}

export function computeLaneReuseDecisions(args: {
  commitDiff: CommitDiffGateArtifact;
  enabledLanes: AuditLaneName[];
}): LaneReuseDecision[] {
  if (args.commitDiff.comparison_mode === "same_commit") {
    return args.enabledLanes.map((lane_name) => ({
      lane_name,
      decision: "reuse",
      rationale: ["Lane is reusable because the target commit matches the previous comparable run."]
    }));
  }

  if (args.commitDiff.comparison_mode !== "git_diff") {
    return args.enabledLanes.map((lane_name) => ({
      lane_name,
      decision: "rerun",
      rationale: [`Lane reuse unavailable because comparison mode is '${args.commitDiff.comparison_mode}'.`]
    }));
  }

  return args.enabledLanes.map((lane_name) => {
    const rerun = laneShouldRerun(args.commitDiff.changed_files, lane_name);
    return {
      lane_name,
      decision: rerun ? "rerun" : "reuse",
      rationale: rerun
        ? [`Detected changed files matching deterministic reuse rules for lane '${lane_name}'.`]
        : [`No changed files matched deterministic reuse rules for lane '${lane_name}'.`]
    };
  });
}
