import fs from "node:fs/promises";
import path from "node:path";

import type { AnalysisSummary, RepoContextArtifact, RepoContextDocument, TargetDescriptor } from "./contracts.js";

const MAX_EXCERPT_BYTES = 8192;

function classifyDocKind(relative: string): RepoContextDocument["kind"] {
  const lower = relative.toLowerCase();
  if (lower.startsWith("readme")) return "readme";
  if (lower.includes("security")) return "security";
  if (lower.startsWith("docs/")) return "docs";
  if (/(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod)$/i.test(lower)) return "manifest";
  if (lower.startsWith(".github/workflows/")) return "workflow";
  if (/(index|main|app|server|cli)\.(ts|js|py)$/i.test(lower)) return "entrypoint";
  if (/(dockerfile|compose|config|settings|policy|guardrail|sandbox)/i.test(lower)) return "config";
  return "other";
}

async function safeExcerpt(root: string, relative: string): Promise<string> {
  const absolute = path.join(root, relative);
  try {
    const buffer = await fs.readFile(absolute);
    return buffer.subarray(0, MAX_EXCERPT_BYTES).toString("utf8").replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

function pickCandidateFiles(analysis: AnalysisSummary): string[] {
  const ranked = [
    ...analysis.security_docs,
    ...analysis.dependency_manifests,
    ...analysis.ci_workflows,
    ...analysis.entry_points,
    ...analysis.mcp_indicators.slice(0, 5),
    ...analysis.agent_indicators.slice(0, 5),
    ...analysis.container_files,
    ...analysis.release_files,
    "README.md",
    "README.MD",
    "readme.md"
  ];
  return [...new Set(ranked)].slice(0, 20);
}

export async function buildRepoContext(target: TargetDescriptor, analysis: AnalysisSummary): Promise<RepoContextArtifact> {
  const root = target.local_path ?? process.cwd();
  const documents: RepoContextDocument[] = [];
  for (const candidate of pickCandidateFiles(analysis)) {
    const excerpt = await safeExcerpt(root, candidate);
    if (!excerpt) continue;
    documents.push({
      path: candidate,
      kind: classifyDocKind(candidate),
      excerpt
    });
  }

  const capabilitySignals = [
    ...(analysis.mcp_indicators.length ? ["mcp_or_plugin_surface"] : []),
    ...(analysis.agent_indicators.length ? ["agentic_code_surface"] : []),
    ...(analysis.tool_execution_indicators.length ? ["tool_execution_surface"] : []),
    ...((analysis.ai_frameworks ?? []).map((item) => `ai_framework:${item}`)),
    ...((analysis.agentic_capabilities ?? []).map((item) => `agentic_capability:${item}`)),
    ...((analysis.agentic_risk_indicators ?? []).map((item) => `agentic_risk:${item}`)),
    ...((analysis.agentic_control_indicators ?? []).map((item) => `agentic_control:${item}`)),
    ...(analysis.ci_workflows.length ? ["ci_present"] : []),
    ...(analysis.container_files.length ? ["containerization_present"] : []),
    ...(analysis.security_docs.length ? ["security_docs_present"] : [])
  ];

  return {
    summary: [
      `${analysis.project_name} contains ${analysis.file_count} files with frameworks [${analysis.frameworks.join(", ") || "none"}].`,
      `${analysis.languages.join(", ") || "No primary language markers found"} were detected.`,
      `${documents.length} curated repo context documents were attached for semantic review.`
    ],
    capability_signals: capabilitySignals,
    documents
  };
}
