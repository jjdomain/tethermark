import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export const LIVE_VALIDATION_OPT_IN = "I_UNDERSTAND_THIS_USES_A_LIVE_MODEL";
export const LIVE_PROVIDERS = new Set(["openai", "openai_codex"]);

const sensitiveKeyPattern = /(api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|password|secret|cookie)/i;
const credentialPatterns = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
];

export function requireLiveValidationOptIn(env = process.env) {
  if (env.TETHERMARK_LIVE_MODEL_VALIDATION !== LIVE_VALIDATION_OPT_IN) {
    throw new Error(
      `live_validation_opt_in_required: set TETHERMARK_LIVE_MODEL_VALIDATION=${LIVE_VALIDATION_OPT_IN} for this one command.`
    );
  }
}

export function readOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function resolveLiveProvider(args = process.argv.slice(2), env = process.env, forcedProvider) {
  const provider = forcedProvider ?? readOption(args, "--provider") ?? env.TETHERMARK_LIVE_LLM_PROVIDER;
  if (!provider) {
    throw new Error("live_provider_required: pass --provider openai|openai_codex or set TETHERMARK_LIVE_LLM_PROVIDER explicitly.");
  }
  if (!LIVE_PROVIDERS.has(provider)) {
    throw new Error(`live_provider_invalid: '${provider}' is not a supported live validation provider.`);
  }
  if (provider === "openai" && ![env.AUDIT_LLM_API_KEY, env.LLM_API_KEY, env.OPENAI_API_KEY].some((value) => typeof value === "string" && value.trim())) {
    throw new Error("live_api_key_required: configure AUDIT_LLM_API_KEY, LLM_API_KEY, or OPENAI_API_KEY.");
  }
  if (provider === "openai_codex" && env.CI === "true") {
    throw new Error("chatgpt_session_ci_blocked: openai_codex live validation must run as an explicit local operator, not on ordinary hosted CI.");
  }
  return provider;
}

export function resolveLiveWorkload(provider, env = process.env) {
  const workload = env.TETHERMARK_LIVE_WORKLOAD_CLASS
    ?? (env.CI === "true" ? "external_service" : "interactive_operator");
  if (!new Set(["interactive_operator", "external_service"]).has(workload)) {
    throw new Error(`live_workload_invalid: '${workload}' is not allowed for live validation.`);
  }
  if (provider === "openai_codex" && workload !== "interactive_operator") {
    throw new Error("chatgpt_session_workload_blocked: openai_codex requires interactive_operator live validation.");
  }
  return workload;
}

function redactString(value, secretValues, pathValues) {
  let redacted = value;
  for (const secret of secretValues) {
    if (secret) redacted = redacted.split(secret).join("[redacted-secret]");
  }
  for (const localPath of pathValues) {
    if (localPath) redacted = redacted.split(localPath).join("[redacted-local-path]");
  }
  for (const pattern of credentialPatterns) redacted = redacted.replace(pattern, "[redacted-credential]");
  return redacted;
}

export function redactEvidence(value, options = {}) {
  const secretValues = [...new Set((options.secretValues ?? []).filter((item) => typeof item === "string" && item.length >= 4))];
  const pathValues = [...new Set((options.pathValues ?? []).filter((item) => typeof item === "string" && item.length >= 3))]
    .sort((a, b) => b.length - a.length);
  const visit = (item) => {
    if (typeof item === "string") return redactString(item, secretValues, pathValues);
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[redacted-secret]" : visit(child)
    ]));
  };
  return visit(value);
}

export function assertNoSecretValues(value, secretValues) {
  const serialized = JSON.stringify(value);
  for (const secret of secretValues.filter((item) => typeof item === "string" && item.length >= 4)) {
    assert.equal(serialized.includes(secret), false, "Live validation output included a configured secret value.");
  }
  assert.doesNotMatch(serialized, /\bsk-[A-Za-z0-9_-]{8,}\b/, "Live validation output included an API-key-shaped value.");
  assert.doesNotMatch(serialized, /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/i, "Live validation output included a bearer credential.");
}

export function collectConfiguredSecrets(env = process.env) {
  return [...new Set(Object.entries(env)
    .filter(([key, value]) => sensitiveKeyPattern.test(key) && typeof value === "string" && value.trim())
    .map(([, value]) => value))];
}

export function resolveSourceRevision(repoRoot, env = process.env) {
  const workflowRevision = env.GITHUB_SHA?.trim();
  if (workflowRevision && /^[a-f0-9]{40}$/i.test(workflowRevision)) return workflowRevision.toLowerCase();
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true
  });
  const revision = result.status === 0 ? result.stdout.trim() : "";
  return /^[a-f0-9]{40}$/i.test(revision) ? revision.toLowerCase() : "unknown";
}

export function safeTerminalReason(error, options = {}) {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  const redacted = redactEvidence(`${name}: ${message}`, options);
  return String(redacted).replace(/\s+/g, " ").slice(0, 500);
}

export function boundedPositiveInt(value, fallback, maximum, label) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${label} must be a positive integer no greater than ${maximum}.`);
  }
  return parsed;
}

export async function writeRedactedEvidence(summary, options = {}) {
  const outputRoot = path.resolve(options.outputRoot ?? process.env.TETHERMARK_LIVE_EVIDENCE_DIR ?? path.join(process.cwd(), ".artifacts", "live-validation"));
  await fs.mkdir(outputRoot, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${options.prefix ?? "live-validation"}-${timestamp}.json`;
  const outputPath = path.join(outputRoot, filename);
  const redacted = redactEvidence(summary, options);
  const tempPath = `${outputPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(redacted, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, outputPath);
  return outputPath;
}

export function validateInvocationUsage(invocations, limits) {
  assert.ok(Array.isArray(invocations) && invocations.length > 0, "Live validation produced no model invocations.");
  const requestCount = invocations.reduce((sum, item) => sum + Number(item.attempts ?? 0), 0);
  const totalTokens = invocations.reduce((sum, item) => sum + Number(item.total_tokens ?? 0), 0);
  assert.ok(invocations.every((item) => item.status === "success"), "At least one live invocation did not complete successfully.");
  assert.ok(invocations.every((item) => Number.isInteger(item.request_index) && item.request_index > 0), "Invocation request indexes were not auditable.");
  assert.ok(invocations.every((item) => Number.isInteger(item.attempts) && item.attempts > 0 && item.attempts <= limits.maxRetries), "Invocation retry count exceeded the configured ceiling.");
  assert.ok(invocations.every((item) => Number.isFinite(item.total_tokens) && item.total_tokens > 0), "A live invocation did not expose measured token usage.");
  assert.ok(requestCount <= limits.maxRequests, `Provider request count ${requestCount} exceeded ${limits.maxRequests}.`);
  assert.ok(totalTokens <= limits.maxTokens, `Provider token usage ${totalTokens} exceeded ${limits.maxTokens}.`);
  return { requestCount, totalTokens };
}
