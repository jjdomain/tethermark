import fs from "node:fs/promises";
import path from "node:path";

import type { AuditRequest, AnalysisSummary, SandboxSession, TargetDescriptor } from "./contracts.js";
import { normalizeEndpointUrl, normalizeLocalPath, normalizeRepoUrl } from "./target-identity.js";
import { createStableId, unique, nowIso } from "./utils.js";

const TEXT_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|json|md|yml|yaml|toml)$/i;
const SKIP_NAMES = new Set([".git", "node_modules", ".artifacts", ".npm-cache", ".legacy-js-archive", "dist", "build", "__pycache__", ".venv"]);

async function walk(root: string, current = root, acc: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) {
      continue;
    }
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, acc);
    } else {
      acc.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  return acc;
}

function derivePackageSurface(files: string[]): { ecosystems: string[]; managers: string[] } {
  const ecosystems = new Set<string>();
  const managers = new Set<string>();
  for (const file of files) {
    const normalized = file.toLowerCase();
    if (/(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(normalized)) {
      ecosystems.add("javascript");
    }
    if (/(^|\/)(requirements(\.dev)?\.txt|pyproject\.toml|poetry\.lock|pipfile|pipfile\.lock)$/i.test(normalized)) {
      ecosystems.add("python");
    }
    if (/(^|\/)(go\.mod)$/i.test(normalized)) {
      ecosystems.add("go");
    }
    if (/(^|\/)(cargo\.toml|cargo\.lock)$/i.test(normalized)) {
      ecosystems.add("rust");
    }
    if (/(^|\/)(package\.json|package-lock\.json)$/i.test(normalized)) managers.add("npm");
    if (/(^|\/)(pnpm-lock\.yaml)$/i.test(normalized)) managers.add("pnpm");
    if (/(^|\/)(yarn\.lock)$/i.test(normalized)) managers.add("yarn");
    if (/(^|\/)(requirements(\.dev)?\.txt|pipfile|pipfile\.lock)$/i.test(normalized)) managers.add("pip");
    if (/(^|\/)(pyproject\.toml|poetry\.lock)$/i.test(normalized)) managers.add("poetry");
    if (/(^|\/)(go\.mod)$/i.test(normalized)) managers.add("go-mod");
    if (/(^|\/)(cargo\.toml|cargo\.lock)$/i.test(normalized)) managers.add("cargo");
  }
  return { ecosystems: [...ecosystems].sort(), managers: [...managers].sort() };
}

function computeTargetIdentity(request: AuditRequest): { targetId: string; snapshotValue: string } {
  if (request.repo_url) {
    const normalized = normalizeRepoUrl(request.repo_url);
    return {
      targetId: createStableId("target", `repo:${normalized}`),
      snapshotValue: request.repo_url
    };
  }

  if (request.local_path) {
    const normalized = normalizeLocalPath(request.local_path);
    return {
      targetId: createStableId("target", `path:${normalized}`),
      snapshotValue: path.resolve(request.local_path)
    };
  }

  if (request.endpoint_url) {
    const normalized = normalizeEndpointUrl(request.endpoint_url);
    return {
      targetId: createStableId("target", `endpoint:${normalized}`),
      snapshotValue: request.endpoint_url
    };
  }

  throw new Error("Exactly one of local_path, repo_url, or endpoint_url must be provided.");
}

export async function prepareTarget(request: AuditRequest, sandbox: SandboxSession): Promise<TargetDescriptor> {
  const identity = computeTargetIdentity(request);

  if (request.local_path) {
    const inferredRepoUrl = typeof request.hints?.repo_url === "string"
      ? request.hints.repo_url
      : sandbox.source_provenance.upstream_repo_url ?? null;
    return {
      target_id: identity.targetId,
      target_type: "path",
      repo_url: inferredRepoUrl,
      local_path: sandbox.target_dir,
      endpoint_url: null,
      snapshot: { type: "filesystem", value: identity.snapshotValue, captured_at: nowIso(), commit_sha: sandbox.source_provenance.commit_sha },
      hints: {
        ...(request.hints ?? {}),
        sandbox_target_dir: sandbox.target_dir,
        source_local_path: path.resolve(request.local_path),
        inferred_repo_url: inferredRepoUrl
      }
    };
  }

  if (request.repo_url) {
    return {
      target_id: identity.targetId,
      target_type: "repo",
      repo_url: request.repo_url,
      local_path: sandbox.target_dir,
      endpoint_url: null,
      snapshot: { type: "repo_url", value: identity.snapshotValue, captured_at: nowIso(), commit_sha: sandbox.source_provenance.commit_sha },
      hints: {
        ...(request.hints ?? {}),
        sandbox_target_dir: sandbox.target_dir,
        sandbox_target_bytes: sandbox.storage_usage.target_bytes,
        sandbox_target_file_count: sandbox.storage_usage.target_file_count
      }
    };
  }

  if (request.endpoint_url) {
    return {
      target_id: identity.targetId,
      target_type: "endpoint",
      repo_url: null,
      local_path: sandbox.target_dir,
      endpoint_url: request.endpoint_url,
      snapshot: { type: "endpoint", value: identity.snapshotValue, captured_at: nowIso(), commit_sha: sandbox.source_provenance.commit_sha },
      hints: {
        ...(request.hints ?? {}),
        sandbox_target_dir: sandbox.target_dir
      }
    };
  }

  throw new Error("Exactly one of local_path, repo_url, or endpoint_url must be provided.");
}

export async function analyzeTarget(target: TargetDescriptor): Promise<AnalysisSummary> {
  const root = target.local_path ?? process.cwd();
  const files = await walk(root);
  const frameworks = unique(files.flatMap((file) => {
    const lower = file.toLowerCase();
    return [
      lower.includes("next") ? "Next.js" : "",
      lower.includes("react") ? "React" : "",
      lower.includes("fastapi") ? "FastAPI" : "",
      lower.includes("django") ? "Django" : "",
      lower.includes("flask") ? "Flask" : "",
      lower.includes("mcp") ? "MCP" : ""
    ];
  }));
  const languages = unique(files.flatMap((file) => {
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file)) return ["JavaScript/TypeScript"];
    if (/\.py$/i.test(file)) return ["Python"];
    return [];
  }));
  const entryPoints = files.filter((file) => /(index|main|app|server|cli)\.(ts|js|py)$/i.test(file));
  const mcpIndicators = files.filter((file) => /mcp|plugin|skill/i.test(file));
  const toolExecutionIndicators = files.filter((file) => TEXT_FILE_RE.test(file) && /(tool|adapter|worker|orchestr)/i.test(file));
  const agentIndicators = files.filter((file) => TEXT_FILE_RE.test(file) && /(agent|planner|eval|audit)/i.test(file));
  const dependencyManifests = files.filter((file) => /(^|\/)(package\.json|requirements(\.dev)?\.txt|pyproject\.toml|poetry\.lock|Pipfile|Pipfile\.lock|go\.mod|Cargo\.toml)$/i.test(file));
  const lockfiles = files.filter((file) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Pipfile\.lock|Cargo\.lock)$/i.test(file));
  const ciWorkflows = files.filter((file) => /(^|\/)\.github\/workflows\/.*\.(yml|yaml)$/i.test(file));
  const securityDocs = files.filter((file) => /(^|\/)(SECURITY\.md|CODEOWNERS|\.github\/dependabot\.yml|\.github\/dependabot\.yaml|renovate\.json|renovate\.json5)$/i.test(file));
  const releaseFiles = files.filter((file) => /(^|\/)(release\.yml|release\.yaml|\.releaserc|semantic-release|changeset|\.github\/workflows\/.*release.*\.(yml|yaml))$/i.test(file));
  const containerFiles = files.filter((file) => /(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/i.test(file));
  const packageSurface = derivePackageSurface(files);

  return {
    root_path: root,
    project_name: path.basename(root),
    file_count: files.length,
    frameworks,
    languages,
    entry_points: entryPoints,
    mcp_indicators: mcpIndicators,
    agent_indicators: agentIndicators,
    tool_execution_indicators: toolExecutionIndicators,
    dependency_manifests: dependencyManifests,
    lockfiles,
    package_ecosystems: packageSurface.ecosystems,
    package_managers: packageSurface.managers,
    ci_workflows: ciWorkflows,
    security_docs: securityDocs,
    release_files: releaseFiles,
    container_files: containerFiles
  };
}
