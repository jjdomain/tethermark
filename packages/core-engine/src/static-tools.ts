import { spawnSync } from "node:child_process";

import { buildToolPathEnv, staticToolPathDetails } from "./tool-paths.js";

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
    mandatory: false,
    fallback: null,
    fix: "Install Semgrep with pipx, pip --user, or an OS-approved package manager and ensure semgrep is on PATH."
  },
  {
    id: "trivy",
    label: "Trivy",
    command: "trivy",
    versionArgs: ["--version"],
    category: "supply_chain",
    run_modes: ["static"],
    default_enabled: true,
    mandatory: false,
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
    fix: "Install and configure the Inspect adapter before runtime validation."
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
    fix: "Install and configure the garak adapter before prompt-stress runtime validation."
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
    fix: "Install and configure the PyRIT adapter before adversarial runtime validation."
  }
];

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function normalizeGatePolicy(value: unknown): StaticToolGatePolicy {
  return value === "require_local_scanners" || value === "require_all" ? value : "warn";
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
      summary: `${def.label} adapter readiness is deferred until runtime tooling is installed.`,
      fix: def.fix
    };
  }
  const result = spawnSync(def.command, def.versionArgs, {
    encoding: "utf8",
    env: { ...process.env, PATH: buildToolPathEnv() },
    shell: process.platform === "win32",
    timeout: 10_000,
    windowsHide: true
  });
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const errorMessage = result.error?.message ?? "";
  const deniedOrTimedOut = Boolean(errorMessage) && /denied|eperm|timedout|timeout/i.test(errorMessage);
  const installed = result.status === 0 && !result.error;
  const status = installed ? "available" : deniedOrTimedOut ? "blocked" : "missing";
  const message = errorMessage || firstLine(combined) || `exit ${result.status ?? "unknown"}`;
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
    version: installed ? firstLine(combined) || "available" : null,
    summary: installed ? `${def.label} is available.` : `${def.label} is ${status}: ${message}.`,
    fix: def.fix
  };
}

export function buildStaticToolsReadiness(args: { gatePolicy?: unknown; selectedToolIds?: unknown } = {}): StaticToolsReadiness {
  const gatePolicy = "warn";
  const selectedToolIds = normalizeSelectedToolIds(args.selectedToolIds);
  const selectedSet = new Set(selectedToolIds);
  const tools = TOOL_DEFS.map((tool) => probeTool(tool, selectedSet));
  const warnings = tools
    .filter((tool) => tool.selected && !tool.installed)
    .map((tool) => `${tool.label} is not available${tool.fallback ? `; fallback: ${tool.fallback}` : ""}.`);
  const blockers: string[] = [];
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
