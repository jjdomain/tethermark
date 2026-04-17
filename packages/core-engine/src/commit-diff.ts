import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { AuditPolicyArtifact, TargetDescriptor } from "./contracts.js";
import { listRunArtifactLocations } from "./run-registry.js";
import { hashObject } from "./utils.js";

const execFileAsync = promisify(execFile);

export interface CommitDiffGateArtifact {
  previous_run_id: string | null;
  current_commit_sha: string | null;
  previous_commit_sha: string | null;
  comparison_mode: "no_prior_run" | "policy_changed" | "same_commit" | "git_diff" | "git_diff_unavailable" | "non_git_target";
  changed_files: string[];
  stage_decisions: {
    planner: "reuse" | "rerun";
    threat_model: "reuse" | "rerun";
    eval_selection: "reuse" | "rerun";
  };
  rationale: string[];
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function findPreviousComparableRun(target: TargetDescriptor, runMode: string, currentRunId: string): Promise<{ run_id: string; artifact_dir: string } | null> {
  const entries = await listRunArtifactLocations();
  const candidates = [...entries]
    .filter((entry) => entry.run_id !== currentRunId && entry.run_mode === runMode)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));

  for (const entry of candidates) {
    const previousTarget = await readJson<any>(path.join(entry.artifact_dir, "target.json"));
    if (!previousTarget) continue;
    if (previousTarget.target_type !== target.target_type) continue;
    if (previousTarget.snapshot?.value === target.snapshot.value) {
      return { run_id: entry.run_id, artifact_dir: entry.artifact_dir };
    }
  }
  return null;
}

function hasMatchingChange(changedFiles: string[], patterns: RegExp[]): boolean {
  return changedFiles.some((file) => patterns.some((pattern) => pattern.test(file)));
}

async function tryGitDiff(rootPath: string, previousCommit: string, currentCommit: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "diff", "--name-only", previousCommit, currentCommit], { maxBuffer: 1024 * 1024 });
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

export async function computeCommitDiffGate(args: {
  currentRunId: string;
  request: { run_mode?: string };
  target: TargetDescriptor;
  auditPolicy: AuditPolicyArtifact;
}): Promise<CommitDiffGateArtifact> {
  const previous = await findPreviousComparableRun(args.target, args.request.run_mode ?? "static", args.currentRunId);
  if (!previous) {
    return {
      previous_run_id: null,
      current_commit_sha: args.target.snapshot.commit_sha,
      previous_commit_sha: null,
      comparison_mode: "no_prior_run",
      changed_files: [],
      stage_decisions: { planner: "rerun", threat_model: "rerun", eval_selection: "rerun" },
      rationale: ["No previous comparable run was found for this target and run mode."]
    };
  }

  const previousTarget = await readJson<any>(path.join(previous.artifact_dir, "target.json"));
  const previousPolicy = await readJson<AuditPolicyArtifact>(path.join(previous.artifact_dir, "audit-policy.json"));
  const previousCommit = previousTarget?.snapshot?.commit_sha ?? null;
  const currentCommit = args.target.snapshot.commit_sha ?? null;
  const policyChanged = hashObject(previousPolicy ?? {}) !== hashObject(args.auditPolicy);

  if (policyChanged) {
    return {
      previous_run_id: previous.run_id,
      current_commit_sha: currentCommit,
      previous_commit_sha: previousCommit,
      comparison_mode: "policy_changed",
      changed_files: [],
      stage_decisions: { planner: "rerun", threat_model: "rerun", eval_selection: "rerun" },
      rationale: ["Audit policy changed since the previous comparable run."]
    };
  }

  if (!currentCommit || !previousCommit || args.target.target_type === "endpoint") {
    return {
      previous_run_id: previous.run_id,
      current_commit_sha: currentCommit,
      previous_commit_sha: previousCommit,
      comparison_mode: "non_git_target",
      changed_files: [],
      stage_decisions: { planner: "rerun", threat_model: "rerun", eval_selection: "rerun" },
      rationale: ["Commit-based gating is unavailable for this target type or snapshot."]
    };
  }

  if (currentCommit === previousCommit) {
    return {
      previous_run_id: previous.run_id,
      current_commit_sha: currentCommit,
      previous_commit_sha: previousCommit,
      comparison_mode: "same_commit",
      changed_files: [],
      stage_decisions: { planner: "reuse", threat_model: "reuse", eval_selection: "reuse" },
      rationale: ["Current commit matches the most recent comparable run."]
    };
  }

  const rootPath = args.target.local_path ?? process.cwd();
  const changedFiles = await tryGitDiff(rootPath, previousCommit, currentCommit);
  if (!changedFiles) {
    return {
      previous_run_id: previous.run_id,
      current_commit_sha: currentCommit,
      previous_commit_sha: previousCommit,
      comparison_mode: "git_diff_unavailable",
      changed_files: [],
      stage_decisions: { planner: "rerun", threat_model: "rerun", eval_selection: "rerun" },
      rationale: ["Git diff could not be computed between commits in the current workspace."]
    };
  }

  const plannerPatterns = [/readme/i, /^docs\//i, /security/i, /package\.json$/i, /pyproject\.toml$/i, /cargo\.toml$/i, /go\.mod$/i, /workflow/i, /config/i, /(index|main|app|server|cli)\.(ts|js|py)$/i];
  const threatPatterns = [...plannerPatterns, /agent/i, /mcp/i, /tool/i, /sandbox/i, /docker/i, /compose/i, /auth/i, /policy/i];
  const evalPatterns = [...threatPatterns, /semgrep/i, /trivy/i, /scorecard/i];

  const plannerDecision = hasMatchingChange(changedFiles, plannerPatterns) ? "rerun" : "reuse";
  const threatDecision = plannerDecision === "rerun" || hasMatchingChange(changedFiles, threatPatterns) ? "rerun" : "reuse";
  const evalDecision = threatDecision === "rerun" || hasMatchingChange(changedFiles, evalPatterns) ? "rerun" : "reuse";

  return {
    previous_run_id: previous.run_id,
    current_commit_sha: currentCommit,
    previous_commit_sha: previousCommit,
    comparison_mode: "git_diff",
    changed_files: changedFiles,
    stage_decisions: { planner: plannerDecision, threat_model: threatDecision, eval_selection: evalDecision },
    rationale: [
      plannerDecision === "reuse" ? "No planner-relevant files changed." : "Planner-relevant files changed.",
      threatDecision === "reuse" ? "No threat-model-relevant files changed." : "Threat-model-relevant files changed.",
      evalDecision === "reuse" ? "No eval-selection-relevant files changed." : "Eval-selection-relevant files changed."
    ]
  };
}
