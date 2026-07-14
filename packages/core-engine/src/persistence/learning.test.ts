import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { extractLearningEventsFromRecords, generateLearningCandidatesFromEvents } from "./learning.js";
import { SELF_LEARNING_POSTGRES_DDL, SELF_LEARNING_TABLE_DEFINITIONS } from "./schema-manifest.js";
import { ensureSqliteSchema, openSqliteDatabase } from "./sqlite.js";
import type { PersistedLearningEventRecord } from "./contracts.js";

function learningEvent(overrides: Partial<PersistedLearningEventRecord> = {}): PersistedLearningEventRecord {
  return {
    id: "learn_event:run_1:finding_dispositions:disp_1:finding_disposition",
    run_id: "run_1",
    target_id: null,
    workspace_id: "default",
    project_id: "default",
    event_type: "finding_disposition",
    source_table: "finding_dispositions",
    source_id: "disp_1",
    finding_id: null,
    finding_signature: "run-level-signal",
    control_ids_json: [],
    signal_summary: "Active waiver disposition at project scope.",
    confidence: 0.86,
    actor_id: "reviewer",
    evidence_refs_json: [],
    payload_json: null,
    created_at: "2026-06-03T00:00:00.000Z",
    ...overrides
  };
}

test("learning candidates ignore generic run-level disposition signals", () => {
  const candidates = generateLearningCandidatesFromEvents([
    learningEvent(),
    learningEvent({
      id: "learn_event:run_1:finding_dispositions:disp_2:finding_disposition",
      source_id: "disp_2"
    })
  ]);

  assert.equal(candidates.length, 0);
});

test("self-learning persistence manifest covers sqlite metadata and postgres ddl", async () => {
  const learningJobs = SELF_LEARNING_TABLE_DEFINITIONS.find((item) => item.name === "learning_jobs");
  const uiSettings = SELF_LEARNING_TABLE_DEFINITIONS.find((item) => item.name === "ui_settings");
  assert.ok(learningJobs);
  assert.ok(uiSettings);
  assert.equal(learningJobs.fields.some((item) => item.name === "trigger"), true);
  assert.equal(learningJobs.fields.some((item) => item.name === "settings_snapshot_json"), true);
  assert.equal(learningJobs.fields.some((item) => item.name === "candidates_synthesized"), true);
  assert.equal(uiSettings.fields.some((item) => item.name === "learning_json"), true);
  assert.match(SELF_LEARNING_POSTGRES_DDL, /CREATE TABLE IF NOT EXISTS learning_jobs/);
  assert.match(SELF_LEARNING_POSTGRES_DDL, /settings_snapshot_json JSONB NOT NULL/);
  assert.match(SELF_LEARNING_POSTGRES_DDL, /learning_json JSONB NOT NULL/);

  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-learning-schema-"));
  const db = await openSqliteDatabase(rootDir);
  try {
    ensureSqliteSchema(db);
    const rows = db.exec("SELECT fields_json FROM record_schemas WHERE table_name = 'learning_jobs'");
    const fields = JSON.parse(String(rows[0]?.values?.[0]?.[0] ?? "[]"));
    assert.equal(Array.isArray(fields), true);
    assert.equal(fields.some((item: { name?: string }) => item.name === "trigger"), true);
    assert.equal(fields.some((item: { name?: string }) => item.name === "candidates_synthesized"), true);
  } finally {
    db.close();
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test("learning candidates use reviewer-facing copy and compact repeated concrete signals", () => {
  const candidates = generateLearningCandidatesFromEvents([
    learningEvent({
      finding_signature: "repo_posture::repository does not publish a visible security policy",
      signal_summary: "Active suppression disposition at project scope."
    }),
    learningEvent({
      id: "learn_event:run_1:finding_dispositions:disp_2:finding_disposition",
      run_id: "run_2",
      source_id: "disp_2",
      finding_signature: "repo_posture::repository does not publish a visible security policy",
      signal_summary: "Active suppression disposition at project scope."
    })
  ]);

  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.equal(candidate.title, "Review suppression pattern: Repository does not publish a visible security policy");
  assert.match(candidate.summary, /2 signals from active suppression across 2 runs indicate reviewers may be suppressing this pattern for the project/);
  assert.equal(
    candidate.rationale,
    "Observed reviewer decisions: Active suppression disposition at project scope."
  );
  assert.equal((candidate.rationale.match(/support this candidate/g) ?? []).length, 0);
});

test("high-risk learning candidates require recurrence across runs", () => {
  const candidates = generateLearningCandidatesFromEvents([
    learningEvent({
      id: "learn_event:run_2:finding_dispositions:disp_3:finding_disposition",
      run_id: "run_2",
      source_id: "disp_3",
      finding_signature: "dependency_locking::dependency manifests exist without recognized lockfile coverage",
      signal_summary: "Active suppression disposition at run scope."
    })
  ]);

  assert.equal(candidates.length, 0);
});

test("learning candidate copy prefers finding titles over raw signatures", () => {
  const [candidate] = generateLearningCandidatesFromEvents([
    learningEvent({
      id: "learn_event:run_2:finding_dispositions:disp_3:finding_disposition",
      run_id: "run_2",
      source_id: "disp_3",
      finding_signature: "dependency_locking::dependency manifests exist without recognized lockfile coverage",
      signal_summary: "Active suppression disposition at run scope."
    }),
    learningEvent({
      id: "learn_event:run_3:finding_dispositions:disp_4:finding_disposition",
      run_id: "run_3",
      source_id: "disp_4",
      finding_signature: "dependency_locking::dependency manifests exist without recognized lockfile coverage",
      signal_summary: "Active suppression disposition at run scope."
    })
  ]);

  assert.equal(candidate.title, "Review suppression pattern: Dependency manifests exist without recognized lockfile coverage");
  assert.match(candidate.summary, /2 signals from active suppression/);
});

test("waiver dispositions produce accepted-risk copy rather than suppression copy", () => {
  const [candidate] = generateLearningCandidatesFromEvents([
    learningEvent({
      id: "learn_event:run_2:finding_dispositions:disp_3:finding_disposition",
      run_id: "run_2",
      source_id: "disp_3",
      finding_signature: "workflow_permissions::workflow token permissions appear broader than necessary",
      signal_summary: "Active waiver disposition at project scope: accepted risk.",
      payload_json: { disposition_type: "waiver", scope_level: "project", reason: "accepted risk" }
    }),
    learningEvent({
      id: "learn_event:run_3:finding_dispositions:disp_4:finding_disposition",
      run_id: "run_3",
      source_id: "disp_4",
      finding_signature: "workflow_permissions::workflow token permissions appear broader than necessary",
      signal_summary: "Active waiver disposition at project scope: accepted risk.",
      payload_json: { disposition_type: "waiver", scope_level: "project", reason: "accepted risk" }
    })
  ]);

  assert.equal(candidate.candidate_type, "severity_calibration_suggestion");
  assert.equal(candidate.title, "Review accepted-risk pattern: Workflow token permissions appear broader than necessary");
  assert.match(candidate.summary, /2 signals from active accepted-risk waiver across 2 runs/);
  assert.doesNotMatch(candidate.summary, /suppression or waiver|suppressing/);
});

test("project-scope dispositions only produce events when they match a finding in the run", () => {
  const run = {
    id: "run_1",
    workspace_id: "default",
    project_id: "default",
    target_id: "target_1"
  } as any;
  const disposition = {
    id: "disp_1",
    run_id: "source_run",
    workspace_id: "default",
    project_id: "default",
    finding_id: "finding_other",
    finding_signature: "workflow_permissions::workflow token permissions appear broader than necessary",
    disposition_type: "waiver",
    scope_level: "project",
    status: "active",
    reason: "accepted risk",
    notes: null,
    created_by: "reviewer",
    created_at: "2026-06-03T00:00:00.000Z",
    expires_at: null,
    revoked_at: null,
    metadata_json: null
  } as any;

  const unrelatedEvents = extractLearningEventsFromRecords({
    run,
    findings: [{ id: "finding_1", category: "security_policy", title: "Repository does not publish a visible security policy", control_ids_json: [], evidence_json: [] }] as any,
    dispositions: [disposition]
  });
  assert.equal(unrelatedEvents.length, 0);

  const matchingEvents = extractLearningEventsFromRecords({
    run,
    findings: [{ id: "finding_2", category: "workflow_permissions", title: "Workflow token permissions appear broader than necessary", control_ids_json: [], evidence_json: [] }] as any,
    dispositions: [disposition]
  });
  assert.equal(matchingEvents.length, 1);
  assert.equal(matchingEvents[0].finding_signature, "workflow_permissions::workflow token permissions appear broader than necessary");
});

test("learning candidates keep validation and suppression signals in separate candidate kinds", () => {
  const signature = "security_policy::repository does not publish a visible security policy";
  const candidates = generateLearningCandidatesFromEvents([
    learningEvent({
      id: "learn_event:run_1:review_actions:action_1:review_needs_validation",
      run_id: "run_1",
      event_type: "review_needs_validation",
      source_table: "review_actions",
      source_id: "action_1",
      finding_id: "finding_1",
      finding_signature: signature,
      signal_summary: "request_validation recorded needs_validation for Repository does not publish a visible security policy."
    }),
    learningEvent({
      id: "learn_event:run_2:review_actions:action_2:review_needs_validation",
      run_id: "run_2",
      event_type: "review_needs_validation",
      source_table: "review_actions",
      source_id: "action_2",
      finding_id: "finding_2",
      finding_signature: signature,
      signal_summary: "rerun_in_capable_env recorded needs_validation for Repository does not publish a visible security policy."
    }),
    learningEvent({
      id: "learn_event:run_1:finding_dispositions:disp_1:finding_disposition",
      run_id: "run_1",
      source_id: "disp_1",
      finding_id: "finding_1",
      finding_signature: signature,
      signal_summary: "Active suppression disposition at run scope."
    })
  ]);

  assert.deepEqual(candidates.map((candidate) => candidate.candidate_type), ["evidence_requirement_adjustment"]);
  assert.equal(candidates[0].title, "Review evidence requirements: Repository does not publish a visible security policy");
});
