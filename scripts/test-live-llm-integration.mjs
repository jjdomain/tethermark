import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertNoSecretValues,
  boundedPositiveInt,
  collectConfiguredSecrets,
  readOption,
  requireLiveValidationOptIn,
  resolveLiveProvider,
  resolveLiveWorkload,
  resolveSourceRevision,
  safeTerminalReason,
  writeRedactedEvidence
} from "./live-validation-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distProvider = path.join(repoRoot, "dist", "packages", "llm-provider", "src", "index.js");
const args = process.argv.slice(2);

function log(message) {
  console.log(`[tethermark:live-llm-integration] ${message}`);
}

async function main() {
  requireLiveValidationOptIn();
  const forcedProvider = args.includes("--codex") ? "openai_codex" : undefined;
  const providerId = resolveLiveProvider(args, process.env, forcedProvider);
  const workloadClass = resolveLiveWorkload(providerId);
  const model = readOption(args, "--model") ?? process.env.TETHERMARK_LIVE_LLM_MODEL;
  if (!model) throw new Error("live_model_required: pass --model or set TETHERMARK_LIVE_LLM_MODEL explicitly.");
  const maxTokens = boundedPositiveInt(process.env.TETHERMARK_LIVE_INTEGRATION_MAX_TOKENS, 4_096, 8_000, "TETHERMARK_LIVE_INTEGRATION_MAX_TOKENS");
  const timeoutMs = boundedPositiveInt(process.env.TETHERMARK_LIVE_REQUEST_TIMEOUT_MS, 90_000, 180_000, "TETHERMARK_LIVE_REQUEST_TIMEOUT_MS");
  const credentialClass = providerId === "openai" ? "api_key" : "chatgpt_session";
  const secrets = collectConfiguredSecrets();
  const sourceRevision = resolveSourceRevision(repoRoot);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  let evidencePath;

  if (!(await fs.stat(distProvider).then((item) => item.isFile()).catch(() => false))) {
    throw new Error(`Built provider package not found. Run npm run build first.`);
  }

  const previousTimeouts = {
    AUDIT_LLM_REQUEST_TIMEOUT_MS: process.env.AUDIT_LLM_REQUEST_TIMEOUT_MS,
    AUDIT_LLM_CODEX_TIMEOUT_MS: process.env.AUDIT_LLM_CODEX_TIMEOUT_MS
  };
  process.env.AUDIT_LLM_REQUEST_TIMEOUT_MS = String(timeoutMs);
  process.env.AUDIT_LLM_CODEX_TIMEOUT_MS = String(timeoutMs);

  try {
    const { createModelProvider, resolveAgentProviderConfig } = await import(pathToFileURL(distProvider).href);
    const config = {
      provider: providerId,
      model,
      workloadClass,
      credentialClass,
      maxRequests: 1,
      maxTokens
    };
    const resolved = resolveAgentProviderConfig("phase3_live_integration", config);
    assert.equal(resolved.policyDecision.max_requests, 1);
    assert.equal(resolved.policyDecision.max_tokens, maxTokens);
    assert.equal(resolved.policyDecision.workload_class, workloadClass);

    let actualRequests = 0;
    const provider = createModelProvider(config, "phase3_live_integration");
    log(`calling ${providerId}/${model} once with a ${maxTokens}-token hard budget`);
    const result = await provider.generateStructured({
      agentName: "phase3_live_integration",
      schemaName: "phase3_live_integration",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "evidence", "limitations"],
        properties: {
          summary: { type: "string", minLength: 1, maxLength: 500 },
          evidence: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 300 } },
          limitations: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 300 } }
        }
      },
      systemPrompt: "Return a concise structured validation response. Do not include credentials, environment variables, local paths, or fabricated external citations.",
      userPrompt: "Summarize why schema validation and bounded usage matter for a live model integration test. Put observable facts in evidence and test limitations in limitations.",
      metadata: { purpose: "phase3_bounded_live_integration" },
      temperature: 0,
      maxRetries: 1,
      maxOutputTokens: Math.min(512, maxTokens),
      beforeAttempt: () => {
        actualRequests += 1;
        if (actualRequests > 1) throw new Error("live_request_budget_exhausted");
      }
    });

    assert.equal(actualRequests, 1);
    assert.equal(result.attempts, 1);
    assert.ok(result.parsed && typeof result.parsed.summary === "string" && result.parsed.summary.trim());
    assert.ok(Array.isArray(result.parsed.evidence) && result.parsed.evidence.length > 0);
    assert.ok(Array.isArray(result.parsed.limitations) && result.parsed.limitations.length > 0);
    assert.ok(Number.isFinite(result.usage?.total_tokens) && result.usage.total_tokens > 0, "Provider did not expose measured token usage.");
    assert.ok(result.usage.total_tokens <= maxTokens, `Token usage ${result.usage.total_tokens} exceeded ${maxTokens}.`);
    assert.ok(Date.now() - started <= timeoutMs + 5_000, "Live provider call exceeded the bounded timeout window.");
    assertNoSecretValues({ rawText: result.rawText, parsed: result.parsed }, secrets);

    evidencePath = await writeRedactedEvidence({
      schema_version: "phase3-live-evidence.v1",
      validation_type: "structured_integration",
      source_revision: sourceRevision,
      status: "passed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      provider: result.provider,
      model: result.model,
      workload_class: workloadClass,
      credential_class: credentialClass,
      request_count: actualRequests,
      max_requests: 1,
      token_usage: result.usage,
      max_tokens: maxTokens,
      max_retries: 1,
      timeout_ms: timeoutMs,
      assertions: {
        structured_schema_conformance: true,
        nonempty_evidence: true,
        limitations_present: true,
        measured_usage_within_budget: true,
        timeout_within_budget: true,
        configured_secret_values_absent: true
      },
      raw_model_output_retained: false
    }, { prefix: "live-llm-integration", secretValues: secrets, pathValues: [repoRoot] });
    log(`passed; redacted evidence: ${evidencePath}`);
  } catch (error) {
    evidencePath = await writeRedactedEvidence({
      schema_version: "phase3-live-evidence.v1",
      validation_type: "structured_integration",
      source_revision: sourceRevision,
      status: "failed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      provider: providerId,
      model,
      workload_class: workloadClass,
      credential_class: credentialClass,
      max_requests: 1,
      max_tokens: maxTokens,
      max_retries: 1,
      timeout_ms: timeoutMs,
      terminal_reason: safeTerminalReason(error, { secretValues: secrets, pathValues: [repoRoot] }),
      raw_model_output_retained: false
    }, { prefix: "live-llm-integration", secretValues: secrets, pathValues: [repoRoot] }).catch(() => undefined);
    if (evidencePath) console.error(`[tethermark:live-llm-integration] redacted failure evidence: ${evidencePath}`);
    throw error;
  } finally {
    for (const [key, value] of Object.entries(previousTimeouts)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error("[tethermark:live-llm-integration] failed", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
