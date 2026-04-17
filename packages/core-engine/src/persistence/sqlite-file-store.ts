import fs from "node:fs/promises";
import path from "node:path";

import type { DatabaseMode } from "../contracts.js";
import { resolveBundleExportPolicy } from "./bundle-exports.js";
import type { PersistedAuditBundle, PersistedTargetSummaryRecord, PersistenceStore } from "./contracts.js";
import { ensureSqliteSchema, openSqliteDatabase, readSqliteTable, saveSqliteDatabase, upsertSqliteRecord } from "./sqlite.js";

export class SqliteFilePersistenceStore implements PersistenceStore {
  constructor(
    readonly mode: DatabaseMode,
    protected readonly rootDir: string
  ) {}

  async persistBundle(bundle: PersistedAuditBundle): Promise<{ root: string }> {
    const bundleExportPolicy = resolveBundleExportPolicy(this.mode);
    const db = await openSqliteDatabase(this.rootDir);
    ensureSqliteSchema(db);

    upsertSqliteRecord({ db, tableName: "targets", recordKey: bundle.target.id, payload: bundle.target, targetId: bundle.target.id, createdAt: bundle.target.created_at });
    upsertSqliteRecord({ db, tableName: "target_snapshots", recordKey: bundle.target_snapshot.id, payload: bundle.target_snapshot, targetId: bundle.target_snapshot.target_id, targetSnapshotId: bundle.target_snapshot.id, createdAt: bundle.target_snapshot.captured_at, parentKey: bundle.target_snapshot.target_id });
    const existingTargetSummaries = readSqliteTable<PersistedTargetSummaryRecord>(db, "target_summaries");
    const existingTargetSummary = existingTargetSummaries.find((item) => item.id === bundle.target_summary.id) ?? null;
    if (!existingTargetSummary || existingTargetSummary.latest_run_created_at <= bundle.target_summary.latest_run_created_at) {
      upsertSqliteRecord({ db, tableName: "target_summaries", recordKey: bundle.target_summary.id, payload: bundle.target_summary, targetId: bundle.target_summary.target_id, createdAt: bundle.target_summary.updated_at, parentKey: bundle.target_summary.target_id });
    }
    if (bundle.policy_pack) {
      upsertSqliteRecord({ db, tableName: "policy_packs", recordKey: bundle.policy_pack.id, payload: bundle.policy_pack, createdAt: bundle.policy_pack.created_at });
    }
    upsertSqliteRecord({ db, tableName: "runs", recordKey: bundle.run.id, payload: bundle.run, runId: bundle.run.id, targetId: bundle.run.target_id, targetSnapshotId: bundle.run.target_snapshot_id, createdAt: bundle.run.created_at });
    upsertSqliteRecord({ db, tableName: "resolved_configurations", recordKey: bundle.resolved_configuration.run_id, payload: bundle.resolved_configuration, runId: bundle.resolved_configuration.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id });
    if (bundle.commit_diff) {
      upsertSqliteRecord({ db, tableName: "commit_diffs", recordKey: bundle.commit_diff.run_id, payload: bundle.commit_diff, runId: bundle.commit_diff.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: bundle.run.id });
    }
    if (bundle.correction_plan) {
      upsertSqliteRecord({ db, tableName: "correction_plans", recordKey: bundle.correction_plan.run_id, payload: bundle.correction_plan, runId: bundle.correction_plan.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: bundle.run.id });
    }
    if (bundle.correction_result) {
      upsertSqliteRecord({ db, tableName: "correction_results", recordKey: bundle.correction_result.run_id, payload: bundle.correction_result, runId: bundle.correction_result.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: bundle.run.id });
    }
    for (const row of bundle.lane_reuse_decisions ?? []) {
      upsertSqliteRecord({ db, tableName: "lane_reuse_decisions", recordKey: row.id, payload: row, runId: row.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: bundle.run.id });
    }
    if (bundle.persistence_summary) {
      upsertSqliteRecord({ db, tableName: "persistence_summaries", recordKey: bundle.persistence_summary.run_id, payload: bundle.persistence_summary, runId: bundle.persistence_summary.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: bundle.run.id });
    }
    for (const row of bundle.stage_artifacts ?? []) {
      upsertSqliteRecord({ db, tableName: "stage_artifacts", recordKey: row.id, payload: row, runId: row.run_id, createdAt: row.created_at, targetId: bundle.run.target_id, parentKey: bundle.run.id });
    }
    for (const row of bundle.stage_executions ?? []) {
      upsertSqliteRecord({ db, tableName: "stage_executions", recordKey: row.id, payload: row, runId: row.run_id, createdAt: row.started_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.lane_plans ?? []) {
      upsertSqliteRecord({ db, tableName: "lane_plans", recordKey: row.id, payload: row, runId: row.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.evidence_records ?? []) {
      upsertSqliteRecord({ db, tableName: "evidence_records", recordKey: row.id, payload: row, runId: row.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.lane_results ?? []) {
      upsertSqliteRecord({ db, tableName: "lane_results", recordKey: row.id, payload: row, runId: row.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.lane_specialists ?? []) {
      upsertSqliteRecord({ db, tableName: "lane_specialists", recordKey: row.id, payload: row, runId: row.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.agent_invocations ?? []) {
      upsertSqliteRecord({ db, tableName: "agent_invocations", recordKey: row.id, payload: row, runId: row.run_id, createdAt: row.started_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.tool_executions ?? []) {
      upsertSqliteRecord({ db, tableName: "tool_executions", recordKey: row.id, payload: row, runId: row.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.findings ?? []) {
      upsertSqliteRecord({ db, tableName: "findings", recordKey: row.id, payload: row, runId: row.run_id, createdAt: row.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.control_results ?? []) {
      upsertSqliteRecord({ db, tableName: "control_results", recordKey: row.id, payload: row, runId: row.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    if (bundle.score_summary) {
      const scoreSummaryRunId = bundle.score_summary.run_id ?? bundle.run.id;
      upsertSqliteRecord({ db, tableName: "score_summaries", recordKey: scoreSummaryRunId, payload: bundle.score_summary, runId: scoreSummaryRunId, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: scoreSummaryRunId });
    }
    if (bundle.review_decision) {
      const reviewRunId = bundle.review_decision.run_id ?? bundle.run.id;
      upsertSqliteRecord({ db, tableName: "review_decisions", recordKey: reviewRunId, payload: bundle.review_decision, runId: reviewRunId, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: reviewRunId });
    }
    if (bundle.supervisor_review) {
      const reviewRunId = bundle.supervisor_review.run_id ?? bundle.run.id;
      upsertSqliteRecord({ db, tableName: "supervisor_reviews", recordKey: reviewRunId, payload: bundle.supervisor_review, runId: reviewRunId, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: reviewRunId });
    }
    if (bundle.remediation_memo) {
      const memoRunId = bundle.remediation_memo.run_id ?? bundle.run.id;
      upsertSqliteRecord({ db, tableName: "remediation_memos", recordKey: memoRunId, payload: bundle.remediation_memo, runId: memoRunId, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: memoRunId });
    }
    if (bundle.review_workflow) {
      const workflowRunId = bundle.review_workflow.run_id ?? bundle.run.id;
      upsertSqliteRecord({ db, tableName: "review_workflows", recordKey: workflowRunId, payload: bundle.review_workflow, runId: workflowRunId, createdAt: bundle.review_workflow.opened_at, targetId: bundle.run.target_id, parentKey: workflowRunId });
    }
    for (const row of bundle.review_actions ?? []) {
      upsertSqliteRecord({ db, tableName: "review_actions", recordKey: row.id, payload: row, runId: row.run_id, createdAt: row.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    if (bundle.policy_application) {
      const policyRunId = bundle.policy_application.run_id ?? bundle.run.id;
      upsertSqliteRecord({ db, tableName: "policy_applications", recordKey: policyRunId, payload: bundle.policy_application, runId: policyRunId, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: policyRunId });
    }
    for (const row of bundle.dimension_scores ?? []) {
      upsertSqliteRecord({ db, tableName: "dimension_scores", recordKey: `${row.run_id}:${row.dimension}`, payload: row, runId: row.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.metrics ?? []) {
      upsertSqliteRecord({ db, tableName: "metrics", recordKey: `${row.run_id}:${row.name}:${JSON.stringify(row.tags_json ?? {})}`, payload: row, runId: row.run_id, createdAt: bundle.run.created_at, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.events ?? []) {
      upsertSqliteRecord({ db, tableName: "events", recordKey: row.event_id, payload: row, runId: row.run_id, createdAt: row.timestamp, targetId: bundle.run.target_id, parentKey: row.run_id });
    }
    for (const row of bundle.artifact_index ?? []) {
      upsertSqliteRecord({ db, tableName: "artifact_index", recordKey: row.artifact_id, payload: row, runId: bundle.run.id, createdAt: row.created_at, targetId: bundle.run.target_id, parentKey: bundle.run.id });
    }

    await saveSqliteDatabase(this.rootDir, db, this.mode, bundleExportPolicy);
    db.close();

    if (bundleExportPolicy.enabled) {
      await fs.mkdir(path.join(this.rootDir, "runs"), { recursive: true });
      await fs.writeFile(path.join(this.rootDir, "runs", `${bundle.run.id}.json`), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    }
    return { root: this.rootDir };
  }
}
