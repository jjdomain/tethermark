import process from "node:process";

import { loadEnvironment } from "../../../packages/core-engine/src/env.js";
import { backfillLocalPersistence, cleanupLocalJsonMirrors, compactBundleExports, createEngine, createLocalPersistenceBackup, defaultPersistenceRoot, getPersistedRun, listLocalPersistenceBackups, listPersistedReviewNotifications, listPersistedReviewWorkflows, normalizeLearningSettings, normalizeProjectId, normalizeWorkspaceId, pruneArtifacts, readPersistedReviewActions, readPersistedReviewWorkflow, reconstructLocalRun, reconstructLocalRuns, resolvePersistedUiSettings, restoreLocalPersistenceBackup, runLearningPipeline, runPostgresMigration, submitPersistedReviewAction, validateLocalPersistence, verifyLocalPersistenceBackup, type ArtifactRetentionKind } from "../../../packages/core-engine/src/index.js";
import { buildScanRequest, readBooleanFlag, readFlag, readFlags, readNumberFlag } from "./args.js";
import { analyzeBenchmarkVariance, compareBenchmarkReports, formatBenchmarkCaseLine, loadBenchmarkSuite, printBenchmarkCompare, printBenchmarkSummary, printBenchmarkVariance, runBenchmarkSuite, selectBenchmarkCases } from "./benchmark-suite.js";
import { buildDoctorReport, buildStaticScannerDoctorReport, printDoctorReport, runOnboarding } from "./doctor.js";
import { validateFixtures } from "./fixture-validation.js";
import { parseVerifiableRuntimeBackend, printRuntimeDoctor, runSetupRuntime, validateRuntimeFixtures } from "./setup-runtime.js";
import { runSetupTools } from "./setup-tools.js";
import { printWorkerDoctor, runSetupWorkers, runWorkerSmoke, runWorkerTests } from "./setup-workers.js";

loadEnvironment();

function usage(): void {
  console.log(`Tethermark CLI

Usage:
npm run scan -- scan path <local-path> [--output <dir> (export copy)] [--policy <file.json>] [--policy-pack <id|file.json>] [--mode static|build|runtime|validate] [--package <id>] [--db-mode local|postgres|supabase] [--llm-provider openai|openai_codex|mock] [--llm-model <id>] [--llm-api-key <value>] [--accept-runtime-warning true] [--llm-workload interactive_operator|unattended_local|external_service] [--llm-max-requests <n>] [--llm-max-tokens <n>]
npm run scan -- scan repo <repo-url> [--output <dir> (export copy)] [--policy <file.json>] [--policy-pack <id|file.json>] [--mode static|build|runtime|validate] [--package <id>] [--db-mode local|postgres|supabase] [--llm-provider openai|openai_codex|mock] [--llm-model <id>] [--llm-api-key <value>] [--accept-runtime-warning true] [--llm-workload interactive_operator|unattended_local|external_service] [--llm-max-requests <n>] [--llm-max-tokens <n>]
npm run scan -- scan endpoint <url> [--output <dir> (export copy)] [--policy <file.json>] [--policy-pack <id|file.json>] [--mode static|runtime|validate] [--package <id>] [--db-mode local|postgres|supabase] [--llm-provider openai|openai_codex|mock] [--llm-model <id>] [--llm-api-key <value>] [--accept-runtime-warning true] [--llm-workload interactive_operator|unattended_local|external_service] [--llm-max-requests <n>] [--llm-max-tokens <n>]
npm run scan -- doctor [--json]
npm run scan -- static-doctor [--json]
npm run scan -- onboard [--dry-run] [--skip-doctor] [--skip-fixtures]
npm run scan -- setup-tools [--dry-run] [--yes] [--tool scorecard,semgrep,trivy]
npm run scan -- setup-runtime [--dry-run] [--yes]
npm run scan -- setup-workers [--dry-run] [--yes] [--python <executable>]
npm run scan -- worker-doctor [--json]
npm run scan -- worker-tests
npm run scan -- worker-smoke
npm run scan -- runtime-doctor [--json] [--backend gvisor_container|rootless_podman|podman|docker|docker_desktop]
npm run scan -- validate-runtime-fixtures [--backend gvisor_container|rootless_podman|podman|docker|docker_desktop]
npm run scan -- benchmark list [--suite <id|file.json>] [--case <id>] [--include-extended] [--include-runtime-pending] [--json]
npm run scan -- benchmark run [--suite <id|file.json>] [--case <id>]... [--include-extended] [--include-runtime-pending] [--execute] [--strict] [--output <dir>] [--persistence-root <dir>] [--db-mode local|postgres|supabase] [--llm-provider openai|openai_codex|mock] [--llm-model <id>] [--llm-workload interactive_operator|unattended_local|external_service] [--llm-credential-class chatgpt_session|api_key|enterprise_access_token|none] [--llm-max-requests <n>] [--llm-max-tokens <n>] [--audit-max-agent-calls <n>] [--audit-max-tokens <n>] [--audit-max-reruns <n>]
npm run scan -- benchmark compare --baseline <report.json> --current <report.json>
npm run scan -- benchmark variance --report <report.json> --report <report.json> [...]
  npm run scan -- migrate local-db [--root <dir>] [--dry-run]
  npm run scan -- migrate postgres [--database-url <url>] [--output <file.sql>] [--psql-command <path>] [--dry-run]
  npm run scan -- migrate supabase [--database-url <url>] [--output <file.sql>] [--psql-command <path>] [--dry-run]
  npm run scan -- migrate cleanup-json-mirrors [--root <dir>] [--dry-run]
  npm run scan -- migrate compact-bundle-exports [--root <dir>] [--retention-days <n>] [--dry-run]
  npm run scan -- reconstruct run <run-id> [--root <dir>] [--dry-run]
  npm run scan -- reconstruct runs [--root <dir>] [--target-id <id>] [--status <status>] [--audit-package <id>] [--run-mode <mode>] [--target-class <class>] [--rating <rating>] [--publishability-status <status>] [--policy-pack-id <id>] [--since <iso>] [--until <iso>] [--requires-human-review true|false] [--has-findings true|false] [--limit <n>] [--dry-run]
  npm run scan -- validate-persistence [--root <dir>] [--target-id <id>] [--status <status>] [--audit-package <id>] [--run-mode <mode>] [--target-class <class>] [--rating <rating>] [--publishability-status <status>] [--policy-pack-id <id>] [--since <iso>] [--until <iso>] [--requires-human-review true|false] [--has-findings true|false] [--limit <n>]
  npm run scan -- backup create [--root <dir>] [--output <backup-dir>] [--reason <label>]
  npm run scan -- backup list [--root <dir>] [--json]
  npm run scan -- backup verify --backup <backup-dir> [--json]
  npm run scan -- backup restore --backup <backup-dir> [--root <dir>]
npm run scan -- artifacts prune [--root <dir>] [--kind runs|sandboxes|all] [--older-than <days|30d>] [--retention-days <n>] [--max-gb <n>] [--dry-run]
npm run scan -- validate-fixtures [--root <dir>] [--fixture <id>] [--package <id>] [--db-mode local|postgres|supabase] [--persistence-root <dir>] [--llm-provider openai|mock] [--llm-model <id>]
npm run scan -- review queue [--root <dir>] [--db-mode local|postgres|supabase] [--status <review-status>] [--limit <n>]
npm run scan -- review status <run-id> [--root <dir>] [--db-mode local|postgres|supabase]
npm run scan -- review action <run-id> --reviewer <id> --action <type> [--assigned-reviewer <id>] [--finding-id <id>] [--previous-severity <level>] [--updated-severity <level>] [--visibility public|internal] [--notes <text>] [--root <dir>] [--db-mode local|postgres|supabase]
npm run scan -- review notifications [--reviewer <id>] [--status unread|acknowledged] [--root <dir>] [--db-mode local|postgres|supabase]
`);
}

function parseDaysFlag(args: string[]): number | null {
  const retentionDays = readNumberFlag(args, "--retention-days");
  if (retentionDays != null) return retentionDays;
  const raw = readFlag(args, "--older-than");
  if (!raw) return null;
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)(d|day|days)?$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseArtifactKind(value: string | undefined): ArtifactRetentionKind | undefined {
  return value === "runs" || value === "sandboxes" || value === "all" ? value : undefined;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function formatToolExecution(item: any): string {
  const fallback = item.adapter?.adapter_action === "fallback" ? ` fallback_from=${item.adapter.requested_provider_id}` : "";
  const capability = item.capability_status && item.capability_status !== "unknown" ? ` capability=${item.capability_status}` : "";
  const failure = item.failure_category ? ` reason=${item.failure_category}` : "";
  return `${item.provider_id}:${item.status}${fallback}${capability}${failure}`;
}

function printStaticReadinessSummary(result: any): void {
  const selected = uniqueStrings([...(result.run_plan?.baseline_tools ?? []), ...(result.run_plan?.runtime_tools ?? [])]);
  const executions = Array.isArray(result.evidence_executions) ? result.evidence_executions : [];
  const completed = executions.filter((item: any) => item.status === "completed");
  const skipped = executions.filter((item: any) => item.status === "skipped");
  const failed = executions.filter((item: any) => item.status === "failed");
  const fallbacks = executions.filter((item: any) => item.adapter?.adapter_action === "fallback");
  const applicableControls = (result.control_results ?? []).filter((item: any) => item.applicability === "applicable");
  const notAssessedControls = applicableControls.filter((item: any) => item.assessability === "not_assessed" || item.status === "not_assessed");
  const staticTools = ["scorecard", "scorecard_api", "semgrep", "trivy"];
  const staticToolExecutions = executions.filter((item: any) => staticTools.includes(item.provider_id) || staticTools.includes(item.tool));

  console.log(`Static readiness: ${completed.length} completed, ${skipped.length} skipped, ${failed.length} failed evidence providers`);
  console.log(`Static tool coverage: ${staticToolExecutions.map(formatToolExecution).join(", ") || "none"}`);
  if (fallbacks.length) {
    console.log(`Fallbacks used: ${fallbacks.map(formatToolExecution).join(", ")}`);
  }
  if (skipped.length || failed.length) {
    console.log(`Evidence gaps: ${[...skipped, ...failed].map(formatToolExecution).join(", ")}`);
  }
  console.log(`Control assessability: ${applicableControls.length - notAssessedControls.length}/${applicableControls.length} applicable controls assessed, ${notAssessedControls.length} not assessed`);
  if (notAssessedControls.length) {
    console.log(`Controls not assessed: ${notAssessedControls.map((item: any) => item.control_id || item.title || "unknown").slice(0, 20).join(", ")}`);
  }
  const internallySatisfied = new Set(["repo_analysis"]);
  const missingSelected = selected.filter((tool) => !internallySatisfied.has(tool) && !executions.some((item: any) => item.provider_id === tool || item.tool === tool || item.adapter?.requested_provider_id === tool));
  if (missingSelected.length) {
    console.log(`Selected tools without execution records: ${missingSelected.join(", ")}`);
  }
  console.log(result.sandbox?.run_mode === "static"
    ? "Confidence limits: static mode does not execute target behavior; skipped tools and not-assessed controls reduce confidence and are not clean passes."
    : "Confidence limits: runtime target behavior is bounded by the resolved sandbox plan; blocked, failed, skipped, and not-assessed checks reduce confidence and are not clean passes.");
}

async function runScan(args: string[]): Promise<void> {
  const { request, targetType, targetValue } = buildScanRequest(args);
  if (!targetType || !targetValue) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (!["path", "repo", "endpoint"].includes(targetType)) {
    usage();
    process.exitCode = 1;
    return;
  }

  const engine = createEngine();
  const result = await engine.run(request);
  console.log(`Run ID: ${result.run_id}`);
  console.log(`Target: ${result.target.snapshot.value}`);
  console.log(`Commit: ${result.target.snapshot.commit_sha ?? "n/a"}`);
  console.log(`Profile: ${result.run_plan.selected_profile}`);
  console.log(`Target class: ${result.target_profile.semantic_review.final_class} (semantic confidence ${result.target_profile.semantic_review.confidence})`);
  console.log(`Package: ${result.audit_package}`);
  console.log(`Lanes: ${result.audit_lanes.join(", ")}`);
  console.log(`Methodology: ${result.score_summary.methodology_version}`);
  console.log(`Policy pack: ${result.audit_policy.policy_pack_id ?? "custom-inline"} (${result.audit_policy.policy_pack_source ?? "request"})`);
  console.log(`Score: ${result.score_summary.overall_score}/100 (${result.score_summary.rating})`);
  console.log(`Static baseline: ${result.static_score}/100 (${result.static_baseline.version})`);
  console.log(`In-scope controls: ${result.control_results.filter((item) => item.applicability === "applicable").length}`);
  console.log(`Findings: ${result.findings.length}`);
  console.log(`Sandbox: ${result.sandbox.target_dir}`);
  console.log(`Sandbox size: ${result.sandbox.storage_usage.target_file_count} files, ${result.sandbox.storage_usage.target_bytes} bytes`);
  console.log(`Tools selected: ${[...result.run_plan.baseline_tools, ...result.run_plan.runtime_tools].join(", ") || "none"}`);
  console.log(`Evidence execution: ${result.evidence_executions.map((item) => `${item.provider_id}:${item.status}`).join(", ") || "none"}`);
  printStaticReadinessSummary(result);
  console.log(`Dimension scores:`);
  for (const dimension of result.dimension_scores) {
    console.log(`- ${dimension.dimension}: ${dimension.percentage}% (${dimension.score}/${dimension.max_score})`);
  }
  console.log(`Framework scores:`);
  for (const framework of result.score_summary.framework_scores) {
    console.log(`- ${framework.framework}: ${framework.percentage}% (${framework.score}/${framework.max_score})`);
  }
  console.log(`Agent calls: ${result.agent_invocations.length}`);
  console.log(`Persistence: ${result.persistence?.mode ?? "n/a"} -> ${result.persistence?.root ?? "n/a"}`);
  console.log(`Provider: ${result.agent_invocations[0]?.model_provider ?? "unknown"}`);
  console.log(`Artifacts:`);
  for (const artifact of result.artifacts) {
    console.log(`- ${artifact.type}: ${artifact.path}`);
  }
}

async function runMigration(args: string[]): Promise<void> {
  if (args[1] === "postgres" || args[1] === "supabase") {
    try {
      const result = await runPostgresMigration({
        databaseUrl: readFlag(args, "--database-url"),
        outputFile: readFlag(args, "--output"),
        psqlCommand: readFlag(args, "--psql-command"),
        dryRun: args.includes("--dry-run")
      });
      console.log(`Mode: ${args[1]}`);
      console.log(`Dry run: ${result.dry_run ? "yes" : "no"}`);
      console.log(`Applied: ${result.applied ? "yes" : "no"}`);
      console.log(`Migration file: ${result.migration_file}`);
      console.log(`Database URL source: ${result.database_url_source ?? "not configured"}`);
      if (result.command) console.log(`Command: ${result.command}`);
      if (result.stdout.trim()) console.log(result.stdout.trim());
      if (result.stderr.trim()) console.error(result.stderr.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "postgres_database_url_required") {
        console.error("Postgres/Supabase database URL required. Set HARNESS_POSTGRES_URL, SUPABASE_DB_URL, DATABASE_URL, or pass --database-url.");
      } else {
        console.error(message);
      }
      process.exitCode = 1;
    }
    return;
  }

  if (args[1] === "local-db") {
    const summary = await backfillLocalPersistence({ rootDir: readFlag(args, "--root"), dryRun: args.includes("--dry-run") });
    console.log(`Root: ${summary.root}`);
    console.log(`Dry run: ${summary.dry_run ? "yes" : "no"}`);
    console.log(`Scanned runs: ${summary.scanned_runs}`);
    console.log(`Updated runs: ${summary.updated_runs}`);
    console.log(`Skipped runs: ${summary.skipped_runs}`);
    console.log(`Unresolved runs: ${summary.unresolved_runs.length}`);
    for (const runId of summary.unresolved_runs) {
      console.log(`- ${runId}`);
    }
    return;
  }

  if (args[1] === "cleanup-json-mirrors") {
    const summary = await cleanupLocalJsonMirrors({ rootDir: readFlag(args, "--root"), dryRun: args.includes("--dry-run") });
    console.log(`Root: ${summary.root}`);
    console.log(`Dry run: ${summary.dry_run ? "yes" : "no"}`);
    console.log(`Removed files: ${summary.removed_files.length}`);
    for (const fileName of summary.removed_files) {
      console.log(`- remove: ${fileName}`);
    }
    console.log(`Kept entries: ${summary.kept_files.length}`);
    for (const fileName of summary.kept_files) {
      console.log(`- keep: ${fileName}`);
    }
    return;
  }

  if (args[1] === "compact-bundle-exports") {
    const summary = await compactBundleExports({
      rootDir: readFlag(args, "--root"),
      dryRun: args.includes("--dry-run"),
      retentionDays: readNumberFlag(args, "--retention-days") ?? null,
      mode: "local"
    });
    console.log(`Root: ${summary.root}`);
    console.log(`Dry run: ${summary.dry_run ? "yes" : "no"}`);
    console.log(`Policy: ${summary.policy.policy}`);
    console.log(`Bundle exports enabled: ${summary.policy.enabled ? "yes" : "no"}`);
    console.log(`Retention days: ${summary.policy.retention_days ?? "none"}`);
    console.log(`Scanned files: ${summary.scanned_files}`);
    console.log(`Removed files: ${summary.removed_files.length}`);
    for (const fileName of summary.removed_files) {
      console.log(`- remove: ${fileName}`);
    }
    console.log(`Kept files: ${summary.kept_files.length}`);
    for (const fileName of summary.kept_files) {
      console.log(`- keep: ${fileName}`);
    }
    return;
  }

  usage();
  process.exitCode = 1;
}

async function runArtifacts(args: string[]): Promise<void> {
  if (args[1] === "prune") {
    const maxGb = readNumberFlag(args, "--max-gb");
    const summary = await pruneArtifacts({
      rootDir: readFlag(args, "--root"),
      dryRun: args.includes("--dry-run"),
      kind: parseArtifactKind(readFlag(args, "--kind")),
      olderThanDays: parseDaysFlag(args),
      maxBytes: maxGb != null ? Math.floor(maxGb * 1024 * 1024 * 1024) : null
    });
    console.log(`Root: ${summary.root}`);
    console.log(`Dry run: ${summary.dry_run ? "yes" : "no"}`);
    console.log(`Kind: ${summary.kind}`);
    console.log(`Older than days: ${summary.older_than_days ?? "none"}`);
    console.log(`Max bytes: ${summary.max_bytes ?? "none"}`);
    console.log(`Scanned: ${summary.scanned_count} entries, ${summary.scanned_bytes} bytes`);
    console.log(`Removed: ${summary.removed_count} entries, ${summary.removed_bytes} bytes`);
    for (const item of summary.removed) {
      console.log(`- remove ${item.kind}:${item.id} ${item.size_bytes} bytes reasons=${item.prune_reasons.join(",")}`);
    }
    console.log(`Kept: ${summary.kept_count} entries, ${summary.kept_bytes} bytes`);
    if (summary.run_index_pruned_ids.length) {
      console.log(`Run index pruned: ${summary.run_index_pruned_ids.join(", ")}`);
    }
    for (const missingRoot of summary.missing_roots) {
      console.log(`Missing root: ${missingRoot}`);
    }
    return;
  }

  usage();
  process.exitCode = 1;
}

async function runReconstruct(args: string[]): Promise<void> {
  if (args[1] === "run" && args[2]) {
    const summary = await reconstructLocalRun({
      runId: args[2],
      rootDir: readFlag(args, "--root"),
      dryRun: args.includes("--dry-run")
    });

    console.log(`Root: ${summary.root}`);
    console.log(`Dry run: ${summary.dry_run ? "yes" : "no"}`);
    console.log(`Run ID: ${summary.run_id}`);
    console.log(`Artifact root: ${summary.artifact_root ?? "n/a"}`);
    console.log(`Changed: ${summary.changed ? "yes" : "no"}`);
    console.log(`Persisted: ${summary.persisted ? "yes" : "no"}`);
    console.log(`Bundle updated: ${summary.updated_bundle_file ? "yes" : "no"}`);
    console.log(`Changed sections: ${summary.preview.changed_sections.join(", ") || "none"}`);
    console.log(`Changed tool providers: ${summary.preview.changed_tool_providers.join(", ") || "none"}`);
    return;
  }

  if (args[1] === "runs") {
    const summary = await reconstructLocalRuns({
      rootDir: readFlag(args, "--root"),
      dryRun: args.includes("--dry-run"),
      targetId: readFlag(args, "--target-id"),
      status: readFlag(args, "--status"),
      auditPackage: readFlag(args, "--audit-package"),
      runMode: readFlag(args, "--run-mode"),
      targetClass: readFlag(args, "--target-class"),
      rating: readFlag(args, "--rating"),
      publishabilityStatus: readFlag(args, "--publishability-status"),
      policyPackId: readFlag(args, "--policy-pack-id"),
      since: readFlag(args, "--since"),
      until: readFlag(args, "--until"),
      requiresHumanReview: readBooleanFlag(args, "--requires-human-review"),
      hasFindings: readBooleanFlag(args, "--has-findings"),
      limit: readNumberFlag(args, "--limit")
    });

    console.log(`Root: ${summary.root}`);
    console.log(`Dry run: ${summary.dry_run ? "yes" : "no"}`);
    console.log(`Selected runs: ${summary.selected_runs}`);
    console.log(`Updated runs: ${summary.updated_runs}`);
    console.log(`Unchanged runs: ${summary.unchanged_runs}`);
    console.log(`Unresolved runs: ${summary.unresolved_runs.length}`);
    for (const runId of summary.unresolved_runs) {
      console.log(`- unresolved: ${runId}`);
    }
    for (const runId of summary.run_ids) {
      console.log(`- selected: ${runId}`);
    }
    for (const item of summary.changed_run_previews) {
      console.log(`- changed: ${item.run_id} [${item.preview.changed_sections.join(", ") || "none"}] tools=${item.preview.changed_tool_providers.join(", ") || "none"}`);
    }
    return;
  }

  usage();
  process.exitCode = 1;
}

async function runValidatePersistence(args: string[]): Promise<void> {
  const summary = await validateLocalPersistence({
    rootDir: readFlag(args, "--root"),
    targetId: readFlag(args, "--target-id"),
    status: readFlag(args, "--status"),
    auditPackage: readFlag(args, "--audit-package"),
    runMode: readFlag(args, "--run-mode"),
    targetClass: readFlag(args, "--target-class"),
    rating: readFlag(args, "--rating"),
    publishabilityStatus: readFlag(args, "--publishability-status"),
    policyPackId: readFlag(args, "--policy-pack-id"),
    since: readFlag(args, "--since"),
    until: readFlag(args, "--until"),
    requiresHumanReview: readBooleanFlag(args, "--requires-human-review"),
    hasFindings: readBooleanFlag(args, "--has-findings"),
    limit: readNumberFlag(args, "--limit")
  });

  console.log(`Root: ${summary.root}`);
  console.log(`Selected runs: ${summary.selected_runs}`);
  console.log(`Valid runs: ${summary.valid_runs}`);
  console.log(`Invalid runs: ${summary.invalid_runs}`);
  for (const result of summary.results) {
    const status = result.valid ? "valid" : "invalid";
    const missing = result.missing_sections.join(", ") || "none";
    const mismatches = result.count_mismatches.map((item) => `${item.section}:${item.actual}/${item.expected}`).join(", ") || "none";
    console.log(`- ${result.run_id}: ${status} missing=[${missing}] mismatches=[${mismatches}]`);
  }

  if (summary.invalid_runs > 0) {
    process.exitCode = 1;
  }
}

async function runBackup(args: string[]): Promise<void> {
  const command = args[1];
  const rootDir = readFlag(args, "--root") ?? defaultPersistenceRoot("local");
  if (command === "create") {
    const result = await createLocalPersistenceBackup({
      rootDir,
      outputDir: readFlag(args, "--output"),
      reason: readFlag(args, "--reason") ?? "manual"
    });
    console.log(`Backup: ${result.backup_dir}`);
    console.log(`Schema: ${result.manifest.source_schema_version}`);
    console.log(`SHA-256: ${result.manifest.database_sha256}`);
    console.log(`Verified: ${result.verification.valid ? "yes" : "no"}`);
    return;
  }

  if (command === "list") {
    const backups = await listLocalPersistenceBackups(rootDir);
    if (args.includes("--json")) {
      console.log(JSON.stringify({ root: rootDir, backups }, null, 2));
      return;
    }
    console.log(`Root: ${rootDir}`);
    console.log(`Backups: ${backups.length}`);
    for (const item of backups) {
      console.log(`- ${item.manifest.created_at} ${item.manifest.reason} schema=${item.manifest.source_schema_version} verified=${item.verification.valid ? "yes" : "no"} ${item.backup_dir}`);
    }
    return;
  }

  const backupDir = readFlag(args, "--backup");
  if (!backupDir) throw new Error("backup_directory_required: pass --backup <backup-dir>");
  if (command === "verify") {
    const verification = await verifyLocalPersistenceBackup(backupDir);
    if (args.includes("--json")) console.log(JSON.stringify(verification, null, 2));
    else {
      console.log(`Backup: ${verification.backup_dir}`);
      console.log(`Valid: ${verification.valid ? "yes" : "no"}`);
      console.log(`Compatible: ${verification.compatible ? "yes" : "no"}`);
      console.log(`Issues: ${verification.issues.join(", ") || "none"}`);
    }
    if (!verification.valid) process.exitCode = 1;
    return;
  }

  if (command === "restore") {
    const result = await restoreLocalPersistenceBackup({ rootDir, backupDir });
    console.log(`Restored: ${result.backup_dir}`);
    console.log(`Root: ${result.root}`);
    console.log(`Schema: ${result.restored_schema_version}`);
    console.log(`Safety backup: ${result.safety_backup_dir ?? "none (no prior valid database)"}`);
    console.log(`Rejected database copy: ${result.rejected_database_path ?? "none"}`);
    console.log("Run `npm run scan -- migrate local-db --root <dir>` before starting the upgraded service when the restored schema is legacy.");
    return;
  }

  throw new Error("unsupported_backup_command: use create, list, verify, or restore");
}

async function triggerLearningForCliReviewAction(args: {
  runId: string;
  rootDir?: string;
  dbMode?: any;
  actorId: string;
}): Promise<void> {
  try {
    const rootDirOrOptions = { rootDir: args.rootDir, dbMode: args.dbMode };
    const run = await getPersistedRun(args.runId, rootDirOrOptions);
    if (!run) return;
    const workspaceId = normalizeWorkspaceId(run.workspace_id);
    const projectId = normalizeProjectId(run.project_id);
    const settingsResolution = await resolvePersistedUiSettings(rootDirOrOptions, { workspaceId, projectId });
    const learningSettings = normalizeLearningSettings(settingsResolution.effective.learning_json);
    if (!learningSettings.enabled
      || !learningSettings.event_driven_enabled
      || !["event_driven", "hybrid"].includes(learningSettings.trigger_mode)) return;
    await runLearningPipeline({
      rootDir: args.rootDir,
      dbMode: args.dbMode,
      workspaceId,
      projectId,
      runId: args.runId,
      trigger: "review_action",
      actorId: args.actorId,
      settings: settingsResolution.effective.learning_json,
      providers: settingsResolution.effective.providers_json
    });
  } catch (error) {
    console.error(`Learning review_action trigger failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runValidateFixtures(args: string[]): Promise<void> {
  const summary = await validateFixtures({
    rootDir: readFlag(args, "--root"),
    fixtureId: readFlag(args, "--fixture"),
    persistenceRoot: readFlag(args, "--persistence-root"),
    auditPackage: readFlag(args, "--package") as any,
    dbMode: readFlag(args, "--db-mode") as any,
    llmProvider: readFlag(args, "--llm-provider") as any,
    llmModel: readFlag(args, "--llm-model") ?? undefined
  });

  console.log(`Root: ${summary.root}`);
  console.log(`Selected fixtures: ${summary.selected_fixtures}`);
  console.log(`Passed fixtures: ${summary.passed_fixtures}`);
  console.log(`Failed fixtures: ${summary.failed_fixtures}`);
  for (const result of summary.results) {
    console.log(`- ${result.fixture_id}: ${result.passed ? "pass" : "fail"} class=${result.target_class} findings=${result.finding_categories.join(",") || "none"} human_review=${result.human_review_required ? "true" : "false"} run=${result.run_id}`);
    for (const issue of result.issues) {
      console.log(`  issue: ${issue}`);
    }
  }

  if (summary.failed_fixtures > 0 || summary.selected_fixtures === 0) {
    process.exitCode = 1;
  }
}

async function runBenchmark(args: string[]): Promise<void> {
  const command = args[1];

  if (command === "list") {
    const suite = await loadBenchmarkSuite(readFlag(args, "--suite"));
    const cases = selectBenchmarkCases(suite, {
      caseId: readFlag(args, "--case"),
      includeExtended: args.includes("--include-extended"),
      includeRuntimePending: args.includes("--include-runtime-pending")
    });
    if (args.includes("--json")) {
      console.log(JSON.stringify({ suite_id: suite.suite_id, suite_version: suite.suite_version, title: suite.title, selected_cases: cases.length, cases }, null, 2));
      return;
    }
    console.log(`${suite.title} (${suite.suite_id}@${suite.suite_version})`);
    console.log(suite.summary);
    console.log(`Cases: ${cases.length}`);
    for (const item of cases) console.log(`- ${formatBenchmarkCaseLine(item)}`);
    return;
  }

  if (command === "run") {
    const summary = await runBenchmarkSuite({
      suitePath: readFlag(args, "--suite"),
      caseIds: readFlags(args, "--case"),
      includeExtended: args.includes("--include-extended"),
      includeRuntimePending: args.includes("--include-runtime-pending"),
      execute: args.includes("--execute"),
      strict: args.includes("--strict"),
      outputDir: readFlag(args, "--output"),
      persistenceRoot: readFlag(args, "--persistence-root"),
      dbMode: readFlag(args, "--db-mode") as any,
      llmProvider: readFlag(args, "--llm-provider") as any,
      llmModel: readFlag(args, "--llm-model") ?? undefined,
      llmWorkloadClass: readFlag(args, "--llm-workload") as any,
      llmCredentialClass: readFlag(args, "--llm-credential-class") as any,
      llmMaxRequests: readNumberFlag(args, "--llm-max-requests"),
      llmMaxTokens: readNumberFlag(args, "--llm-max-tokens"),
      auditMaxAgentCalls: readNumberFlag(args, "--audit-max-agent-calls"),
      auditMaxTotalTokens: readNumberFlag(args, "--audit-max-tokens"),
      auditMaxRerunRounds: readNumberFlag(args, "--audit-max-reruns")
    });
    printBenchmarkSummary(summary);
    if (summary.failed_cases > 0) process.exitCode = 1;
    return;
  }

  if (command === "compare") {
    const baselinePath = readFlag(args, "--baseline");
    const currentPath = readFlag(args, "--current");
    if (!baselinePath || !currentPath) {
      usage();
      process.exitCode = 1;
      return;
    }
    const result = await compareBenchmarkReports({ baselinePath, currentPath });
    printBenchmarkCompare(result);
    if (!result.passed) process.exitCode = 1;
    return;
  }

  if (command === "variance") {
    const reportPaths = readFlags(args, "--report");
    if (reportPaths.length < 2) {
      usage();
      process.exitCode = 1;
      return;
    }
    const result = await analyzeBenchmarkVariance({ reportPaths });
    printBenchmarkVariance(result);
    if (!result.passed) process.exitCode = 1;
    return;
  }

  usage();
  process.exitCode = 1;
}

async function runReview(args: string[]): Promise<void> {
  const rootDir = readFlag(args, "--root");
  const dbMode = readFlag(args, "--db-mode") as any;

  if (args[1] === "queue") {
    const workflows = await listPersistedReviewWorkflows({
      rootDir,
      dbMode,
      reviewStatus: readFlag(args, "--status") as any,
      requiresHumanReview: true,
      limit: readNumberFlag(args, "--limit")
    });

    console.log(`Review items: ${workflows.length}`);
    for (const item of workflows) {
      console.log(`- ${item.run_id}: status=${item.status} review_required=${item.human_review_required ? "true" : "false"} reviewer=${item.current_reviewer_id ?? "none"} publishability=${item.publishability_status ?? "unknown"} target=${item.run?.target_id ?? "unknown"}`);
    }
    return;
  }

  if (args[1] === "status" && args[2]) {
    const [workflow, actions] = await Promise.all([
      readPersistedReviewWorkflow(args[2], { rootDir, dbMode }),
      readPersistedReviewActions(args[2], { rootDir, dbMode })
    ]);

    if (!workflow) {
      console.log(`Run: ${args[2]}`);
      console.log(`Review workflow: not_found`);
      process.exitCode = 1;
      return;
    }

    console.log(`Run: ${args[2]}`);
    console.log(`Status: ${workflow.status}`);
    console.log(`Human review required: ${workflow.human_review_required ? "true" : "false"}`);
    console.log(`Publishability: ${workflow.publishability_status ?? "unknown"}`);
    console.log(`Visibility: ${workflow.recommended_visibility ?? "unknown"}`);
    console.log(`Reviewer: ${workflow.current_reviewer_id ?? "none"}`);
    console.log(`Opened: ${workflow.opened_at}`);
    console.log(`Started: ${workflow.started_at ?? "n/a"}`);
    console.log(`Completed: ${workflow.completed_at ?? "n/a"}`);
    console.log(`Last action: ${workflow.last_action_type ?? "n/a"} @ ${workflow.last_action_at ?? "n/a"}`);
    console.log(`Actions: ${actions.length}`);
    for (const action of actions) {
      console.log(`- ${action.created_at} ${action.reviewer_id} ${action.action_type}${action.finding_id ? ` finding=${action.finding_id}` : ""}${action.notes ? ` notes=${action.notes}` : ""}`);
    }
    return;
  }

  if (args[1] === "notifications") {
    const notifications = await listPersistedReviewNotifications({
      rootDir,
      dbMode,
      reviewerId: readFlag(args, "--reviewer"),
      status: readFlag(args, "--status") as any
    });
    console.log(`Notifications: ${notifications.length}`);
    for (const item of notifications) {
      console.log(`- ${item.id}: reviewer=${item.reviewer_id} status=${item.status} run=${item.run_id} created=${item.created_at} message=${item.message}`);
    }
    return;
  }

  if (args[1] === "action" && args[2]) {
    const reviewerId = readFlag(args, "--reviewer");
    const actionType = readFlag(args, "--action");
    if (!reviewerId || !actionType) {
      usage();
      process.exitCode = 1;
      return;
    }

    const submitted = await submitPersistedReviewAction({
      runId: args[2],
      rootDirOrOptions: { rootDir, dbMode },
      input: {
        reviewer_id: reviewerId,
        action_type: actionType as any,
        assigned_reviewer_id: readFlag(args, "--assigned-reviewer") ?? null,
        finding_id: readFlag(args, "--finding-id") ?? null,
        previous_severity: readFlag(args, "--previous-severity") as any,
        updated_severity: readFlag(args, "--updated-severity") as any,
        visibility_override: readFlag(args, "--visibility") as any,
        notes: readFlag(args, "--notes") ?? null
      }
    });
    await triggerLearningForCliReviewAction({
      runId: args[2],
      rootDir,
      dbMode,
      actorId: reviewerId
    });

    console.log(`Run: ${args[2]}`);
    console.log(`Action: ${submitted.action.action_type}`);
    console.log(`Reviewer: ${submitted.action.reviewer_id}`);
    if (submitted.action.assigned_reviewer_id) {
      console.log(`Assigned reviewer: ${submitted.action.assigned_reviewer_id}`);
    }
    console.log(`Workflow status: ${submitted.workflow.status}`);
    console.log(`Last action at: ${submitted.workflow.last_action_at}`);
    if (submitted.notification) {
      console.log(`Notification: ${submitted.notification.id} -> ${submitted.notification.reviewer_id} (${submitted.notification.status})`);
    }
    return;
  }

  usage();
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === "--help") {
    usage();
    return;
  }

  if (args[0] === "scan") {
    await runScan(args);
    return;
  }

  if (args[0] === "doctor") {
    const report = buildDoctorReport();
    printDoctorReport(report, args.includes("--json"));
    if (report.summary.fail > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (args[0] === "static-doctor") {
    const report = buildStaticScannerDoctorReport();
    printDoctorReport(report, args.includes("--json"));
    if (report.summary.fail > 0) process.exitCode = 1;
    return;
  }

  if (args[0] === "onboard") {
    runOnboarding({
      dryRun: args.includes("--dry-run"),
      skipDoctor: args.includes("--skip-doctor"),
      skipFixtures: args.includes("--skip-fixtures")
    });
    return;
  }

  if (args[0] === "setup-tools") {
    await runSetupTools({
      dryRun: args.includes("--dry-run"),
      yes: args.includes("--yes"),
      tools: readFlag(args, "--tool")
    });
    return;
  }

  if (args[0] === "setup-runtime") {
    runSetupRuntime({
      dryRun: args.includes("--dry-run"),
      yes: args.includes("--yes")
    });
    return;
  }

  if (args[0] === "runtime-doctor") {
    printRuntimeDoctor(args.includes("--json"), parseVerifiableRuntimeBackend(readFlag(args, "--backend")));
    return;
  }

  if (args[0] === "setup-workers") {
    runSetupWorkers({
      dryRun: args.includes("--dry-run"),
      yes: args.includes("--yes"),
      python: readFlag(args, "--python")
    });
    return;
  }

  if (args[0] === "worker-doctor") {
    const inspection = printWorkerDoctor(args.includes("--json"));
    if (!inspection.ready) process.exitCode = 1;
    return;
  }

  if (args[0] === "worker-tests") {
    if (!runWorkerTests()) process.exitCode = 1;
    return;
  }

  if (args[0] === "worker-smoke") {
    if (!await runWorkerSmoke()) process.exitCode = 1;
    return;
  }

  if (args[0] === "validate-runtime-fixtures") {
    const result = await validateRuntimeFixtures({ backend: parseVerifiableRuntimeBackend(readFlag(args, "--backend")) });
    console.log(JSON.stringify({ runtime_fixture_validation: result }, null, 2));
    if (!result.passed) process.exitCode = 1;
    return;
  }

  if (args[0] === "benchmark") {
    await runBenchmark(args);
    return;
  }

  if (args[0] === "migrate") {
    await runMigration(args);
    return;
  }

  if (args[0] === "reconstruct") {
    await runReconstruct(args);
    return;
  }

  if (args[0] === "validate-persistence") {
    await runValidatePersistence(args);
    return;
  }

  if (args[0] === "backup") {
    await runBackup(args);
    return;
  }

  if (args[0] === "artifacts") {
    await runArtifacts(args);
    return;
  }

  if (args[0] === "validate-fixtures") {
    await runValidateFixtures(args);
    return;
  }

  if (args[0] === "review") {
    await runReview(args);
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
