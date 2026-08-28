import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  LIVE_E2E_MAX_REQUESTS,
  LIVE_E2E_MAX_TOKENS,
  assertNoSecretValues,
  boundedPositiveInt,
  collectConfiguredSecrets,
  readOption,
  requireLiveValidationOptIn,
  resolveLiveProvider,
  resolveLiveWorkload,
  resolveSourceRevision,
  safeTerminalReason,
  validateInvocationUsage,
  writeRedactedEvidence
} from "./live-validation-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distApiServer = path.join(repoRoot, "dist", "apps", "api-server", "src", "index.js");
const targetFixture = path.join(repoRoot, "fixtures", "validation-targets", "agent-tool-boundary-risky");
const args = process.argv.slice(2);

function log(message) {
  console.log(`[tethermark:live-audit-e2e] ${message}`);
}

async function copyDirectory(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDirectory(from, to);
    else if (entry.isFile()) await fs.copyFile(from, to);
  }
}

async function stageRuntimeData(workRoot) {
  for (const folder of ["policy-packs", "audit-packages"]) {
    await copyDirectory(path.join(repoRoot, "packages", "core-engine", folder), path.join(workRoot, "packages", "core-engine", folder));
  }
  await copyDirectory(path.join(repoRoot, "node_modules", "sql.js", "dist"), path.join(workRoot, "node_modules", "sql.js", "dist"));
}

function getListeningPort(server) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("API server did not expose a numeric port.");
  return address.port;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function waitForAsyncRun(api, jobId, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const payload = await api("GET", `/runs/async/${encodeURIComponent(jobId)}`);
    const status = payload?.job?.status;
    const attempts = Array.isArray(payload?.attempts) ? payload.attempts : [];
    const latestAttempt = attempts.at(-1) ?? null;
    const currentRunId = payload?.job?.current_run_id;
    const latestAttemptNumber = payload?.job?.latest_attempt_number;
    const latestAttemptMatchesJob =
      latestAttempt &&
      (currentRunId == null || latestAttempt.run_id === currentRunId) &&
      (latestAttemptNumber == null || latestAttempt.attempt_number === latestAttemptNumber);
    const latestAttemptIsTerminal =
      latestAttemptMatchesJob &&
      ["succeeded", "failed", "canceled"].includes(latestAttempt.status);
    if (["succeeded", "failed", "canceled"].includes(status) && latestAttemptIsTerminal) return payload;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for async job ${jobId}`);
}

async function main() {
  requireLiveValidationOptIn();
  const forcedProvider = args.includes("--codex") ? "openai_codex" : undefined;
  const providerId = resolveLiveProvider(args, process.env, forcedProvider);
  const workloadClass = resolveLiveWorkload(providerId);
  const model = readOption(args, "--model") ?? process.env.TETHERMARK_LIVE_LLM_MODEL;
  if (!model) throw new Error("live_model_required: pass --model or set TETHERMARK_LIVE_LLM_MODEL explicitly.");

  const maxRequests = boundedPositiveInt(process.env.TETHERMARK_LIVE_E2E_MAX_REQUESTS, LIVE_E2E_MAX_REQUESTS, LIVE_E2E_MAX_REQUESTS, "TETHERMARK_LIVE_E2E_MAX_REQUESTS");
  // The fixed deep-static validation run is governed by the built-in
  // agentic-static-safe system policy. Keep the live gate inside that policy's
  // immutable 240,000-token ceiling so the release check cannot request a
  // budget that production correctly rejects.
  const maxTokens = boundedPositiveInt(process.env.TETHERMARK_LIVE_E2E_MAX_TOKENS, LIVE_E2E_MAX_TOKENS, LIVE_E2E_MAX_TOKENS, "TETHERMARK_LIVE_E2E_MAX_TOKENS");
  const requestTimeoutMs = boundedPositiveInt(process.env.TETHERMARK_LIVE_REQUEST_TIMEOUT_MS, 180_000, 180_000, "TETHERMARK_LIVE_REQUEST_TIMEOUT_MS");
  const runTimeoutMs = boundedPositiveInt(process.env.TETHERMARK_LIVE_E2E_TIMEOUT_MS, 720_000, 900_000, "TETHERMARK_LIVE_E2E_TIMEOUT_MS");
  const credentialClass = providerId === "openai" ? "api_key" : "chatgpt_session";
  const secrets = collectConfiguredSecrets();
  const sourceRevision = resolveSourceRevision(repoRoot);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const originalCwd = process.cwd();
  const evidenceRoot = path.resolve(process.env.TETHERMARK_LIVE_EVIDENCE_DIR ?? path.join(repoRoot, ".artifacts", "live-validation"));
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-live-audit-e2e-"));
  const apiKey = "phase3-live-e2e-local-api-key";
  const originalEnv = Object.fromEntries([
    "AUDIT_LLM_PROVIDER",
    "AUDIT_LLM_MODEL",
    "AUDIT_LLM_MAX_RETRIES",
    "AUDIT_LLM_REQUEST_TIMEOUT_MS",
    "AUDIT_LLM_CODEX_TIMEOUT_MS",
    "HARNESS_API_AUTH_MODE",
    "HARNESS_API_KEY",
    "HARNESS_DISABLE_LEARNING_SCHEDULER",
    "HARNESS_DISABLE_LOCAL_BINARIES",
    "HARNESS_DISABLE_PYTHON_WORKERS",
    "HARNESS_LOCAL_DB_ROOT",
    "PORT"
  ].map((key) => [key, process.env[key]]));
  let server;
  let evidencePath;

  if (!(await fs.stat(distApiServer).then((item) => item.isFile()).catch(() => false))) {
    throw new Error("Built API server not found. Run npm run build first.");
  }

  try {
    await stageRuntimeData(workRoot);
    process.chdir(workRoot);
    process.env.AUDIT_LLM_PROVIDER = providerId;
    process.env.AUDIT_LLM_MODEL = model;
    process.env.AUDIT_LLM_MAX_RETRIES = "1";
    process.env.AUDIT_LLM_REQUEST_TIMEOUT_MS = String(requestTimeoutMs);
    process.env.AUDIT_LLM_CODEX_TIMEOUT_MS = String(requestTimeoutMs);
    process.env.HARNESS_API_AUTH_MODE = "api_key";
    process.env.HARNESS_API_KEY = apiKey;
    process.env.HARNESS_DISABLE_LEARNING_SCHEDULER = "1";
    process.env.HARNESS_DISABLE_LOCAL_BINARIES = "1";
    process.env.HARNESS_DISABLE_PYTHON_WORKERS = "1";
    process.env.HARNESS_LOCAL_DB_ROOT = path.join(workRoot, "local-db");
    process.env.PORT = "0";

    const { createApiServer } = await import(pathToFileURL(distApiServer).href);
    server = createApiServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${getListeningPort(server)}`;

    async function api(method, route, body, timeoutMs = 30_000) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "x-harness-actor": "phase3-live-validator",
          "x-harness-project": "phase3-live-validation"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let payload;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
      if (!response.ok) {
        const reason = payload && typeof payload === "object" && typeof payload.error === "string"
          ? payload.error
          : "request_failed";
        throw new Error(`${method} ${route} returned ${response.status}: ${reason.slice(0, 500)}`);
      }
      return payload;
    }

    log(`running bounded ${providerId}/${model} audit against the fixed local fixture`);
    const queued = await api("POST", "/runs/async", {
      start_immediately: true,
      request: {
        local_path: targetFixture,
        output_dir: path.join(workRoot, "runs"),
        run_mode: "static",
        audit_package: "deep-static",
        db_mode: "local",
        llm_provider: providerId,
        llm_model: model,
        llm_workload_class: workloadClass,
        llm_credential_class: credentialClass,
        llm_max_requests: maxRequests,
        llm_max_tokens: maxTokens,
        requested_by: "phase3-live-validator",
        hints: {
          requested_run_mode_selection: "static",
          audit_package_overrides: {
            enabled_lanes: ["agentic_controls"],
            max_agent_calls: maxRequests,
            max_total_tokens: maxTokens,
            max_rerun_rounds: 1
          },
          preflight: { strictness: "standard", runtime_allowed: "never", static_tool_gate_policy: "warn" },
          external_audit_tools: { included_tool_ids: [] },
          review: { require_human_review_for_severity: "medium", default_visibility: "internal" }
        }
      }
    });
    assert.ok(queued?.job?.job_id, "Async run did not return a job id.");
    const completed = await waitForAsyncRun(api, queued.job.job_id, runTimeoutMs);
    const latestAttempt = completed.attempts.at(-1);
    if (completed.job.status !== "succeeded" || latestAttempt?.status !== "succeeded") {
      throw new Error(`Async audit ${completed.job.status}: ${latestAttempt?.error ?? completed.job.error ?? "unknown_failure"}`);
    }
    assert.ok(latestAttempt.run_id, "Completed async run did not return a run id.");

    const runId = encodeURIComponent(latestAttempt.run_id);
    const [persistedRun, persistedInvocations, findingsPayload, controlsPayload, evidencePayload, artifactsPayload, sandboxPayload, persistencePayload, markdown, sarif, executive] = await Promise.all([
      api("GET", `/runs/${runId}`),
      api("GET", `/runs/${runId}/agent-invocations`),
      api("GET", `/runs/${runId}/findings`),
      api("GET", `/runs/${runId}/control-results`),
      api("GET", `/runs/${runId}/evidence-records`),
      api("GET", `/runs/${runId}/artifact-index`),
      api("GET", `/artifacts/runs/${runId}/sandbox`),
      api("GET", `/runs/${runId}/persistence`),
      api("GET", `/runs/${runId}/report-markdown`),
      api("GET", `/runs/${runId}/report-sarif`),
      api("GET", `/runs/${runId}/report-executive?format=json`)
    ]);
    const result = {
      run_id: latestAttempt.run_id,
      status: persistedRun.run?.status,
      audit_package: persistedRun.run?.audit_package,
      agent_invocations: persistedInvocations.agent_invocations,
      findings: findingsPayload.findings,
      control_results: controlsPayload.control_results,
      evidence_records: evidencePayload.evidence_records,
      artifacts: artifactsPayload.artifact_index,
      sandbox: sandboxPayload.artifact?.payload,
      persistence: persistencePayload.persistence
    };

    assert.equal(result.status, "succeeded");
    assert.equal(result.audit_package, "deep-static");
    assert.equal(result.sandbox?.run_mode, "static");
    assert.equal(result.sandbox?.command_policy?.allow_target_execution, false);
    assert.ok(result.persistence?.root, "Run did not persist its result bundle.");
    assert.ok(Array.isArray(result.artifacts) && result.artifacts.length > 0, "Run did not produce artifacts.");
    assert.ok(Array.isArray(result.control_results) && result.control_results.length > 0, "Run did not produce control results.");
    assert.ok(Array.isArray(result.evidence_records) && result.evidence_records.length > 0, "Run did not produce evidence records.");
    assert.ok(Array.isArray(result.findings) && result.findings.length > 0, "Fixed risky fixture did not produce findings.");
    assert.ok(result.findings.every((finding) => Array.isArray(finding.evidence_json) && finding.evidence_json.length > 0), "At least one finding lacked evidence citations.");

    const expectedAgents = ["planner_agent", "threat_model_agent", "eval_selection_agent", "lane_specialist_agent", "audit_supervisor_agent", "remediation_agent"];
    const invokedAgents = new Set(result.agent_invocations.map((item) => item.agent_name));
    for (const agentName of expectedAgents) assert.ok(invokedAgents.has(agentName), `Missing live ${agentName} invocation.`);
    const usage = validateInvocationUsage(result.agent_invocations, { maxRequests, maxTokens, maxRetries: 1 });
    assert.ok(result.agent_invocations.every((item) => item.provider === providerId && item.model === model));
    assert.ok(result.agent_invocations.every((item) => item.workload_class === workloadClass && item.credential_class === credentialClass));

    assert.equal(persistedRun.run?.status, "succeeded");
    assert.equal(persistedInvocations.agent_invocations?.length, result.agent_invocations.length);
    assert.ok(typeof markdown.report_markdown === "string" && markdown.report_markdown.length > 0);
    assert.ok(sarif.report_sarif?.version === "2.1.0");
    assert.ok(executive.export_schema && executive.report_executive);
    assertNoSecretValues({ result, persistedInvocations, markdown, sarif, executive }, [...secrets, apiKey]);
    assert.ok(Date.now() - started <= runTimeoutMs + 5_000, "Live audit exceeded the bounded run timeout window.");

    evidencePath = await writeRedactedEvidence({
      schema_version: "phase3-live-evidence.v1",
      validation_type: "audit_e2e",
      source_revision: sourceRevision,
      status: "passed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      provider: providerId,
      model,
      workload_class: workloadClass,
      credential_class: credentialClass,
      target_fixture: "agent-tool-boundary-risky",
      audit_package: "deep-static",
      run_id: result.run_id,
      request_count: usage.requestCount,
      max_requests: maxRequests,
      total_tokens: usage.totalTokens,
      max_tokens: maxTokens,
      max_retries: 1,
      request_timeout_ms: requestTimeoutMs,
      run_timeout_ms: runTimeoutMs,
      agent_names: [...invokedAgents].sort(),
      finding_count: result.findings.length,
      cited_finding_count: result.findings.filter((finding) => finding.evidence_json?.length).length,
      control_result_count: result.control_results.length,
      evidence_record_count: result.evidence_records.length,
      artifact_count: result.artifacts.length,
      assertions: {
        structured_agent_outputs: true,
        required_agent_stages_completed: true,
        findings_have_evidence_citations: true,
        measured_usage_within_budget: true,
        retry_ceiling_respected: true,
        persistence_round_trip: true,
        markdown_export: true,
        sarif_export: true,
        executive_export: true,
        configured_credentials_absent: true,
        static_target_execution_blocked: true
      },
      raw_model_output_retained: false,
      raw_source_retained_in_evidence: false
    }, { prefix: "live-audit-e2e", outputRoot: evidenceRoot, secretValues: [...secrets, apiKey], pathValues: [repoRoot, workRoot, targetFixture] });
    log(`passed; redacted evidence: ${evidencePath}`);
  } catch (error) {
    evidencePath = await writeRedactedEvidence({
      schema_version: "phase3-live-evidence.v1",
      validation_type: "audit_e2e",
      source_revision: sourceRevision,
      status: "failed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      provider: providerId,
      model,
      workload_class: workloadClass,
      credential_class: credentialClass,
      target_fixture: "agent-tool-boundary-risky",
      audit_package: "deep-static",
      max_requests: maxRequests,
      max_tokens: maxTokens,
      max_retries: 1,
      request_timeout_ms: requestTimeoutMs,
      run_timeout_ms: runTimeoutMs,
      terminal_reason: safeTerminalReason(error, { secretValues: [...secrets, apiKey], pathValues: [repoRoot, workRoot, targetFixture] }),
      raw_model_output_retained: false
    }, { prefix: "live-audit-e2e", outputRoot: evidenceRoot, secretValues: [...secrets, apiKey], pathValues: [repoRoot, workRoot, targetFixture] }).catch(() => undefined);
    if (evidencePath) console.error(`[tethermark:live-audit-e2e] redacted failure evidence: ${evidencePath}`);
    throw error;
  } finally {
    if (server) await closeServer(server).catch(() => undefined);
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (process.env.TETHERMARK_LIVE_E2E_KEEP_TEMP !== "1") await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[tethermark:live-audit-e2e] failed", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
