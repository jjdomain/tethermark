import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { buildToolPathEnv, staticToolPathDetails } from "./tool-paths.js";
import { evaluateStaticToolVersion, resolveStaticToolInvocation, STATIC_TOOL_POLICIES, type ProductionStaticToolId } from "./static-tool-policy.js";

export type StaticToolId = "scorecard" | "semgrep" | "trivy" | "inspect" | "garak" | "pyrit";
export type StaticToolGatePolicy = "warn" | "require_local_scanners" | "require_all";

export interface StaticToolStatus {
  id: StaticToolId;
  label: string;
  command: string;
  required_for_full_static: boolean;
  category: "repo_posture" | "sast" | "supply_chain" | "runtime_eval";
  run_modes: Array<"static" | "runtime">;
  default_enabled: boolean;
  mandatory: boolean;
  selected: boolean;
  fallback: string | null;
  installed: boolean;
  status: "available" | "missing" | "blocked";
  version: string | null;
  version_supported: boolean | null;
  version_pinned: boolean | null;
  summary: string;
  fix: string;
}

export interface StaticToolsReadiness {
  generated_at: string;
  status: "ready" | "ready_with_warnings" | "blocked";
  gate_policy: StaticToolGatePolicy;
  selected_tool_ids: string[];
  tool_path: ReturnType<typeof staticToolPathDetails>;
  tools: StaticToolStatus[];
  warnings: string[];
  blockers: string[];
}

const TOOL_DEFS: Array<{
  id: string;
  label: string;
  command: string | null;
  versionArgs: string[];
  category: StaticToolStatus["category"];
  run_modes: StaticToolStatus["run_modes"];
  default_enabled: boolean;
  fallback: string | null;
  fix: string;
  mandatory?: boolean;
}> = [
  {
    id: "scorecard",
    label: "OpenSSF Scorecard",
    command: "scorecard",
    versionArgs: ["version"],
    category: "repo_posture",
    run_modes: ["static"],
    default_enabled: true,
    mandatory: true,
    fallback: "scorecard_api for public GitHub repositories",
    fix: "Install OpenSSF Scorecard through an OS-approved package manager, or rely on Scorecard API for public GitHub repo targets."
  },
  {
    id: "semgrep",
    label: "Semgrep",
    command: "semgrep",
    versionArgs: ["--version"],
    category: "sast",
    run_modes: ["static"],
    default_enabled: true,
    mandatory: true,
    fallback: null,
    fix: "Install Semgrep with pipx, pip --user, or an OS-approved package manager and ensure semgrep is on PATH. Tethermark uses a bundled local ruleset by default; set HARNESS_SEMGREP_CONFIG for a custom ruleset."
  },
  {
    id: "trivy",
    label: "Trivy",
    command: "trivy",
    versionArgs: ["--version"],
    category: "supply_chain",
    run_modes: ["static"],
    default_enabled: true,
    mandatory: true,
    fallback: null,
    fix: "Install Trivy through winget, choco, Homebrew, Aqua packages, or another OS-approved package manager and ensure trivy is on PATH."
  },
  {
    id: "inspect",
    label: "Inspect",
    command: null,
    versionArgs: [],
    category: "runtime_eval",
    run_modes: ["runtime"],
    default_enabled: true,
    mandatory: false,
    fallback: null,
    fix: "Run npm run scan -- setup-workers --yes, then verify Inspect with worker-doctor and worker-smoke."
  },
  {
    id: "garak",
    label: "garak",
    command: null,
    versionArgs: [],
    category: "runtime_eval",
    run_modes: ["runtime"],
    default_enabled: true,
    mandatory: false,
    fallback: null,
    fix: "Run npm run scan -- setup-workers --yes, then verify bounded Garak with worker-doctor, worker-tests, and worker-smoke."
  },
  {
    id: "pyrit",
    label: "PyRIT",
    command: null,
    versionArgs: [],
    category: "runtime_eval",
    run_modes: ["runtime"],
    default_enabled: true,
    mandatory: false,
    fallback: null,
    fix: "Run setup-workers and configure an explicit runtime endpoint before bounded PyRIT adversarial validation."
  }
];

function normalizeGatePolicy(value: unknown): StaticToolGatePolicy {
  return value === "require_local_scanners" || value === "require_all" ? value : "warn";
}

function executableCandidates(command: string): string[] {
  const parsed = path.parse(command);
  if (parsed.dir || parsed.ext || process.platform !== "win32") return [command];
  const extensions = String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  return [
    command,
    ...extensions.map((extension) => `${command}${extension.toLowerCase()}`),
    ...extensions.map((extension) => `${command}${extension.toUpperCase()}`)
  ];
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findCommandOnPath(command: string): string | null {
  const candidates = executableCandidates(command);
  if (path.isAbsolute(command) || path.parse(command).dir) {
    return candidates.find(isFile) ?? null;
  }
  const pathEnv = buildToolPathEnv();
  for (const dir of pathEnv.split(path.delimiter).map((item) => item.trim()).filter(Boolean)) {
    for (const candidate of candidates) {
      const resolved = path.join(dir, candidate);
      if (isFile(resolved)) return resolved;
    }
  }
  return null;
}

function normalizeSelectedToolIds(value: unknown): string[] {
  const known = new Set(TOOL_DEFS.map((tool) => tool.id));
  const mandatory = TOOL_DEFS.filter((tool) => tool.mandatory).map((tool) => tool.id);
  const raw = Array.isArray(value) ? value : TOOL_DEFS.filter((tool) => tool.default_enabled).map((tool) => tool.id);
  return [...new Set([...mandatory, ...raw.filter((item): item is string => typeof item === "string" && known.has(item))])];
}

function probeTool(def: (typeof TOOL_DEFS)[number], selectedToolIds: Set<string>): StaticToolStatus {
  if (!def.command) {
    return {
      id: def.id as StaticToolId,
      label: def.label,
      command: def.id,
      required_for_full_static: false,
      category: def.category,
      run_modes: def.run_modes,
      default_enabled: def.default_enabled,
      mandatory: Boolean(def.mandatory),
      selected: selectedToolIds.has(def.id),
      fallback: def.fallback,
      installed: false,
      status: "missing",
      version: null,
      version_supported: null,
      version_pinned: null,
      summary: `${def.label} adapter readiness is deferred until runtime tooling is installed.`,
      fix: def.fix
    };
  }
  if (process.env.HARNESS_DISABLE_LOCAL_BINARIES === "1") {
    return {
      id: def.id as StaticToolId,
      label: def.label,
      command: def.command,
      required_for_full_static: def.id === "scorecard" || def.id === "semgrep" || def.id === "trivy",
      category: def.category,
      run_modes: def.run_modes,
      default_enabled: def.default_enabled,
      mandatory: Boolean(def.mandatory),
      selected: selectedToolIds.has(def.id),
      fallback: def.fallback,
      installed: false,
      status: "blocked",
      version: null,
      version_supported: null,
      version_pinned: null,
      summary: `${def.label} is blocked: local binary execution disabled by HARNESS_DISABLE_LOCAL_BINARIES.`,
      fix: def.fix
    };
  }
  const invocation = resolveStaticToolInvocation(def.id as ProductionStaticToolId);
  const resolvedCommand = findCommandOnPath(invocation.command);
  const installed = Boolean(resolvedCommand);
  if (!resolvedCommand) {
    return {
      id: def.id as StaticToolId,
      label: def.label,
      command: def.command,
      required_for_full_static: def.id === "scorecard" || def.id === "semgrep" || def.id === "trivy",
      category: def.category,
      run_modes: def.run_modes,
      default_enabled: def.default_enabled,
      mandatory: Boolean(def.mandatory),
      selected: selectedToolIds.has(def.id),
      fallback: def.fallback,
      installed: false,
      status: "missing",
      version: null,
      version_supported: null,
      version_pinned: null,
      summary: `${def.label} is missing: not found on trusted tools path.`,
      fix: def.fix
    };
  }
  const result = spawnSync(resolvedCommand, [...invocation.prefix_args, ...def.versionArgs], {
    encoding: "utf8",
    env: { ...process.env, PATH: buildToolPathEnv() },
    shell: false,
    windowsHide: true,
    timeout: 20_000
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const toolPolicy = STATIC_TOOL_POLICIES[def.id as ProductionStaticToolId];
  const versionEvaluation = toolPolicy ? evaluateStaticToolVersion(toolPolicy.id, output) : null;
  const probeSucceeded = result.status === 0 && !result.error;
  const supported = probeSucceeded && Boolean(versionEvaluation?.supported);
  const status = supported ? "available" : "blocked";
  const message = !probeSucceeded
    ? `version probe failed at ${resolvedCommand}: ${result.error?.message ?? output.split(/\r?\n/).find(Boolean) ?? `exit ${result.status}`}`
    : versionEvaluation?.reason ?? `version could not be validated at ${resolvedCommand}`;
  return {
    id: def.id as StaticToolId,
    label: def.label,
    command: def.command,
    required_for_full_static: def.id === "scorecard" || def.id === "semgrep" || def.id === "trivy",
    category: def.category,
    run_modes: def.run_modes,
    default_enabled: def.default_enabled,
    mandatory: Boolean(def.mandatory),
    selected: selectedToolIds.has(def.id),
    fallback: def.fallback,
    installed,
    status,
    version: versionEvaluation?.detected_version ?? null,
    version_supported: versionEvaluation?.supported ?? false,
    version_pinned: versionEvaluation?.pinned ?? false,
    summary: supported ? `${message} Found at ${resolvedCommand}.` : `${def.label} is blocked: ${message}.`,
    fix: def.fix
  };
}

export function buildStaticToolsReadiness(args: { gatePolicy?: unknown; selectedToolIds?: unknown } = {}): StaticToolsReadiness {
  const gatePolicy = normalizeGatePolicy(args.gatePolicy ?? process.env.HARNESS_STATIC_TOOL_GATE_POLICY ?? "require_local_scanners");
  const localBinaryExecutionDisabled = process.env.HARNESS_DISABLE_LOCAL_BINARIES === "1";
  const selectedToolIds = normalizeSelectedToolIds(args.selectedToolIds);
  const selectedSet = new Set(selectedToolIds);
  const tools = TOOL_DEFS.map((tool) => probeTool(tool, selectedSet));
  const warnings = tools
    .filter((tool) => tool.selected && tool.status !== "available")
    .map((tool) => `${tool.label} is not ready${tool.fallback ? `; fallback: ${tool.fallback}` : ""}.`);
  const blockers = localBinaryExecutionDisabled
    ? []
    : gatePolicy === "warn"
      ? []
      : tools
      .filter((tool) => tool.selected && tool.mandatory && tool.status !== "available")
      .map((tool) => `${tool.label} is required for production static audits.`);
  return {
    generated_at: new Date().toISOString(),
    status: blockers.length ? "blocked" : warnings.length ? "ready_with_warnings" : "ready",
    gate_policy: gatePolicy,
    selected_tool_ids: selectedToolIds,
    tool_path: staticToolPathDetails(),
    tools,
    warnings,
    blockers
  };
}
