import process from "node:process";

import { loadEnvironment } from "../../../packages/core-engine/src/env.js";
import { backfillLocalPersistence, cleanupLocalJsonMirrors, compactBundleExports, createEngine, listPersistedReviewNotifications, listPersistedReviewWorkflows, pruneArtifacts, readPersistedReviewActions, readPersistedReviewWorkflow, reconstructLocalRun, reconstructLocalRuns, submitPersistedReviewAction, validateLocalPersistence, type ArtifactRetentionKind } from "../../../packages/core-engine/src/index.js";
import { buildScanRequest, readBooleanFlag, readFlag, readNumberFlag } from "./args.js";
import { buildDoctorReport, printDoctorReport, runOnboarding } from "./doctor.js";
import { validateFixtures } from "./fixture-validation.js";
import { runSetupTools } from "./setup-tools.js";

loadEnvironment();

function usage(): void {
  console.log(`Tethermark CLI

Usage:
npm run scan -- scan path <local-path> [--output <dir> (export copy)] [--policy <file.json>] [--policy-pack <id|file.json>] [--mode static|build|runtime|validate] [--package <id>] [--db-mode local] [--llm-provider openai|mock] [--llm-model <id>] [--llm-api-key <value>]
npm run scan -- scan repo <repo-url> [--output <dir> (export copy)] [--policy <file.json>] [--policy-pack <id|file.json>] [--mode static|build|runtime|validate] [--package <id>] [--db-mode local] [--llm-provider openai|mock] [--llm-model <id>] [--llm-api-key <value>]
npm run scan -- scan endpoint <url> [--output <dir> (export copy)] [--policy <file.json>] [--policy-pack <id|file.json>] [--mode static|runtime|validate] [--package <id>] [--db-mode local] [--llm-provider openai|mock] [--llm-model <id>] [--llm-api-key <value>]
npm run scan -- doctor [--json]
npm run scan -- onboard [--dry-run] [--skip-doctor] [--skip-fixtures]
npm run scan -- setup-tools [--dry-run] [--yes] [--tool scorecard,semgrep,trivy]
  npm run scan -- migrate local-db [--root <dir>] [--dry-run]
  npm run scan -- migrate cleanup-json-mirrors [--root <dir>] [--dry-run]
  npm run scan -- migrate compact-bundle-exports [--root <dir>] [--retention-days <n>] [--dry-run]
  npm run scan -- reconstruct run <run-id> [--root <dir>] [--dry-run]
  npm run scan -- reconstruct runs [--root <dir>] [--target-id <id>] [--status <status>] [--audit-package <id>] [--run-mode <mode>] [--target-class <class>] [--rating <rating>] [--publishability-status <status>] [--policy-pack-id <id>] [--since <iso>] [--until <iso>] [--requires-human-review true|false] [--has-findings true|false] [--limit <n>] [--dry-run]
  npm run scan -- validate-persistence [--root <dir>] [--target-id <id>] [--status <status>] [--audit-package <id>] [--run-mode <mode>] [--target-class <class>] [--rating <rating>] [--publishability-status <status>] [--policy-pack-id <id>] [--since <iso>] [--until <iso>] [--requires-human-review true|false] [--has-findings true|false] [--limit <n>]
npm run scan -- artifacts prune [--root <dir>] [--kind runs|sandboxes|all] [--older-than <days|30d>] [--retention-days <n>] [--max-gb <n>] [--dry-run]
npm run scan -- validate-fixtures [--root <dir>] [--fixture <id>] [--package <id>] [--db-mode local] [--persistence-root <dir>] [--llm-provider openai|mock] [--llm-model <id>]
npm run scan -- review queue [--root <dir>] [--db-mode local] [--status <review-status>] [--limit <n>]
npm run scan -- review status <run-id> [--root <dir>] [--db-mode local]
npm run scan -- review action <run-id> --reviewer <id> --action <type> [--assigned-reviewer <id>] [--finding-id <id>] [--previous-severity <level>] [--updated-severity <level>] [--visibility public|internal] [--notes <text>] [--root <dir>] [--db-mode local]
npm run scan -- review notifications [--reviewer <id>] [--status unread|acknowledged] [--root <dir>] [--db-mode local]
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
  console.log("Confidence limits: static mode does not execute target behavior; skipped tools and not-assessed controls reduce confidence and are not clean passes.");
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

  if (args[0] === "onboard") {
    runOnboarding({
      dryRun: args.includes("--dry-run"),
      skipDoctor: args.includes("--skip-doctor"),
      skipFixtures: args.includes("--skip-fixtures")
    });
    return;
  }

  if (args[0] === "setup-tools") {
    runSetupTools({
      dryRun: args.includes("--dry-run"),
      yes: args.includes("--yes"),
      tools: readFlag(args, "--tool")
    });
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
