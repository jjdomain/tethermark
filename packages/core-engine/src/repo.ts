import fs from "node:fs/promises";
import path from "node:path";

import type { AuditRequest, AnalysisSummary, SandboxSession, TargetDescriptor } from "./contracts.js";
import { normalizeEndpointUrl, normalizeLocalPath, normalizeRepoUrl } from "./target-identity.js";
import { createStableId, unique, nowIso } from "./utils.js";

const TEXT_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|json|md|yml|yaml|toml)$/i;
const SKIP_NAMES = new Set([".git", "node_modules", ".artifacts", ".npm-cache", ".legacy-js-archive", "dist", "build", "__pycache__", ".venv"]);
const MAX_SIGNAL_FILE_BYTES = 192 * 1024;

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

async function readSmallText(root: string, relative: string): Promise<string> {
  try {
    const absolute = path.join(root, relative);
    const stat = await fs.stat(absolute);
    if (stat.size > MAX_SIGNAL_FILE_BYTES) return "";
    return fs.readFile(absolute, "utf8");
  } catch {
    return "";
  }
}

function collectManifestDependencies(manifests: Array<{ path: string; text: string }>): string[] {
  const deps = new Set<string>();
  for (const manifest of manifests) {
    const lower = manifest.path.toLowerCase();
    if (/(^|\/)package\.json$/i.test(lower)) {
      try {
        const parsed = JSON.parse(manifest.text);
        for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
          for (const key of Object.keys(parsed?.[section] ?? {})) deps.add(key.toLowerCase());
        }
      } catch {
        // Ignore malformed manifests; import/text scanning still runs below.
      }
    } else if (/(requirements(\.dev)?\.txt|pyproject\.toml|poetry\.lock|pipfile)$/i.test(lower)) {
      for (const match of manifest.text.matchAll(/^\s*([A-Za-z0-9_.-]+)(?:\[.*?\])?\s*(?:[<>=!~]=|==|~=|$)/gm)) {
        deps.add(match[1].toLowerCase());
      }
    } else if (/(^|\/)go\.mod$/i.test(lower)) {
      for (const match of manifest.text.matchAll(/^\s*(?:require\s+)?([A-Za-z0-9_./-]+)\s+v?\d/gm)) {
        deps.add(match[1].toLowerCase());
      }
    }
  }
  return [...deps];
}

function pushSignal(args: { set: Set<string>; files: Set<string>; id: string; file?: string | null }): void {
  args.set.add(args.id);
  if (args.file) args.files.add(args.file);
}

async function detectAgenticSignals(root: string, files: string[]): Promise<{
  aiFrameworks: string[];
  capabilities: string[];
  risks: string[];
  controls: string[];
  signalFiles: string[];
}> {
  const frameworks = new Set<string>();
  const capabilities = new Set<string>();
  const risks = new Set<string>();
  const controls = new Set<string>();
  const signalFiles = new Set<string>();
  const manifests = await Promise.all(files
    .filter((file) => /(^|\/)(package\.json|requirements(\.dev)?\.txt|pyproject\.toml|poetry\.lock|Pipfile|go\.mod)$/i.test(file))
    .map(async (file) => ({ path: file, text: await readSmallText(root, file) })));
  const dependencies = collectManifestDependencies(manifests);
  const dependencyText = dependencies.join("\n");
  const textFiles = files.filter((file) => TEXT_FILE_RE.test(file) && !/lock$/i.test(file)).slice(0, 500);
  const sampledTexts = await Promise.all(textFiles.map(async (file) => ({ path: file, text: await readSmallText(root, file) })));
  const scanTargets = [...manifests, ...sampledTexts].filter((item) => item.text);

  const frameworkPatterns: Array<[string, RegExp]> = [
    ["openai_sdk", /(?:^|\b)(openai|@openai\/agents|openai-agents|openai-agents-js)(?:\b|$)/i],
    ["anthropic_sdk", /(?:^|\b)(@anthropic-ai\/sdk|anthropic)(?:\b|$)/i],
    ["langchain", /(?:^|\b)(langchain|@langchain\/core|@langchain\/openai)(?:\b|$)/i],
    ["langgraph", /(?:^|\b)(langgraph|@langchain\/langgraph)(?:\b|$)/i],
    ["autogen", /(?:^|\b)(autogen|pyautogen|autogen-agentchat)(?:\b|$)/i],
    ["crewai", /(?:^|\b)(crewai)(?:\b|$)/i],
    ["llamaindex", /(?:^|\b)(llama-index|llamaindex)(?:\b|$)/i],
    ["mcp", /(?:^|\b)(@modelcontextprotocol\/sdk|modelcontextprotocol|mcp)(?:\b|$)/i],
    ["browser_automation", /(?:^|\b)(playwright|puppeteer|selenium)(?:\b|$)/i]
  ];
  for (const [id, pattern] of frameworkPatterns) {
    if (pattern.test(dependencyText)) pushSignal({ set: frameworks, files: signalFiles, id, file: manifests.find((item) => pattern.test(item.text))?.path });
  }

  const detectors: Array<{ id: string; kind: "framework" | "capability" | "risk" | "control"; pattern: RegExp }> = [
    { id: "openai_sdk", kind: "framework", pattern: /from\s+["']openai["']|import\s+OpenAI|require\(["']openai["']\)|@openai\/agents/i },
    { id: "langchain", kind: "framework", pattern: /from\s+["']langchain|@langchain|from\s+langchain/i },
    { id: "langgraph", kind: "framework", pattern: /from\s+["']langgraph|@langchain\/langgraph|StateGraph|createReactAgent/i },
    { id: "autogen", kind: "framework", pattern: /from\s+autogen|import\s+autogen|AssistantAgent|UserProxyAgent/i },
    { id: "crewai", kind: "framework", pattern: /from\s+crewai|import\s+crewai|Crew\(|Agent\(/i },
    { id: "mcp", kind: "framework", pattern: /@modelcontextprotocol\/sdk|McpServer|FastMCP|stdio_server|mcp\.server/i },
    { id: "shell_tool", kind: "capability", pattern: /child_process|execSync|spawn\(|subprocess\.(run|Popen|call)|os\.system|shell\s*=\s*True/i },
    { id: "file_write_tool", kind: "capability", pattern: /writeFile|appendFile|fs\.write|Path\(.*\)\.write_text|open\([^)]*["']w["']|shutil\.rmtree|rm\s+-rf/i },
    { id: "network_tool", kind: "capability", pattern: /fetch\(|axios\.|requests\.|httpx\.|urllib\.request|WebSocket|socket\./i },
    { id: "browser_tool", kind: "capability", pattern: /playwright|puppeteer|selenium|browser\.newPage|chromium\.launch/i },
    { id: "mcp_tool_surface", kind: "capability", pattern: /registerTool|server\.tool|addTool|tools\/call|CallToolRequest|Tool\(/i },
    { id: "untrusted_content_ingest", kind: "risk", pattern: /prompt injection|untrusted|webpage|scrape|document loader|load_url|browser content|external content|retrieval/i },
    { id: "dangerous_shell", kind: "risk", pattern: /shell\s*=\s*True|execSync\(|child_process\.exec\(|os\.system\(|rm\s+-rf|powershell\s+-ExecutionPolicy/i },
    { id: "secret_handling_surface", kind: "risk", pattern: /process\.env|os\.environ|dotenv|api[_-]?key|secret|token|credential/i },
    { id: "approval_gate", kind: "control", pattern: /approve|approval|confirm|human.?in.?the.?loop|require.?review|permission.?prompt/i },
    { id: "tool_allowlist", kind: "control", pattern: /allowlist|allowed_tools|tool.?policy|denylist|blocked_tools|capability.?policy/i },
    { id: "sandbox_boundary", kind: "control", pattern: /sandbox|container|isolat|read.?only|no.?network|network.?disabled|permission.?boundary/i },
    { id: "prompt_injection_filter", kind: "control", pattern: /prompt.?injection|ignore.?previous|instruction.?hierarchy|untrusted.?content|sanitize.?prompt/i },
    { id: "secret_redaction", kind: "control", pattern: /redact|mask.?secret|scrub|sanitize.?log|pii|sensitive.?data/i },
    { id: "telemetry_redaction", kind: "control", pattern: /telemetry|trace|audit.?log|structured.?log|log.?redaction|safe.?logging/i }
  ];

  for (const item of scanTargets) {
    for (const detector of detectors) {
      if (!detector.pattern.test(item.text)) continue;
      const target = detector.kind === "framework" ? frameworks : detector.kind === "capability" ? capabilities : detector.kind === "risk" ? risks : controls;
      pushSignal({ set: target, files: signalFiles, id: detector.id, file: item.path });
    }
  }

  return {
    aiFrameworks: [...frameworks].sort(),
    capabilities: [...capabilities].sort(),
    risks: [...risks].sort(),
    controls: [...controls].sort(),
    signalFiles: [...signalFiles].sort().slice(0, 100)
  };
}

function computeTargetIdentity(request: AuditRequest): { targetId: string; snapshotValue: string } {
  if (request.repo_url) {
    const normalized = normalizeRepoUrl(request.repo_url);
    const pinnedRef = typeof (request.hints as any)?.diagnostic_run?.pinned_reference === "string"
      ? String((request.hints as any).diagnostic_run.pinned_reference).trim()
      : typeof (request.hints as any)?.repo_checkout_ref === "string"
        ? String((request.hints as any).repo_checkout_ref).trim()
        : "";
    const snapshotValue = pinnedRef ? `${request.repo_url}#${pinnedRef}` : request.repo_url;
    return {
      targetId: createStableId("target", `repo:${normalized}${pinnedRef ? `#${pinnedRef}` : ""}`),
      snapshotValue
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
  const agenticSignals = await detectAgenticSignals(root, files);
  const frameworks = unique(files.flatMap((file) => {
    const lower = file.toLowerCase();
    return [
      lower.includes("next") ? "Next.js" : "",
      lower.includes("react") ? "React" : "",
      lower.includes("fastapi") ? "FastAPI" : "",
      lower.includes("django") ? "Django" : "",
      lower.includes("flask") ? "Flask" : "",
      lower.includes("mcp") ? "MCP" : "",
      agenticSignals.aiFrameworks.includes("openai_sdk") ? "OpenAI SDK" : "",
      agenticSignals.aiFrameworks.includes("langchain") ? "LangChain" : "",
      agenticSignals.aiFrameworks.includes("langgraph") ? "LangGraph" : "",
      agenticSignals.aiFrameworks.includes("autogen") ? "AutoGen" : "",
      agenticSignals.aiFrameworks.includes("crewai") ? "CrewAI" : "",
      agenticSignals.aiFrameworks.includes("mcp") ? "MCP" : ""
    ];
  }));
  const languages = unique(files.flatMap((file) => {
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file)) return ["JavaScript/TypeScript"];
    if (/\.py$/i.test(file)) return ["Python"];
    return [];
  }));
  const entryPoints = files.filter((file) => /(index|main|app|server|cli)\.(ts|js|py)$/i.test(file));
  const mcpIndicators = unique([
    ...files.filter((file) => /mcp|plugin|skill/i.test(file)),
    ...(agenticSignals.aiFrameworks.includes("mcp") ? agenticSignals.signalFiles : [])
  ]);
  const toolExecutionIndicators = unique([
    ...files.filter((file) => TEXT_FILE_RE.test(file) && /(tool|adapter|worker|orchestr)/i.test(file)),
    ...(agenticSignals.capabilities.length ? agenticSignals.signalFiles : [])
  ]);
  const agentIndicators = unique([
    ...files.filter((file) => TEXT_FILE_RE.test(file) && /(agent|planner|eval|audit)/i.test(file)),
    ...(agenticSignals.aiFrameworks.length ? agenticSignals.signalFiles : [])
  ]);
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
    container_files: containerFiles,
    ai_frameworks: agenticSignals.aiFrameworks,
    agentic_capabilities: agenticSignals.capabilities,
    agentic_risk_indicators: agenticSignals.risks,
    agentic_control_indicators: agenticSignals.controls,
    agentic_signal_files: agenticSignals.signalFiles
  };
}
