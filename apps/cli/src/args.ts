import fs from "node:fs";
import path from "node:path";

import type { AuditRequest } from "../../../packages/core-engine/src/index.js";

export function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function readFlags(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}

export function readBooleanFlag(args: string[], name: string): boolean | undefined {
  const raw = readFlag(args, name);
  if (!raw) return undefined;
  if (/^(1|true|yes)$/i.test(raw)) return true;
  if (/^(0|false|no)$/i.test(raw)) return false;
  return undefined;
}

export function readNumberFlag(args: string[], name: string): number | undefined {
  const raw = readFlag(args, name);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildScanRequest(args: string[]): { request: AuditRequest; targetType: string | undefined; targetValue: string | undefined } {
  const targetType = args[1];
  const targetValue = args[2];
  const runMode = (readFlag(args, "--mode") as AuditRequest["run_mode"]) ?? "static";
  const policyPath = readFlag(args, "--policy");
  const workloadClass = (readFlag(args, "--llm-workload") as AuditRequest["llm_workload_class"]) ?? "interactive_operator";

  const request: AuditRequest = {
    run_mode: runMode,
    output_dir: readFlag(args, "--output") ? path.resolve(readFlag(args, "--output")!) : undefined,
    llm_provider: (readFlag(args, "--llm-provider") as AuditRequest["llm_provider"]) ?? undefined,
    llm_model: readFlag(args, "--llm-model") ?? undefined,
    llm_api_key: readFlag(args, "--llm-api-key") ?? undefined,
    llm_workload_class: workloadClass,
    llm_credential_class: readFlag(args, "--llm-credential-class") as AuditRequest["llm_credential_class"] | undefined,
    llm_max_requests: readNumberFlag(args, "--llm-max-requests"),
    llm_max_tokens: readNumberFlag(args, "--llm-max-tokens"),
    audit_policy_pack: readFlag(args, "--policy-pack") ?? undefined,
    audit_policy: policyPath ? JSON.parse(fs.readFileSync(path.resolve(policyPath), "utf8")) : undefined,
    audit_package: readFlag(args, "--package") as AuditRequest["audit_package"] | undefined,
    db_mode: readFlag(args, "--db-mode") as AuditRequest["db_mode"] | undefined,
    requested_by: workloadClass === "interactive_operator" ? (process.env.USERNAME ?? process.env.USER ?? "local-cli-operator") : undefined
  };

  if (readBooleanFlag(args, "--accept-runtime-warning") === true) {
    request.hints = {
      runtime_sandbox_accepted_at: new Date().toISOString(),
      launch_intent: { source_surface: "cli", preflight_accepted_at: new Date().toISOString() }
    };
  }

  if (targetType === "path" && targetValue) request.local_path = path.resolve(targetValue);
  else if (targetType === "repo" && targetValue) request.repo_url = targetValue;
  else if (targetType === "endpoint" && targetValue) request.endpoint_url = targetValue;

  return { request, targetType, targetValue };
}
