import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AuditPolicyArtifact,
  AuditRequest,
  ControlWaiverRule,
  FindingSuppressionRule
} from "./contracts.js";

export interface AuditPolicyPackDefinition {
  id: string;
  name: string;
  version: string;
  source: "builtin" | "file";
  policy: AuditPolicyArtifact;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolvePolicyPackDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "packages", "core-engine", "policy-packs"),
    path.resolve(MODULE_DIR, "..", "policy-packs"),
    path.resolve(MODULE_DIR, "..", "..", "..", "packages", "core-engine", "policy-packs")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`Policy pack directory not found. Checked: ${candidates.join(", ")}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSuppressionRule(rule: FindingSuppressionRule, context: string, index: number): void {
  if (!isNonEmptyString(rule.rule_id)) {
    throw new Error(`${context}: finding_suppressions[${index}] is missing a non-empty rule_id.`);
  }
  if (!isNonEmptyString(rule.reason)) {
    throw new Error(`${context}: finding_suppressions[${index}] is missing a non-empty reason.`);
  }
  const selectorCount = [rule.finding_ids?.length, rule.categories?.length, rule.control_ids?.length, rule.title_contains?.length]
    .filter((value) => (value ?? 0) > 0).length;
  if (selectorCount === 0) {
    throw new Error(`${context}: finding_suppressions[${index}] must define at least one selector.`);
  }
}

function validateWaiverRule(rule: ControlWaiverRule, context: string, index: number): void {
  if (!isNonEmptyString(rule.rule_id)) {
    throw new Error(`${context}: control_waivers[${index}] is missing a non-empty rule_id.`);
  }
  if (!isNonEmptyString(rule.reason)) {
    throw new Error(`${context}: control_waivers[${index}] is missing a non-empty reason.`);
  }
  if (!Array.isArray(rule.control_ids) || rule.control_ids.length === 0 || !rule.control_ids.every(isNonEmptyString)) {
    throw new Error(`${context}: control_waivers[${index}] must include one or more non-empty control_ids.`);
  }
}

export function validateAuditPolicyPackDefinition(pack: AuditPolicyPackDefinition, context = "policy pack"): AuditPolicyPackDefinition {
  if (!isNonEmptyString(pack.id)) throw new Error(`${context}: missing non-empty id.`);
  if (!isNonEmptyString(pack.name)) throw new Error(`${context}: missing non-empty name.`);
  if (!isNonEmptyString(pack.version)) throw new Error(`${context}: missing non-empty version.`);
  if (!pack.policy || typeof pack.policy !== "object") throw new Error(`${context}: missing policy object.`);

  const policy = pack.policy;
  if (!isNonEmptyString(policy.version ?? pack.version)) throw new Error(`${context}: policy.version must be a non-empty string.`);
  if (!isNonEmptyString(policy.profile)) throw new Error(`${context}: policy.profile must be a non-empty string.`);

  for (const [field, value] of [
    ["objectives", policy.objectives],
    ["control_decision_rules", policy.control_decision_rules],
    ["evidence_requirements", policy.evidence_requirements],
    ["publication_rules", policy.publication_rules],
    ["custom_context", policy.custom_context]
  ] as const) {
    if (value != null && (!Array.isArray(value) || !value.every((item) => typeof item === "string"))) {
      throw new Error(`${context}: policy.${field} must be an array of strings when provided.`);
    }
  }

  if (policy.finding_suppressions != null && !Array.isArray(policy.finding_suppressions)) {
    throw new Error(`${context}: policy.finding_suppressions must be an array when provided.`);
  }
  if (policy.control_waivers != null && !Array.isArray(policy.control_waivers)) {
    throw new Error(`${context}: policy.control_waivers must be an array when provided.`);
  }

  (policy.finding_suppressions ?? []).forEach((rule, index) => validateSuppressionRule(rule, context, index));
  (policy.control_waivers ?? []).forEach((rule, index) => validateWaiverRule(rule, context, index));

  return pack;
}

function normalizePackDefinition(pack: AuditPolicyPackDefinition, source: AuditPolicyPackDefinition["source"]): AuditPolicyPackDefinition {
  return validateAuditPolicyPackDefinition({
    ...pack,
    source,
    policy: {
      ...pack.policy,
      policy_pack_id: pack.id,
      policy_pack_name: pack.name,
      policy_pack_source: source
    }
  }, `policy pack '${pack.id ?? "unknown"}'`);
}

function readBuiltinPolicyPackFiles(): AuditPolicyPackDefinition[] {
  const policyPackDir = resolvePolicyPackDir();
  const entries = fs.readdirSync(policyPackDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name));

  const packs = entries.map((entry) => {
    const filePath = path.join(policyPackDir, entry.name);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as AuditPolicyPackDefinition;
    return normalizePackDefinition(parsed, "builtin");
  });

  const seenIds = new Set<string>();
  for (const pack of packs) {
    if (seenIds.has(pack.id)) {
      throw new Error(`Duplicate built-in policy pack id '${pack.id}' in ${policyPackDir}.`);
    }
    seenIds.add(pack.id);
  }

  return packs;
}

function tryResolvePolicyPackFile(candidate: string): string | null {
  const resolved = path.resolve(candidate);
  if (!fs.existsSync(resolved)) return null;
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return null;
  return resolved;
}

function readPolicyPackFromFile(filePath: string): AuditPolicyPackDefinition {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as AuditPolicyPackDefinition;
  return validateAuditPolicyPackDefinition(normalizePackDefinition(parsed, "file"), `policy pack file '${filePath}'`);
}

function mergeArray<T>(base: T[] | undefined, override: T[] | undefined): T[] {
  if (override && override.length > 0) return override;
  return base ?? [];
}

function mergePolicy(base: AuditPolicyArtifact, override: AuditPolicyArtifact): AuditPolicyArtifact {
  return {
    ...base,
    ...override,
    objectives: mergeArray(base.objectives, override.objectives),
    control_decision_rules: mergeArray(base.control_decision_rules, override.control_decision_rules),
    evidence_requirements: mergeArray(base.evidence_requirements, override.evidence_requirements),
    publication_rules: mergeArray(base.publication_rules, override.publication_rules),
    custom_context: mergeArray(base.custom_context, override.custom_context),
    finding_suppressions: mergeArray(base.finding_suppressions, override.finding_suppressions),
    control_waivers: mergeArray(base.control_waivers, override.control_waivers)
  };
}

export function listBuiltinAuditPolicyPacks(): AuditPolicyPackDefinition[] {
  return readBuiltinPolicyPackFiles();
}

export function getBuiltinAuditPolicyPack(id: string): AuditPolicyPackDefinition | null {
  return listBuiltinAuditPolicyPacks().find((item) => item.id === id) ?? null;
}

export function resolvePolicyPackReference(reference?: string): AuditPolicyPackDefinition | null {
  if (!reference) return getBuiltinAuditPolicyPack("default");
  const filePath = tryResolvePolicyPackFile(reference);
  if (filePath) return readPolicyPackFromFile(filePath);
  const builtin = getBuiltinAuditPolicyPack(reference);
  if (builtin) return builtin;
  throw new Error(`Unknown policy pack reference '${reference}'. Use a built-in pack id or a JSON file path.`);
}

export function resolveAuditPolicy(request: AuditRequest): AuditPolicyArtifact {
  const selectedPack = resolvePolicyPackReference(request.audit_policy_pack) ?? getBuiltinAuditPolicyPack("default");
  const base = selectedPack?.policy ?? {};
  const provided = request.audit_policy ?? {};
  const merged = mergePolicy(base, provided);

  return {
    version: merged.version ?? selectedPack?.version ?? "2026-04-13.audit-policy.v1",
    profile: merged.profile ?? selectedPack?.policy.profile ?? "default_audit_supervision",
    policy_pack_id: selectedPack?.id ?? null,
    policy_pack_name: selectedPack?.name ?? null,
    policy_pack_source: request.audit_policy ? (selectedPack ? "merged" : "request") : (selectedPack?.source ?? "request"),
    organization: merged.organization ?? null,
    objectives: merged.objectives ?? [],
    control_decision_rules: merged.control_decision_rules ?? [],
    evidence_requirements: merged.evidence_requirements ?? [],
    publication_rules: merged.publication_rules ?? [],
    custom_context: merged.custom_context ?? [],
    finding_suppressions: merged.finding_suppressions ?? [],
    control_waivers: merged.control_waivers ?? []
  };
}