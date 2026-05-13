import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildRunComparisonReport, createApiServer } from "../../../apps/api-server/src/index.js";
import { createWebUiServer } from "../../../apps/web-ui/src/index.js";
import { buildScanRequest } from "../../../apps/cli/src/args.js";
import { validateFixtures } from "../../../apps/cli/src/fixture-validation.js";
import { describeArtifactType } from "./artifact-policy.js";
import { pruneArtifacts } from "./artifact-retention.js";
import { executeEvidenceProvider, normalizeEvidenceSummaryForTests, resetEvidenceProviderCapabilityCacheForTests } from "./evidence-providers.js";
import { buildFindingEvaluationSummary } from "./finding-evaluation.js";
import { createEngine } from "./orchestrator.js";
import { buildPreflightSummary } from "./preflight.js";
import { resetPythonWorkerCapabilityCacheForTests } from "./python-worker.js";
import { createPersistenceStore } from "./persistence/backend.js";
import { backfillLocalPersistence, cleanupLocalJsonMirrors, validateLocalPersistence } from "./persistence/backfill.js";
import { compactBundleExports } from "./persistence/bundle-exports.js";
import { LocalPersistenceStore } from "./persistence/local-store.js";
import { getPersistedObservabilityHistory, readPersistedObservabilitySummary } from "./persistence/observability.js";
import { getPersistedRun, listPersistedTargets, readPersistedDimensionScores, readPersistedPolicyApplication, readPersistedStageExecutions, readPersistedTargetSummary } from "./persistence/query.js";
import { deriveInitialReviewWorkflow, listPersistedReviewNotifications, listPersistedReviewWorkflows, submitPersistedReviewAction } from "./persistence/review-workflow.js";
import { createPersistedReviewComment } from "./persistence/review-comments.js";
import { buildFindingEvidenceFingerprint, createPersistedFindingDisposition } from "./persistence/finding-dispositions.js";
import { readPersistedArtifactIndex, readPersistedCommitDiff, readPersistedControlResults, readPersistedEvents, readPersistedEvidenceRecords, readPersistedFindings, readPersistedLanePlans, readPersistedLaneResults, readPersistedLaneReuseDecisions, readPersistedLaneSpecialistOutputs, readPersistedMaintenanceHistory, readPersistedMetrics, readPersistedObservability, readPersistedResolvedConfiguration, readPersistedReviewActions, readPersistedReviewComments, readPersistedReviewDecision, readPersistedReviewWorkflow, readPersistedRunUsageSummary, readPersistedScoreSummary, readPersistedStageArtifact, readPersistedStageArtifacts, readPersistedToolAdapterSummary, readPersistedToolExecutions } from "./persistence/run-details.js";
import { readPersistenceMetadata } from "./persistence/sqlite.js";
import { listPersistedUiDocuments, readPersistedUiSettings, updatePersistedUiSettings } from "./persistence/ui-settings.js";
import { markRuntimeFollowupJobTerminal, markRuntimeFollowupLaunched, readPersistedRuntimeFollowup, upsertRuntimeFollowupFromReviewAction } from "./persistence/runtime-followups.js";
import { LinuxContainerSandboxBackend } from "./sandbox/backends/linux-container.js";
import { buildReviewSummary } from "./review-summary.js";
import { buildGoldenExports, readGoldenExports } from "./export-golden.js";
import { evaluateStandardsAudit } from "./standards-audit.js";
import { getControlCatalog } from "./standards.js";
import { deriveCanonicalTargetId } from "./target-identity.js";
import { listBuiltinLlmProviders, listBuiltinLlmProviderPresets } from "./llm-provider-registry.js";
import { OpenAICodexCliProvider, resolveAgentProviderConfig } from "../../../packages/llm-provider/src/index.js";

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
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

async function waitForAsyncRun(baseUrl: string, jobId: string, timeoutMs = 45000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`${baseUrl}/runs/async/${jobId}`);
    if (response.ok) {
      const payload = await response.json() as any;
      const status = payload.job?.status;
      if (status === "succeeded" || status === "failed" || status === "canceled") {
        return payload;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for async job ${jobId}`);
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
  assert.ok(parsed.request.local_path);
}

async function testOpenAICodexProviderRegistryAndStructuredExec(): Promise<void> {
  const provider = listBuiltinLlmProviders().find((item) => item.id === "openai_codex");
  assert.equal(provider?.mode, "agent_oauth");
  assert.equal(provider?.requires_api_key, false);
  assert.equal(listBuiltinLlmProviderPresets().find((item) => item.id === "openai_codex_local")?.provider_id, "openai_codex");

  const resolved = resolveAgentProviderConfig("planner_agent", { provider: "openai_codex", model: "gpt-5.1-codex" });
  assert.equal(resolved.provider, "openai_codex");
  assert.equal(resolved.apiKeySource, "oauth-local");

  await withTempDir("harness-codex-provider-", async (rootDir) => {
    const fakeCli = path.join(rootDir, "fake-codex-cli.mjs");
    await fs.writeFile(fakeCli, [
      "import fs from 'node:fs';",
      "const outIndex = process.argv.indexOf('--output-last-message');",
      "if (outIndex < 0) process.exit(2);",
      "fs.writeFileSync(process.argv[outIndex + 1], JSON.stringify({ ok: true, mode: 'oauth' }));"
    ].join("\n"), "utf8");
    const codex = new OpenAICodexCliProvider("gpt-5.1-codex", process.execPath, "read-only", 10_000, [fakeCli]);
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
  });
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
    assert.equal(configuredMeta?.persistence_schema_version, "1.1.0");
    assert.equal(configuredMeta?.compatibility_status, "current");
    assert.equal(localRun?.resolved_configuration?.db_mode, "local");
    assert.equal(configuredRun?.resolved_configuration?.db_mode, "local");
    assert.equal(await fs.stat(path.join(configuredRoot, "runs", "run_configured.json")).then(() => true).catch(() => false), false);
    assert.equal(await fs.stat(path.join(localRoot, "runs", "run_local.json")).then(() => true).catch(() => false), false);
  });
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

    const result = await withWorkingDir(rootDir, async () => {
      const engine = createEngine();
      return engine.run({
        local_path: projectDir,
        run_mode: "static",
        audit_package: "deep-static",
        llm_provider: "mock",
        llm_model: "mock-agent-runtime"
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
    assert.deepEqual(
      ["preflight-summary", "launch-intent", "planner-artifact", "target-profile", "threat-model", "eval-selection", "run-plan", "findings-pre-skeptic", "score-summary", "observations"].sort(),
      stageArtifacts.map((item) => item.artifact_type).sort()
    );
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
    assert.equal(actions[9]?.action_type, "approve_run");
    assert.equal(reviewSummary.handoff.current_reviewer_id, "bob");
    assert.equal(reviewSummary.handoff.unresolved_finding_count, 0);
    assert.equal(reviewSummary.finding_summaries[0]?.disposition, "downgraded");
    assert.equal(reviewSummary.finding_summaries[0]?.current_severity, "medium");
    assert.equal(reviewSummary.recent_comments.length, 1);
    assert.equal(comments.length, 1);
    assert.equal(comments[0]?.finding_id, "finding_review");
  });
}

async function testApiResponsesUsePersistedState(): Promise<void> {
  await withTempDir("harness-api-persisted-", async (rootDir) => {
    const dueSoonReviewDue = new Date(Date.now() + 24 * 36e5).toISOString();
    const reopenedReviewDue = new Date(Date.now() + 48 * 36e5).toISOString();
    const laterExpiry = new Date(Date.now() + 10 * 24 * 36e5).toISOString();
    const artifactRoot = path.join(rootDir, "artifacts", "run_api");
    await fs.mkdir(artifactRoot, { recursive: true });
    await fs.writeFile(path.join(artifactRoot, "final-score-summary.json"), JSON.stringify({ overall_score: 10, rating: "poor" }, null, 2) + "\n", "utf8");

    const store = new LocalPersistenceStore(path.join(rootDir, ".artifacts", "state", "local-db"));
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
      persistence_summary: { run_id: "run_api", mode: "local", root: path.join(rootDir, ".artifacts", "state", "local-db") },
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
      rootDirOrOptions: path.join(rootDir, ".artifacts", "state", "local-db"),
      input: {
        reviewer_id: "triage_api",
        action_type: "rerun_in_capable_env",
        finding_id: "finding_api",
        notes: "seeded runtime follow-up for export coverage",
        metadata: null
      }
    });

    await updatePersistedUiSettings({
      credentials: {
        github_api_base_url: "http://127.0.0.1:1",
        github_token: "test-github-token",
        configured_endpoints: []
      },
      integrations: {
        github_mode: "manual",
        github_allowed_actions: ["pr_comment", "issue_create"],
        github_owned_repo_only: false,
        github_owned_repo_prefixes: [],
        github_require_per_run_approval: true
      }
    }, { rootDir: path.join(rootDir, ".artifacts", "state", "local-db"), dbMode: "local" }, { workspaceId: "default", projectId: "default", scopeLevel: "project" });

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

    const githubPort = 8600 + Math.floor(Math.random() * 100);
    const port = 8800 + Math.floor(Math.random() * 200);
    await withWorkingDir(rootDir, async () => {
      await updatePersistedUiSettings({
        credentials: {
          github_api_base_url: `http://127.0.0.1:${githubPort}`,
          github_token: "test-github-token",
          configured_endpoints: []
        }
      }, { rootDir: path.join(rootDir, ".artifacts", "state", "local-db"), dbMode: "local" }, { workspaceId: "default", projectId: "default", scopeLevel: "project" });

      const githubServer = http.createServer(async (req, res) => {
        if (req.method === "GET" && req.url === "/repos/example/api") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({
            full_name: "example/api",
            permissions: { admin: false, maintain: false, push: true, triage: true, pull: true }
          }));
          return;
        }
        if (req.method === "POST" && req.url === "/repos/example/api/issues/123/comments") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          res.writeHead(201, { "content-type": "application/json" });
          res.end(JSON.stringify({
            html_url: "https://github.example/comment/123",
            body: payload.body ?? ""
          }));
          return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found", path: req.url }));
      });
      await new Promise<void>((resolve, reject) => {
        githubServer.once("error", reject);
        githubServer.listen(githubPort, "127.0.0.1", () => resolve());
      });

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
        assert.equal(outboundDeliveryBlockedResponse.status, 409);
        assert.equal(outboundVerificationPostResponse.status, 200);
        assert.equal(outboundVerificationAfterResponse.status, 200);
        assert.equal(outboundDeliveryResponse.status, 200);
        assert.equal(outboundDeliveryStoredResponse.status, 200);
        assert.equal(reviewSummaryResponse.status, 200);
        assert.equal(reviewAuditResponse.status, 200);
        assert.equal(runtimeFollowupsResponse.status, 200);
        assert.equal(runtimeFollowupSummaryResponse.status, 200);
        assert.equal(runtimeFollowupExportJsonResponse.status, 200);
        assert.equal(runtimeFollowupExportCsvResponse.status, 200);
        assert.equal(observabilitySummaryResponse.status, 200);
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
        assert.equal(findingEvaluationsPayload.export_schema.payload.overall_evidence_sufficiency, "medium");
        await assertExportSchemaMatches("finding_evaluations.v1.json", findingEvaluationsPayload.export_schema);
        assert.equal(findingEvaluationsPayload.finding_evaluations.overall_false_positive_risk, "medium");
        assert.equal(findingEvaluationsPayload.finding_evaluations.findings_needing_validation_count, 4);
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
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.next_action, "waived");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api")?.active_disposition_type, "waiver");
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
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_expired")?.runtime_impact, "string");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.active_disposition_owner_id, "lead-reviewer");
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.needs_disposition_review, false);
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.disposition_review_reason, null);
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.next_action, "waived");
        assert.equal(typeof findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.runtime_impact, "string");
        assert.equal(Array.isArray(findingEvaluationsPayload.finding_evaluations.evaluations.find((item: any) => item.finding_id === "finding_api_reopened")?.runtime_evidence_ids), true);
        assert.equal(findingEvaluationsPayload.finding_evaluations.evaluations.every((item: any) => item.validation_reasons.includes("bounded sandbox execution did not complete cleanly for this run")), true);
        assert.equal(executiveReportJsonPayload.format, "json");
        assert.equal(executiveReportJsonPayload.filename, "run_api-executive-summary.json");
        assert.equal(executiveReportJsonPayload.export_schema.schema_name, "executive_summary.v1");
        assert.equal(executiveReportJsonPayload.export_schema.schema_version, "1.0.0");
        assert.equal(executiveReportJsonPayload.export_schema.tethermark_version, "0.2.0");
        await assertExportSchemaMatches("executive_summary.v1.json", executiveReportJsonPayload.export_schema);
        assert.equal(executiveReportJsonPayload.report_executive.run_id, "run_api");
        assert.equal(executiveReportJsonPayload.report_executive.finding_count, 4);
        assert.equal(Array.isArray(executiveReportJsonPayload.report_executive.top_findings), true);
        assert.equal(typeof executiveReportJsonPayload.report_executive.runtime_validation.blocked_count, "number");
        assert.equal(typeof executiveReportJsonPayload.report_executive.runtime_followups.required_count, "number");
        assert.ok(Array.isArray(executiveReportJsonPayload.report_executive.outstanding_actions));
        assert.equal(executiveReportMarkdownPayload.format, "markdown");
        assert.equal(executiveReportMarkdownPayload.filename, "run_api-executive-summary.md");
        assert.match(String(executiveReportMarkdownPayload.report_executive_markdown || ""), /Executive Security Summary/);
        assert.match(String(executiveReportMarkdownPayload.report_executive_markdown || ""), /Top Findings/);
        assert.equal(markdownReportPayload.format, "markdown");
        assert.equal(markdownReportPayload.filename, "run_api-report.md");
        assert.ok(String(markdownReportPayload.report_markdown).includes("# AI Security Audit Report"));
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
        assert.equal(outboundSendStoredPayload.outbound_send.status, "manual_only");
        assert.equal(outboundVerificationBeforePayload.outbound_verification, null);
        assert.equal(outboundDeliveryBlockedPayload.error, "outbound_delivery_not_allowed");
        assert.equal(outboundDeliveryBlockedPayload.outbound_preview.readiness.execute_allowed, false);
        assert.equal(outboundVerificationPostPayload.outbound_verification.status, "verified");
        assert.equal(outboundVerificationPostPayload.outbound_verification.repo_full_name, "example/api");
        assert.equal(outboundVerificationAfterPayload.outbound_verification.status, "verified");
        assert.equal(outboundDeliveryPayload.outbound_delivery.status, "sent");
        assert.equal(outboundDeliveryPayload.outbound_delivery.external_url, "https://github.example/comment/123");
        assert.equal(outboundDeliveryStoredPayload.outbound_delivery.status, "sent");
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
        assert.equal(integrationsPayload.integrations.find((item: any) => item.id === "github_outbound")?.credential_fields?.find((field: any) => field.id === "github_token")?.env_var, "GITHUB_TOKEN");
        assert.ok(["persisted", "environment"].includes(String(integrationsPayload.integrations.find((item: any) => item.id === "github_outbound")?.status?.fields?.find((field: any) => field.id === "github_token")?.source)));
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
        await new Promise<void>((resolve, reject) => {
          githubServer.close((error) => {
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

        const webhookDeliveriesResponse = await fetch(`${baseUrl}/runs/${finalPayload.attempts[0].run_id}/webhook-deliveries`);
        const webhookDeliveriesPayload = await webhookDeliveriesResponse.json() as any;
        assert.equal(webhookDeliveriesResponse.status, 200);
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

        const finalRetriedPayload = await waitForAsyncRun(baseUrl, queuedCancelPayload.job.job_id);
        assert.equal(finalRetriedPayload.job.status, "succeeded");
        assert.equal(finalRetriedPayload.attempts.length, 2);
        assert.equal(finalRetriedPayload.attempts[0]?.status, "canceled");
        assert.equal(finalRetriedPayload.attempts[1]?.status, "succeeded");

        const listResponse = await fetch(`${baseUrl}/runs/async`);
        const listPayload = await listResponse.json() as any;
        assert.equal(listResponse.status, 200);
        assert.equal(listPayload.jobs.some((item: any) => item.job_id === queuedPayload.job.job_id), true);
        assert.equal(listPayload.jobs.some((item: any) => item.job_id === queuedCancelPayload.job.job_id), true);
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
  const remediation = describeArtifactType("remediation");
  const laneSpecialist = describeArtifactType("lane-specialist-repo_posture");

  assert.equal(findings.disposition, "queryable_persisted");
  assert.equal(findings.persisted_table, "findings");
  assert.equal(observations.disposition, "queryable_persisted");
  assert.equal(observations.persisted_table, "stage_artifacts");
  assert.equal(skepticReview.disposition, "queryable_persisted");
  assert.equal(skepticReview.persisted_table, "supervisor_reviews");
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
        assert.equal(initialSettingsPayload.settings.providers_json.default_provider, "mock");
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
        assert.equal(otherScopeSettingsPayload.settings.providers_json.default_provider, "mock");

        const otherScopeDocumentsResponse = await fetch(`${webBaseUrl}/api/ui/documents`, { headers: otherScopeHeaders });
        const otherScopeDocumentsPayload = await otherScopeDocumentsResponse.json() as any;
        assert.equal(otherScopeDocumentsPayload.documents.length, 0);

        const deleteResponse = await fetch(`${webBaseUrl}/api/ui/documents/${documentCreatePayload.document.id}`, { method: "DELETE", headers: scopedHeaders });
        const deletePayload = await deleteResponse.json() as any;
        assert.equal(deleteResponse.status, 200);
        assert.equal(deletePayload.deleted, true);

        const persistedSettings = await readPersistedUiSettings({ rootDir: LocalRoot, dbMode: "local" }, { workspaceId: "team-alpha", projectId: "project-red" });
        const persistedDocuments = await listPersistedUiDocuments({ rootDir: LocalRoot, dbMode: "local" }, { workspaceId: "team-alpha", projectId: "project-red" });
        assert.ok(persistedSettings);
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

async function testApiProjectScopingAndActorOwnedReviewActions(): Promise<void> {
  await withTempDir("harness-api-scope-", async (rootDir) => {
    const LocalRoot = path.join(rootDir, "local-db");
    const fixtureRoot = path.resolve(process.cwd(), "fixtures", "validation-targets");
    await stageBuiltinCoreEngineData(rootDir);
    await withWorkingDir(rootDir, async () => {
      process.env.HARNESS_LOCAL_DB_ROOT = LocalRoot;
      process.env.HARNESS_API_AUTH_MODE = "api_key";
      process.env.HARNESS_API_KEY = "scope-secret";
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
        delete process.env.HARNESS_LOCAL_DB_ROOT;
        delete process.env.HARNESS_API_AUTH_MODE;
        delete process.env.HARNESS_API_KEY;
        await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
      }
    });
  });
}

async function testValidateFixturesPassesForBundledTargets(): Promise<void> {
  await withTempDir("harness-validate-fixtures-", async (rootDir) => {
    const sharedLocalRoot = path.join(rootDir, "shared-local-db");
    process.env.HARNESS_LOCAL_DB_ROOT = sharedLocalRoot;
    try {
      const summary = await validateFixtures({
        rootDir: path.resolve(process.cwd(), "fixtures", "validation-targets"),
        auditPackage: "agentic-static",
        dbMode: "local",
        llmProvider: "mock"
      });

      assert.equal(summary.selected_fixtures, 3);
      assert.equal(summary.failed_fixtures, 0);
      assert.equal(summary.passed_fixtures, 3);
      assert.equal(await fs.stat(path.join(sharedLocalRoot, "harness.sqlite")).then(() => true).catch(() => false), false);
    } finally {
      delete process.env.HARNESS_LOCAL_DB_ROOT;
    }
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

async function testLinuxContainerSandboxBuildsExecutionPlan(): Promise<void> {
  await withTempDir("harness-container-plan-", async (rootDir) => {
    const sourceDir = path.join(rootDir, "source");
    const sandboxRoot = path.join(rootDir, "sandboxes");
    await fs.mkdir(path.join(sourceDir, "tests"), { recursive: true });
    process.env.HARNESS_ENABLE_HOST_SANDBOX_EXECUTION = "1";
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
    try {
      const backend = new LinuxContainerSandboxBackend(sandboxRoot);
      const sandbox = await backend.create("run_container_plan", {
        local_path: sourceDir,
        run_mode: "runtime",
        audit_package: "runtime-validated",
        llm_provider: "mock"
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
      assert.equal(sandbox.enforcement_notes.some((item) => /Bounded host execution is enabled/.test(item)), true);
      assert.equal(executionResults?.length, 4);
      assert.equal(executionResults?.every((item) => item.status === "completed" || item.status === "failed" || item.status === "blocked"), true);
      const buildResult = executionResults?.find((item) => item.step_id === "build-node") ?? null;
      const testResult = executionResults?.find((item) => item.step_id === "test-node") ?? null;
      const runtimeResult = executionResults?.find((item) => item.step_id === "runtime-node") ?? null;
      assert.ok(buildResult);
      assert.ok(testResult);
      assert.ok(runtimeResult);
      assert.equal(buildResult?.execution_runtime, "host_bounded");
      assert.equal(buildResult?.adapter, "node_npm");
      assert.equal(runtimeResult?.adapter, "http_service");
      assert.equal(buildResult?.normalized_artifact?.type, "build");
      assert.equal(runtimeResult?.normalized_artifact?.type, "runtime_probe");
      assert.equal(buildResult?.normalized_artifact?.details_json?.package_manager, "npm");
      assert.equal(runtimeResult?.normalized_artifact?.details_json?.artifact_role, "service_probe");
      assert.equal(typeof buildResult?.duration_ms, "number");
      if (runtimeResult?.normalized_artifact?.details_json?.probe) {
        assert.equal(Array.isArray((runtimeResult.normalized_artifact.details_json.probe as any).attempted_targets), true);
        assert.equal(typeof (runtimeResult.normalized_artifact.details_json.probe as any).classification, "string");
        assert.equal(Array.isArray((runtimeResult.normalized_artifact.details_json.probe as any).discovered_endpoints), true);
      }
      if (buildResult?.status === "completed") {
        assert.equal(await pathExists(path.join(sandbox.target_dir, "build.ok")), true);
      } else {
        assert.match(buildResult?.summary ?? "", /blocked by the current host|failed|not available for bounded host execution/i);
        if (buildResult?.stderr_excerpt) {
          assert.match(buildResult.stderr_excerpt, /spawn EPERM|not available/i);
        }
      }
      if (testResult?.status === "completed") {
        assert.equal(await pathExists(path.join(sandbox.target_dir, "test.ok")), true);
      } else {
        assert.match(testResult?.summary ?? "", /blocked by the current host|failed|not available for bounded host execution/i);
      }
      if (runtimeResult?.status === "completed") {
        assert.equal(await pathExists(path.join(sandbox.target_dir, "runtime.ok")), true);
      } else {
        assert.match(runtimeResult?.summary ?? "", /blocked by the current host|failed|not available for bounded host execution/i);
      }

      const persistedPlan = JSON.parse(await fs.readFile(path.join(sandbox.root_dir, "artifacts", "execution-plan.json"), "utf8"));
      const persistedResults = JSON.parse(await fs.readFile(path.join(sandbox.root_dir, "artifacts", "execution-results.json"), "utf8"));
      assert.equal(persistedPlan.readiness_status, "ready");
      assert.equal(Array.isArray(persistedPlan.steps), true);
      assert.equal(persistedPlan.steps.length, 4);
      assert.equal(Array.isArray(persistedResults), true);
      assert.equal(persistedResults.length, 4);
      assert.ok(persistedResults.find((item: any) => item.step_id === "build-node"));
      assert.equal(typeof persistedResults.find((item: any) => item.step_id === "build-node")?.duration_ms, "number");
      assert.equal(persistedResults.find((item: any) => item.step_id === "build-node")?.normalized_artifact?.type, "build");
      assert.equal(persistedResults.find((item: any) => item.step_id === "runtime-node")?.adapter, "http_service");
      assert.equal(persistedPlan.steps.find((item: any) => item.step_id === "runtime-node")?.artifact_context?.script_name, "start");
      assert.equal(persistedResults.find((item: any) => item.step_id === "runtime-node")?.normalized_artifact?.details_json?.stack, "node");
    } finally {
      delete process.env.HARNESS_ENABLE_HOST_SANDBOX_EXECUTION;
    }
  });
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
      llm_provider: "mock"
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
      llm_provider: "mock"
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
      llm_provider: "mock"
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
      llm_provider: "mock"
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

async function main(): Promise<void> {
  const tests: Array<[string, () => Promise<void>]> = [
    ["buildScanRequest parses llm flags", testBuildScanRequestParsesLlmFlags],
    ["OpenAI Codex OAuth provider registry and structured exec", testOpenAICodexProviderRegistryAndStructuredExec],
    ["local persistence uses configured root", testLocalPersistenceUsesConfiguredRoot],
    ["compactBundleExports prunes optional debug bundles", testCompactBundleExportsPrunesOptionalDebugBundles],
    ["pruneArtifacts removes old run bundles and updates index", testPruneArtifactsRemovesOldRunBundlesAndUpdatesIndex],
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
    ["api project scoping and actor-owned review actions", testApiProjectScopingAndActorOwnedReviewActions],
      ["validateFixtures passes for bundled targets", testValidateFixturesPassesForBundledTargets],
      ["local binary providers short-circuit when spawn is blocked", testLocalBinaryProvidersShortCircuitWhenSpawnBlocked],
      ["python worker providers report blocked runtime capability when disabled", testPythonWorkerProvidersReportBlockedWhenDisabled],
      ["repo analysis provider emits normalized locations", testRepoAnalysisProviderEmitsNormalizedLocations],
      ["scorecard and trivy normalization emit symbol locations", testScorecardAndTrivyNormalizationEmitSymbolLocations],
      ["linux container sandbox builds bounded execution plan", testLinuxContainerSandboxBuildsExecutionPlan],
      ["linux container sandbox builds python runtime probe plan", testLinuxContainerSandboxBuildsPythonRuntimeProbePlan],
      ["linux container sandbox detects python framework probe defaults", testLinuxContainerSandboxDetectsPythonFrameworkProbeDefaults],
      ["linux container sandbox builds django runtime command", testLinuxContainerSandboxBuildsDjangoRuntimeCommand],
      ["linux container sandbox detects node entrypoint without scripts", testLinuxContainerSandboxDetectsNodeEntrypointWithoutScripts],
      ["runtime evidence influences standards audit", testRuntimeEvidenceInfluencesStandardsAudit]
      ,
      ["finding evaluation uses evidence symbols for grouping", testFindingEvaluationUsesEvidenceSymbolsForGrouping],
      ["run comparison uses evidence symbols for matching", testRunComparisonUsesEvidenceSymbolsForMatching]
    ];

  for (const [name, fn] of tests) {
    await fn();
    console.log(`PASS ${name}`);
  }
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
