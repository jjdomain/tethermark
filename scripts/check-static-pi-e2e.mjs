import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distApiServer = path.join(repoRoot, "dist", "apps", "api-server", "src", "index.js");

const piRepoUrl = "https://github.com/earendil-works/pi.git";
const piCommit = "3d9e14d7482f4a99d5224926099bec0d17ff86fd";
const timeoutMs = Number(process.env.TETHERMARK_STATIC_PI_E2E_TIMEOUT_MS ?? 10 * 60 * 1000);
const pollIntervalMs = 1000;
const projectId = process.env.TETHERMARK_STATIC_PI_E2E_PROJECT ?? "default";

function log(message) {
  console.log(`[tethermark:static-pi-e2e] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertOk(value, message, detail) {
  if (!value) {
    const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
}

function assertArray(value, message) {
  assertOk(Array.isArray(value), message, value);
  return value;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

async function stageBuiltinCoreEngineData(workRoot) {
  for (const folder of ["policy-packs", "audit-packages"]) {
    await copyDirectory(
      path.join(repoRoot, "packages", "core-engine", folder),
      path.join(workRoot, "packages", "core-engine", folder)
    );
  }
  await copyDirectory(
    path.join(repoRoot, "node_modules", "sql.js", "dist"),
    path.join(workRoot, "node_modules", "sql.js", "dist")
  );
}

function getListeningPort(server) {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("API server did not expose a numeric listening port.");
  }
  return address.port;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function buildPiRequest(kind) {
  const diagnostic = kind
    ? {
        kind,
        label: kind === "plumbing" ? "Plumbing smoke" : "Static audit smoke",
        target: "pi",
        pinned_reference: piCommit,
        audit_quality_claim: kind === "plumbing" ? "none" : "static_audit"
      }
    : null;

  return {
    repo_url: piRepoUrl,
    run_mode: "static",
    audit_package: "agentic-static",
    llm_provider: "mock",
    hints: {
      requested_run_mode_selection: "static",
      repo_checkout_ref: piCommit,
      ...(diagnostic ? { diagnostic_run: diagnostic } : {}),
      preflight: {
        strictness: "standard",
        runtime_allowed: "never",
        static_tool_gate_policy: "warn"
      },
      external_audit_tools: {
        included_tool_ids: ["scorecard", "semgrep", "trivy"]
      },
      review: {
        require_human_review_for_severity: "medium",
        default_visibility: "internal"
      }
    }
  };
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const compact = { ...payload };
  for (const key of ["report_markdown", "report_sarif", "report_executive", "export_schema"]) {
    if (key in compact) compact[key] = `[${key}]`;
  }
  return compact;
}

async function main() {
  if (!(await pathExists(distApiServer))) {
    throw new Error(`Built API server not found at ${distApiServer}. Run npm run build first.`);
  }

  const originalCwd = process.cwd();
  const originalEnv = {
    HARNESS_LOCAL_DB_ROOT: process.env.HARNESS_LOCAL_DB_ROOT,
    HARNESS_API_AUTH_MODE: process.env.HARNESS_API_AUTH_MODE,
    HARNESS_API_KEY: process.env.HARNESS_API_KEY,
    AUDIT_LLM_PROVIDER: process.env.AUDIT_LLM_PROVIDER,
    PORT: process.env.PORT
  };
  const configuredWorkRoot = process.env.TETHERMARK_STATIC_PI_E2E_WORK_ROOT
    ? path.resolve(process.env.TETHERMARK_STATIC_PI_E2E_WORK_ROOT)
    : null;
  const workRoot = configuredWorkRoot ?? await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-static-pi-e2e-"));
  const localDbRoot = path.join(workRoot, "local-db");
  let server = null;

  try {
    await stageBuiltinCoreEngineData(workRoot);
    process.chdir(workRoot);
    process.env.HARNESS_LOCAL_DB_ROOT = localDbRoot;
    process.env.HARNESS_API_AUTH_MODE = "none";
    process.env.AUDIT_LLM_PROVIDER = "mock";
    process.env.PORT = "0";

    const { createApiServer } = await import(pathToFileURL(distApiServer).href);
    server = createApiServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${getListeningPort(server)}`;

    async function api(method, route, body, expectedStatus = 200, actor = "pi-e2e-operator") {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-harness-actor": actor,
          "x-harness-project": projectId
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }
      if (response.status !== expectedStatus) {
        throw new Error(`${method} ${route} expected ${expectedStatus} but received ${response.status}\n${JSON.stringify(summarizePayload(payload), null, 2)}`);
      }
      return payload;
    }

    async function waitForAsyncJob(jobId) {
      const deadline = Date.now() + timeoutMs;
      let lastPayload = null;
      let lastError = null;
      while (Date.now() < deadline) {
        try {
          lastPayload = await api("GET", `/runs/async/${encodeURIComponent(jobId)}`);
          lastError = null;
          const status = lastPayload?.job?.status;
          if (["succeeded", "failed", "canceled"].includes(status)) {
            assert.equal(status, "succeeded", `Async job ${jobId} did not succeed: ${JSON.stringify(summarizePayload(lastPayload), null, 2)}`);
            return lastPayload;
          }
        } catch (error) {
          lastError = error;
        }
        await sleep(pollIntervalMs);
      }
      throw new Error(`Timed out waiting for async job ${jobId}\nlastError=${lastError instanceof Error ? lastError.message : String(lastError)}\n${JSON.stringify(summarizePayload(lastPayload), null, 2)}`);
    }

    async function launchAsyncDiagnostic(kind) {
      log(`launching ${kind} diagnostic`);
      const launched = await api("POST", "/runs/async", {
        request: buildPiRequest(kind),
        start_immediately: true
      }, 202);
      const jobId = launched?.job?.job_id;
      assertOk(typeof jobId === "string" && jobId, `${kind} diagnostic did not return a job id`, launched);
      const finalJob = await waitForAsyncJob(jobId);
      assert.equal(finalJob.job.request_json?.run_mode, "static");
      assert.equal(finalJob.job.request_json?.repo_url, piRepoUrl);
      assert.equal(finalJob.job.request_json?.hints?.diagnostic_run?.target, "pi");
      assert.equal(finalJob.job.request_json?.hints?.diagnostic_run?.pinned_reference, piCommit);
      const runId = finalJob.attempts?.find((attempt) => attempt.run_id)?.run_id;
      assertOk(typeof runId === "string" && runId, `${kind} diagnostic did not persist a run id`, finalJob);
      const run = await api("GET", `/runs/${encodeURIComponent(runId)}`);
      assert.equal(run.run.status, "succeeded");
      assert.equal(run.run.run_mode, "static");
      return { jobId, runId };
    }

    function assertToolReadiness(payload) {
      const tools = assertArray(payload?.static_tools?.tools, "/static-tools did not return tools");
      for (const id of ["scorecard", "semgrep", "trivy", "inspect", "garak", "pyrit"]) {
        const tool = tools.find((item) => item.id === id);
        assertOk(tool, `Missing static tool readiness entry for ${id}`, payload);
        assertOk(["available", "missing", "blocked"].includes(tool.status), `Unexpected readiness status for ${id}`, tool);
      }
      const selectedStaticTools = tools.filter((item) => ["scorecard", "semgrep", "trivy"].includes(item.id));
      for (const tool of selectedStaticTools) {
        if (!tool.installed) {
          assertOk(payload.static_tools.warnings.some((warning) => warning.includes(tool.label)), `Missing warning for unavailable ${tool.id}`, payload.static_tools);
        }
      }
    }

    function assertStaticOnlySandbox(resultOrPayload) {
      const sandbox = resultOrPayload?.sandbox ?? resultOrPayload?.sandbox_execution?.sandbox ?? resultOrPayload?.sandbox_execution ?? null;
      assertOk(sandbox, "Sandbox details were not returned", resultOrPayload);
      assert.equal(sandbox.run_mode, "static");
      assert.equal(sandbox.source_provenance?.commit_sha, piCommit);
      assert.equal(sandbox.command_policy?.allow_install_commands, false);
      assert.equal(sandbox.command_policy?.allow_target_execution, false);
      assert.equal(sandbox.command_policy?.allow_network_egress, false);
      const blocked = Array.isArray(sandbox.command_policy?.blocked_command_patterns) ? sandbox.command_policy.blocked_command_patterns.join(" ") : "";
      assert.match(blocked, /npm install/i);
      assert.match(blocked, /docker run/i);
    }

    function assertStaticEvidence(result) {
      const evidenceExecutions = assertArray(result.evidence_executions, "Direct run did not return evidence executions");
      assertOk(result.target_profile?.semantic_review?.final_class, "Internal repo analysis did not produce target classification", result.target_profile);
      assertOk(
        result.target_profile?.heuristic?.evidence?.length || result.target_profile?.semantic_review?.evidence?.length,
        "Internal repo analysis did not produce agentic evidence signals",
        result.target_profile
      );
      for (const id of ["scorecard", "semgrep", "trivy"]) {
        const records = evidenceExecutions.filter((item) => item.provider_id === id || item.tool === id || item.adapter?.requested_provider_id === id);
        assertOk(records.length > 0, `No explicit evidence record found for ${id}`, evidenceExecutions.map((item) => ({ provider_id: item.provider_id, tool: item.tool, status: item.status, failure_category: item.failure_category })));
        for (const record of records) {
          assertOk(["completed", "skipped", "failed"].includes(record.status), `Unexpected ${id} evidence status`, record);
          if (record.status !== "completed") {
            assertOk(record.failure_category || record.capability_status || record.summary, `${id} gap record lacks reason`, record);
          }
        }
      }
      const controls = assertArray(result.control_results, "Direct run did not return control results");
      assertOk(controls.some((item) => item.applicability === "applicable"), "No applicable controls were returned", controls);
      assertOk(controls.some((item) => item.status === "not_assessed" || item.assessability === "not_assessed" || item.status === "passed" || item.status === "failed"), "Control results lack assessment states", controls);
    }

    function assertNonempty(value, message, detail) {
      if (Array.isArray(value)) {
        assertOk(value.length > 0, message, detail ?? value);
      } else if (typeof value === "string") {
        assertOk(value.trim().length > 0, message, detail ?? value);
      } else {
        assertOk(value && typeof value === "object" && Object.keys(value).length > 0, message, detail ?? value);
      }
    }

    log("checking health and static tool diagnostics");
    const health = await api("GET", "/health");
    assert.equal(health.status, "ok");
    const staticTools = await api("GET", "/static-tools");
    assertToolReadiness(staticTools);

    await launchAsyncDiagnostic("plumbing");
    await launchAsyncDiagnostic("static_audit");

    log("creating direct individual Pi static audit run");
    const directResult = await api("POST", "/runs", buildPiRequest(null));
    const runId = directResult?.run_id;
    assertOk(typeof runId === "string" && runId, "Direct run did not return run_id", directResult);
    assert.equal(directResult.target?.snapshot?.commit_sha, piCommit);
    assert.equal(directResult.target?.snapshot?.value, `${piRepoUrl}#${piCommit}`);
    assert.equal(directResult.audit_package, "agentic-static");
    assertOk(directResult.run_plan?.selected_profile, "Direct run did not return a selected run profile", directResult.run_plan);
    assertOk(directResult.target_profile?.semantic_review?.final_class, "Direct run missing semantic target classification", directResult.target_profile);
    assertOk(Number(directResult.target_profile?.semantic_review?.confidence ?? 0) > 0, "Direct run target classification confidence was not positive", directResult.target_profile);
    assertArray(directResult.findings, "Direct run did not return findings");
    assertNonempty(directResult.score_summary, "Direct run did not return a score summary", directResult);
    assertNonempty(directResult.artifacts, "Direct run did not return artifacts", directResult);
    assertStaticOnlySandbox(directResult);
    assertStaticEvidence(directResult);

    log(`verifying persisted run detail endpoints for ${runId}`);
    const runList = await api("GET", "/runs?run_mode=static&audit_package=agentic-static");
    assertOk(assertArray(runList.runs, "Run list missing runs").some((item) => item.id === runId), "Direct Pi run is missing from /runs", runList);

    const runEnvelope = await api("GET", `/runs/${encodeURIComponent(runId)}`);
    assert.equal(runEnvelope.run.id, runId);
    const summary = await api("GET", `/runs/${encodeURIComponent(runId)}/summary`);
    assert.equal(summary.summary.run_id, runId);
    const evidenceRecords = await api("GET", `/runs/${encodeURIComponent(runId)}/evidence-records`);
    assertNonempty(evidenceRecords.evidence_records, "Persisted evidence records were empty", evidenceRecords);
    const toolExecutions = await api("GET", `/runs/${encodeURIComponent(runId)}/tool-executions`);
    assertNonempty(toolExecutions.tool_executions, "Persisted tool executions were empty", toolExecutions);
    const controlResults = await api("GET", `/runs/${encodeURIComponent(runId)}/control-results`);
    assertNonempty(controlResults.control_results, "Persisted control results were empty", controlResults);
    const scoreSummary = await api("GET", `/runs/${encodeURIComponent(runId)}/score-summary`);
    assertNonempty(scoreSummary.score_summary, "Persisted score summary was empty", scoreSummary);
    const artifactIndex = await api("GET", `/runs/${encodeURIComponent(runId)}/artifact-index`);
    assertNonempty(artifactIndex.artifact_index, "Persisted artifact index was empty", artifactIndex);
    const reviewWorkflow = await api("GET", `/runs/${encodeURIComponent(runId)}/review-workflow`);
    assertNonempty(reviewWorkflow.review_workflow, "Persisted review workflow was empty", reviewWorkflow);
    const remediation = await api("GET", `/runs/${encodeURIComponent(runId)}/remediation`);
    assertNonempty(remediation.remediation_memo, "Persisted remediation memo was empty", remediation);
    assertNonempty(remediation.remediation_memo.checklist_json, "Persisted remediation checklist was empty", remediation);
    const sandboxExecution = await api("GET", `/runs/${encodeURIComponent(runId)}/sandbox-execution`);
    assert.equal(sandboxExecution.run_id, runId);

    log("verifying reports and export endpoints");
    const markdownReport = await api("GET", `/runs/${encodeURIComponent(runId)}/report-markdown`);
    assertNonempty(markdownReport.report_markdown, "Markdown report was empty", markdownReport);
    const sarifReport = await api("GET", `/runs/${encodeURIComponent(runId)}/report-sarif`);
    assertNonempty(sarifReport.report_sarif, "SARIF report was empty", sarifReport);
    const executiveReport = await api("GET", `/runs/${encodeURIComponent(runId)}/report-executive?format=json`);
    assertNonempty(executiveReport.export_schema, "Executive report schema envelope was empty", executiveReport);
    const findingEvaluations = await api("GET", `/runs/${encodeURIComponent(runId)}/finding-evaluations`);
    assertNonempty(findingEvaluations.export_schema, "Finding evaluations schema envelope was empty", findingEvaluations);

    const findingsPayload = await api("GET", `/runs/${encodeURIComponent(runId)}/findings`);
    const findings = assertArray(findingsPayload.findings, "Persisted findings endpoint did not return findings");
    assertOk(findings.length > 0, "Pi E2E review flow requires at least one finding, but the run produced none.", findingsPayload);
    const finding = findings[0];
    assertOk(finding.id, "First persisted finding did not include an id", finding);

    log(`simulating human review for finding ${finding.id}`);
    const reviewActionBodies = [
      {
        action_type: "assign_reviewer",
        assigned_reviewer_id: "pi-e2e-reviewer",
        notes: "Assigning Pi static smoke finding for E2E review."
      },
      {
        action_type: "start_review",
        finding_id: finding.id,
        notes: "Starting human review simulation for the Pi static run."
      },
      {
        action_type: "downgrade_severity",
        finding_id: finding.id,
        previous_severity: finding.severity ?? "medium",
        updated_severity: "low",
        triage_decision: "needs_validation",
        review_priority: "p2",
        validation_intent: "runtime_validation",
        notes: "Static evidence is useful but needs validation before publication."
      },
      {
        action_type: "rerun_in_capable_env",
        finding_id: finding.id,
        triage_decision: "needs_validation",
        review_priority: "p2",
        validation_intent: "rerun_required",
        notes: "Request capable-environment rerun follow-up from static evidence."
      },
      {
        action_type: "approve_run",
        notes: "Approving run after triage and disposition workflow completed."
      }
    ];

    const submittedActions = [];
    for (const body of reviewActionBodies) {
      const response = await api("POST", `/runs/${encodeURIComponent(runId)}/review-actions`, body, 200, body.action_type === "assign_reviewer" ? "pi-e2e-lead" : "pi-e2e-reviewer");
      submittedActions.push(response.action);
      if (body.action_type === "assign_reviewer") {
        assert.equal(response.workflow.current_reviewer_id, "pi-e2e-reviewer");
      }
      if (body.action_type === "start_review") {
        assert.equal(response.workflow.status, "in_review");
      }
      if (body.action_type === "rerun_in_capable_env") {
        assert.equal(response.workflow.status, "requires_rerun");
        assertOk(response.runtime_followup, "rerun_in_capable_env did not create a runtime follow-up", response);
      }
      if (body.action_type === "approve_run") {
        assert.equal(response.workflow.status, "approved");
      }
    }

    const persistedActions = await api("GET", `/runs/${encodeURIComponent(runId)}/review-actions`);
    const actionTypes = assertArray(persistedActions.review_actions, "Review actions endpoint did not return actions").map((item) => item.action_type);
    for (const actionType of ["assign_reviewer", "start_review", "downgrade_severity", "rerun_in_capable_env", "approve_run"]) {
      assertOk(actionTypes.includes(actionType), `Review action ${actionType} was not persisted`, persistedActions);
    }
    assertOk(persistedActions.review_actions.some((item) => item.reviewer_id === "pi-e2e-reviewer"), "Reviewer identity was not preserved", persistedActions);

    log("creating, updating, and revoking finding disposition");
    const dispositionCreated = await api("POST", `/runs/${encodeURIComponent(runId)}/finding-dispositions`, {
      disposition_type: "suppression",
      scope_level: "run",
      finding_id: finding.id,
      reason: "E2E triage suppresses this finding to verify disposition workflow behavior.",
      notes: "Initial suppression created by static Pi E2E.",
      triage_decision: "false_positive",
      review_priority: "p3",
      validation_intent: "manual_review",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }, 201, "pi-e2e-reviewer");
    const dispositionId = dispositionCreated.finding_disposition?.id;
    assertOk(dispositionId, "Disposition create response did not include an id", dispositionCreated);
    assertOk(dispositionCreated.resolved_finding_dispositions.some((item) => item.finding_id === finding.id && item.effective_status === "active"), "Created disposition was not active", dispositionCreated);

    const dispositionUpdated = await api("PATCH", `/runs/${encodeURIComponent(runId)}/finding-dispositions/${encodeURIComponent(dispositionId)}`, {
      reason: "E2E triage updated suppression after secondary reviewer check.",
      notes: "Updated suppression notes from E2E.",
      triage_decision: "out_of_scope",
      review_priority: "p2",
      validation_intent: "manual_review"
    }, 200, "pi-e2e-reviewer");
    assert.equal(dispositionUpdated.finding_disposition.reason, "E2E triage updated suppression after secondary reviewer check.");
    assert.equal(dispositionUpdated.finding_disposition.metadata_json.review_priority, "p2");

    const dispositionRevoked = await api("POST", `/runs/${encodeURIComponent(runId)}/finding-dispositions/${encodeURIComponent(dispositionId)}/revoke`, {
      notes: "Revoking suppression to verify reopen behavior."
    }, 200, "pi-e2e-reviewer");
    assert.equal(dispositionRevoked.finding_disposition.status, "revoked");
    assertOk(dispositionRevoked.resolved_finding_dispositions.some((item) => item.finding_id === finding.id && item.effective_status === "revoked"), "Revoked disposition was not reflected in resolved dispositions", dispositionRevoked);

    log("adding review comment and verifying review audit trail");
    const comment = await api("POST", `/runs/${encodeURIComponent(runId)}/review-comments`, {
      finding_id: finding.id,
      body: "E2E reviewer comment: remediation should document static evidence limits and validation follow-up."
    }, 200, "pi-e2e-reviewer");
    assert.equal(comment.review_comment.finding_id, finding.id);

    const reviewSummary = await api("GET", `/runs/${encodeURIComponent(runId)}/review-summary`);
    assert.equal(reviewSummary.review_summary.workflow.status, "approved");
    assertOk(reviewSummary.review_summary.finding_summaries.some((item) => item.finding_id === finding.id), "Review summary did not include the reviewed finding", reviewSummary);
    assertOk(reviewSummary.review_summary.recent_comments.some((item) => item.finding_id === finding.id), "Review summary did not include the review comment", reviewSummary);
    assertOk(reviewSummary.review_summary.handoff.latest_notes.length > 0, "Review summary did not include latest review notes", reviewSummary);

    const runtimeFollowups = await api("GET", `/runs/${encodeURIComponent(runId)}/runtime-followups`);
    assertOk(assertArray(runtimeFollowups.runtime_followups, "Runtime followups endpoint missing list").some((item) => item.finding_id === finding.id), "Review validation action did not persist runtime follow-up", runtimeFollowups);

    log("opening and resolving local remediation item");
    const remediationItem = await api("POST", `/runs/${encodeURIComponent(runId)}/remediation-items`, {
      finding_id: finding.id,
      owner_id: "pi-e2e-owner",
      priority: "p1",
      summary: "Track remediation for confirmed Pi finding.",
      external_issue_url: "https://github.com/example/repo/issues/123"
    }, 201, "pi-e2e-reviewer");
    assert.equal(remediationItem.remediation_item.status, "open");
    assert.equal(remediationItem.review_action.action_type, "open_remediation");

    const remediationResolved = await api("PATCH", `/runs/${encodeURIComponent(runId)}/remediation-items/${encodeURIComponent(remediationItem.remediation_item.id)}`, {
      status: "resolved",
      fix_commit_sha: "abc123def456",
      validation_run_id: "run_validation_e2e",
      resolution_notes: "Validation run no longer reproduces the finding."
    }, 200, "pi-e2e-reviewer");
    assert.equal(remediationResolved.remediation_item.status, "resolved");
    assert.equal(remediationResolved.review_action.action_type, "resolve_finding");

    const remediationItems = await api("GET", `/runs/${encodeURIComponent(runId)}/remediation-items`);
    assertOk(assertArray(remediationItems.remediation_items, "Remediation items endpoint missing list").some((item) => item.finding_id === finding.id && item.status === "resolved"), "Resolved remediation item was not persisted", remediationItems);

    const reviewAudit = await api("GET", `/runs/${encodeURIComponent(runId)}/review-audit`, undefined, 200, "pi-e2e-reviewer");
    assertNonempty(reviewAudit.export_schema, "Review audit schema envelope was empty", reviewAudit);
    assertOk(reviewAudit.review_audit.actions.length >= submittedActions.length, "Review audit did not include submitted actions", reviewAudit);
    assertOk(reviewAudit.review_audit.comments.some((item) => item.finding_id === finding.id), "Review audit did not include review comment", reviewAudit);
    assertOk(reviewAudit.review_audit.finding_dispositions.some((item) => item.id === dispositionId && item.status === "revoked"), "Review audit did not include revoked disposition", reviewAudit);

    log(`passed. Direct run: ${runId}. Work root: ${workRoot}`);
  } finally {
    if (server) {
      await closeServer(server).catch(() => undefined);
    }
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (!configuredWorkRoot && process.env.TETHERMARK_STATIC_PI_E2E_KEEP_TEMP !== "1") {
      await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error("[tethermark:static-pi-e2e] failed", error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
