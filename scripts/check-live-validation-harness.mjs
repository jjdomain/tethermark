import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  LIVE_VALIDATION_OPT_IN,
  assertNoSecretValues,
  boundedPositiveInt,
  redactEvidence,
  requireLiveValidationOptIn,
  resolveLiveProvider,
  resolveLiveWorkload,
  resolveSourceRevision,
  safeTerminalReason,
  validateInvocationUsage,
  writeRedactedEvidence
} from "./live-validation-lib.mjs";

function assertThrowsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof Error && error.message.includes(code));
}

async function main() {
  assertThrowsCode(() => requireLiveValidationOptIn({}), "live_validation_opt_in_required");
  requireLiveValidationOptIn({ TETHERMARK_LIVE_MODEL_VALIDATION: LIVE_VALIDATION_OPT_IN });
  assertThrowsCode(() => resolveLiveProvider([], {}), "live_provider_required");
  assertThrowsCode(() => resolveLiveProvider(["--provider", "mock"], {}), "live_provider_invalid");
  assertThrowsCode(() => resolveLiveProvider(["--provider", "openai"], {}), "live_api_key_required");
  assert.equal(resolveLiveProvider(["--provider", "openai"], { OPENAI_API_KEY: "test-placeholder-key" }), "openai");
  assertThrowsCode(() => resolveLiveProvider([], { CI: "true" }, "openai_codex"), "chatgpt_session_ci_blocked");
  assertThrowsCode(() => resolveLiveWorkload("openai_codex", { TETHERMARK_LIVE_WORKLOAD_CLASS: "external_service" }), "chatgpt_session_workload_blocked");
  assert.equal(resolveLiveWorkload("openai", { CI: "true" }), "external_service");
  assert.equal(resolveSourceRevision(process.cwd(), { GITHUB_SHA: "A".repeat(40) }), "a".repeat(40));
  assert.equal(boundedPositiveInt(undefined, 4, 8, "budget"), 4);
  assertThrowsCode(() => boundedPositiveInt("9", 4, 8, "budget"), "no greater than 8");

  const usage = validateInvocationUsage([
    { status: "success", request_index: 1, attempts: 1, total_tokens: 17 },
    { status: "success", request_index: 2, attempts: 2, total_tokens: 23 }
  ], { maxRequests: 3, maxTokens: 40, maxRetries: 2 });
  assert.deepEqual(usage, { requestCount: 3, totalTokens: 40 });
  assert.throws(() => validateInvocationUsage([
    { status: "success", request_index: 1, attempts: 2, total_tokens: 10 }
  ], { maxRequests: 1, maxTokens: 20, maxRetries: 2 }), /exceeded/);

  const secret = "sk-phase3-test-placeholder";
  const bearer = "Bearer phase3.test.token";
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwaGFzZTMifQ.signature";
  const localPath = "D:\\private\\phase3";
  const redacted = redactEvidence({
    api_key: secret,
    nested: [`prefix ${secret}`, bearer, jwt, localPath],
    safe: "retained"
  }, { secretValues: [secret], pathValues: [localPath] });
  const serialized = JSON.stringify(redacted);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(bearer), false);
  assert.equal(serialized.includes(jwt), false);
  assert.equal(serialized.includes(localPath), false);
  assert.match(serialized, /retained/);
  assertNoSecretValues(redacted, [secret]);
  assert.equal(safeTerminalReason(new Error(`failed at ${localPath} with ${secret}`), {
    secretValues: [secret], pathValues: [localPath]
  }).includes(secret), false);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-live-harness-"));
  try {
    const evidencePath = await writeRedactedEvidence({
      schema_version: "phase3-live-evidence.v1",
      status: "failed",
      terminal_reason: `failed at ${localPath} with ${secret}`,
      authorization: bearer
    }, { prefix: "harness-self-test", outputRoot: root, secretValues: [secret], pathValues: [localPath] });
    const persisted = await fs.readFile(evidencePath, "utf8");
    assert.equal(persisted.includes(secret), false);
    assert.equal(persisted.includes(localPath), false);
    assert.match(path.basename(evidencePath), /^harness-self-test-\d{4}-\d{2}-\d{2}T/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }

  console.log("[tethermark:live-validation-harness] deterministic fail-closed and redaction checks passed");
}

main().catch((error) => {
  console.error("[tethermark:live-validation-harness] failed", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
