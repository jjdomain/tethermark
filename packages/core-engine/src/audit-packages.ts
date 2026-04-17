import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AnalysisSummary, AuditPackageId, AuditRequest, TargetClass } from "./contracts.js";
import { AUDIT_LANES, type AuditLaneName } from "./audit-lanes.js";

export interface AuditPackageDefinition {
  id: AuditPackageId;
  title: string;
  run_mode: NonNullable<AuditRequest["run_mode"]>;
  enabled_lanes: AuditLaneName[];
  max_agent_calls: number;
  max_total_tokens: number;
  max_rerun_rounds: number;
  allow_runtime_execution: boolean;
  publishability_threshold: "low" | "medium" | "high";
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const VALID_LANES = new Set(AUDIT_LANES.map((item) => item.lane_name));
const VALID_RUN_MODES = new Set(["static", "build", "runtime", "validate"]);
const VALID_THRESHOLDS = new Set(["low", "medium", "high"]);

function resolveAuditPackageDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "packages", "core-engine", "audit-packages"),
    path.resolve(MODULE_DIR, "..", "audit-packages"),
    path.resolve(MODULE_DIR, "..", "..", "..", "packages", "core-engine", "audit-packages")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Audit package directory not found. Checked: ${candidates.join(", ")}`);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateAuditPackageDefinition(definition: AuditPackageDefinition, context = "audit package"): AuditPackageDefinition {
  if (typeof definition.id !== "string" || definition.id.trim().length === 0) {
    throw new Error(`${context}: missing non-empty id.`);
  }
  if (typeof definition.title !== "string" || definition.title.trim().length === 0) {
    throw new Error(`${context}: missing non-empty title.`);
  }
  if (!VALID_RUN_MODES.has(definition.run_mode)) {
    throw new Error(`${context}: invalid run_mode '${String(definition.run_mode)}'.`);
  }
  if (!Array.isArray(definition.enabled_lanes) || definition.enabled_lanes.length === 0) {
    throw new Error(`${context}: enabled_lanes must contain at least one lane.`);
  }
  for (const lane of definition.enabled_lanes) {
    if (!VALID_LANES.has(lane)) {
      throw new Error(`${context}: invalid lane '${String(lane)}'.`);
    }
  }
  if (!isPositiveInt(definition.max_agent_calls)) {
    throw new Error(`${context}: max_agent_calls must be a positive integer.`);
  }
  if (!isPositiveInt(definition.max_total_tokens)) {
    throw new Error(`${context}: max_total_tokens must be a positive integer.`);
  }
  if (!isPositiveInt(definition.max_rerun_rounds)) {
    throw new Error(`${context}: max_rerun_rounds must be a positive integer.`);
  }
  if (typeof definition.allow_runtime_execution !== "boolean") {
    throw new Error(`${context}: allow_runtime_execution must be boolean.`);
  }
  if (!VALID_THRESHOLDS.has(definition.publishability_threshold)) {
    throw new Error(`${context}: invalid publishability_threshold '${String(definition.publishability_threshold)}'.`);
  }
  return definition;
}

function readBuiltinAuditPackages(): AuditPackageDefinition[] {
  const packageDir = resolveAuditPackageDir();
  const entries = fs.readdirSync(packageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name));

  const packages = entries.map((entry) => {
    const filePath = path.join(packageDir, entry.name);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as AuditPackageDefinition;
    return validateAuditPackageDefinition(parsed, `audit package '${parsed.id ?? entry.name}'`);
  });

  const seenIds = new Set<string>();
  for (const item of packages) {
    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate built-in audit package id '${item.id}' in ${packageDir}.`);
    }
    seenIds.add(item.id);
  }

  return packages;
}

export function listBuiltinAuditPackages(): AuditPackageDefinition[] {
  return readBuiltinAuditPackages();
}

export function getBuiltinAuditPackage(id: AuditPackageId): AuditPackageDefinition | null {
  return listBuiltinAuditPackages().find((item) => item.id === id) ?? null;
}

export function resolveAuditPackage(args: {
  request: AuditRequest;
  analysis: AnalysisSummary;
  initialTargetClass: TargetClass;
}): AuditPackageDefinition {
  const requested = args.request.audit_package;
  if (requested) {
    const selected = getBuiltinAuditPackage(requested);
    if (!selected) {
      throw new Error(`Unknown audit package '${requested}'.`);
    }
    return selected;
  }

  const runMode = args.request.run_mode ?? "static";
  const looksAgentic = args.initialTargetClass === "tool_using_multi_turn_agent"
    || args.initialTargetClass === "mcp_server_plugin_skill_package"
    || args.analysis.agent_indicators.length > 0
    || args.analysis.mcp_indicators.length > 0
    || args.analysis.tool_execution_indicators.length > 0;

  if (runMode === "validate" || runMode === "runtime" || runMode === "build") {
    return getBuiltinAuditPackage("runtime-validated")!;
  }

  return looksAgentic ? getBuiltinAuditPackage("agentic-static")! : getBuiltinAuditPackage("baseline-static")!;
}