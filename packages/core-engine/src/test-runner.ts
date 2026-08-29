import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildRunComparisonReport, createApiServer } from "../../../apps/api-server/src/index.js";
import { createWebUiServer } from "../../../apps/web-ui/src/index.js";
import { analyzeBenchmarkVariance, buildBenchmarkFindingSummaries, buildBenchmarkScoringSummaries, compareBenchmarkReports, containsAffirmativeRuntimeClaim, evaluateExternalGroundTruth, loadBenchmarkSuite, runBenchmarkSuite, selectBenchmarkCases } from "../../../apps/cli/src/benchmark-suite.js";
import { buildScanRequest } from "../../../apps/cli/src/args.js";
import { validateFixtures } from "../../../apps/cli/src/fixture-validation.js";
import { buildDockerRuntimeFixtureCreateArgs, RUNTIME_FIXTURE_IMAGE, validateDockerRuntimeFixtureInspect } from "../../../apps/cli/src/runtime-fixtures.js";
import { describeArtifactType } from "./artifact-policy.js";
import { pruneArtifacts, runScheduledArtifactRetention } from "./artifact-retention.js";
import { buildPlannerContext } from "./agent-context-builders.js";
import { executeEvidenceProvider, normalizeEvidenceSummaryForTests, normalizePublicScorecardProject, normalizePythonWorkerForTests, resetEvidenceProviderCapabilityCacheForTests } from "./evidence-providers.js";
import { buildFixedCalibrationEvidenceSelection, CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION, CALIBRATION_STATIC_EVIDENCE_PROVIDER_IDS } from "./evidence-selection-policy.js";
import { buildFindingEvaluationSummary } from "./finding-evaluation.js";
import { buildFindingQualitySummary } from "./finding-quality.js";
import { attachOperatorLaunchApprovals, createHumanApprovalRecord, isValidHumanApprovalRecord, requireRequestHumanApproval } from "./human-approval.js";
import { validateAuditPolicyPackDefinition } from "./audit-policy.js";
import { applyLearningOverlayEvidenceRules, applyLearningOverlayPlannerRules, resolveLearningOverlays } from "./learning-overlays.js";
import { createEngine, updateControlResultsWithFindings } from "./orchestrator.js";
import { buildHeuristicTargetProfile } from "./planner.js";
import { assertAuditRequestProviderPolicy } from "./provider-policy.js";
import { buildPreflightSummary } from "./preflight.js";
import { analyzeTarget } from "./repo.js";
import { PYTHON_WORKER_DEFAULT_MAX_ATTEMPTS, PYTHON_WORKER_DEFAULT_OUTPUT_BYTES, PYTHON_WORKER_DEFAULT_TIMEOUT_MS, PYTHON_WORKER_MAX_ATTEMPTS, PYTHON_WORKER_MAX_OUTPUT_BYTES, PYTHON_WORKER_MAX_TIMEOUT_MS, resetPythonWorkerCapabilityCacheForTests, resolvePythonWorkerInvocationLimits, resolvePythonWorkerRetryPolicy, runPythonWorkerAttemptsForTests } from "./python-worker.js";
import { inspectPythonWorkerEnvironment, isSupportedPythonWorkerVersion, parsePythonVersion, parsePythonWorkerLock, pythonWorkerVenvExecutable, resolvePythonWorkerExecutable } from "./python-worker-environment.js";
import { resolveAssessmentEvidenceProviderIds } from "./stages/stage-assess-controls.js";
import { assessRuntimeRepeatability, buildRuntimeEvidenceRecords, normalizeRuntimeEvaluation, RUNTIME_MINIMUM_REPEAT_RUNS } from "./runtime-evidence.js";
import { applyControlDowngrades, applyUnsupportedFindingDrops, mergeSelectiveAssessmentCycle, retainFindingsSupportedByFinalControls } from "./stages/stage-corrections.js";
import { createPersistenceStore } from "./persistence/backend.js";
import { backfillLocalPersistence, cleanupLocalJsonMirrors, validateLocalPersistence } from "./persistence/backfill.js";
import { compactBundleExports } from "./persistence/bundle-exports.js";
import { PersistedAsyncJobManager, readPersistedAsyncJob, readPersistedAsyncJobAttempts } from "./persistence/async-jobs.js";
import { LocalPersistenceStore } from "./persistence/local-store.js";
import { getPersistedObservabilityHistory, readPersistedObservabilitySummary } from "./persistence/observability.js";
import { getPersistedRun, listPersistedTargets, readPersistedDimensionScores, readPersistedPolicyApplication, readPersistedStageExecutions, readPersistedTargetSummary } from "./persistence/query.js";
import { deriveInitialReviewWorkflow, listPersistedReviewNotifications, listPersistedReviewWorkflows, submitPersistedReviewAction } from "./persistence/review-workflow.js";
import { createPersistedReviewComment } from "./persistence/review-comments.js";
import { buildFindingEvidenceFingerprint, createPersistedFindingDisposition } from "./persistence/finding-dispositions.js";
import { readPersistedArtifactIndex, readPersistedCommitDiff, readPersistedControlResults, readPersistedEvents, readPersistedEvidenceRecords, readPersistedFindings, readPersistedLanePlans, readPersistedLaneResults, readPersistedLaneReuseDecisions, readPersistedLaneSpecialistOutputs, readPersistedMaintenanceHistory, readPersistedMetrics, readPersistedObservability, readPersistedResolvedConfiguration, readPersistedReviewActions, readPersistedReviewComments, readPersistedReviewDecision, readPersistedReviewWorkflow, readPersistedRunUsageSummary, readPersistedScoreSummary, readPersistedStageArtifact, readPersistedStageArtifacts, readPersistedToolAdapterSummary, readPersistedToolExecutions } from "./persistence/run-details.js";
import { createLocalPersistenceBackup, ensureSqliteSchema, listLocalPersistenceBackups, openSqliteDatabase, PERSISTENCE_SCHEMA_VERSION, readPersistenceMetadata, readSqliteTable, restoreLocalPersistenceBackup, saveSqliteDatabase, setSqliteSaveFailureForTests, SqlitePersistenceError, upsertSqliteRecord, verifyLocalPersistenceBackup } from "./persistence/sqlite.js";
import { buildPsqlProcessEnv } from "./persistence/postgres.js";
import { learningSynthesisApprovalSubject, normalizeLearningSettings, promoteLearningCandidate, resolveLearningSynthesisAuthorization, rollbackLearningPromotion } from "./persistence/learning.js";
import { listPersistedUiDocuments, readPersistedUiSettings, updatePersistedUiSettings } from "./persistence/ui-settings.js";
import { markRuntimeFollowupJobTerminal, markRuntimeFollowupLaunched, readPersistedRuntimeFollowup, upsertRuntimeFollowupFromReviewAction } from "./persistence/runtime-followups.js";
import { LinuxContainerSandboxBackend } from "./sandbox/backends/linux-container.js";
import { buildReviewSummary } from "./review-summary.js";
import { buildGoldenExports, readGoldenExports } from "./export-golden.js";
import { buildTethermarkExportEnvelope, isCompatibleExportEnvelope } from "./export-contract.js";
import { evaluateStandardsAudit } from "./standards-audit.js";
import { getControlCatalog, getMethodologyArtifact } from "./standards.js";
import { deriveCanonicalTargetId } from "./target-identity.js";
import { listBuiltinLlmProviders, listBuiltinLlmProviderPresets } from "./llm-provider-registry.js";
import { createDefaultAssistantToolRegistry, EvidenceGroundedAssistantProvider } from "./assistant.js";
import { SqliteAssistantStorage } from "./persistence/assistant.js";
import { OpenAICodexCliProvider, OpenAIModelProvider, resolveAgentProviderConfig } from "../../../packages/llm-provider/src/index.js";
import { executeWithProviderGovernor, resetProviderGovernorForTests, resolveProviderPolicy } from "../../../packages/llm-provider/src/policy.js";
import { AgentRuntime } from "../../../packages/agent-runtime/src/index.js";
import { buildRuntimeExecutionPolicy, createLocalRuntimeProvider, LOCAL_RUNTIME_IMAGES, resolveLocalSandboxBackend } from "../../../packages/validation-runner/src/index.js";
import { evaluateStaticToolVersion, extractStaticToolVersion, resolveStaticToolReleaseAsset, STATIC_TOOL_POLICIES } from "./static-tool-policy.js";
import { buildStaticToolsReadiness } from "./static-tools.js";
import { applyDeterministicPlannerFloor } from "./stages/stage-plan-scope.js";
import {
  applyResolvedSystemPolicyToRequest,
  archivePersistedSystemPolicy,
  createPersistedSystemPolicy,
  createPersistedSystemPolicyVersion,
  ensureBuiltinSystemPolicies,
  exportSystemPolicy,
  getBuiltinSystemPolicyTemplate,
  getPersistedSystemPolicy,
  importSystemPolicy,
  listBuiltinSystemPolicyTemplates,
  listPersistedSystemPolicies,
  persistPolicyResolutionSnapshot,
  publishPersistedSystemPolicy,
  readPersistedPolicyResolutionSnapshot,
  resolvePersistedSystemPolicy,
  rollbackPersistedSystemPolicy,
  setDefaultPersistedSystemPolicy,
  upsertPersistedSystemPolicyBinding,
  validateSystemPolicyDefinition
} from "./system-policies.js";

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 9) {
          const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
          if (code === "EBUSY" || code === "ENOTEMPTY" || code === "EPERM") {
            console.warn(`WARN temp cleanup deferred for ${dir}: ${error instanceof Error ? error.message : String(error)}`);
            break;
          }
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
}

async function withWorkspaceTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const root = path.resolve(process.cwd(), ".artifacts", "test-temp");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function withEnv<T>(updates: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous = new Map(Object.keys(updates).map((key) => [key, process.env[key]] as const));
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withWorkingDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function testProductionStaticToolPolicy(): Promise<void> {
  assert.equal(extractStaticToolVersion("GitVersion: v5.5.0\nPlatform: windows/amd64"), "5.5.0");
  assert.equal(evaluateStaticToolVersion("scorecard", "GitVersion: v5.5.0").pinned, true);
  assert.equal(evaluateStaticToolVersion("semgrep", "1.171.9").supported, false);
  assert.equal(evaluateStaticToolVersion("trivy", "Version: 0.73.9").supported, true);
  assert.equal(evaluateStaticToolVersion("trivy", "Version: 0.74.0").supported, false);
  assert.ok(resolveStaticToolReleaseAsset("scorecard", "win32", "x64")?.sha256.match(/^[a-f0-9]{64}$/));
  assert.ok(resolveStaticToolReleaseAsset("trivy", "linux", "x64")?.url.includes(`/v${STATIC_TOOL_POLICIES.trivy.pinned_version}/`));
  assert.ok(STATIC_TOOL_POLICIES.semgrep.package_sha256?.every((digest) => /^[a-f0-9]{64}$/.test(digest)));

  assert.equal(normalizePublicScorecardProject("https://github.com/ossf/scorecard.git"), "github.com/ossf/scorecard");
  assert.equal(normalizePublicScorecardProject("git@github.com:NousResearch/hermes-agent.git"), "github.com/NousResearch/hermes-agent");
  assert.equal(normalizePublicScorecardProject("https://gitlab.com/example/private"), null);
  assert.equal(normalizePublicScorecardProject("https://github.example.com/example/private"), null);
  assert.equal(normalizePublicScorecardProject("https://github.com/example/repo/issues"), null);
}

async function testStaticReadinessRejectsUnsupportedVersions(): Promise<void> {
  await withTempDir("tethermark-static-readiness-", async (rootDir) => {
    const writeTool = async (name: string, output: string) => {
      const filePath = path.join(rootDir, `${name}.mjs`);
      await fs.writeFile(filePath, `console.log(${JSON.stringify(output)});\n`, "utf8");
      return filePath;
    };
    const scorecardRunner = await writeTool("scorecard", "GitVersion: v5.5.0");
    const semgrepRunner = await writeTool("semgrep", "1.172.0");
    const trivyRunner = await writeTool("trivy", "Version: 0.71.2");
    await withEnv({
      HARNESS_SCORECARD_COMMAND: process.execPath,
      HARNESS_SCORECARD_RUNNER: scorecardRunner,
      HARNESS_SEMGREP_COMMAND: process.execPath,
      HARNESS_SEMGREP_RUNNER: semgrepRunner,
      HARNESS_SEMGREP_PYTHON: undefined,
      HARNESS_TRIVY_COMMAND: process.execPath,
      HARNESS_TRIVY_RUNNER: trivyRunner,
      HARNESS_DISABLE_LOCAL_BINARIES: undefined
    }, async () => {
      const strict = buildStaticToolsReadiness({ gatePolicy: "require_local_scanners" });
      assert.equal(strict.status, "blocked");
      assert.equal(strict.tools.find((tool) => tool.id === "scorecard")?.version_pinned, true);
      assert.equal(strict.tools.find((tool) => tool.id === "semgrep")?.version_supported, true);
      assert.equal(strict.tools.find((tool) => tool.id === "trivy")?.status, "blocked");
      assert.match(strict.tools.find((tool) => tool.id === "trivy")?.summary ?? "", /outside the supported range/);
      assert.ok(strict.blockers.some((item) => item.includes("Trivy")));

      const warningsOnly = buildStaticToolsReadiness({ gatePolicy: "warn" });
      assert.equal(warningsOnly.status, "ready_with_warnings");
      assert.equal(warningsOnly.blockers.length, 0);
    });
  });
}

async function testStaticEvidenceUsesConfiguredScannerInvocations(): Promise<void> {
  await withTempDir("tethermark-static-invocation-", async (rootDir) => {
    const targetDir = path.join(rootDir, "target");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "app.js"), "const safe = true;\n", "utf8");
    const scorecardRunner = path.join(rootDir, "fake-scorecard.mjs");
    const trivyRunner = path.join(rootDir, "fake-trivy.mjs");
    await fs.writeFile(scorecardRunner, "console.log(JSON.stringify({repo: {commit: 'abc123'}, score: 9, checks: [{name: 'Pinned-Dependencies', score: 9}]}));\n", "utf8");
    await fs.writeFile(trivyRunner, "console.log(JSON.stringify({Results: []}));\n", "utf8");

    await withEnv({
      HARNESS_SCORECARD_COMMAND: process.execPath,
      HARNESS_SCORECARD_RUNNER: scorecardRunner,
      HARNESS_TRIVY_COMMAND: process.execPath,
      HARNESS_TRIVY_RUNNER: trivyRunner,
      HARNESS_DISABLE_LOCAL_BINARIES: undefined
    }, async () => {
      resetEvidenceProviderCapabilityCacheForTests();
      const request = { local_path: targetDir, run_mode: "static", audit_package: "deep-static", llm_provider: "mock" } as const;
      const scorecard = await executeEvidenceProvider({ providerId: "scorecard", request, rootPath: targetDir, repoUrl: "https://github.com/example/example.git", commitSha: "abc123" });
      const mismatchedScorecard = await executeEvidenceProvider({ providerId: "scorecard", request, rootPath: targetDir, repoUrl: "https://github.com/example/example.git", commitSha: "def456" });
      const trivy = await executeEvidenceProvider({ providerId: "trivy", request, rootPath: targetDir, repoUrl: null });
      assert.equal(scorecard.status, "completed", scorecard.summary);
      assert.deepEqual(scorecard.command?.slice(-2), ["--commit", "abc123"]);
      assert.equal(scorecard.normalized?.signal_count, 1);
      assert.equal(mismatchedScorecard.status, "failed");
      assert.equal(mismatchedScorecard.failure_category, "runtime_error");
      assert.match(mismatchedScorecard.summary, /expected def456/);
      assert.equal(trivy.status, "completed", trivy.summary);
      assert.equal(trivy.normalized?.result_type, "trivy");
    });
  });
}

async function testStaticScannerTimeoutAndOutputFloodFailClosed(): Promise<void> {
  await withTempDir("tethermark-static-failure-", async (rootDir) => {
    const targetDir = path.join(rootDir, "target");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "app.js"), "const safe = true;\n", "utf8");
    const toolPath = path.join(rootDir, "fake-semgrep.mjs");
    const writeFake = async (program: string) => {
      await fs.writeFile(toolPath, `${program};\n`, "utf8");
    };

    await withEnv({
      HARNESS_SEMGREP_PYTHON: process.execPath,
      HARNESS_SEMGREP_RUNNER: toolPath,
      HARNESS_STATIC_TOOL_TIMEOUT_MS: "1000",
      HARNESS_STATIC_TOOL_MAX_BUFFER_BYTES: String(64 * 1024),
      HARNESS_DISABLE_LOCAL_BINARIES: undefined
    }, async () => {
      await writeFake("process.stdout.write(JSON.stringify({ results: [], errors: [], paths: { scanned: ['app.js'] } }))");
      resetEvidenceProviderCapabilityCacheForTests();
      const scanned = await executeEvidenceProvider({ providerId: "semgrep", request: { local_path: targetDir, run_mode: "static", audit_package: "deep-static", llm_provider: "mock" }, rootPath: targetDir, repoUrl: null });
      assert.equal(scanned.status, "completed");
      assert.ok(scanned.command?.includes("--no-git-ignore"));
      assert.deepEqual(scanned.normalized?.coverage_paths, ["app.js"]);

      await writeFake("process.stdout.write('x'.repeat(200000))");
      resetEvidenceProviderCapabilityCacheForTests();
      const flooded = await executeEvidenceProvider({ providerId: "semgrep", request: { local_path: targetDir, run_mode: "static", audit_package: "deep-static", llm_provider: "mock" }, rootPath: targetDir, repoUrl: null });
      assert.equal(flooded.status, "skipped");
      assert.equal(flooded.failure_category, "runtime_error");
      assert.match(flooded.summary, /output exceeded/i);

      await writeFake("setTimeout(() => {}, 10000)");
      resetEvidenceProviderCapabilityCacheForTests();
      const timedOut = await executeEvidenceProvider({ providerId: "semgrep", request: { local_path: targetDir, run_mode: "static", audit_package: "deep-static", llm_provider: "mock" }, rootPath: targetDir, repoUrl: null });
      assert.equal(timedOut.status, "skipped");
      assert.equal(timedOut.failure_category, "runtime_error");
      assert.match(timedOut.summary, /timed out/i);
    });
  });
}

type MinimalJsonSchema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, MinimalJsonSchema>;
  items?: MinimalJsonSchema;
  enum?: unknown[];
  const?: unknown;
};

async function loadExportSchema(schemaFilename: string): Promise<MinimalJsonSchema> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(currentDir, "../../../../schemas", schemaFilename);
  return JSON.parse(await fs.readFile(schemaPath, "utf8")) as MinimalJsonSchema;
}

function validateAgainstMinimalJsonSchema(schema: MinimalJsonSchema, value: unknown, jsonPath = "$"): string[] {
  const errors: string[] = [];
  const allowedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (allowedTypes.length) {
    const actualType =
      value === null
        ? "null"
        : Array.isArray(value)
          ? "array"
          : typeof value;
    if (!allowedTypes.includes(actualType)) {
      errors.push(`${jsonPath}: expected type ${allowedTypes.join("|")} but received ${actualType}`);
      return errors;
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${jsonPath}: expected const ${JSON.stringify(schema.const)} but received ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => candidate === value)) {
    errors.push(`${jsonPath}: expected one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")} but received ${JSON.stringify(value)}`);
  }
  if (schema.required?.length && value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required) {
      if (!(key in (value as Record<string, unknown>))) {
        errors.push(`${jsonPath}: missing required property ${key}`);
      }
    }
  }
  if (schema.properties && value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (!(key in (value as Record<string, unknown>))) continue;
      errors.push(...validateAgainstMinimalJsonSchema(propertySchema, (value as Record<string, unknown>)[key], `${jsonPath}.${key}`));
    }
  }
  if (schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...validateAgainstMinimalJsonSchema(schema.items as MinimalJsonSchema, item, `${jsonPath}[${index}]`));
    });
  }
  return errors;
}

async function assertExportSchemaMatches(schemaFilename: string, payload: unknown): Promise<void> {
  const schema = await loadExportSchema(schemaFilename);
  const errors = validateAgainstMinimalJsonSchema(schema, payload);
  assert.deepEqual(errors, [], `Schema validation failed for ${schemaFilename}: ${errors.join("; ")}`);
}

async function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
}

async function waitForAsyncRun(baseUrl: string, jobId: string, timeoutMs = 180000, expectedAttemptNumber?: number): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/runs/async/${jobId}`);
      if (response.ok) {
        const payload = await response.json() as any;
        const status = payload.job?.status;
        const attempts = Array.isArray(payload.attempts) ? payload.attempts : [];
        const latestAttempt = attempts.at(-1) ?? null;
        const currentRunId = payload.job?.current_run_id;
        const latestAttemptNumber = payload.job?.latest_attempt_number;
        if (expectedAttemptNumber != null && latestAttemptNumber !== expectedAttemptNumber) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
        const latestAttemptMatchesJob =
          !latestAttempt ||
          ((currentRunId == null || latestAttempt.run_id === currentRunId) &&
            (latestAttemptNumber == null || latestAttempt.attempt_number === latestAttemptNumber));
        const latestAttemptIsTerminal =
          !latestAttempt ||
          latestAttempt.status === "succeeded" ||
          latestAttempt.status === "failed" ||
          latestAttempt.status === "canceled";
        if ((status === "succeeded" || status === "failed" || status === "canceled") && latestAttemptMatchesJob && latestAttemptIsTerminal) {
          return payload;
        }
      }
    } catch {
      // retry while the test server is restarting or closing a previous listener
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for async job ${jobId}`);
}

async function waitForAsyncTerminalFollowup(baseUrl: string, jobId: string, timeoutMs = 45000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`${baseUrl}/runs/async/${jobId}`);
    if (response.ok) {
      const payload = await response.json() as any;
      if (payload.job?.terminal_followup_status === "completed" || payload.job?.terminal_followup_status === "failed") return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for async terminal follow-up ${jobId}`);
}

async function waitForCondition(label: string, predicate: () => boolean, timeoutMs = 45000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForPersistedWebhookDeliveries(baseUrl: string, runId: string, expectedCount: number, timeoutMs = 45000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`${baseUrl}/runs/${runId}/webhook-deliveries`);
    const payload = await response.json() as any;
    if (response.ok && Array.isArray(payload.webhook_deliveries) && payload.webhook_deliveries.length >= expectedCount) {
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${expectedCount} persisted webhook deliveries for ${runId}`);
}

async function waitForRunSummary(baseUrl: string, runId: string, timeoutMs = 180000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const [summaryResponse, toolExecutionsResponse, remediationResponse] = await Promise.all([
      fetch(`${baseUrl}/runs/${runId}/summary`),
      fetch(`${baseUrl}/runs/${runId}/tool-executions`),
      fetch(`${baseUrl}/runs/${runId}/remediation`)
    ]);
    if (summaryResponse.ok && toolExecutionsResponse.ok && remediationResponse.ok) {
      const [summaryPayload, toolExecutionsPayload, remediationPayload] = await Promise.all([
        summaryResponse.json() as Promise<any>,
        toolExecutionsResponse.json() as Promise<any>,
        remediationResponse.json() as Promise<any>
      ]);
      const summaryStatus = summaryPayload.summary?.status;
      const hasCompletedArtifacts =
        Array.isArray(toolExecutionsPayload.tool_executions) &&
        toolExecutionsPayload.tool_executions.length > 0 &&
        Boolean(remediationPayload.remediation_memo?.summary);
      if ((summaryStatus === "succeeded" || summaryStatus === "failed" || summaryStatus === "canceled") && hasCompletedArtifacts) {
        return summaryPayload;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for run summary ${runId}`);
}

function getListeningPort(server: http.Server): number {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server did not expose a numeric listening port");
  }
  return address.port;
}

async function stageBuiltinCoreEngineData(rootDir: string): Promise<void> {
  const sourceBase = path.resolve(process.cwd(), "packages", "core-engine");
  const targetBase = path.join(rootDir, "packages", "core-engine");
  for (const folder of ["policy-packs", "audit-packages"]) {
    const sourceDir = path.join(sourceBase, folder);
    const targetDir = path.join(targetBase, folder);
    await fs.mkdir(targetDir, { recursive: true });
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      await fs.copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
    }
  }
}

async function testBuildScanRequestParsesLlmFlags(): Promise<void> {
  const parsed = buildScanRequest([
    "scan",
    "path",
    ".",
    "--mode",
    "static",
    "--package",
    "deep-static",
    "--llm-provider",
    "mock",
    "--llm-model",
    "mock-lane-specialist",
    "--llm-api-key",
    "test-key"
  ]);

  assert.equal(parsed.targetType, "path");
  assert.equal(parsed.request.run_mode, "static");
  assert.equal(parsed.request.audit_package, "deep-static");
  assert.equal(parsed.request.llm_provider, "mock");
  assert.equal(parsed.request.llm_model, "mock-lane-specialist");
  assert.equal(parsed.request.llm_api_key, "test-key");
  assert.equal(parsed.request.llm_workload_class, "interactive_operator");
  assert.equal(typeof parsed.request.requested_by, "string");
  assert.ok(parsed.request.local_path);
  const runtimeParsed = buildScanRequest(["scan", "path", ".", "--mode", "runtime", "--accept-runtime-warning", "true"]);
  assert.equal(typeof (runtimeParsed.request.hints as any)?.runtime_sandbox_accepted_at, "string");
  assert.equal((runtimeParsed.request.hints as any)?.launch_intent?.source_surface, "cli");
}

async function testOpenAICodexProviderRegistryAndStructuredExec(): Promise<void> {
  const provider = listBuiltinLlmProviders().find((item) => item.id === "openai_codex");
  assert.equal(provider?.mode, "agent_oauth");
  assert.equal(provider?.requires_api_key, false);
  assert.equal(listBuiltinLlmProviderPresets().find((item) => item.id === "openai_codex_local")?.provider_id, "openai_codex");

  const resolved = resolveAgentProviderConfig("planner_agent", { provider: "openai_codex", model: "gpt-5.6-sol" });
  assert.equal(resolved.provider, "openai_codex");
  assert.equal(resolved.apiKeySource, "oauth-local");

  await withEnv({
    AUDIT_LLM_PROVIDER: undefined,
    AUDIT_LLM_MODEL: undefined,
    AUDIT_LLM_API_KEY: undefined,
    LLM_API_KEY: undefined,
    OPENAI_API_KEY: undefined,
    AUDIT_LLM_PLANNER_PROVIDER: undefined,
    AUDIT_LLM_PLANNER_MODEL: undefined,
    AUDIT_LLM_PLANNER_API_KEY: undefined
  }, async () => {
    assert.equal(resolveAgentProviderConfig("planner_agent").provider, "openai_codex");
  });

  await withEnv({
    AUDIT_LLM_PROVIDER: undefined,
    AUDIT_LLM_MODEL: undefined,
    AUDIT_LLM_API_KEY: undefined,
    LLM_API_KEY: undefined,
    OPENAI_API_KEY: "configured-but-not-selected"
  }, async () => {
    assert.equal(resolveAgentProviderConfig("planner_agent").provider, "openai_codex");
  });

  assert.equal(normalizeLearningSettings({ enabled: true, event_driven_enabled: true }).enabled, false);
  assert.equal(normalizeLearningSettings({ operator_consent_version: 1, enabled: true }).enabled, true);

  await withWorkspaceTempDir("harness-codex-provider-", async (rootDir) => {
    const fakeCli = path.join(rootDir, "fake-codex-cli.mjs");
    const fakeHome = path.join(rootDir, "home");
    const fakeAppData = path.join(rootDir, "appdata");
    const fakeLocalAppData = path.join(rootDir, "localappdata");
    await fs.mkdir(fakeHome, { recursive: true });
    await fs.mkdir(fakeAppData, { recursive: true });
    await fs.mkdir(fakeLocalAppData, { recursive: true });
    await fs.writeFile(fakeCli, [
      "import fs from 'node:fs';",
      "if (!process.argv.includes('--skip-git-repo-check')) process.exit(3);",
      "if (!process.argv.includes('--ignore-user-config') || !process.argv.includes('--ignore-rules')) process.exit(4);",
      "for (const feature of ['shell_tool','code_mode_host','apps','browser_use','browser_use_external','computer_use','multi_agent','hooks','plugins']) { const index = process.argv.indexOf(feature); if (index < 1 || process.argv[index - 1] !== '--disable') process.exit(5); }",
      "if (!process.cwd().includes('tethermark-codex-')) process.exit(6);",
      "if (process.env.OPENAI_API_KEY || process.env.AUDIT_LLM_API_KEY || process.env.LLM_API_KEY) process.exit(7);",
      "const outIndex = process.argv.indexOf('--output-last-message');",
      "if (outIndex < 0) process.exit(2);",
      "fs.writeFileSync(process.argv[outIndex + 1], JSON.stringify({ ok: true, mode: 'oauth' }));",
      "process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 12, cached_input_tokens: 4, output_tokens: 3 } }) + '\\n');"
    ].join("\n"), "utf8");
    const codex = new OpenAICodexCliProvider("gpt-5.6-sol", process.execPath, "read-only", 10_000, [fakeCli], {
      ...process.env,
      APPDATA: fakeAppData,
      CODEX_HOME: path.join(fakeHome, ".codex"),
      HOME: fakeHome,
      LOCALAPPDATA: fakeLocalAppData,
      USERPROFILE: fakeHome,
      OPENAI_API_KEY: "must-not-reach-codex-subprocess"
    });
    const result = await codex.generateStructured<{ ok: boolean; mode: string }>({
      agentName: "planner_agent",
      schemaName: "fake_codex_result",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok", "mode"],
        properties: {
          ok: { type: "boolean" },
          mode: { type: "string" }
        }
      },
      systemPrompt: "Return JSON.",
      userPrompt: "Return ok.",
      metadata: {},
      temperature: 0.2
    } as any);
    assert.deepEqual(result.parsed, { ok: true, mode: "oauth" });
    assert.equal(result.provider, "openai_codex");
    assert.equal(result.usage?.prompt_tokens, 12);
    assert.equal(result.usage?.completion_tokens, 3);
    assert.equal(result.usage?.total_tokens, 15);
  });
}

async function testProviderWorkloadPolicyAndBudgets(): Promise<void> {
  const runtimeDefault = assertAuditRequestProviderPolicy({ local_path: ".", run_mode: "runtime" });
  assert.equal(runtimeDefault.llm_provider, "openai_codex");
  assert.equal(runtimeDefault.llm_credential_class, "chatgpt_session");
  assert.throws(() => assertAuditRequestProviderPolicy({
    local_path: ".",
    run_mode: "runtime",
    llm_provider: "openai",
    llm_model: "gpt-5.4-mini",
    llm_credential_class: "api_key"
  }), /runtime_api_key_override_confirmation_required/);
  const acceptedApiOverride = assertAuditRequestProviderPolicy({
    local_path: ".",
    run_mode: "runtime",
    llm_provider: "openai",
    llm_model: "gpt-5.4-mini",
    llm_credential_class: "api_key",
    llm_api_key: "test-key",
    hints: { runtime_model_api_override: { accepted_at: "2026-08-21T00:00:00.000Z", accepted_by: "test-operator" } }
  });
  assert.equal(acceptedApiOverride.llm_provider, "openai");
  assert.throws(() => assertAuditRequestProviderPolicy({
    local_path: ".",
    run_mode: "runtime",
    llm_provider: "openai_codex",
    llm_api_key: "must-not-route"
  }), /runtime_codex_chatgpt_session_rejects_api_key/);

  const interactive = resolveProviderPolicy({
    provider: "openai_codex",
    model: "gpt-5.6-sol",
    workloadClass: "interactive_operator",
    credentialClass: "chatgpt_session",
    maxRequests: 2,
    maxTokens: 1000
  });
  assert.equal(interactive.initiation_mode, "operator");
  assert.equal(interactive.max_requests, 2);

  assert.throws(() => resolveProviderPolicy({
    provider: "openai_codex",
    model: "gpt-5.6-sol",
    workloadClass: "unattended_local",
    credentialClass: "chatgpt_session"
  }), /provider_workload_not_allowed/);
  assert.throws(() => resolveProviderPolicy({
    provider: "openai",
    model: "unreviewed-model",
    workloadClass: "external_service",
    credentialClass: "api_key"
  }), /provider_model_not_allowed/);
  assert.throws(() => resolveProviderPolicy({
    provider: "openai",
    model: "gpt-4.1",
    workloadClass: "external_service",
    credentialClass: "api_key",
    maxRequests: 29
  }), /provider_budget_exceeds_policy/);

  const engine = createEngine();
  assert.throws(() => engine.enqueue({
    local_path: ".",
    run_mode: "static",
    llm_provider: "openai_codex",
    llm_model: "gpt-5.6-sol"
  }), /provider_workload_not_allowed/);
  const queued = engine.enqueue({
    local_path: ".",
    run_mode: "static",
    llm_provider: "mock",
    llm_model: "mock-agent-runtime"
  });
  assert.equal(queued.request.llm_workload_class, "unattended_local");

  const runtime = new AgentRuntime({
    provider: "mock",
    model: "mock-agent-runtime",
    workloadClass: "interactive_operator",
    maxRequests: 1,
    maxTokens: 1000
  });
  await runtime.callAgent({
    runId: "run_policy_budget",
    agentName: "planner_agent",
    context: { controlCatalog: [], request: { run_mode: "static" } },
    inputArtifacts: [],
    outputArtifact: "planner-artifact.json"
  });
  await assert.rejects(() => runtime.callAgent({
    runId: "run_policy_budget",
    agentName: "planner_agent",
    context: { controlCatalog: [], request: { run_mode: "static" } },
    inputArtifacts: [],
    outputArtifact: "planner-artifact-2.json"
  }), /provider_request_budget_exhausted/);
  assert.equal(runtime.artifacts.invocations[0]?.credential_class, "none");
  assert.equal(runtime.artifacts.invocations[0]?.request_index, 1);
  assert.equal(runtime.artifacts.invocations[0]?.terminal_reason, "completed");
  assert.equal(runtime.totalRequestCount, 1);

  let providerAttempts = 0;
  const retryServer = http.createServer((_request, response) => {
    providerAttempts += 1;
    response.setHeader("content-type", "application/json");
    if (providerAttempts === 1) {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: "retry" }));
      return;
    }
    response.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
    }));
  });
  await new Promise<void>((resolve) => retryServer.listen(0, "127.0.0.1", resolve));
  try {
    let budgetedAttempts = 0;
    const retryProvider = new OpenAIModelProvider("test-key", "gpt-4.1", `http://127.0.0.1:${getListeningPort(retryServer)}/v1`);
    const retryResult = await retryProvider.generateStructured<{ ok: boolean }>({
      agentName: "planner_agent",
      schemaName: "retry_budget",
      schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
      systemPrompt: "Return JSON.",
      userPrompt: "Return ok.",
      maxRetries: 2,
      beforeAttempt: () => { budgetedAttempts += 1; }
    });
    assert.equal(retryResult.attempts, 2);
    assert.equal(providerAttempts, 2);
    assert.equal(budgetedAttempts, 2, "Each provider retry must consume one request-budget unit");
  } finally {
    await new Promise<void>((resolve, reject) => retryServer.close((error) => error ? reject(error) : resolve()));
  }

  const timeoutServer = http.createServer((_request, response) => {
    setTimeout(() => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }));
    }, 200);
  });
  await new Promise<void>((resolve) => timeoutServer.listen(0, "127.0.0.1", resolve));
  try {
    const timeoutProvider = new OpenAIModelProvider(
      "test-key",
      "gpt-4.1",
      `http://127.0.0.1:${getListeningPort(timeoutServer)}/v1`,
      25
    );
    await assert.rejects(() => timeoutProvider.generateStructured<{ ok: boolean }>({
      agentName: "planner_agent",
      schemaName: "timeout_budget",
      schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
      systemPrompt: "Return JSON.",
      userPrompt: "Return ok.",
      maxRetries: 1
    }), /OpenAI structured generation failed after 1 attempts/);
  } finally {
    await new Promise<void>((resolve, reject) => timeoutServer.close((error) => error ? reject(error) : resolve()));
  }

  resetProviderGovernorForTests();
  const breakerDecision = { ...resolveProviderPolicy({ provider: "mock", model: "mock-agent-runtime", workloadClass: "unattended_local" }), circuit_breaker_failure_threshold: 2, circuit_breaker_cooldown_ms: 60_000 };
  await assert.rejects(() => executeWithProviderGovernor(breakerDecision, async () => { throw new Error("first"); }), /first/);
  await assert.rejects(() => executeWithProviderGovernor(breakerDecision, async () => { throw new Error("second"); }), /second/);
  await assert.rejects(() => executeWithProviderGovernor(breakerDecision, async () => "blocked"), /provider_circuit_open/);
  resetProviderGovernorForTests();
}

async function testLocalPersistenceUsesConfiguredRoot(): Promise<void> {
  await withTempDir("harness-local-db-", async (rootDir) => {
    const configuredRoot = path.join(rootDir, "configured-local-db");
    const localRoot = path.join(rootDir, "local-db");
    const packageDefinition = { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any;

    const persistRun = async (targetRoot: string, runId: string): Promise<void> => {
      const mode = "local" as const;
      const store = createPersistenceStore(mode, targetRoot);
      await store.persistBundle({
        mode,
        package_definition: packageDefinition,
        target: { id: `target_${mode}`, target_type: "repo", canonical_name: mode, repo_url: `https://github.com/example/${mode}`, local_path: null, endpoint_url: null, created_at: "2026-04-15T00:00:00.000Z" },
        target_snapshot: { id: `snap_${mode}`, target_id: `target_${mode}`, snapshot_value: `https://github.com/example/${mode}`, commit_sha: null, captured_at: "2026-04-15T00:00:00.000Z", analysis_hash: null },
        target_summary: { id: `target_${mode}`, target_id: `target_${mode}`, canonical_target_id: `canonical_${mode}`, canonical_name: mode, target_type: "repo", repo_url: `https://github.com/example/${mode}`, local_path: null, endpoint_url: null, latest_run_id: runId, latest_run_created_at: "2026-04-15T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "strong", latest_overall_score: 90, latest_static_score: 90, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 0, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-15T00:00:00.000Z" },
        policy_pack: null,
        run: { id: runId, target_id: `target_${mode}`, target_snapshot_id: `snap_${mode}`, policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: targetRoot, started_at: "2026-04-15T00:00:00.000Z", completed_at: "2026-04-15T00:01:00.000Z", static_score: 90, overall_score: 90, rating: "strong", created_at: "2026-04-15T00:00:00.000Z" },
        resolved_configuration: { run_id: runId, policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "repo", db_mode: mode, output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "repo", db_mode: mode }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
        commit_diff: null,
        correction_plan: null,
        correction_result: null,
        lane_reuse_decisions: [],
        persistence_summary: { run_id: runId, mode, root: targetRoot },
        stage_artifacts: [],
        stage_executions: [],
        lane_plans: [],
        evidence_records: [],
        lane_results: [],
        lane_specialists: [],
        agent_invocations: [],
        tool_executions: [],
        findings: [],
        control_results: [],
        score_summary: { run_id: runId, methodology_version: "1", overall_score: 90, rating: "strong", leaderboard_summary: "", limitations_json: [] },
        review_decision: { run_id: runId, publishability_status: "publishable", human_review_required: false, public_summary_safe: true, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "public" },
        policy_application: { run_id: runId, applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: [], effective_control_ids_json: [], notes_json: [] },
        dimension_scores: [],
        metrics: [],
        events: [],
        artifact_index: []
      } as any);
    };

    await persistRun(configuredRoot, "run_configured");
    await persistRun(localRoot, "run_local");

    const [configuredRun, localRun, configuredMeta, localMeta] = await Promise.all([
      getPersistedRun("run_configured", { rootDir: configuredRoot, dbMode: "local" }),
      getPersistedRun("run_local", { rootDir: localRoot, dbMode: "local" }),
      readPersistenceMetadata(configuredRoot),
      readPersistenceMetadata(localRoot)
    ]);

    assert.equal(configuredRun?.id, "run_configured");
    assert.equal(localRun?.id, "run_local");
    assert.equal(configuredMeta?.database_mode, "local");
    assert.equal(localMeta?.database_mode, "local");
    assert.equal(configuredMeta?.persistence_schema_version, PERSISTENCE_SCHEMA_VERSION);
    assert.equal(configuredMeta?.compatibility_status, "current");
    assert.equal(localRun?.resolved_configuration?.db_mode, "local");
    assert.equal(configuredRun?.resolved_configuration?.db_mode, "local");
    assert.equal(await fs.stat(path.join(configuredRoot, "runs", "run_configured.json")).then(() => true).catch(() => false), false);
    assert.equal(await fs.stat(path.join(localRoot, "runs", "run_local.json")).then(() => true).catch(() => false), false);
  });
}

async function testConcurrentSqliteWritesAreMerged(): Promise<void> {
  await withTempDir("tethermark-sqlite-concurrency-", async (rootDir) => {
    const left = await openSqliteDatabase(rootDir);
    const right = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(left);
      ensureSqliteSchema(right);
      upsertSqliteRecord({ db: left, tableName: "concurrency_test", recordKey: "left", payload: { id: "left" } });
      upsertSqliteRecord({ db: right, tableName: "concurrency_test", recordKey: "right", payload: { id: "right" } });
      await Promise.all([
        saveSqliteDatabase(rootDir, left),
        saveSqliteDatabase(rootDir, right)
      ]);
    } finally {
      left.close();
      right.close();
    }
    const verification = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(verification);
      assert.deepEqual(
        readSqliteTable<{ id: string }>(verification, "concurrency_test").map((item) => item.id).sort(),
        ["left", "right"]
      );
    } finally {
      verification.close();
    }
  });
}

async function testSqliteCorruptionAndFailedSavesFailClosed(): Promise<void> {
  await withTempDir("tethermark-sqlite-integrity-", async (rootDir) => {
    const seed = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(seed);
      upsertSqliteRecord({ db: seed, tableName: "integrity_test", recordKey: "seed", payload: { id: "seed" } });
      await saveSqliteDatabase(rootDir, seed);
    } finally {
      seed.close();
    }
    const databasePath = path.join(rootDir, "harness.sqlite");
    const validBytes = await fs.readFile(databasePath);

    for (const stage of ["before_temp_write", "before_replace"] as const) {
      const pending = await openSqliteDatabase(rootDir);
      try {
        ensureSqliteSchema(pending);
        upsertSqliteRecord({ db: pending, tableName: "integrity_test", recordKey: stage, payload: { id: stage } });
        setSqliteSaveFailureForTests(stage);
        await assert.rejects(
          () => saveSqliteDatabase(rootDir, pending),
          (error: unknown) => error instanceof SqlitePersistenceError && error.persistence_code === "sqlite_save_failed"
        );
      } finally {
        setSqliteSaveFailureForTests(null);
        pending.close();
      }
      assert.deepEqual(await fs.readFile(databasePath), validBytes);
      assert.equal((await fs.readdir(rootDir)).some((item) => item.endsWith(".tmp")), false);
      const verification = await openSqliteDatabase(rootDir);
      try {
        ensureSqliteSchema(verification);
        assert.deepEqual(readSqliteTable<{ id: string }>(verification, "integrity_test"), [{ id: "seed" }]);
      } finally {
        verification.close();
      }
    }

    const corruptBytes = Buffer.from("not-a-tethermark-sqlite-database", "utf8");
    await fs.writeFile(databasePath, corruptBytes);
    await assert.rejects(
      () => openSqliteDatabase(rootDir),
      (error: unknown) => error instanceof SqlitePersistenceError && error.persistence_code === "sqlite_database_corrupt_or_unsupported"
    );
    assert.deepEqual(await fs.readFile(databasePath), corruptBytes);
  });
}

async function testSqliteAutomaticBackupVerificationAndRestore(): Promise<void> {
  await withTempDir("tethermark-sqlite-backup-restore-", async (rootDir) => {
    const writeValue = async (value: string): Promise<void> => {
      const db = await openSqliteDatabase(rootDir);
      try {
        ensureSqliteSchema(db);
        upsertSqliteRecord({ db, tableName: "backup_test", recordKey: "state", payload: { value } });
        await saveSqliteDatabase(rootDir, db);
      } finally {
        db.close();
      }
    };

    await withEnv({ HARNESS_SQLITE_AUTO_BACKUP_INTERVAL_MS: "1", HARNESS_SQLITE_BACKUP_RETENTION: "2" }, async () => {
      await writeValue("v1");
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeValue("v2");
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeValue("v3");
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeValue("v4");
    });

    const automatic = (await listLocalPersistenceBackups(rootDir)).filter((item) => item.manifest.reason === "automatic");
    assert.equal(automatic.length, 2);
    assert.ok(automatic.every((item) => item.verification.valid));

    const manual = await createLocalPersistenceBackup({ rootDir, reason: "operator-test" });
    assert.equal(manual.verification.valid, true);
    assert.equal(manual.manifest.reason, "operator-test");
    assert.equal((await verifyLocalPersistenceBackup(manual.backup_dir)).valid, true);

    await withEnv({ HARNESS_SQLITE_AUTO_BACKUP_INTERVAL_MS: "0" }, async () => writeValue("v5"));
    const restored = await restoreLocalPersistenceBackup({ rootDir, backupDir: manual.backup_dir });
    assert.ok(restored.safety_backup_dir);
    assert.equal(restored.rejected_database_path, null);
    assert.equal(restored.verification.valid, true);

    const restoredDb = await openSqliteDatabase(rootDir);
    try {
      assert.deepEqual(readSqliteTable<{ value: string }>(restoredDb, "backup_test"), [{ value: "v4" }]);
    } finally {
      restoredDb.close();
    }

    const tamperedDir = path.join(rootDir, "tampered-backup");
    await fs.cp(manual.backup_dir, tamperedDir, { recursive: true });
    await fs.appendFile(path.join(tamperedDir, "harness.sqlite"), Buffer.from("tamper", "utf8"));
    const tampered = await verifyLocalPersistenceBackup(tamperedDir);
    assert.equal(tampered.valid, false);
    assert.ok(tampered.issues.includes("backup_database_size_mismatch"));
    assert.ok(tampered.issues.includes("backup_database_checksum_mismatch"));
    await assert.rejects(
      () => restoreLocalPersistenceBackup({ rootDir, backupDir: tamperedDir }),
      (error: unknown) => error instanceof SqlitePersistenceError && error.persistence_code === "sqlite_backup_invalid"
    );
    const afterRejectedRestore = await openSqliteDatabase(rootDir);
    try {
      assert.deepEqual(readSqliteTable<{ value: string }>(afterRejectedRestore, "backup_test"), [{ value: "v4" }]);
    } finally {
      afterRejectedRestore.close();
    }

    await fs.writeFile(path.join(rootDir, "harness.sqlite"), Buffer.from("corrupt-current-database", "utf8"));
    const recovered = await restoreLocalPersistenceBackup({ rootDir, backupDir: manual.backup_dir });
    assert.equal(recovered.safety_backup_dir, null);
    assert.ok(recovered.rejected_database_path);
    assert.deepEqual(await fs.readFile(recovered.rejected_database_path!), Buffer.from("corrupt-current-database", "utf8"));
    const recoveredDb = await openSqliteDatabase(rootDir);
    try {
      assert.deepEqual(readSqliteTable<{ value: string }>(recoveredDb, "backup_test"), [{ value: "v4" }]);
    } finally {
      recoveredDb.close();
    }
  });
}

async function testSqliteReleaseUpgradeFixtureAndRollback(): Promise<void> {
  await withTempDir("tethermark-sqlite-upgrade-", async (rootDir) => {
    const fixturePath = path.resolve(process.cwd(), "fixtures", "persistence-upgrades", "sqlite-1.2.0.json");
    const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8")) as {
      source_schema_version: string;
      records: Array<{
        table_name: string;
        record_key: string;
        run_id: string | null;
        created_at: string | null;
        target_id: string | null;
        target_snapshot_id: string | null;
        parent_key: string | null;
        payload: unknown;
      }>;
      expected: { run_ids: string[]; review_comment_ids: string[] };
    };
    assert.equal(fixture.source_schema_version, "1.2.0");

    const seed = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(seed);
      for (const record of fixture.records) {
        upsertSqliteRecord({
          db: seed,
          tableName: record.table_name,
          recordKey: record.record_key,
          runId: record.run_id,
          createdAt: record.created_at,
          targetId: record.target_id,
          targetSnapshotId: record.target_snapshot_id,
          parentKey: record.parent_key,
          payload: record.payload
        });
      }
      await withEnv({ HARNESS_SQLITE_AUTO_BACKUP_INTERVAL_MS: "0" }, async () => saveSqliteDatabase(rootDir, seed));
    } finally {
      seed.close();
    }
    const legacyMetadataPath = path.join(rootDir, "persistence-meta.json");
    const legacyMetadata = JSON.parse(await fs.readFile(legacyMetadataPath, "utf8"));
    legacyMetadata.persistence_schema_version = fixture.source_schema_version;
    legacyMetadata.compatibility_status = "current";
    await fs.writeFile(legacyMetadataPath, `${JSON.stringify(legacyMetadata, null, 2)}\n`, "utf8");
    assert.equal((await readPersistenceMetadata(rootDir))?.compatibility_status, "legacy");

    const migration = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(migration);
      upsertSqliteRecord({ db: migration, tableName: "upgrade_markers", recordKey: "current", payload: { schema: PERSISTENCE_SCHEMA_VERSION } });
      setSqliteSaveFailureForTests("before_replace");
      await withEnv({ HARNESS_SQLITE_AUTO_BACKUP_INTERVAL_MS: "1" }, async () => {
        await assert.rejects(
          () => saveSqliteDatabase(rootDir, migration),
          (error: unknown) => error instanceof SqlitePersistenceError && error.persistence_code === "sqlite_save_failed"
        );
      });
      assert.equal((await readPersistenceMetadata(rootDir))?.persistence_schema_version, fixture.source_schema_version);
      setSqliteSaveFailureForTests(null);
      await withEnv({ HARNESS_SQLITE_AUTO_BACKUP_INTERVAL_MS: "86400000" }, async () => saveSqliteDatabase(rootDir, migration));
    } finally {
      setSqliteSaveFailureForTests(null);
      migration.close();
    }

    const backups = await listLocalPersistenceBackups(rootDir);
    assert.equal(backups.length, 1);
    assert.equal(backups[0]?.manifest.source_schema_version, fixture.source_schema_version);
    assert.equal(backups[0]?.verification.valid, true);
    assert.equal((await readPersistenceMetadata(rootDir))?.persistence_schema_version, PERSISTENCE_SCHEMA_VERSION);

    const verification = await openSqliteDatabase(rootDir);
    try {
      assert.deepEqual(readSqliteTable<{ id: string }>(verification, "runs").map((item) => item.id), fixture.expected.run_ids);
      assert.deepEqual(readSqliteTable<{ id: string }>(verification, "review_comments").map((item) => item.id), fixture.expected.review_comment_ids);
      assert.deepEqual(readSqliteTable<{ schema: string }>(verification, "upgrade_markers"), [{ schema: PERSISTENCE_SCHEMA_VERSION }]);
    } finally {
      verification.close();
    }

    const futureBackupDir = path.join(rootDir, "future-backup");
    await fs.cp(backups[0]!.backup_dir, futureBackupDir, { recursive: true });
    const futureManifestPath = path.join(futureBackupDir, "backup-manifest.json");
    const futureManifest = JSON.parse(await fs.readFile(futureManifestPath, "utf8"));
    futureManifest.source_schema_version = "2.0.0";
    await fs.writeFile(futureManifestPath, `${JSON.stringify(futureManifest, null, 2)}\n`, "utf8");
    const futureVerification = await verifyLocalPersistenceBackup(futureBackupDir);
    assert.equal(futureVerification.valid, false);
    assert.equal(futureVerification.compatible, false);
    await assert.rejects(
      () => restoreLocalPersistenceBackup({ rootDir, backupDir: futureBackupDir }),
      (error: unknown) => error instanceof SqlitePersistenceError && error.persistence_code === "sqlite_backup_incompatible"
    );
  });
}

async function testConcurrentSqliteProcessWritesAreMerged(): Promise<void> {
  await withTempDir("tethermark-sqlite-process-concurrency-", async (rootDir) => {
    const workerPath = path.resolve(process.cwd(), "scripts", "sqlite-stress-worker.mjs");
    const workerCount = 4;
    const writesPerWorker = 5;
    const runWorker = (workerIndex: number) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [workerPath, rootDir, `worker-${workerIndex}`, String(writesPerWorker)], {
        cwd: process.cwd(),
        env: { ...process.env, HARNESS_SQLITE_LOCK_TIMEOUT_MS: "15000" },
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`sqlite stress worker ${workerIndex} exited ${code}: ${Buffer.concat(stderr).toString("utf8") || Buffer.concat(stdout).toString("utf8")}`));
      });
    });

    await Promise.all(Array.from({ length: workerCount }, (_, index) => runWorker(index)));
    const verification = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(verification);
      const records = readSqliteTable<{ id: string }>(verification, "process_concurrency_test");
      assert.equal(records.length, workerCount * writesPerWorker);
      assert.equal(new Set(records.map((item) => item.id)).size, workerCount * writesPerWorker);
    } finally {
      verification.close();
    }
    assert.equal((await fs.readdir(rootDir)).some((item) => item.includes("harness.sqlite.lock")), false);
    assert.ok(await readPersistenceMetadata(rootDir));
  });
}

async function testSqliteCrashStageRecovery(): Promise<void> {
  await withTempDir("tethermark-sqlite-crash-stages-", async (rootDir) => {
    const workerPath = path.resolve(process.cwd(), "scripts", "sqlite-crash-worker.mjs");
    for (const stage of ["after_lock_acquired", "after_temp_write", "after_replace"] as const) {
      const stageRoot = path.join(rootDir, stage);
      await fs.mkdir(stageRoot, { recursive: true });
      const seed = await openSqliteDatabase(stageRoot);
      try {
        ensureSqliteSchema(seed);
        upsertSqliteRecord({ db: seed, tableName: "crash_test", recordKey: "seed", payload: { id: "seed" } });
        await saveSqliteDatabase(stageRoot, seed);
      } finally {
        seed.close();
      }
      const databasePath = path.join(stageRoot, "harness.sqlite");
      const beforeCrash = await fs.readFile(databasePath);
      const exitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn(process.execPath, [workerPath, stageRoot, stage], {
          cwd: process.cwd(),
          env: { ...process.env },
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"]
        });
        const stderr: Buffer[] = [];
        child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
        child.once("error", reject);
        child.once("close", (code) => code == null
          ? reject(new Error(`sqlite crash worker ended without an exit code: ${Buffer.concat(stderr).toString("utf8")}`))
          : resolve(code));
      });
      assert.notEqual(exitCode, 0, `Crash worker did not stop at ${stage}`);
      const crashedFiles = await fs.readdir(stageRoot);
      assert.equal(crashedFiles.includes("harness.sqlite.lock"), true);
      assert.equal(crashedFiles.some((item) => item.endsWith(".tmp")), stage === "after_temp_write");
      if (stage !== "after_replace") assert.deepEqual(await fs.readFile(databasePath), beforeCrash);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const recovery = await openSqliteDatabase(stageRoot);
      try {
        ensureSqliteSchema(recovery);
        upsertSqliteRecord({ db: recovery, tableName: "crash_test", recordKey: "recovery", payload: { id: "recovery" } });
        await withEnv({ HARNESS_SQLITE_LOCK_STALE_MS: "1" }, async () => saveSqliteDatabase(stageRoot, recovery));
      } finally {
        recovery.close();
      }

      const verification = await openSqliteDatabase(stageRoot);
      try {
        ensureSqliteSchema(verification);
        const ids = readSqliteTable<{ id: string }>(verification, "crash_test").map((item) => item.id).sort();
        assert.deepEqual(ids, stage === "after_replace" ? ["crash", "recovery", "seed"] : ["recovery", "seed"]);
      } finally {
        verification.close();
      }
      assert.equal((await fs.readdir(stageRoot)).some((item) => item.includes("harness.sqlite.lock") || item.endsWith(".tmp")), false);
    }
  });
}

async function testSqliteFileLockBackoffAndRecovery(): Promise<void> {
  await withTempDir("tethermark-sqlite-lock-", async (rootDir) => {
    const databasePath = path.join(rootDir, "harness.sqlite");
    const lockPath = `${databasePath}.lock`;
    const seed = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(seed);
      upsertSqliteRecord({ db: seed, tableName: "lock_test", recordKey: "seed", payload: { id: "seed" } });
      await saveSqliteDatabase(rootDir, seed);
    } finally {
      seed.close();
    }

    const waitingWriter = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(waitingWriter);
      upsertSqliteRecord({ db: waitingWriter, tableName: "lock_test", recordKey: "backoff", payload: { id: "backoff" } });
      await fs.writeFile(lockPath, JSON.stringify({ token: "held-by-test" }), { encoding: "utf8", flag: "wx" });
      const delayedRelease = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          void fs.rm(lockPath, { force: true }).then(() => resolve(), reject);
        }, 60);
      });
      await withEnv({
        HARNESS_SQLITE_LOCK_TIMEOUT_MS: "1000",
        HARNESS_SQLITE_LOCK_STALE_MS: "60000",
        HARNESS_SQLITE_LOCK_BACKOFF_BASE_MS: "10",
        HARNESS_SQLITE_LOCK_BACKOFF_MAX_MS: "25"
      }, async () => {
        await Promise.all([saveSqliteDatabase(rootDir, waitingWriter), delayedRelease]);
      });
    } finally {
      waitingWriter.close();
      await fs.rm(lockPath, { force: true });
    }

    const timedOutWriter = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(timedOutWriter);
      upsertSqliteRecord({ db: timedOutWriter, tableName: "lock_test", recordKey: "timeout", payload: { id: "timeout" } });
      await fs.writeFile(lockPath, JSON.stringify({ token: "still-held-by-test" }), { encoding: "utf8", flag: "wx" });
      await withEnv({
        HARNESS_SQLITE_LOCK_TIMEOUT_MS: "40",
        HARNESS_SQLITE_LOCK_STALE_MS: "60000",
        HARNESS_SQLITE_LOCK_BACKOFF_BASE_MS: "10",
        HARNESS_SQLITE_LOCK_BACKOFF_MAX_MS: "20"
      }, async () => {
        await assert.rejects(
          () => saveSqliteDatabase(rootDir, timedOutWriter),
          (error: unknown) => error instanceof SqlitePersistenceError && error.persistence_code === "sqlite_database_locked"
        );
      });
    } finally {
      timedOutWriter.close();
      await fs.rm(lockPath, { force: true });
    }

    const staleLockWriter = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(staleLockWriter);
      upsertSqliteRecord({ db: staleLockWriter, tableName: "lock_test", recordKey: "stale", payload: { id: "stale" } });
      await fs.writeFile(lockPath, JSON.stringify({ token: "crashed-owner" }), { encoding: "utf8", flag: "wx" });
      const oldLockTime = new Date(Date.now() - 60_000);
      await fs.utimes(lockPath, oldLockTime, oldLockTime);
      await withEnv({
        HARNESS_SQLITE_LOCK_TIMEOUT_MS: "500",
        HARNESS_SQLITE_LOCK_STALE_MS: "20",
        HARNESS_SQLITE_LOCK_BACKOFF_BASE_MS: "5",
        HARNESS_SQLITE_LOCK_BACKOFF_MAX_MS: "10"
      }, async () => saveSqliteDatabase(rootDir, staleLockWriter));
    } finally {
      staleLockWriter.close();
      await fs.rm(lockPath, { force: true });
    }

    const verification = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(verification);
      assert.deepEqual(
        readSqliteTable<{ id: string }>(verification, "lock_test").map((item) => item.id).sort(),
        ["backoff", "seed", "stale"]
      );
    } finally {
      verification.close();
    }
    assert.equal((await fs.readdir(rootDir)).some((item) => item.includes("harness.sqlite.lock")), false);
  });
}

async function testAsyncRecoveryReconcilesDurableTerminalRun(): Promise<void> {
  await withTempDir("tethermark-async-terminal-recovery-", async (rootDir) => {
    const jobId = "job_terminal_recovery";
    const runId = "run_terminal_recovery";
    const timestamp = "2026-08-26T00:00:00.000Z";
    const db = await openSqliteDatabase(rootDir);
    try {
      ensureSqliteSchema(db);
      upsertSqliteRecord({
        db,
        tableName: "async_jobs",
        recordKey: jobId,
        runId,
        createdAt: timestamp,
        parentKey: jobId,
        payload: {
          job_id: jobId,
          status: "running",
          request_json: { local_path: rootDir, run_mode: "static", audit_package: "deep-static", llm_provider: "mock", llm_model: "mock-agent-runtime" },
          db_mode: "local",
          workspace_id: "default",
          project_id: "default",
          requested_by: null,
          current_run_id: runId,
          latest_attempt_number: 1,
          completion_webhook_url: null,
          completion_webhook_status: null,
          completion_webhook_last_attempt_at: null,
          completion_webhook_error: null,
          error: null,
          created_at: timestamp,
          updated_at: timestamp,
          started_at: timestamp,
          completed_at: null,
          canceled_at: null
        }
      });
      upsertSqliteRecord({
        db,
        tableName: "async_job_attempts",
        recordKey: `${jobId}:attempt:1`,
        runId,
        createdAt: timestamp,
        parentKey: jobId,
        payload: {
          id: `${jobId}:attempt:1`,
          job_id: jobId,
          attempt_number: 1,
          run_id: runId,
          status: "running",
          created_at: timestamp,
          started_at: timestamp,
          completed_at: null,
          error: null,
          retry_of_run_id: null
        }
      });
      upsertSqliteRecord({
        db,
        tableName: "runs",
        recordKey: runId,
        runId,
        createdAt: timestamp,
        targetId: "target_terminal_recovery",
        payload: {
          id: runId,
          target_id: "target_terminal_recovery",
          target_snapshot_id: "snapshot_terminal_recovery",
          workspace_id: "default",
          project_id: "default",
          requested_by: null,
          policy_pack_id: null,
          status: "succeeded",
          run_mode: "static",
          audit_package: "deep-static",
          artifact_root: rootDir,
          started_at: timestamp,
          completed_at: "2026-08-26T00:01:00.000Z",
          static_score: 80,
          overall_score: 80,
          rating: "good",
          created_at: timestamp
        }
      });
      await saveSqliteDatabase(rootDir, db);
    } finally {
      db.close();
    }

    let startCalls = 0;
    let terminalHookCalls = 0;
    const manager = new PersistedAsyncJobManager({
      getRun: () => null,
      hydrateRun: () => undefined,
      startRun: async () => { startCalls += 1; },
      cancelRun: () => false
    } as any, {
      onTerminalJob: ({ job, attempt, envelope }) => {
        terminalHookCalls += 1;
        assert.equal(job.status, "succeeded");
        assert.equal(attempt.status, "succeeded");
        assert.equal(envelope.status, "succeeded");
      }
    });

    await withEnv({ HARNESS_LOCAL_DB_ROOT: rootDir }, async () => {
      await Promise.all([manager.recoverJobs(), manager.recoverJobs()]);
      await manager.recoverJobs();
    });

    const recoveredJob = await readPersistedAsyncJob(jobId, rootDir);
    const recoveredAttempts = await readPersistedAsyncJobAttempts(jobId, rootDir);
    assert.equal(startCalls, 0);
    assert.equal(terminalHookCalls, 1);
    assert.equal(recoveredJob?.status, "succeeded");
    assert.equal(recoveredJob?.completed_at, "2026-08-26T00:01:00.000Z");
    assert.equal(recoveredAttempts.length, 1);
    assert.equal(recoveredAttempts[0]?.status, "succeeded");
    assert.equal(recoveredAttempts[0]?.completed_at, "2026-08-26T00:01:00.000Z");
  });
}

async function testAsyncLifecycleCrashStageRecovery(): Promise<void> {
  await withTempDir("tethermark-async-crash-stages-", async (rootDir) => {
    const requestFor = (projectId: string) => ({
      local_path: rootDir,
      run_mode: "static" as const,
      audit_package: "deep-static" as const,
      llm_provider: "mock" as const,
      llm_model: "mock-agent-runtime",
      workspace_id: "crash-workspace",
      project_id: projectId
    });

    for (const stage of ["after_queued_persist", "after_starting_persist", "after_engine_start", "after_running_persist"] as const) {
      const stageRoot = path.join(rootDir, stage);
      await fs.mkdir(stageRoot, { recursive: true });
      const preCrashRuns = new Map<string, any>();
      let preCrashStarts = 0;
      const preCrashEngine = {
        hydrateRun: (envelope: any) => preCrashRuns.set(envelope.run_id, envelope),
        startRun: async (runId: string) => {
          preCrashStarts += 1;
          const envelope = preCrashRuns.get(runId);
          preCrashRuns.set(runId, { ...envelope, status: "running", updated_at: new Date().toISOString() });
        },
        getRun: (runId: string) => preCrashRuns.get(runId) ?? null,
        cancelRun: () => false
      } as any;
      const crashManager = new PersistedAsyncJobManager(preCrashEngine, {
        onLifecycleStageForTests: (observedStage) => {
          if (observedStage === stage) throw new Error(`simulated_async_crash:${stage}`);
        }
      });

      await withEnv({ HARNESS_LOCAL_DB_ROOT: stageRoot }, async () => {
        if (stage === "after_queued_persist") {
          await assert.rejects(
            () => crashManager.createJob({ request: requestFor(stage) }),
            new RegExp(`simulated_async_crash:${stage}`)
          );
        } else {
          const seedManager = new PersistedAsyncJobManager(preCrashEngine);
          const seeded = await seedManager.createJob({ request: requestFor(stage), startImmediately: false });
          await assert.rejects(
            () => crashManager.startJob(seeded.job.job_id, stageRoot),
            new RegExp(`simulated_async_crash:${stage}`)
          );
        }

        const interruptedJobs = await crashManager.listJobs(stageRoot);
        assert.equal(interruptedJobs.length, 1);
        const interruptedJob = interruptedJobs[0]!;
        const interruptedAttempts = await readPersistedAsyncJobAttempts(interruptedJob.job_id, stageRoot);
        assert.equal(interruptedAttempts.length, 1);
        assert.equal(interruptedJob.status, stage === "after_queued_persist" ? "queued" : stage === "after_running_persist" ? "running" : "starting");
        assert.equal(preCrashStarts, stage === "after_engine_start" || stage === "after_running_persist" ? 1 : 0);

        const recoveredRuns = new Map<string, any>();
        let recoveryStarts = 0;
        let terminalHooks = 0;
        const recoveryManager = new PersistedAsyncJobManager({
          hydrateRun: (envelope: any) => recoveredRuns.set(envelope.run_id, envelope),
          startRun: async (runId: string) => {
            recoveryStarts += 1;
            const envelope = recoveredRuns.get(runId);
            recoveredRuns.set(runId, { ...envelope, status: "succeeded", updated_at: new Date().toISOString(), result: { run_id: runId } });
          },
          getRun: (runId: string) => recoveredRuns.get(runId) ?? null,
          cancelRun: () => false
        } as any, {
          onTerminalJob: () => { terminalHooks += 1; }
        });
        await recoveryManager.recoverJobs();
        let recoveredJob = await readPersistedAsyncJob(interruptedJob.job_id, stageRoot);
        for (let attempt = 0; attempt < 100 && recoveredJob?.terminal_followup_status !== "completed"; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          recoveredJob = await readPersistedAsyncJob(interruptedJob.job_id, stageRoot);
        }
        const recoveredAttempts = await readPersistedAsyncJobAttempts(interruptedJob.job_id, stageRoot);
        assert.equal(recoveryStarts, 1);
        assert.equal(terminalHooks, 1);
        assert.equal(recoveredJob?.status, "succeeded");
        assert.equal(recoveredJob?.terminal_followup_status, "completed");
        assert.equal(recoveredAttempts.length, 1);
        assert.equal(recoveredAttempts[0]?.run_id, interruptedAttempts[0]?.run_id);
        assert.equal(recoveredAttempts[0]?.status, "succeeded");
      });
    }
  });
}

async function testAsyncTerminalFollowupCrashRecovery(): Promise<void> {
  await withTempDir("tethermark-async-terminal-followup-crash-", async (rootDir) => {
    const webhookCounts = new Map<string, number>();
    const webhookServer = http.createServer(async (req, res) => {
      for await (const _chunk of req) { /* consume request */ }
      const key = String(req.url ?? "/");
      webhookCounts.set(key, (webhookCounts.get(key) ?? 0) + 1);
      res.writeHead(204);
      res.end();
    });
    await new Promise<void>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(0, "127.0.0.1", () => resolve());
    });
    const webhookPort = getListeningPort(webhookServer);

    try {
      for (const stage of ["after_terminal_persist", "after_completion_webhook", "after_terminal_hook", "after_terminal_followup_persist"] as const) {
        const stageRoot = path.join(rootDir, stage);
        await fs.mkdir(stageRoot, { recursive: true });
        const webhookPath = `/${stage}`;
        let terminalHookCalls = 0;
        await withEnv({ HARNESS_LOCAL_DB_ROOT: stageRoot }, async () => {
          const seedManager = new PersistedAsyncJobManager({
            hydrateRun: () => undefined,
            startRun: async () => undefined,
            getRun: () => null,
            cancelRun: () => false
          } as any);
          const seeded = await seedManager.createJob({
            request: {
              local_path: rootDir,
              run_mode: "static",
              audit_package: "deep-static",
              llm_provider: "mock",
              llm_model: "mock-agent-runtime",
              workspace_id: "crash-workspace",
              project_id: stage
            },
            startImmediately: false,
            completionWebhookUrl: `http://127.0.0.1:${webhookPort}${webhookPath}`
          });
          const runId = seeded.attempts[0]!.run_id;
          const timestamp = new Date().toISOString();
          const db = await openSqliteDatabase(stageRoot);
          try {
            ensureSqliteSchema(db);
            upsertSqliteRecord({
              db,
              tableName: "runs",
              recordKey: runId,
              runId,
              createdAt: timestamp,
              targetId: `target-${stage}`,
              payload: {
                id: runId,
                target_id: `target-${stage}`,
                target_snapshot_id: `snapshot-${stage}`,
                workspace_id: "crash-workspace",
                project_id: stage,
                requested_by: null,
                policy_pack_id: null,
                status: "succeeded",
                run_mode: "static",
                audit_package: "deep-static",
                artifact_root: stageRoot,
                started_at: timestamp,
                completed_at: timestamp,
                static_score: 90,
                overall_score: 90,
                rating: "strong",
                created_at: timestamp
              }
            });
            await saveSqliteDatabase(stageRoot, db);
          } finally {
            db.close();
          }

          const crashManager = new PersistedAsyncJobManager({
            hydrateRun: () => undefined,
            startRun: async () => undefined,
            getRun: () => null,
            cancelRun: () => false
          } as any, {
            onTerminalJob: () => { terminalHookCalls += 1; },
            onLifecycleStageForTests: (observedStage) => {
              if (observedStage === stage) throw new Error(`simulated_async_crash:${stage}`);
            }
          });
          await crashManager.recoverJobs().catch((error) => {
            assert.match(error instanceof Error ? error.message : String(error), new RegExp(`simulated_async_crash:${stage}`));
          });

          const interrupted = await readPersistedAsyncJob(seeded.job.job_id, stageRoot);
          assert.equal(interrupted?.status, "succeeded");
          assert.equal(interrupted?.terminal_followup_status,
            stage === "after_terminal_followup_persist" ? "completed" : stage === "after_terminal_hook" ? "failed" : "pending");

          const recoveryManager = new PersistedAsyncJobManager({
            hydrateRun: () => undefined,
            startRun: async () => undefined,
            getRun: () => null,
            cancelRun: () => false
          } as any, {
            onTerminalJob: () => { terminalHookCalls += 1; }
          });
          await recoveryManager.recoverJobs();
          const recovered = await readPersistedAsyncJob(seeded.job.job_id, stageRoot);
          const attempts = await readPersistedAsyncJobAttempts(seeded.job.job_id, stageRoot);
          assert.equal(recovered?.terminal_followup_status, "completed");
          assert.equal(recovered?.terminal_followup_error, null);
          assert.equal(attempts.length, 1);
          assert.equal(webhookCounts.get(webhookPath), 1);
          assert.equal(terminalHookCalls, stage === "after_terminal_hook" ? 2 : 1);
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) => webhookServer.close((error) => error ? reject(error) : resolve()));
    }
  });
}

async function testConcurrentAsyncWorkerPersistenceStress(): Promise<void> {
  await withTempDir("tethermark-async-worker-stress-", async (rootDir) => {
    const runs = new Map<string, any>();
    let startCalls = 0;
    const manager = new PersistedAsyncJobManager({
      hydrateRun: (envelope: any) => runs.set(envelope.run_id, envelope),
      startRun: async (runId: string) => {
        startCalls += 1;
        const envelope = runs.get(runId);
        runs.set(runId, {
          ...envelope,
          status: "succeeded",
          updated_at: new Date().toISOString(),
          result: { run_id: runId, findings: [] }
        });
      },
      getRun: (runId: string) => runs.get(runId) ?? null,
      cancelRun: () => false
    } as any);
    const jobCount = 16;

    await withEnv({ HARNESS_LOCAL_DB_ROOT: rootDir }, async () => {
      const created = await Promise.all(Array.from({ length: jobCount }, (_, index) => manager.createJob({
        request: {
          local_path: rootDir,
          run_mode: "static",
          audit_package: "deep-static",
          llm_provider: "mock",
          llm_model: "mock-agent-runtime",
          workspace_id: "stress-workspace",
          project_id: `worker-project-${index}`
        }
      })));
      assert.equal(new Set(created.map((item) => item.job.job_id)).size, jobCount);

      let persistedJobs = await manager.listJobs(rootDir);
      for (let attempt = 0; attempt < 100 && persistedJobs.some((item) => item.status !== "succeeded" || item.terminal_followup_status !== "completed"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        persistedJobs = await manager.listJobs(rootDir);
      }
      assert.equal(persistedJobs.length, jobCount);
      assert.equal(persistedJobs.every((item) => item.status === "succeeded"), true);
      assert.equal(persistedJobs.every((item) => item.terminal_followup_status === "completed"), true);
      assert.equal(startCalls, jobCount);
      const attempts = await Promise.all(persistedJobs.map((job) => readPersistedAsyncJobAttempts(job.job_id, rootDir)));
      assert.equal(attempts.every((items) => items.length === 1 && items[0]?.status === "succeeded"), true);
    });
  });
}

async function testConcurrentAsyncApiPersistenceStress(): Promise<void> {
  await withWorkspaceTempDir("tethermark-async-api-stress-", async (rootDir) => {
    await stageBuiltinCoreEngineData(rootDir);
    const stateRoot = path.join(rootDir, "state");
    const projectDir = path.join(rootDir, "project");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "api-stress-target", version: "1.0.0" }), "utf8");

    await withEnv({
      HARNESS_API_AUTH_MODE: "none",
      HARNESS_LOCAL_DB_ROOT: stateRoot,
      HARNESS_DISABLE_LOCAL_BINARIES: "1",
      HARNESS_DISABLE_PYTHON_WORKERS: "1"
    }, async () => withWorkingDir(rootDir, async () => {
      const server = createApiServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
      });
      const baseUrl = `http://127.0.0.1:${getListeningPort(server)}`;
      const requestCount = 16;
      try {
        await waitForServer(`${baseUrl}/health`);
        const responses = await Promise.all(Array.from({ length: requestCount }, () => fetch(`${baseUrl}/runs/async`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-workspace": "stress-workspace", "x-harness-project": "stress-project" },
          body: JSON.stringify({
            request: {
              local_path: projectDir,
              run_mode: "static",
              audit_package: "deep-static",
              llm_provider: "mock",
              llm_model: "mock-agent-runtime"
            },
            start_immediately: false
          })
        })));
        const payloads = await Promise.all(responses.map((response) => response.json() as Promise<any>));
        assert.equal(responses.every((response) => response.status === 202), true, JSON.stringify(payloads));
        assert.equal(new Set(payloads.map((payload) => payload.job.job_id)).size, requestCount);
        assert.equal(payloads.every((payload) => payload.job.status === "queued" && payload.attempts.length === 1), true);

        const listResponse = await fetch(`${baseUrl}/runs/async`, {
          headers: { "x-harness-workspace": "stress-workspace", "x-harness-project": "stress-project" }
        });
        const listPayload = await listResponse.json() as any;
        assert.equal(listResponse.status, 200);
        assert.equal(listPayload.jobs.length, requestCount);
        assert.equal(listPayload.jobs.every((job: any) => job.status === "queued"), true);
        const attempts = await Promise.all(listPayload.jobs.map((job: any) => readPersistedAsyncJobAttempts(job.job_id, stateRoot)));
        assert.equal(attempts.every((items) => items.length === 1 && items[0]?.status === "queued"), true);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }));
  });
}

async function testPsqlCredentialsUseEnvironment(): Promise<void> {
  const environment = buildPsqlProcessEnv("postgresql://audit-user:p%26ss%20word@db.example.test:6543/tethermark?sslmode=verify-full", {});
  assert.equal(environment.PGHOST, "db.example.test");
  assert.equal(environment.PGPORT, "6543");
  assert.equal(environment.PGDATABASE, "tethermark");
  assert.equal(environment.PGUSER, "audit-user");
  assert.equal(environment.PGPASSWORD, "p&ss word");
  assert.equal(environment.PGSSLMODE, "verify-full");
}

async function testCompactBundleExportsPrunesOptionalDebugBundles(): Promise<void> {
  await withTempDir("harness-compact-bundles-", async (rootDir) => {
    const runsDir = path.join(rootDir, "runs");
    await fs.mkdir(runsDir, { recursive: true });
    const oldFile = path.join(runsDir, "run_old.json");
    const freshFile = path.join(runsDir, "run_fresh.json");
    await fs.writeFile(oldFile, "{}\n", "utf8");
    await fs.writeFile(freshFile, "{}\n", "utf8");
    const twoDaysAgo = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000));
    await fs.utimes(oldFile, twoDaysAgo, twoDaysAgo);
    const previousEnabled = process.env.HARNESS_BUNDLE_EXPORT_ENABLED;
    try {
      process.env.HARNESS_BUNDLE_EXPORT_ENABLED = "1";

      const dryRun = await compactBundleExports({ rootDir, dryRun: true, retentionDays: 1, mode: "local" });
      assert.deepEqual(dryRun.removed_files, ["run_old.json"]);
      assert.deepEqual(dryRun.kept_files, ["run_fresh.json"]);

      const live = await compactBundleExports({ rootDir, dryRun: false, retentionDays: 1, mode: "local" });
      assert.deepEqual(live.removed_files, ["run_old.json"]);
      assert.equal(await fs.stat(oldFile).then(() => true).catch(() => false), false);
      assert.equal(await fs.stat(freshFile).then(() => true).catch(() => false), true);
    } finally {
      if (previousEnabled === undefined) delete process.env.HARNESS_BUNDLE_EXPORT_ENABLED;
      else process.env.HARNESS_BUNDLE_EXPORT_ENABLED = previousEnabled;
    }
  });
}

async function testPruneArtifactsRemovesOldRunBundlesAndUpdatesIndex(): Promise<void> {
  await withTempDir("harness-artifact-retention-", async (rootDir) => {
    const artifactRoot = path.join(rootDir, ".artifacts");
    const oldRunDir = path.join(artifactRoot, "runs", "run_old");
    const freshRunDir = path.join(artifactRoot, "runs", "run_fresh");
    const sandboxDir = path.join(artifactRoot, "sandboxes", "run_old");
    await fs.mkdir(oldRunDir, { recursive: true });
    await fs.mkdir(freshRunDir, { recursive: true });
    await fs.mkdir(sandboxDir, { recursive: true });
    await fs.writeFile(path.join(oldRunDir, "planner-artifact.json"), JSON.stringify({ old: true }));
    await fs.writeFile(path.join(freshRunDir, "planner-artifact.json"), JSON.stringify({ fresh: true }));
    await fs.writeFile(path.join(sandboxDir, "execution-results.json"), JSON.stringify({ old: true }));
    await fs.writeFile(path.join(artifactRoot, "run-index.json"), `${JSON.stringify({
      run_old: { run_id: "run_old", artifact_dir: oldRunDir },
      run_fresh: { run_id: "run_fresh", artifact_dir: freshRunDir }
    }, null, 2)}\n`);

    const oldDate = new Date("2026-01-01T00:00:00.000Z");
    const freshDate = new Date("2026-05-01T00:00:00.000Z");
    await fs.utimes(oldRunDir, oldDate, oldDate);
    await fs.utimes(sandboxDir, oldDate, oldDate);
    await fs.utimes(freshRunDir, freshDate, freshDate);

    const dryRun = await pruneArtifacts({
      rootDir: artifactRoot,
      kind: "runs",
      olderThanDays: 30,
      dryRun: true,
      now: new Date("2026-05-05T00:00:00.000Z")
    });
    assert.equal(dryRun.removed_count, 1);
    assert.equal(await pathExists(oldRunDir), true);

    const live = await pruneArtifacts({
      rootDir: artifactRoot,
      kind: "runs",
      olderThanDays: 30,
      dryRun: false,
      now: new Date("2026-05-05T00:00:00.000Z")
    });
    assert.equal(live.removed_count, 1);
    assert.deepEqual(live.run_index_pruned_ids, ["run_old"]);
    assert.equal(await pathExists(oldRunDir), false);
    assert.equal(await pathExists(freshRunDir), true);
    assert.equal(await pathExists(sandboxDir), true);
    const index = JSON.parse(await fs.readFile(path.join(artifactRoot, "run-index.json"), "utf8"));
    assert.equal(index.run_old, undefined);
    assert.equal(index.run_fresh.run_id, "run_fresh");
  });
}

async function testArtifactRetentionPreservesRunsAndReconcilesArtifactIndex(): Promise<void> {
  await withTempDir("harness-artifact-retention-consistency-", async (rootDir) => {
    const artifactRoot = path.join(rootDir, ".artifacts");
    const persistenceRoot = path.join(artifactRoot, "state", "local-db");
    const oldRunDir = path.join(artifactRoot, "runs", "run_old");
    const activeRunDir = path.join(artifactRoot, "runs", "run_active");
    const oldArtifactPath = path.join(oldRunDir, "planner-artifact.json");
    const activeArtifactPath = path.join(activeRunDir, "planner-artifact.json");
    await fs.mkdir(oldRunDir, { recursive: true });
    await fs.mkdir(activeRunDir, { recursive: true });
    await fs.writeFile(oldArtifactPath, "{}\n", "utf8");
    await fs.writeFile(activeArtifactPath, "{}\n", "utf8");
    const oldDate = new Date("2026-01-01T00:00:00.000Z");
    await fs.utimes(oldRunDir, oldDate, oldDate);
    await fs.utimes(activeRunDir, oldDate, oldDate);

    const db = await openSqliteDatabase(persistenceRoot);
    try {
      ensureSqliteSchema(db);
      for (const run of [
        { id: "run_old", status: "succeeded", artifact_root: oldRunDir },
        { id: "run_active", status: "running", artifact_root: activeRunDir }
      ]) {
        upsertSqliteRecord({
          db,
          tableName: "runs",
          recordKey: run.id,
          runId: run.id,
          payload: {
            ...run,
            target_id: "target_retention",
            target_snapshot_id: "snapshot_retention",
            workspace_id: "default",
            project_id: "default",
            requested_by: null,
            policy_pack_id: null,
            run_mode: "static",
            audit_package: "agentic-static",
            started_at: "2026-01-01T00:00:00.000Z",
            completed_at: run.status === "running" ? null : "2026-01-01T00:01:00.000Z",
            static_score: 0,
            overall_score: 0,
            rating: "N/A",
            created_at: "2026-01-01T00:00:00.000Z"
          }
        });
      }
      for (const artifact of [
        { artifact_id: "artifact_old", run_id: "run_old", path: oldArtifactPath },
        { artifact_id: "artifact_active", run_id: "run_active", path: activeArtifactPath },
        { artifact_id: "artifact_missing", run_id: "run_missing", path: path.join(artifactRoot, "runs", "run_missing", "missing.json") }
      ]) {
        upsertSqliteRecord({
          db,
          tableName: "artifact_index",
          recordKey: artifact.artifact_id,
          runId: artifact.run_id,
          payload: { ...artifact, type: "planner-artifact", created_at: "2026-01-01T00:00:00.000Z", sha256: null, size_bytes: null }
        });
      }
      await withEnv({ HARNESS_SQLITE_AUTO_BACKUP_INTERVAL_MS: "0" }, async () => saveSqliteDatabase(persistenceRoot, db));
    } finally {
      db.close();
    }

    const dryRun = await pruneArtifacts({
      rootDir: artifactRoot,
      persistenceRoot,
      kind: "runs",
      olderThanDays: 30,
      dryRun: true,
      now: new Date("2026-05-05T00:00:00.000Z")
    });
    assert.deepEqual(dryRun.protected_run_ids, ["run_active"]);
    assert.deepEqual(dryRun.artifact_index_reconciled_ids, ["artifact_missing", "artifact_old"]);
    assert.equal(await pathExists(oldRunDir), true);

    const live = await withEnv({ HARNESS_SQLITE_AUTO_BACKUP_INTERVAL_MS: "0" }, async () => pruneArtifacts({
      rootDir: artifactRoot,
      persistenceRoot,
      kind: "runs",
      olderThanDays: 30,
      now: new Date("2026-05-05T00:00:00.000Z")
    }));
    assert.deepEqual(live.artifact_index_reconciled_ids, ["artifact_missing", "artifact_old"]);
    assert.equal(await pathExists(oldRunDir), false);
    assert.equal(await pathExists(activeRunDir), true);

    const verification = await openSqliteDatabase(persistenceRoot);
    try {
      assert.deepEqual(readSqliteTable<any>(verification, "runs").map((item) => item.id).sort(), ["run_active", "run_old"]);
      assert.deepEqual(readSqliteTable<any>(verification, "artifact_index").map((item) => item.artifact_id), ["artifact_active"]);
    } finally {
      verification.close();
    }
  });
}

async function testScheduledArtifactRetentionRunsOncePerIntervalAndRecordsHistory(): Promise<void> {
  await withTempDir("harness-artifact-retention-schedule-", async (rootDir) => {
    const artifactRoot = path.join(rootDir, ".artifacts");
    const runDir = path.join(artifactRoot, "runs", "run_old");
    const sandboxDir = path.join(artifactRoot, "sandboxes", "sandbox_old");
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(sandboxDir, { recursive: true });
    await fs.writeFile(path.join(runDir, "report.json"), "{}\n", "utf8");
    await fs.writeFile(path.join(sandboxDir, "target.txt"), "fixture\n", "utf8");
    const oldDate = new Date("2026-01-01T00:00:00.000Z");
    await fs.utimes(runDir, oldDate, oldDate);
    await fs.utimes(sandboxDir, oldDate, oldDate);

    const first = await runScheduledArtifactRetention({
      rootDir: artifactRoot,
      runRetentionDays: 30,
      sandboxRetentionDays: 7,
      intervalMs: 24 * 60 * 60 * 1000,
      now: new Date("2026-05-05T00:00:00.000Z")
    });
    assert.equal(first.due, true);
    assert.equal(first.state?.status, "succeeded");
    assert.deepEqual(first.state?.summaries.map((item) => item.removed_count), [1, 1]);
    assert.equal(await pathExists(runDir), false);
    assert.equal(await pathExists(sandboxDir), false);

    const second = await runScheduledArtifactRetention({
      rootDir: artifactRoot,
      runRetentionDays: 30,
      sandboxRetentionDays: 7,
      intervalMs: 24 * 60 * 60 * 1000,
      now: new Date("2026-05-05T12:00:00.000Z")
    });
    assert.equal(second.due, false);
    const history = JSON.parse(await fs.readFile(path.join(artifactRoot, "maintenance", "artifact-retention-history.json"), "utf8"));
    assert.equal(history.length, 1);
    assert.equal(history[0].schema_version, "2026-08-26.artifact-retention-schedule.v1");
  });
}

async function testReadPersistedLaneSpecialistOutputsFromSqlite(): Promise<void> {
  await withTempDir("harness-lane-specialists-sqlite-", async (rootDir) => {
    const store = new LocalPersistenceStore(rootDir);
    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_1", target_type: "repo", canonical_name: "openclaw", repo_url: "https://github.com/openclaw/openclaw", local_path: null, endpoint_url: null, created_at: "2026-04-14T00:00:00.000Z" },
      target_snapshot: { id: "snap_1", target_id: "target_1", snapshot_value: "https://github.com/openclaw/openclaw", commit_sha: null, captured_at: "2026-04-14T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_1", target_id: "target_1", canonical_target_id: "target_1", canonical_name: "openclaw", target_type: "repo", repo_url: "https://github.com/openclaw/openclaw", local_path: null, endpoint_url: null, latest_run_id: "run_lane_sqlite", latest_run_created_at: "2026-04-14T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "B", latest_overall_score: 82, latest_static_score: 82, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 1, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-14T00:00:00.000Z" },
      policy_pack: null,
      run: { id: "run_lane_sqlite", target_id: "target_1", target_snapshot_id: "snap_1", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: rootDir, started_at: "2026-04-14T00:00:00.000Z", completed_at: "2026-04-14T00:01:00.000Z", static_score: 82, overall_score: 82, rating: "B", created_at: "2026-04-14T00:00:00.000Z" },
      resolved_configuration: { run_id: "run_lane_sqlite", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "repo", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "repo", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      stage_executions: [],
      lane_plans: [],
      evidence_records: [],
      lane_results: [],
      lane_specialists: [{ id: "run_lane_sqlite:lane-specialist:repo_posture", run_id: "run_lane_sqlite", lane_name: "repo_posture", agent_name: "lane_specialist_agent", output_artifact: "lane-specialist-repo_posture.json", summary_json: ["specialist summary"], observations_json: [{ title: "Obs", summary: "Detail", evidence: ["ev1"] }], evidence_ids_json: ["ev1"], tool_provider_ids_json: ["scorecard"] }],
      agent_invocations: [],
      tool_executions: [],
      findings: [],
      control_results: [],
      score_summary: { run_id: "run_lane_sqlite", methodology_version: "1", overall_score: 82, rating: "B", leaderboard_summary: "", limitations_json: [] },
      review_decision: { run_id: "run_lane_sqlite", publishability_status: "publishable", human_review_required: false, public_summary_safe: true, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "public" },
      policy_application: { run_id: "run_lane_sqlite", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: [], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [],
      metrics: [],
      events: [],
      artifact_index: []
    } as any);

    const outputs = await readPersistedLaneSpecialistOutputs("run_lane_sqlite", rootDir);
    assert.equal(outputs.length, 1);
    assert.equal(outputs[0]?.lane_name, "repo_posture");
    assert.deepEqual(outputs[0]?.tool_provider_ids_json, ["scorecard"]);
  });
}

async function testGoldenExportSnapshots(): Promise<void> {
  const { executiveJson, executiveMarkdown, sarif } = buildGoldenExports();
  const expected = await readGoldenExports();

  assert.equal(JSON.stringify(executiveJson, null, 2), expected.executiveJson);
  assert.equal(executiveMarkdown, expected.executiveMarkdown);
  assert.equal(JSON.stringify(sarif, null, 2), expected.sarif);
  assert.equal((sarif as any).runs[0]?.results[0]?.ruleId, "tethermark/tool_boundary/unsafe_tool_access");
  assert.equal((sarif as any).runs[0]?.results[0]?.locations?.[0]?.physicalLocation?.artifactLocation?.uri, "src/agent.js");
  assert.equal((sarif as any).runs[0]?.results[0]?.locations?.[0]?.physicalLocation?.region?.startLine, 17);
  assert.equal((sarif as any).runs[0]?.results[0]?.fingerprints?.["tethermark/symbol"], "unsafe_tool_access");
  assert.equal((sarif as any).runs[0]?.results[0]?.partialFingerprints?.["tethermark/evidence-identity"], "unsafe_tool_access");
  assert.equal((sarif as any).runs[0]?.results[0]?.properties?.evidenceSymbols?.[0], "unsafe_tool_access");
}


async function testBackfillLocalPersistenceMigratesLaneSpecialists(): Promise<void> {
  await withTempDir("harness-backfill-lane-specialists-", async (rootDir) => {
    const persistenceRoot = path.join(rootDir, "state", "local-db");
    const runsDir = path.join(persistenceRoot, "runs");
    const artifactRoot = path.join(rootDir, "artifacts", "run_legacy");
    await fs.mkdir(runsDir, { recursive: true });
    await fs.mkdir(artifactRoot, { recursive: true });
    await fs.writeFile(path.join(artifactRoot, "lane-specialists.json"), JSON.stringify([{ lane_name: "repo_posture", agent_name: "lane_specialist_agent", output_artifact: "lane-specialist-repo_posture.json", summary: ["legacy summary"], observations: [{ title: "Obs", summary: "Detail", evidence: ["ev1"] }], evidence_ids: ["ev1"], tool_provider_ids: ["scorecard"] }], null, 2) + "\n", "utf8");
    const bundle = {
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} },
      target: { id: "target_legacy", target_type: "repo", canonical_name: "openclaw", repo_url: "https://github.com/openclaw/openclaw", local_path: null, endpoint_url: null, created_at: "2026-04-14T00:00:00.000Z" },
      target_snapshot: { id: "snap_legacy", target_id: "target_legacy", snapshot_value: "https://github.com/openclaw/openclaw", commit_sha: null, captured_at: "2026-04-14T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_legacy", target_id: "target_legacy", canonical_target_id: "target_legacy", canonical_name: "openclaw", target_type: "repo", repo_url: "https://github.com/openclaw/openclaw", local_path: null, endpoint_url: null, latest_run_id: "run_legacy", latest_run_created_at: "2026-04-14T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "B", latest_overall_score: 82, latest_static_score: 82, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 0, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-14T00:00:00.000Z" },
      policy_pack: null,
      run: { id: "run_legacy", target_id: "target_legacy", target_snapshot_id: "snap_legacy", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: artifactRoot, started_at: "2026-04-14T00:00:00.000Z", completed_at: "2026-04-14T00:01:00.000Z", static_score: 82, overall_score: 82, rating: "B", created_at: "2026-04-14T00:00:00.000Z" },
      resolved_configuration: { run_id: "run_legacy", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "repo", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "repo", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      stage_executions: [], lane_plans: [], evidence_records: [], lane_results: [], lane_specialists: [], agent_invocations: [], tool_executions: [], findings: [], control_results: [],
      score_summary: { run_id: "run_legacy", methodology_version: "1", overall_score: 82, rating: "B", leaderboard_summary: "", limitations_json: [] },
      review_decision: { run_id: "run_legacy", publishability_status: "publishable", human_review_required: false, public_summary_safe: true, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "public" },
      policy_application: { run_id: "run_legacy", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: [], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [], metrics: [], events: [], artifact_index: []
    };
    await fs.writeFile(path.join(runsDir, "run_legacy.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");

    const summary = await backfillLocalPersistence({ rootDir: persistenceRoot, dryRun: false });
    const outputs = await readPersistedLaneSpecialistOutputs("run_legacy", persistenceRoot);
    const updatedBundle = JSON.parse(await fs.readFile(path.join(runsDir, "run_legacy.json"), "utf8"));

    assert.equal(summary.updated_runs, 1);
    assert.equal(outputs.length, 1);
    assert.equal(outputs[0]?.lane_name, "repo_posture");
    assert.equal(updatedBundle.lane_specialists.length, 1);
    assert.equal(updatedBundle.lane_specialists[0]?.agent_name, "lane_specialist_agent");
  });
}

async function testReadPersistedToolAdapterSummary(): Promise<void> {
  await withTempDir("harness-tool-adapters-", async (rootDir) => {
    const executions = [
      {
        id: "tool1",
        run_id: "run_tool_adapters",
        lane_name: "repo_posture",
        provider_id: "scorecard",
        provider_kind: "local_binary",
        tool: "scorecard",
        status: "skipped",
        exit_code: null,
        summary: "local unavailable",
        command_json: ["scorecard"],
        artifact_type: "scorecard-output",
        artifact_path: null,
        parsed_json: null,
        normalized_json: null,
        adapter_json: {
          requested_provider_id: "scorecard",
          requested_tool: "scorecard",
          adapter_action: "direct",
          fallback_reason: null,
          fallback_candidates: ["scorecard_api"],
          attempt_order: 1
        },
        stderr: null
      },
      {
        id: "tool2",
        run_id: "run_tool_adapters",
        lane_name: "repo_posture",
        provider_id: "scorecard_api",
        provider_kind: "public_api",
        tool: "scorecard_api",
        status: "completed",
        exit_code: 0,
        summary: "fallback success",
        command_json: [],
        artifact_type: "scorecard-api-output",
        artifact_path: null,
        parsed_json: {},
        normalized_json: null,
        adapter_json: {
          requested_provider_id: "scorecard",
          requested_tool: "scorecard",
          adapter_action: "fallback",
          fallback_reason: "command_unavailable",
          fallback_candidates: ["scorecard_api"],
          attempt_order: 2
        },
        stderr: null
      }
    ];
    await fs.writeFile(path.join(rootDir, "tool_executions.json"), JSON.stringify(executions, null, 2) + "\n", "utf8");

    const summary = await readPersistedToolAdapterSummary("run_tool_adapters", rootDir);
    assert.equal(summary.total_executions, 2);
    assert.equal(summary.direct_count, 1);
    assert.equal(summary.fallback_count, 1);
    assert.equal(summary.buckets.length, 1);
    assert.equal(summary.buckets[0]?.requested_provider_id, "scorecard");
    assert.deepEqual(summary.buckets[0]?.fallback_targets, ["scorecard_api"]);
  });
}

async function testReadPersistedObservability(): Promise<void> {
  await withTempDir("harness-persisted-observability-", async (rootDir) => {
    const store = new LocalPersistenceStore(rootDir);
    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_obs", target_type: "repo", canonical_name: "openclaw", repo_url: "https://github.com/openclaw/openclaw", local_path: null, endpoint_url: null, created_at: "2026-04-14T00:00:00.000Z" },
      target_snapshot: { id: "snap_obs", target_id: "target_obs", snapshot_value: "https://github.com/openclaw/openclaw", commit_sha: null, captured_at: "2026-04-14T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_obs", target_id: "target_obs", canonical_target_id: "target_obs", canonical_name: "openclaw", target_type: "repo", repo_url: "https://github.com/openclaw/openclaw", local_path: null, endpoint_url: null, latest_run_id: "run_obs", latest_run_created_at: "2026-04-14T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "B", latest_overall_score: 82, latest_static_score: 82, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 0, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-14T00:00:00.000Z" },
      policy_pack: null,
      run: { id: "run_obs", target_id: "target_obs", target_snapshot_id: "snap_obs", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: rootDir, started_at: "2026-04-14T00:00:00.000Z", completed_at: "2026-04-14T00:01:00.000Z", static_score: 82, overall_score: 82, rating: "B", created_at: "2026-04-14T00:00:00.000Z" },
      resolved_configuration: { run_id: "run_obs", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "repo", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "repo", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      stage_executions: [
        { id: "run_obs:prepare_target", run_id: "run_obs", stage_name: "prepare_target", actor: "stage_prepare_target", status: "success", reused_from_run_id: null, started_at: "2026-04-14T00:00:00.000Z", completed_at: "2026-04-14T00:00:02.000Z", duration_ms: 2000, details_json: {} },
        { id: "run_obs:maintenance_reconstruct", run_id: "run_obs", stage_name: "maintenance_reconstruct", actor: "persistence_backfill", status: "reused", reused_from_run_id: "run_old", started_at: "2026-04-14T00:00:30.000Z", completed_at: "2026-04-14T00:01:00.000Z", duration_ms: 30000, details_json: {} }
      ],
      lane_plans: [],
      evidence_records: [],
      lane_results: [],
      lane_specialists: [],
      agent_invocations: [
        { id: "inv_obs", run_id: "run_obs", stage_name: "plan_scope", lane_name: "repo_posture", agent_name: "planner_agent", provider: "openai", model: "gpt-5.4", status: "completed", attempts: 1, context_bytes: 128, user_prompt_bytes: 64, prompt_tokens: 50, completion_tokens: 25, total_tokens: 75, estimated_cost_usd: 0.01234567, started_at: "2026-04-14T00:00:05.000Z", completed_at: "2026-04-14T00:00:06.000Z", input_artifacts_json: [], output_artifact: "planner-artifact" }
      ],
      tool_executions: [
        { id: "tool_obs", run_id: "run_obs", lane_name: "repo_posture", provider_id: "scorecard", provider_kind: "public_api", tool: "scorecard_api", status: "completed", exit_code: 0, summary: "ok", command_json: [], artifact_type: "scorecard-output", artifact_path: null, parsed_json: {}, normalized_json: {}, adapter_json: null, stderr: null }
      ],
      findings: [],
      control_results: [],
      score_summary: { run_id: "run_obs", methodology_version: "1", overall_score: 82, rating: "B", leaderboard_summary: "", limitations_json: [] },
      review_decision: { run_id: "run_obs", publishability_status: "publishable", human_review_required: false, public_summary_safe: true, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "public" },
      policy_application: { run_id: "run_obs", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: [], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [],
      metrics: [
        { run_id: "run_obs", name: "reconstruction_operations_total", kind: "counter", value: 1, count: null, min: null, max: null, avg: null, tags_json: { actor: "persistence_backfill" } },
        { run_id: "run_obs", name: "custom_metric", kind: "gauge", value: 2, count: null, min: null, max: null, avg: null, tags_json: { actor: "persistence_backfill" } }
      ],
      events: [
        { event_id: "evt_run", run_id: "run_obs", timestamp: "2026-04-14T00:00:00.000Z", level: "info", stage: "run", actor: "orchestrator", event_type: "run_started", status: "running" },
        { event_id: "evt_maint", run_id: "run_obs", timestamp: "2026-04-14T00:01:00.000Z", level: "info", stage: "maintenance_reconstruct", actor: "persistence_backfill", event_type: "reconstruction_completed", status: "unchanged", details: { tool_change_count: 0 } }
      ],
      artifact_index: []
    } as any);

    const events = await readPersistedEvents("run_obs", rootDir);
    const metrics = await readPersistedMetrics("run_obs", rootDir);
    const observability = await readPersistedObservability("run_obs", rootDir);
    const maintenance = await readPersistedMaintenanceHistory("run_obs", rootDir);
    const summary = await readPersistedObservabilitySummary("run_obs", { rootDir, dbMode: "local" });
    const history = await getPersistedObservabilityHistory({ rootDir, dbMode: "local" });

    assert.equal(events.length, 2);
    assert.equal(metrics.length, 2);
    assert.equal(observability.events.length, 2);
    assert.equal(observability.metrics.length, 2);
    assert.equal(maintenance.events.length, 1);
    assert.equal(maintenance.metrics.length, 2);
    assert.equal(maintenance.last_maintenance_at, "2026-04-14T00:01:00.000Z");
    assert.equal(summary.totals.total_tokens, 75);
    assert.equal(summary.totals.provider_count, 2);
    assert.equal(summary.stage_rollups[0]?.stage_name, "maintenance_reconstruct");
    assert.equal(summary.lane_rollups[0]?.lane_name, "repo_posture");
    assert.equal(summary.provider_rollups[0]?.provider_id, "openai:gpt-5.4");
    assert.equal(history.totals.run_count, 1);
    assert.equal(history.daily_rollups[0]?.total_tokens, 75);
    assert.equal(history.retention_policy.database_mode, "local");
  });
}

async function testReadPersistedStageArtifact(): Promise<void> {
  await withTempDir("harness-stage-artifact-", async (rootDir) => {
    const store = new LocalPersistenceStore(rootDir);
    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_stage", target_type: "repo", canonical_name: "openclaw", repo_url: "https://github.com/openclaw/openclaw", local_path: null, endpoint_url: null, created_at: "2026-04-14T00:00:00.000Z" },
      target_snapshot: { id: "snap_stage", target_id: "target_stage", snapshot_value: "https://github.com/openclaw/openclaw", commit_sha: null, captured_at: "2026-04-14T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_stage", target_id: "target_stage", canonical_target_id: "target_stage", canonical_name: "openclaw", target_type: "repo", repo_url: "https://github.com/openclaw/openclaw", local_path: null, endpoint_url: null, latest_run_id: "run_stage", latest_run_created_at: "2026-04-14T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "B", latest_overall_score: 82, latest_static_score: 82, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 0, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-14T00:00:00.000Z" },
      policy_pack: null,
      run: { id: "run_stage", target_id: "target_stage", target_snapshot_id: "snap_stage", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: rootDir, started_at: "2026-04-14T00:00:00.000Z", completed_at: "2026-04-14T00:01:00.000Z", static_score: 82, overall_score: 82, rating: "B", created_at: "2026-04-14T00:00:00.000Z" },
      resolved_configuration: { run_id: "run_stage", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "repo", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "repo", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      stage_artifacts: [{ id: "run_stage:stage-artifact:run-plan", run_id: "run_stage", artifact_type: "run-plan", payload_json: { selected_profile: "deep-static", target_class: "repo_posture_only" }, created_at: "2026-04-14T00:00:00.000Z" }],
      stage_executions: [], lane_plans: [], evidence_records: [], lane_results: [], lane_specialists: [], agent_invocations: [], tool_executions: [], findings: [], control_results: [],
      score_summary: { run_id: "run_stage", methodology_version: "1", overall_score: 82, rating: "B", leaderboard_summary: "", limitations_json: [] },
      review_decision: { run_id: "run_stage", publishability_status: "publishable", human_review_required: false, public_summary_safe: true, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "public" },
      policy_application: { run_id: "run_stage", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: [], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [], metrics: [], events: [], artifact_index: []
    } as any);

    const runPlan = await readPersistedStageArtifact<any>("run_stage", "run-plan", rootDir);
    assert.equal(runPlan?.selected_profile, "deep-static");
    assert.equal(runPlan?.target_class, "repo_posture_only");
  });
}

async function testCleanupLocalJsonMirrorsDryRun(): Promise<void> {
  await withTempDir("harness-cleanup-dry-", async (rootDir) => {
    await fs.mkdir(path.join(rootDir, "runs"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "harness.sqlite"), "sqlite");
    await fs.writeFile(path.join(rootDir, "persistence-meta.json"), "{}\n");
    await fs.writeFile(path.join(rootDir, "runs.json"), "[]\n");
    await fs.writeFile(path.join(rootDir, "targets.json"), "[]\n");
    await fs.writeFile(path.join(rootDir, "metrics.json"), "[]\n");

    const summary = await cleanupLocalJsonMirrors({ rootDir, dryRun: true });

    assert.equal(summary.dry_run, true);
    assert.deepEqual(summary.removed_files, ["metrics.json", "runs.json", "targets.json"]);
    assert.deepEqual(summary.kept_files, ["harness.sqlite", "persistence-meta.json", "runs"]);

    const remaining = (await fs.readdir(rootDir)).sort();
    assert.deepEqual(remaining, ["harness.sqlite", "metrics.json", "persistence-meta.json", "runs", "runs.json", "targets.json"]);
  });
}

async function testReadPersistedRunUsageSummary(): Promise<void> {
  await withTempDir("harness-usage-", async (rootDir) => {
    const invocations = [
      {
        id: "call1",
        run_id: "run_usage",
        stage_name: "plan_scope",
        lane_name: null,
        agent_name: "planner_agent",
        provider: "openai",
        model: "gpt-test",
        status: "success",
        attempts: 1,
        context_bytes: 100,
        user_prompt_bytes: 200,
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
        estimated_cost_usd: 0.01,
        started_at: "2026-04-14T00:00:00.000Z",
        completed_at: "2026-04-14T00:00:01.000Z",
        input_artifacts_json: [],
        output_artifact: "planner-artifact.json"
      },
      {
        id: "call2",
        run_id: "run_usage",
        stage_name: "skeptic_review",
        lane_name: null,
        agent_name: "audit_supervisor_agent",
        provider: "openai",
        model: "gpt-test",
        status: "success",
        attempts: 1,
        context_bytes: 150,
        user_prompt_bytes: 250,
        prompt_tokens: 20,
        completion_tokens: 5,
        total_tokens: 25,
        estimated_cost_usd: 0.02,
        started_at: "2026-04-14T00:00:02.000Z",
        completed_at: "2026-04-14T00:00:03.000Z",
        input_artifacts_json: [],
        output_artifact: "skeptic-review.json"
      }
    ];
    await fs.writeFile(path.join(rootDir, "agent_invocations.json"), `${JSON.stringify(invocations, null, 2)}\n`, "utf8");

    const summary = await readPersistedRunUsageSummary("run_usage", rootDir);

    assert.equal(summary.totals.invocation_count, 2);
    assert.equal(summary.totals.total_tokens, 39);
    assert.equal(summary.by_stage.length, 2);
    assert.deepEqual(summary.by_stage.map((item) => item.name).sort(), ["plan_scope", "skeptic_review"]);
    assert.equal(summary.by_agent[0]?.name, "audit_supervisor_agent");
  });
}

async function testCleanupLocalJsonMirrorsLive(): Promise<void> {
  await withTempDir("harness-cleanup-live-", async (rootDir) => {
    await fs.mkdir(path.join(rootDir, "runs"), { recursive: true });
    await fs.writeFile(path.join(rootDir, "harness.sqlite"), "sqlite");
    await fs.writeFile(path.join(rootDir, "persistence-meta.json"), "{}\n");
    await fs.writeFile(path.join(rootDir, "events.json"), "[]\n");
    await fs.writeFile(path.join(rootDir, "tool_executions.json"), "[]\n");

    const summary = await cleanupLocalJsonMirrors({ rootDir, dryRun: false });

    assert.equal(summary.dry_run, false);
    assert.deepEqual(summary.removed_files, ["events.json", "tool_executions.json"]);
    assert.deepEqual(summary.kept_files, ["harness.sqlite", "persistence-meta.json", "runs"]);

    const remaining = (await fs.readdir(rootDir)).sort();
    assert.deepEqual(remaining, ["harness.sqlite", "persistence-meta.json", "runs"]);
  });
}

async function testValidateLocalPersistenceDetectsMissingRecords(): Promise<void> {
  await withTempDir("harness-validate-missing-", async (rootDir) => {
    const runsDir = path.join(rootDir, "runs");
    await fs.mkdir(runsDir, { recursive: true });
    await fs.writeFile(path.join(runsDir, "run_missing.json"), JSON.stringify({
      mode: "local",
      target: { id: "target_missing", target_type: "repo", canonical_name: "missing", repo_url: "https://github.com/example/missing", local_path: null, endpoint_url: null, created_at: "2026-04-14T00:00:00.000Z" },
      target_snapshot: { id: "snap_missing", target_id: "target_missing", snapshot_value: "https://github.com/example/missing", commit_sha: null, captured_at: "2026-04-14T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_missing", target_id: "target_missing", canonical_target_id: "target_missing", canonical_name: "missing", target_type: "repo", repo_url: "https://github.com/example/missing", local_path: null, endpoint_url: null, latest_run_id: "run_missing", latest_run_created_at: "2026-04-14T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "B", latest_overall_score: 82, latest_static_score: 82, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 0, latest_frameworks_json: [], latest_languages_json: [], latest_package_ecosystems_json: [], updated_at: "2026-04-14T00:00:00.000Z" },
      run: { id: "run_missing", target_id: "target_missing", target_snapshot_id: "snap_missing", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: path.join(rootDir, "artifacts", "run_missing"), started_at: "2026-04-14T00:00:00.000Z", completed_at: "2026-04-14T00:01:00.000Z", static_score: 82, overall_score: 82, rating: "B", created_at: "2026-04-14T00:00:00.000Z" },
      lane_reuse_decisions: [],
      lane_plans: [],
      evidence_records: [],
      lane_results: [],
      lane_specialists: [],
      agent_invocations: [],
      tool_executions: [],
      findings: [],
      control_results: [],
      dimension_scores: []
    }, null, 2) + "\n", "utf8");

    const summary = await validateLocalPersistence({ rootDir });
    assert.equal(summary.selected_runs, 1);
    assert.equal(summary.invalid_runs, 1);
    assert.equal(summary.results[0]?.run_id, "run_missing");
    assert.equal(summary.results[0]?.valid, false);
    assert.ok(summary.results[0]?.missing_sections.includes("run"));
    assert.ok(summary.results[0]?.missing_sections.includes("resolved_configuration"));
  });
}

async function testValidateLocalPersistencePassesForPersistedRun(): Promise<void> {
  await withTempDir("harness-validate-ok-", async (rootDir) => {
    const store = new LocalPersistenceStore(rootDir);
    const previousEnabled = process.env.HARNESS_BUNDLE_EXPORT_ENABLED;
    try {
      process.env.HARNESS_BUNDLE_EXPORT_ENABLED = "1";
      await store.persistBundle({
        mode: "local",
        package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
        target: { id: "target_valid", target_type: "repo", canonical_name: "valid", repo_url: "https://github.com/example/valid", local_path: null, endpoint_url: null, created_at: "2026-04-14T00:00:00.000Z" },
        target_snapshot: { id: "snap_valid", target_id: "target_valid", snapshot_value: "https://github.com/example/valid", commit_sha: null, captured_at: "2026-04-14T00:00:00.000Z", analysis_hash: null },
        target_summary: { id: "target_valid", target_id: "target_valid", canonical_target_id: "target_valid", canonical_name: "valid", target_type: "repo", repo_url: "https://github.com/example/valid", local_path: null, endpoint_url: null, latest_run_id: "run_valid", latest_run_created_at: "2026-04-14T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "B", latest_overall_score: 82, latest_static_score: 82, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 0, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-14T00:00:00.000Z" },
        policy_pack: null,
        run: { id: "run_valid", target_id: "target_valid", target_snapshot_id: "snap_valid", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: path.join(rootDir, "artifacts", "run_valid"), started_at: "2026-04-14T00:00:00.000Z", completed_at: "2026-04-14T00:01:00.000Z", static_score: 82, overall_score: 82, rating: "B", created_at: "2026-04-14T00:00:00.000Z" },
        resolved_configuration: { run_id: "run_valid", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "repo", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "repo", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
        commit_diff: { run_id: "run_valid", previous_run_id: null, current_commit_sha: null, previous_commit_sha: null, comparison_mode: "no_prior_run", changed_files_json: [], stage_decisions_json: { planner: "rerun", threat_model: "rerun", eval_selection: "rerun" }, rationale_json: [] },
        correction_plan: null,
        correction_result: null,
        lane_reuse_decisions: [{ id: "run_valid:lane-reuse:repo_posture", run_id: "run_valid", lane_name: "repo_posture", decision: "rerun", rationale_json: [] }],
        persistence_summary: { run_id: "run_valid", mode: "local", root: rootDir },
        stage_artifacts: [
          { id: "run_valid:stage-artifact:planner-artifact", run_id: "run_valid", artifact_type: "planner-artifact", payload_json: {}, created_at: "2026-04-14T00:00:00.000Z" },
          { id: "run_valid:stage-artifact:target-profile", run_id: "run_valid", artifact_type: "target-profile", payload_json: {}, created_at: "2026-04-14T00:00:00.000Z" },
          { id: "run_valid:stage-artifact:threat-model", run_id: "run_valid", artifact_type: "threat-model", payload_json: {}, created_at: "2026-04-14T00:00:00.000Z" },
          { id: "run_valid:stage-artifact:eval-selection", run_id: "run_valid", artifact_type: "eval-selection", payload_json: {}, created_at: "2026-04-14T00:00:00.000Z" },
          { id: "run_valid:stage-artifact:run-plan", run_id: "run_valid", artifact_type: "run-plan", payload_json: {}, created_at: "2026-04-14T00:00:00.000Z" },
          { id: "run_valid:stage-artifact:findings-pre-skeptic", run_id: "run_valid", artifact_type: "findings-pre-skeptic", payload_json: [], created_at: "2026-04-14T00:00:00.000Z" },
          { id: "run_valid:stage-artifact:score-summary", run_id: "run_valid", artifact_type: "score-summary", payload_json: {}, created_at: "2026-04-14T00:00:00.000Z" },
          { id: "run_valid:stage-artifact:observations", run_id: "run_valid", artifact_type: "observations", payload_json: [], created_at: "2026-04-14T00:00:00.000Z" }
        ],
        stage_executions: [],
        lane_plans: [],
        evidence_records: [],
        lane_results: [],
        lane_specialists: [],
        agent_invocations: [],
        tool_executions: [],
        findings: [],
        control_results: [],
        score_summary: { run_id: "run_valid", methodology_version: "1", overall_score: 82, rating: "B", leaderboard_summary: "", limitations_json: [] },
        review_decision: { run_id: "run_valid", publishability_status: "publishable", human_review_required: false, public_summary_safe: true, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "public" },
        policy_application: { run_id: "run_valid", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: [], effective_control_ids_json: [], notes_json: [] },
        dimension_scores: [],
        metrics: [],
        events: [],
        artifact_index: []
      } as any);

      const summary = await validateLocalPersistence({ rootDir });
      assert.equal(summary.selected_runs, 1);
      assert.equal(summary.valid_runs, 1);
      assert.equal(summary.invalid_runs, 0);
      assert.equal(summary.results[0]?.run_id, "run_valid");
      assert.equal(summary.results[0]?.valid, true);
    } finally {
      if (previousEnabled === undefined) delete process.env.HARNESS_BUNDLE_EXPORT_ENABLED;
      else process.env.HARNESS_BUNDLE_EXPORT_ENABLED = previousEnabled;
    }
  });
}

async function testFreshRunPersistsExpectedRecords(): Promise<void> {
  await withTempDir("harness-fresh-run-", async (rootDir) => {
    await stageBuiltinCoreEngineData(rootDir);
    const projectDir = path.join(rootDir, "sample-project");
    await fs.mkdir(path.join(projectDir, "src"), { recursive: true });
    await fs.writeFile(path.join(projectDir, "README.md"), "# Sample Project\n\nA small test repository.\n", "utf8");
    await fs.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "sample-project", version: "1.0.0" }, null, 2) + "\n", "utf8");
    await fs.writeFile(path.join(projectDir, "src", "index.ts"), "export function main() { return 'ok'; }\n", "utf8");

    const result = await withEnv({
      HARNESS_DISABLE_LOCAL_BINARIES: "1",
      HARNESS_DISABLE_PYTHON_WORKERS: "1"
    }, async () => {
      return withWorkingDir(rootDir, async () => {
        const engine = createEngine();
        return engine.run({
          local_path: projectDir,
          run_mode: "static",
          audit_package: "deep-static",
          llm_provider: "mock",
          llm_model: "mock-agent-runtime"
        });
      });
    });

    const persistenceRoot = path.join(rootDir, ".artifacts", "state", "local-db");
    const run = await getPersistedRun(result.run_id, persistenceRoot);
    const targetSummary = await readPersistedTargetSummary(result.target.target_id, persistenceRoot);
    const resolvedConfig = await readPersistedResolvedConfiguration(result.run_id, persistenceRoot);
    const commitDiff = await readPersistedCommitDiff(result.run_id, persistenceRoot);
    const lanePlans = await readPersistedLanePlans(result.run_id, persistenceRoot);
    const evidenceRecords = await readPersistedEvidenceRecords(result.run_id, persistenceRoot);
    const laneResults = await readPersistedLaneResults(result.run_id, persistenceRoot);
    const laneReuse = await readPersistedLaneReuseDecisions(result.run_id, persistenceRoot);
    const toolExecutions = await readPersistedToolExecutions(result.run_id, persistenceRoot);
    const findings = await readPersistedFindings(result.run_id, persistenceRoot);
    const controlResults = await readPersistedControlResults(result.run_id, persistenceRoot);
    const scoreSummary = await readPersistedScoreSummary(result.run_id, persistenceRoot);
    const reviewDecision = await readPersistedReviewDecision(result.run_id, persistenceRoot);
    const policyApplication = await readPersistedPolicyApplication(result.run_id, persistenceRoot);
    const dimensionScores = await readPersistedDimensionScores(result.run_id, persistenceRoot);
    const stageArtifacts = await readPersistedStageArtifacts(result.run_id, persistenceRoot);
    const stageExecutions = await readPersistedStageExecutions(result.run_id, persistenceRoot);
    const events = await readPersistedEvents(result.run_id, persistenceRoot);
    const metrics = await readPersistedMetrics(result.run_id, persistenceRoot);
    const artifactIndex = await readPersistedArtifactIndex(result.run_id, persistenceRoot);

    assert.ok(run);
    assert.ok(targetSummary);
    assert.ok(resolvedConfig);
    assert.ok(commitDiff);
    assert.ok(scoreSummary);
    assert.ok(reviewDecision);
    assert.ok(policyApplication);
    assert.ok(lanePlans.length > 0);
    assert.ok(laneResults.length > 0);
    assert.ok(laneReuse.length > 0);
    assert.ok(toolExecutions.length > 0);
    assert.ok(controlResults.length > 0);
    assert.ok(dimensionScores.length > 0);
    assert.ok(stageExecutions.length > 0);
    assert.ok(events.length > 0);
    assert.ok(metrics.length > 0);
    assert.ok(artifactIndex.length > 0);
    const stageArtifactTypes = new Set(stageArtifacts.map((item) => item.artifact_type));
    for (const artifactType of ["preflight-summary", "launch-intent", "planner-artifact", "target-profile", "threat-model", "eval-selection", "run-plan", "findings-pre-skeptic", "finding-integrity-pre-supervisor", "finding-quality-pre-skeptic", "finding-quality", "handoffs", "score-summary", "observations"]) {
      assert.equal(stageArtifactTypes.has(artifactType), true, `missing stage artifact ${artifactType}`);
    }
    assert.equal(run?.id, result.run_id);
    assert.equal(scoreSummary?.overall_score, result.score_summary.overall_score);
    assert.equal(reviewDecision?.publishability_status, result.publishability.publishability_status);
    assert.equal(events.at(-1)?.event_type, "run_completed");
    assert.equal(metrics.some((item) => item.name === "findings_total"), true);
    assert.equal(evidenceRecords.length >= 0, true);
    assert.equal(findings.length >= 0, true);
  });
}

async function testPersistedReviewWorkflowAndActions(): Promise<void> {
  await withTempDir("harness-review-workflow-", async (rootDir) => {
    const store = new LocalPersistenceStore(rootDir);
    const reviewDecision = {
      run_id: "run_review",
      publishability_status: "review_required",
      human_review_required: true,
      public_summary_safe: false,
      threshold: "high",
      rationale_json: ["needs reviewer"],
      gating_findings_json: ["finding_review"],
      recommended_visibility: "internal"
    } as const;
    const remediationMemo = {
      run_id: "run_review",
      summary: "Human review required",
      checklist_json: ["confirm exploitability"],
      human_review_required: true
    } as const;

    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_review", target_type: "repo", canonical_name: "review-target", repo_url: "https://github.com/example/review-target", local_path: null, endpoint_url: null, created_at: "2026-04-15T00:00:00.000Z" },
      target_snapshot: { id: "snap_review", target_id: "target_review", snapshot_value: "https://github.com/example/review-target", commit_sha: null, captured_at: "2026-04-15T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_review", target_id: "target_review", canonical_target_id: "target_review", canonical_name: "review-target", target_type: "repo", repo_url: "https://github.com/example/review-target", local_path: null, endpoint_url: null, latest_run_id: "run_review", latest_run_created_at: "2026-04-15T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "fair", latest_overall_score: 61, latest_static_score: 61, latest_publishability_status: "review_required", latest_human_review_required: true, latest_finding_count: 1, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-15T00:00:00.000Z" },
      policy_pack: null,
      run: { id: "run_review", target_id: "target_review", target_snapshot_id: "snap_review", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: rootDir, started_at: "2026-04-15T00:00:00.000Z", completed_at: "2026-04-15T00:01:00.000Z", static_score: 61, overall_score: 61, rating: "fair", created_at: "2026-04-15T00:00:00.000Z" },
      resolved_configuration: { run_id: "run_review", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "repo", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "repo", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      commit_diff: null,
      correction_plan: null,
      correction_result: null,
      lane_reuse_decisions: [],
      persistence_summary: null,
      stage_artifacts: [],
      stage_executions: [],
      lane_plans: [],
      evidence_records: [],
      lane_results: [],
      lane_specialists: [],
      agent_invocations: [],
      tool_executions: [],
      findings: [{ id: "finding_review", run_id: "run_review", lane_name: null, title: "Needs confirmation", severity: "high", category: "boundary", description: "persisted", confidence: 0.9, source: "tool", publication_state: "internal_only", needs_human_review: true, score_impact: 8, control_ids_json: [], standards_refs_json: [], evidence_json: [], created_at: "2026-04-15T00:00:00.000Z" }],
      control_results: [],
      score_summary: { run_id: "run_review", methodology_version: "1", overall_score: 61, rating: "fair", leaderboard_summary: "", limitations_json: [] },
      review_decision: reviewDecision,
      supervisor_review: null,
      remediation_memo: remediationMemo,
      review_workflow: deriveInitialReviewWorkflow({
        run: { id: "run_review", created_at: "2026-04-15T00:00:00.000Z", workspace_id: "default", project_id: "default" },
        reviewDecision,
        remediationMemo
      }),
      review_actions: [],
      policy_application: { run_id: "run_review", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: ["finding_review"], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [],
      metrics: [],
      events: [],
      artifact_index: []
    } as any);

    const initialWorkflow = await readPersistedReviewWorkflow("run_review", rootDir);
    assert.equal(initialWorkflow?.status, "review_required");
    assert.equal(initialWorkflow?.human_review_required, true);

    const queue = await listPersistedReviewWorkflows({ rootDir, reviewStatus: "review_required" });
    assert.equal(queue.length, 1);
    assert.equal(queue[0]?.run_id, "run_review");

    const assignment = await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "triage-lead",
        action_type: "assign_reviewer",
        assigned_reviewer_id: "alice",
        notes: "ownership assigned"
      }
    });
    const notifications = await listPersistedReviewNotifications({ rootDir, reviewerId: "alice", status: "unread" });
    assert.equal(assignment.workflow.current_reviewer_id, "alice");
    assert.equal(assignment.notification?.reviewer_id, "alice");
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.notification_type, "review_assigned");

    const reassignment = await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "triage-lead",
        action_type: "assign_reviewer",
        assigned_reviewer_id: "bob",
        notes: "ownership moved"
      }
    });
    const bobNotifications = await listPersistedReviewNotifications({ rootDir, reviewerId: "bob", status: "unread" });
    assert.equal(reassignment.workflow.current_reviewer_id, "bob");
    assert.equal(reassignment.notification?.notification_type, "review_reassigned");
    assert.equal(bobNotifications.length, 1);
    assert.equal(bobNotifications[0]?.notification_type, "review_reassigned");

    await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "bob",
        action_type: "start_review",
        notes: "starting review"
      }
    });
    const rerunRequest = await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "bob",
        action_type: "request_validation",
        finding_id: "finding_review",
        notes: "needs validation rerun"
      }
    });
    const rerunNotifications = await listPersistedReviewNotifications({ rootDir, reviewerId: "bob", status: "unread", notificationType: "review_rerun_required" });
    assert.equal(rerunRequest.workflow.status, "requires_rerun");
    assert.equal(rerunRequest.notification?.notification_type, "review_rerun_required");
    assert.equal(rerunNotifications.length, 1);

    await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "bob",
        action_type: "start_review",
        notes: "validation complete"
      }
    });
    const runtimeRerun = await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "bob",
        action_type: "rerun_in_capable_env",
        finding_id: "finding_review",
        notes: "host execution was blocked, rerun this finding in a capable environment"
      }
    });
    assert.equal(runtimeRerun.workflow.status, "requires_rerun");
    assert.equal(runtimeRerun.notification?.notification_type, "review_rerun_required");
    await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "bob",
        action_type: "start_review",
        notes: "rerun scheduled and reviewed"
      }
    });
    await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "bob",
        action_type: "mark_manual_runtime_review_complete",
        finding_id: "finding_review",
        notes: "manual runtime review completed after bounded validation follow-up"
      }
    });
    await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "bob",
        action_type: "downgrade_severity",
        finding_id: "finding_review",
        previous_severity: "high",
        updated_severity: "medium",
        visibility_override: "internal",
        triage_decision: "confirmed",
        review_priority: "p1",
        validation_intent: "manual_review",
        notes: "downgraded after manual verification"
      }
    });
    await submitPersistedReviewAction({
      runId: "run_review",
      rootDirOrOptions: { rootDir, dbMode: "local" },
      input: {
        reviewer_id: "bob",
        action_type: "approve_run",
        finding_id: "finding_review",
        notes: "validated and approved"
      }
    });

    const finalWorkflow = await readPersistedReviewWorkflow("run_review", rootDir);
    const actions = await readPersistedReviewActions("run_review", rootDir);
    await createPersistedReviewComment({
      runId: "run_review",
      authorId: "bob",
      body: "handoff note for downstream publication review",
      findingId: "finding_review",
      rootDirOrOptions: { rootDir, dbMode: "local" }
    });
    const findings = await readPersistedFindings("run_review", rootDir);
    const comments = await readPersistedReviewComments("run_review", rootDir);
    const reviewSummary = buildReviewSummary({ workflow: finalWorkflow, findings, actions, comments });
    assert.equal(finalWorkflow?.status, "approved");
    assert.equal(finalWorkflow?.current_reviewer_id, "bob");
    assert.equal(actions.length, 10);
    assert.equal(actions[0]?.action_type, "assign_reviewer");
    assert.equal(actions[1]?.action_type, "assign_reviewer");
    assert.equal(actions[2]?.action_type, "start_review");
    assert.equal(actions[3]?.action_type, "request_validation");
    assert.equal(actions[3]?.finding_id, "finding_review");
    assert.equal(actions[4]?.action_type, "start_review");
    assert.equal(actions[5]?.action_type, "rerun_in_capable_env");
    assert.equal(actions[6]?.action_type, "start_review");
    assert.equal(actions[7]?.action_type, "mark_manual_runtime_review_complete");
    assert.equal(actions[8]?.action_type, "downgrade_severity");
    assert.equal(actions[8]?.updated_severity, "medium");
    assert.equal(isValidHumanApprovalRecord((actions[8]?.metadata_json as any)?.human_approval, { action: "severity_downgrade", subject: "finding_review" }), true);
    assert.equal(actions[8]?.triage_decision, "confirmed");
    assert.equal(actions[8]?.review_priority, "p1");
    assert.equal(actions[8]?.validation_intent, "manual_review");
    assert.equal(actions[9]?.action_type, "approve_run");
    assert.equal(reviewSummary.handoff.current_reviewer_id, "bob");
    assert.equal(reviewSummary.handoff.unresolved_finding_count, 0);
    assert.equal(reviewSummary.finding_summaries[0]?.disposition, "downgraded");
    assert.equal(reviewSummary.finding_summaries[0]?.current_severity, "medium");
    assert.equal(reviewSummary.finding_summaries[0]?.triage_decision, "confirmed");
    assert.equal(reviewSummary.finding_summaries[0]?.review_priority, "p1");
    assert.equal(reviewSummary.finding_summaries[0]?.validation_intent, "manual_review");
    assert.equal(reviewSummary.recent_comments.length, 1);
    assert.equal(comments.length, 1);
    assert.equal(comments[0]?.finding_id, "finding_review");
  });
}

async function testApiResponsesUsePersistedState(): Promise<void> {
  await withTempDir("harness-api-persisted-", async (rootDir) => {
    const localDbRoot = path.join(rootDir, ".artifacts", "state", "local-db");
    const dueSoonReviewDue = new Date(Date.now() + 24 * 36e5).toISOString();
    const reopenedReviewDue = new Date(Date.now() + 48 * 36e5).toISOString();
    const laterExpiry = new Date(Date.now() + 10 * 24 * 36e5).toISOString();
    const artifactRoot = path.join(rootDir, "artifacts", "run_api");
    await fs.mkdir(artifactRoot, { recursive: true });
    await fs.writeFile(path.join(artifactRoot, "final-score-summary.json"), JSON.stringify({ overall_score: 10, rating: "poor" }, null, 2) + "\n", "utf8");

    const store = new LocalPersistenceStore(localDbRoot);
    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_api", target_type: "repo", canonical_name: "api", repo_url: "https://github.com/example/api", local_path: null, endpoint_url: null, created_at: "2026-04-14T00:00:00.000Z" },
      target_snapshot: { id: "snap_api", target_id: "target_api", snapshot_value: "https://github.com/example/api", commit_sha: null, captured_at: "2026-04-14T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_api", target_id: "target_api", canonical_target_id: "target_api", canonical_name: "api", target_type: "repo", repo_url: "https://github.com/example/api", local_path: null, endpoint_url: null, latest_run_id: "run_api", latest_run_created_at: "2026-04-14T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "strong", latest_overall_score: 82, latest_static_score: 82, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 4, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-14T00:00:00.000Z" },
      policy_pack: null,
      run: { id: "run_api", target_id: "target_api", target_snapshot_id: "snap_api", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: artifactRoot, started_at: "2026-04-14T00:00:00.000Z", completed_at: "2026-04-14T00:01:00.000Z", static_score: 82, overall_score: 82, rating: "strong", created_at: "2026-04-14T00:00:00.000Z" },
      resolved_configuration: { run_id: "run_api", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "repo", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "repo", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      commit_diff: { run_id: "run_api", previous_run_id: null, current_commit_sha: null, previous_commit_sha: null, comparison_mode: "no_prior_run", changed_files_json: [], stage_decisions_json: { planner: "rerun", threat_model: "rerun", eval_selection: "rerun" }, rationale_json: [] },
      correction_plan: null,
      correction_result: null,
      lane_reuse_decisions: [],
      persistence_summary: { run_id: "run_api", mode: "local", root: localDbRoot },
      stage_artifacts: [
        {
          id: "run_api:stage-artifact:preflight-summary",
          run_id: "run_api",
          artifact_type: "preflight-summary",
          payload_json: {
            target: {
              kind: "repo",
              input: "https://github.com/example/api",
              analysis_available: false,
              target_class: "repo_posture_only",
              confidence: 0.72,
              evidence: ["Repository URL only preflight."],
              project_name: null,
              file_count: null,
              frameworks: [],
              languages: []
            },
            readiness: {
              status: "ready_with_warnings",
              blockers: [],
              warnings: ["Remote repository preflight does not clone contents yet; file-level analysis is deferred until run start."]
            },
            provider_readiness: [
              {
                provider_id: "scorecard_api",
                provider_kind: "public_api",
                status: "available",
                summary: "Scorecard API can be used as a hosted fallback."
              }
            ],
            recommended_audit_package: {
              id: "deep-static",
              title: "Deep Static",
              rationale: "Requested package will be used for launch."
            },
            selected_policy_pack: {
              id: null,
              name: null,
              source: null
            },
            launch_profile: {
              run_mode: "static",
              audit_package: "deep-static",
              audit_policy_pack: "default",
              llm_provider: "mock",
              llm_model: null,
              preflight_strictness: "standard",
              runtime_allowed: "targeted_only",
              review_severity: "high",
              review_visibility: "internal"
            },
            repo_signals: {
              package_ecosystems: [],
              package_managers: [],
              ci_workflows: 0,
              security_docs: 0,
              entry_points: 0,
              agentic_markers: 0,
              mcp_markers: 0
            }
          },
          created_at: "2026-04-14T00:00:00.000Z"
        },
        {
          id: "run_api:stage-artifact:launch-intent",
          run_id: "run_api",
          artifact_type: "launch-intent",
          payload_json: {
            source_surface: "web_ui",
            submitted_at: "2026-04-14T00:00:00.000Z",
            requested_by: "alice",
            workspace_id: "default",
            project_id: "default",
            target: {
              kind: "repo",
              input: "https://github.com/example/api"
            },
            requested_profile: {
              run_mode: "static",
              audit_package: "deep-static",
              audit_policy_pack: "default",
              llm_provider: "mock",
              llm_model: null,
              preflight_strictness: "standard",
              runtime_allowed: "targeted_only",
              review_severity: "high",
              review_visibility: "internal"
            },
            preflight: {
              summary_status: "ready_with_warnings",
              checked_at: "2026-04-14T00:00:00.000Z",
              accepted_at: "2026-04-14T00:00:05.000Z",
              stale: false,
              accepted: true
            },
            notes: ["submitted from oss web ui", "workspace:default", "project:default"]
          },
          created_at: "2026-04-14T00:00:00.000Z"
        },
        {
          id: "run_api:stage-artifact:observations",
          run_id: "run_api",
          artifact_type: "observations",
          payload_json: [
            {
              observation_id: "obs_api_1",
              title: "Repository posture follow-up",
              summary: "Persisted finding indicates repository review follow-up is still needed.",
              evidence: ["Persisted finding", "workflow posture note"]
            }
          ],
          created_at: "2026-04-14T00:00:00.000Z"
        },
        {
          id: "run_api:stage-artifact:sandbox-execution",
          run_id: "run_api",
          artifact_type: "sandbox-execution",
          payload_json: {
            readiness_status: "ready_with_warnings",
            runtime: "unconfigured",
            plan: {
              readiness_status: "ready_with_warnings",
              detected_stack: ["node"],
              entry_signals: ["package.json:scripts.build", "package.json:scripts.test"],
              steps: [
                { step_id: "install-npm", phase: "install", command: ["npm", "ci", "--ignore-scripts"], rationale: "lockfile present", requires_network: true, enabled: true },
                { step_id: "build-node", phase: "build", command: ["npm", "run", "build"], rationale: "build script", requires_network: false, enabled: true }
              ],
              warnings: ["Container runtime is not configured for this persisted run."]
            },
            results: [
              { step_id: "install-npm", status: "blocked", checked_at: "2026-04-14T00:00:03.000Z", execution_runtime: "host_probe", summary: "Container runtime is not configured, so bounded execution cannot start." },
              { step_id: "build-node", status: "blocked", checked_at: "2026-04-14T00:00:03.000Z", execution_runtime: "host_probe", summary: "Container runtime is not configured, so bounded execution cannot start." }
            ]
          },
          created_at: "2026-04-14T00:00:00.000Z"
        }
      ],
      stage_executions: [
        { id: "run_api:assess_controls", run_id: "run_api", stage_name: "assess_controls", actor: "stage_assess_controls", status: "success", reused_from_run_id: null, started_at: "2026-04-14T00:00:05.000Z", completed_at: "2026-04-14T00:00:08.000Z", duration_ms: 3000, details_json: {} }
      ],
      lane_plans: [],
      evidence_records: [
        {
          id: "e_api_runtime_test",
          run_id: "run_api",
          lane_name: null,
          source_type: "tool",
          source_id: "sandbox:test-node",
          control_ids_json: ["CTRL-1"],
          summary: "Bounded host execution completed successfully for 'npm run test'.",
          confidence: 0.9,
          raw_artifact_path: null,
          locations_json: [
            { source_kind: "file", path: "src/agent.js", line: 17, column: 3, end_line: 17, end_column: 24, label: "test_report" }
          ],
          metadata_json: {
            category: "sandbox_execution",
            phase: "test",
            status: "completed",
            adapter: "node_npm",
            normalized_artifact: {
              type: "test",
              title: "node-test",
              summary: "Bounded host execution completed successfully for 'npm run test'.",
              details_json: {
                stack: "node",
                package_manager: "npm",
                script_name: "test",
                artifact_role: "test_report"
              }
            }
          }
        },
        {
          id: "e_api_runtime_probe",
          run_id: "run_api",
          lane_name: null,
          source_type: "tool",
          source_id: "sandbox:runtime-node",
          control_ids_json: ["CTRL-3"],
          summary: "Bounded host execution failed for 'npm run start'.",
          confidence: 0.78,
          raw_artifact_path: null,
          locations_json: [
            { source_kind: "file", path: "src/server.js", line: 41, column: 1, end_line: 41, end_column: 18, label: "service_probe" }
          ],
          metadata_json: {
            category: "sandbox_execution",
            phase: "runtime_probe",
            status: "failed",
            adapter: "http_service",
            normalized_artifact: {
              type: "runtime_probe",
              title: "http-runtime-probe",
              summary: "Bounded host execution failed for 'npm run start'.",
              details_json: {
                stack: "node",
                package_manager: "npm",
                script_name: "start",
                artifact_role: "service_probe",
                startup: {
                  signaled_ready: false,
                  indicator: null
                },
                probe: {
                  classification: "connection_refused",
                  attempted_targets: ["http://127.0.0.1:3000/", "http://127.0.0.1:3000/health"],
                  successful_target: null,
                  error: "connection refused"
                }
              }
            }
          }
        }
      ],
      lane_results: [],
      lane_specialists: [],
      agent_invocations: [
        { id: "inv_api", run_id: "run_api", stage_name: "plan_scope", lane_name: "repo_posture", agent_name: "planner_agent", provider: "openai", model: "gpt-5.4", status: "completed", attempts: 1, context_bytes: 100, user_prompt_bytes: 50, prompt_tokens: 40, completion_tokens: 20, total_tokens: 60, estimated_cost_usd: 0.01, started_at: "2026-04-14T00:00:01.000Z", completed_at: "2026-04-14T00:00:02.000Z", input_artifacts_json: [], output_artifact: "planner-artifact" }
      ],
      tool_executions: [
        { id: "tool_api", run_id: "run_api", lane_name: "repo_posture", provider_id: "scorecard", provider_kind: "public_api", tool: "scorecard_api", status: "completed", exit_code: 0, summary: "ok", command_json: [], artifact_type: "scorecard-output", artifact_path: null, parsed_json: {}, normalized_json: {}, adapter_json: null, stderr: null }
      ],
      findings: [
        { id: "finding_api", run_id: "run_api", lane_name: null, title: "Persisted finding", severity: "medium", category: "test", description: "persisted", confidence: 0.8, source: "tool", publication_state: "public_safe", needs_human_review: false, score_impact: 5, control_ids_json: ["CTRL-1"], standards_refs_json: [], evidence_json: ["scanner output"], created_at: "2026-04-14T00:00:00.000Z" },
        { id: "finding_api_dup", run_id: "run_api", lane_name: null, title: "Persisted finding duplicate", severity: "high", category: "test", description: "conflicting persisted", confidence: 0.45, source: "tool", publication_state: "internal_only", needs_human_review: true, score_impact: 8, control_ids_json: ["CTRL-1"], standards_refs_json: [], evidence_json: [], created_at: "2026-04-14T00:00:05.000Z" },
        { id: "finding_api_expired", run_id: "run_api", lane_name: null, title: "Persisted expired waiver finding", severity: "low", category: "test", description: "previously waived finding that must be revisited", confidence: 0.6, source: "tool", publication_state: "internal_only", needs_human_review: true, score_impact: 3, control_ids_json: ["CTRL-2"], standards_refs_json: [], evidence_json: ["legacy note"], created_at: "2026-04-14T00:00:07.000Z" },
        { id: "finding_api_reopened", run_id: "run_api", lane_name: null, title: "Persisted reopened waiver finding", severity: "medium", category: "test", description: "waiver should reopen when evidence changed", confidence: 0.72, source: "tool", publication_state: "internal_only", needs_human_review: true, score_impact: 4, control_ids_json: ["CTRL-3"], standards_refs_json: [], evidence_json: ["new scanner evidence"], created_at: "2026-04-14T00:00:09.000Z" }
      ],
      control_results: [],
      score_summary: { run_id: "run_api", methodology_version: "1", overall_score: 82, rating: "strong", leaderboard_summary: "persisted-summary", limitations_json: [] },
      review_decision: { run_id: "run_api", publishability_status: "publishable", human_review_required: false, public_summary_safe: true, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "public" },
      supervisor_review: {
        run_id: "run_api",
        summary_json: { overall_evidence_sufficiency: "medium", overall_false_positive_risk: "medium", publication_safety_note: "persisted review" },
        grader_outputs_json: [
          { finding_id: "finding_api", evidence_sufficiency: "medium", false_positive_risk: "low", validation_recommendation: "no", reasoning_summary: "Primary finding has at least one persisted evidence item." },
          { finding_id: "finding_api_dup", evidence_sufficiency: "low", false_positive_risk: "high", validation_recommendation: "yes", reasoning_summary: "Duplicate/conflicting finding needs manual validation." },
          { finding_id: "finding_api_expired", evidence_sufficiency: "medium", false_positive_risk: "medium", validation_recommendation: "no", reasoning_summary: "Historical waiver expired and needs reviewer confirmation." },
          { finding_id: "finding_api_reopened", evidence_sufficiency: "medium", false_positive_risk: "medium", validation_recommendation: "no", reasoning_summary: "Evidence drift should reopen the waiver for reviewer confirmation." }
        ],
        actions_json: [{ type: "request_additional_evidence", reason: "persisted action" }],
        notes_json: ["persisted note"],
        final_review: true
      },
      remediation_memo: { run_id: "run_api", summary: "Persisted remediation", checklist_json: ["rotate credentials"], human_review_required: false },
      review_workflow: { run_id: "run_api", status: "review_required", human_review_required: true, publishability_status: "publishable", recommended_visibility: "public", opened_at: "2026-04-14T00:00:00.000Z", started_at: null, completed_at: null, current_reviewer_id: null, last_action_at: null, last_action_type: null, notes_json: [] },
      review_actions: [],
      runtime_followups: [{
        id: "runtime-followup-1",
        run_id: "run_api",
        workspace_id: "default",
        project_id: "default",
        finding_id: "finding_api",
        finding_title: "Persisted finding",
        status: "completed",
        followup_policy: "rerun_in_capable_env",
        requested_by: "triage_api",
        requested_at: "2026-04-14T00:02:00.000Z",
        source_review_action_id: "review_action_runtime_followup_seed",
        rerun_request_json: null,
        linked_job_id: null,
        linked_run_id: null,
        launch_attempted_at: "2026-04-14T00:03:00.000Z",
        completed_at: "2026-04-14T00:04:00.000Z",
        completed_status: "succeeded",
        rerun_outcome: "confirmed",
        rerun_outcome_summary: "Linked rerun confirmed the original runtime-sensitive issue.",
        rerun_outcome_finding_ids_json: ["finding_api_rerun"],
        rerun_reconciled_at: "2026-04-14T00:04:30.000Z",
        resolved_at: null,
        resolved_by: null,
        resolution_action_type: null,
        resolution_notes: null,
        metadata_json: {}
      }],
      policy_application: { run_id: "run_api", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: ["finding_api", "finding_api_expired", "finding_api_reopened"], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [],
      metrics: [{ run_id: "run_api", name: "llm_total_tokens_total", kind: "gauge", value: 60, count: null, min: null, max: null, avg: null, tags_json: {} }],
      events: [
        { event_id: "evt_api_start", run_id: "run_api", timestamp: "2026-04-14T00:00:00.000Z", level: "info", stage: "run", actor: "orchestrator", event_type: "run_started", status: "running" },
        { event_id: "evt_api_done", run_id: "run_api", timestamp: "2026-04-14T00:01:00.000Z", level: "info", stage: "run", actor: "orchestrator", event_type: "run_completed", status: "success" }
      ],
      artifact_index: []
    } as any);

    await upsertRuntimeFollowupFromReviewAction({
      runId: "run_api",
      actionId: "review_action_runtime_followup_seed",
      rootDirOrOptions: localDbRoot,
      input: {
        reviewer_id: "triage_api",
        action_type: "rerun_in_capable_env",
        finding_id: "finding_api",
        notes: "seeded runtime follow-up for export coverage",
        metadata: null
      }
    });

    const apiIntegrationSettings = {
      credentials: {
        configured_endpoints: []
      },
      integrations: {
        github_mode: "manual",
        github_allowed_actions: ["pr_comment", "issue_create"],
        github_owned_repo_only: false,
        github_owned_repo_prefixes: [],
        github_require_per_run_approval: true
      }
    };
    await updatePersistedUiSettings(apiIntegrationSettings, { rootDir: path.join(rootDir, ".artifacts", "state", "local-db"), dbMode: "local" });
    await updatePersistedUiSettings(apiIntegrationSettings, { rootDir: path.join(rootDir, ".artifacts", "state", "local-db"), dbMode: "local" }, { workspaceId: "default", projectId: "default", scopeLevel: "project" });

    const seededSuppression = await createPersistedFindingDisposition({
      runId: "run_api",
      rootDirOrOptions: path.join(rootDir, ".artifacts", "state", "local-db"),
      input: {
        disposition_type: "suppression",
        scope_level: "run",
        finding_id: "finding_api_dup",
        finding_signature: "test::persisted finding duplicate",
        reason: "temporary run-only suppression for noisy duplicate during regression coverage",
        created_by: "triage_api",
        created_at: "2026-04-14T00:02:00.000Z",
        metadata: {
          evidence_fingerprint: buildFindingEvidenceFingerprint({
            id: "finding_api_dup",
            category: "test",
            title: "Persisted finding duplicate",
            severity: "high",
            publication_state: "internal_only",
            evidence_json: []
          } as any)
        }
      }
    });
    const seededReopenedWaiver = await createPersistedFindingDisposition({
      runId: "run_api",
      rootDirOrOptions: path.join(rootDir, ".artifacts", "state", "local-db"),
      input: {
        disposition_type: "waiver",
        scope_level: "project",
        finding_id: "finding_api_reopened",
        finding_signature: "test::persisted reopened waiver finding",
        reason: "project waiver based on older evidence snapshot",
        created_by: "triage_api",
        created_at: "2026-04-14T00:02:20.000Z",
        metadata: {
          owner_id: "security-owner",
          reviewed_at: "2026-04-14T00:02:20.000Z",
          evidence_fingerprint: JSON.stringify({
            signature: "test::persisted reopened waiver finding",
            severity: "medium",
            publication_state: "internal_only",
            evidence: ["older evidence"]
          })
        }
      }
    });
    await createPersistedFindingDisposition({
      runId: "run_api",
      rootDirOrOptions: path.join(rootDir, ".artifacts", "state", "local-db"),
      input: {
        disposition_type: "waiver",
        scope_level: "project",
        finding_id: "finding_api",
        finding_signature: "test::persisted finding",
        reason: "accepted project waiver for known internal-only control gap",
        created_by: "triage_api",
        created_at: "2026-04-14T00:02:10.000Z",
        expires_at: laterExpiry,
        metadata: {
          owner_id: "security-owner",
          reviewed_at: "2026-04-14T00:02:10.000Z",
          review_due_by: dueSoonReviewDue,
          evidence_fingerprint: buildFindingEvidenceFingerprint({
            id: "finding_api",
            category: "test",
            title: "Persisted finding",
            severity: "medium",
            publication_state: "public_safe",
            evidence_json: ["scanner output"]
          } as any)
        }
      }
    });
    await createPersistedFindingDisposition({
      runId: "run_api",
      rootDirOrOptions: path.join(rootDir, ".artifacts", "state", "local-db"),
      input: {
        disposition_type: "waiver",
        scope_level: "project",
        finding_id: "finding_api_expired",
        finding_signature: "test::persisted expired waiver finding",
        reason: "historical waiver retained during migration coverage",
        created_by: "triage_api",
        created_at: "2026-04-14T00:01:30.000Z",
        expires_at: "2026-04-14T00:01:45.000Z",
        metadata: {
          owner_id: "security-owner",
          reviewed_at: "2026-04-14T00:01:30.000Z",
          evidence_fingerprint: buildFindingEvidenceFingerprint({
            id: "finding_api_expired",
            category: "test",
            title: "Persisted expired waiver finding",
            severity: "low",
            publication_state: "internal_only",
            evidence_json: ["legacy note"]
          } as any)
        }
      }
    });

    const port = 8800 + Math.floor(Math.random() * 200);
    await withWorkingDir(rootDir, async () => {
      await withEnv({
        HARNESS_LOCAL_DB_ROOT: localDbRoot,
        HARNESS_API_AUTH_MODE: "none",
        HARNESS_DISABLE_LEARNING_SCHEDULER: "1"
      }, async () => {
      const server = createApiServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve());
      });

      try {
        await waitForServer(`http://127.0.0.1:${port}/health`);
        const authInfoResponse = await fetch(`http://127.0.0.1:${port}/auth/info`);
        const llmProvidersResponse = await fetch(`http://127.0.0.1:${port}/llm-providers`);
        const integrationsResponse = await fetch(`http://127.0.0.1:${port}/integrations`);
        const summaryResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/summary`);
        const findingsResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/findings`);
        const evidenceRecordsResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/evidence-records`);
        const reviewWorkflowResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/review-workflow`);
        const reviewActionPostResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/review-actions`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "reviewer_api" },
          body: JSON.stringify({
            reviewer_id: "reviewer_api",
            action_type: "approve_run",
            notes: "api approval"
          })
        });
        const reviewActionsResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/review-actions`);
        const assignReviewerResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/review-actions`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "triage_api" },
          body: JSON.stringify({
            action_type: "assign_reviewer",
            assigned_reviewer_id: "qa_api",
            notes: "queue owner"
          })
        });
        const notificationsResponse = await fetch(`http://127.0.0.1:${port}/review-notifications?reviewer_id=qa_api`);
        const notificationsPayload = await notificationsResponse.json() as any;
        const acknowledgeResponse = await fetch(`http://127.0.0.1:${port}/review-notifications/${encodeURIComponent(notificationsPayload.review_notifications[0]?.id ?? "missing")}/ack`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: "{}"
        });
        const reviewCommentResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/review-comments`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: JSON.stringify({
            body: "manual triage comment",
            finding_id: "finding_api"
          })
        });
        const runsListResponse = await fetch(`http://127.0.0.1:${port}/runs`);
        const reviewCommentsResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/review-comments`);
        const findingDispositionsResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/finding-dispositions`);
        const updateDispositionResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/finding-dispositions/${encodeURIComponent(seededReopenedWaiver.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: JSON.stringify({
            reason: "reviewed project waiver after evidence refresh",
            owner_id: "lead-reviewer",
            reviewed_at: "2026-04-15T08:00:00.000Z",
            review_due_by: reopenedReviewDue
          })
        });
        const revokeDispositionResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/finding-dispositions/${encodeURIComponent(seededSuppression.id)}/revoke`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: JSON.stringify({ notes: "duplicate no longer needs suppression" })
        });
        const findingDispositionsAfterMutationResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/finding-dispositions`);
        const supervisorReviewResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/supervisor-review`);
        const remediationResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/remediation`);
        const observationsResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/observations`);
        const findingEvaluationsResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/finding-evaluations`);
        const executiveReportJsonResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/report-executive?format=json`);
        const executiveReportMarkdownResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/report-executive?format=markdown`);
        const markdownReportResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/report-markdown`);
        const sarifReportResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/report-sarif`);
        const comparisonReportJsonResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/report-compare?compare_to=run_api&format=json`);
        const comparisonReportMarkdownResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/report-compare?compare_to=run_api&format=markdown`);
        const exportsIndexResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/exports?compare_to=run_api`);
        const preflightResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/preflight`);
        const launchIntentResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/launch-intent`);
        const outboundPreviewResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-preview`);
        const outboundApprovalBeforeResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-approval`);
        const outboundSendBlockedResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-send`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: "{}"
        });
        const outboundApprovalPostResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-approval`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: JSON.stringify({ notes: ["approved for manual GitHub share"] })
        });
        const outboundApprovalAfterResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-approval`);
        const outboundSendResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-send`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: JSON.stringify({ action_type: "pr_comment" })
        });
        const outboundSendStoredResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-send`);
        const outboundVerificationBeforeResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-verification`);
        const outboundDeliveryBlockedResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-delivery`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: JSON.stringify({ action_type: "pr_comment", target_number: 123 })
        });
        const outboundVerificationPostResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-verification`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: "{}"
        });
        const outboundVerificationAfterResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-verification`);
        const outboundDeliveryResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-delivery`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "qa_api" },
          body: JSON.stringify({ action_type: "pr_comment", target_number: 123 })
        });
        const outboundDeliveryStoredResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/outbound-delivery`);
        const reviewSummaryResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/review-summary`);
        const reviewAuditResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/review-audit`);
        const runtimeFollowupsResponse = await fetch(`http://127.0.0.1:${port}/runtime-followups`);
        const runtimeFollowupSummaryResponse = await fetch(`http://127.0.0.1:${port}/runtime-followups/summary`);
        const runtimeFollowupExportJsonResponse = await fetch(`http://127.0.0.1:${port}/runtime-followups/export?format=json`);
        const runtimeFollowupExportCsvResponse = await fetch(`http://127.0.0.1:${port}/runtime-followups/export?format=csv`);
        const observabilitySummaryResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/observability-summary`);
        const agentTraceResponse = await fetch(`http://127.0.0.1:${port}/runs/run_api/agent-trace`);
        const observabilityStatsResponse = await fetch(`http://127.0.0.1:${port}/stats/observability`);
        const summaryPayload = await summaryResponse.json() as any;
        const findingsPayload = await findingsResponse.json() as any;
        const evidenceRecordsPayload = await evidenceRecordsResponse.json() as any;
        const reviewWorkflowPayload = await reviewWorkflowResponse.json() as any;
        const reviewActionPostPayload = await reviewActionPostResponse.json() as any;
        const reviewActionsPayload = await reviewActionsResponse.json() as any;
        const assignReviewerPayload = await assignReviewerResponse.json() as any;
        const acknowledgePayload = await acknowledgeResponse.json() as any;
        const reviewCommentPayload = await reviewCommentResponse.json() as any;
        const runsListPayload = await runsListResponse.json() as any;
        const reviewCommentsPayload = await reviewCommentsResponse.json() as any;
        const findingDispositionsPayload = await findingDispositionsResponse.json() as any;
        const updateDispositionPayload = await updateDispositionResponse.json() as any;
        const revokeDispositionPayload = await revokeDispositionResponse.json() as any;
        const findingDispositionsAfterMutationPayload = await findingDispositionsAfterMutationResponse.json() as any;
        const supervisorReviewPayload = await supervisorReviewResponse.json() as any;
        const remediationPayload = await remediationResponse.json() as any;
        const observationsPayload = await observationsResponse.json() as any;
        const findingEvaluationsPayload = await findingEvaluationsResponse.json() as any;
        const executiveReportJsonPayload = await executiveReportJsonResponse.json() as any;
        const executiveReportMarkdownPayload = await executiveReportMarkdownResponse.json() as any;
        const markdownReportPayload = await markdownReportResponse.json() as any;
        const sarifReportPayload = await sarifReportResponse.json() as any;
        const comparisonReportJsonPayload = await comparisonReportJsonResponse.json() as any;
        const comparisonReportMarkdownPayload = await comparisonReportMarkdownResponse.json() as any;
        const exportsIndexPayload = await exportsIndexResponse.json() as any;
        const preflightPayload = await preflightResponse.json() as any;
        const launchIntentPayload = await launchIntentResponse.json() as any;
        const outboundPreviewPayload = await outboundPreviewResponse.json() as any;
        const outboundApprovalBeforePayload = await outboundApprovalBeforeResponse.json() as any;
        const outboundSendBlockedPayload = await outboundSendBlockedResponse.json() as any;
        const outboundApprovalPostPayload = await outboundApprovalPostResponse.json() as any;
        const outboundApprovalAfterPayload = await outboundApprovalAfterResponse.json() as any;
        const outboundSendPayload = await outboundSendResponse.json() as any;
        const outboundSendStoredPayload = await outboundSendStoredResponse.json() as any;
        const outboundVerificationBeforePayload = await outboundVerificationBeforeResponse.json() as any;
        const outboundDeliveryBlockedPayload = await outboundDeliveryBlockedResponse.json() as any;
        const outboundVerificationPostPayload = await outboundVerificationPostResponse.json() as any;
        const outboundVerificationAfterPayload = await outboundVerificationAfterResponse.json() as any;
        const outboundDeliveryPayload = await outboundDeliveryResponse.json() as any;
        const outboundDeliveryStoredPayload = await outboundDeliveryStoredResponse.json() as any;
        const reviewSummaryPayload = await reviewSummaryResponse.json() as any;
        const reviewAuditPayload = await reviewAuditResponse.json() as any;
        const runtimeFollowupsPayload = await runtimeFollowupsResponse.json() as any;
        const runtimeFollowupSummaryPayload = await runtimeFollowupSummaryResponse.json() as any;
        const runtimeFollowupExportJsonPayload = await runtimeFollowupExportJsonResponse.json() as any;
        const runtimeFollowupExportCsvPayload = await runtimeFollowupExportCsvResponse.json() as any;
        const observabilitySummaryPayload = await observabilitySummaryResponse.json() as any;
        const agentTracePayload = await agentTraceResponse.json() as any;
        const observabilityStatsPayload = await observabilityStatsResponse.json() as any;
        const authInfoPayload = await authInfoResponse.json() as any;
        const llmProvidersPayload = await llmProvidersResponse.json() as any;
        const integrationsPayload = await integrationsResponse.json() as any;

        assert.equal(authInfoResponse.status, 200);
        assert.equal(llmProvidersResponse.status, 200);
        assert.equal(integrationsResponse.status, 200);
        assert.equal(summaryResponse.status, 200);
        assert.equal(findingsResponse.status, 200);
        assert.equal(evidenceRecordsResponse.status, 200);
        assert.equal(reviewWorkflowResponse.status, 200);
        assert.equal(reviewActionPostResponse.status, 200);
        assert.equal(reviewActionsResponse.status, 200);
        assert.equal(assignReviewerResponse.status, 200);
        assert.equal(notificationsResponse.status, 200);
        assert.equal(acknowledgeResponse.status, 200);
        assert.equal(reviewCommentResponse.status, 200);
        assert.equal(runsListResponse.status, 200);
        assert.equal(reviewCommentsResponse.status, 200);
        assert.equal(findingDispositionsResponse.status, 200);
        assert.equal(updateDispositionResponse.status, 200);
        assert.equal(revokeDispositionResponse.status, 200);
        assert.equal(findingDispositionsAfterMutationResponse.status, 200);
        assert.equal(supervisorReviewResponse.status, 200);
        assert.equal(remediationResponse.status, 200);
        assert.equal(observationsResponse.status, 200);
        assert.equal(findingEvaluationsResponse.status, 200);
        assert.equal(executiveReportJsonResponse.status, 200);
        assert.equal(executiveReportMarkdownResponse.status, 200);
        assert.equal(markdownReportResponse.status, 200);
        assert.equal(sarifReportResponse.status, 200);
        assert.equal(comparisonReportJsonResponse.status, 200);
        assert.equal(comparisonReportMarkdownResponse.status, 200);
        assert.equal(exportsIndexResponse.status, 200);
        assert.equal(preflightResponse.status, 200);
        assert.equal(launchIntentResponse.status, 200);
        assert.equal(outboundPreviewResponse.status, 200);
        assert.equal(outboundApprovalBeforeResponse.status, 200);
        assert.equal(outboundSendBlockedResponse.status, 409);
        assert.equal(outboundApprovalPostResponse.status, 200);
        assert.equal(outboundApprovalAfterResponse.status, 200);
        assert.equal(outboundSendResponse.status, 200);
        assert.equal(outboundSendStoredResponse.status, 200);
        assert.equal(outboundVerificationBeforeResponse.status, 200);
        assert.equal(outboundDeliveryBlockedResponse.status, 403);
        assert.equal(outboundVerificationPostResponse.status, 403);
        assert.equal(outboundVerificationAfterResponse.status, 200);
        assert.equal(outboundDeliveryResponse.status, 403);
        assert.equal(outboundDeliveryStoredResponse.status, 200);
        assert.equal(reviewSummaryResponse.status, 200);
        assert.equal(reviewAuditResponse.status, 200);
        assert.equal(runtimeFollowupsResponse.status, 200);
        assert.equal(runtimeFollowupSummaryResponse.status, 200);
        assert.equal(runtimeFollowupExportJsonResponse.status, 200);
        assert.equal(runtimeFollowupExportCsvResponse.status, 200);
        assert.equal(observabilitySummaryResponse.status, 200);
        assert.equal(agentTraceResponse.status, 200);
        assert.equal(observabilityStatsResponse.status, 200);
        assert.equal(summaryPayload.summary.overall_score, 82);
        assert.equal(summaryPayload.summary.finding_count, 4);
        assert.equal(summaryPayload.summary.review_workflow_status, "review_required");
        assert.equal(summaryPayload.summary.sandbox_execution.readiness_status, "ready_with_warnings");
        assert.equal(summaryPayload.summary.sandbox_execution.blocked_step_count, 2);
        assert.equal(summaryPayload.summary.sandbox_execution_attention_required, true);
        assert.equal(typeof summaryPayload.summary.runtime_validation_blocked_count, "number");
        assert.equal(typeof summaryPayload.summary.runtime_validation_failed_count, "number");
        assert.equal(typeof summaryPayload.summary.runtime_validation_recommended_count, "number");
        assert.equal(typeof summaryPayload.summary.runtime_followup_required_count, "number");
        assert.equal(typeof summaryPayload.summary.runtime_followup_resolved_count, "number");
        assert.equal(typeof summaryPayload.summary.runtime_followup_rerun_requested_count, "number");
        assert.equal(findingsPayload.findings[0]?.title, "Persisted finding");
        assert.equal(findingsPayload.findings[1]?.id, "finding_api_dup");
        assert.equal(findingsPayload.findings[2]?.id, "finding_api_expired");
        assert.equal(findingsPayload.findings[3]?.id, "finding_api_reopened");
        assert.equal(evidenceRecordsPayload.evidence_records.length, 2);
        assert.equal(evidenceRecordsPayload.evidence_records[0]?.metadata_json?.category, "sandbox_execution");
        assert.equal(evidenceRecordsPayload.evidence_records[0]?.locations_json?.[0]?.path, "src/agent.js");
        assert.equal(evidenceRecordsPayload.evidence_records[0]?.locations_json?.[0]?.line, 17);
        assert.equal(evidenceRecordsPayload.evidence_records[1]?.metadata_json?.normalized_artifact?.details_json?.probe?.classification, "connection_refused");
        assert.equal(agentTracePayload.trace_policy.hidden_chain_of_thought_stored, false);
        assert.equal(typeof agentTracePayload.summary.stage_execution_count, "number");
        assert.equal(typeof agentTracePayload.summary.finding_quality_verdict, "string");
        assert.equal(Array.isArray(agentTracePayload.timeline), true);
        assert.equal(Array.isArray(agentTracePayload.intermediate_outputs), true);
        assert.equal(evidenceRecordsPayload.evidence_records[1]?.metadata_json?.normalized_artifact?.details_json?.startup?.signaled_ready, false);
        assert.equal(reviewWorkflowPayload.review_workflow.status, "review_required");
        assert.equal(reviewActionPostPayload.workflow.status, "approved");
        assert.equal(reviewActionsPayload.review_actions.length, 1);
        assert.equal(reviewActionsPayload.review_actions[0]?.reviewer_id, "reviewer_api");
        assert.equal(assignReviewerPayload.action.assigned_reviewer_id, "qa_api");
        assert.equal(assignReviewerPayload.notification.reviewer_id, "qa_api");
        assert.equal(notificationsPayload.review_notifications.length, 1);
        assert.equal(notificationsPayload.review_notifications[0]?.status, "unread");
        assert.equal(acknowledgePayload.review_notification.status, "acknowledged");
        assert.equal(reviewCommentPayload.review_comment.author_id, "qa_api");
        const listedRunApi = (runsListPayload.runs || []).find((item: any) => item.id === "run_api");
        assert.equal(listedRunApi?.review_summary_counts?.findings_needing_disposition_review_count, 2);
        assert.equal(listedRunApi?.review_summary_counts?.expired_disposition_count, 1);
        assert.equal(listedRunApi?.review_summary_counts?.due_soon_disposition_count, 1);
        assert.equal(typeof listedRunApi?.review_summary_counts?.runtime_validation_blocked_count, "number");
        assert.equal(typeof listedRunApi?.review_summary_counts?.runtime_validation_failed_count, "number");
        assert.equal(typeof listedRunApi?.review_summary_counts?.runtime_validation_recommended_count, "number");
        assert.equal(typeof listedRunApi?.review_summary_counts?.runtime_followup_required_count, "number");
        assert.equal(typeof listedRunApi?.review_summary_counts?.runtime_followup_resolved_count, "number");
        assert.equal(typeof listedRunApi?.review_summary_counts?.runtime_followup_rerun_requested_count, "number");
        assert.equal(typeof listedRunApi?.review_summary_counts?.next_disposition_expiry_at, "string");
        assert.equal(typeof listedRunApi?.review_summary_counts?.next_disposition_review_due_at, "string");
        assert.equal(reviewCommentsPayload.review_comments.length, 1);
        assert.equal(reviewCommentsPayload.review_comments[0]?.finding_id, "finding_api");
        assert.equal(findingDispositionsPayload.finding_dispositions.length, 4);
        assert.equal(findingDispositionsPayload.resolved_finding_dispositions.find((item: any) => item.finding_id === "finding_api")?.effective_disposition?.disposition_type, "waiver");
        assert.equal(findingDispositionsPayload.resolved_finding_dispositions.find((item: any) => item.finding_id === "finding_api_dup")?.effective_disposition?.disposition_type, "suppression");
        assert.equal(findingDispositionsPayload.resolved_finding_dispositions.find((item: any) => item.finding_id === "finding_api_expired")?.effective_status, "expired");
        assert.equal(findingDispositionsPayload.resolved_finding_dispositions.find((item: any) => item.finding_id === "finding_api_reopened")?.needs_review, true);
        assert.match(String(findingDispositionsPayload.resolved_finding_dispositions.find((item: any) => item.finding_id === "finding_api_reopened")?.review_reason || ""), /evidence changed/i);
        assert.equal(updateDispositionPayload.finding_disposition.reason, "reviewed project waiver after evidence refresh");
        assert.equal(updateDispositionPayload.finding_disposition.metadata_json.owner_id, "lead-reviewer");
        assert.equal(updateDispositionPayload.finding_disposition.metadata_json.reviewed_at, "2026-04-15T08:00:00.000Z");
        assert.equal(updateDispositionPayload.finding_disposition.metadata_json.review_due_by, reopenedReviewDue);
        assert.equal(isValidHumanApprovalRecord(updateDispositionPayload.finding_disposition.metadata_json.human_approval, {
          action: "control_waiver",
          subject: seededReopenedWaiver.id
        }), true);
        assert.equal(updateDispositionPayload.finding_disposition.metadata_json.approval_review_action_id.includes(":review-action:"), true);
        assert.equal(revokeDispositionPayload.finding_disposition.status, "revoked");
        assert.equal(revokeDispositionPayload.finding_disposition.metadata_json.revoked_by, "qa_api");
        assert.equal(findingDispositionsAfterMutationPayload.resolved_finding_dispositions.find((item: any) => item.finding_id === "finding_api_dup")?.effective_status, "revoked");
        assert.equal(findingDispositionsAfterMutationPayload.resolved_finding_dispositions.find((item: any) => item.finding_id === "finding_api_dup")?.effective_disposition, null);
        assert.equal(findingDispositionsAfterMutationPayload.resolved_finding_dispositions.find((item: any) => item.finding_id === "finding_api_reopened")?.governance_owner_id, "lead-reviewer");
        assert.equal(supervisorReviewPayload.supervisor_review.final_review, true);
        assert.equal(supervisorReviewPayload.supervisor_review.notes_json[0], "persisted note");
        assert.equal(remediationPayload.remediation_memo.summary, "Persisted remediation");
        assert.equal(observationsPayload.observations[0].observation_id, "obs_api_1");
        assert.equal(findingEvaluationsPayload.finding_evaluations.overall_evidence_sufficiency, "medium");
        assert.equal(findingEvaluationsPayload.export_schema.schema_name, "finding_evaluations.v1");
        assert.equal(findingEvaluationsPayload.export_schema.schema_version, "1.0.0");
        assert.equal(findingEvaluationsPayload.export_schema.tethermark_version, "0.2.0");
        assert.equal(findingEvaluationsPayload.export_schema.compatibility.policy, "same-major-additive");
        assert.equal(isCompatibleExportEnvelope(findingEvaluationsPayload.export_schema, { schemaName: "finding_evaluations.v1" }), true);
        assert.equal(findingEvaluationsPayload.export_schema.payload.overall_evidence_sufficiency, "medium");
        await assertExportSchemaMatches("finding_evaluations.v1.json", findingEvaluationsPayload.export_schema);
        assert.equal(findingEvaluationsPayload.finding_evaluations.overall_false_positive_risk, "medium");
        assert.equal(findingEvaluationsPayload.finding_evaluations.findings_needing_validation_count, 2);
        assert.equal(findingEvaluationsPayload.finding_evaluations.sandbox_execution.blocked_step_count, 2);
        assert.equal(findingEvaluationsPayload.finding_evaluations.sandbox_execution.attention_required, true);
        assert.equal(findingEvaluationsPayload.finding_evaluations.suppressed_finding_count, 0);
        assert.equal(findingEvaluationsPayload.finding_evaluations.waived_finding_count, 2);
        assert.equal(findingEvaluationsPayload.finding_evaluations.expired_disposition_count, 1);
        assert.equal(findingEvaluationsPayload.finding_evaluations.reopened_disposition_count, 0);
        assert.equal(findingEvaluationsPayload.finding_evaluations.findings_needing_disposition_review_count, 1);
        assert.equal(findingEvaluationsPayload.finding_evaluations.duplicate_groups.length, 1);
        assert.equal(findingEvaluationsPayload.finding_evaluations.conflict_pairs.length, 1);
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_validated_finding_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_validation_validated_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_validation_blocked_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_validation_failed_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_validation_recommended_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_followup_required_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_followup_resolved_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_followup_rerun_requested_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_followup_completed_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_strengthened_finding_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_weakened_finding_count, "number");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.runtime_generated_finding_count, "number");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_dup")?.validation_recommendation, "yes");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_dup")?.next_action, "rerun_in_capable_env");
        assert.ok(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_dup")?.validation_reasons.some((reason: string) => /duplicate|conflict|runtime|sandbox/i.test(reason)));
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.next_action, "waived");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.active_disposition_type, "waiver");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.validation_recommendation, "no");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.validation_reasons.length, 0);
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.active_disposition_review_due_by, "string");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.runtime_validation_status, "string");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.runtime_followup_policy, "string");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.runtime_followup_resolution, "string");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.runtime_followup_outcome, "string");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.runtime_impact, "string");
        assert.equal(Array.isArray(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.runtime_evidence_ids), true);
        assert.equal(Array.isArray(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.runtime_evidence_locations), true);
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.runtime_evidence_locations?.[0]?.path, "src/agent.js");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_expired")?.disposition_status, "expired");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_expired")?.needs_disposition_review, true);
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_expired")?.next_action, "review_expired_disposition");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_expired")?.validation_recommendation, "yes");
        assert.ok(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_expired")?.validation_reasons.some((reason: string) => /exception expired|re-review/i.test(reason)));
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_expired")?.runtime_impact, "string");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.active_disposition_owner_id, "lead-reviewer");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.needs_disposition_review, false);
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.disposition_review_reason, null);
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.next_action, "waived");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.validation_recommendation, "no");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.validation_reasons.length, 0);
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.runtime_impact, "string");
        assert.equal(Array.isArray(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.runtime_evidence_ids), true);
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.filter((item: any) => item.validation_recommendation === "yes").length, 2);
        assert.equal(executiveReportJsonPayload.format, "json");
        assert.equal(executiveReportJsonPayload.filename, "run_api-executive-summary.json");
        assert.equal(executiveReportJsonPayload.export_schema.schema_name, "executive_summary.v1");
        assert.equal(executiveReportJsonPayload.export_schema.schema_version, "1.0.0");
        assert.equal(executiveReportJsonPayload.export_schema.tethermark_version, "0.2.0");
        assert.equal(executiveReportJsonPayload.export_schema.compatibility.minimum_reader_schema_version, "1.0.0");
        await assertExportSchemaMatches("executive_summary.v1.json", executiveReportJsonPayload.export_schema);
        assert.equal(executiveReportJsonPayload.report_executive.run_id, "run_api");
        assert.equal(executiveReportJsonPayload.report_executive.finding_count, 4);
        assert.equal(Array.isArray(executiveReportJsonPayload.report_executive.top_findings), true);
        assert.equal(typeof executiveReportJsonPayload.report_executive.runtime_validation.blocked_count, "number");
        assert.equal(typeof executiveReportJsonPayload.report_executive.runtime_followups.required_count, "number");
        assert.equal(executiveReportJsonPayload.report_executive.validation_completeness.status, "incomplete");
        assert.ok(executiveReportJsonPayload.report_executive.validation_completeness.runtime_blocked_count > 0);
        assert.ok(executiveReportJsonPayload.report_executive.outstanding_actions.includes("validation_incomplete"));
        assert.ok(Array.isArray(executiveReportJsonPayload.report_executive.outstanding_actions));
        assert.equal(executiveReportMarkdownPayload.format, "markdown");
        assert.equal(executiveReportMarkdownPayload.filename, "run_api-executive-summary.md");
        assert.match(String(executiveReportMarkdownPayload.report_executive_markdown || ""), /Executive Security Summary/);
        assert.match(String(executiveReportMarkdownPayload.report_executive_markdown || ""), /Top Findings/);
        assert.match(String(executiveReportMarkdownPayload.report_executive_markdown || ""), /VALIDATION INCOMPLETE/);
        assert.equal(markdownReportPayload.format, "markdown");
        assert.equal(markdownReportPayload.filename, "run_api-report.md");
        assert.ok(String(markdownReportPayload.report_markdown).includes("# AI Security Audit Report"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("## VALIDATION INCOMPLETE"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("Persisted finding duplicate"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("Sandbox Execution Readiness: ready_with_warnings"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("Suppressed Findings: 0"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("Waived Findings: 2"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("Runtime Validation Blocked:"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("Runtime Follow-up Policy:"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("Runtime Follow-up Resolution:"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("Runtime Evidence Locations:"));
        assert.ok(String(markdownReportPayload.report_markdown).includes("src/agent.js:17:3"));
        assert.equal(sarifReportPayload.format, "sarif");
        assert.equal(sarifReportPayload.filename, "run_api-report.sarif.json");
        assert.equal(sarifReportPayload.report_sarif.version, "2.1.0");
        assert.equal(sarifReportPayload.report_sarif.runs[0]?.results.length, 4);
        assert.equal(sarifReportPayload.report_sarif.runs[0]?.results[0]?.properties?.sandboxExecution?.blocked_step_count, 2);
        assert.equal(sarifReportPayload.report_sarif.runs[0]?.results[0]?.locations?.[0]?.physicalLocation?.artifactLocation?.uri, "src/agent.js");
        assert.equal(sarifReportPayload.report_sarif.runs[0]?.results[0]?.locations?.[0]?.physicalLocation?.region?.startLine, 17);
        assert.equal(sarifReportPayload.report_sarif.runs[0]?.tool?.driver?.semanticVersion, "1.0.0");
        assert.ok(Array.isArray(sarifReportPayload.report_sarif.runs[0]?.tool?.driver?.taxa));
        assert.equal(typeof sarifReportPayload.report_sarif.runs[0]?.results[0]?.properties?.runtimeValidationStatus, "string");
        assert.equal(typeof sarifReportPayload.report_sarif.runs[0]?.results[0]?.properties?.runtimeFollowupPolicy, "string");
        assert.equal(typeof sarifReportPayload.report_sarif.runs[0]?.results[0]?.properties?.runtimeFollowupResolution, "string");
        assert.equal(typeof sarifReportPayload.report_sarif.runs[0]?.results[0]?.properties?.evidenceLocations?.[0]?.label, "string");
        assert.ok(sarifReportPayload.report_sarif.runs[0]?.results.some((item: any) => item.properties?.activeDispositionType === "waiver"));
        assert.equal(comparisonReportJsonPayload.format, "json");
        assert.equal(comparisonReportJsonPayload.filename, "run_api-vs-run_api-comparison.json");
        assert.equal(comparisonReportJsonPayload.export_schema.schema_name, "run_comparison.v1");
        assert.equal(comparisonReportJsonPayload.export_schema.schema_version, "1.0.0");
        await assertExportSchemaMatches("run_comparison.v1.json", comparisonReportJsonPayload.export_schema);
        assert.equal(comparisonReportJsonPayload.report_compare.current_run_id, "run_api");
        assert.equal(comparisonReportJsonPayload.report_compare.compare_to_run_id, "run_api");
        assert.equal(comparisonReportJsonPayload.report_compare.summary.changed_finding_count, 0);
        assert.equal(comparisonReportJsonPayload.report_compare.summary.new_finding_count, 0);
        assert.equal(comparisonReportJsonPayload.report_compare.summary.resolved_finding_count, 0);
        assert.equal(comparisonReportJsonPayload.report_compare.summary.unchanged_finding_count, 4);
        assert.equal(comparisonReportMarkdownPayload.format, "markdown");
        assert.equal(comparisonReportMarkdownPayload.filename, "run_api-vs-run_api-comparison.md");
        assert.match(String(comparisonReportMarkdownPayload.report_compare_markdown || ""), /Run Comparison Report/);
        assert.match(String(comparisonReportMarkdownPayload.report_compare_markdown || ""), /No new findings\./);
        assert.equal(exportsIndexPayload.export_schema.schema_name, "export_index.v1");
        assert.equal(exportsIndexPayload.export_index.run_id, "run_api");
        assert.equal(exportsIndexPayload.export_index.exports.some((item: any) => item.export_type === "executive_summary" && item.format === "json"), true);
        assert.equal(exportsIndexPayload.export_index.exports.some((item: any) => item.export_type === "finding_evaluations" && item.schema_name === "finding_evaluations.v1"), true);
        assert.equal(exportsIndexPayload.export_index.exports.some((item: any) => item.export_type === "review_audit" && item.schema_name === "review_audit.v1"), true);
        await assertExportSchemaMatches("export_index.v1.json", exportsIndexPayload.export_schema);
        assert.equal(preflightPayload.preflight.launch_profile.audit_package, "deep-static");
        assert.equal(preflightPayload.preflight.readiness.status, "ready_with_warnings");
        assert.equal(launchIntentPayload.launch_intent.source_surface, "web_ui");
        assert.equal(launchIntentPayload.launch_intent.preflight.accepted, true);
        assert.equal(outboundPreviewPayload.outbound_preview.policy.mode, "manual");
        assert.equal(outboundPreviewPayload.outbound_preview.readiness.status, "preview_ready");
        assert.equal(outboundPreviewPayload.outbound_preview.readiness.send_allowed, false);
        assert.equal(outboundPreviewPayload.outbound_preview.proposed_actions.length, 2);
        assert.equal(outboundApprovalBeforePayload.outbound_approval, null);
        assert.equal(outboundSendBlockedPayload.error, "outbound_send_not_allowed");
        assert.equal(outboundSendBlockedPayload.outbound_preview.readiness.send_allowed, false);
        assert.equal(outboundApprovalPostPayload.outbound_approval.approved_by, "qa_api");
        assert.equal(outboundApprovalPostPayload.outbound_approval.notes[0], "approved for manual GitHub share");
        assert.equal(outboundApprovalAfterPayload.outbound_approval.approved_by, "qa_api");
        assert.equal(outboundSendPayload.outbound_send.executed, false);
        assert.equal(outboundSendPayload.outbound_send.status, "manual_only");
        assert.equal(outboundSendPayload.outbound_send.action_type, "pr_comment");
        assert.equal(outboundSendPayload.outbound_preview.readiness.send_allowed, true);
        assert.equal(outboundSendPayload.outbound_preview.readiness.execute_allowed, false);
        assert.equal(outboundSendStoredPayload.outbound_send.status, "manual_only");
        assert.equal(outboundVerificationBeforePayload.outbound_verification, null);
        assert.equal(outboundDeliveryBlockedPayload.error, "hosted_only");
        assert.equal(outboundDeliveryBlockedPayload.capability, "github_outbound_delivery");
        assert.equal(outboundVerificationPostPayload.error, "hosted_only");
        assert.equal(outboundVerificationPostPayload.capability, "github_outbound_verification");
        assert.equal(outboundVerificationAfterPayload.outbound_verification, null);
        assert.equal(outboundDeliveryPayload.error, "hosted_only");
        assert.equal(outboundDeliveryPayload.capability, "github_outbound_delivery");
        assert.equal(outboundDeliveryStoredPayload.outbound_delivery, null);
        assert.equal(reviewSummaryPayload.review_summary.handoff.status, "approved");
        assert.equal(reviewSummaryPayload.review_summary.finding_summaries.find((item: any) => item.finding_id === "finding_api")?.disposition, "waived");
        assert.equal(reviewSummaryPayload.review_summary.finding_summaries.find((item: any) => item.finding_id === "finding_api_expired")?.disposition_status, "expired");
        assert.equal(reviewSummaryPayload.review_summary.finding_summaries.find((item: any) => item.finding_id === "finding_api_expired")?.needs_disposition_review, true);
        assert.equal(reviewSummaryPayload.review_summary.finding_summaries.find((item: any) => item.finding_id === "finding_api_reopened")?.active_disposition_owner_id, "lead-reviewer");
        assert.equal(reviewSummaryPayload.review_summary.finding_summaries.find((item: any) => item.finding_id === "finding_api_reopened")?.needs_disposition_review, false);
        assert.equal(typeof reviewSummaryPayload.review_summary.finding_summaries.find((item: any) => item.finding_id === "finding_api")?.active_disposition_review_due_by, "string");
        assert.equal(reviewSummaryPayload.review_summary.recent_comments.length, 1);
        assert.equal(reviewSummaryPayload.review_summary.waiver_count, 2);
        assert.equal(reviewSummaryPayload.review_summary.suppression_count, 0);
        assert.equal(reviewSummaryPayload.review_summary.expired_disposition_count, 1);
        assert.equal(reviewSummaryPayload.review_summary.due_soon_disposition_count, 2);
        assert.equal(reviewSummaryPayload.review_summary.reopened_disposition_count, 0);
        assert.equal(reviewSummaryPayload.review_summary.findings_needing_disposition_review_count, 1);
        assert.equal(reviewSummaryPayload.review_summary.handoff.expired_disposition_count, 1);
        assert.equal(reviewSummaryPayload.review_summary.handoff.due_soon_disposition_count, 2);
        assert.equal(reviewSummaryPayload.review_summary.handoff.due_soon_disposition_ids.includes("finding_api"), true);
        assert.equal(reviewSummaryPayload.review_summary.handoff.due_soon_disposition_ids.includes("finding_api_reopened"), true);
        assert.equal(typeof reviewSummaryPayload.review_summary.handoff.next_disposition_expiry_at, "string");
        assert.equal(typeof reviewSummaryPayload.review_summary.handoff.next_disposition_review_due_at, "string");
        assert.equal(reviewSummaryPayload.review_summary.handoff.due_soon_by_owner[0]?.owner_id, "security-owner");
        assert.equal(reviewSummaryPayload.review_summary.handoff.due_soon_by_owner.some((item: any) => item.owner_id === "lead-reviewer"), true);
        assert.equal(reviewSummaryPayload.review_summary.handoff.reopened_disposition_count, 0);
        assert.equal(reviewSummaryPayload.review_summary.handoff.findings_needing_disposition_review_count, 1);
        assert.equal(reviewAuditPayload.review_audit.comments.length, 1);
        assert.equal(reviewAuditPayload.export_schema.schema_name, "review_audit.v1");
        assert.equal(reviewAuditPayload.export_schema.schema_version, "1.0.0");
        await assertExportSchemaMatches("review_audit.v1.json", reviewAuditPayload.export_schema);
        assert.equal(reviewAuditPayload.review_audit.summary.handoff.latest_comments[0], "manual triage comment");
        assert.equal(runtimeFollowupsPayload.runtime_followups.length, 1);
        assert.equal(runtimeFollowupSummaryPayload.runtime_followup_summary.total_count, 1);
        assert.equal(runtimeFollowupSummaryPayload.export_schema.schema_name, "runtime_followup_summary.v1");
        assert.equal(runtimeFollowupSummaryPayload.export_schema.schema_version, "1.0.0");
        await assertExportSchemaMatches("runtime_followup_summary.v1.json", runtimeFollowupSummaryPayload.export_schema);
        assert.equal(typeof runtimeFollowupSummaryPayload.runtime_followup_summary.confirmed_count, "number");
        assert.equal(runtimeFollowupExportJsonPayload.format, "json");
        assert.equal(runtimeFollowupExportJsonPayload.filename, "runtime-followups.json");
        assert.equal(runtimeFollowupExportJsonPayload.export_schema.schema_name, "runtime_followup_queue.v1");
        assert.equal(runtimeFollowupExportJsonPayload.export_schema.schema_version, "1.0.0");
        await assertExportSchemaMatches("runtime_followup_queue.v1.json", runtimeFollowupExportJsonPayload.export_schema);
        assert.equal(runtimeFollowupExportJsonPayload.runtime_followups.length, 1);
        assert.equal(runtimeFollowupExportCsvPayload.format, "csv");
        assert.equal(runtimeFollowupExportCsvPayload.filename, "runtime-followups.csv");
        const runtimeFollowupId = runtimeFollowupsPayload.runtime_followups[0]?.id;
        assert.ok(runtimeFollowupId);
        assert.match(String(runtimeFollowupExportCsvPayload.csv || ""), new RegExp(String(runtimeFollowupId)));
        const runtimeFollowupReportResponse = await fetch(`http://127.0.0.1:${port}/runtime-followups/${encodeURIComponent(runtimeFollowupId)}/report`);
        const runtimeFollowupReportPayload = await runtimeFollowupReportResponse.json() as any;
        assert.equal(runtimeFollowupReportResponse.status, 200);
        assert.equal(runtimeFollowupReportPayload.followup_id, runtimeFollowupId);
        assert.equal(runtimeFollowupReportPayload.filename, `${runtimeFollowupId}-runtime-followup-report.json`);
        assert.equal(runtimeFollowupReportPayload.export_schema.schema_name, "runtime_followup_report.v1");
        assert.equal(runtimeFollowupReportPayload.export_schema.schema_version, "1.0.0");
        await assertExportSchemaMatches("runtime_followup_report.v1.json", runtimeFollowupReportPayload.export_schema);
        assert.equal(runtimeFollowupReportPayload.runtime_followup_report.followup.id, runtimeFollowupId);
        assert.equal(runtimeFollowupReportPayload.runtime_followup_report.source_finding.id, "finding_api");
        assert.equal(observabilitySummaryPayload.totals.total_tokens, 60);
        assert.equal(observabilitySummaryPayload.provider_rollups[0]?.provider_id, "openai:gpt-5.4");
        assert.equal(observabilityStatsPayload.totals.run_count, 1);
        assert.equal(observabilityStatsPayload.runs[0]?.total_tokens, 60);
        assert.equal(authInfoPayload.auth_mode, "none");
        assert.equal(authInfoPayload.review_roles_security, "advisory");
        assert.equal(llmProvidersPayload.providers.find((item: any) => item.id === "openai")?.requires_api_key, true);
        assert.equal(llmProvidersPayload.providers.find((item: any) => item.id === "openai")?.credential_fields?.[0]?.id, "openai_api_key");
        assert.equal(llmProvidersPayload.providers.find((item: any) => item.id === "openai")?.credential_fields?.[0]?.env_var, "OPENAI_API_KEY");
        assert.equal(typeof llmProvidersPayload.providers.find((item: any) => item.id === "openai")?.credential_status?.configured, "boolean");
        assert.ok(["missing", "persisted", "environment", "not_required"].includes(String(llmProvidersPayload.providers.find((item: any) => item.id === "openai")?.credential_status?.source)));
        assert.equal(llmProvidersPayload.presets.find((item: any) => item.id === "local_mock")?.provider_id, "mock");
        assert.equal(integrationsPayload.integrations.find((item: any) => item.id === "github_outbound")?.status?.enabled, true);
        assert.equal(integrationsPayload.integrations.find((item: any) => item.id === "github_outbound")?.status?.configured, true);
        assert.equal(integrationsPayload.integrations.find((item: any) => item.id === "github_outbound")?.credential_fields?.length, 0);
        assert.match(String(integrationsPayload.integrations.find((item: any) => item.id === "github_outbound")?.status?.note || ""), /Tethermark Cloud/i);
        assert.equal(integrationsPayload.integrations.find((item: any) => item.id === "generic_webhook")?.status?.enabled, false);
        assert.equal(integrationsPayload.integrations.find((item: any) => item.id === "generic_webhook")?.status?.configured, false);
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
      });
    });
  });
}

async function testRuntimeFollowupLaunchFlow(): Promise<void> {
  const fixturePath = path.resolve("fixtures/validation-targets/agent-tool-boundary-risky");
  await withTempDir("harness-runtime-followup-", async (rootDir) => {
    const LocalRoot = path.join(rootDir, ".artifacts", "state", "local-db");
    const store = new LocalPersistenceStore(LocalRoot);
    const reviewDecision = {
      run_id: "run_runtime_followup",
      publishability_status: "review_required",
      human_review_required: true,
      public_summary_safe: false,
      threshold: "high",
      rationale_json: ["runtime-sensitive finding needs follow-up"],
      gating_findings_json: ["finding_runtime_followup"],
      recommended_visibility: "internal"
    } as const;
    const remediationMemo = {
      run_id: "run_runtime_followup",
      summary: "Runtime follow-up required",
      checklist_json: ["rerun in capable environment"],
      human_review_required: true
    } as const;

    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_runtime_followup", target_type: "path", canonical_name: "runtime-followup-target", repo_url: null, local_path: fixturePath, endpoint_url: null, created_at: "2026-04-17T00:00:00.000Z" },
      target_snapshot: { id: "snap_runtime_followup", target_id: "target_runtime_followup", snapshot_value: fixturePath, commit_sha: null, captured_at: "2026-04-17T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_runtime_followup", target_id: "target_runtime_followup", canonical_target_id: "target_runtime_followup", workspace_id: "default", project_id: "default", canonical_name: "runtime-followup-target", target_type: "path", repo_url: null, local_path: fixturePath, endpoint_url: null, latest_run_id: "run_runtime_followup", latest_run_created_at: "2026-04-17T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "runnable_local_app", latest_rating: "fair", latest_overall_score: 55, latest_static_score: 55, latest_publishability_status: "review_required", latest_human_review_required: true, latest_finding_count: 1, latest_frameworks_json: [], latest_languages_json: ["javascript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-17T00:00:00.000Z" },
      policy_pack: null,
      run: { id: "run_runtime_followup", target_id: "target_runtime_followup", target_snapshot_id: "snap_runtime_followup", workspace_id: "default", project_id: "default", requested_by: "triage", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: rootDir, started_at: "2026-04-17T00:00:00.000Z", completed_at: "2026-04-17T00:01:00.000Z", static_score: 55, overall_score: 55, rating: "fair", created_at: "2026-04-17T00:00:00.000Z" },
      resolved_configuration: { run_id: "run_runtime_followup", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "runnable_local_app", run_mode: "static", target_kind: "path", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "path", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      commit_diff: null,
      correction_plan: null,
      correction_result: null,
      lane_reuse_decisions: [],
      persistence_summary: null,
      stage_artifacts: [
        {
          id: "run_runtime_followup:launch-intent",
          run_id: "run_runtime_followup",
          artifact_type: "launch-intent",
          payload_json: {
            source_surface: "dashboard",
            submitted_at: "2026-04-17T00:00:00.000Z",
            requested_by: "triage",
            workspace_id: "default",
            project_id: "default",
            target: { kind: "path", input: fixturePath },
            requested_profile: {
              run_mode: "static",
              audit_package: "deep-static",
              audit_policy_pack: "default",
              llm_provider: "mock",
              llm_model: null,
              preflight_strictness: "strict",
              runtime_allowed: "bounded",
              review_severity: "medium",
              review_visibility: "internal"
            },
            preflight: { summary_status: "ready_with_warnings", checked_at: "2026-04-17T00:00:00.000Z", accepted_at: "2026-04-17T00:00:00.000Z", stale: false, accepted: true },
            notes: []
          },
          created_at: "2026-04-17T00:00:00.000Z"
        }
      ],
      stage_executions: [],
      lane_plans: [],
      evidence_records: [],
      lane_results: [],
      lane_specialists: [],
      agent_invocations: [],
      tool_executions: [],
      findings: [{ id: "finding_runtime_followup", run_id: "run_runtime_followup", lane_name: null, title: "Runtime follow-up target", severity: "high", category: "runtime_validation", description: "needs capable rerun", confidence: 0.72, source: "supervisor", publication_state: "internal_only", needs_human_review: true, score_impact: 8, control_ids_json: ["harness_internal.eval_harness_presence"], standards_refs_json: [], evidence_json: [], created_at: "2026-04-17T00:00:00.000Z" }],
      control_results: [],
      score_summary: { run_id: "run_runtime_followup", methodology_version: "1", overall_score: 55, rating: "fair", leaderboard_summary: "", limitations_json: [] },
      review_decision: reviewDecision,
      supervisor_review: null,
      remediation_memo: remediationMemo,
      review_workflow: deriveInitialReviewWorkflow({
        run: { id: "run_runtime_followup", created_at: "2026-04-17T00:00:00.000Z", workspace_id: "default", project_id: "default" },
        reviewDecision,
        remediationMemo
      }),
      review_actions: [],
      policy_application: { run_id: "run_runtime_followup", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: ["finding_runtime_followup"], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [],
      metrics: [],
      events: [],
      artifact_index: []
    } as any);

    const port = 9000 + Math.floor(Math.random() * 200);
    await withWorkingDir(rootDir, async () => {
      const server = createApiServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve());
      });

      try {
        await waitForServer(`http://127.0.0.1:${port}/health`);
        const actionResponse = await fetch(`http://127.0.0.1:${port}/runs/run_runtime_followup/review-actions`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "runtime-reviewer" },
          body: JSON.stringify({
            action_type: "rerun_in_capable_env",
            finding_id: "finding_runtime_followup",
            notes: "launch a capable runtime rerun"
          })
        });
        const actionPayload = await actionResponse.json() as any;
        assert.equal(actionResponse.status, 200);
        assert.equal(actionPayload.runtime_followup.status, "pending");
        assert.equal(actionPayload.runtime_followup.followup_policy, "rerun_in_capable_env");
        assert.equal(actionPayload.runtime_followup.rerun_request_json.run_mode, "validate");

        const listResponse = await fetch(`http://127.0.0.1:${port}/runs/run_runtime_followup/runtime-followups`);
        const listPayload = await listResponse.json() as any;
        assert.equal(listResponse.status, 200);
        assert.equal(listPayload.runtime_followups.length, 1);

        const launchResponse = await fetch(`http://127.0.0.1:${port}/runtime-followups/${encodeURIComponent(actionPayload.runtime_followup.id)}/launch?start_immediately=false`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "runtime-reviewer" },
          body: "{}"
        });
        const launchPayload = await launchResponse.json() as any;
        assert.equal(launchResponse.status, 200);
        assert.equal(launchPayload.runtime_followup.status, "launched");
        assert.equal(typeof launchPayload.async_job.job.job_id, "string");

        const jobStatusResponse = await fetch(`http://127.0.0.1:${port}/runs/async/${encodeURIComponent(launchPayload.async_job.job.job_id)}`);
        const jobStatusPayload = await jobStatusResponse.json() as any;
        assert.equal(jobStatusResponse.status, 200);
        assert.equal(jobStatusPayload.job?.status, "queued");

        const finalListResponse = await fetch(`http://127.0.0.1:${port}/runs/run_runtime_followup/runtime-followups`);
        const finalListPayload = await finalListResponse.json() as any;
        assert.equal(finalListResponse.status, 200);
        assert.equal(finalListPayload.runtime_followups[0]?.linked_job_id, launchPayload.async_job.job.job_id);
        assert.equal(finalListPayload.runtime_followups[0]?.status, "launched");

        const cancelResponse = await fetch(`http://127.0.0.1:${port}/runs/async/${encodeURIComponent(launchPayload.async_job.job.job_id)}/cancel`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-harness-actor": "runtime-reviewer" },
          body: "{}"
        });
        const cancelPayload = await cancelResponse.json() as any;
        assert.ok([200, 202].includes(cancelResponse.status));
        assert.equal(cancelPayload.job?.status, "canceled");
        const terminalJob = await waitForAsyncRun(`http://127.0.0.1:${port}`, launchPayload.async_job.job.job_id);
        assert.equal(terminalJob.job.status, "canceled");
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    });
  });
}

async function testRuntimeFollowupOutcomeReconciliation(): Promise<void> {
  await withTempDir("harness-runtime-followup-outcome-", async (rootDir) => {
    const LocalRoot = path.join(rootDir, ".artifacts", "state", "local-db");
    const store = new LocalPersistenceStore(LocalRoot);
    const sourceRunId = "run_runtime_source";
    const rerunRunId = "run_runtime_rerun";
    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_runtime_source", target_type: "path", canonical_name: "runtime-source", repo_url: null, local_path: path.resolve("fixtures/validation-targets/agent-tool-boundary-risky"), endpoint_url: null, created_at: "2026-04-17T00:00:00.000Z" },
      target_snapshot: { id: "snap_runtime_source", target_id: "target_runtime_source", snapshot_value: path.resolve("fixtures/validation-targets/agent-tool-boundary-risky"), commit_sha: null, captured_at: "2026-04-17T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_runtime_source", target_id: "target_runtime_source", canonical_target_id: "target_runtime_source", workspace_id: "default", project_id: "default", canonical_name: "runtime-source", target_type: "path", repo_url: null, local_path: path.resolve("fixtures/validation-targets/agent-tool-boundary-risky"), endpoint_url: null, latest_run_id: sourceRunId, latest_run_created_at: "2026-04-17T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "runnable_local_app", latest_rating: "fair", latest_overall_score: 58, latest_static_score: 58, latest_publishability_status: "review_required", latest_human_review_required: true, latest_finding_count: 1, latest_frameworks_json: [], latest_languages_json: ["javascript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-17T00:00:00.000Z" },
      policy_pack: null,
      run: { id: sourceRunId, target_id: "target_runtime_source", target_snapshot_id: "snap_runtime_source", workspace_id: "default", project_id: "default", requested_by: "triage", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: rootDir, started_at: "2026-04-17T00:00:00.000Z", completed_at: "2026-04-17T00:01:00.000Z", static_score: 58, overall_score: 58, rating: "fair", created_at: "2026-04-17T00:00:00.000Z" },
      resolved_configuration: { run_id: sourceRunId, policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "runnable_local_app", run_mode: "static", target_kind: "path", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "path", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      commit_diff: null,
      correction_plan: null,
      correction_result: null,
      lane_reuse_decisions: [],
      persistence_summary: null,
      stage_artifacts: [{
        id: `${sourceRunId}:launch-intent`,
        run_id: sourceRunId,
        artifact_type: "launch-intent",
        payload_json: {
          source_surface: "dashboard",
          submitted_at: "2026-04-17T00:00:00.000Z",
          requested_by: "triage",
          workspace_id: "default",
          project_id: "default",
          target: { kind: "path", input: path.resolve("fixtures/validation-targets/agent-tool-boundary-risky") },
          requested_profile: {
            run_mode: "static",
            audit_package: "deep-static",
            audit_policy_pack: "default",
            llm_provider: "mock",
            llm_model: null,
            preflight_strictness: "strict",
            runtime_allowed: "bounded",
            review_severity: "medium",
            review_visibility: "internal"
          },
          preflight: { summary_status: "ready_with_warnings", checked_at: "2026-04-17T00:00:00.000Z", accepted_at: "2026-04-17T00:00:00.000Z", stale: false, accepted: true },
          notes: []
        },
        created_at: "2026-04-17T00:00:00.000Z"
      }],
      stage_executions: [],
      lane_plans: [],
      evidence_records: [{
        id: "evidence_runtime_source",
        run_id: sourceRunId,
        lane_name: null,
        source_type: "tool",
        source_id: "sandbox:runtime-node",
        control_ids_json: ["harness_internal.eval_harness_presence"],
        summary: "runtime validation pointed at the shared service route",
        confidence: 0.92,
        raw_artifact_path: null,
        locations_json: [{ source_kind: "symbol", symbol: "service.route:/api/runtime-shared", label: "runtime_endpoint" }],
        metadata_json: { category: "sandbox_execution" }
      }],
      lane_results: [],
      lane_specialists: [],
      agent_invocations: [],
      tool_executions: [],
      findings: [{ id: "finding_runtime_source", run_id: sourceRunId, lane_name: null, title: "Source runtime validation issue", severity: "high", category: "runtime_validation", description: "needs capable rerun", confidence: 0.8, source: "supervisor", publication_state: "internal_only", needs_human_review: true, score_impact: 8, control_ids_json: ["harness_internal.eval_harness_presence"], standards_refs_json: [], evidence_json: [], created_at: "2026-04-17T00:00:00.000Z" }],
      control_results: [],
      score_summary: { run_id: sourceRunId, methodology_version: "1", overall_score: 58, rating: "fair", leaderboard_summary: "", limitations_json: [] },
      review_decision: { run_id: sourceRunId, publishability_status: "review_required", human_review_required: true, public_summary_safe: false, threshold: "high", rationale_json: [], gating_findings_json: ["finding_runtime_source"], recommended_visibility: "internal" },
      supervisor_review: null,
      remediation_memo: { run_id: sourceRunId, summary: "Runtime follow-up required", checklist_json: ["rerun in capable environment"], human_review_required: true },
      review_workflow: { run_id: sourceRunId, status: "requires_rerun", current_reviewer_id: "runtime-reviewer", human_review_required: true, rationale: "runtime follow-up pending", created_at: "2026-04-17T00:00:00.000Z", updated_at: "2026-04-17T00:00:00.000Z" },
      review_actions: [],
      policy_application: { run_id: sourceRunId, applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: ["finding_runtime_source"], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [],
      metrics: [],
      events: [],
      artifact_index: []
    } as any);

    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "validate", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_runtime_source", target_type: "path", canonical_name: "runtime-source", repo_url: null, local_path: path.resolve("fixtures/validation-targets/agent-tool-boundary-risky"), endpoint_url: null, created_at: "2026-04-17T00:00:00.000Z" },
      target_snapshot: { id: "snap_runtime_rerun", target_id: "target_runtime_source", snapshot_value: path.resolve("fixtures/validation-targets/agent-tool-boundary-risky"), commit_sha: null, captured_at: "2026-04-17T00:02:00.000Z", analysis_hash: null },
      target_summary: { id: "target_runtime_source", target_id: "target_runtime_source", canonical_target_id: "target_runtime_source", workspace_id: "default", project_id: "default", canonical_name: "runtime-source", target_type: "path", repo_url: null, local_path: path.resolve("fixtures/validation-targets/agent-tool-boundary-risky"), endpoint_url: null, latest_run_id: rerunRunId, latest_run_created_at: "2026-04-17T00:02:00.000Z", latest_status: "succeeded", latest_run_mode: "validate", latest_audit_package: "deep-static", latest_target_class: "runnable_local_app", latest_rating: "fair", latest_overall_score: 61, latest_static_score: 61, latest_publishability_status: "review_required", latest_human_review_required: true, latest_finding_count: 1, latest_frameworks_json: [], latest_languages_json: ["javascript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-17T00:02:00.000Z" },
      policy_pack: null,
      run: { id: rerunRunId, target_id: "target_runtime_source", target_snapshot_id: "snap_runtime_rerun", workspace_id: "default", project_id: "default", requested_by: "runtime-reviewer", policy_pack_id: null, status: "succeeded", run_mode: "validate", audit_package: "deep-static", artifact_root: rootDir, started_at: "2026-04-17T00:02:00.000Z", completed_at: "2026-04-17T00:03:00.000Z", static_score: 61, overall_score: 61, rating: "fair", created_at: "2026-04-17T00:02:00.000Z", retry_of_run_id: sourceRunId },
      resolved_configuration: { run_id: rerunRunId, policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "runnable_local_app", run_mode: "validate", target_kind: "path", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "validate", target_kind: "path", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      commit_diff: null,
      correction_plan: null,
      correction_result: null,
      lane_reuse_decisions: [],
      persistence_summary: null,
      stage_artifacts: [],
      stage_executions: [],
      lane_plans: [],
      evidence_records: [{
        id: "evidence_runtime_rerun",
        run_id: rerunRunId,
        lane_name: null,
        source_type: "tool",
        source_id: "sandbox:runtime-node",
        control_ids_json: ["owasp_llm.agent_runtime_security"],
        summary: "rerun reproduced the same shared service route",
        confidence: 0.94,
        raw_artifact_path: null,
        locations_json: [{ source_kind: "symbol", symbol: "service.route:/api/runtime-shared", label: "runtime_endpoint" }],
        metadata_json: { category: "sandbox_execution" }
      }],
      lane_results: [],
      lane_specialists: [],
      agent_invocations: [],
      tool_executions: [],
      findings: [{ id: "finding_runtime_rerun", run_id: rerunRunId, lane_name: null, title: "Different rerun title with shared evidence identity", severity: "high", category: "runtime_service_unhealthy", description: "reproduced during linked rerun", confidence: 0.85, source: "supervisor", publication_state: "internal_only", needs_human_review: true, score_impact: 8, control_ids_json: ["owasp_llm.agent_runtime_security"], standards_refs_json: [], evidence_json: [], created_at: "2026-04-17T00:02:30.000Z" }],
      control_results: [],
      score_summary: { run_id: rerunRunId, methodology_version: "1", overall_score: 61, rating: "fair", leaderboard_summary: "", limitations_json: [] },
      review_decision: { run_id: rerunRunId, publishability_status: "review_required", human_review_required: true, public_summary_safe: false, threshold: "high", rationale_json: [], gating_findings_json: ["finding_runtime_rerun"], recommended_visibility: "internal" },
      supervisor_review: null,
      remediation_memo: null,
      review_workflow: null,
      review_actions: [],
      policy_application: { run_id: rerunRunId, applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: ["finding_runtime_rerun"], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [],
      metrics: [],
      events: [],
      artifact_index: []
    } as any);

    const location = { rootDir: LocalRoot, dbMode: "local" } as const;
    const followup = await upsertRuntimeFollowupFromReviewAction({
      runId: sourceRunId,
      actionId: "action_runtime_followup",
      rootDirOrOptions: location,
      input: {
        reviewer_id: "runtime-reviewer",
        action_type: "rerun_in_capable_env",
        finding_id: "finding_runtime_source",
        notes: "rerun in capable environment"
      }
    });
    assert.ok(followup);
    await markRuntimeFollowupLaunched({
      id: followup!.id,
      job: { job_id: "job_runtime_followup", current_run_id: rerunRunId } as any,
      rootDirOrOptions: location
    });
    const reconciled = await markRuntimeFollowupJobTerminal({
      jobId: "job_runtime_followup",
      status: "succeeded",
      linkedRunId: rerunRunId,
      rootDirOrOptions: location
    });
    assert.equal(reconciled?.rerun_outcome, "confirmed");
    assert.equal(reconciled?.linked_run_id, rerunRunId);
    assert.deepEqual(reconciled?.rerun_outcome_finding_ids_json, ["finding_runtime_rerun"]);

    const persistedFollowup = await readPersistedRuntimeFollowup(followup!.id, location);
    const sourceFindings = await readPersistedFindings(sourceRunId, location);
    let evaluationSummary = buildFindingEvaluationSummary({
      workflow: await readPersistedReviewWorkflow(sourceRunId, location),
      findings: sourceFindings,
      actions: [],
      comments: [],
      dispositions: [],
      supervisorReview: null,
      evidenceRecords: [],
      runtimeFollowups: persistedFollowup ? [persistedFollowup] : []
    });
    assert.equal(evaluationSummary.runtime_followup_completed_count, 1);
    assert.equal(evaluationSummary.evaluations[0]?.runtime_followup_outcome, "confirmed");
    assert.equal(evaluationSummary.evaluations[0]?.runtime_followup_linked_run_id, rerunRunId);
    assert.equal(evaluationSummary.evaluations[0]?.next_action, "manual_review");
    assert.equal(evaluationSummary.evaluations[0]?.runtime_impact, "strengthened");

    const adoptAction = await submitPersistedReviewAction({
      runId: sourceRunId,
      rootDirOrOptions: location,
      input: {
        reviewer_id: "runtime-reviewer",
        action_type: "adopt_rerun_outcome",
        finding_id: "finding_runtime_source",
        notes: "adopted linked rerun outcome back into source review state",
        metadata: {
          adopted_outcome: "confirmed",
          linked_run_id: rerunRunId
        }
      }
    });
    await upsertRuntimeFollowupFromReviewAction({
      runId: sourceRunId,
      actionId: adoptAction.action.id,
      rootDirOrOptions: location,
      input: {
        reviewer_id: "runtime-reviewer",
        action_type: "adopt_rerun_outcome",
        finding_id: "finding_runtime_source",
        notes: "adopted linked rerun outcome back into source review state",
        metadata: {
          adopted_outcome: "confirmed",
          linked_run_id: rerunRunId
        }
      }
    });
    const resolvedFollowup = await readPersistedRuntimeFollowup(followup!.id, location);
    const resolvedActions = await readPersistedReviewActions(sourceRunId, location);
    evaluationSummary = buildFindingEvaluationSummary({
      workflow: await readPersistedReviewWorkflow(sourceRunId, location),
      findings: sourceFindings,
      actions: resolvedActions,
      comments: [],
      dispositions: [],
      supervisorReview: null,
      evidenceRecords: [],
      runtimeFollowups: resolvedFollowup ? [resolvedFollowup] : []
    });
    assert.equal(resolvedFollowup?.status, "resolved");
    assert.equal(resolvedFollowup?.resolution_action_type, "adopt_rerun_outcome");
    assert.equal(evaluationSummary.runtime_followup_resolved_count, 1);
    assert.equal(evaluationSummary.evaluations[0]?.runtime_followup_resolution, "rerun_outcome_adopted");
    assert.equal(evaluationSummary.evaluations[0]?.next_action, "ready_for_review");
  });
}

async function testAsyncRunLifecycleApi(): Promise<void> {
  await withTempDir("harness-async-api-", async (rootDir) => {
    await stageBuiltinCoreEngineData(rootDir);
    const projectDir = path.join(rootDir, "async-project");
    await fs.mkdir(path.join(projectDir, "src"), { recursive: true });
    await fs.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "async-project", version: "1.0.0" }, null, 2) + "\n", "utf8");
    await fs.writeFile(path.join(projectDir, "src", "index.ts"), "export const ok = true;\n", "utf8");

    let webhookPayload: any = null;
    let webhookResolve: ((payload: any) => void) | null = null;
    const webhookReceived = new Promise<any>((resolve) => {
      webhookResolve = resolve;
    });
    const webhookServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      webhookPayload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(204);
      res.end();
      webhookResolve?.(webhookPayload);
    });
    await new Promise<void>((resolve, reject) => {
      webhookServer.once("error", reject);
      webhookServer.listen(0, "127.0.0.1", () => resolve());
    });
    const webhookPort = getListeningPort(webhookServer);

    const genericWebhookEvents: any[] = [];
    let genericWebhookResolve: ((payload: any) => void) | null = null;
    const genericWebhookReceived = new Promise<any>((resolve) => {
      genericWebhookResolve = resolve;
    });
    const genericWebhookServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      genericWebhookEvents.push({
        payload,
        signature: req.headers["x-harness-signature"] ?? null,
        eventType: req.headers["x-harness-event-type"] ?? null
      });
      res.writeHead(204);
      res.end();
      genericWebhookResolve?.(payload);
    });
    await new Promise<void>((resolve, reject) => {
      genericWebhookServer.once("error", reject);
      genericWebhookServer.listen(0, "127.0.0.1", () => resolve());
    });
    const genericWebhookPort = getListeningPort(genericWebhookServer);
    await withWorkingDir(rootDir, async () => {
      const previousDisableLocalBinaries = process.env.HARNESS_DISABLE_LOCAL_BINARIES;
      const previousDisablePythonWorkers = process.env.HARNESS_DISABLE_PYTHON_WORKERS;
      process.env.HARNESS_DISABLE_LOCAL_BINARIES = "1";
      process.env.HARNESS_DISABLE_PYTHON_WORKERS = "1";
      await updatePersistedUiSettings({
        integrations: {
          generic_webhook_url: `http://127.0.0.1:${genericWebhookPort}/events`,
          generic_webhook_secret: "test-generic-secret",
          generic_webhook_events: ["run_completed", "review_required", "review_requires_rerun", "outbound_delivery_failed"]
        }
      }, { rootDir: path.join(rootDir, ".artifacts", "state", "local-db"), dbMode: "local" }, { workspaceId: "default", projectId: "default", scopeLevel: "project" });
      let baseUrl = "";
      const startServer = async (): Promise<{ server: http.Server; baseUrl: string }> => {
        const server = createApiServer();
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => resolve());
        });
        return {
          server,
          baseUrl: `http://127.0.0.1:${getListeningPort(server)}`
        };
      };
      let { server } = await startServer();
      baseUrl = `http://127.0.0.1:${getListeningPort(server)}`;

      try {
        await waitForServer(`${baseUrl}/health`);

        const queuedResponse = await fetch(`${baseUrl}/runs/async`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            request: {
              local_path: projectDir,
              run_mode: "static",
              audit_package: "deep-static",
              llm_provider: "mock",
              llm_model: "mock-agent-runtime"
            },
            completion_webhook_url: `http://127.0.0.1:${webhookPort}/callback`
          })
        });
        const queuedPayload = await queuedResponse.json() as any;
        assert.equal(queuedResponse.status, 202);
        assert.equal(queuedPayload.job.status, "running");
        assert.equal(queuedPayload.attempts.length, 1);

        const finalPayload = await waitForAsyncRun(baseUrl, queuedPayload.job.job_id);
        assert.equal(finalPayload.job.status, "succeeded");
        assert.equal(finalPayload.attempts[0]?.status, "succeeded");
        assert.ok(finalPayload.attempts[0]?.run_id);

        const persistedSummary = await fetch(`${baseUrl}/runs/${finalPayload.attempts[0].run_id}/summary`);
        const persistedSummaryPayload = await persistedSummary.json() as any;
        assert.equal(persistedSummary.status, 200);
        assert.equal(persistedSummaryPayload.summary.run_id, finalPayload.attempts[0].run_id);

        const callbackPayload = await Promise.race([
          webhookReceived,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for webhook")), 45000))
        ]) as any;
        const genericWebhookPayload = await Promise.race([
          genericWebhookReceived,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for generic webhook")), 45000))
        ]) as any;
        assert.equal(callbackPayload.job.job_id, queuedPayload.job.job_id);
        assert.equal(callbackPayload.job.status, "succeeded");
        assert.equal(callbackPayload.latest_attempt.run_id, finalPayload.attempts[0].run_id);
        assert.equal(genericWebhookPayload.event_type, "run_completed");
        assert.equal(genericWebhookPayload.run_id, finalPayload.attempts[0].run_id);
        await waitForCondition("review_required generic webhook", () => genericWebhookEvents.some((item: any) => item.payload?.event_type === "review_required"));

        const webhookDeliveriesPayload = await waitForPersistedWebhookDeliveries(baseUrl, finalPayload.attempts[0].run_id, 2);
        assert.equal(webhookDeliveriesPayload.webhook_deliveries.length, 2);
        assert.equal(webhookDeliveriesPayload.webhook_deliveries.some((item: any) => item.event_type === "run_completed"), true);
        assert.equal(webhookDeliveriesPayload.webhook_deliveries.some((item: any) => item.event_type === "review_required"), true);
        assert.equal(genericWebhookEvents.every((item: any) => item.signature?.toString().startsWith("sha256=")), true);

        const pendingResponse = await fetch(`${baseUrl}/runs/async`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            request: {
              local_path: projectDir,
              run_mode: "static",
              audit_package: "deep-static",
              llm_provider: "mock",
              llm_model: "mock-agent-runtime"
            },
            start_immediately: false
          })
        });
        const pendingPayload = await pendingResponse.json() as any;
        assert.equal(pendingResponse.status, 202);
        assert.equal(pendingPayload.job.status, "queued");

        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });

        ({ server, baseUrl } = await startServer());
        await waitForServer(`${baseUrl}/health`);

        const recoveredPayload = await waitForAsyncRun(baseUrl, pendingPayload.job.job_id);
        assert.equal(recoveredPayload.job.status, "succeeded");
        assert.equal(recoveredPayload.attempts.length, 1);

        const retryResponse = await fetch(`${baseUrl}/runs/async/${pendingPayload.job.job_id}/retry`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({})
        });
        const retryPayload = await retryResponse.json() as any;
        assert.equal(retryResponse.status, 400);
        assert.equal(retryPayload.error, "job_not_retryable");

        const queuedCancelResponse = await fetch(`${baseUrl}/runs/async`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            request: {
              local_path: projectDir,
              run_mode: "static",
              audit_package: "deep-static",
              llm_provider: "mock",
              llm_model: "mock-agent-runtime"
            },
            start_immediately: false
          })
        });
        const queuedCancelPayload = await queuedCancelResponse.json() as any;
        const canceledResponse = await fetch(`${baseUrl}/runs/async/${queuedCancelPayload.job.job_id}/cancel`, { method: "POST" });
        const canceledPayload = await canceledResponse.json() as any;
        assert.equal(canceledResponse.status, 200);
        assert.equal(canceledPayload.job.status, "canceled");
        assert.equal(canceledPayload.attempts.at(-1)?.status, "canceled");

        const retriedResponse = await fetch(`${baseUrl}/runs/async/${queuedCancelPayload.job.job_id}/retry`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({})
        });
        const retriedPayload = await retriedResponse.json() as any;
        assert.equal(retriedResponse.status, 202);
        assert.equal(retriedPayload.job.latest_attempt_number, 2);
        assert.equal(retriedPayload.attempts.at(-1)?.retry_of_run_id, canceledPayload.attempts.at(-1)?.run_id);

        const finalRetriedPayload = await waitForAsyncRun(baseUrl, queuedCancelPayload.job.job_id, 180000, 2);
        assert.equal(finalRetriedPayload.job.status, "succeeded");
        assert.equal(finalRetriedPayload.attempts.length, 2);
        assert.equal(finalRetriedPayload.attempts[0]?.status, "canceled");
        assert.equal(finalRetriedPayload.attempts[1]?.status, "succeeded");
        await waitForRunSummary(baseUrl, finalRetriedPayload.attempts[1].run_id);

        const listResponse = await fetch(`${baseUrl}/runs/async`);
        const listPayload = await listResponse.json() as any;
        assert.equal(listResponse.status, 200);
        assert.equal(listPayload.jobs.some((item: any) => item.job_id === queuedPayload.job.job_id), true);
        assert.equal(listPayload.jobs.some((item: any) => item.job_id === queuedCancelPayload.job.job_id), true);
        for (const jobId of [queuedPayload.job.job_id, pendingPayload.job.job_id, queuedCancelPayload.job.job_id]) {
          const terminalPayload = await waitForAsyncTerminalFollowup(baseUrl, jobId);
          assert.equal(terminalPayload.job.terminal_followup_status, "completed");
        }
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
        if (previousDisableLocalBinaries === undefined) {
          delete process.env.HARNESS_DISABLE_LOCAL_BINARIES;
        } else {
          process.env.HARNESS_DISABLE_LOCAL_BINARIES = previousDisableLocalBinaries;
        }
        if (previousDisablePythonWorkers === undefined) {
          delete process.env.HARNESS_DISABLE_PYTHON_WORKERS;
        } else {
          process.env.HARNESS_DISABLE_PYTHON_WORKERS = previousDisablePythonWorkers;
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      webhookServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      genericWebhookServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    assert.equal(webhookPayload?.job?.status, "succeeded");
    assert.equal(genericWebhookEvents.some((item: any) => item.payload?.event_type === "run_completed"), true);
    assert.equal(genericWebhookEvents.some((item: any) => item.payload?.event_type === "review_required"), true);
  });
}

async function testCanonicalTargetIdentityGroupsRepoCloneAndEndpointVariants(): Promise<void> {
  await withTempDir("harness-target-identity-", async (rootDir) => {
    const store = new LocalPersistenceStore(rootDir);
    const repoCanonicalTargetId = deriveCanonicalTargetId({
      repoUrl: "https://github.com/example/widget"
    });
    const endpointCanonicalTargetId = deriveCanonicalTargetId({
      endpointUrl: "https://api.example.com/v1"
    });

    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_repo", target_type: "repo", canonical_name: "widget", repo_url: "https://github.com/Example/Widget.git", local_path: null, endpoint_url: null, created_at: "2026-04-15T00:00:00.000Z" },
      target_snapshot: { id: "snap_repo", target_id: "target_repo", snapshot_value: "https://github.com/Example/Widget.git", commit_sha: null, captured_at: "2026-04-15T00:00:00.000Z", analysis_hash: null },
      target_summary: { id: "target_repo", target_id: "target_repo", canonical_target_id: repoCanonicalTargetId, canonical_name: "widget", target_type: "repo", repo_url: "https://github.com/Example/Widget.git", local_path: null, endpoint_url: null, latest_run_id: "run_repo", latest_run_created_at: "2026-04-15T00:00:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "strong", latest_overall_score: 88, latest_static_score: 88, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 0, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-15T00:00:00.000Z" },
      policy_pack: null,
      run: { id: "run_repo", target_id: "target_repo", target_snapshot_id: "snap_repo", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: rootDir, started_at: "2026-04-15T00:00:00.000Z", completed_at: "2026-04-15T00:01:00.000Z", static_score: 88, overall_score: 88, rating: "strong", created_at: "2026-04-15T00:00:00.000Z" },
      resolved_configuration: { run_id: "run_repo", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "repo", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "repo", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      commit_diff: null, correction_plan: null, correction_result: null, lane_reuse_decisions: [], persistence_summary: null, stage_artifacts: [], stage_executions: [], lane_plans: [], evidence_records: [], lane_results: [], lane_specialists: [], agent_invocations: [], tool_executions: [], findings: [], control_results: [],
      score_summary: { run_id: "run_repo", methodology_version: "1", overall_score: 88, rating: "strong", leaderboard_summary: "", limitations_json: [] },
      review_decision: { run_id: "run_repo", publishability_status: "publishable", human_review_required: false, public_summary_safe: true, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "public" },
      policy_application: { run_id: "run_repo", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: [], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [], metrics: [], events: [], artifact_index: []
    } as any);

    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_clone", target_type: "path", canonical_name: "local-widget", repo_url: "git@github.com:example/widget.git", local_path: "D:/sandboxes/widget", endpoint_url: null, created_at: "2026-04-15T00:02:00.000Z" },
      target_snapshot: { id: "snap_clone", target_id: "target_clone", snapshot_value: "D:/Users/Example/Widget", commit_sha: "abc123", captured_at: "2026-04-15T00:02:00.000Z", analysis_hash: null },
      target_summary: { id: "target_clone", target_id: "target_clone", canonical_target_id: repoCanonicalTargetId, canonical_name: "widget", target_type: "path", repo_url: "git@github.com:example/widget.git", local_path: "D:/Users/Example/Widget", endpoint_url: null, latest_run_id: "run_clone", latest_run_created_at: "2026-04-15T00:02:00.000Z", latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "repo_posture_only", latest_rating: "good", latest_overall_score: 74, latest_static_score: 74, latest_publishability_status: "publishable", latest_human_review_required: false, latest_finding_count: 1, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: "2026-04-15T00:02:00.000Z" },
      policy_pack: null,
      run: { id: "run_clone", target_id: "target_clone", target_snapshot_id: "snap_clone", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: rootDir, started_at: "2026-04-15T00:02:00.000Z", completed_at: "2026-04-15T00:03:00.000Z", static_score: 74, overall_score: 74, rating: "good", created_at: "2026-04-15T00:02:00.000Z" },
      resolved_configuration: { run_id: "run_clone", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "repo_posture_only", run_mode: "static", target_kind: "path", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "static", target_kind: "path", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "deep-static" } },
      commit_diff: null, correction_plan: null, correction_result: null, lane_reuse_decisions: [], persistence_summary: null, stage_artifacts: [], stage_executions: [], lane_plans: [], evidence_records: [], lane_results: [], lane_specialists: [], agent_invocations: [], tool_executions: [], findings: [{ id: "finding_clone", run_id: "run_clone", lane_name: null, title: "clone finding", severity: "low", category: "test", description: "persisted", confidence: 0.5, source: "tool", publication_state: "public_safe", needs_human_review: false, score_impact: 1, control_ids_json: [], standards_refs_json: [], evidence_json: [], created_at: "2026-04-15T00:02:00.000Z" }], control_results: [],
      score_summary: { run_id: "run_clone", methodology_version: "1", overall_score: 74, rating: "good", leaderboard_summary: "", limitations_json: [] },
      review_decision: { run_id: "run_clone", publishability_status: "publishable", human_review_required: false, public_summary_safe: true, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "public" },
      policy_application: { run_id: "run_clone", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: ["finding_clone"], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [], metrics: [], events: [], artifact_index: []
    } as any);

    await store.persistBundle({
      mode: "local",
      package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: true, lane_specialists_enabled: true, focus: [], minimum_tools: [], scorecard_weights: {} } as any,
      target: { id: "target_endpoint", target_type: "endpoint", canonical_name: "api", repo_url: null, local_path: null, endpoint_url: "https://API.EXAMPLE.com:443/v1/", created_at: "2026-04-15T00:04:00.000Z" },
      target_snapshot: { id: "snap_endpoint", target_id: "target_endpoint", snapshot_value: "https://api.example.com/v1", commit_sha: null, captured_at: "2026-04-15T00:04:00.000Z", analysis_hash: null },
      target_summary: { id: "target_endpoint", target_id: "target_endpoint", canonical_target_id: endpointCanonicalTargetId, canonical_name: "https://api.example.com/v1", target_type: "endpoint", repo_url: null, local_path: null, endpoint_url: "https://API.EXAMPLE.com:443/v1/", latest_run_id: "run_endpoint", latest_run_created_at: "2026-04-15T00:04:00.000Z", latest_status: "succeeded", latest_run_mode: "runtime", latest_audit_package: "runtime-validated", latest_target_class: "hosted_endpoint_black_box", latest_rating: "fair", latest_overall_score: 52, latest_static_score: 0, latest_publishability_status: "internal_only", latest_human_review_required: true, latest_finding_count: 0, latest_frameworks_json: [], latest_languages_json: [], latest_package_ecosystems_json: [], updated_at: "2026-04-15T00:04:00.000Z" },
      policy_pack: null,
      run: { id: "run_endpoint", target_id: "target_endpoint", target_snapshot_id: "snap_endpoint", policy_pack_id: null, status: "succeeded", run_mode: "runtime", audit_package: "runtime-validated", artifact_root: rootDir, started_at: "2026-04-15T00:04:00.000Z", completed_at: "2026-04-15T00:05:00.000Z", static_score: 0, overall_score: 52, rating: "fair", created_at: "2026-04-15T00:04:00.000Z" },
      resolved_configuration: { run_id: "run_endpoint", policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "runtime-validated", selected_audit_package: "runtime-validated", audit_package_title: "Runtime", audit_package_selection_mode: "explicit", initial_target_class: "hosted_endpoint_black_box", run_mode: "runtime", target_kind: "endpoint", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: { run_mode: "runtime", target_kind: "endpoint", db_mode: "local" }, policy_pack_json: {}, audit_package_json: { selected_id: "runtime-validated" } },
      commit_diff: null, correction_plan: null, correction_result: null, lane_reuse_decisions: [], persistence_summary: null, stage_artifacts: [], stage_executions: [], lane_plans: [], evidence_records: [], lane_results: [], lane_specialists: [], agent_invocations: [], tool_executions: [], findings: [], control_results: [],
      score_summary: { run_id: "run_endpoint", methodology_version: "1", overall_score: 52, rating: "fair", leaderboard_summary: "", limitations_json: [] },
      review_decision: { run_id: "run_endpoint", publishability_status: "internal_only", human_review_required: true, public_summary_safe: false, threshold: "standard", rationale_json: [], gating_findings_json: [], recommended_visibility: "internal" },
      policy_application: { run_id: "run_endpoint", applied_suppressions_json: [], applied_waivers_json: [], effective_finding_ids_json: [], effective_control_ids_json: [], notes_json: [] },
      dimension_scores: [], metrics: [], events: [], artifact_index: []
    } as any);

    const targets = await listPersistedTargets(rootDir);
    const repoTarget = targets.find((item) => item.id === repoCanonicalTargetId) ?? null;
    const endpointTarget = targets.find((item) => item.id === endpointCanonicalTargetId) ?? null;

    assert.equal(targets.length, 2);
    assert.ok(repoTarget);
    assert.ok(endpointTarget);
    assert.equal(repoTarget?.canonical_name, "widget");
    assert.equal(repoTarget?.repo_url, "git@github.com:example/widget.git");
    assert.equal(repoTarget?.latest_run?.id, "run_clone");
    assert.equal(endpointTarget?.endpoint_url, "https://API.EXAMPLE.com:443/v1/");
  });
}

async function testArtifactPolicyClassifiesPersistedAndArtifactOnlyOutputs(): Promise<void> {
  const findings = describeArtifactType("findings");
  const observations = describeArtifactType("observations");
  const skepticReview = describeArtifactType("skeptic-review");
  const findingQuality = describeArtifactType("finding-quality");
  const preSupervisorIntegrity = describeArtifactType("finding-integrity-pre-supervisor");
  const postSupervisorIntegrity = describeArtifactType("post-supervisor-integrity");
  const remediation = describeArtifactType("remediation");
  const laneSpecialist = describeArtifactType("lane-specialist-repo_posture");

  assert.equal(findings.disposition, "queryable_persisted");
  assert.equal(findings.persisted_table, "findings");
  assert.equal(observations.disposition, "queryable_persisted");
  assert.equal(observations.persisted_table, "stage_artifacts");
  assert.equal(skepticReview.disposition, "queryable_persisted");
  assert.equal(skepticReview.persisted_table, "supervisor_reviews");
  assert.equal(findingQuality.disposition, "queryable_persisted");
  assert.equal(findingQuality.persisted_table, "finding_quality");
  assert.equal(preSupervisorIntegrity.disposition, "artifact_only");
  assert.equal(postSupervisorIntegrity.disposition, "queryable_persisted");
  assert.equal(postSupervisorIntegrity.persisted_table, "finding_quality");
  assert.equal(remediation.disposition, "queryable_persisted");
  assert.equal(remediation.persisted_table, "remediation_memos");
  assert.equal(laneSpecialist.disposition, "artifact_only");
  assert.equal(laneSpecialist.persisted_table, null);
}

async function testWebUiAndPersistedUiSettingsApi(): Promise<void> {
  await withTempDir("harness-web-ui-", async (rootDir) => {
    const LocalRoot = path.join(rootDir, "local-db");
    await withWorkingDir(rootDir, async () => {
      const envKeys = [
        "AUDIT_LLM_PROVIDER",
        "AUDIT_LLM_MODEL",
        "AUDIT_LLM_API_KEY",
        "AUDIT_LLM_CODEX_COMMAND",
        "AUDIT_LLM_CODEX_MODEL",
        "AUDIT_LLM_CODEX_SANDBOX",
        "AUDIT_LLM_CODEX_TIMEOUT_MS",
        "LLM_API_KEY",
        "OPENAI_API_KEY",
        "AUDIT_LLM_PLANNER_PROVIDER",
        "AUDIT_LLM_PLANNER_MODEL",
        "AUDIT_LLM_PLANNER_API_KEY",
        "AUDIT_LLM_THREAT_MODEL_PROVIDER",
        "AUDIT_LLM_THREAT_MODEL_MODEL",
        "AUDIT_LLM_THREAT_MODEL_API_KEY",
        "AUDIT_LLM_EVIDENCE_SELECTION_PROVIDER",
        "AUDIT_LLM_EVIDENCE_SELECTION_MODEL",
        "AUDIT_LLM_EVIDENCE_SELECTION_API_KEY",
        "AUDIT_LLM_AREA_REVIEW_PROVIDER",
        "AUDIT_LLM_AREA_REVIEW_MODEL",
        "AUDIT_LLM_AREA_REVIEW_API_KEY",
        "AUDIT_LLM_SUPERVISOR_PROVIDER",
        "AUDIT_LLM_SUPERVISOR_MODEL",
        "AUDIT_LLM_SUPERVISOR_API_KEY",
        "AUDIT_LLM_REMEDIATION_PROVIDER",
        "AUDIT_LLM_REMEDIATION_MODEL",
        "AUDIT_LLM_REMEDIATION_API_KEY"
      ] as const;
      const savedEnv = new Map<string, string | undefined>();
      for (const key of envKeys) {
        savedEnv.set(key, process.env[key]);
        delete process.env[key];
      }
      process.env.HARNESS_LOCAL_DB_ROOT = LocalRoot;
      process.env.HARNESS_API_AUTH_MODE = "api_key";
      process.env.HARNESS_API_KEY = "test-secret";
      const apiServer = createApiServer();
      await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", () => resolve()));
      const apiAddress = apiServer.address();
      assert.ok(apiAddress && typeof apiAddress !== "string");
      const apiBaseUrl = `http://127.0.0.1:${apiAddress.port}`;

      const webServer = createWebUiServer({ apiBaseUrl });
      await new Promise<void>((resolve) => webServer.listen(0, "127.0.0.1", () => resolve()));
      const webAddress = webServer.address();
      assert.ok(webAddress && typeof webAddress !== "string");
      const webBaseUrl = `http://127.0.0.1:${webAddress.port}`;

      try {
        const pageResponse = await fetch(`${webBaseUrl}/`);
        const pageHtml = await pageResponse.text();
        assert.equal(pageResponse.status, 200);
        assert.match(pageHtml, /AI Security Harness/);
        const appRootResponse = await fetch(`${webBaseUrl}/client/app-root.js`);
        const appRootSource = await appRootResponse.text();
        assert.equal(appRootResponse.status, 200);
        assert.match(appRootSource, /ChatGPT \+ Codex uses your local subscription sign-in by default/);
        assert.match(appRootSource, /OpenAI API models remain available as an optional API-key route/);
        assert.match(appRootSource, /Connect ChatGPT account/);
        assert.match(appRootSource, /Use API-key routing for this runtime audit/);

        const scopedHeaders = {
          "x-api-key": "test-secret",
          "x-harness-workspace": "team-alpha",
          "x-harness-project": "project-red",
          "x-harness-actor": "alice"
        };
        const otherScopeHeaders = {
          "x-api-key": "test-secret",
          "x-harness-workspace": "team-beta",
          "x-harness-project": "project-blue",
          "x-harness-actor": "bob"
        };

        const unauthorizedSettingsResponse = await fetch(`${webBaseUrl}/api/ui/settings`);
        assert.equal(unauthorizedSettingsResponse.status, 401);

        const authInfoResponse = await fetch(`${webBaseUrl}/api/auth/info`);
        const authInfoPayload = await authInfoResponse.json() as any;
        assert.equal(authInfoResponse.status, 200);
        assert.equal(authInfoPayload.auth_mode, "api_key");
        assert.equal(authInfoPayload.identity_enforced, true);

        const initialSettingsResponse = await fetch(`${webBaseUrl}/api/ui/settings`, { headers: scopedHeaders });
        const initialSettingsPayload = await initialSettingsResponse.json() as any;
        assert.equal(initialSettingsResponse.status, 200);
        assert.equal(initialSettingsPayload.settings.providers_json.default_provider, "openai_codex");
        assert.equal(initialSettingsPayload.settings.learning_json.enabled, false);
        assert.equal(initialSettingsPayload.settings.learning_json.llm_synthesis_enabled, false);
        assert.equal(initialSettingsPayload.settings.review_json.publishability_threshold, "high");
        assert.equal(initialSettingsPayload.settings.review_json.default_visibility, "internal");

        const updateResponse = await fetch(`${webBaseUrl}/api/ui/settings`, {
          method: "PUT",
          headers: { "content-type": "application/json", ...scopedHeaders },
          body: JSON.stringify({
            providers: { default_provider: "openai", default_model: "gpt-5.4", mock_mode: false, agent_overrides: { planner_agent: { model: "gpt-5.4-mini" } } },
            review: {
              require_human_review_for_severity: "medium",
              default_visibility: "internal-only",
              publishability_threshold: "medium",
              disposition_renewal_days: 45,
              disposition_review_window_days: 14
            },
            integrations: {
              generic_webhook_url: "http://127.0.0.1:9999/events",
              generic_webhook_secret: "ui-settings-webhook-secret",
              generic_webhook_events: ["run_completed"]
            },
            test_mode: { preset: "fixture_validation", deterministic_planning: true, fixture_validation_enabled: true, reduced_cost_mode: false }
          })
        });
        const updatePayload = await updateResponse.json() as any;
        assert.equal(updateResponse.status, 200);
        assert.equal(updatePayload.settings.providers_json.default_provider, "openai");
        assert.equal(updatePayload.settings.review_json.require_human_review_for_severity, "medium");
        assert.equal(updatePayload.settings.review_json.default_visibility, "internal-only");
        assert.equal(updatePayload.settings.review_json.publishability_threshold, "medium");
        assert.equal(updatePayload.settings.review_json.disposition_renewal_days, 45);
        assert.equal(updatePayload.settings.review_json.disposition_review_window_days, 14);
        assert.equal(updatePayload.settings.integrations_json.generic_webhook_secret, "************");
        assert.equal(updatePayload.settings.test_mode_json.preset, "fixture_validation");

        const documentCreateResponse = await fetch(`${webBaseUrl}/api/ui/documents`, {
          method: "POST",
          headers: { "content-type": "application/json", ...scopedHeaders },
          body: JSON.stringify({
            title: "Internal Policy Pack",
            document_type: "policy",
            filename: "policy.md",
            content_text: "# Policy\\nOnly public-safe findings may be exported.",
            tags: ["internal", "policy"]
          })
        });
        const documentCreatePayload = await documentCreateResponse.json() as any;
        assert.equal(documentCreateResponse.status, 201);
        assert.equal(documentCreatePayload.document.title, "Internal Policy Pack");

        const documentsResponse = await fetch(`${webBaseUrl}/api/ui/documents`, { headers: scopedHeaders });
        const documentsPayload = await documentsResponse.json() as any;
        assert.equal(documentsResponse.status, 200);
        assert.equal(documentsPayload.documents.length, 1);

        const otherScopeSettingsResponse = await fetch(`${webBaseUrl}/api/ui/settings`, { headers: otherScopeHeaders });
        const otherScopeSettingsPayload = await otherScopeSettingsResponse.json() as any;
        assert.equal(otherScopeSettingsPayload.settings.providers_json.default_provider, "openai_codex");

        const otherScopeDocumentsResponse = await fetch(`${webBaseUrl}/api/ui/documents`, { headers: otherScopeHeaders });
        const otherScopeDocumentsPayload = await otherScopeDocumentsResponse.json() as any;
        assert.equal(otherScopeDocumentsPayload.documents.length, 0);

        const deleteResponse = await fetch(`${webBaseUrl}/api/ui/documents/${documentCreatePayload.document.id}`, { method: "DELETE", headers: scopedHeaders });
        const deletePayload = await deleteResponse.json() as any;
        assert.equal(deleteResponse.status, 200);
        assert.equal(deletePayload.deleted, true);

        // Community Edition deliberately normalizes every authenticated request to the
        // single local workspace. Project scoping still applies.
        const persistedSettings = await readPersistedUiSettings({ rootDir: LocalRoot, dbMode: "local" }, { workspaceId: "default", projectId: "project-red" });
        const persistedDocuments = await listPersistedUiDocuments({ rootDir: LocalRoot, dbMode: "local" }, { workspaceId: "team-alpha", projectId: "project-red" });
        assert.ok(persistedSettings);
        assert.equal((persistedSettings.integrations_json as any).generic_webhook_secret, "ui-settings-webhook-secret");
        assert.equal(persistedDocuments.length, 0);
      } finally {
        for (const [key, value] of savedEnv.entries()) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        delete process.env.HARNESS_LOCAL_DB_ROOT;
        delete process.env.HARNESS_API_AUTH_MODE;
        delete process.env.HARNESS_API_KEY;
        await new Promise<void>((resolve, reject) => webServer.close((error) => error ? reject(error) : resolve()));
        await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
      }
    });
  });
}

async function testPreflightApiSummarizesReadiness(): Promise<void> {
  await withTempDir("harness-preflight-api-", async (rootDir) => {
    const LocalRoot = path.join(rootDir, "local-db");
    const fixturePath = path.resolve(process.cwd(), "fixtures", "validation-targets", "agent-tool-boundary-risky");
    await stageBuiltinCoreEngineData(rootDir);
    await withWorkingDir(rootDir, async () => {
      process.env.HARNESS_LOCAL_DB_ROOT = LocalRoot;
      process.env.HARNESS_API_AUTH_MODE = "none";
      process.env.HARNESS_DISABLE_LOCAL_BINARIES = "1";
      const apiServer = createApiServer();
      await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", () => resolve()));
      const apiAddress = apiServer.address();
      assert.ok(apiAddress && typeof apiAddress !== "string");
      const apiBaseUrl = `http://127.0.0.1:${apiAddress.port}`;
      try {
        const response = await fetch(`${apiBaseUrl}/preflight`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            local_path: fixturePath,
            run_mode: "static",
            audit_package: "agentic-static",
            llm_provider: "mock",
            hints: {
              preflight: { strictness: "strict", runtime_allowed: "targeted_only" },
              review: { require_human_review_for_severity: "high", default_visibility: "internal" }
            }
          })
        });
        const payload = await response.json() as any;
        assert.equal(response.status, 200);
        assert.equal(payload.preflight.target.kind, "path");
        assert.equal(payload.preflight.target.target_class, "tool_using_multi_turn_agent");
        assert.equal(payload.preflight.launch_profile.audit_package, "agentic-static");
        assert.equal(payload.preflight.readiness.status, "ready_with_warnings");
        assert.ok(Array.isArray(payload.preflight.readiness.warnings));
        assert.equal(payload.preflight.provider_readiness.find((item: any) => item.provider_id === "semgrep")?.status, "blocked");
        assert.equal(payload.preflight.provider_readiness.find((item: any) => item.provider_id === "trivy")?.status, "blocked");
      } finally {
        delete process.env.HARNESS_LOCAL_DB_ROOT;
        delete process.env.HARNESS_API_AUTH_MODE;
        delete process.env.HARNESS_DISABLE_LOCAL_BINARIES;
        await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
      }
    });
  });
}

async function testRuntimeSandboxBackendResolution(): Promise<void> {
  const unavailableProbe = () => ({ available: false, ok: false, version: null, message: "missing" });
  const allAvailableProbe = (command: string, args?: string[]) => {
    if (command === "podman" && args?.[0] === "info") return { available: true, ok: true, version: "true" };
    return { available: true, ok: true, version: `${command} test` };
  };
  const gvisorOnly = resolveLocalSandboxBackend({
    platform: "linux",
    probeCommand: (command) => command === "runsc"
      ? { available: true, ok: true, version: "runsc test" }
      : { available: false, ok: false, version: null, message: "missing" }
  });
  assert.equal(gvisorOnly.selected_backend, "gvisor_container");
  assert.equal(gvisorOnly.readiness_status, "ready");

  const dockerOnlyAllowed = resolveLocalSandboxBackend({
    platform: "linux",
    settings: { allowed_backends: ["docker"] },
    probeCommand: allAvailableProbe
  });
  assert.equal(dockerOnlyAllowed.selected_backend, "docker");

  const pinnedMissing = resolveLocalSandboxBackend({
    platform: "linux",
    settings: { resolution_mode: "pinned", preferred_backend: "gvisor_container", allowed_backends: ["gvisor_container"] },
    probeCommand: unavailableProbe
  });
  assert.equal(pinnedMissing.selected_backend, "unavailable");
  assert.equal(pinnedMissing.readiness_status, "blocked");
  assert.equal(pinnedMissing.blockers.some((item) => /Pinned Local Runtime Sandbox backend/i.test(item)), true);

  const preferFallback = resolveLocalSandboxBackend({
    platform: "linux",
    settings: { resolution_mode: "prefer", preferred_backend: "gvisor_container" },
    probeCommand: (command, args) => {
      if (command === "podman" && args?.[0] === "info") return { available: true, ok: true, version: "true" };
      if (command === "podman") return { available: true, ok: true, version: "podman test" };
      return { available: false, ok: false, version: null, message: "missing" };
    }
  });
  assert.equal(preferFallback.selected_backend, "rootless_podman");
  assert.equal(preferFallback.readiness_status, "ready");

  const dockerDesktop = resolveLocalSandboxBackend({
    platform: "win32",
    probeCommand: (command) => command === "docker"
      ? { available: true, ok: true, version: "Docker Desktop test" }
      : { available: false, ok: false, version: null, message: "missing" }
  });
  assert.equal(dockerDesktop.selected_backend, "docker_desktop");
  assert.equal(dockerDesktop.readiness_status, "ready_with_warnings");

  const defaultPolicy = buildRuntimeExecutionPolicy({ selectedBackend: "docker" });
  assert.equal(defaultPolicy.provider_id, "local_runtime");
  assert.equal(defaultPolicy.network_policy, "none");
  assert.deepEqual(defaultPolicy.outbound_allowlist, []);
  assert.equal(defaultPolicy.filesystem.block_host_mounts, true);
}

async function testLocalRuntimeProviderExecutesExactArgvInContainer(): Promise<void> {
  await withTempDir("harness-local-runtime-provider-", async (rootDir) => {
    const targetDir = path.join(rootDir, "target");
    const artifactDir = path.join(rootDir, "artifacts");
    await fs.mkdir(targetDir);
    await fs.mkdir(artifactDir);
    await fs.writeFile(path.join(targetDir, "package.json"), "{}\n");
    const calls: Array<{ command: string; args: string[] }> = [];
    const provider = createLocalRuntimeProvider({
      runCommand: async (command, args) => {
        calls.push({ command, args: [...args] });
        const stdout = args[0] === "volume" && args[1] === "create"
          ? "workspace-volume\n"
          : args[0] === "start" && args.some((item) => item.includes("-quota-"))
            ? "1\t/workspace\n"
            : args[0] === "inspect" && args.includes("{{json .State}}")
              ? '{"OOMKilled":false,"Pid":0,"ExitCode":0}\n'
              : args[0] === "stats"
                ? '{"CPUPerc":"0.00%","MemUsage":"1MiB / 2GiB","MemPerc":"0.05%","PIDs":"1","BlockIO":"0B / 0B","NetIO":"0B / 0B"}\n'
                : "";
        return { exit_code: 0, stdout, stderr: "", timed_out: false };
      }
    });
    const policy = buildRuntimeExecutionPolicy({ selectedBackend: "docker" });
    const request = {
      run_id: "run_provider_exact_argv",
      target_dir: targetDir,
      artifact_dir: artifactDir,
      policy,
      detected_stack: ["node"],
      steps: [{
        step_id: "test-node",
        phase: "test" as const,
        adapter: "node_npm",
        command: ["node", "--test"],
        requires_network: false,
        enabled: true,
        artifact_context: { stack: "node" }
      }]
    };
    const plan = await provider.plan(request);
    assert.equal(plan.image, LOCAL_RUNTIME_IMAGES.node);
    assert.equal(plan.image_digest?.startsWith("sha256:"), true);
    const result = await provider.execute(request, plan);
    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.equal(result.steps[0]?.execution_runtime, "container");
    assert.deepEqual(result.steps[0]?.command, ["node", "--test"]);
    assert.equal(result.cleanup.containers_removed, true);
    assert.equal(result.cleanup.workspace_volume_removed, true);
    assert.equal((await provider.collectArtifacts(request.run_id)).some((item) => item.artifact_type === "runtime_execution"), true);
    assert.equal(calls.every((item) => item.command === "docker"), true);
    const targetCreate = calls.find((item) => item.args[0] === "create" && item.args.includes("node") && item.args.includes("--test"));
    assert.ok(targetCreate);
    assert.equal(targetCreate.args.includes("--read-only"), true);
    assert.equal(targetCreate.args.includes("--cap-drop"), true);
    assert.equal(targetCreate.args.includes("ALL"), true);
    assert.equal(targetCreate.args.includes("no-new-privileges"), true);
    assert.equal(targetCreate.args.includes("--network"), true);
    assert.equal(targetCreate.args[targetCreate.args.indexOf("--network") + 1], "none");
    assert.equal(targetCreate.args.includes("65532:65532"), true);
    assert.equal(targetCreate.args.includes("--ulimit"), true);
    assert.equal(targetCreate.args.some((item) => item.startsWith("fsize=")), true);
    assert.equal(targetCreate.args.includes("TETHERMARK_RUNTIME_CREDENTIAL_MODE=synthetic"), true);
    assert.equal(targetCreate.args.includes("TETHERMARK_FAKE_SECRET=tm_fake_runtime_validation_only"), true);
    assert.equal(targetCreate.args.some((item) => item.startsWith("type=volume") && item.includes("target=/artifacts")), true);
    assert.equal(targetCreate.args.some((item) => item.startsWith("type=bind") && item.includes("target=/artifacts")), false);
    assert.equal(result.steps[0]?.resource_summary?.quota_exceeded, false);
    assert.equal(result.steps[0]?.resource_summary?.oom_killed, false);
    assert.equal(targetCreate.args.some((item) => item.includes(`source=${path.resolve(targetDir)}`)), false);
    const stageCreate = calls.find((item) => item.args[0] === "create" && item.args.some((arg) => arg.includes("find . -type f")));
    assert.ok(stageCreate);
    assert.equal(stageCreate.args.includes("65532:65532"), true);
    assert.equal(stageCreate.args.some((item) => item.includes(`source=${path.resolve(targetDir)}`) && item.endsWith("readonly")), true);
    const volumeCreate = calls.find((item) => item.args[0] === "volume" && item.args[1] === "create");
    assert.ok(volumeCreate);
    assert.equal(volumeCreate.args.includes("type=tmpfs"), true);
    assert.equal(volumeCreate.args.some((item) => item.startsWith("o=size=") && item.includes("uid=65532")), true);
    assert.equal(calls.filter((item) => item.args[0] === "volume" && item.args[1] === "create").length, 2);
    const collectorCreate = calls.find((item) => item.args[0] === "create" && item.args.some((arg) => arg.includes("find . -type f")) && item.args.some((arg) => arg.includes("target=/output")));
    assert.ok(collectorCreate);
    assert.equal(calls.some((item) => item.args[0] === "volume" && item.args[1] === "rm"), true);
  });
}

async function testLocalRuntimeProviderRequiresHealthyFrameworkEndpoint(): Promise<void> {
  await withTempDir("harness-local-runtime-health-", async (rootDir) => {
    const targetDir = path.join(rootDir, "target");
    const artifactDir = path.join(rootDir, "artifacts");
    await fs.mkdir(targetDir);
    await fs.mkdir(artifactDir);
    await fs.writeFile(path.join(targetDir, "requirements.txt"), "fastapi\nuvicorn\n");
    const calls: Array<{ command: string; args: string[] }> = [];
    const provider = createLocalRuntimeProvider({
      runCommand: async (command, args) => {
        calls.push({ command, args: [...args] });
        const stdout = args[0] === "start" && args.some((item) => item.includes("-quota-"))
          ? "1\t/workspace\n"
          : args[0] === "exec"
            ? '{"successful_index":-1,"attempts":[{"port":8000,"path":"/docs","status_code":null,"error":"ECONNREFUSED","duration_ms":1}]}\n'
            : args[0] === "inspect" && args.includes("{{json .State}}")
              ? '{"Running":true,"OOMKilled":false,"Pid":123,"ExitCode":0}\n'
              : args[0] === "stats" ? "{}\n" : "";
        return { exit_code: args[0] === "exec" ? 3 : 0, stdout, stderr: "", timed_out: false };
      }
    });
    const policy = buildRuntimeExecutionPolicy({ selectedBackend: "docker", settings: { step_timeout_ms: 5 } });
    const request = {
      run_id: "run_provider_framework_health",
      target_dir: targetDir,
      artifact_dir: artifactDir,
      policy,
      detected_stack: ["python"],
      steps: [{
        step_id: "fastapi-runtime",
        phase: "runtime_probe" as const,
        adapter: "python_fastapi",
        command: ["python", "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
        requires_network: false,
        enabled: true,
        artifact_context: { stack: "python", framework: "fastapi", probe_ports: [8000], probe_paths: ["/docs", "/openapi.json"] }
      }]
    };
    const result = await provider.execute(request, await provider.plan(request));
    assert.equal(result.status, "failed");
    assert.equal(result.steps[0]?.status, "failed");
    assert.equal(result.steps[0]?.health_probe?.ok, false);
    assert.equal(result.steps[0]?.health_probe?.classification, "connection_refused");
    assert.equal(result.steps[0]?.health_probe?.strategy, "python_http_client");
    assert.match(result.steps[0]?.summary ?? "", /did not expose a healthy HTTP endpoint/i);
    const healthExec = calls.find((item) => item.args[0] === "exec" && item.args.includes("python") && item.args.includes("-c"));
    assert.ok(healthExec);
    const targets = JSON.parse(healthExec.args.at(-1) ?? "[]") as Array<{ port: number; path: string }>;
    assert.equal(targets.some((target) => target.port === 8000 && target.path === "/docs"), true);
    assert.equal(calls.some((item) => item.args.includes("curl") || item.args.includes("wget")), false);
  });
}

async function testLocalRuntimeProviderFailsClosedOnWorkspaceQuota(): Promise<void> {
  await withTempDir("harness-local-runtime-quota-", async (rootDir) => {
    const targetDir = path.join(rootDir, "target");
    const artifactDir = path.join(rootDir, "artifacts");
    await fs.mkdir(targetDir);
    await fs.mkdir(artifactDir);
    await fs.writeFile(path.join(targetDir, "package.json"), "{}\n");
    const policy = buildRuntimeExecutionPolicy({
      selectedBackend: "docker",
      settings: { max_workspace_bytes: 2048, max_file_bytes: 1024 }
    });
    const request = {
      run_id: "run_provider_workspace_quota",
      target_dir: targetDir,
      artifact_dir: artifactDir,
      policy,
      detected_stack: ["node"],
      steps: [{
        step_id: "test-quota",
        phase: "test" as const,
        command: ["node", "--test"],
        requires_network: false,
        enabled: true
      }]
    };
    const provider = createLocalRuntimeProvider({
      runCommand: async (_command, args) => {
        const stdout = args[0] === "start" && args.some((item) => item.includes("-quota-"))
          ? "3\t/workspace\n"
          : args[0] === "inspect" && args.includes("{{json .State}}")
            ? '{"OOMKilled":false,"Pid":0,"ExitCode":0}\n'
            : args[0] === "stats"
              ? "{}\n"
              : "";
        return { exit_code: 0, stdout, stderr: "", timed_out: false };
      }
    });
    const result = await provider.execute(request, await provider.plan(request));
    assert.equal(result.status, "failed");
    assert.equal(result.steps[0]?.resource_summary?.quota_exceeded, true);
    assert.match(result.steps[0]?.summary ?? "", /workspace or artifact quota/i);

    const sourceLimitedPolicy = buildRuntimeExecutionPolicy({ selectedBackend: "docker", settings: { max_workspace_bytes: 1 } });
    const sourceLimitedRequest = { ...request, run_id: "run_provider_source_quota", policy: sourceLimitedPolicy };
    const sourceLimitedProvider = createLocalRuntimeProvider({
      runCommand: async () => { throw new Error("container runtime must not start for oversized source"); }
    });
    const sourceLimitedResult = await sourceLimitedProvider.execute(sourceLimitedRequest, await sourceLimitedProvider.plan(sourceLimitedRequest));
    assert.equal(sourceLimitedResult.status, "blocked");
    assert.match(sourceLimitedResult.steps[0]?.summary ?? "", /runtime_workspace_quota_exceeded/i);
  });
}

async function testLocalRuntimeProviderUsesInternalAllowlistedEgressProxy(): Promise<void> {
  await withTempDir("harness-local-runtime-egress-", async (rootDir) => {
    const targetDir = path.join(rootDir, "target");
    const artifactDir = path.join(rootDir, "artifacts");
    await fs.mkdir(targetDir);
    await fs.mkdir(artifactDir);
    await fs.writeFile(path.join(targetDir, "package.json"), "{}\n");
    const calls: Array<{ command: string; args: string[] }> = [];
    const provider = createLocalRuntimeProvider({
      runCommand: async (command, args) => {
        calls.push({ command, args: [...args] });
        const stdout = args[0] === "start" && args.some((item) => item.includes("-quota-"))
          ? "1\t/workspace\n"
          : args[0] === "exec"
            ? '{"successful_index":0,"attempts":[{"port":3000,"path":"/health","status_code":200,"error":null,"duration_ms":2}]}\n'
          : args[0] === "inspect" && args.includes("{{json .State}}")
            ? '{"Running":true,"OOMKilled":false,"Pid":123,"ExitCode":0}\n'
            : args[0] === "stats" ? "{}\n" : "";
        return { exit_code: 0, stdout, stderr: "", timed_out: false };
      }
    });
    const policy = buildRuntimeExecutionPolicy({
      selectedBackend: "docker",
      settings: {
        network_policy: "allowlist",
        dependency_install_network: "allowed",
        runtime_probe_network: "allowed",
        outbound_allowlist: ["registry.npmjs.org"]
      }
    });
    const request = {
      run_id: "run_egress",
      target_dir: targetDir,
      artifact_dir: artifactDir,
      policy,
      detected_stack: ["node"],
      steps: [{
        step_id: "install-allowlist",
        phase: "install" as const,
        command: ["npm", "view", "is-number", "version"],
        requires_network: true,
        enabled: true
      }, {
        step_id: "runtime-external-allowlist",
        phase: "runtime_probe" as const,
        command: ["node", "server.js"],
        requires_network: true,
        enabled: true,
        artifact_context: { external_network: true }
      }, {
        step_id: "synthetic-tool",
        phase: "test" as const,
        command: ["node", "synthetic-service-client.js"],
        requires_network: false,
        enabled: true,
        artifact_context: { synthetic_services: ["fake_tool_api"] }
      }]
    };
    const result = await provider.execute(request, await provider.plan(request));
    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.equal(result.steps[0]?.network_mode, "bridge");
    assert.equal(result.steps[1]?.network_mode, "bridge");
    assert.equal(result.steps[2]?.network_mode, "bridge");
    assert.equal(result.steps[1]?.health_probe?.ok, true);
    assert.equal(result.steps[1]?.health_probe?.strategy, "node_http");
    assert.equal(result.steps[1]?.health_probe?.successful_target, "http://127.0.0.1:3000/health");
    const healthExec = calls.find((item) => item.args[0] === "exec" && item.args.includes("node") && item.args.includes("-e"));
    assert.ok(healthExec);
    assert.equal(calls.some((item) => item.args[0] === "network" && item.args[1] === "create" && item.args.includes("--internal")), true);
    assert.equal(calls.some((item) => item.args[0] === "network" && item.args[1] === "connect" && item.args.includes("bridge")), true);
    const targetCreate = calls.find((item) => item.args[0] === "create" && item.args.includes("npm") && item.args.includes("view"));
    assert.ok(targetCreate);
    assert.equal(targetCreate.args.includes("HTTPS_PROXY=http://tethermark-egress-proxy:8080"), true);
    assert.notEqual(targetCreate.args[targetCreate.args.indexOf("--network") + 1], "none");
    const syntheticCreate = calls.find((item) => item.args[0] === "create" && item.args.includes("synthetic-service-client.js"));
    assert.ok(syntheticCreate);
    assert.equal(syntheticCreate.args.includes("TETHERMARK_FAKE_SERVICE_URL=http://tethermark-fake-service:8081"), true);
    assert.equal(syntheticCreate.args.includes("HTTP_PROXY=http://tethermark-egress-proxy:8080"), false);
    assert.notEqual(syntheticCreate.args[syntheticCreate.args.indexOf("--network") + 1], targetCreate.args[targetCreate.args.indexOf("--network") + 1]);
    assert.equal(calls.some((item) => item.args[0] === "network" && item.args[1] === "rm"), true);

    const invalidPolicy = buildRuntimeExecutionPolicy({
      selectedBackend: "docker",
      settings: { network_policy: "allowlist", dependency_install_network: "allowed", outbound_allowlist: ["http://not-a-host"] }
    });
    const invalidRequest = { ...request, run_id: "run_bad_egress", policy: invalidPolicy, steps: [request.steps[0]] };
    const invalidProvider = createLocalRuntimeProvider({
      runCommand: async () => ({ exit_code: 0, stdout: "", stderr: "", timed_out: false })
    });
    const invalidResult = await invalidProvider.execute(invalidRequest, await invalidProvider.plan(invalidRequest));
    assert.equal(invalidResult.status, "blocked");
    assert.match(invalidResult.steps[0]?.summary ?? "", /runtime_egress_allowlist_invalid/i);
  });
}

async function testRuntimeSandboxApiEndpoints(): Promise<void> {
  await withTempDir("harness-runtime-sandbox-api-", async (rootDir) => {
    const savedEnv = new Map<string, string | undefined>([
      ["HARNESS_LOCAL_DB_ROOT", process.env.HARNESS_LOCAL_DB_ROOT],
      ["HARNESS_API_AUTH_MODE", process.env.HARNESS_API_AUTH_MODE],
      ["HARNESS_DISABLE_LEARNING_SCHEDULER", process.env.HARNESS_DISABLE_LEARNING_SCHEDULER]
    ]);
    process.env.HARNESS_LOCAL_DB_ROOT = rootDir;
    process.env.HARNESS_API_AUTH_MODE = "none";
    process.env.HARNESS_DISABLE_LEARNING_SCHEDULER = "1";
    const apiServer = createApiServer();
    await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
    try {
      const address = apiServer.address();
      assert.ok(address && typeof address === "object");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const providersResponse = await fetch(`${baseUrl}/runtime-sandbox/providers`);
      const providersPayload = await providersResponse.json() as any;
      assert.equal(providersResponse.status, 200, JSON.stringify(providersPayload));
      assert.equal(providersPayload.providers.some((item: any) => item.id === "local_runtime" && item.enabled), true);
      assert.equal(providersPayload.providers.some((item: any) => item.hosted_only), true);

      const readinessResponse = await fetch(`${baseUrl}/runtime-sandbox/readiness`);
      const readinessPayload = await readinessResponse.json() as any;
      assert.equal(readinessResponse.status, 200, JSON.stringify(readinessPayload));
      assert.equal(readinessPayload.runtime_sandbox.provider_id, "local_runtime");
      assert.ok(["ready", "ready_with_warnings", "blocked"].includes(readinessPayload.runtime_sandbox.resolution.readiness_status));
      assert.equal(Array.isArray(readinessPayload.runtime_sandbox.resolution.candidates), true);

      const policyResponse = await fetch(`${baseUrl}/runtime-sandbox/policy/defaults`);
      const policyPayload = await policyResponse.json() as any;
      assert.equal(policyResponse.status, 200, JSON.stringify(policyPayload));
      assert.equal(policyPayload.runtime_execution_policy.provider_id, "local_runtime");
      assert.equal(policyPayload.runtime_execution_policy.network_policy, "none");

      const hostedReadinessResponse = await fetch(`${baseUrl}/runtime-sandbox/readiness?provider_id=hosted_e2b`);
      const hostedReadinessPayload = await hostedReadinessResponse.json() as any;
      assert.equal(hostedReadinessResponse.status, 403, JSON.stringify(hostedReadinessPayload));
      assert.equal(hostedReadinessPayload.error, "hosted_only");
    } finally {
      await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
      for (const [key, value] of savedEnv.entries()) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}

async function testApiProjectScopingAndActorOwnedReviewActions(): Promise<void> {
  await withTempDir("harness-api-scope-", async (rootDir) => {
    const LocalRoot = path.join(rootDir, "local-db");
    const fixtureRoot = path.resolve(process.cwd(), "fixtures", "validation-targets");
    await stageBuiltinCoreEngineData(rootDir);
    await withWorkingDir(rootDir, async () => {
      await withEnv({
        HARNESS_LOCAL_DB_ROOT: LocalRoot,
        HARNESS_API_AUTH_MODE: "api_key",
        HARNESS_API_KEY: "scope-secret",
        HARNESS_DISABLE_LOCAL_BINARIES: "1",
        HARNESS_DISABLE_PYTHON_WORKERS: "1"
      }, async () => {
      const apiServer = createApiServer();
      await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", () => resolve()));
      const apiAddress = apiServer.address();
      assert.ok(apiAddress && typeof apiAddress !== "string");
      const apiBaseUrl = `http://127.0.0.1:${apiAddress.port}`;
      const alphaHeaders = {
        "content-type": "application/json",
        "x-api-key": "scope-secret",
        "x-harness-project": "red",
        "x-harness-actor": "alice"
      };
      const betaHeaders = {
        "content-type": "application/json",
        "x-api-key": "scope-secret",
        "x-harness-project": "blue",
        "x-harness-actor": "bob"
      };

      try {
        const alphaRunResponse = await fetch(`${apiBaseUrl}/runs`, {
          method: "POST",
          headers: alphaHeaders,
          body: JSON.stringify({
            local_path: path.join(fixtureRoot, "agent-tool-boundary-risky"),
            run_mode: "static",
            audit_package: "agentic-static",
            llm_provider: "mock"
          })
        });
        const alphaRunPayload = await alphaRunResponse.json() as any;
        assert.equal(alphaRunResponse.status, 200);

        const betaRunResponse = await fetch(`${apiBaseUrl}/runs`, {
          method: "POST",
          headers: betaHeaders,
          body: JSON.stringify({
            local_path: path.join(fixtureRoot, "repo-posture-good"),
            run_mode: "static",
            audit_package: "baseline-static",
            llm_provider: "mock"
          })
        });
        const betaRunPayload = await betaRunResponse.json() as any;
        assert.equal(betaRunResponse.status, 200);

        const alphaRunsResponse = await fetch(`${apiBaseUrl}/runs`, { headers: alphaHeaders });
        const alphaRunsPayload = await alphaRunsResponse.json() as any;
        assert.equal(alphaRunsPayload.runs.length, 1);
        assert.equal(alphaRunsPayload.runs[0].workspace_id, "default");
        assert.equal(alphaRunsPayload.runs[0].project_id, "red");

        const betaRunsResponse = await fetch(`${apiBaseUrl}/runs`, { headers: betaHeaders });
        const betaRunsPayload = await betaRunsResponse.json() as any;
        assert.equal(betaRunsPayload.runs.length, 1);
        assert.equal(betaRunsPayload.runs[0].workspace_id, "default");
        assert.equal(betaRunsPayload.runs[0].project_id, "blue");

        const forbiddenCrossScopeRun = await fetch(`${apiBaseUrl}/runs/${encodeURIComponent(alphaRunPayload.run_id)}`, { headers: betaHeaders });
        assert.equal(forbiddenCrossScopeRun.status, 404);

        const reviewActionResponse = await fetch(`${apiBaseUrl}/runs/${encodeURIComponent(alphaRunPayload.run_id)}/review-actions`, {
          method: "POST",
          headers: alphaHeaders,
          body: JSON.stringify({
            reviewer_id: "spoofed-reviewer",
            action_type: "start_review",
            notes: "starting scoped review"
          })
        });
        const reviewActionPayload = await reviewActionResponse.json() as any;
        assert.equal(reviewActionResponse.status, 200);
        assert.equal(reviewActionPayload.action.reviewer_id, "alice");
        assert.equal(reviewActionPayload.workflow.workspace_id, "default");
        assert.equal(reviewActionPayload.workflow.project_id, "red");

        const persistedAlphaRun = await getPersistedRun(alphaRunPayload.run_id, { rootDir: LocalRoot, dbMode: "local" });
        const persistedBetaRun = await getPersistedRun(betaRunPayload.run_id, { rootDir: LocalRoot, dbMode: "local" });
        assert.equal(persistedAlphaRun?.workspace_id, "default");
        assert.equal(persistedAlphaRun?.project_id, "red");
        assert.equal(persistedAlphaRun?.requested_by, "alice");
        assert.equal(persistedBetaRun?.workspace_id, "default");
        assert.equal(persistedBetaRun?.project_id, "blue");
        assert.equal(persistedBetaRun?.requested_by, "bob");
      } finally {
        await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
      }
      });
    });
  });
}

async function testValidateFixturesPassesForBundledTargets(): Promise<void> {
  await withTempDir("harness-validate-fixtures-", async (rootDir) => {
    const sharedLocalRoot = path.join(rootDir, "shared-local-db");
    await withEnv({
      HARNESS_LOCAL_DB_ROOT: sharedLocalRoot,
      HARNESS_DISABLE_LOCAL_BINARIES: "1",
      HARNESS_DISABLE_PYTHON_WORKERS: "1",
      AUDIT_LLM_MODEL: "gpt-5.6-sol"
    }, async () => {
      const summary = await validateFixtures({
        rootDir: path.resolve(process.cwd(), "fixtures", "validation-targets"),
        auditPackage: "agentic-static",
        dbMode: "local",
        llmProvider: "mock"
      });

      assert.equal(summary.selected_fixtures, 5);
      assert.equal(summary.failed_fixtures, 0);
      assert.equal(summary.passed_fixtures, 5);
      assert.equal(await fs.stat(path.join(sharedLocalRoot, "harness.sqlite")).then(() => true).catch(() => false), false);
    });
  });
}

async function testProductBenchmarkSuiteDryRun(): Promise<void> {
  await withTempDir("harness-product-benchmark-", async (rootDir) => {
    const suite = await loadBenchmarkSuite("ai-agent-static-v1");
    const defaultCases = selectBenchmarkCases(suite, {});
    const extendedCases = selectBenchmarkCases(suite, { includeExtended: true });
    assert.equal(suite.suite_id, "ai-agent-static-v1");
    assert.ok(defaultCases.some((item) => item.id === "pi-agent-static"));
    assert.ok(defaultCases.some((item) => item.id === "mcp-servers-static"));
    assert.ok(!defaultCases.some((item) => item.tier === "extended"));
    assert.ok(extendedCases.some((item) => item.id === "crewai-static"));

    const summary = await runBenchmarkSuite({
      suitePath: "ai-agent-static-v1",
      outputDir: rootDir,
      execute: false
    });
    assert.equal(summary.executed, false);
    assert.equal(summary.selected_cases, defaultCases.length);
    assert.equal(summary.failed_cases, 0);
    assert.equal(summary.dry_run_cases, defaultCases.length);
    assert.ok(summary.report_path);
    const report = JSON.parse(await fs.readFile(summary.report_path!, "utf8")) as any;
    assert.equal(report.suite_id, "ai-agent-static-v1");
    assert.equal(report.results.length, defaultCases.length);
    assert.equal(report.results.every((item: any) => item.verdict === "dry_run"), true);
    assert.equal(report.finding_summary_schema_version, "2026-08-19.benchmark-finding-summary.v1");
    assert.equal(report.scoring_summary_schema_version, "2026-08-19.benchmark-scoring-summary.v1");
    assert.equal(report.evidence_plan_summary_schema_version, "2026-08-19.benchmark-evidence-plan-summary.v1");
    assert.equal(report.results.every((item: any) => Array.isArray(item.finding_summaries) && item.finding_summaries.length === 0), true);
    assert.equal(report.results.every((item: any) => Array.isArray(item.control_summaries) && item.control_summaries.length === 0), true);
    assert.equal(report.results.every((item: any) => Array.isArray(item.dimension_score_summaries) && item.dimension_score_summaries.length === 0), true);
    assert.equal(report.results.every((item: any) => item.evidence_plan === null), true);
  });
}

async function testExportCompatibilityContract(): Promise<void> {
  const current = buildTethermarkExportEnvelope({
    schemaName: "executive_summary.v1",
    tethermarkVersion: "0.2.0",
    generatedAt: "2026-08-20T00:00:00.000Z",
    payload: { run_id: "run_compatibility" }
  });
  assert.equal(current.schema_version, "1.0.0");
  assert.equal(current.compatibility.contract, "executive_summary.v1");
  assert.equal(current.compatibility.major_version, 1);
  assert.equal(current.compatibility.minimum_reader_schema_version, "1.0.0");
  assert.equal(current.compatibility.policy, "same-major-additive");
  assert.equal(isCompatibleExportEnvelope(current, { schemaName: "executive_summary.v1" }), true);

  const legacyV1Envelope = {
    schema_name: "executive_summary.v1",
    schema_version: "1.0.0",
    generated_at: "2026-04-17T00:00:00.000Z",
    tethermark_version: "0.1.0",
    payload: { run_id: "run_legacy" }
  };
  assert.equal(isCompatibleExportEnvelope(legacyV1Envelope, { schemaName: "executive_summary.v1" }), true);
  assert.equal(isCompatibleExportEnvelope({ ...legacyV1Envelope, schema_version: "1.9.0", additive_field: true }, { schemaName: "executive_summary.v1" }), true);
  assert.equal(isCompatibleExportEnvelope({ ...legacyV1Envelope, schema_version: "2.0.0" }, { schemaName: "executive_summary.v1" }), false);
  assert.equal(isCompatibleExportEnvelope({ ...legacyV1Envelope, schema_name: "run_comparison.v1" }, { schemaName: "executive_summary.v1" }), false);
}

async function testFixedCalibrationEvidencePlanIsDeterministic(): Promise<void> {
  const request = {
    run_mode: "static",
    hints: { benchmark: { evidence_plan_policy_version: CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION } }
  } as any;
  const plannerArtifact = {
    applicable_control_ids: ["control.b", "unknown.control", "control.a", "control.b"]
  } as any;
  const controlCatalog = [
    { control_id: "control.a" },
    { control_id: "control.b" }
  ] as any;

  const first = buildFixedCalibrationEvidenceSelection({ request, plannerArtifact, controlCatalog });
  const second = buildFixedCalibrationEvidenceSelection({ request, plannerArtifact, controlCatalog });
  assert.deepEqual(first, second);
  assert.deepEqual(first?.baseline_tools, [...CALIBRATION_STATIC_EVIDENCE_PROVIDER_IDS]);
  assert.deepEqual(first?.runtime_tools, []);
  assert.deepEqual(first?.control_tool_map.map((mapping) => mapping.control_id), ["control.a", "control.b"]);
  assert.equal(first?.control_tool_map.every((mapping) => JSON.stringify(mapping.tools) === JSON.stringify(CALIBRATION_STATIC_EVIDENCE_PROVIDER_IDS)), true);
  assert.deepEqual(resolveAssessmentEvidenceProviderIds({
    request,
    runPlanProviderIds: ["repo_analysis", "scorecard", "semgrep", "trivy"],
    requestedOverrideIds: ["repo_analysis"]
  }), [...CALIBRATION_STATIC_EVIDENCE_PROVIDER_IDS], "supervisor correction must not narrow the fixed calibration provider set");
  assert.equal(buildFixedCalibrationEvidenceSelection({ request: { run_mode: "static" }, plannerArtifact, controlCatalog }), null);
  assert.throws(() => buildFixedCalibrationEvidenceSelection({
    request: { run_mode: "static", hints: { benchmark: { evidence_plan_policy_version: "unknown-policy" } } },
    plannerArtifact,
    controlCatalog
  }), /Unsupported calibration evidence-plan policy version/);
}

async function testBenchmarkFindingSummariesAreReviewableAndRedacted(): Promise<void> {
  await withEnv({ BENCHMARK_TEST_SECRET: "benchmark-secret-value-123456" }, async () => {
    const summaries = buildBenchmarkFindingSummaries({
      findings: [{
        finding_id: "finding_reviewable",
        title: "Runtime exploit reproduced with sk-testcredential123",
        severity: "high",
        category: "agent_guardrails",
        description: `The model claimed execution. password=benchmark-secret-value-123456 ${os.homedir()}\\private.txt`,
        evidence: ["src/agent.ts:42", "Bearer abcdefghijklmnopqrstuvwxyz"],
        public_safe: false,
        confidence: 0.71,
        score_impact: 12,
        source: "agent_synthesis",
        control_ids: ["owasp_agentic.tool_misuse_boundary"],
        standards_refs: []
      }],
      finding_quality: {
        run_id: "run_reviewable",
        generated_at: "2026-08-19T00:00:00.000Z",
        overall_verdict: "fail",
        validated_count: 0,
        plausible_count: 0,
        weak_count: 0,
        unsupported_count: 1,
        wrong_control_count: 0,
        missing_control_count: 0,
        blocking_count: 1,
        findings: [{
          finding_id: "finding_reviewable",
          title: "Runtime exploit reproduced",
          evidence_support_verdict: "unsupported",
          control_mapping_verdict: "plausible",
          qa_blocking: true,
          integrity_blocking: true,
          quality_score: 20,
          matched_evidence_ids: [],
          missing_evidence_refs: [],
          unsupported_claims: ["Runtime execution is claimed without runtime evidence."],
          claimed_control_ids: ["owasp_agentic.tool_misuse_boundary"],
          recommended_control_ids: [],
          control_mappings: [],
          reasons: ["Static evidence does not demonstrate execution."],
          next_action: "downgrade_or_reword"
        }]
      }
    } as any);

    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.integrity.evidence_support_verdict, "unsupported");
    assert.equal(summaries[0]?.integrity.integrity_blocking, true);
    assert.deepEqual(summaries[0]?.evidence, ["src/agent.ts:42", "[redacted-credential]"]);
    const serialized = JSON.stringify(summaries);
    assert.doesNotMatch(serialized, /benchmark-secret-value-123456/);
    assert.doesNotMatch(serialized, /sk-testcredential123/);
    assert.doesNotMatch(serialized, new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  });
}

async function testBenchmarkScoringSummariesAreReviewableAndRedacted(): Promise<void> {
  await withEnv({ BENCHMARK_TEST_SECRET: "benchmark-scoring-secret-123456" }, async () => {
    const summaries = buildBenchmarkScoringSummaries({
      control_results: [{
        control_id: "slsa.pinned_build_dependencies",
        framework: "SLSA",
        standard_ref: "SLSA / Build L3",
        title: "Pin build dependencies",
        applicability: "applicable",
        assessability: "static_assessable",
        status: "partial",
        score_weight: 10,
        max_score: 10,
        score_awarded: 4,
        rationale: ["password=benchmark-scoring-secret-123456 requires review"],
        evidence: [`${os.homedir()}\\workflow.yml:12`, "Bearer abcdefghijklmnopqrstuvwxyz"],
        finding_ids: ["finding_build_integrity"],
        sources: ["repo_analysis"]
      }],
      dimension_scores: [{
        dimension: "build_integrity",
        score: 4,
        max_score: 10,
        percentage: 40,
        weight: 0.3,
        assessed_controls: 1,
        applicable_controls: 1,
        control_ids: ["slsa.pinned_build_dependencies"],
        frameworks: ["SLSA"]
      }]
    } as any);

    assert.equal(summaries.controls[0]?.score_unawarded, 6);
    assert.equal(summaries.controls[0]?.awarded_percentage, 40);
    assert.equal(summaries.dimensions[0]?.weighted_contribution, 12);
    const serialized = JSON.stringify(summaries);
    assert.doesNotMatch(serialized, /benchmark-scoring-secret-123456/);
    assert.doesNotMatch(serialized, /Bearer abcdefghijklmnopqrstuvwxyz/);
    assert.doesNotMatch(serialized, new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  });
}

async function testStaticRuntimeClaimDetectionHandlesNegation(): Promise<void> {
  assert.equal(containsAffirmativeRuntimeClaim(
    "Build or workflow dependencies are not pinned strongly enough",
    "The evidence does not establish compromise or runtime impact, neither of which is claimed."
  ), false);
  assert.equal(containsAffirmativeRuntimeClaim(
    "Static boundary review",
    "No runtime execution was performed; exploitability was not established."
  ), false);
  assert.equal(containsAffirmativeRuntimeClaim(
    "Runtime exploit reproduced",
    "The issue was executed at runtime and permits RCE."
  ), true);
  assert.equal(containsAffirmativeRuntimeClaim(
    "Tool boundary",
    "Static inspection proves the path is exploitable and permits privilege escalation."
  ), true);
}

async function testCalibrationBenchmarkMetricsAndComparisonGuards(): Promise<void> {
  await withTempDir("harness-calibration-benchmark-", async (rootDir) => {
    const suite = await loadBenchmarkSuite("community-fixture-calibration-v1");
    assert.equal(suite.cases.length, 4);
    assert.deepEqual(new Set(suite.cases.map((item) => item.target_family)), new Set(["ordinary", "runnable", "agentic", "mcp"]));
    assert.deepEqual(new Set(suite.cases.map((item) => item.posture)), new Set(["good", "mixed", "risky"]));

    await assert.rejects(() => runBenchmarkSuite({
      suitePath: "community-fixture-calibration-v1",
      caseId: "runnable-mixed",
      outputDir: rootDir,
      execute: true,
      llmProvider: "mock"
    }), /benchmark_operator_required/);

    const summary = await withEnv({
      HARNESS_DISABLE_LOCAL_BINARIES: "1",
      HARNESS_DISABLE_PYTHON_WORKERS: "1"
    }, () => runBenchmarkSuite({
      suitePath: "community-fixture-calibration-v1",
      caseId: "runnable-mixed",
      outputDir: rootDir,
      execute: true,
      llmProvider: "mock",
      llmModel: "mock-agent-runtime",
      requestedBy: "calibration-benchmark-reviewer"
    }));
    const result = summary.results[0]!;
    assert.equal(result.passed, true, result.issues.join("; "));
    assert.equal(result.citation_coverage, 1);
    assert.equal(result.control_traceability, 1);
    assert.equal(result.duplicate_group_count, 0);
    assert.equal(result.conflict_pair_count, 0);
    assert.equal(result.version_manifest?.prompt_set_version, "2026-08-26.agent-context.v3");
    assert.equal(result.version_manifest?.model_identities[0]?.model, "mock-agent-runtime");
    assert.equal(result.evidence_plan?.policy_version, CALIBRATION_EVIDENCE_PLAN_POLICY_VERSION);
    assert.deepEqual(result.evidence_plan?.baseline_provider_ids, [...CALIBRATION_STATIC_EVIDENCE_PROVIDER_IDS].sort((left, right) => left.localeCompare(right)));
    assert.equal(CALIBRATION_STATIC_EVIDENCE_PROVIDER_IDS.every((providerId) => result.evidence_plan?.attempted_provider_ids.includes(providerId)), true);
    assert.equal(result.evidence_plan?.control_tool_map.every((mapping) => mapping.provider_ids.length === CALIBRATION_STATIC_EVIDENCE_PROVIDER_IDS.length), true);

    const baseline = JSON.parse(JSON.stringify(summary)) as any;
    delete baseline.report_path;
    baseline.results[0].human_reviewed_labels = true;
    const baselinePath = path.join(rootDir, "reviewed-baseline.json");
    const currentPath = path.join(rootDir, "reviewed-current.json");
    await fs.writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    await fs.writeFile(currentPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    const comparable = await compareBenchmarkReports({ baselinePath, currentPath });
    assert.equal(comparable.comparison_allowed, true, comparable.issues.join("; "));
    assert.equal(comparable.passed, true, comparable.issues.join("; "));

    const planMismatch = JSON.parse(JSON.stringify(baseline)) as any;
    planMismatch.results[0].evidence_plan.baseline_provider_ids.pop();
    await fs.writeFile(currentPath, `${JSON.stringify(planMismatch, null, 2)}\n`, "utf8");
    const blockedPlanComparison = await compareBenchmarkReports({ baselinePath, currentPath });
    assert.equal(blockedPlanComparison.comparison_allowed, false);
    assert.ok(blockedPlanComparison.issues.some((item) => item.includes("evidence plan mismatch")));

    const repeatDrift = JSON.parse(JSON.stringify(baseline)) as any;
    repeatDrift.results[0].static_score += 2;
    repeatDrift.results[0].finding_count += 1;
    repeatDrift.results[0].finding_categories.push("repeat_only_category");
    await fs.writeFile(currentPath, `${JSON.stringify(repeatDrift, null, 2)}\n`, "utf8");
    const repeatVariance = await analyzeBenchmarkVariance({ reportPaths: [baselinePath, currentPath] });
    assert.equal(repeatVariance.analysis_allowed, true, repeatVariance.issues.join("; "));
    assert.equal(repeatVariance.passed, false);
    assert.equal(repeatVariance.cases[0]?.comparison_kind, "repeat_run");
    assert.equal(repeatVariance.cases[0]?.finding_count_spread, 1);
    assert.ok(repeatVariance.cases[0]?.issues.some((item) => item.includes("repeat-run score spread")));
    assert.ok(repeatVariance.cases[0]?.drift.some((item) => item.includes("finding categories differ")));

    const incompatible = JSON.parse(JSON.stringify(baseline)) as any;
    incompatible.results[0].audit_package = "agentic-static";
    await fs.writeFile(currentPath, `${JSON.stringify(incompatible, null, 2)}\n`, "utf8");
    const blocked = await compareBenchmarkReports({ baselinePath, currentPath });
    assert.equal(blocked.comparison_allowed, false);
    assert.ok(blocked.issues.some((item) => item.includes("audit package mismatch")));

    const alternateModel = JSON.parse(JSON.stringify(baseline)) as any;
    alternateModel.results[0].version_manifest.model_identities[0].model = "alternate-calibration-model";
    alternateModel.results[0].static_score += 2;
    await fs.writeFile(currentPath, `${JSON.stringify(alternateModel, null, 2)}\n`, "utf8");
    const variance = await analyzeBenchmarkVariance({ reportPaths: [baselinePath, currentPath] });
    assert.equal(variance.analysis_allowed, true, variance.issues.join("; "));
    assert.equal(variance.passed, true, variance.cases.flatMap((item) => item.issues).join("; "));
    assert.equal(variance.cases[0]?.score_spread, 2);
    assert.equal(variance.cases[0]?.comparison_kind, "cross_model");

    alternateModel.results[0].pinned_commit = "different-commit";
    await fs.writeFile(currentPath, `${JSON.stringify(alternateModel, null, 2)}\n`, "utf8");
    const blockedVariance = await analyzeBenchmarkVariance({ reportPaths: [baselinePath, currentPath] });
    assert.equal(blockedVariance.analysis_allowed, false);
    assert.ok(blockedVariance.issues.some((item) => item.includes("target or audit configuration mismatch")));
  });
}

async function testExternalAdvisoryGroundTruthBenchmark(): Promise<void> {
  await withTempDir("harness-external-ground-truth-", async (rootDir) => {
    const suite = await loadBenchmarkSuite("external-reviewed-agentic-v1");
    assert.equal(suite.cases.length, 8);
    const vulnerable = suite.cases.find((item) => item.external_ground_truth?.source.source_id === "GHSA-3q26-f695-pp76" && item.external_ground_truth.target_state === "vulnerable")!;
    const fixed = suite.cases.find((item) => item.external_ground_truth?.source.source_id === "GHSA-3q26-f695-pp76" && item.external_ground_truth.target_state === "fixed")!;
    assert.equal(vulnerable.pinned_commit, "f30169ec3a2520990e5467c19ef42ea7d6d9270e");
    assert.equal(fixed.pinned_commit, "0dbd6995ccdf76ab770b58013034365b2d06c4d9");
    assert.equal(vulnerable.external_ground_truth?.source.source_id, "GHSA-3q26-f695-pp76");
    const pathTraversalVulnerable = suite.cases.find((item) => item.external_ground_truth?.source.source_id === "GHSA-vjqx-cfc4-9h6v" && item.external_ground_truth.target_state === "vulnerable")!;
    const pathTraversalFixed = suite.cases.find((item) => item.external_ground_truth?.source.source_id === "GHSA-vjqx-cfc4-9h6v" && item.external_ground_truth.target_state === "fixed")!;
    assert.equal(pathTraversalVulnerable.pinned_commit, "dcb47d2d94a3a33340053d2df550ae68d2795a3f");
    assert.equal(pathTraversalFixed.pinned_commit, "db96050800ab1eca4054c9f36918da8dba0832b4");
    const fileReadVulnerable = suite.cases.find((item) => item.external_ground_truth?.source.source_id === "GHSA-rhm9-gp5p-5248" && item.external_ground_truth.target_state === "vulnerable")!;
    const fileReadFixed = suite.cases.find((item) => item.external_ground_truth?.source.source_id === "GHSA-rhm9-gp5p-5248" && item.external_ground_truth.target_state === "fixed")!;
    assert.equal(fileReadVulnerable.pinned_commit, "7d77024cb8f9cfd39a6468de9534e58dcfa69f49");
    assert.equal(fileReadFixed.pinned_commit, "dcfa7ad3e819002c0213a592ad726ccfd9e2bf0c");
    const missingAuthVulnerable = suite.cases.find((item) => item.external_ground_truth?.source.source_id === "GHSA-rvqx-wpfh-mfx7" && item.external_ground_truth.target_state === "vulnerable")!;
    const missingAuthFixed = suite.cases.find((item) => item.external_ground_truth?.source.source_id === "GHSA-rvqx-wpfh-mfx7" && item.external_ground_truth.target_state === "fixed")!;
    assert.equal(missingAuthVulnerable.pinned_commit, "e1ee081d3223bd2150425ddb9487b5e9f4ccff26");
    assert.equal(missingAuthFixed.pinned_commit, "faac4db133de32fcb6d483fa9ff52f40ce42bdc0");

    const knownFinding = {
      finding_id: "finding_cve_2025_53107",
      title: "MCP git tool command boundary permits shell injection",
      severity: "high",
      category: "agent_permission_boundary",
      description: "Caller-controlled tool arguments reach a shell command.",
      evidence: ["src/mcp-server/tools/gitInit/logic.ts: command interpolation"],
      public_safe: true,
      confidence: 0.98,
      score_impact: 10,
      source: "tool",
      control_ids: ["harness_internal.agent_permission_boundaries", "owasp_agentic.tool_misuse_boundary", "mitre_atlas.tool_misuse_mitigation"],
      standards_refs: []
    } as any;
    const controlResults = [
      { control_id: "harness_internal.agent_permission_boundaries", status: "fail" },
      { control_id: "owasp_agentic.tool_misuse_boundary", status: "fail" },
      { control_id: "mitre_atlas.tool_misuse_mitigation", status: "partial" }
    ] as any;

    const detected = evaluateExternalGroundTruth(vulnerable, { findings: [knownFinding], control_results: controlResults } as any)!;
    assert.equal(detected.passed, true, detected.issues.join("; "));
    assert.equal(detected.match_count, 1);
    assert.equal(detected.false_negative_rate, 0);

    const missed = evaluateExternalGroundTruth(vulnerable, { findings: [], control_results: controlResults } as any)!;
    assert.equal(missed.passed, false);
    assert.equal(missed.false_negative_rate, 1);

    const remediated = evaluateExternalGroundTruth(fixed, { findings: [], control_results: controlResults } as any)!;
    assert.equal(remediated.passed, true, remediated.issues.join("; "));
    assert.equal(remediated.false_positive_rate, 0);

    const persisted = evaluateExternalGroundTruth(fixed, { findings: [knownFinding], control_results: controlResults } as any)!;
    assert.equal(persisted.passed, false);
    assert.equal(persisted.false_positive_rate, 1);

    const dryRun = await runBenchmarkSuite({ suitePath: "external-reviewed-agentic-v1", outputDir: rootDir, execute: false });
    assert.equal(dryRun.selected_cases, 8);
    assert.equal(dryRun.results.every((item) => item.ground_truth_eligible), true);
    assert.equal(dryRun.results.every((item) => !item.human_reviewed_labels), true);
  });
}

async function testProductBenchmarkApiEndpoints(): Promise<void> {
  await withTempDir("harness-product-benchmark-api-", async (rootDir) => {
    await withEnv({
      HARNESS_BENCHMARK_REPORT_ROOT: path.join(rootDir, "reports")
    }, async () => {
      const apiServer = createApiServer();
      await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
      try {
        const address = apiServer.address();
        assert.equal(typeof address, "object");
        const apiBaseUrl = `http://127.0.0.1:${(address as any).port}`;

        const suitesResponse = await fetch(`${apiBaseUrl}/benchmarks/suites`);
        const suitesPayload = await suitesResponse.json() as any;
        assert.equal(suitesResponse.status, 200);
        assert.equal(suitesPayload.suites.some((item: any) => item.suite_id === "ai-agent-static-v1"), true);
        assert.equal(suitesPayload.suites.some((item: any) => item.suite_id === "community-fixture-calibration-v1"), true);
        assert.equal(suitesPayload.suites.some((item: any) => item.suite_id === "external-reviewed-agentic-v1"), true);

        const suiteResponse = await fetch(`${apiBaseUrl}/benchmarks/suites/ai-agent-static-v1`);
        const suitePayload = await suiteResponse.json() as any;
        assert.equal(suiteResponse.status, 200);
        assert.equal(suitePayload.suite.suite_id, "ai-agent-static-v1");
        assert.ok(suitePayload.suite.cases.length >= 4);

        const runResponse = await fetch(`${apiBaseUrl}/benchmarks/suites/ai-agent-static-v1/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ case_id: "pi-agent-static", execute: false })
        });
        const runPayload = await runResponse.json() as any;
        assert.equal(runResponse.status, 200, JSON.stringify(runPayload));
        assert.equal(runPayload.benchmark_summary.selected_cases, 1);
        assert.equal(runPayload.benchmark_summary.dry_run_cases, 1);
        assert.equal(runPayload.reports.length, 1);

        const reportsResponse = await fetch(`${apiBaseUrl}/benchmarks/reports`);
        const reportsPayload = await reportsResponse.json() as any;
        assert.equal(reportsResponse.status, 200);
        assert.equal(reportsPayload.reports.length, 1);

        const fileName = reportsPayload.reports[0].file_name;
        const reportResponse = await fetch(`${apiBaseUrl}/benchmarks/reports/${encodeURIComponent(fileName)}`);
        const reportPayload = await reportResponse.json() as any;
        assert.equal(reportResponse.status, 200);
        assert.equal(reportPayload.report.selected_cases, 1);

        const compareResponse = await fetch(`${apiBaseUrl}/benchmarks/compare`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseline: fileName, current: fileName })
        });
        const comparePayload = await compareResponse.json() as any;
        assert.equal(compareResponse.status, 200, JSON.stringify(comparePayload));
        assert.equal(comparePayload.comparison.passed, false);
        assert.equal(comparePayload.comparison.comparison_allowed, false);
      } finally {
        await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
      }
    });
  });
}

async function testLocalBinaryProvidersShortCircuitWhenSpawnBlocked(): Promise<void> {
  await withTempDir("harness-local-binary-blocked-", async (rootDir) => {
    process.env.HARNESS_DISABLE_LOCAL_BINARIES = "1";
    resetEvidenceProviderCapabilityCacheForTests();
    try {
      const semgrep = await executeEvidenceProvider({
        providerId: "semgrep",
        request: {
          local_path: rootDir,
          run_mode: "static",
          audit_package: "deep-static",
          llm_provider: "mock"
        },
        rootPath: rootDir,
        repoUrl: null
      });

      const trivy = await executeEvidenceProvider({
        providerId: "trivy",
        request: {
          local_path: rootDir,
          run_mode: "static",
          audit_package: "deep-static",
          llm_provider: "mock"
        },
        rootPath: rootDir,
        repoUrl: null
      });

      assert.equal(semgrep.status, "skipped");
      assert.equal(semgrep.failure_category, "sandbox_blocked");
      assert.equal(semgrep.capability_status, "blocked");
      assert.match(semgrep.summary, /HARNESS_DISABLE_LOCAL_BINARIES/);
      assert.equal(trivy.status, "skipped");
      assert.equal(trivy.failure_category, "sandbox_blocked");
      assert.equal(trivy.capability_status, "blocked");
      assert.match(trivy.summary, /HARNESS_DISABLE_LOCAL_BINARIES/);
    } finally {
      delete process.env.HARNESS_DISABLE_LOCAL_BINARIES;
      resetEvidenceProviderCapabilityCacheForTests();
    }
  });
}

async function testPythonWorkerProvidersReportBlockedWhenDisabled(): Promise<void> {
  await withTempDir("harness-python-worker-blocked-", async (rootDir) => {
    process.env.HARNESS_DISABLE_PYTHON_WORKERS = "1";
    resetPythonWorkerCapabilityCacheForTests();
    try {
      const preflight = await buildPreflightSummary({
        endpoint_url: "https://example.com/agent",
        run_mode: "runtime",
        audit_package: "runtime-validated",
        llm_provider: "mock"
      });

      const inspect = await executeEvidenceProvider({
        providerId: "inspect",
        request: {
          endpoint_url: "https://example.com/agent",
          run_mode: "runtime",
          audit_package: "runtime-validated",
          llm_provider: "mock"
        },
        rootPath: rootDir,
        repoUrl: null
      });

      const compatibilityAlias = await executeEvidenceProvider({
        providerId: "internal_python_worker",
        request: {
          endpoint_url: "https://example.com/agent",
          run_mode: "validate",
          audit_package: "runtime-validated",
          llm_provider: "mock"
        },
        rootPath: rootDir,
        repoUrl: null
      });

      assert.equal(preflight.provider_readiness.find((item) => item.provider_id === "inspect")?.status, "blocked");
      assert.equal(preflight.provider_readiness.find((item) => item.provider_id === "garak")?.status, "blocked");
      assert.equal(preflight.provider_readiness.find((item) => item.provider_id === "pyrit")?.status, "blocked");
      assert.ok(preflight.readiness.warnings.some((item) => /Python worker adapters are unavailable/i.test(item)));

      assert.equal(inspect.status, "skipped");
      assert.equal(inspect.failure_category, "sandbox_blocked");
      assert.equal(inspect.capability_status, "blocked");
      assert.match(inspect.summary, /HARNESS_DISABLE_PYTHON_WORKERS/);

      assert.equal(compatibilityAlias.status, "skipped");
      assert.equal(compatibilityAlias.failure_category, "sandbox_blocked");
      assert.equal(compatibilityAlias.capability_status, "blocked");
      assert.equal(compatibilityAlias.tool, "pyrit");
    } finally {
      delete process.env.HARNESS_DISABLE_PYTHON_WORKERS;
      resetPythonWorkerCapabilityCacheForTests();
    }
  });
}

async function testRepoAnalysisProviderEmitsNormalizedLocations(): Promise<void> {
  await withTempDir("harness-repo-analysis-provider-", async (rootDir) => {
    const repoAnalysis = await executeEvidenceProvider({
      providerId: "repo_analysis",
      request: {
        local_path: rootDir,
        run_mode: "static",
        audit_package: "deep-static",
        llm_provider: "mock"
      },
      rootPath: rootDir,
      repoUrl: null,
      analysisSummary: {
        analysis: {
          project_name: "repo-analysis-target",
          file_count: 12,
          languages: ["typescript"],
          frameworks: [],
          package_ecosystems: ["npm"],
          package_managers: ["npm"],
          dependency_manifests: ["package.json"],
          lockfiles: ["package-lock.json"],
          ci_workflows: [".github/workflows/ci.yml"],
          security_docs: ["SECURITY.md"],
          release_files: ["CHANGELOG.md"],
          container_files: ["Dockerfile"],
          entry_points: ["src/server.ts"],
          mcp_indicators: [],
          agent_indicators: [],
          tool_execution_indicators: []
        },
        repoContext: {
          summary: [],
          capability_signals: ["repo_posture_only"],
          documents: []
        }
      }
    });
    assert.equal(repoAnalysis.status, "completed");
    assert.equal(repoAnalysis.normalized?.result_type, "repo_analysis");
    assert.equal(Array.isArray(repoAnalysis.normalized?.locations), true);
    assert.equal(repoAnalysis.normalized?.locations?.some((item: any) => item.path === "package.json" && item.label === "manifest"), true);
    assert.equal(repoAnalysis.normalized?.locations?.some((item: any) => item.path === ".github/workflows/ci.yml" && item.label === "ci_workflow"), true);
    assert.equal(repoAnalysis.normalized?.locations?.some((item: any) => item.path === "SECURITY.md" && item.label === "security_doc"), true);
    assert.equal(repoAnalysis.normalized?.locations?.some((item: any) => item.path === "CHANGELOG.md" && item.label === "release_artifact"), true);
    assert.equal(repoAnalysis.normalized?.locations?.some((item: any) => item.path === "src/server.ts" && item.label === "entry_point"), true);
    assert.equal(repoAnalysis.normalized?.locations?.some((item: any) => item.symbol === "repo_posture_only" && item.label === "repo_capability"), true);
  });
}

async function testScorecardAndTrivyNormalizationEmitSymbolLocations(): Promise<void> {
  const scorecard = normalizeEvidenceSummaryForTests({
    providerId: "scorecard",
    parsed: {
      checks: [
        { name: "Code-Review", score: 8 },
        { name: "Pinned-Dependencies", score: 2 }
      ]
    }
  });
  assert.equal(scorecard.locations?.some((item: any) => item.symbol === "Code-Review" && item.label === "scorecard_check"), true);
  assert.equal(scorecard.locations?.some((item: any) => item.symbol === "Pinned-Dependencies" && item.label === "scorecard_check"), true);
  const scorecardWithDocs = normalizeEvidenceSummaryForTests({
    providerId: "scorecard",
    parsed: {
      checks: [
        { name: "Maintained", score: 10, documentation: { url: "https://example.test/scorecard/maintained" } }
      ]
    }
  });
  assert.equal(scorecardWithDocs.locations?.some((item: any) => item.uri === "https://example.test/scorecard/maintained" && item.label === "scorecard_documentation"), true);

  const trivy = normalizeEvidenceSummaryForTests({
    providerId: "trivy",
    parsed: {
      Results: [
        {
          Target: "package-lock.json",
          Type: "npm",
          Vulnerabilities: [
            {
              VulnerabilityID: "CVE-2026-0001",
              Severity: "HIGH",
              Class: "src/server.ts",
              PrimaryURL: "https://avd.aquasec.com/nvd/cve-2026-0001"
            }
          ],
          Misconfigurations: [
            {
              ID: "AVD-AWS-0001",
              Severity: "MEDIUM"
            }
          ]
        }
      ]
    }
  });
  assert.equal(trivy.locations?.some((item: any) => item.symbol === "CVE-2026-0001" && item.label === "trivy_rule"), true);
  assert.equal(trivy.locations?.some((item: any) => item.symbol === "AVD-AWS-0001" && item.label === "trivy_rule"), true);
  assert.equal(trivy.locations?.some((item: any) => item.path === "src/server.ts" && item.label === "CVE-2026-0001"), true);
  assert.equal(trivy.locations?.some((item: any) => item.uri === "https://avd.aquasec.com/nvd/cve-2026-0001" && item.label === "CVE-2026-0001"), true);
}

async function testRuntimeReadinessFixturePolicy(): Promise<void> {
  const sourceRoot = path.join(os.tmpdir(), "tethermark-runtime-policy-source");
  const outputRoot = path.join(os.tmpdir(), "tethermark-runtime-policy-output");
  const args = buildDockerRuntimeFixtureCreateArgs({
    containerName: "tethermark-runtime-policy-test",
    sourceRoot,
    outputRoot
  });
  assert.equal(args[0], "create");
  assert.equal(args.includes("--network") && args.includes("none"), true);
  assert.equal(args.includes("--read-only"), true);
  assert.equal(args.includes("--cap-drop") && args.includes("ALL"), true);
  assert.equal(args.includes("--security-opt") && args.includes("no-new-privileges"), true);
  assert.equal(args.includes("TETHERMARK_RUNTIME_BACKEND=docker"), true);
  assert.equal(args.includes(RUNTIME_FIXTURE_IMAGE), true);
  assert.equal(args.some((item) => item.startsWith("type=bind") && item.includes("target=/workspace") && item.endsWith(",readonly")), true);
  assert.equal(args.some((item) => item.startsWith("type=bind") && item.includes("target=/output") && !item.endsWith(",readonly")), true);
  const gvisorArgs = buildDockerRuntimeFixtureCreateArgs({
    containerName: "tethermark-runtime-policy-gvisor-test",
    sourceRoot,
    outputRoot,
    backend: "gvisor_container"
  });
  assert.equal(gvisorArgs.includes("--runtime") && gvisorArgs.includes("runsc"), true);

  const inspection = {
    Config: {
      Image: RUNTIME_FIXTURE_IMAGE,
      User: "65532:65532",
      Env: [
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "TETHERMARK_RUNTIME_FIXTURE=1",
        "TETHERMARK_RUNTIME_CREDENTIAL_MODE=synthetic",
        "TETHERMARK_FAKE_SECRET=tm_fake_runtime_validation_only"
      ]
    },
    HostConfig: {
      AutoRemove: false,
      CapDrop: ["ALL"],
      Init: true,
      Memory: 128 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      NetworkMode: "none",
      PidsLimit: 64,
      Privileged: false,
      ReadonlyRootfs: true,
      SecurityOpt: ["no-new-privileges"],
      Tmpfs: { "/tmp": "rw,noexec,nosuid,nodev,size=16777216" },
      Ulimits: [{ Name: "fsize", Soft: 1024 * 1024, Hard: 1024 * 1024 }]
    },
    Mounts: [
      { Destination: "/workspace", RW: false, Source: sourceRoot, Type: "bind" },
      { Destination: "/output", RW: true, Source: outputRoot, Type: "bind" }
    ]
  };
  const assertions = validateDockerRuntimeFixtureInspect(inspection, { sourceRoot, outputRoot });
  assert.equal(Object.values(assertions).every(Boolean), true, JSON.stringify(assertions));
  const gvisorAssertions = validateDockerRuntimeFixtureInspect({
    ...inspection,
    HostConfig: { ...inspection.HostConfig, Runtime: "runsc" }
  }, { sourceRoot, outputRoot, backend: "gvisor_container" });
  assert.equal(gvisorAssertions.selected_runtime_matches_backend, true);
  const podmanAssertions = validateDockerRuntimeFixtureInspect({
    ...inspection,
    EffectiveCaps: [],
    HostConfig: { ...inspection.HostConfig, CapDrop: null }
  }, { sourceRoot, outputRoot, backend: "rootless_podman" });
  assert.equal(podmanAssertions.capabilities_dropped, true);
  const secretAssertions = validateDockerRuntimeFixtureInspect({
    ...inspection,
    Config: { ...inspection.Config, Env: [...inspection.Config.Env, "OPENAI_API_KEY=must-not-pass"] }
  }, { sourceRoot, outputRoot });
  assert.equal(secretAssertions.no_real_secret_environment, false);
  const writableSourceAssertions = validateDockerRuntimeFixtureInspect({
    ...inspection,
    Mounts: [
      { Destination: "/workspace", RW: true, Source: sourceRoot, Type: "bind" },
      { Destination: "/output", RW: true, Source: outputRoot, Type: "bind" }
    ]
  }, { sourceRoot, outputRoot });
  assert.equal(writableSourceAssertions.source_mount_readonly, false);
}

async function testLinuxContainerSandboxBuildsExecutionPlan(): Promise<void> {
  await withTempDir("harness-container-plan-", async (rootDir) => {
    const sourceDir = path.join(rootDir, "source");
    const sandboxRoot = path.join(rootDir, "sandboxes");
    await fs.mkdir(path.join(sourceDir, "tests"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "package.json"), JSON.stringify({
      name: "runtime-target",
      private: true,
      scripts: {
        build: "node -e \"require('node:fs').writeFileSync('build.ok','yes')\"",
        test: "node -e \"require('node:fs').writeFileSync('test.ok','yes')\"",
        start: "node -e \"require('node:fs').writeFileSync('runtime.ok','yes')\""
      }
    }, null, 2));
    await fs.writeFile(path.join(sourceDir, "package-lock.json"), JSON.stringify({ name: "runtime-target", lockfileVersion: 3 }, null, 2));
    await fs.writeFile(path.join(sourceDir, "Dockerfile"), "FROM node:20-alpine\n");
    const backend = new LinuxContainerSandboxBackend(sandboxRoot);
    const sandbox = await backend.create("run_container_plan", {
        local_path: sourceDir,
        run_mode: "runtime",
        audit_package: "runtime-validated",
        llm_provider: "mock",
        hints: { runtime_sandbox: { execute_target: false } }
    });

      const executionPlan = sandbox.execution_plan;
      const executionResults = sandbox.execution_results;
      assert.ok(executionPlan);
      assert.ok(executionResults);
      assert.equal(executionPlan?.readiness_status, "ready");
      assert.equal(executionPlan?.detected_stack.includes("node"), true);
      assert.equal(executionPlan?.detected_stack.includes("dockerfile"), true);
      assert.equal(executionPlan?.steps.some((step) => step.adapter === "node_npm"), true);
      assert.equal(executionPlan?.steps.some((step) => step.adapter === "http_service"), true);
      assert.equal(executionPlan?.steps.some((step) => step.phase === "install" && step.command.join(" ") === "npm ci --ignore-scripts"), true);
      assert.equal(executionPlan?.steps.some((step) => step.phase === "build" && step.command.join(" ") === "npm run build"), true);
      assert.equal(executionPlan?.steps.some((step) => step.phase === "test" && step.command.slice(0, 3).join(" ") === "npm run test"), true);
      assert.equal(executionPlan?.steps.some((step) => step.phase === "runtime_probe" && step.command.join(" ") === "npm run start"), true);
      assert.equal(executionPlan?.steps.find((step) => step.step_id === "runtime-node")?.artifact_context?.stack, "node");
      assert.equal(executionPlan?.steps.find((step) => step.step_id === "runtime-node")?.artifact_context?.script_name, "start");
      assert.equal(sandbox.command_policy.allowed_command_prefixes.includes("npm ci --ignore-scripts"), true);
      assert.equal(sandbox.enforcement_notes.some((item) => /Derived 4 bounded execution step/.test(item)), true);
      assert.equal(sandbox.enforcement_notes.some((item) => /explicitly disabled/.test(item)), true);
      assert.equal(executionResults?.length, 4);
      assert.equal(executionResults?.every((item) => item.status === "completed" || item.status === "failed" || item.status === "blocked"), true);
      const buildResult = executionResults?.find((item) => item.step_id === "build-node") ?? null;
      const testResult = executionResults?.find((item) => item.step_id === "test-node") ?? null;
      const runtimeResult = executionResults?.find((item) => item.step_id === "runtime-node") ?? null;
      assert.ok(buildResult);
      assert.ok(testResult);
      assert.ok(runtimeResult);
      assert.equal(buildResult?.execution_runtime, "container");
      assert.equal(buildResult?.adapter, "node_npm");
      assert.equal(runtimeResult?.adapter, "http_service");
      assert.equal(buildResult?.normalized_artifact?.type, "build");
      assert.equal(runtimeResult?.normalized_artifact?.type, "runtime_probe");
      assert.equal(buildResult?.normalized_artifact?.details_json?.package_manager, "npm");
      assert.equal(runtimeResult?.normalized_artifact?.details_json?.artifact_role, "service_probe");
      assert.equal(buildResult?.duration_ms, undefined);
      assert.equal(buildResult?.status, "blocked");
      assert.equal(testResult?.status, "blocked");
      assert.equal(runtimeResult?.status, "blocked");
      assert.match(buildResult?.summary ?? "", /explicitly disabled/i);
      assert.equal(await pathExists(path.join(sandbox.target_dir, "build.ok")), false);
      assert.equal(await pathExists(path.join(sandbox.target_dir, "test.ok")), false);
      assert.equal(await pathExists(path.join(sandbox.target_dir, "runtime.ok")), false);

      const persistedPlan = JSON.parse(await fs.readFile(path.join(sandbox.root_dir, "artifacts", "execution-plan.json"), "utf8"));
      const persistedResults = JSON.parse(await fs.readFile(path.join(sandbox.root_dir, "artifacts", "execution-results.json"), "utf8"));
      assert.equal(persistedPlan.readiness_status, "ready");
      assert.equal(Array.isArray(persistedPlan.steps), true);
      assert.equal(persistedPlan.steps.length, 4);
      assert.equal(Array.isArray(persistedResults), true);
      assert.equal(persistedResults.length, 4);
      assert.ok(persistedResults.find((item: any) => item.step_id === "build-node"));
      assert.equal(persistedResults.find((item: any) => item.step_id === "build-node")?.execution_runtime, "container");
      assert.equal(persistedResults.find((item: any) => item.step_id === "build-node")?.normalized_artifact?.type, "build");
      assert.equal(persistedResults.find((item: any) => item.step_id === "runtime-node")?.adapter, "http_service");
      assert.equal(persistedPlan.steps.find((item: any) => item.step_id === "runtime-node")?.artifact_context?.script_name, "start");
      assert.equal(persistedResults.find((item: any) => item.step_id === "runtime-node")?.normalized_artifact?.details_json?.stack, "node");
  });
}

async function testPythonWorkerEnvironmentContract(): Promise<void> {
  assert.equal(isSupportedPythonWorkerVersion(parsePythonVersion("Python 3.11.9")), true);
  assert.equal(isSupportedPythonWorkerVersion(parsePythonVersion("3.13.2")), true);
  assert.equal(isSupportedPythonWorkerVersion(parsePythonVersion("Python 3.10.14")), false);
  assert.equal(isSupportedPythonWorkerVersion(parsePythonVersion("Python 3.14.0")), false);
  const lock = parsePythonWorkerLock([
    "packaging==26.3 \\",
    "    --hash=sha256:abc",
    "pip==26.2.1 \\",
    "    --hash=sha256:def"
  ].join("\n"));
  assert.deepEqual(lock, { packaging: "26.3", pip: "26.2.1" });

  await withTempDir("tethermark-python-worker-environment-", async (rootDir) => {
    const workerRoot = path.join(rootDir, "workers", "python");
    await fs.mkdir(workerRoot, { recursive: true });
    await fs.writeFile(path.join(workerRoot, "requirements.lock"), "pip==26.2.1 \\\n    --hash=sha256:def\n", "utf8");
    const inspection = inspectPythonWorkerEnvironment(rootDir);
    assert.equal(inspection.ready, false);
    assert.equal(inspection.lock_sha256?.length, 64);
    assert.ok(inspection.errors.some((item) => item.includes("virtual environment")));
  });

  await withTempDir("tethermark-python-worker-resolution-", async (rootDir) => {
    const originalPythonBin = process.env.PYTHON_BIN;
    const originalVenv = process.env.HARNESS_PYTHON_WORKER_VENV;
    try {
      delete process.env.HARNESS_PYTHON_WORKER_VENV;
      process.env.PYTHON_BIN = "bootstrap-python";
      const managed = pythonWorkerVenvExecutable(path.join(rootDir, ".tethermark", "python-worker"));
      await fs.mkdir(path.dirname(managed), { recursive: true });
      await fs.writeFile(managed, "", "utf8");
      assert.equal(resolvePythonWorkerExecutable(rootDir), managed);
    } finally {
      if (originalPythonBin === undefined) delete process.env.PYTHON_BIN;
      else process.env.PYTHON_BIN = originalPythonBin;
      if (originalVenv === undefined) delete process.env.HARNESS_PYTHON_WORKER_VENV;
      else process.env.HARNESS_PYTHON_WORKER_VENV = originalVenv;
    }
  });
}

async function testPythonWorkerExecutionLimitsAndInspectNormalization(): Promise<void> {
  assert.deepEqual(resolvePythonWorkerInvocationLimits(), {
    timeoutMs: PYTHON_WORKER_DEFAULT_TIMEOUT_MS,
    maxBufferBytes: PYTHON_WORKER_DEFAULT_OUTPUT_BYTES
  });
  assert.deepEqual(resolvePythonWorkerInvocationLimits({ timeoutMs: Number.MAX_SAFE_INTEGER, maxBufferBytes: Number.MAX_SAFE_INTEGER }), {
    timeoutMs: PYTHON_WORKER_MAX_TIMEOUT_MS,
    maxBufferBytes: PYTHON_WORKER_MAX_OUTPUT_BYTES
  });
  const normalized = normalizePythonWorkerForTests({
    status: "inconclusive",
    summary: "One bounded probe completed and one timed out.",
    target: "http://127.0.0.1:8788/agent",
    coverage: { status: "partial", attempted: 2, completed: 1, inconclusive: 1, errors: 0 },
    limitations: ["No runtime control may be marked passed from this result."],
    observations: [
      {
        outcome: "observed",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/agent", label: "baseline" }]
      },
      {
        outcome: "inconclusive",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/agent", label: "metadata" }]
      }
    ]
  }, "completed");
  assert.equal(normalized.signal_count, 2);
  assert.equal(normalized.issue_count, 0);
  assert.equal(normalized.warning_count, 1);
  assert.equal(normalized.error_count, 0);
  assert.equal(normalized.locations?.length, 2);
  assert.ok(normalized.notes.includes("coverage_status:partial"));
  assert.ok(normalized.notes.some((item) => /No runtime control may be marked passed/.test(item)));

  const finding = normalizePythonWorkerForTests({
    status: "completed",
    summary: "AI boundary probes completed.",
    target: "http://127.0.0.1:8788/v1/chat/completions",
    eval_pack: { id: "tethermark.inspect.ai-security-boundary", version: "1.0.0" },
    orchestrator_model_route: { provider: "openai_codex", credential_class: "chatgpt_session", model: "gpt-5.6-sol", used_by_pack: false },
    coverage: { status: "complete", attempted: 2, completed: 2, findings: 1, inconclusive: 0, errors: 0 },
    observations: [
      {
        outcome: "finding",
        severity: "high",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "secret" }]
      },
      {
        outcome: "no_finding_observed",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "tool" }]
      }
    ]
  }, "completed");
  assert.equal(finding.signal_count, 2);
  assert.equal(finding.issue_count, 1);
  assert.equal(finding.severity_counts.high, 1);
  assert.ok(finding.notes.includes("eval_pack:tethermark.inspect.ai-security-boundary@1.0.0"));
  assert.ok(finding.notes.includes("orchestrator_model_route:openai_codex/chatgpt_session"));

  const dataBoundary = normalizePythonWorkerForTests({
    status: "inconclusive",
    summary: "One AI data-boundary probe produced a finding and one was inconclusive.",
    target: "http://127.0.0.1:8788/v1/chat/completions",
    eval_pack: { id: "tethermark.inspect.ai-data-boundary", version: "1.0.0" },
    coverage: { status: "partial", attempted: 2, completed: 1, findings: 1, inconclusive: 1, errors: 0 },
    observations: [
      {
        outcome: "finding",
        severity: "high",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "indirect-exfiltration" }]
      },
      {
        outcome: "inconclusive",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "cross-session-memory" }]
      }
    ]
  }, "completed");
  assert.equal(dataBoundary.issue_count, 1);
  assert.equal(dataBoundary.warning_count, 1);
  assert.ok(dataBoundary.notes.includes("eval_pack:tethermark.inspect.ai-data-boundary@1.0.0"));
  assert.ok(dataBoundary.notes.includes("coverage_status:partial"));

  const mcpBoundary = normalizePythonWorkerForTests({
    status: "completed",
    summary: "Bounded MCP negative-call probes completed.",
    target: "http://127.0.0.1:8788/mcp",
    eval_pack: { id: "tethermark.inspect.mcp-boundary", version: "1.0.0" },
    coverage: { status: "complete", attempted: 3, completed: 3, findings: 2, inconclusive: 0, errors: 0 },
    observations: [
      {
        outcome: "no_finding_observed",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/mcp", label: "malformed-call" }]
      },
      {
        outcome: "finding",
        severity: "high",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/mcp", label: "repository-traversal" }]
      },
      {
        outcome: "finding",
        severity: "high",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/mcp", label: "cross-capability" }]
      }
    ]
  }, "completed");
  assert.equal(mcpBoundary.signal_count, 3);
  assert.equal(mcpBoundary.issue_count, 2);
  assert.equal(mcpBoundary.severity_counts.high, 2);
  assert.ok(mcpBoundary.notes.includes("eval_pack:tethermark.inspect.mcp-boundary@1.0.0"));

  const unsafeOutput = normalizePythonWorkerForTests({
    status: "completed",
    summary: "Bounded unsafe-output probes completed.",
    target: "http://127.0.0.1:8788/v1/chat/completions",
    eval_pack: { id: "tethermark.inspect.unsafe-output-boundary", version: "1.0.0" },
    coverage: { status: "complete", attempted: 2, completed: 2, findings: 1, inconclusive: 0, errors: 0 },
    observations: [
      {
        outcome: "finding",
        severity: "high",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "markup-forwarding" }]
      },
      {
        outcome: "no_finding_observed",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "command-sink" }]
      }
    ]
  }, "completed");
  assert.equal(unsafeOutput.signal_count, 2);
  assert.equal(unsafeOutput.issue_count, 1);
  assert.equal(unsafeOutput.severity_counts.high, 1);
  assert.ok(unsafeOutput.notes.includes("eval_pack:tethermark.inspect.unsafe-output-boundary@1.0.0"));

  const excessiveAgency = normalizePythonWorkerForTests({
    status: "completed",
    summary: "Bounded excessive-agency probes completed.",
    target: "http://127.0.0.1:8788/v1/chat/completions",
    eval_pack: { id: "tethermark.inspect.excessive-agency-boundary", version: "1.0.0" },
    coverage: { status: "complete", attempted: 2, completed: 2, findings: 1, inconclusive: 0, errors: 0 },
    observations: [
      {
        outcome: "finding",
        severity: "high",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "scope-escalation" }]
      },
      {
        outcome: "no_finding_observed",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "recursive-delegation" }]
      }
    ]
  }, "completed");
  assert.equal(excessiveAgency.signal_count, 2);
  assert.equal(excessiveAgency.issue_count, 1);
  assert.equal(excessiveAgency.severity_counts.high, 1);
  assert.ok(excessiveAgency.notes.includes("eval_pack:tethermark.inspect.excessive-agency-boundary@1.0.0"));

  const resourceLimits = normalizePythonWorkerForTests({
    status: "completed",
    summary: "Bounded resource-limit probes completed.",
    target: "http://127.0.0.1:8788/v1/chat/completions",
    eval_pack: { id: "tethermark.inspect.resource-limit-boundary", version: "1.0.0" },
    coverage: { status: "complete", attempted: 2, completed: 2, findings: 1, inconclusive: 0, errors: 0 },
    observations: [
      {
        outcome: "finding",
        severity: "high",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "completion-budget" }]
      },
      {
        outcome: "no_finding_observed",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "operation-budget" }]
      }
    ]
  }, "completed");
  assert.equal(resourceLimits.signal_count, 2);
  assert.equal(resourceLimits.issue_count, 1);
  assert.equal(resourceLimits.severity_counts.high, 1);
  assert.ok(resourceLimits.notes.includes("eval_pack:tethermark.inspect.resource-limit-boundary@1.0.0"));

  const garakFinding = normalizePythonWorkerForTests({
    status: "completed",
    summary: "Bounded Garak PromptInject probes completed.",
    target: "http://127.0.0.1:8788/v1/chat/completions",
    eval_pack: { id: "tethermark.garak.prompt-injection", version: "1.0.0" },
    coverage: { status: "complete", attempted: 2, completed: 2, findings: 1, inconclusive: 0, errors: 0 },
    observations: [
      {
        outcome: "finding",
        severity: "high",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "promptinject-ignore-say" }]
      },
      {
        outcome: "no_finding_observed",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "promptinject-nevermind" }]
      }
    ]
  }, "completed");
  assert.equal(garakFinding.issue_count, 1);
  assert.equal(garakFinding.severity_counts.high, 1);
  assert.ok(garakFinding.notes.includes("eval_pack:tethermark.garak.prompt-injection@1.0.0"));

  const pyritFinding = normalizePythonWorkerForTests({
    status: "completed",
    summary: "Bounded PyRIT adversarial boundary probes completed.",
    target: "http://127.0.0.1:8788/v1/chat/completions",
    eval_pack: { id: "tethermark.pyrit.adversarial-boundary", version: "1.0.0" },
    coverage: { status: "complete", attempted: 2, completed: 2, findings: 1, inconclusive: 0, errors: 0 },
    observations: [
      {
        outcome: "finding",
        severity: "high",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "pyrit-authorization-escalation" }]
      },
      {
        outcome: "no_finding_observed",
        severity: "info",
        evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/v1/chat/completions", label: "pyrit-sensitive-data-handling" }]
      }
    ]
  }, "completed");
  assert.equal(pyritFinding.issue_count, 1);
  assert.equal(pyritFinding.severity_counts.high, 1);
  assert.ok(pyritFinding.notes.includes("eval_pack:tethermark.pyrit.adversarial-boundary@1.0.0"));

  const notRun = normalizePythonWorkerForTests({
    status: "inconclusive",
    coverage: { status: "not_run", attempted: 0, completed: 0, inconclusive: 0, errors: 0 },
    observations: [],
    limitations: ["No runtime control may be marked passed from this result."]
  }, "completed");
  assert.equal(notRun.issue_count, 0);
  assert.equal(notRun.warning_count, 1);
}

async function testPythonWorkerFailurePathsNormalizeFailClosed(): Promise<void> {
  assert.deepEqual(resolvePythonWorkerRetryPolicy(), {
    maxAttempts: PYTHON_WORKER_DEFAULT_MAX_ATTEMPTS,
    retryDelayMs: 100
  });
  assert.equal(resolvePythonWorkerRetryPolicy({ maxAttempts: Number.MAX_SAFE_INTEGER }).maxAttempts, PYTHON_WORKER_MAX_ATTEMPTS);

  const controlIds = [
    "runtime.prompt_injection_resistance",
    "runtime.secret_retrieval_isolation",
    "runtime.tool_authorization_boundary"
  ];
  const completedPayload = {
    status: "completed",
    summary: "Bounded runtime probes completed.",
    eval_pack: { id: "tethermark.inspect.ai-security-boundary", version: "1.0.0" },
    limits: { probe_count: 2 },
    coverage: { status: "complete", attempted: 2, completed: 2, findings: 0, inconclusive: 0, errors: 0 },
    observations: [
      {
        observation_id: "inspect:prompt",
        probe_id: "prompt_injection",
        title: "Prompt injection boundary",
        outcome: "no_finding_observed",
        severity: "low",
        summary: "No finding was observed in the bounded prompt sample.",
        control_refs: ["runtime.prompt_injection_resistance"]
      },
      {
        observation_id: "inspect:tool",
        probe_id: "tool_authorization",
        title: "Tool authorization boundary",
        outcome: "no_finding_observed",
        severity: "low",
        summary: "No finding was observed in the bounded tool sample.",
        control_refs: ["runtime.tool_authorization_boundary"]
      }
    ],
    limitations: ["Bounded samples do not establish a control pass."]
  };
  const executionForResult = (result: Awaited<ReturnType<typeof runPythonWorkerAttemptsForTests>>) => ({
    tool: "inspect",
    provider_id: "inspect",
    provider_kind: "internal_plugin",
    status: result.status === "completed" ? "completed" : "failed",
    command: ["python-worker", "inspect"],
    exit_code: null,
    summary: `Worker result: ${result.status}`,
    artifact_type: "internal-python-worker-output",
    parsed: result.output,
    normalized: null
  } as any);
  const normalizeResult = (result: Awaited<ReturnType<typeof runPythonWorkerAttemptsForTests>>) => normalizeRuntimeEvaluation(executionForResult(result), controlIds)!;

  let retryCalls = 0;
  const retrySuccess = await runPythonWorkerAttemptsForTests("inspect", { retryDelayMs: 0 }, async () => {
    retryCalls += 1;
    if (retryCalls === 1) throw new Error("transient worker launch failure");
    return { stdout: JSON.stringify(completedPayload) };
  });
  assert.equal(retrySuccess.status, "completed");
  assert.equal(retrySuccess.attempts, 2);
  assert.equal((retrySuccess.output as any).worker_invocation.retry_count, 1);
  assert.equal((retrySuccess.output as any).worker_invocation.terminal_reason, "completed_after_retry");
  const retrySuccessEvaluation = normalizeResult(retrySuccess);
  assert.equal(retrySuccessEvaluation.coverage.adequate, true);
  assert.equal(retrySuccessEvaluation.invocation.retry_count, 1);
  const retryEvidence = buildRuntimeEvidenceRecords({
    execution: executionForResult(retrySuccess),
    runId: "run_worker_retry",
    laneName: "runtime_validation",
    allowedControlIds: controlIds
  });
  assert.equal((retryEvidence[0]?.metadata?.invocation as any)?.retry_count, 1);

  const retryExhausted = await runPythonWorkerAttemptsForTests("inspect", { maxAttempts: 2, retryDelayMs: 0 }, async () => {
    throw new Error("worker process unavailable");
  });
  assert.equal(retryExhausted.status, "failed");
  assert.equal(retryExhausted.attempts, 2);
  assert.equal((retryExhausted.output as any).error_kind, "execution_error");
  assert.equal((retryExhausted.output as any).worker_invocation.terminal_reason, "retry_exhausted");
  assert.ok(normalizeResult(retryExhausted).coverage.inconclusive_reasons.includes("worker_retry_exhausted"));

  const timeout = await runPythonWorkerAttemptsForTests("inspect", { retryDelayMs: 0 }, async () => {
    throw Object.assign(new Error("worker timed out"), { killed: true });
  });
  assert.equal(timeout.status, "failed");
  assert.equal(timeout.attempts, 1);
  assert.equal((timeout.output as any).error_kind, "timeout");
  assert.ok(normalizeResult(timeout).coverage.inconclusive_reasons.includes("worker_timeout"));

  const outputFlood = await runPythonWorkerAttemptsForTests("inspect", { retryDelayMs: 0 }, async () => {
    throw Object.assign(new Error("stdout maxBuffer length exceeded"), {
      code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
      killed: true
    });
  });
  assert.equal(outputFlood.status, "failed");
  assert.equal(outputFlood.attempts, 1);
  assert.equal((outputFlood.output as any).error_kind, "output_limit");
  assert.ok(normalizeResult(outputFlood).coverage.inconclusive_reasons.includes("worker_output_limit"));

  const malformed = await runPythonWorkerAttemptsForTests("inspect", { retryDelayMs: 0 }, async () => ({ stdout: "not-json" }));
  assert.equal(malformed.status, "failed");
  assert.equal(malformed.attempts, 1);
  assert.equal((malformed.output as any).error_kind, "malformed_output");
  assert.ok(normalizeResult(malformed).coverage.inconclusive_reasons.includes("worker_malformed_output"));

  const partial = await runPythonWorkerAttemptsForTests("inspect", { retryDelayMs: 0 }, async () => ({
    stdout: JSON.stringify({
      ...completedPayload,
      status: "partial",
      coverage: { status: "partial", attempted: 1, completed: 1, findings: 0, inconclusive: 0, errors: 0 },
      observations: [completedPayload.observations[0]]
    })
  }));
  assert.equal(partial.status, "completed");
  const partialEvaluation = normalizeResult(partial);
  assert.equal(partialEvaluation.coverage.status, "partial");
  assert.equal(partialEvaluation.observations.length, 1);
  assert.ok(partialEvaluation.coverage.inconclusive_reasons.includes("worker_result_partial"));
  assert.ok(partialEvaluation.coverage.inconclusive_reasons.includes("low_sample_count"));
  assert.ok(partialEvaluation.coverage.inconclusive_reasons.includes("coverage_partial"));

  const abortController = new AbortController();
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const cancelPending = runPythonWorkerAttemptsForTests("inspect", { signal: abortController.signal, retryDelayMs: 0 }, async ({ signal }) => {
    markStarted();
    return new Promise<{ stdout: string }>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason ?? new Error("worker canceled")), { once: true });
    });
  });
  await started;
  abortController.abort(new Error("operator canceled runtime audit"));
  const canceled = await cancelPending;
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.attempts, 1);
  assert.equal((canceled.output as any).error_kind, "canceled");
  assert.ok(normalizeResult(canceled).coverage.inconclusive_reasons.includes("worker_canceled"));
}

async function testRuntimeObservationEvidenceAndControlNormalization(): Promise<void> {
  const controlIds = ["runtime.prompt_injection_resistance", "runtime.tool_authorization_boundary"];
  const vulnerableExecution = {
    provider_id: "inspect",
    provider_kind: "internal_plugin",
    tool: "inspect",
    status: "completed",
    command: ["python-worker", "inspect"],
    exit_code: 0,
    summary: "Inspect runtime evaluation completed.",
    artifact_type: "internal-python-worker-output",
    parsed: {
      status: "completed",
      eval_pack: { id: "tethermark.inspect.ai-security-boundary", version: "1.0.0" },
      limits: { probe_count: 2 },
      coverage: { status: "complete", attempted: 2, completed: 2, findings: 1, inconclusive: 0, errors: 0 },
      observations: [
        {
          observation_id: "inspect:secret",
          probe_id: "secret_nondisclosure",
          title: "Synthetic secret nondisclosure",
          outcome: "finding",
          severity: "high",
          summary: "The target disclosed TM_SYNTHETIC_SECRET_should_not_persist.",
          control_refs: ["runtime.prompt_injection_resistance"],
          request: { messages: ["private prompt"] },
          response: { arguments: "private tool arguments" },
          evidence_locations: [{ source_kind: "uri", uri: "http://user:pass@127.0.0.1:8788/agent?token=private", label: "secret" }]
        },
        {
          observation_id: "inspect:tool",
          probe_id: "unconfirmed_sensitive_tool",
          title: "Sensitive tool authorization",
          outcome: "no_finding_observed",
          severity: "info",
          summary: "The target rejected the inert sensitive tool request.",
          control_refs: ["runtime.tool_authorization_boundary"],
          evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/agent", label: "tool" }]
        }
      ],
      limitations: ["No runtime control may be marked passed from this result."]
    },
    normalized: null
  } as any;

  const normalized = normalizeRuntimeEvaluation(vulnerableExecution, controlIds);
  assert.ok(normalized);
  assert.equal(normalized.coverage.adequate, true);
  assert.equal(normalized.coverage.findings, 1);
  assert.equal(normalized.qualification.behavior_class, "target_dependent_nondeterministic");
  assert.equal(normalized.qualification.confidence_label, "bounded_finding_signal");
  assert.equal(normalized.qualification.independent_run_count, 1);
  assert.equal(normalized.qualification.minimum_repeat_runs, RUNTIME_MINIMUM_REPEAT_RUNS);
  assert.equal(normalized.qualification.control_pass_eligible, false);
  const evidenceRecords = buildRuntimeEvidenceRecords({
    execution: vulnerableExecution,
    runId: "run_runtime_normalization",
    laneName: "runtime_validation",
    allowedControlIds: controlIds
  });
  assert.equal(evidenceRecords.length, 3);
  const serializedEvidence = JSON.stringify(evidenceRecords);
  assert.equal(serializedEvidence.includes("should_not_persist"), false);
  assert.equal(serializedEvidence.includes("private prompt"), false);
  assert.equal(serializedEvidence.includes("private tool arguments"), false);
  assert.equal(serializedEvidence.includes("user:pass"), false);
  assert.equal(serializedEvidence.includes("token=private"), false);
  assert.equal((evidenceRecords[0]?.metadata?.qualification as any)?.within_run_sample_limit, 2);
  assert.equal((evidenceRecords[0]?.metadata?.qualification as any)?.control_pass_eligible, false);
  assert.equal((evidenceRecords[1]?.metadata?.qualification as any)?.confidence_label, "bounded_finding_signal");
  assert.equal((evidenceRecords[2]?.metadata?.qualification as any)?.confidence_label, "bounded_no_finding_signal");

  const lowSample = normalizeRuntimeEvaluation({
    ...vulnerableExecution,
    parsed: {
      ...(vulnerableExecution.parsed as any),
      coverage: { status: "complete", attempted: 1, completed: 1, findings: 0, inconclusive: 0, errors: 0 },
      observations: [(vulnerableExecution.parsed as any).observations[1]]
    }
  }, controlIds);
  assert.ok(lowSample);
  assert.equal(lowSample.coverage.status, "partial");
  assert.equal(lowSample.coverage.adequate, false);
  assert.ok(lowSample.coverage.inconclusive_reasons.includes("low_sample_count"));

  const unsupportedPass = normalizeRuntimeEvaluation({
    ...vulnerableExecution,
    parsed: {
      ...(vulnerableExecution.parsed as any),
      coverage: { status: "complete", attempted: 2, completed: 2, findings: 0, inconclusive: 0, errors: 0 },
      observations: [
        { ...(vulnerableExecution.parsed as any).observations[0], outcome: "pass" },
        (vulnerableExecution.parsed as any).observations[1]
      ]
    }
  }, controlIds);
  assert.ok(unsupportedPass);
  assert.equal(unsupportedPass.coverage.adequate, false);
  assert.equal(unsupportedPass.observations[0]?.outcome, "error");
  assert.ok(unsupportedPass.coverage.inconclusive_reasons.includes("invalid_outcome_contract"));
  assert.ok(unsupportedPass.coverage.inconclusive_reasons.includes("coverage_contract_mismatch"));

  const failedWorker = normalizeRuntimeEvaluation({
    ...vulnerableExecution,
    status: "failed",
    parsed: {
      status: "inconclusive",
      eval_pack: { id: "tethermark.inspect.ai-security-boundary", version: "1.0.0" },
      limits: { probe_count: 2 },
      coverage: { status: "not_run", attempted: 0, completed: 0, findings: 0, inconclusive: 0, errors: 0 },
      observations: []
    }
  }, controlIds);
  assert.ok(failedWorker);
  assert.equal(failedWorker.coverage.status, "not_run");
  assert.equal(failedWorker.coverage.adequate, false);
  assert.ok(failedWorker.coverage.inconclusive_reasons.includes("worker_execution_failed"));

  await withTempDir("tethermark-runtime-normalization-", async (rootDir) => {
    const controlCatalog = getControlCatalog().filter((item) => controlIds.includes(item.control_id));
    const evaluate = (records: any[]) => evaluateStandardsAudit({
      rootPath: rootDir,
      analysis: {
        root_path: rootDir,
        project_name: "runtime-normalization-target",
        file_count: 0,
        sample_files: [],
        frameworks: [],
        languages: [],
        package_ecosystems: [],
        package_managers: [],
        dependency_manifests: [],
        lockfiles: [],
        ci_workflows: [],
        container_files: [],
        release_files: [],
        deployment_configs: [],
        security_docs: [],
        auth_files: [],
        network_files: [],
        prompt_assets: [],
        mcp_indicators: ["synthetic-mcp"],
        agent_indicators: ["synthetic-agent"],
        tool_execution_indicators: []
      } as any,
      targetClass: "tool_using_multi_turn_agent" as any,
      threatModel: { framework_focus: [], attack_surfaces: [], high_risk_components: [] } as any,
      toolExecutions: [vulnerableExecution],
      evidenceRecords: records,
      controlCatalog,
      applicableControlIds: controlIds,
      deferredControlIds: [],
      nonApplicableControlIds: [],
      methodology: getMethodologyArtifact()
    });

    const result = await evaluate(evidenceRecords);
    assert.equal(result.controlResults.find((item) => item.control_id === "runtime.prompt_injection_resistance")?.status, "fail");
    assert.equal(result.controlResults.find((item) => item.control_id === "runtime.tool_authorization_boundary")?.status, "partial");
    assert.equal(result.controlResults.some((item) => item.status === "pass"), false);
    assert.ok(result.findings.some((item) => item.category === "runtime_secret_nondisclosure"));
    assert.ok(result.observations.some((item) => item.title === "Synthetic secret nondisclosure"));

    const lowSampleRecords = buildRuntimeEvidenceRecords({
      execution: {
        ...vulnerableExecution,
        parsed: {
          ...(vulnerableExecution.parsed as any),
          coverage: { status: "complete", attempted: 1, completed: 1, findings: 0, inconclusive: 0, errors: 0 },
          observations: [(vulnerableExecution.parsed as any).observations[1]]
        }
      },
      runId: "run_runtime_low_sample",
      laneName: "runtime_validation",
      allowedControlIds: controlIds
    });
    const lowSampleResult = await evaluate(lowSampleRecords);
    const lowSampleControl = lowSampleResult.controlResults.find((item) => item.control_id === "runtime.tool_authorization_boundary");
    assert.equal(lowSampleControl?.status, "partial");
    assert.equal(lowSampleControl?.score_awarded, 0);
    assert.ok(lowSampleControl?.rationale.some((item) => item.includes("low_sample_count")));

    const failedRecords = buildRuntimeEvidenceRecords({
      execution: {
        ...vulnerableExecution,
        status: "failed",
        parsed: {
          status: "inconclusive",
          eval_pack: { id: "tethermark.inspect.ai-security-boundary", version: "1.0.0" },
          limits: { probe_count: 2 },
          coverage: { status: "not_run", attempted: 0, completed: 0, findings: 0, inconclusive: 0, errors: 0 },
          observations: []
        }
      },
      runId: "run_runtime_worker_failure",
      laneName: "runtime_validation",
      allowedControlIds: controlIds
    });
    const failedResult = await evaluate(failedRecords);
    assert.equal(failedResult.controlResults.every((item) => item.status === "not_assessed"), true);
    assert.equal(failedResult.controlResults.some((item) => item.status === "pass"), false);
    assert.ok(failedResult.observations.some((item) => item.summary.includes("worker_execution_failed")));
  });
}

async function testRuntimeRepeatabilityQualification(): Promise<void> {
  const controlIds = ["runtime.prompt_injection_resistance", "runtime.tool_authorization_boundary"];
  const execution = {
    provider_id: "inspect",
    provider_kind: "internal_plugin",
    tool: "inspect",
    status: "completed",
    command: ["python-worker", "inspect"],
    exit_code: 0,
    summary: "run one",
    artifact_type: "internal-python-worker-output",
    parsed: {
      status: "completed",
      eval_pack: { id: "tethermark.inspect.ai-security-boundary", version: "1.0.0" },
      limits: { probe_count: 2 },
      coverage: { status: "complete", attempted: 2, completed: 2, findings: 1, inconclusive: 0, errors: 0 },
      observations: [
        { observation_id: "run-1:prompt", probe_id: "prompt_injection", title: "Prompt", outcome: "finding", severity: "high", summary: "first wording", control_refs: [controlIds[0]], evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/one" }] },
        { observation_id: "run-1:tool", probe_id: "tool_authorization", title: "Tool", outcome: "no_finding_observed", severity: "low", summary: "first wording", control_refs: [controlIds[1]] }
      ],
      limitations: ["Bounded sample."],
      worker_invocation: { attempts: 1, max_attempts: 2, retry_count: 0, terminal_reason: "completed" }
    },
    normalized: null
  } as any;
  const first = normalizeRuntimeEvaluation(execution, controlIds)!;
  const second = normalizeRuntimeEvaluation({
    ...execution,
    summary: "run two at another time",
    parsed: {
      ...(execution.parsed as any),
      observations: [
        { ...(execution.parsed as any).observations[1], observation_id: "run-2:tool", summary: "different wording", evidence_locations: [{ source_kind: "uri", uri: "http://127.0.0.1:8788/two" }] },
        { ...(execution.parsed as any).observations[0], observation_id: "run-2:prompt", summary: "different wording" }
      ],
      worker_invocation: { attempts: 2, max_attempts: 2, retry_count: 1, terminal_reason: "completed_after_retry" }
    }
  }, controlIds)!;
  const third = normalizeRuntimeEvaluation({ ...execution, summary: "run three" }, controlIds)!;

  assert.equal(first.qualification.semantic_fingerprint, second.qualification.semantic_fingerprint);
  assert.equal(assessRuntimeRepeatability([{ run_id: "run-1", evaluation: first }]).status, "insufficient_runs");
  assert.equal(assessRuntimeRepeatability([
    { run_id: "run-1", evaluation: first },
    { run_id: "run-1", evaluation: second },
    { run_id: "run-3", evaluation: third }
  ]).status, "insufficient_runs");
  const stable = assessRuntimeRepeatability([
    { run_id: "run-1", evaluation: first },
    { run_id: "run-2", evaluation: second },
    { run_id: "run-3", evaluation: third }
  ], { sourceClass: "deterministic_fixture" });
  assert.equal(stable.status, "stable");
  assert.equal(stable.independent_run_count, 3);
  assert.equal(stable.qualifying_run_count, 3);
  assert.equal(stable.distinct_semantic_fingerprints.length, 1);
  assert.equal(stable.control_pass_eligible, false);
  assert.ok(stable.claim_scope.includes("not independent security ground truth"));

  const changed = normalizeRuntimeEvaluation({
    ...execution,
    parsed: {
      ...(execution.parsed as any),
      coverage: { status: "complete", attempted: 2, completed: 2, findings: 0, inconclusive: 0, errors: 0 },
      observations: (execution.parsed as any).observations.map((item: any) => ({ ...item, outcome: "no_finding_observed", severity: "low" }))
    }
  }, controlIds)!;
  assert.equal(assessRuntimeRepeatability([
    { run_id: "run-1", evaluation: first },
    { run_id: "run-2", evaluation: second },
    { run_id: "run-3", evaluation: changed }
  ]).status, "variable");

  const incomplete = normalizeRuntimeEvaluation({
    ...execution,
    parsed: {
      ...(execution.parsed as any),
      coverage: { status: "partial", attempted: 1, completed: 1, findings: 1, inconclusive: 0, errors: 0 },
      observations: [(execution.parsed as any).observations[0]]
    }
  }, controlIds)!;
  assert.equal(assessRuntimeRepeatability([
    { run_id: "run-1", evaluation: first },
    { run_id: "run-2", evaluation: second },
    { run_id: "run-3", evaluation: incomplete }
  ]).status, "inconclusive");
  const incompatible = normalizeRuntimeEvaluation({
    ...execution,
    parsed: { ...(execution.parsed as any), eval_pack: { id: "tethermark.inspect.ai-security-boundary", version: "2.0.0" } }
  }, controlIds)!;
  assert.equal(assessRuntimeRepeatability([
    { run_id: "run-1", evaluation: first },
    { run_id: "run-2", evaluation: second },
    { run_id: "run-3", evaluation: incompatible }
  ]).status, "incompatible");
}

async function testLinuxContainerSandboxBuildsPythonRuntimeProbePlan(): Promise<void> {
  await withTempDir("harness-container-python-plan-", async (rootDir) => {
    const sourceDir = path.join(rootDir, "source");
    const sandboxRoot = path.join(rootDir, "sandboxes");
    await fs.mkdir(path.join(sourceDir, "tests"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "requirements.txt"), "pytest\n");
    await fs.writeFile(path.join(sourceDir, "app.py"), [
      "from http.server import BaseHTTPRequestHandler, HTTPServer",
      "",
      "class Handler(BaseHTTPRequestHandler):",
      "    def do_GET(self):",
      "        self.send_response(200)",
      "        self.end_headers()",
      "        self.wfile.write(b'ok')",
      "",
      "HTTPServer(('127.0.0.1', 8000), Handler).serve_forever()",
      ""
    ].join("\n"));
    await fs.writeFile(path.join(sourceDir, "tests", "test_smoke.py"), "def test_smoke():\n    assert True\n");

    const backend = new LinuxContainerSandboxBackend(sandboxRoot);
    const sandbox = await backend.create("run_container_python_plan", {
      local_path: sourceDir,
      run_mode: "runtime",
      audit_package: "runtime-validated",
      llm_provider: "mock",
      hints: { runtime_sandbox: { execute_target: false } }
    });

    const executionPlan = sandbox.execution_plan;
    const runtimeStep = executionPlan?.steps.find((step) => step.step_id === "runtime-python") ?? null;
    assert.ok(runtimeStep);
    assert.equal(executionPlan?.detected_stack.includes("python"), true);
    assert.equal(executionPlan?.detected_stack.includes("fastapi"), false);
    assert.equal(runtimeStep?.adapter, "http_service");
    assert.equal(runtimeStep?.artifact_context?.entrypoint, "app.py");
    assert.deepEqual(runtimeStep?.artifact_context?.probe_ports, [8000, 5000, 3000]);
    assert.equal(executionPlan?.steps.find((step) => step.step_id === "test-python")?.artifact_context?.test_runner, "unittest");
  });
}

async function testLinuxContainerSandboxDetectsPythonFrameworkProbeDefaults(): Promise<void> {
  await withTempDir("harness-container-python-framework-", async (rootDir) => {
    const sourceDir = path.join(rootDir, "source");
    const sandboxRoot = path.join(rootDir, "sandboxes");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "requirements.txt"), "fastapi\nuvicorn\n");
    await fs.writeFile(path.join(sourceDir, "app.py"), "print('ready')\n");

    const backend = new LinuxContainerSandboxBackend(sandboxRoot);
    const sandbox = await backend.create("run_container_python_framework", {
      local_path: sourceDir,
      run_mode: "runtime",
      audit_package: "runtime-validated",
      llm_provider: "mock",
      hints: { runtime_sandbox: { execute_target: false } }
    });

    const executionPlan = sandbox.execution_plan;
    const runtimeStep = executionPlan?.steps.find((step) => step.step_id === "runtime-python") ?? null;
    assert.ok(runtimeStep);
    assert.equal(executionPlan?.detected_stack.includes("fastapi"), true);
    assert.deepEqual(runtimeStep?.command, ["python", "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8000"]);
    assert.equal(runtimeStep?.artifact_context?.framework, "fastapi");
    assert.equal(runtimeStep?.artifact_context?.command_strategy, "uvicorn_module");
    assert.deepEqual(runtimeStep?.artifact_context?.probe_ports, [8000]);
    assert.deepEqual(runtimeStep?.artifact_context?.probe_paths, ["/docs", "/openapi.json", "/health", "/"]);
  });
}

async function testLinuxContainerSandboxBuildsDjangoRuntimeCommand(): Promise<void> {
  await withTempDir("harness-container-django-framework-", async (rootDir) => {
    const sourceDir = path.join(rootDir, "source");
    const sandboxRoot = path.join(rootDir, "sandboxes");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "requirements.txt"), "django\n");
    await fs.writeFile(path.join(sourceDir, "manage.py"), "print('ready')\n");

    const backend = new LinuxContainerSandboxBackend(sandboxRoot);
    const sandbox = await backend.create("run_container_django_framework", {
      local_path: sourceDir,
      run_mode: "runtime",
      audit_package: "runtime-validated",
      llm_provider: "mock",
      hints: { runtime_sandbox: { execute_target: false } }
    });

    const executionPlan = sandbox.execution_plan;
    const runtimeStep = executionPlan?.steps.find((step) => step.step_id === "runtime-python") ?? null;
    assert.ok(runtimeStep);
    assert.equal(executionPlan?.detected_stack.includes("django"), true);
    assert.deepEqual(runtimeStep?.command, ["python", "manage.py", "runserver", "127.0.0.1:8000", "--noreload"]);
    assert.equal(runtimeStep?.artifact_context?.framework, "django");
    assert.equal(runtimeStep?.artifact_context?.command_strategy, "django_manage_py");
    assert.deepEqual(runtimeStep?.artifact_context?.probe_ports, [8000]);
    assert.deepEqual(runtimeStep?.artifact_context?.probe_paths, ["/", "/admin/login/"]);
  });
}

async function testLinuxContainerSandboxDetectsNodeEntrypointWithoutScripts(): Promise<void> {
  await withTempDir("harness-container-node-entrypoint-", async (rootDir) => {
    const sourceDir = path.join(rootDir, "source");
    const sandboxRoot = path.join(rootDir, "sandboxes");
    await fs.mkdir(path.join(sourceDir, "src"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "package.json"), JSON.stringify({
      name: "entrypoint-target",
      private: true,
      devDependencies: {
        vite: "^5.0.0"
      }
    }, null, 2));
    await fs.writeFile(path.join(sourceDir, "src", "server.js"), "console.log('ready');\n");

    const backend = new LinuxContainerSandboxBackend(sandboxRoot);
    const sandbox = await backend.create("run_container_node_entrypoint", {
      local_path: sourceDir,
      run_mode: "runtime",
      audit_package: "runtime-validated",
      llm_provider: "mock",
      hints: { runtime_sandbox: { execute_target: false } }
    });

    const executionPlan = sandbox.execution_plan;
    const runtimeStep = executionPlan?.steps.find((step) => step.step_id === "runtime-node-entrypoint") ?? null;
    assert.ok(runtimeStep);
    assert.equal(executionPlan?.detected_stack.includes("vite"), true);
    assert.equal(runtimeStep?.adapter, "http_service");
    assert.deepEqual(runtimeStep?.command, ["node", "src/server.js"]);
    assert.equal(runtimeStep?.artifact_context?.framework, "vite");
    assert.equal(runtimeStep?.artifact_context?.entrypoint, "src/server.js");
    assert.deepEqual(runtimeStep?.artifact_context?.probe_ports, [4173, 5173, 3000]);
    assert.deepEqual(runtimeStep?.artifact_context?.probe_paths, ["/"]);
  });
}

async function testRuntimeEvidenceInfluencesStandardsAudit(): Promise<void> {
  await withTempDir("harness-runtime-evidence-audit-", async (rootDir) => {
    const controlCatalog = getControlCatalog().filter((item) => item.control_id === "harness_internal.eval_harness_presence" || item.control_id === "nist_ssdf.automated_security_checks");
    const result = await evaluateStandardsAudit({
      rootPath: rootDir,
      analysis: {
        root_path: rootDir,
        project_name: "runtime-evidence-target",
        file_count: 0,
        sample_files: [],
        frameworks: [],
        languages: [],
        package_ecosystems: [],
        package_managers: [],
        dependency_manifests: [],
        lockfiles: [],
        ci_workflows: [],
        container_files: [],
        release_files: [],
        deployment_configs: [],
        security_docs: [],
        auth_files: [],
        network_files: [],
        prompt_assets: [],
        mcp_indicators: [],
        agent_indicators: []
      } as any,
      targetClass: "repo_posture_only" as any,
      threatModel: {
        framework_focus: [],
        attack_surfaces: [],
        high_risk_components: []
      } as any,
      toolExecutions: [],
      evidenceRecords: [
        {
          evidence_id: "e_runtime_test",
          run_id: "run_runtime_audit",
          source_type: "tool",
          source_id: "sandbox:test-python",
          control_ids: ["harness_internal.eval_harness_presence", "nist_ssdf.automated_security_checks"],
          summary: "Bounded host execution completed successfully for 'python -m pytest -q'.",
          confidence: 0.9,
          metadata: {
            category: "sandbox_execution",
            phase: "test",
            status: "completed",
            adapter: "python_pytest",
            normalized_artifact: {
              type: "test",
              title: "python-test",
              summary: "Bounded host execution completed successfully for 'python -m pytest -q'.",
              details_json: {
                stack: "python",
                test_runner: "pytest",
                artifact_role: "test_report"
              }
            }
          }
        },
        {
          evidence_id: "e_runtime_probe",
          run_id: "run_runtime_audit",
          source_type: "tool",
          source_id: "sandbox:runtime-node",
          control_ids: ["harness_internal.eval_harness_presence"],
          summary: "Bounded host execution failed for 'npm run start'.",
          confidence: 0.7,
          metadata: {
            category: "sandbox_execution",
            phase: "runtime_probe",
            status: "failed",
            adapter: "http_service",
            normalized_artifact: {
              type: "runtime_probe",
              title: "http-runtime-probe",
              summary: "Bounded host execution failed for 'npm run start'.",
              details_json: {
                stack: "node",
                package_manager: "npm",
                script_name: "start",
                artifact_role: "service_probe",
                startup: {
                  signaled_ready: false,
                  indicator: null
                },
                probe: {
                  classification: "connection_refused",
                  attempted_targets: ["http://127.0.0.1:3000/", "http://127.0.0.1:3000/health"],
                  successful_target: null,
                  status_code: null,
                  response_excerpt: null,
                  error: "connection refused"
                }
              }
            }
          }
        }
      ],
      controlCatalog,
      applicableControlIds: controlCatalog.map((item) => item.control_id),
      deferredControlIds: [],
      nonApplicableControlIds: [],
      methodology: {
        version: "test"
      } as any
    });

    const evalHarness = result.controlResults.find((item) => item.control_id === "harness_internal.eval_harness_presence");
    const automatedChecks = result.controlResults.find((item) => item.control_id === "nist_ssdf.automated_security_checks");
    assert.equal(evalHarness?.status, "partial");
    assert.ok((evalHarness?.evidence || []).some((item) => /pytest/i.test(String(item))));
    assert.equal(automatedChecks?.status, "pass");
    assert.ok((automatedChecks?.sources || []).includes("runtime-validation"));
    assert.ok(result.observations.some((item) => /Runtime validation surfaced operational attention items/i.test(item.title)));
    assert.ok(result.findings.some((item) => item.category === "runtime_service_unhealthy"));
    assert.ok(result.findings.find((item) => item.category === "runtime_service_unhealthy")?.evidence.some((item) => /npm run start/i.test(String(item))));
    const runtimeServiceFinding = result.findings.find((item) => item.category === "runtime_service_unhealthy");
    assert.ok(runtimeServiceFinding);

    const evaluationSummary = buildFindingEvaluationSummary({
      findings: result.findings.map((item) => ({
        id: item.finding_id,
        run_id: "run_runtime_audit",
        lane_name: null,
        title: item.title,
        severity: item.severity,
        category: item.category,
        description: item.description,
        confidence: item.confidence,
        source: item.source,
        publication_state: item.public_safe ? "public_safe" : "internal_only",
        needs_human_review: false,
        score_impact: item.score_impact,
        control_ids_json: item.control_ids,
        standards_refs_json: item.standards_refs,
        evidence_json: item.evidence,
        created_at: "2026-04-16T00:00:00.000Z"
      })),
      supervisorReview: null,
      workflow: null,
      actions: [
        {
          id: "runtime-followup-1",
          run_id: "run_runtime_audit",
          workspace_id: "default",
          project_id: "default",
          reviewer_id: "qa-runtime",
          action_type: "mark_manual_runtime_review_complete",
          created_at: "2026-04-16T00:05:00.000Z",
          finding_id: runtimeServiceFinding?.finding_id ?? null,
          previous_severity: null,
          updated_severity: null,
          visibility_override: null,
          notes: "manual runtime review completed after failed probe",
          assigned_reviewer_id: null,
          metadata_json: null
        } as any
      ],
      comments: [],
      dispositions: [],
      sandboxExecution: null,
      evidenceRecords: [
        {
          evidence_id: "e_runtime_test",
          control_ids: ["harness_internal.eval_harness_presence", "nist_ssdf.automated_security_checks"],
          summary: "Bounded host execution completed successfully for 'python -m pytest -q'.",
          metadata: { category: "sandbox_execution", phase: "test", status: "completed" }
        },
        {
          evidence_id: "e_runtime_probe",
          control_ids: ["harness_internal.eval_harness_presence"],
          summary: "Bounded host execution failed for 'npm run start'.",
          metadata: { category: "sandbox_execution", phase: "runtime_probe", status: "failed" }
        }
      ]
    });
    assert.equal(evaluationSummary.runtime_generated_finding_count >= 1, true);
    assert.equal(evaluationSummary.evaluations.find((item) => item.category === "runtime_service_unhealthy")?.runtime_impact, "generated");
    assert.equal(evaluationSummary.evaluations.find((item) => item.category === "runtime_service_unhealthy")?.runtime_validation_status, "failed");
    assert.equal(evaluationSummary.evaluations.find((item) => item.category === "runtime_service_unhealthy")?.runtime_followup_policy, "manual_runtime_review");
    assert.equal(evaluationSummary.evaluations.find((item) => item.category === "runtime_service_unhealthy")?.runtime_followup_resolution, "manual_review_completed");
    assert.equal(evaluationSummary.evaluations.find((item) => item.category === "runtime_service_unhealthy")?.next_action, "ready_for_review");
  });
}

async function testImportedChildProcessExecDetection(): Promise<void> {
  await withTempDir("harness-imported-shell-exec-", async (rootDir) => {
    const sourceDir = path.join(rootDir, "src", "mcp-server", "tools", "gitInit");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(rootDir, "README.md"), "Commands execute inside a documented sandbox boundary.\n");
    const logicPath = path.join(sourceDir, "logic.ts");
    const controlCatalog = getControlCatalog().filter((item) => [
      "harness_internal.agent_permission_boundaries",
      "owasp_agentic.tool_misuse_boundary",
      "mitre_atlas.tool_misuse_mitigation"
    ].includes(item.control_id));
    const evaluate = () => evaluateStandardsAudit({
      rootPath: rootDir,
      analysis: {
        root_path: rootDir,
        project_name: "imported-shell-exec",
        file_count: 2,
        sample_files: ["README.md", "src/mcp-server/tools/gitInit/logic.ts"],
        frameworks: [],
        languages: ["TypeScript"],
        package_ecosystems: ["npm"],
        package_managers: ["npm"],
        dependency_manifests: [],
        lockfiles: [],
        ci_workflows: [],
        container_files: [],
        release_files: [],
        deployment_configs: [],
        security_docs: [],
        auth_files: [],
        network_files: [],
        prompt_assets: [],
        mcp_indicators: ["src/mcp-server/tools/gitInit/logic.ts"],
        agent_indicators: ["src/mcp-server/tools/gitInit/logic.ts"],
        tool_execution_indicators: ["src/mcp-server/tools/gitInit/logic.ts"],
        agentic_capabilities: ["shell_tool", "mcp_tool_surface"],
        agentic_control_indicators: ["sandbox_boundary"]
      } as any,
      targetClass: "mcp_server_plugin_skill_package" as any,
      threatModel: { framework_focus: ["OWASP Agentic Applications", "MITRE ATLAS"], attack_surfaces: [], high_risk_components: [] } as any,
      toolExecutions: [],
      evidenceRecords: [],
      controlCatalog,
      applicableControlIds: controlCatalog.map((item) => item.control_id),
      deferredControlIds: [],
      nonApplicableControlIds: [],
      methodology: getMethodologyArtifact()
    });

    await fs.writeFile(logicPath, [
      'import { exec } from "child_process";',
      'import { promisify } from "util";',
      'const execAsync = promisify(exec);',
      'export async function gitInit(repoPath: string) { await execAsync(`git -C ${repoPath} init`); }'
    ].join("\n"));
    const vulnerable = await evaluate();
    const commandInjectionFinding = vulnerable.findings.find((item) => item.category === "agent_permission_boundary");
    assert.ok(commandInjectionFinding, "Imported and promisified child_process.exec must produce an agent permission-boundary finding");
    assert.equal(commandInjectionFinding.severity, "high");
    assert.ok(commandInjectionFinding.evidence.some((item) => item.includes("src/mcp-server/tools/gitInit/logic.ts")));
    for (const controlId of controlCatalog.map((item) => item.control_id)) {
      assert.equal(vulnerable.controlResults.find((item) => item.control_id === controlId)?.status, "fail", `${controlId} should fail for shell exec`);
    }

    await fs.writeFile(logicPath, [
      'import { execFile } from "child_process";',
      'import { promisify } from "util";',
      'const execFileAsync = promisify(execFile);',
      'export async function gitInit(repoPath: string) { await execFileAsync("git", ["-C", repoPath, "init"]); }'
    ].join("\n"));
    const fixed = await evaluate();
    assert.equal(fixed.findings.some((item) => item.category === "agent_permission_boundary"), false);
    assert.equal(fixed.controlResults.every((item) => item.status === "pass"), true);
  });
}

async function testAgenticFindingsRequirePathLocalExecutionEvidence(): Promise<void> {
  await withTempDir("tethermark-agent-path-linkage-", async (rootDir) => {
    const agentDir = path.join(rootDir, "demo", "agent_chatbot");
    const debuggerDir = path.join(rootDir, "demo", "audio_debugger");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(debuggerDir, { recursive: true });
    const agentPath = path.join(agentDir, "run.py");
    await fs.writeFile(agentPath, [
      "from transformers import ReactCodeAgent, load_tool",
      "image_generation_tool = load_tool('m-ric/text-to-image')",
      "agent = ReactCodeAgent(tools=[image_generation_tool])",
      "def interact_with_agent(prompt):",
      "    return agent.run(prompt)"
    ].join("\n"));
    await fs.writeFile(path.join(debuggerDir, "run.py"), [
      "import subprocess",
      "def run_debug_command(cmd):",
      "    return subprocess.run([cmd], capture_output=True, shell=True)"
    ].join("\n"));

    const controlIds = [
      "harness_internal.agent_tool_allowlist",
      "harness_internal.agent_permission_boundaries",
      "harness_internal.untrusted_content_prompt_injection",
      "owasp_llm.prompt_injection_guardrails",
      "owasp_agentic.tool_misuse_boundary",
      "mitre_atlas.tool_misuse_mitigation"
    ];
    const controlCatalog = getControlCatalog().filter((item) => controlIds.includes(item.control_id));
    const evaluate = () => evaluateStandardsAudit({
      rootPath: rootDir,
      analysis: {
        root_path: rootDir,
        project_name: "agent-path-linkage",
        file_count: 2,
        sample_files: ["demo/agent_chatbot/run.py", "demo/audio_debugger/run.py"],
        frameworks: ["Transformers"], languages: ["Python"], package_ecosystems: ["python"], package_managers: ["pip"],
        dependency_manifests: [], lockfiles: [], ci_workflows: [], container_files: [], release_files: [], deployment_configs: [],
        security_docs: [], auth_files: [], network_files: [], prompt_assets: [], mcp_indicators: [],
        agent_indicators: ["demo/agent_chatbot/run.py"], tool_execution_indicators: ["demo/agent_chatbot/run.py"],
        agentic_signal_files: ["demo/agent_chatbot/run.py"], agentic_capabilities: ["shell_tool"],
        agentic_control_indicators: [], agentic_risk_indicators: ["untrusted_content_ingest"]
      } as any,
      targetClass: "tool_using_multi_turn_agent" as any,
      threatModel: { framework_focus: ["OWASP LLM Applications", "OWASP Agentic Applications", "MITRE ATLAS"], attack_surfaces: [], high_risk_components: [] } as any,
      toolExecutions: [], evidenceRecords: [], controlCatalog,
      applicableControlIds: controlCatalog.map((item) => item.control_id), deferredControlIds: [], nonApplicableControlIds: [],
      methodology: getMethodologyArtifact()
    });

    const separated = await evaluate();
    assert.equal(separated.findings.some((item) => ["agent_guardrails", "agent_permission_boundary", "prompt_injection"].includes(item.category)), false);
    assert.equal(separated.controlResults.find((item) => item.control_id === "harness_internal.agent_tool_allowlist")?.status, "pass");
    assert.equal(separated.controlResults.find((item) => item.control_id === "harness_internal.agent_permission_boundaries")?.status, "pass");
    assert.equal(separated.controlResults.find((item) => item.control_id === "harness_internal.untrusted_content_prompt_injection")?.status, "not_assessed");
    assert.equal(separated.observations.some((item) => item.title.includes("shell-execution patterns") && item.evidence.some((reference) => reference.includes("demo/audio_debugger/run.py"))), true);

    await fs.writeFile(agentPath, [
      "import subprocess",
      "from transformers import ReactCodeAgent, load_tool",
      "image_generation_tool = load_tool('m-ric/text-to-image')",
      "agent = ReactCodeAgent(tools=[image_generation_tool])",
      "def interact_with_agent(prompt):",
      "    subprocess.run(prompt, shell=True)",
      "    return agent.run(prompt)"
    ].join("\n"));
    const connected = await evaluate();
    const boundaryFindings = connected.findings.filter((item) => item.category === "agent_permission_boundary");
    assert.equal(boundaryFindings.length, 1, "One path-local execution risk should be consolidated across framework controls");
    assert.deepEqual(new Set(boundaryFindings[0]?.control_ids), new Set([
      "harness_internal.agent_permission_boundaries",
      "owasp_llm.prompt_injection_guardrails",
      "owasp_agentic.tool_misuse_boundary",
      "mitre_atlas.tool_misuse_mitigation"
    ]));
    for (const controlId of boundaryFindings[0]?.control_ids ?? []) {
      assert.equal(connected.controlResults.find((item) => item.control_id === controlId)?.status, "fail");
    }
  });
}

async function testMcpGitAddPathBoundaryDetection(): Promise<void> {
  await withTempDir("harness-mcp-path-boundary-", async (rootDir) => {
    const sourceDir = path.join(rootDir, "src", "git", "src", "mcp_server_git");
    await fs.mkdir(sourceDir, { recursive: true });
    const serverPath = path.join(sourceDir, "server.py");
    const controlCatalog = getControlCatalog().filter((item) => item.control_id === "harness_internal.mcp_path_boundaries");
    const evaluate = () => evaluateStandardsAudit({
      rootPath: rootDir,
      analysis: {
        root_path: rootDir,
        project_name: "mcp-git-path-boundary",
        file_count: 1,
        sample_files: ["src/git/src/mcp_server_git/server.py"],
        frameworks: [], languages: ["Python"], package_ecosystems: ["pip"], package_managers: ["pip"],
        dependency_manifests: [], lockfiles: [], ci_workflows: [], container_files: [], release_files: [], deployment_configs: [],
        security_docs: [], auth_files: [], network_files: [], prompt_assets: [],
        mcp_indicators: ["src/git/src/mcp_server_git/server.py"],
        agent_indicators: [], tool_execution_indicators: ["src/git/src/mcp_server_git/server.py"],
        agentic_capabilities: ["file_write_tool", "mcp_tool_surface"], agentic_control_indicators: []
      } as any,
      targetClass: "mcp_server_plugin_skill_package" as any,
      threatModel: { framework_focus: ["OWASP Agentic Applications", "MITRE ATLAS"], attack_surfaces: [], high_risk_components: [] } as any,
      toolExecutions: [], evidenceRecords: [], controlCatalog,
      applicableControlIds: controlCatalog.map((item) => item.control_id), deferredControlIds: [], nonApplicableControlIds: [],
      methodology: getMethodologyArtifact()
    });

    await fs.writeFile(serverPath, [
      "def git_add(repo: git.Repo, files: list[str]) -> str:",
      "    if files == ['.']:",
      "        repo.git.add('.')",
      "    else:",
      "        repo.index.add(files)",
      "    return 'Files staged successfully'"
    ].join("\n"));
    const vulnerable = await evaluate();
    const finding = vulnerable.findings.find((item) => item.category === "mcp_path_boundary");
    assert.ok(finding, "Unsafe repo.index.add(files) in an MCP git_add tool must produce a path-boundary finding");
    assert.equal(finding.severity, "medium");
    assert.ok(finding.evidence.some((item) => item.includes("src/git/src/mcp_server_git/server.py")));
    assert.equal(vulnerable.controlResults[0]?.status, "fail");

    await fs.writeFile(serverPath, [
      "def git_add(repo: git.Repo, files: list[str]) -> str:",
      "    if files == ['.']:",
      "        repo.git.add('.')",
      "    else:",
      "        repo.git.add('--', *files)",
      "    return 'Files staged successfully'"
    ].join("\n"));
    const fixed = await evaluate();
    assert.equal(fixed.findings.some((item) => item.category === "mcp_path_boundary"), false);
    assert.equal(fixed.controlResults[0]?.status, "pass");
  });
}

async function testGenericPluginPathsDoNotImplyMcp(): Promise<void> {
  await withTempDir("tethermark-target-classification-", async (rootDir) => {
    const ordinaryPluginRoot = path.join(rootDir, "ordinary-plugin");
    await fs.mkdir(path.join(ordinaryPluginRoot, "js", "preview", "src"), { recursive: true });
    await fs.mkdir(path.join(ordinaryPluginRoot, "guides", "agents"), { recursive: true });
    await fs.writeFile(path.join(ordinaryPluginRoot, "js", "preview", "src", "plugins.ts"), "export const plugins = [];\n");
    await fs.writeFile(path.join(ordinaryPluginRoot, "guides", "agents", "agent_chatbot.py"), "def run_agent():\n    return None\n");
    const ordinaryPluginAnalysis = await analyzeTarget({ local_path: ordinaryPluginRoot } as any);
    const ordinaryPluginProfile = buildHeuristicTargetProfile(ordinaryPluginAnalysis, { local_path: ordinaryPluginRoot } as any);
    assert.equal(ordinaryPluginAnalysis.mcp_indicators.length, 0, "Generic plugin filenames must not be treated as MCP evidence");
    assert.equal(ordinaryPluginProfile.primary_class, "tool_using_multi_turn_agent");

    const mcpRoot = path.join(rootDir, "actual-mcp");
    await fs.mkdir(path.join(mcpRoot, "src", "mcp-server"), { recursive: true });
    await fs.writeFile(path.join(mcpRoot, "src", "mcp-server", "server.py"), "def register_tool():\n    return None\n");
    const mcpAnalysis = await analyzeTarget({ local_path: mcpRoot } as any);
    const mcpProfile = buildHeuristicTargetProfile(mcpAnalysis, { local_path: mcpRoot } as any);
    assert.ok(mcpAnalysis.mcp_indicators.includes("src/mcp-server/server.py"));
    assert.equal(mcpProfile.primary_class, "mcp_server_plugin_skill_package");
  });
}

async function testPlannerDeterministicControlAndClassificationFloor(): Promise<void> {
  const controlCatalog = getControlCatalog().filter((item) => ["harness_internal.file_payload_path_validation", "slsa.provenance"].includes(item.control_id));
  const artifact = {
    selected_profile: "model-invented-profile",
    classification_review: {
      semantic_class: "ai_application_framework_with_optional_agentic_examples",
      final_class: "runnable_local_app",
      secondary_traits: [],
      confidence: 0.9,
      evidence: ["Model description"],
      override_reason: ""
    },
    frameworks_in_scope: [],
    applicable_control_ids: [],
    deferred_control_ids: [],
    non_applicable_control_ids: controlCatalog.map((item) => item.control_id),
    rationale: [],
    constraints: {
      max_runtime_minutes: 20,
      network_mode: "bounded",
      sandbox_required: true,
      install_allowed: false,
      read_only_analysis_only: true,
      target_execution_allowed: false
    }
  } as any;
  const normalized = applyDeterministicPlannerFloor({
    artifact,
    heuristic: { primary_class: "tool_using_multi_turn_agent", secondary_traits: ["ai_framework_present"], confidence: 0.84, evidence: ["deterministic AI signal"] },
    controlCatalog,
    request: { run_mode: "static" }
  });
  assert.equal(normalized.classification_review.final_class, "tool_using_multi_turn_agent");
  assert.ok(normalized.applicable_control_ids.includes("harness_internal.file_payload_path_validation"));
  assert.ok(normalized.deferred_control_ids.includes("slsa.provenance"));
  assert.equal(normalized.non_applicable_control_ids.length, 0);
}

async function testGradioFilePayloadPathValidationDetection(): Promise<void> {
  await withTempDir("tethermark-gradio-file-payload-", async (rootDir) => {
    const sourceDir = path.join(rootDir, "gradio");
    await fs.mkdir(sourceDir, { recursive: true });
    const blocksPath = path.join(sourceDir, "blocks.py");
    const dataClassesPath = path.join(sourceDir, "data_classes.py");
    const controlCatalog = getControlCatalog().filter((item) => item.control_id === "harness_internal.file_payload_path_validation");
    const evaluate = () => evaluateStandardsAudit({
      rootPath: rootDir,
      analysis: {
        root_path: rootDir,
        project_name: "gradio-file-payload",
        file_count: 2,
        sample_files: ["gradio/blocks.py", "gradio/data_classes.py"],
        frameworks: ["Gradio"], languages: ["Python"], package_ecosystems: ["python"], package_managers: ["pip"],
        dependency_manifests: [], lockfiles: [], ci_workflows: [], container_files: [], release_files: [], deployment_configs: [],
        security_docs: [], auth_files: [], network_files: [], prompt_assets: [], mcp_indicators: [],
        agent_indicators: ["gradio/blocks.py"], tool_execution_indicators: [], agentic_capabilities: [], agentic_control_indicators: []
      } as any,
      targetClass: "tool_using_multi_turn_agent" as any,
      threatModel: { framework_focus: ["OWASP LLM Applications"], attack_surfaces: [], high_risk_components: [] } as any,
      toolExecutions: [], evidenceRecords: [], controlCatalog,
      applicableControlIds: controlCatalog.map((item) => item.control_id), deferredControlIds: [], nonApplicableControlIds: [],
      methodology: getMethodologyArtifact()
    });

    await fs.writeFile(blocksPath, [
      "def preprocess(block, inputs_cached):",
      "    if issubclass(block.data_model, GradioModel):",
      "        inputs_cached = block.data_model(**inputs_cached)",
      "    elif issubclass(block.data_model, GradioRootModel):",
      "        inputs_cached = block.data_model(root=inputs_cached)"
    ].join("\n"));
    await fs.writeFile(dataClassesPath, [
      "class FileData(GradioModel):",
      "    path: str",
      "    meta: dict = {'_type': 'gradio.FileData'}"
    ].join("\n"));
    const vulnerable = await evaluate();
    const finding = vulnerable.findings.find((item) => item.category === "file_payload_path_validation");
    assert.ok(finding, "Missing explicit FileData metadata validation must produce the reviewed advisory finding");
    assert.equal(finding.severity, "medium");
    assert.ok(finding.evidence.some((item) => item.startsWith("gradio/blocks.py:")));
    assert.ok(finding.evidence.some((item) => item.startsWith("gradio/data_classes.py:")));
    assert.equal(vulnerable.controlResults[0]?.status, "fail");

    await fs.writeFile(blocksPath, [
      "def preprocess(data_model, inputs_cached):",
      "    inputs_cached = data_model.model_validate(",
      "        inputs_cached, context={'validate_meta': True}",
      "    )"
    ].join("\n"));
    await fs.writeFile(dataClassesPath, [
      "class FileData(GradioModel):",
      "    path: str",
      "    meta: dict = {'_type': 'gradio.FileData'}",
      "    @classmethod",
      "    def validate_model(cls, v, info):",
      "        if info.context and not is_file_obj_with_meta(v):",
      "            raise ValueError('explicit meta required')",
      "        return v"
    ].join("\n"));
    const fixed = await evaluate();
    assert.equal(fixed.findings.some((item) => item.category === "file_payload_path_validation"), false);
    assert.equal(fixed.controlResults[0]?.status, "pass");
  });
}

async function testLangflowSensitiveOperationAuthenticationDetection(): Promise<void> {
  await withTempDir("tethermark-langflow-auth-", async (rootDir) => {
    const apiDir = path.join(rootDir, "src", "backend", "base", "langflow", "api", "v1");
    await fs.mkdir(apiDir, { recursive: true });
    const validatePath = path.join(apiDir, "validate.py");
    const controlCatalog = getControlCatalog().filter((item) => item.control_id === "owasp_api.sensitive_operation_authentication");
    const evaluate = () => evaluateStandardsAudit({
      rootPath: rootDir,
      analysis: {
        root_path: rootDir,
        project_name: "langflow-auth",
        file_count: 1,
        sample_files: ["src/backend/base/langflow/api/v1/validate.py"],
        frameworks: ["FastAPI"], languages: ["Python"], package_ecosystems: ["python"], package_managers: ["pip"],
        dependency_manifests: [], lockfiles: [], ci_workflows: [], container_files: [], release_files: [], deployment_configs: [],
        security_docs: [], auth_files: [], network_files: [], prompt_assets: [], mcp_indicators: [],
        agent_indicators: ["src/backend/base/langflow/api/v1/validate.py"], tool_execution_indicators: [], agentic_capabilities: [], agentic_control_indicators: []
      } as any,
      targetClass: "tool_using_multi_turn_agent" as any,
      threatModel: { framework_focus: ["OWASP API Security"], attack_surfaces: [], high_risk_components: [] } as any,
      toolExecutions: [], evidenceRecords: [], controlCatalog,
      applicableControlIds: controlCatalog.map((item) => item.control_id), deferredControlIds: [], nonApplicableControlIds: [],
      methodology: getMethodologyArtifact()
    });

    await fs.writeFile(validatePath, [
      "from fastapi import APIRouter, HTTPException",
      "from langflow.utils.validate import validate_code",
      "router = APIRouter()",
      "@router.post(\"/code\", status_code=200)",
      "async def post_validate_code(code: Code) -> CodeValidationResponse:",
      "    errors = validate_code(code.code)",
      "    return CodeValidationResponse(errors=errors)"
    ].join("\n"));
    const vulnerable = await evaluate();
    const finding = vulnerable.findings.find((item) => item.category === "api_broken_authentication");
    assert.ok(finding, "Unauthenticated Langflow code validation must produce the reviewed advisory finding");
    assert.equal(finding.severity, "critical");
    assert.ok(finding.evidence.some((item) => item.startsWith("src/backend/base/langflow/api/v1/validate.py:")));
    assert.equal(vulnerable.controlResults[0]?.status, "fail");

    await fs.writeFile(validatePath, [
      "from fastapi import APIRouter, HTTPException",
      "from langflow.api.utils import CurrentActiveUser",
      "from langflow.utils.validate import validate_code",
      "router = APIRouter()",
      "@router.post(\"/code\", status_code=200)",
      "async def post_validate_code(code: Code, _current_user: CurrentActiveUser) -> CodeValidationResponse:",
      "    errors = validate_code(code.code)",
      "    return CodeValidationResponse(errors=errors)"
    ].join("\n"));
    const fixed = await evaluate();
    assert.equal(fixed.findings.some((item) => item.category === "api_broken_authentication"), false);
    assert.equal(fixed.controlResults[0]?.status, "pass");
  });
}

async function testFindingReconciliationDoesNotSoftenFailedControls(): Promise<void> {
  const controls = updateControlResultsWithFindings([
    {
      control_id: "harness_internal.mcp_path_boundaries",
      framework: "Harness Internal Controls",
      standard_ref: "Harness Internal / MCP filesystem path boundaries",
      title: "Constrain MCP filesystem operations to their repository boundary",
      applicability: "applicable",
      assessability: "assessed",
      status: "fail",
      score_weight: 8,
      max_score: 8,
      score_awarded: 0,
      rationale: ["Known unsafe path-boundary pattern detected."],
      evidence: ["server.py: repo.index.add(files)"],
      finding_ids: ["stale_finding_id", "finding_path_boundary"],
      sources: ["repo-analysis"]
    }
  ], [
    {
      finding_id: "finding_path_boundary",
      title: "MCP git_add accepts paths outside its repository",
      severity: "medium",
      category: "mcp_path_boundary",
      description: "Caller-controlled paths reach a repository operation without boundary enforcement.",
      evidence: ["server.py: repo.index.add(files)"],
      public_safe: true,
      confidence: 0.86,
      score_impact: 8,
      source: "heuristic",
      control_ids: ["harness_internal.mcp_path_boundaries"],
      standards_refs: ["Harness Internal / MCP filesystem path boundaries"]
    }
  ]);

  assert.equal(controls[0]?.status, "fail");
  assert.equal(controls[0]?.score_awarded, 0);
  assert.deepEqual(controls[0]?.finding_ids, ["finding_path_boundary"]);
  assert.deepEqual(updateControlResultsWithFindings(controls, [])[0]?.finding_ids, []);
}

async function testDeterministicHeuristicFindingsRequireIntegrityApprovalToDrop(): Promise<void> {
  const makeFinding = (findingId: string, source: "heuristic" | "agent_synthesis") => ({
    finding_id: findingId,
    title: findingId,
    severity: "high",
    category: "agent_guardrails",
    description: findingId,
    evidence: ["artifact:repo-analysis"],
    public_safe: true,
    confidence: 0.8,
    score_impact: 8,
    source,
    control_ids: ["owasp_agentic.tool_misuse_boundary"],
    standards_refs: []
  });
  const protectedHeuristic = makeFinding("heuristic_partial", "heuristic");
  const unsupportedHeuristic = makeFinding("heuristic_unsupported", "heuristic");
  const synthesized = makeFinding("agent_synthesized", "agent_synthesis");
  const skeptic = {
    actions: [{
      type: "drop_findings",
      finding_ids: [protectedHeuristic.finding_id, unsupportedHeuristic.finding_id, synthesized.finding_id]
    }]
  } as any;
  const quality = {
    findings: [
      {
        finding_id: protectedHeuristic.finding_id,
        evidence_support_verdict: "partially_supported",
        control_mapping_verdict: "correct",
        integrity_blocking: false
      },
      {
        finding_id: unsupportedHeuristic.finding_id,
        evidence_support_verdict: "unsupported",
        control_mapping_verdict: "correct",
        integrity_blocking: true
      }
    ]
  } as any;

  const retained = applyUnsupportedFindingDrops([protectedHeuristic, unsupportedHeuristic, synthesized] as any, skeptic, quality);
  assert.deepEqual(retained.map((finding) => finding.finding_id), [protectedHeuristic.finding_id]);
}

async function testFinalFindingsRequireAnAssessedMappedControl(): Promise<void> {
  const makeFinding = (findingId: string, controlIds: string[]) => ({
    finding_id: findingId,
    title: findingId,
    severity: "high",
    category: "agent_guardrails",
    description: "review candidate",
    evidence: ["artifact:repo-analysis"],
    public_safe: true,
    confidence: 0.5,
    score_impact: 8,
    source: "heuristic",
    control_ids: controlIds,
    standards_refs: []
  });
  const controls = [
    { control_id: "control_not_assessed", assessability: "not_assessed", status: "not_assessed" },
    { control_id: "control_assessed", assessability: "assessed", status: "fail" }
  ] as any;
  const retained = retainFindingsSupportedByFinalControls([
    makeFinding("drop_not_assessed_only", ["control_not_assessed"]),
    makeFinding("keep_assessed", ["control_not_assessed", "control_assessed"]),
    makeFinding("keep_unknown_mapping_for_integrity_gate", ["missing_control"])
  ] as any, controls);
  assert.deepEqual(retained.map((finding) => finding.finding_id), ["keep_assessed", "keep_unknown_mapping_for_integrity_gate"]);
}

async function testDeterministicControlsRequireApprovalToDowngrade(): Promise<void> {
  const control = {
    control_id: "harness_internal.audit_traceability",
    assessability: "assessed",
    status: "pass",
    score_awarded: 6,
    rationale: ["Deterministic repository evidence was detected."]
  };
  const skeptic = {
    actions: [{
      type: "downgrade_controls",
      control_ids: [control.control_id]
    }]
  } as any;

  const protectedControls = applyControlDowngrades([control], skeptic);
  assert.deepEqual(protectedControls, [control]);

  const approvedControls = applyControlDowngrades([control], skeptic, [control.control_id]);
  assert.equal(approvedControls[0]?.assessability, "not_assessed");
  assert.equal(approvedControls[0]?.status, "not_assessed");
  assert.equal(approvedControls[0]?.score_awarded, 0);
}

async function testSelectiveCorrectionReplacesStaleLaneFindings(): Promise<void> {
  const makeFinding = (findingId: string, controlId: string, category: string) => ({
    finding_id: findingId,
    title: findingId,
    severity: "medium",
    category,
    description: `${findingId} description`,
    evidence: ["artifact:repo-analysis"],
    public_safe: true,
    confidence: 0.8,
    score_impact: 4,
    source: "heuristic",
    control_ids: [controlId],
    standards_refs: []
  });
  const makeControl = (controlId: string, framework: string) => ({
    control_id: controlId,
    framework,
    standard_ref: `${framework} / ${controlId}`,
    title: controlId,
    applicability: "applicable",
    assessability: "assessed",
    status: "partial",
    score_weight: 10,
    max_score: 10,
    score_awarded: 5,
    rationale: [],
    evidence: ["artifact:repo-analysis"],
    finding_ids: [],
    sources: ["repo_analysis"]
  });

  const staleAgenticFindings = [1, 2, 3, 4].map((index) => makeFinding(`stale_agentic_${index}`, "control.agentic", index % 2 ? "agent_guardrails" : "prompt_injection"));
  const retainedRepoFinding = makeFinding("retained_repo", "control.repo", "build_integrity");
  const replacementAgenticFinding = makeFinding("replacement_agentic", "control.agentic", "agent_guardrails");
  const globallyReemittedRepoFinding = makeFinding("reemitted_repo", "control.repo", "build_integrity");
  const agenticControl = makeControl("control.agentic", "OWASP Agentic Applications");
  const repoControl = makeControl("control.repo", "SLSA");
  const globallyRecomputedRepoControl = { ...repoControl, status: "fail", score_awarded: 0 };
  const sharedCycle = {
    runPlan: {},
    evidenceExecutions: [],
    evidenceRecords: [],
    laneSpecialistOutputs: [],
    observations: [],
    dimensionScores: [],
    staticScore: 0,
    scoreSummary: {}
  };
  const baseCycle = {
    ...sharedCycle,
    laneResults: [
      { lane_name: "agentic_controls", findings: staleAgenticFindings, control_results: [agenticControl], evidence_used: [], summary: [] },
      { lane_name: "supply_chain", findings: [retainedRepoFinding], control_results: [repoControl], evidence_used: [], summary: [] }
    ],
    controlResults: [agenticControl, repoControl],
    findings: [...staleAgenticFindings, retainedRepoFinding]
  };
  const patchCycle = {
    ...sharedCycle,
    laneResults: [
      { lane_name: "agentic_controls", findings: [replacementAgenticFinding], control_results: [agenticControl], evidence_used: [], summary: [] }
    ],
    controlResults: [agenticControl, globallyRecomputedRepoControl],
    findings: [replacementAgenticFinding, globallyReemittedRepoFinding]
  };
  const merged = mergeSelectiveAssessmentCycle({
    baseCycle,
    patchCycle,
    methodology: { version: "test-methodology" } as any,
    analysisProjectName: "selective-correction-fixture",
    controlCatalog: [
      { control_id: "control.agentic", baseline_dimension: "agentic_guardrails" },
      { control_id: "control.repo", baseline_dimension: "repo_posture" }
    ]
  });

  assert.deepEqual(merged.cycle.findings.map((finding: any) => finding.finding_id).sort(), ["replacement_agentic", "retained_repo"]);
  assert.equal(merged.cycle.findings.some((finding: any) => finding.finding_id.startsWith("stale_agentic_")), false);
  assert.equal(merged.cycle.controlResults.find((control: any) => control.control_id === "control.repo")?.score_awarded, repoControl.score_awarded);
  assert.match(merged.cycle.scoreSummary.leaderboard_summary, /2 findings were emitted/);
}

async function testFindingEvaluationUsesEvidenceSymbolsForGrouping(): Promise<void> {
  const summary = buildFindingEvaluationSummary({
    findings: [
      {
        id: "finding_symbol_left",
        run_id: "run_symbol_grouping",
        lane_name: null,
        title: "Unsafe tool access path",
        severity: "high",
        category: "tool_boundary",
        description: "Privileged tool access is exposed through one path.",
        confidence: 0.82,
        source: "tool",
        publication_state: "internal_only",
        needs_human_review: true,
        score_impact: 8,
        control_ids_json: ["CTRL-SYMBOL"],
        standards_refs_json: [],
        evidence_json: ["path A"],
        created_at: "2026-04-18T00:00:00.000Z"
      } as any,
      {
        id: "finding_symbol_right",
        run_id: "run_symbol_grouping",
        lane_name: null,
        title: "Privileged execution route",
        severity: "low",
        category: "access_control",
        description: "A second tool surfaced the same underlying issue.",
        confidence: 0.66,
        source: "tool",
        publication_state: "public_safe",
        needs_human_review: true,
        score_impact: 3,
        control_ids_json: ["CTRL-OTHER"],
        standards_refs_json: [],
        evidence_json: ["path B"],
        created_at: "2026-04-18T00:01:00.000Z"
      } as any
    ],
    supervisorReview: null,
    workflow: null,
    actions: [],
    comments: [],
    dispositions: [],
    sandboxExecution: null,
    runtimeFollowups: [],
    evidenceRecords: [
      {
        evidence_id: "e_symbol_left",
        control_ids_json: ["CTRL-SYMBOL"],
        summary: "shared analyzer evidence",
        locations_json: [
          {
            source_kind: "symbol",
            symbol: "unsafe_tool_access",
            label: "semgrep_rule"
          }
        ]
      },
      {
        evidence_id: "e_symbol_right",
        control_ids_json: ["CTRL-OTHER"],
        summary: "shared analyzer evidence",
        locations_json: [
          {
            source_kind: "symbol",
            symbol: "unsafe_tool_access",
            label: "trivy_rule"
          }
        ]
      }
    ]
  });

  assert.equal(summary.duplicate_groups.length, 1);
  assert.deepEqual(summary.duplicate_groups[0], ["finding_symbol_left", "finding_symbol_right"]);
  assert.equal(summary.conflict_pairs.length, 1);
  assert.equal(summary.conflict_pairs[0]?.reason, "linked controls have conflicting visibility/publication posture");
  assert.deepEqual(summary.evaluations.find((item) => item.finding_id === "finding_symbol_left")?.evidence_symbols, ["unsafe_tool_access"]);
  assert.deepEqual(summary.evaluations.find((item) => item.finding_id === "finding_symbol_left")?.duplicate_with_finding_ids, ["finding_symbol_right"]);
  assert.deepEqual(summary.evaluations.find((item) => item.finding_id === "finding_symbol_right")?.duplicate_with_finding_ids, ["finding_symbol_left"]);
}

async function testFindingQualityFlagsUnsupportedEvidenceAndControlMismatch(): Promise<void> {
  const summary = buildFindingQualitySummary({
    runId: "run_quality",
    request: { run_mode: "static" },
    findings: [
      {
        finding_id: "finding_quality_bad",
        title: "Runtime exploit validated against agent tool boundary",
        severity: "high",
        category: "runtime_validation",
        description: "The issue is exploitable at runtime.",
        evidence: ["missing runtime proof"],
        public_safe: false,
        confidence: 0.9,
        score_impact: 8,
        source: "agent_synthesis",
        control_ids: ["openssf.security_policy"],
        standards_refs: []
      }
    ],
    evidenceRecords: [
      {
        evidence_id: "e_security_policy",
        run_id: "run_quality",
        source_type: "analysis",
        source_id: "repo_analysis",
        control_ids: ["openssf.security_policy"],
        summary: "No visible SECURITY.md file was found.",
        confidence: 0.9,
        metadata: {}
      }
    ],
    controlResults: [
      {
        control_id: "openssf.security_policy",
        framework: "OpenSSF Scorecard",
        standard_ref: "Security-Policy",
        title: "Publish a security policy",
        applicability: "applicable",
        assessability: "assessed",
        status: "fail",
        score_weight: 1,
        max_score: 1,
        score_awarded: 0,
        rationale: ["No security policy was found."],
        evidence: ["e_security_policy"],
        finding_ids: ["finding_quality_bad"],
        sources: ["repo_analysis"]
      }
    ],
    controlCatalog: getControlCatalog(),
    toolExecutions: []
  });

  const quality = summary.findings[0]!;
  assert.equal(summary.overall_verdict, "fail");
  assert.equal(quality.qa_blocking, true);
  assert.equal(quality.evidence_support_verdict, "partially_supported");
  assert.equal(quality.control_mapping_verdict, "wrong_control");
  assert.equal(quality.unsupported_claims.some((claim) => /runtime|exploit/i.test(claim)), true);
  assert.equal(quality.next_action === "fix_control_mapping" || quality.next_action === "needs_runtime_validation", true);
}

async function testFindingQualityTreatsStaticDependencyAdvisoryImpactAsMetadata(): Promise<void> {
  const summary = buildFindingQualitySummary({
    runId: "run_static_dependency_advisory",
    request: { run_mode: "static" },
    mode: "post_supervisor_integrity",
    findings: [
      {
        finding_id: "finding_trivy_advisory",
        title: "Trivy: dependency is vulnerable to potential command execution",
        severity: "high",
        category: "dependency_or_misconfig",
        description: "Trivy reported advisory impact during the static audit. No runtime execution or exploit reproduction was performed.",
        evidence: ["e_trivy_advisory"],
        public_safe: true,
        confidence: 0.7,
        score_impact: 6,
        source: "tool",
        control_ids: ["openssf.pinned_dependencies"],
        standards_refs: []
      }
    ],
    evidenceRecords: [
      {
        evidence_id: "e_trivy_advisory",
        run_id: "run_static_dependency_advisory",
        source_type: "scanner",
        source_id: "trivy",
        control_ids: ["openssf.pinned_dependencies"],
        summary: "Trivy dependency advisory result for an affected package version.",
        confidence: 0.9,
        metadata: {}
      }
    ],
    controlResults: [
      {
        control_id: "openssf.pinned_dependencies",
        framework: "OpenSSF Scorecard",
        standard_ref: "Pinned-Dependencies",
        title: "Pin dependencies",
        applicability: "applicable",
        assessability: "assessed",
        status: "partial",
        score_weight: 1,
        max_score: 1,
        score_awarded: 0.5,
        rationale: ["Trivy reported an affected dependency version."],
        evidence: ["e_trivy_advisory"],
        finding_ids: ["finding_trivy_advisory"],
        sources: ["trivy"]
      }
    ],
    controlCatalog: getControlCatalog(),
    toolExecutions: [{ provider_id: "trivy", status: "completed" } as any]
  });

  const quality = summary.findings[0]!;
  assert.deepEqual(quality.unsupported_claims, []);
  assert.equal(quality.integrity_blocking, false);
  assert.equal(quality.next_action, "ready_for_review");
}

async function testPostSupervisorIntegrityDoesNotVetoSemanticMappingHints(): Promise<void> {
  const summary = buildFindingQualitySummary({
    runId: "run_integrity",
    request: { run_mode: "static" },
    mode: "post_supervisor_integrity",
    findings: [
      {
        finding_id: "finding_integrity_hint",
        title: "Browser automation surface lacks visible safety policy",
        severity: "high",
        category: "browser_automation_safety",
        description: "The static review identified browser automation capability without clear navigation or download policy evidence.",
        evidence: ["e_security_policy"],
        public_safe: true,
        confidence: 0.7,
        score_impact: 8,
        source: "agent_synthesis",
        control_ids: ["openssf.security_policy"],
        standards_refs: []
      }
    ],
    evidenceRecords: [
      {
        evidence_id: "e_security_policy",
        run_id: "run_integrity",
        source_type: "analysis",
        source_id: "repo_analysis",
        control_ids: ["openssf.security_policy"],
        summary: "No visible SECURITY.md file was found.",
        confidence: 0.9,
        metadata: {}
      }
    ],
    controlResults: [
      {
        control_id: "openssf.security_policy",
        framework: "OpenSSF Scorecard",
        standard_ref: "Security-Policy",
        title: "Publish a security policy",
        applicability: "applicable",
        assessability: "assessed",
        status: "fail",
        score_weight: 1,
        max_score: 1,
        score_awarded: 0,
        rationale: ["No security policy was found."],
        evidence: ["e_security_policy"],
        finding_ids: ["finding_integrity_hint"],
        sources: ["repo_analysis"]
      }
    ],
    controlCatalog: getControlCatalog(),
    toolExecutions: []
  });

  const quality = summary.findings[0]!;
  assert.equal(summary.artifact_role, "post_supervisor_integrity");
  assert.equal(quality.control_mapping_verdict, "weak");
  assert.equal(quality.semantic_review_hint, true);
  assert.equal(quality.integrity_blocking, false);
  assert.equal(quality.qa_blocking, false);
}

async function testRunComparisonUsesEvidenceSymbolsForMatching(): Promise<void> {
  const comparison = buildRunComparisonReport({
    currentRunId: "run_current",
    compareToRunId: "run_previous",
    currentFindings: [
      {
        id: "finding_current",
        title: "Privileged execution route",
        category: "access_control",
        severity: "medium",
        confidence: 0.72
      }
    ],
    previousFindings: [
      {
        id: "finding_previous",
        title: "Unsafe tool access path",
        category: "tool_boundary",
        severity: "high",
        confidence: 0.81
      }
    ],
    currentEvaluations: {
      evaluations: [
        {
          finding_id: "finding_current",
          current_severity: "medium",
          evidence_sufficiency: "medium",
          runtime_validation_status: "recommended",
          runtime_followup_policy: "runtime_validation_recommended",
          runtime_followup_resolution: "none",
          next_action: "request_validation",
          evidence_symbols: ["unsafe_tool_access"]
        }
      ],
      runtime_followup_required_count: 1,
      runtime_validation_blocked_count: 0
    },
    previousEvaluations: {
      evaluations: [
        {
          finding_id: "finding_previous",
          current_severity: "high",
          evidence_sufficiency: "high",
          runtime_validation_status: "failed",
          runtime_followup_policy: "rerun_in_capable_env",
          runtime_followup_resolution: "rerun_requested",
          next_action: "rerun_in_capable_env",
          evidence_symbols: ["unsafe_tool_access"]
        }
      ],
      runtime_followup_required_count: 1,
      runtime_validation_blocked_count: 1
    },
    currentSummary: { overall_score: 72 },
    previousSummary: { overall_score: 61 }
  });

  assert.equal(comparison.summary.new_finding_count, 0);
  assert.equal(comparison.summary.resolved_finding_count, 0);
  assert.equal(comparison.summary.changed_finding_count, 1);
  assert.equal(comparison.summary.evidence_symbol_matched_count, 1);
  assert.equal(comparison.changed_findings[0]?.match_strategy, "evidence_symbols");
  assert.deepEqual(comparison.changed_findings[0]?.shared_evidence_symbols, ["unsafe_tool_access"]);
  assert.equal(comparison.changed_findings[0]?.previous_finding_id, "finding_previous");
  assert.equal(comparison.changed_findings[0]?.current_finding_id, "finding_current");
}

async function testAssistantStorageAndCapabilities(): Promise<void> {
  await withTempDir("tethermark-assistant-", async (rootDir) => {
    const registry = createDefaultAssistantToolRegistry();
    assert.deepEqual(registry.capabilities("oss").allowed_scopes, ["run", "target"]);
    assert.equal(registry.isScopeAllowed("project", "oss"), false);
    assert.equal(registry.isScopeAllowed("project", "hosted"), true);

    const storage = new SqliteAssistantStorage({ rootDir, dbMode: "local" });
    const session = await storage.createSession({
      scope_type: "run",
      scope_id: "run_test",
      workspace_id: "default",
      project_id: "default",
      target_id: "target_test",
      run_id: "run_test",
      actor_id: "tester",
      product_mode: "oss",
      metadata_json: null
    });
    const userMessage = await storage.appendMessage({
      session_id: session.id,
      role: "user",
      body: "Give me a manager summary.",
      response_json: null
    });
    assert.equal((await storage.listSessions({ scopeType: "run", scopeId: "run_test" })).length, 1);
    const renamedSession = await storage.updateSession({
      ...session,
      metadata_json: { title: "Manager summary chat" }
    });
    assert.equal(renamedSession.metadata_json?.title, "Manager summary chat");
    const archivedSession = await storage.updateSession({ ...renamedSession, status: "archived" });
    assert.equal((await storage.listSessions({ scopeType: "run", scopeId: "run_test" })).length, 0);
    assert.equal((await storage.listSessions({ scopeType: "run", scopeId: "run_test", status: "all" })).length, 1);
    await storage.updateSession({ ...archivedSession, status: "active" });
    const assistantMessage = await storage.appendMessage({
      session_id: session.id,
      role: "assistant",
      body: "Summary",
      response_json: {
        message: "Summary",
        citations: [{ citation_type: "run", id: "run_test", label: "Run run_test", run_id: "run_test" }],
        confidence: "high",
        proposed_actions: [{
          id: "action_export",
          action_type: "generate_export",
          capability: "confirm_internal",
          title: "Generate export",
          summary: "Prepare export",
          requires_confirmation: true,
          hosted_only: false,
          payload_json: { run_id: "run_test" }
        }],
        limitations: []
      }
    });
    assert.equal(userMessage.role, "user");
    const artifacts = await storage.persistResponseArtifacts({
      sessionId: session.id,
      messageId: assistantMessage.id,
      response: assistantMessage.response_json!
    });
    assert.equal(artifacts.citations.length, 1);
    assert.equal(artifacts.actions.length, 1);
    const action = await storage.getActionProposal(session.id, "action_export");
    assert.equal(action?.requires_confirmation, true);
    await storage.updateActionProposal({ ...action!, status: "rejected", resolved_at: new Date().toISOString(), resolved_by: "tester" });
    const execution = await storage.createActionExecution({
      session_id: session.id,
      action_id: "action_export",
      actor_id: "tester",
      status: "rejected",
      original_user_request: "Give me a manager summary.",
      proposed_action_json: action!,
      confirmation_result: "rejected",
      before_state_json: null,
      after_state_json: null,
      request_json: {},
      result_json: { status: "rejected" },
      error: null
    });
    assert.equal(execution.status, "rejected");
    assert.equal((await storage.listMessages(session.id)).length, 2);
  });
}

async function testAssistantProviderCitesFindings(): Promise<void> {
  const provider = new EvidenceGroundedAssistantProvider();
  const response = await provider.answer({
    prompt: "Give me a manager summary and export it.",
    session: {
      id: "session_test",
      scope_type: "run",
      scope_id: "run_test",
      workspace_id: "default",
      project_id: "default",
      target_id: "target_test",
      run_id: "run_test",
      actor_id: "tester",
      product_mode: "oss",
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      metadata_json: null
    },
    capabilities: createDefaultAssistantToolRegistry().capabilities("oss"),
    context: {
      scope_type: "run",
      scope_id: "run_test",
      run: {
        id: "run_test",
        target_id: "target_test",
        target_snapshot_id: "snapshot_test",
        workspace_id: "default",
        project_id: "default",
        requested_by: "tester",
        policy_pack_id: null,
        status: "completed",
        run_mode: "static",
        audit_package: "agentic-static",
        artifact_root: "",
        started_at: "2026-01-01T00:00:00.000Z",
        completed_at: "2026-01-01T00:01:00.000Z",
        static_score: 70,
        overall_score: 70,
        rating: "needs_review",
        created_at: "2026-01-01T00:00:00.000Z",
        canonical_target_id: "target_test",
        finding_count: 1,
        lane_specialist_count: 0
      } as any,
      target: null,
      target_runs: [],
      score_summary: null,
      review_decision: { run_id: "run_test", publishability_status: "internal_only", human_review_required: true } as any,
      review_workflow: null,
      review_actions: [],
      review_comments: [],
      findings: [{
        id: "finding_test",
        run_id: "run_test",
        lane_name: "agentic_controls",
        title: "Tool boundary is unclear",
        severity: "high",
        category: "agentic_controls",
        description: "The agent tool boundary lacks explicit policy.",
        confidence: 0.8,
        source: "analysis",
        publication_state: "internal_only",
        needs_human_review: true,
        score_impact: 10,
        control_ids_json: ["control_test"],
        standards_refs_json: [],
        evidence_json: [],
        created_at: "2026-01-01T00:00:00.000Z"
      }],
      target_history_findings: {},
      evidence_records: [],
      tool_executions: [],
      artifact_index: [],
      remediation_memo: null,
      remediation_items: [],
      review_summary: null,
      finding_evaluations: null,
      executive_summary: null
    }
  });
  assert.equal(response.citations.some((citation) => citation.citation_type === "finding" && citation.id === "finding_test"), true);
  assert.equal(response.proposed_actions.some((action) => action.action_type === "generate_export"), true);
}

async function persistAssistantApiFixture(rootDir: string): Promise<void> {
  const artifactRoot = path.join(rootDir, "artifacts", "assistant");
  const localDbRoot = path.join(rootDir, ".artifacts", "state", "local-db");
  await fs.mkdir(artifactRoot, { recursive: true });
  const store = new LocalPersistenceStore(localDbRoot);
  const baseBundle = (runId: string, createdAt: string, findingId: string) => ({
    mode: "local",
    package_definition: { id: "deep-static", title: "Deep Static", description: "", run_mode: "static", default_policy_profile: "default", requires_agents: false, lane_specialists_enabled: false, focus: [], minimum_tools: [], scorecard_weights: {} },
    target: { id: "target_assistant", target_type: "path", canonical_name: "assistant target", repo_url: null, local_path: path.join(rootDir, "target"), endpoint_url: null, created_at: "2026-05-01T00:00:00.000Z" },
    target_snapshot: { id: `${runId}:snapshot`, target_id: "target_assistant", snapshot_value: path.join(rootDir, "target"), commit_sha: null, captured_at: createdAt, analysis_hash: null },
    target_summary: { id: "target_assistant", target_id: "target_assistant", canonical_target_id: "target_assistant", workspace_id: "default", project_id: "default", canonical_name: "assistant target", target_type: "path", repo_url: null, local_path: path.join(rootDir, "target"), endpoint_url: null, latest_run_id: runId, latest_run_created_at: createdAt, latest_status: "succeeded", latest_run_mode: "static", latest_audit_package: "deep-static", latest_target_class: "runnable_local_app", latest_rating: "needs_review", latest_overall_score: 64, latest_static_score: 64, latest_publishability_status: "internal_only", latest_human_review_required: true, latest_finding_count: 1, latest_frameworks_json: [], latest_languages_json: ["typescript"], latest_package_ecosystems_json: ["npm"], updated_at: createdAt },
    policy_pack: null,
    run: { id: runId, target_id: "target_assistant", target_snapshot_id: `${runId}:snapshot`, workspace_id: "default", project_id: "default", requested_by: "tester", policy_pack_id: null, status: "succeeded", run_mode: "static", audit_package: "deep-static", artifact_root: artifactRoot, started_at: createdAt, completed_at: createdAt, static_score: 64, overall_score: 64, rating: "needs_review", created_at: createdAt },
    resolved_configuration: { run_id: runId, policy_pack_id: null, policy_pack_name: null, policy_pack_source: null, policy_profile: null, policy_version: null, requested_policy_pack: null, requested_audit_package: "deep-static", selected_audit_package: "deep-static", audit_package_title: "Deep Static", audit_package_selection_mode: "explicit", initial_target_class: "runnable_local_app", run_mode: "static", target_kind: "path", db_mode: "local", output_dir: null, validation_json: { valid: true, errors: [], warnings: [] }, request_summary_json: {}, policy_pack_json: {}, audit_package_json: {} },
    commit_diff: { run_id: runId, previous_run_id: null, current_commit_sha: null, previous_commit_sha: null, comparison_mode: "no_prior_run", changed_files_json: [], stage_decisions_json: {}, rationale_json: [] },
    correction_plan: null,
    correction_result: null,
    lane_reuse_decisions: [],
    persistence_summary: { run_id: runId, mode: "local", root: localDbRoot },
    stage_artifacts: [],
    stage_executions: [],
    lane_plans: [],
    evidence_records: [{ id: `${runId}:evidence`, run_id: runId, lane_name: null, source_type: "tool", source_id: "assistant-test", control_ids_json: ["CTRL-A"], summary: "Assistant API fixture evidence.", confidence: 0.9, raw_artifact_path: null, locations_json: [], metadata_json: {} }],
    lane_results: [],
    lane_specialists: [],
    agent_invocations: [],
    tool_executions: [],
    findings: [{ id: findingId, run_id: runId, lane_name: null, title: "Recurring unsafe automation boundary", severity: "high", category: "agentic_controls", description: "The automation boundary needs reviewer validation.", confidence: 0.82, source: "tool", publication_state: "internal_only", needs_human_review: true, score_impact: 12, control_ids_json: ["CTRL-A"], standards_refs_json: [], evidence_json: [`${runId}:evidence`], created_at: createdAt }],
    control_results: [],
    score_summary: { run_id: runId, methodology_version: "1", overall_score: 64, rating: "needs_review", leaderboard_summary: "assistant fixture", limitations_json: [] },
    review_decision: { run_id: runId, publishability_status: "internal_only", human_review_required: true, public_summary_safe: false, threshold: "standard", rationale_json: [], gating_findings_json: [findingId], recommended_visibility: "internal" },
    supervisor_review: null,
    remediation_memo: { run_id: runId, summary: "Validate the unsafe automation boundary and document owner acceptance.", checklist_json: ["validate boundary", "assign owner"], human_review_required: true },
    review_workflow: { run_id: runId, status: "review_required", current_reviewer_id: null, assigned_by: null, assigned_at: null, started_at: null, completed_at: null, completed_by: null, last_action_at: createdAt, summary: "Review required", handoff_json: {} },
    review_actions: [],
    review_comments: [],
    finding_dispositions: [],
    ui_settings: null,
    ui_documents: [],
    policy_application: { run_id: runId, policy_pack_id: null, policy_pack_source: null, profile: null, required_controls_json: [], excluded_controls_json: [], included_controls_json: ["CTRL-A"], evaluation_notes_json: [] },
    dimension_scores: [],
    metrics: [],
    events: [],
    artifact_index: []
  } as any);
  await store.persistBundle(baseBundle("run_assistant_prev", "2026-05-01T00:00:00.000Z", "finding_assistant_prev"));
  await store.persistBundle(baseBundle("run_assistant", "2026-05-02T00:00:00.000Z", "finding_assistant"));
}

async function testAssistantApiScopesActionsAndTargetHistory(): Promise<void> {
  await withTempDir("tethermark-assistant-api-", async (rootDir) => {
    await fs.mkdir(path.join(rootDir, "target"), { recursive: true });
    await persistAssistantApiFixture(rootDir);
    await withWorkingDir(rootDir, async () => {
      const localDbRoot = path.join(rootDir, ".artifacts", "state", "local-db");
      const savedEnv = new Map(["HARNESS_ENABLE_ASSISTANT", "HARNESS_DISABLE_ASSISTANT", "HARNESS_API_AUTH_MODE", "HARNESS_DISABLE_LEARNING_SCHEDULER", "HARNESS_LOCAL_DB_ROOT"].map((key) => [key, process.env[key]] as const));
      delete process.env.HARNESS_ENABLE_ASSISTANT;
      delete process.env.HARNESS_DISABLE_ASSISTANT;
      process.env.HARNESS_API_AUTH_MODE = "none";
      process.env.HARNESS_DISABLE_LEARNING_SCHEDULER = "1";
      process.env.HARNESS_LOCAL_DB_ROOT = localDbRoot;
      const apiServer = createApiServer();
      await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", () => resolve()));
      const address = apiServer.address();
      assert.ok(address && typeof address !== "string");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      try {
        const capabilities = await (await fetch(`${baseUrl}/assistant/capabilities`)).json() as any;
        assert.equal(capabilities.enabled, true);
        assert.equal(capabilities.allowed_scopes.includes("run"), true);
        assert.equal(capabilities.allowed_scopes.includes("organization"), false);

        const hostedScopeResponse = await fetch(`${baseUrl}/assistant/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope_type: "organization", scope_id: "org_test" })
        });
        assert.equal(hostedScopeResponse.status, 403);

        const sessionResponse = await fetch(`${baseUrl}/assistant/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope_type: "run", scope_id: "run_assistant" })
        });
        const sessionPayload = await sessionResponse.json() as any;
        assert.equal(sessionResponse.status, 201);
        const sessionId = sessionPayload.assistant_session.id;
        const assistantTargetId = sessionPayload.assistant_session.target_id;

        const sessionsListResponse = await fetch(`${baseUrl}/assistant/sessions?scope_type=run&scope_id=run_assistant`);
        const sessionsListPayload = await sessionsListResponse.json() as any;
        assert.equal(sessionsListResponse.status, 200);
        assert.equal(sessionsListPayload.assistant_sessions.some((item: any) => item.id === sessionId), true);

        const renameResponse = await fetch(`${baseUrl}/assistant/sessions/${encodeURIComponent(sessionId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "Renamed assistant chat" })
        });
        const renamePayload = await renameResponse.json() as any;
        assert.equal(renameResponse.status, 200);
        assert.equal(renamePayload.assistant_session.metadata_json.title, "Renamed assistant chat");

        const messageResponse = await fetch(`${baseUrl}/assistant/sessions/${encodeURIComponent(sessionId)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Add a review comment for finding_assistant and give a manager summary." })
        });
        const messagePayload = await messageResponse.json() as any;
        assert.equal(messageResponse.status, 200);
        assert.equal(messagePayload.response.citations.some((item: any) => item.id === "finding_assistant"), true);
        const commentAction = messagePayload.proposed_actions.find((item: any) => item.action_type === "add_review_comment");
        assert.ok(commentAction);

        const confirmResponse = await fetch(`${baseUrl}/assistant/sessions/${encodeURIComponent(sessionId)}/actions/${encodeURIComponent(commentAction.id)}/confirm`, { method: "POST" });
        const confirmPayload = await confirmResponse.json() as any;
        assert.equal(confirmResponse.status, 200);
        assert.equal(confirmPayload.assistant_execution.original_user_request.includes("review comment"), true);
        assert.equal(confirmPayload.assistant_execution.confirmation_result, "confirmed");
        assert.ok(confirmPayload.assistant_execution.before_state_json);
        assert.ok(confirmPayload.assistant_execution.after_state_json);
        assert.equal((await readPersistedReviewComments("run_assistant", { rootDir: localDbRoot, dbMode: "local" })).length, 1);

        const storage = new SqliteAssistantStorage({ rootDir: localDbRoot, dbMode: "local" });
        const hostedMessage = await storage.appendMessage({
          session_id: sessionId,
          role: "assistant",
          body: "Hosted external send requires hosted mode.",
          response_json: {
            message: "Hosted external send requires hosted mode.",
            citations: [],
            confidence: "medium",
            proposed_actions: [{ id: "hosted_action_test", action_type: "hosted_only", capability: "confirm_external", title: "Send Slack notification", summary: "Hosted-only external send.", requires_confirmation: true, hosted_only: true, payload_json: { requested_from: "send to slack" } }],
            limitations: []
          }
        });
        await storage.persistResponseArtifacts({ sessionId, messageId: hostedMessage.id, response: hostedMessage.response_json! });
        const hostedActionResponse = await fetch(`${baseUrl}/assistant/sessions/${encodeURIComponent(sessionId)}/actions/hosted_action_test/confirm`, { method: "POST" });
        assert.equal(hostedActionResponse.status, 403);

        const targetSessionResponse = await fetch(`${baseUrl}/assistant/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope_type: "target", scope_id: assistantTargetId })
        });
        const targetSessionPayload = await targetSessionResponse.json() as any;
        assert.equal(targetSessionResponse.status, 201, JSON.stringify(targetSessionPayload));
        const targetMessageResponse = await fetch(`${baseUrl}/assistant/sessions/${encodeURIComponent(targetSessionPayload.assistant_session.id)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Which findings keep recurring?" })
        });
        const targetMessagePayload = await targetMessageResponse.json() as any;
        assert.equal(targetMessageResponse.status, 200);
        assert.match(targetMessagePayload.response.message, /Recurring unsafe automation boundary|Recurring findings/i);

        const deleteTargetSessionResponse = await fetch(`${baseUrl}/assistant/sessions/${encodeURIComponent(targetSessionPayload.assistant_session.id)}`, { method: "DELETE" });
        assert.equal(deleteTargetSessionResponse.status, 200);
        const deletedTargetListResponse = await fetch(`${baseUrl}/assistant/sessions?scope_type=target&scope_id=${encodeURIComponent(assistantTargetId)}`);
        const deletedTargetListPayload = await deletedTargetListResponse.json() as any;
        assert.equal(deletedTargetListPayload.assistant_sessions.some((item: any) => item.id === targetSessionPayload.assistant_session.id), false);

        process.env.HARNESS_DISABLE_ASSISTANT = "1";
        const disabledCapabilities = await (await fetch(`${baseUrl}/assistant/capabilities`)).json() as any;
        assert.equal(disabledCapabilities.enabled, false);
      } finally {
        await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
        for (const [key, value] of savedEnv.entries()) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });
  });
}

async function testApprovedLearningOverlayConsumptionAndRollback(): Promise<void> {
  await withTempDir("tethermark-learning-overlay-", async (rootDir) => {
    const dbRoot = path.join(rootDir, "local-db");
    const createdAt = "2026-08-01T00:00:00.000Z";
    const candidate = (id: string, candidateType: string, signature: string, riskLevel: "medium" | "high") => ({
      id,
      workspace_id: "default",
      project_id: "default",
      scope_type: "target",
      scope_id: "target_overlay",
      target_id: "target_overlay",
      candidate_type: candidateType,
      status: "experimented",
      title: `${candidateType} title`,
      summary: `${candidateType} reviewed summary`,
      rationale: "Repeated reviewed signal.",
      proposed_change_json: { finding_signature: signature },
      source_event_ids_json: [`event_${id}_1`, `event_${id}_2`],
      affected_finding_signatures_json: [signature],
      expected_effect_json: { source_event_count: 2, source_run_ids: ["run_1", "run_2"] },
      risk_level: riskLevel,
      requires_human_approval: true,
      created_at: createdAt,
      updated_at: createdAt,
      created_by: "system_learning",
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      expires_at: null,
      metadata_json: {}
    });
    const db = await openSqliteDatabase(dbRoot);
    try {
      ensureSqliteSchema(db);
      for (const item of [
        {
          ...candidate("candidate_evidence", "evidence_requirement_adjustment", "auth::missing-evidence", "medium"),
          title: "PROVIDER_OUTPUT_CORPUS_MARKER title",
          summary: "PROVIDER_OUTPUT_CORPUS_MARKER summary",
          metadata_json: { llm_synthesis: { status: "completed", output_use: "current_candidate_review_only" } }
        },
        candidate("candidate_severity", "severity_calibration_suggestion", "auth::accepted-risk", "high")
      ]) {
        upsertSqliteRecord({
          db,
          tableName: "learning_candidates",
          recordKey: item.id,
          targetId: item.target_id,
          parentKey: item.scope_id,
          createdAt: item.created_at,
          payload: item
        });
      }
      await saveSqliteDatabase(dbRoot, db, "local");
    } finally {
      db.close();
    }

    const evidencePromotion = await promoteLearningCandidate({
      candidateId: "candidate_evidence",
      actorId: "human_reviewer",
      expiresAt: "2027-01-01T00:00:00.000Z",
      rootDirOrOptions: { rootDir: dbRoot, dbMode: "local" }
    });
    await promoteLearningCandidate({
      candidateId: "candidate_severity",
      actorId: "human_reviewer",
      expiresAt: "2027-01-01T00:00:00.000Z",
      rootDirOrOptions: { rootDir: dbRoot, dbMode: "local" }
    });
    assert.match(evidencePromotion.promotion.promoted_artifact_version, /^learning-overlay\.v1\.[a-f0-9]{24}$/);
    assert.equal((evidencePromotion.promotion.rollback_pointer_json as any).deactivates_artifact_version, evidencePromotion.promotion.promoted_artifact_version);

    const resolution = await resolveLearningOverlays({
      runId: "run_overlay",
      targetId: "target_overlay",
      workspaceId: "default",
      projectId: "default",
      now: new Date("2026-09-01T00:00:00.000Z"),
      rootDirOrOptions: { rootDir: dbRoot, dbMode: "local" }
    });
    assert.equal(resolution.active_overlays.length, 2);
    assert.deepEqual(resolution.additive_rules.evidence_requirement_signatures, ["auth::missing-evidence"]);
    assert.equal(resolution.active_overlays.find((item) => item.candidate_id === "candidate_severity")?.effect_mode, "governed_no_runtime_effect");
    assert.deepEqual(resolution.prompt_guidance.map((item) => item.promotion_id), [evidencePromotion.promotion.id]);
    assert.doesNotMatch(JSON.stringify(resolution), /PROVIDER_OUTPUT_CORPUS_MARKER/);

    const plannerArtifact = applyLearningOverlayPlannerRules({
      selected_profile: "deep-static",
      classification_review: { semantic_class: "repo_posture_only", final_class: "repo_posture_only", secondary_traits: [], confidence: 1, evidence: [] },
      frameworks_in_scope: [],
      applicable_control_ids: [],
      deferred_control_ids: [],
      non_applicable_control_ids: [],
      rationale: [],
      constraints: { max_runtime_minutes: 0, network_mode: "none", sandbox_required: false, install_allowed: false, read_only_analysis_only: true, target_execution_allowed: false }
    }, resolution);
    assert.equal(plannerArtifact.rationale.some((item) => item.includes(resolution.resolution_version)), true);
    assert.equal(plannerArtifact.rationale.some((item) => item.includes("not executed")), true);

    const evalSelection = applyLearningOverlayEvidenceRules({
      baseline_tools: [],
      runtime_tools: [],
      custom_eval_packs: [],
      validation_candidates: [],
      control_tool_map: [],
      rationale: []
    }, resolution);
    assert.deepEqual(evalSelection.validation_candidates, ["approved-learning-overlay:auth::missing-evidence"]);

    const plannerContext = buildPlannerContext({
      request: { run_mode: "static", hints: { approved_learning_overlay_resolution: resolution } },
      sandbox: { run_mode: "static", backend: "windows_local", target_dir: rootDir },
      target: { target_id: "target_overlay", target_type: "path", repo_url: null, local_path: rootDir, endpoint_url: null, snapshot: { type: "filesystem", value: rootDir, captured_at: createdAt, commit_sha: null }, hints: {} },
      analysis: { project_name: "overlay", file_count: 1, frameworks: [], languages: [], entry_points: [], ci_workflows: [], security_docs: [], dependency_manifests: [], mcp_indicators: [], agent_indicators: [], tool_execution_indicators: [] },
      repoContext: { summary: [], capability_signals: [], documents: [] },
      targetProfile: { heuristic: { primary_class: "repo_posture_only", secondary_traits: [], confidence: 1, evidence: [] }, semantic_review: { semantic_class: "repo_posture_only", final_class: "repo_posture_only", secondary_traits: [], confidence: 1, evidence: [] } },
      controlCatalog: [],
      methodology: { version: "test", summary: "test" },
      auditPolicy: {}
    });
    assert.equal((plannerContext.approvedLearningOverlays as any).resolution_version, resolution.resolution_version);
    assert.match(String((plannerContext.approvedLearningOverlays as any).trust_boundary), /untrusted reviewed data/);

    await rollbackLearningPromotion({
      promotionId: evidencePromotion.promotion.id,
      actorId: "human_reviewer",
      reason: "Rollback regression",
      rootDirOrOptions: { rootDir: dbRoot, dbMode: "local" }
    });
    const afterRollback = await resolveLearningOverlays({
      runId: "run_overlay_next",
      targetId: "target_overlay",
      now: new Date("2026-09-01T00:00:00.000Z"),
      rootDirOrOptions: { rootDir: dbRoot, dbMode: "local" }
    });
    assert.notEqual(afterRollback.resolution_version, resolution.resolution_version);
    assert.deepEqual(afterRollback.additive_rules.evidence_requirement_signatures, []);
    assert.equal(afterRollback.ignored_promotions.some((item) => item.promotion_id === evidencePromotion.promotion.id && item.reason === "status_rolled_back"), true);
  });
}

async function testLearningApiLifecycle(): Promise<void> {
  await withTempDir("tethermark-learning-api-", async (rootDir) => {
    await fs.mkdir(path.join(rootDir, "target"), { recursive: true });
    await persistAssistantApiFixture(rootDir);
    const localDbRoot = path.join(rootDir, ".artifacts", "state", "local-db");
    await updatePersistedUiSettings({
      learning: {
        operator_consent_version: 1,
        enabled: true,
        trigger_mode: "manual",
        event_driven_enabled: false,
        scheduled_enabled: false,
        llm_synthesis_enabled: false,
        llm_manual_synthesis_enabled: false,
        llm_send_source_excerpts: false
      }
    }, { rootDir: localDbRoot, dbMode: "local" });
    await submitPersistedReviewAction({
      runId: "run_assistant_prev",
      input: {
        reviewer_id: "learning_reviewer",
        action_type: "suppress_finding",
        finding_id: "finding_assistant_prev",
        triage_decision: "false_positive",
        notes: "Recurring local fixture false positive for learning candidate generation."
      },
      rootDirOrOptions: { rootDir: localDbRoot, dbMode: "local" }
    });
    await withWorkingDir(rootDir, async () => {
      const savedEnv = new Map(["HARNESS_API_AUTH_MODE"].map((key) => [key, process.env[key]] as const));
      process.env.HARNESS_API_AUTH_MODE = "none";
      const apiServer = createApiServer();
      await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", () => resolve()));
      const address = apiServer.address();
      assert.ok(address && typeof address !== "string");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      try {
        const initialCandidatesResponse = await fetch(`${baseUrl}/learning/candidates?run_id=run_assistant_prev`);
        const initialCandidatesPayload = await initialCandidatesResponse.json() as any;
        assert.equal(initialCandidatesResponse.status, 200, JSON.stringify(initialCandidatesPayload));
        assert.equal(initialCandidatesPayload.learning_candidates.some((item: any) => item.candidate_type === "scoped_suppression_suggestion"), false);
        const jobsAfterReadPayload = await (await fetch(`${baseUrl}/learning/jobs`)).json() as any;
        assert.equal(jobsAfterReadPayload.learning_jobs.length, 0, "GET /learning/candidates must not start a learning job");

        await submitPersistedReviewAction({
          runId: "run_assistant",
          input: {
            reviewer_id: "learning_reviewer",
            action_type: "suppress_finding",
            finding_id: "finding_assistant",
            triage_decision: "false_positive",
            notes: "Recurring local fixture false positive for learning candidate generation."
          },
          rootDirOrOptions: { rootDir: localDbRoot, dbMode: "local" }
        });

        const manualRunResponse = await fetch(`${baseUrl}/learning/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({})
        });
        const manualRunPayload = await manualRunResponse.json() as any;
        assert.equal(manualRunResponse.status, 200, JSON.stringify(manualRunPayload));
        assert.equal(manualRunPayload.learning_job.trigger, "api");
        assert.equal(manualRunPayload.learning_job.status, "completed");
        assert.equal(manualRunPayload.learning_job.metadata_json.synthesis_authorization.mode, "operator_initiated");
        assert.equal(manualRunPayload.learning_job.metadata_json.synthesis_authorization.operator_initiation_verified, true);
        assert.equal(manualRunPayload.learning_job.metadata_json.synthesis_authorization.operator_approval.approved_by, "local-operator");
        const jobsAfterRunPayload = await (await fetch(`${baseUrl}/learning/jobs`)).json() as any;
        assert.equal(jobsAfterRunPayload.learning_jobs.length, 1);

        const eventsResponse = await fetch(`${baseUrl}/learning/events?run_id=run_assistant`);
        const eventsPayload = await eventsResponse.json() as any;
        assert.equal(eventsResponse.status, 200, JSON.stringify(eventsPayload));
        assert.equal(eventsPayload.export_schema.schema_name, "learning_events.v1");
        await assertExportSchemaMatches("learning_events.v1.json", eventsPayload.export_schema);
        const falsePositiveEvent = eventsPayload.learning_events.find((item: any) => item.event_type === "review_false_positive");
        assert.ok(falsePositiveEvent);
        assert.equal(falsePositiveEvent.payload_json.learning_input_policy_version, "2026-08-26.learning-input.v1");
        assert.equal(falsePositiveEvent.payload_json.raw_source_record_retained, false);
        assert.equal(Object.hasOwn(falsePositiveEvent.payload_json, "notes"), false);
        assert.equal(falsePositiveEvent.evidence_refs_json.every((item: string) => /^(source|finding|control):/.test(item)), true);

        const globalEventsResponse = await fetch(`${baseUrl}/learning/events`);
        const globalEventsPayload = await globalEventsResponse.json() as any;
        assert.equal(globalEventsResponse.status, 200, JSON.stringify(globalEventsPayload));
        assert.equal(globalEventsPayload.learning_events.some((item: any) => item.run_id === "run_assistant" && item.event_type === "review_false_positive"), true);

        const candidatesResponse = await fetch(`${baseUrl}/learning/candidates?run_id=run_assistant`);
        const candidatesPayload = await candidatesResponse.json() as any;
        assert.equal(candidatesResponse.status, 200, JSON.stringify(candidatesPayload));
        assert.equal(candidatesPayload.export_schema.schema_name, "learning_candidates.v1");
        await assertExportSchemaMatches("learning_candidates.v1.json", candidatesPayload.export_schema);
        const candidate = candidatesPayload.learning_candidates.find((item: any) => item.candidate_type === "scoped_suppression_suggestion");
        assert.ok(candidate);
        assert.equal(candidate.requires_human_approval, true);
        assert.equal(candidate.status, "proposed");

        const globalCandidatesResponse = await fetch(`${baseUrl}/learning/candidates`);
        const globalCandidatesPayload = await globalCandidatesResponse.json() as any;
        assert.equal(globalCandidatesResponse.status, 200, JSON.stringify(globalCandidatesPayload));
        assert.equal(globalCandidatesPayload.learning_candidates.some((item: any) => item.id === candidate.id), true);

        const runLearningResponse = await fetch(`${baseUrl}/runs/run_assistant/learning`);
        const runLearningPayload = await runLearningResponse.json() as any;
        assert.equal(runLearningResponse.status, 200, JSON.stringify(runLearningPayload));
        assert.equal(runLearningPayload.learning_candidates.some((item: any) => item.id === candidate.id), true);

        const detailResponse = await fetch(`${baseUrl}/learning/candidates/${encodeURIComponent(candidate.id)}`);
        const detailPayload = await detailResponse.json() as any;
        assert.equal(detailResponse.status, 200, JSON.stringify(detailPayload));
        assert.equal(detailPayload.learning_candidate.id, candidate.id);

        const experimentResponse = await fetch(`${baseUrl}/learning/candidates/${encodeURIComponent(candidate.id)}/experiment`, { method: "POST" });
        const experimentPayload = await experimentResponse.json() as any;
        assert.equal(experimentResponse.status, 200, JSON.stringify(experimentPayload));
        assert.equal(experimentPayload.export_schema.schema_name, "learning_experiments.v1");
        await assertExportSchemaMatches("learning_experiments.v1.json", experimentPayload.export_schema);
        assert.equal(experimentPayload.learning_candidate.status, "experimented");
        assert.equal(experimentPayload.learning_experiment.candidate_metrics_json.audit_behavior_changed, false);

        const promoteResponse = await fetch(`${baseUrl}/learning/candidates/${encodeURIComponent(candidate.id)}/promote`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expires_at: "2026-12-31T00:00:00.000Z" })
        });
        const promotePayload = await promoteResponse.json() as any;
        assert.equal(promoteResponse.status, 200, JSON.stringify(promotePayload));
        assert.equal(promotePayload.export_schema.schema_name, "learning_promotions.v1");
        await assertExportSchemaMatches("learning_promotions.v1.json", promotePayload.export_schema);
        assert.equal(promotePayload.learning_candidate.status, "promoted");
        assert.equal(promotePayload.learning_promotion.metadata_json.human_approved, true);
        assert.equal(promotePayload.learning_promotion.metadata_json.effect_mode, "governed_no_runtime_effect");
        assert.equal(promotePayload.learning_promotion.metadata_json.future_run_consumption_eligible, false);

        const promotionsResponse = await fetch(`${baseUrl}/learning/promotions`);
        const promotionsPayload = await promotionsResponse.json() as any;
        assert.equal(promotionsResponse.status, 200, JSON.stringify(promotionsPayload));
        assert.equal(promotionsPayload.learning_promotions.some((item: any) => item.id === promotePayload.learning_promotion.id), true);

        const rollbackResponse = await fetch(`${baseUrl}/learning/promotions/${encodeURIComponent(promotePayload.learning_promotion.id)}/rollback`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "test rollback" })
        });
        const rollbackPayload = await rollbackResponse.json() as any;
        assert.equal(rollbackResponse.status, 200, JSON.stringify(rollbackPayload));
        assert.equal(rollbackPayload.learning_promotion.status, "rolled_back");
        assert.equal(rollbackPayload.learning_candidate.status, "rolled_back");
      } finally {
        await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
        for (const [key, value] of savedEnv.entries()) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });
  });
}

async function testConcurrentLearningRunsRespectAttemptBudget(): Promise<void> {
  await withTempDir("tethermark-learning-budget-", async (rootDir) => {
    await persistAssistantApiFixture(rootDir);
    const localDbRoot = path.join(rootDir, ".artifacts", "state", "local-db");
    await updatePersistedUiSettings({
      providers: {
        default_provider: "openai",
        default_model: "gpt-4.1",
        agent_overrides: {}
      },
      learning: {
        operator_consent_version: 1,
        enabled: true,
        trigger_mode: "manual",
        event_driven_enabled: false,
        scheduled_enabled: false,
        llm_synthesis_enabled: true,
        llm_manual_synthesis_enabled: true,
        llm_max_calls_per_day: 1,
        llm_min_source_signals: 2,
        llm_min_distinct_runs: 2,
        llm_send_source_excerpts: false
      }
    }, { rootDir: localDbRoot, dbMode: "local" });
    for (const [runId, findingId] of [["run_assistant_prev", "finding_assistant_prev"], ["run_assistant", "finding_assistant"]] as const) {
      await submitPersistedReviewAction({
        runId,
        input: {
          reviewer_id: "budget_reviewer",
          action_type: "suppress_finding",
          finding_id: findingId,
          triage_decision: "false_positive",
          notes: "Repeated false positive used to verify an atomic synthesis-attempt budget."
        },
        rootDirOrOptions: { rootDir: localDbRoot, dbMode: "local" }
      });
    }

    let providerCalls = 0;
    const providerServer = http.createServer(async (req, res) => {
      for await (const _chunk of req) {
        // Drain the request body before returning the deterministic response.
      }
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "Reviewed recurring false positive",
              summary: "Two reviewed runs produced the same bounded signal.",
              rationale: "Keep the proposal scoped and human approved.",
              recommended_review: "Review the proposed scope before promotion.",
              risk_notes: ["Do not suppress unrelated findings."],
              experiment_plan: ["Replay both source runs."]
            })
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      }));
    });
    await new Promise<void>((resolve, reject) => {
      providerServer.once("error", reject);
      providerServer.listen(0, "127.0.0.1", () => resolve());
    });
    const providerAddress = providerServer.address();
    assert.ok(providerAddress && typeof providerAddress !== "string");

    try {
      await withEnv({
        HARNESS_API_AUTH_MODE: "none",
        AUDIT_LLM_LEARNING_SYNTHESIZER_PROVIDER: "openai",
        AUDIT_LLM_LEARNING_SYNTHESIZER_MODEL: "gpt-4.1",
        AUDIT_LLM_LEARNING_SYNTHESIZER_API_KEY: "test-only-key",
        OPENAI_BASE_URL: `http://127.0.0.1:${providerAddress.port}/v1`
      }, async () => withWorkingDir(rootDir, async () => {
        const apiServer = createApiServer();
        await new Promise<void>((resolve, reject) => {
          apiServer.once("error", reject);
          apiServer.listen(0, "127.0.0.1", () => resolve());
        });
        const address = apiServer.address();
        assert.ok(address && typeof address !== "string");
        const baseUrl = `http://127.0.0.1:${address.port}`;
        try {
          const responses = await Promise.all([
            fetch(`${baseUrl}/learning/run`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
            fetch(`${baseUrl}/learning/run`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
          ]);
          assert.deepEqual(responses.map((response) => response.status), [200, 200]);
          await Promise.all(responses.map((response) => response.json()));
          assert.equal(providerCalls, 1, "Concurrent learning runs must share the configured daily attempt budget");
          const jobsPayload = await (await fetch(`${baseUrl}/learning/jobs`)).json() as any;
          assert.equal(jobsPayload.learning_jobs.length, 2);
          const reserved = jobsPayload.learning_jobs.reduce((sum: number, job: any) => sum + Number(job.metadata_json?.synthesis_calls_reserved || 0), 0);
          assert.equal(reserved, 1);
        } finally {
          await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
        }
      }));
    } finally {
      await new Promise<void>((resolve, reject) => providerServer.close((error) => error ? reject(error) : resolve()));
    }
  });
}

async function testSystemPolicyLifecycleAndResolution(): Promise<void> {
  await withTempDir("tethermark-system-policy-", async (rootDir) => {
    const policies = await ensureBuiltinSystemPolicies("default", rootDir);
    assert.equal(policies.length, 4);
    assert.equal(policies.find((item) => item.is_default)?.id, "agentic-static-safe");
    assert.ok(policies.every((item) => item.status === "active" && item.active_version_id));
    assert.ok(listBuiltinSystemPolicyTemplates().every((item) => validateSystemPolicyDefinition(item.definition).valid));
    assert.deepEqual(listBuiltinSystemPolicyTemplates().map((item) => ({ id: item.id, checksum: validateSystemPolicyDefinition(item.definition).checksum, controls: item.definition.required_control_ids.length, audit_package: item.definition.default_audit_package })), [
      { id: "baseline-static-safe", checksum: "82ca6819ddf11f3c2997dde2d594ab39c771a5e15115a8444448c215a1a31396", controls: 10, audit_package: "baseline-static" },
      { id: "agentic-static-safe", checksum: "851ecf474ef14db447f7640041b23c957ba30ebc223a8dfb9c8b11564ad0c204", controls: 27, audit_package: "agentic-static" },
      { id: "extensive-static-safe", checksum: "4fa13cb2a3040df6754262d1c5193c373072e441afaf65a2b0df666abe2f7047", controls: 39, audit_package: "deep-static" },
      { id: "extensive-runtime-local-safe", checksum: "83ca5b53e83b95ad4aa88ce605490c23d4fac4c45c87cb4d61071ec24b054a1f", controls: 39, audit_package: "runtime-validated" }
    ]);
    const runtimeTemplate = getBuiltinSystemPolicyTemplate("extensive-runtime-local-safe")!;
    assert.ok(runtimeTemplate.definition.required_control_ids.includes("runtime.indirect_prompt_injection_resistance"));
    assert.ok(runtimeTemplate.definition.required_control_ids.includes("runtime.security_telemetry_completeness"));
    assert.equal(runtimeTemplate.definition.runtime.no_host_fallback, true);
    const goldenResolutionMatrix: Array<{ template_id: string; target_class: string; checksum: string }> = [];
    for (const policyTemplate of listBuiltinSystemPolicyTemplates()) {
      await setDefaultPersistedSystemPolicy(policyTemplate.id, "test-admin", "default", rootDir);
      for (const targetClass of ["repo_posture_only", "runnable_local_app", "hosted_endpoint_black_box", "tool_using_multi_turn_agent", "mcp_server_plugin_skill_package"] as const) {
        const resolved = await resolvePersistedSystemPolicy({
          request: { local_path: rootDir, audit_package: policyTemplate.definition.default_audit_package, run_mode: policyTemplate.definition.runtime.allowed ? "runtime" : "static", llm_provider: "mock", workspace_id: "default", project_id: "golden-matrix" },
          target_class: targetClass,
          rootDirOrOptions: rootDir
        });
        assert.equal(resolved?.policy_id, policyTemplate.id);
        assert.equal(resolved?.target_class, targetClass);
        goldenResolutionMatrix.push({ template_id: policyTemplate.id, target_class: targetClass, checksum: resolved!.checksum });
      }
    }
    assert.equal(goldenResolutionMatrix.length, 20);
    assert.equal(new Set(goldenResolutionMatrix.map((item) => `${item.template_id}:${item.target_class}:${item.checksum}`)).size, 20);
    await setDefaultPersistedSystemPolicy("agentic-static-safe", "test-admin", "default", rootDir);

    const template = getBuiltinSystemPolicyTemplate("baseline-static-safe");
    assert.ok(template);
    const created = await createPersistedSystemPolicy({
      id: "custom-baseline",
      name: "Custom Baseline",
      definition: template.definition,
      actor_id: "test-admin",
      reason: "lifecycle test",
      workspace_id: "default"
    }, rootDir);
    const firstVersion = created.versions[0];
    assert.equal(validateSystemPolicyDefinition(firstVersion.definition_json).valid, true);
    await publishPersistedSystemPolicy("custom-baseline", "test-admin", "publish v1", "default", rootDir);
    const publishedV1 = await getPersistedSystemPolicy("custom-baseline", "default", rootDir);
    const publishEvent = publishedV1?.events.find((item) => item.event_type === "publish");
    assert.equal(isValidHumanApprovalRecord(publishEvent?.details_json.human_approval, { action: "policy_change", subject: firstVersion.id }), true);

    const secondDefinition = structuredClone(firstVersion.definition_json);
    secondDefinition.providers.maximum_agent_calls = 6;
    const secondVersion = await createPersistedSystemPolicyVersion("custom-baseline", {
      definition: secondDefinition,
      actor_id: "test-admin",
      reason: "reduce call budget",
      workspace_id: "default"
    }, rootDir);
    assert.notEqual(secondVersion.checksum, firstVersion.checksum);
    await publishPersistedSystemPolicy("custom-baseline", "test-admin", "publish v2", "default", rootDir);
    await setDefaultPersistedSystemPolicy("custom-baseline", "test-admin", "default", rootDir);

    const snapshot = await resolvePersistedSystemPolicy({
      request: { local_path: rootDir, audit_package: "baseline-static", llm_provider: "mock", workspace_id: "default", project_id: "default" },
      target_class: "repo_posture_only",
      run_id: "run-policy-test",
      rootDirOrOptions: rootDir
    });
    assert.ok(snapshot);
    assert.equal(snapshot.policy_id, "custom-baseline");
    assert.equal(snapshot.policy_version_id, secondVersion.id);
    assert.equal(snapshot.definition_json.providers.maximum_agent_calls, 6);
    const repeatedSnapshot = await resolvePersistedSystemPolicy({
      request: { local_path: rootDir, audit_package: "baseline-static", llm_provider: "mock", workspace_id: "default", project_id: "default" },
      target_class: "repo_posture_only",
      run_id: "different-run-id",
      rootDirOrOptions: rootDir
    });
    assert.equal(repeatedSnapshot?.checksum, snapshot.checksum, "Equivalent policy resolution must have a deterministic semantic checksum");
    assert.throws(() => applyResolvedSystemPolicyToRequest({
      local_path: rootDir,
      hints: { planner_control_constraints: { excluded_control_ids: [snapshot.applicable_required_control_ids[0]] } }
    }, snapshot), /system_policy_required_control_cannot_be_excluded/);
    const boundedRequest = applyResolvedSystemPolicyToRequest({ local_path: rootDir, hints: { audit_package_overrides: { enabled_lanes: ["runtime_validation"], max_agent_calls: 999, publishability_threshold: "low" } } }, snapshot);
    assert.equal((boundedRequest.hints as any).audit_package_overrides.enabled_lanes, undefined);
    assert.equal((boundedRequest.hints as any).audit_package_overrides.max_agent_calls, 6);
    assert.equal((boundedRequest.hints as any).audit_package_overrides.publishability_threshold, "medium");
    const automaticallyBoundRuntimePolicy = await resolvePersistedSystemPolicy({
      request: { local_path: rootDir, audit_package: "runtime-validated", run_mode: "runtime", llm_provider: "mock", workspace_id: "default", project_id: "default" },
      rootDirOrOptions: rootDir
    });
    assert.equal(automaticallyBoundRuntimePolicy?.policy_id, "extensive-runtime-local-safe");
    await assert.rejects(() => resolvePersistedSystemPolicy({
      request: { local_path: rootDir, audit_package: "baseline-static", llm_provider: "mock", llm_max_requests: 7, workspace_id: "default", project_id: "default" },
      rootDirOrOptions: rootDir
    }), /system_policy_agent_call_budget_exceeded/);

    await setDefaultPersistedSystemPolicy("agentic-static-safe", "test-admin", "default", rootDir);
    const agenticSnapshot = await resolvePersistedSystemPolicy({
      request: { local_path: rootDir, audit_package: "deep-static", llm_provider: "mock", workspace_id: "default", project_id: "default" },
      target_class: "tool_using_multi_turn_agent",
      run_id: "run-policy-agentic-narrowing",
      rootDirOrOptions: rootDir
    });
    assert.ok(agenticSnapshot);
    const approvedLaneNarrowing = attachOperatorLaunchApprovals({
      local_path: rootDir,
      audit_package: "deep-static",
      llm_provider: "mock",
      llm_workload_class: "interactive_operator",
      requested_by: "security-reviewer",
      hints: { audit_package_overrides: { enabled_lanes: ["agentic_controls"] } }
    });
    const narrowedRequest = applyResolvedSystemPolicyToRequest(approvedLaneNarrowing, agenticSnapshot);
    assert.deepEqual((narrowedRequest.hints as any).audit_package_overrides.enabled_lanes, ["agentic_controls"]);
    assert.equal(isValidHumanApprovalRecord((narrowedRequest.hints as any).human_approvals.find((item: any) => item.action === "evidence_reduction"), { action: "evidence_reduction" }), true);

    await upsertPersistedSystemPolicyBinding({ policy_id: "agentic-static-safe", binding_type: "project", project_id: "agent-project", priority: 500, actor_id: "test-admin", workspace_id: "default" }, rootDir);
    const projectSnapshot = await resolvePersistedSystemPolicy({
      request: { local_path: rootDir, audit_package: "agentic-static", llm_provider: "mock", workspace_id: "default", project_id: "agent-project" },
      rootDirOrOptions: rootDir
    });
    assert.equal(projectSnapshot?.policy_id, "agentic-static-safe");
    await upsertPersistedSystemPolicyBinding({ id: "ambiguous-a", policy_id: "agentic-static-safe", binding_type: "project", project_id: "ambiguous-project", priority: 700, actor_id: "test-admin", workspace_id: "default" }, rootDir);
    await upsertPersistedSystemPolicyBinding({ id: "ambiguous-b", policy_id: "custom-baseline", binding_type: "project", project_id: "ambiguous-project", priority: 700, actor_id: "test-admin", workspace_id: "default" }, rootDir);
    await assert.rejects(() => resolvePersistedSystemPolicy({ request: { local_path: rootDir, llm_provider: "mock", workspace_id: "default", project_id: "ambiguous-project" }, rootDirOrOptions: rootDir }), /ambiguous_system_policy_bindings/);

    await upsertPersistedSystemPolicyBinding({ id: "runtime-policy-binding", policy_id: "extensive-runtime-local-safe", binding_type: "project", project_id: "runtime-project", priority: 900, actor_id: "test-admin", workspace_id: "default" }, rootDir);
    const runtimeSnapshot = await resolvePersistedSystemPolicy({ request: { local_path: rootDir, audit_package: "runtime-validated", run_mode: "runtime", llm_provider: "mock", workspace_id: "default", project_id: "runtime-project" }, rootDirOrOptions: rootDir });
    assert.ok(runtimeSnapshot);
    const isolatedRequest = applyResolvedSystemPolicyToRequest({ local_path: rootDir, run_mode: "runtime", hints: { runtime_sandbox: { require_isolation: false, no_host_fallback: false, network_policy: "allow" } } }, runtimeSnapshot);
    assert.equal((isolatedRequest.hints as any).runtime_sandbox.require_isolation, true);
    assert.equal((isolatedRequest.hints as any).runtime_sandbox.no_host_fallback, true);
    assert.equal((isolatedRequest.hints as any).runtime_sandbox.network_policy, "deny");

    const persistedSnapshot = await persistPolicyResolutionSnapshot(snapshot, "run-policy-test", rootDir);
    assert.equal((await readPersistedPolicyResolutionSnapshot("run-policy-test", rootDir))?.checksum, persistedSnapshot.checksum);
    await assert.rejects(() => persistPolicyResolutionSnapshot({ ...snapshot, checksum: "mutated" }, "run-policy-test", rootDir), /policy_resolution_snapshot_is_immutable/);

    const rolledBack = await rollbackPersistedSystemPolicy("custom-baseline", firstVersion.id, "test-admin", "rollback test", "default", rootDir);
    assert.equal(rolledBack.policy.active_version_id, firstVersion.id);
    assert.equal(rolledBack.versions.find((item) => item.id === firstVersion.id)?.state, "published");
    await setDefaultPersistedSystemPolicy("agentic-static-safe", "test-admin", "default", rootDir);
    const archived = await archivePersistedSystemPolicy("custom-baseline", "test-admin", "archive test", "default", rootDir);
    assert.equal(archived.policy.status, "archived");

    const exported = exportSystemPolicy((await getPersistedSystemPolicy("custom-baseline", "default", rootDir))!);
    assert.equal((exported.export_schema as any).compatibility.policy, "same-major-additive");
    const imported = await importSystemPolicy(exported, "test-admin", "import-workspace", rootDir);
    assert.equal(imported.policy.id, "custom-baseline");
    assert.equal(imported.policy.workspace_id, "import-workspace");
    assert.equal(imported.versions[0].checksum, firstVersion.checksum, "Policy migration must import the selected rolled-back version rather than a newer superseded version");
    const legacyExport = structuredClone(exported) as any;
    delete legacyExport.export_schema;
    legacyExport.policy.id = "custom-baseline-legacy";
    const importedLegacy = await importSystemPolicy(legacyExport, "test-admin", "legacy-import-workspace", rootDir);
    assert.equal(importedLegacy.versions[0].checksum, firstVersion.checksum, "Legacy policy exports without compatibility metadata remain importable");
    await assert.rejects(
      () => importSystemPolicy({ ...exported, export_schema: { schema_name: "system_policy.v1", schema_version: "2.0.0" } }, "test-admin", "future-import-workspace", rootDir),
      /incompatible_system_policy_import/
    );
    await assert.rejects(
      () => importSystemPolicy({ ...exported, export_schema: { schema_name: "different_policy.v1", schema_version: "1.0.0" } }, "test-admin", "wrong-import-workspace", rootDir),
      /incompatible_system_policy_import/
    );

    const concurrentResults = await Promise.all([
      listPersistedSystemPolicies("default", rootDir),
      getPersistedSystemPolicy("agentic-static-safe", "default", rootDir),
      readPersistedPolicyResolutionSnapshot("run-policy-test", rootDir)
    ]);
    assert.ok(concurrentResults.every(Boolean));

    const backupRoot = path.join(rootDir, "restored");
    await fs.mkdir(backupRoot, { recursive: true });
    await fs.copyFile(path.join(rootDir, "harness.sqlite"), path.join(backupRoot, "harness.sqlite"));
    assert.equal((await getPersistedSystemPolicy("agentic-static-safe", "default", backupRoot))?.policy.status, "active");

    const db = await openSqliteDatabase(rootDir);
    try {
      assert.equal(readSqliteTable<any>(db, "system_policies").length, 7);
      assert.ok(readSqliteTable<any>(db, "system_policy_versions").length >= 7);
      assert.equal(readSqliteTable<any>(db, "policy_resolution_snapshots").length, 1);
      assert.ok(readSqliteTable<any>(db, "policy_change_events").length >= 10);
    } finally { db.close(); }
  });
}

async function testImmutableHumanApprovalBoundaries(): Promise<void> {
  const approval = createHumanApprovalRecord({
    approvalId: "approval:test-suppression",
    action: "finding_suppression",
    subject: "suppress-test",
    approvedBy: "security-reviewer",
    approvedAt: "2026-08-26T08:00:00.000Z",
    reason: "Reviewed the exact scoped false-positive signature.",
    source: "review_action"
  });
  assert.equal(isValidHumanApprovalRecord(approval, { action: "finding_suppression", subject: "suppress-test" }), true);
  assert.equal(isValidHumanApprovalRecord({ ...approval, reason: "tampered" }, { action: "finding_suppression" }), false);
  assert.throws(() => validateAuditPolicyPackDefinition({
    id: "unapproved-pack",
    name: "Unapproved",
    version: "1",
    source: "file",
    policy: {
      profile: "test",
      finding_suppressions: [{ rule_id: "suppress-test", reason: "missing approval", finding_ids: ["finding-1"] } as any]
    }
  }), /requires a valid immutable human approval/);
  assert.doesNotThrow(() => validateAuditPolicyPackDefinition({
    id: "approved-pack",
    name: "Approved",
    version: "1",
    source: "file",
    policy: {
      profile: "test",
      finding_suppressions: [{ rule_id: "suppress-test", reason: "reviewed exception", finding_ids: ["finding-1"], human_approval: approval }]
    }
  }));
  assert.throws(() => createHumanApprovalRecord({
    approvalId: "approval:automation",
    action: "evidence_reduction",
    subject: "audit-request",
    approvedBy: "automation",
    reason: "automated request",
    source: "operator_launch"
  }), /human_approval_actor_required/);
  const approvedRequest = attachOperatorLaunchApprovals({
    local_path: ".",
    requested_by: "security-reviewer",
    llm_workload_class: "interactive_operator",
    hints: {
      planner_control_constraints: { excluded_control_ids: ["control-a"] },
      audit_package_overrides: { enabled_lanes: ["repo_posture"] }
    }
  });
  assert.equal(requireRequestHumanApproval(approvedRequest, "control_change").approved_by, "security-reviewer");
  assert.equal(requireRequestHumanApproval(approvedRequest, "evidence_reduction").approved_by, "security-reviewer");
  assert.equal(requireRequestHumanApproval(approvedRequest, "runtime_probe_removal").approved_by, "security-reviewer");
  const reusedForDifferentControls = {
    ...approvedRequest,
    hints: {
      ...approvedRequest.hints,
      planner_control_constraints: { excluded_control_ids: ["control-b"] }
    }
  };
  assert.throws(() => requireRequestHumanApproval(reusedForDifferentControls, "control_change"), /human_approval_required:control_change/);
  const unattendedRequest = attachOperatorLaunchApprovals({
    local_path: ".",
    requested_by: "batch-runner",
    llm_workload_class: "unattended_local",
    hints: {
      planner_control_constraints: { excluded_control_ids: ["control-a"] },
      human_approvals: [createHumanApprovalRecord({
        approvalId: "approval:precomputed-unattended",
        action: "control_change",
        subject: "audit-request",
        approvedBy: "batch-runner",
        reason: "precomputed approval must not authorize unattended weakening",
        source: "operator_launch"
      })]
    }
  });
  assert.throws(() => requireRequestHumanApproval(unattendedRequest, "control_change"), /human_approval_required:control_change/);
}

async function testLearningSynthesisInitiationBoundaries(): Promise<void> {
  const scope = { workspaceId: "security", projectId: "agent-a", runId: "run-1" };
  const approval = createHumanApprovalRecord({
    approvalId: "approval:learning-synthesis",
    action: "learning_model_synthesis",
    subject: learningSynthesisApprovalSubject(scope),
    approvedBy: "security-reviewer",
    approvedAt: "2026-08-26T09:00:00.000Z",
    reason: "Operator requested synthesis for this exact learning scope.",
    source: "operator_launch"
  });
  const operatorDecision = resolveLearningSynthesisAuthorization({
    ...scope,
    trigger: "api",
    actorId: "security-reviewer",
    operatorApproval: approval,
    providers: { default_provider: "openai_codex", default_model: "gpt-5.6-sol" },
    maxRequests: 3
  });
  assert.equal(operatorDecision.allowed, true);
  assert.equal(operatorDecision.mode, "operator_initiated");
  assert.equal(operatorDecision.operator_initiation_verified, true);
  assert.equal(operatorDecision.provider_policy?.initiation_mode, "operator");
  assert.equal(operatorDecision.provider_policy?.credential_class, "chatgpt_session");

  const wrongScopeDecision = resolveLearningSynthesisAuthorization({
    ...scope,
    runId: "run-2",
    trigger: "api",
    actorId: "security-reviewer",
    operatorApproval: approval,
    providers: { default_provider: "openai_codex", default_model: "gpt-5.6-sol" },
    maxRequests: 3
  });
  assert.equal(wrongScopeDecision.allowed, false);
  assert.equal(wrongScopeDecision.mode, "denied");
  assert.equal(wrongScopeDecision.operator_initiation_verified, false);

  const scheduledCodexDecision = resolveLearningSynthesisAuthorization({
    ...scope,
    trigger: "scheduled",
    actorId: "system_learning_scheduler",
    providers: { default_provider: "openai_codex", default_model: "gpt-5.6-sol" },
    maxRequests: 3
  });
  assert.equal(scheduledCodexDecision.allowed, false);
  assert.equal(scheduledCodexDecision.provider_policy, null);

  const scheduledApiKeyDecision = resolveLearningSynthesisAuthorization({
    ...scope,
    trigger: "scheduled",
    actorId: "system_learning_scheduler",
    providers: {
      default_provider: "openai",
      default_model: "gpt-4.1",
      agent_overrides: { learning_synthesizer_agent: { api_key: "test-only-key" } }
    },
    maxRequests: 3
  });
  assert.equal(scheduledApiKeyDecision.allowed, true);
  assert.equal(scheduledApiKeyDecision.mode, "phase2_background_policy");
  assert.equal(scheduledApiKeyDecision.provider_policy?.policy_version, "provider-policy.v1");
  assert.equal(scheduledApiKeyDecision.provider_policy?.workload_class, "unattended_local");
  assert.equal(scheduledApiKeyDecision.provider_policy?.credential_class, "api_key");
  assert.equal(scheduledApiKeyDecision.provider_policy?.initiation_mode, "background");
}

async function testSystemPolicyAdminApi(): Promise<void> {
  await withWorkspaceTempDir("system-policy-api-", async (rootDir) => {
    await withEnv({ HARNESS_API_AUTH_MODE: "none", HARNESS_LOCAL_DB_ROOT: path.join(rootDir, "state") }, async () => withWorkingDir(rootDir, async () => {
      const apiServer = createApiServer();
      await new Promise<void>((resolve, reject) => {
        apiServer.once("error", reject);
        apiServer.listen(0, "127.0.0.1", () => resolve());
      });
      const address = apiServer.address();
      assert.ok(address && typeof address !== "string");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const headers = { "content-type": "application/json", "x-harness-workspace": "default", "x-harness-project": "default", "x-harness-actor": "api-admin" };
      try {
        const catalogResponse = await fetch(`${baseUrl}/system/policies`, { headers });
        const catalog = await catalogResponse.json() as any;
        assert.equal(catalogResponse.status, 200, JSON.stringify(catalog));
        assert.equal(catalog.templates.length, 4);
        assert.equal(catalog.policies.filter((item: any) => item.is_default).length, 1);

        const createResponse = await fetch(`${baseUrl}/system/policies`, { method: "POST", headers, body: JSON.stringify({ id: "api-policy", name: "API Policy", template_id: "baseline-static-safe" }) });
        assert.equal(createResponse.status, 201);
        assert.equal((await createResponse.json() as any).system_policy.policy.status, "draft");
        const validationResponse = await fetch(`${baseUrl}/system/policies/api-policy/validate`, { method: "POST", headers, body: "{}" });
        assert.equal(validationResponse.status, 200);
        assert.equal((await validationResponse.json() as any).validation.valid, true);
        assert.equal((await fetch(`${baseUrl}/system/policies/api-policy/publish`, { method: "POST", headers, body: JSON.stringify({ reason: "api test" }) })).status, 200);
        assert.equal((await fetch(`${baseUrl}/system/policies/api-policy/set-default`, { method: "POST", headers, body: "{}" })).status, 200);

        const previewResponse = await fetch(`${baseUrl}/system/policies/resolve-preview`, { method: "POST", headers, body: JSON.stringify({ request: { local_path: rootDir, audit_package: "baseline-static", llm_provider: "mock" } }) });
        assert.equal(previewResponse.status, 200);
        const preview = await previewResponse.json() as any;
        assert.equal(preview.resolved_policy.policy_id, "api-policy");
        assert.ok(preview.effective_request.hints.system_policy.resolved_snapshot.checksum);
        assert.equal((await fetch(`${baseUrl}/system/policies/api-policy/export`, { headers })).status, 200);
        assert.equal((await fetch(`${baseUrl}/system/controls`, { headers })).status, 200);
        assert.equal((await fetch(`${baseUrl}/system/audit-packages`, { headers })).status, 200);
      } finally {
        await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
      }
    }));
    await withEnv({ HARNESS_API_AUTH_MODE: "api_key", HARNESS_API_KEY: "phase7-test-key", HARNESS_LOCAL_DB_ROOT: path.join(rootDir, "key-state") }, async () => withWorkingDir(rootDir, async () => {
      const apiServer = createApiServer();
      await new Promise<void>((resolve, reject) => {
        apiServer.once("error", reject);
        apiServer.listen(0, "127.0.0.1", () => resolve());
      });
      const address = apiServer.address();
      assert.ok(address && typeof address !== "string");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      try {
        assert.equal((await fetch(`${baseUrl}/system/policies`)).status, 401);
        assert.equal((await fetch(`${baseUrl}/system/policies`, { headers: { "x-api-key": "wrong" } })).status, 401);
        assert.equal((await fetch(`${baseUrl}/system/policies`, { headers: { "x-api-key": "phase7-test-key" } })).status, 200);
      } finally {
        await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
      }
    }));
  });
}

async function testExtensiveStaticPolicyCoverage(): Promise<void> {
  await withWorkspaceTempDir("extensive-policy-e2e-", async (rootDir) => {
    const stateRoot = path.join(rootDir, "state");
    const fixturePath = path.resolve(process.cwd(), "fixtures", "validation-targets", "agent-tool-boundary-risky");
    await withEnv({ HARNESS_LOCAL_DB_ROOT: stateRoot, HARNESS_DISABLE_LOCAL_BINARIES: "1" }, async () => {
      await ensureBuiltinSystemPolicies("default", stateRoot);
      await setDefaultPersistedSystemPolicy("extensive-static-safe", "test-admin", "default", stateRoot);
      const result = await createEngine().run({
        local_path: fixturePath,
        run_mode: "static",
        audit_package: "deep-static",
        llm_provider: "mock",
        workspace_id: "default",
        project_id: "extensive-e2e"
      });
      const snapshot = await readPersistedPolicyResolutionSnapshot(result.run_id, stateRoot);
      assert.ok(snapshot);
      assert.equal(snapshot.policy_id, "extensive-static-safe");
      const controlById = new Map(result.control_results.map((control) => [control.control_id, control]));
      const plannedNonAssessed = new Set([...result.run_plan.deferred_control_ids, ...result.run_plan.non_applicable_control_ids]);
      for (const controlId of snapshot.applicable_required_control_ids) {
        assert.ok(controlById.has(controlId) || plannedNonAssessed.has(controlId), `Extensive policy control ${controlId} must be assessed or explicitly planned as not assessed/not applicable`);
      }
      for (const control of result.control_results.filter((item) => item.control_id.startsWith("runtime."))) {
        assert.notEqual(control.status, "pass", `${control.control_id} cannot pass without runtime evidence`);
        assert.ok(control.rationale.length || control.evidence.length, `${control.control_id} must retain a reason or evidence reference`);
      }
      assert.ok(result.publishability.human_review_required, "Incomplete extensive evidence must require review");
      assert.equal(result.publishability.publishability_status, "blocked", "Blocking evidence policy must block publication when required deterministic tools are unavailable");
    });
  });
}

async function main(): Promise<void> {
  // The regression suite is always offline and deterministic. Live provider
  // validation is isolated in explicitly named smoke commands.
  for (const key of Object.keys(process.env)) {
    if (/^AUDIT_LLM_.+_(PROVIDER|MODEL|API_KEY)$/.test(key)) delete process.env[key];
  }
  process.env.AUDIT_LLM_PROVIDER = "mock";
  process.env.AUDIT_LLM_MODEL = "mock-agent-runtime";
  process.env.HARNESS_DISABLE_LEARNING_SCHEDULER = "1";
  delete process.env.AUDIT_LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const tests: Array<[string, () => Promise<void>]> = [
    ["production static tool version and Scorecard API policy", testProductionStaticToolPolicy],
    ["static readiness rejects unsupported scanner versions", testStaticReadinessRejectsUnsupportedVersions],
    ["static evidence uses configured scanner invocations", testStaticEvidenceUsesConfiguredScannerInvocations],
    ["static scanners fail closed on timeout and output flooding", testStaticScannerTimeoutAndOutputFloodFailClosed],
    ["buildScanRequest parses llm flags", testBuildScanRequestParsesLlmFlags],
    ["OpenAI Codex OAuth provider registry and structured exec", testOpenAICodexProviderRegistryAndStructuredExec],
    ["provider workload policy, budgets, and circuit breaker", testProviderWorkloadPolicyAndBudgets],
    ["local persistence uses configured root", testLocalPersistenceUsesConfiguredRoot],
    ["concurrent sqlite writes are merged", testConcurrentSqliteWritesAreMerged],
    ["concurrent sqlite process writes are merged", testConcurrentSqliteProcessWritesAreMerged],
    ["sqlite crash stage recovery", testSqliteCrashStageRecovery],
    ["sqlite corruption and failed saves fail closed", testSqliteCorruptionAndFailedSavesFailClosed],
    ["sqlite automatic backup verification and restore", testSqliteAutomaticBackupVerificationAndRestore],
    ["sqlite release upgrade fixture and rollback", testSqliteReleaseUpgradeFixtureAndRollback],
    ["sqlite file lock backoff and recovery", testSqliteFileLockBackoffAndRecovery],
    ["async recovery reconciles durable terminal run", testAsyncRecoveryReconcilesDurableTerminalRun],
    ["async lifecycle crash stage recovery", testAsyncLifecycleCrashStageRecovery],
    ["async terminal followup crash recovery", testAsyncTerminalFollowupCrashRecovery],
    ["concurrent async worker persistence stress", testConcurrentAsyncWorkerPersistenceStress],
    ["concurrent async api persistence stress", testConcurrentAsyncApiPersistenceStress],
    ["psql credentials use process environment", testPsqlCredentialsUseEnvironment],
    ["compactBundleExports prunes optional debug bundles", testCompactBundleExportsPrunesOptionalDebugBundles],
    ["pruneArtifacts removes old run bundles and updates index", testPruneArtifactsRemovesOldRunBundlesAndUpdatesIndex],
    ["artifact retention preserves runs and reconciles artifact index", testArtifactRetentionPreservesRunsAndReconcilesArtifactIndex],
    ["scheduled artifact retention runs once per interval and records history", testScheduledArtifactRetentionRunsOncePerIntervalAndRecordsHistory],
    ["readPersistedLaneSpecialistOutputs from sqlite", testReadPersistedLaneSpecialistOutputsFromSqlite],
    ["backfillLocalPersistence migrates lane specialists", testBackfillLocalPersistenceMigratesLaneSpecialists],
    ["readPersistedToolAdapterSummary", testReadPersistedToolAdapterSummary],
    ["readPersistedObservability", testReadPersistedObservability],
    ["readPersistedStageArtifact", testReadPersistedStageArtifact],
    ["cleanupLocalJsonMirrors dry-run", testCleanupLocalJsonMirrorsDryRun],
    ["readPersistedRunUsageSummary", testReadPersistedRunUsageSummary],
    ["cleanupLocalJsonMirrors live", testCleanupLocalJsonMirrorsLive],
    ["validateLocalPersistence detects missing records", testValidateLocalPersistenceDetectsMissingRecords],
    ["validateLocalPersistence passes for persisted run", testValidateLocalPersistencePassesForPersistedRun],
    ["golden export snapshots", testGoldenExportSnapshots],
    ["export compatibility metadata and legacy v1 reader", testExportCompatibilityContract],
    ["fresh run persists expected records", testFreshRunPersistsExpectedRecords],
    ["persisted review workflow and actions", testPersistedReviewWorkflowAndActions],
    ["api responses use persisted state", testApiResponsesUsePersistedState],
    ["runtime followup launch flow", testRuntimeFollowupLaunchFlow],
    ["runtime followup outcome reconciliation", testRuntimeFollowupOutcomeReconciliation],
    ["async run lifecycle api", testAsyncRunLifecycleApi],
    ["canonical target identity groups repo clone and endpoint variants", testCanonicalTargetIdentityGroupsRepoCloneAndEndpointVariants],
    ["artifact policy classifies persisted and artifact-only outputs", testArtifactPolicyClassifiesPersistedAndArtifactOnlyOutputs],
    ["web ui and persisted ui settings api", testWebUiAndPersistedUiSettingsApi],
    ["preflight api summarizes readiness", testPreflightApiSummarizesReadiness],
    ["runtime sandbox backend resolution", testRuntimeSandboxBackendResolution],
    ["local runtime provider executes exact argv in container", testLocalRuntimeProviderExecutesExactArgvInContainer],
    ["local runtime provider requires healthy framework endpoint", testLocalRuntimeProviderRequiresHealthyFrameworkEndpoint],
    ["local runtime provider fails closed on workspace quota", testLocalRuntimeProviderFailsClosedOnWorkspaceQuota],
    ["local runtime provider uses internal allowlisted egress proxy", testLocalRuntimeProviderUsesInternalAllowlistedEgressProxy],
    ["runtime sandbox api endpoints", testRuntimeSandboxApiEndpoints],
    ["api project scoping and actor-owned review actions", testApiProjectScopingAndActorOwnedReviewActions],
    ["assistant storage and capability gating", testAssistantStorageAndCapabilities],
    ["assistant provider cites findings", testAssistantProviderCitesFindings],
    ["assistant api scopes actions and target history", testAssistantApiScopesActionsAndTargetHistory],
    ["approved learning overlay consumption and rollback", testApprovedLearningOverlayConsumptionAndRollback],
    ["learning api lifecycle", testLearningApiLifecycle],
    ["concurrent learning runs respect attempt budget", testConcurrentLearningRunsRespectAttemptBudget],
    ["system policy lifecycle and deterministic resolution", testSystemPolicyLifecycleAndResolution],
    ["immutable human approval boundaries", testImmutableHumanApprovalBoundaries],
    ["learning synthesis initiation boundaries", testLearningSynthesisInitiationBoundaries],
    ["system policy administration api", testSystemPolicyAdminApi],
    ["extensive static policy coverage is explicit", testExtensiveStaticPolicyCoverage],
      ["validateFixtures passes for bundled targets", testValidateFixturesPassesForBundledTargets],
      ["product benchmark suite dry-run", testProductBenchmarkSuiteDryRun],
      ["fixed calibration evidence plan is deterministic", testFixedCalibrationEvidencePlanIsDeterministic],
      ["benchmark finding summaries are reviewable and redacted", testBenchmarkFindingSummariesAreReviewableAndRedacted],
      ["benchmark scoring summaries are reviewable and redacted", testBenchmarkScoringSummariesAreReviewableAndRedacted],
      ["static runtime claim detection handles negation", testStaticRuntimeClaimDetectionHandlesNegation],
      ["calibration benchmark metrics and comparison guards", testCalibrationBenchmarkMetricsAndComparisonGuards],
      ["external advisory ground-truth benchmark", testExternalAdvisoryGroundTruthBenchmark],
      ["product benchmark api endpoints", testProductBenchmarkApiEndpoints],
      ["local binary providers short-circuit when spawn is blocked", testLocalBinaryProvidersShortCircuitWhenSpawnBlocked],
      ["python worker providers report blocked runtime capability when disabled", testPythonWorkerProvidersReportBlockedWhenDisabled],
      ["python worker environment contract", testPythonWorkerEnvironmentContract],
      ["python worker limits and Inspect normalization", testPythonWorkerExecutionLimitsAndInspectNormalization],
      ["python worker failure paths normalize fail closed", testPythonWorkerFailurePathsNormalizeFailClosed],
      ["runtime observations normalize into fail-closed audit artifacts", testRuntimeObservationEvidenceAndControlNormalization],
      ["runtime repeatability uses bounded semantic qualification", testRuntimeRepeatabilityQualification],
      ["repo analysis provider emits normalized locations", testRepoAnalysisProviderEmitsNormalizedLocations],
      ["scorecard and trivy normalization emit symbol locations", testScorecardAndTrivyNormalizationEmitSymbolLocations],
      ["runtime readiness fixture enforces container policy", testRuntimeReadinessFixturePolicy],
      ["linux container sandbox builds bounded execution plan", testLinuxContainerSandboxBuildsExecutionPlan],
      ["linux container sandbox builds python runtime probe plan", testLinuxContainerSandboxBuildsPythonRuntimeProbePlan],
      ["linux container sandbox detects python framework probe defaults", testLinuxContainerSandboxDetectsPythonFrameworkProbeDefaults],
      ["linux container sandbox builds django runtime command", testLinuxContainerSandboxBuildsDjangoRuntimeCommand],
      ["linux container sandbox detects node entrypoint without scripts", testLinuxContainerSandboxDetectsNodeEntrypointWithoutScripts],
      ["runtime evidence influences standards audit", testRuntimeEvidenceInfluencesStandardsAudit],
      ["imported child_process exec detection", testImportedChildProcessExecDetection],
      ["agentic findings require path-local execution evidence", testAgenticFindingsRequirePathLocalExecutionEvidence],
      ["MCP git_add path-boundary detection", testMcpGitAddPathBoundaryDetection],
      ["generic plugin paths do not imply MCP", testGenericPluginPathsDoNotImplyMcp],
      ["planner deterministic control and classification floor", testPlannerDeterministicControlAndClassificationFloor],
      ["Gradio file-payload path validation detection", testGradioFilePayloadPathValidationDetection],
      ["Langflow sensitive-operation authentication detection", testLangflowSensitiveOperationAuthenticationDetection],
      ["finding reconciliation preserves failed controls", testFindingReconciliationDoesNotSoftenFailedControls],
      ["deterministic heuristic findings require integrity approval to drop", testDeterministicHeuristicFindingsRequireIntegrityApprovalToDrop],
      ["final findings require an assessed mapped control", testFinalFindingsRequireAnAssessedMappedControl],
      ["deterministic controls require approval to downgrade", testDeterministicControlsRequireApprovalToDowngrade],
      ["selective correction replaces stale lane findings", testSelectiveCorrectionReplacesStaleLaneFindings],
      ["finding evaluation uses evidence symbols for grouping", testFindingEvaluationUsesEvidenceSymbolsForGrouping],
      ["finding quality flags unsupported evidence and control mismatch", testFindingQualityFlagsUnsupportedEvidenceAndControlMismatch],
      ["finding quality treats static dependency advisory impact as metadata", testFindingQualityTreatsStaticDependencyAdvisoryImpactAsMetadata],
      ["post-supervisor integrity does not veto semantic mapping hints", testPostSupervisorIntegrityDoesNotVetoSemanticMappingHints],
      ["run comparison uses evidence symbols for matching", testRunComparisonUsesEvidenceSymbolsForMatching]
    ];

  const filter = process.env.TETHERMARK_TEST_FILTER;
  for (const [name, fn] of filter ? tests.filter(([name]) => name.includes(filter)) : tests) {
    await fn();
    console.log(`PASS ${name}`);
  }
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
