import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distApiServer = path.join(repoRoot, "dist", "apps", "api-server", "src", "index.js");
const distWebUiServer = path.join(repoRoot, "dist", "apps", "web-ui", "src", "index.js");
const piRepoUrl = "https://github.com/earendil-works/pi.git";
const piCommit = "3d9e14d7482f4a99d5224926099bec0d17ff86fd";
const timeoutMs = Number(process.env.TETHERMARK_STATIC_PI_UI_E2E_TIMEOUT_MS ?? 10 * 60 * 1000);

function log(message) {
  console.log(`[tethermark:static-pi-ui-e2e] ${message}`);
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
  await copyDirectory(
    path.join(repoRoot, "apps", "web-ui", "static"),
    path.join(workRoot, "apps", "web-ui", "static")
  );
  await copyDirectory(
    path.join(repoRoot, "benchmarks", "suites"),
    path.join(workRoot, "benchmarks", "suites")
  );
}

function getListeningPort(server) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("API server did not expose a numeric listening port.");
  return address.port;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function buildPiRequest() {
  return {
    repo_url: piRepoUrl,
    run_mode: "static",
    audit_package: "agentic-static",
    llm_provider: "mock",
    hints: {
      requested_run_mode_selection: "static",
      repo_checkout_ref: piCommit,
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

async function main() {
  if (!(await pathExists(distApiServer))) {
    throw new Error(`Built API server not found at ${distApiServer}. Run npm run build first.`);
  }
  if (!(await pathExists(distWebUiServer))) {
    throw new Error(`Built web UI server not found at ${distWebUiServer}. Run npm run build first.`);
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    throw new Error(`Playwright is required for the static Pi UI E2E. Run npm install first. ${error instanceof Error ? error.message : String(error)}`);
  }

  const originalCwd = process.cwd();
  const originalEnv = {
    HARNESS_LOCAL_DB_ROOT: process.env.HARNESS_LOCAL_DB_ROOT,
    HARNESS_API_AUTH_MODE: process.env.HARNESS_API_AUTH_MODE,
    HARNESS_ENABLE_ASSISTANT: process.env.HARNESS_ENABLE_ASSISTANT,
    AUDIT_LLM_PROVIDER: process.env.AUDIT_LLM_PROVIDER,
    PORT: process.env.PORT
  };
  const configuredWorkRoot = process.env.TETHERMARK_STATIC_PI_UI_E2E_WORK_ROOT
    ? path.resolve(process.env.TETHERMARK_STATIC_PI_UI_E2E_WORK_ROOT)
    : null;
  const workRoot = configuredWorkRoot ?? await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-static-pi-ui-e2e-"));
  let server = null;
  let webServer = null;
  let browser = null;

  try {
    await stageBuiltinCoreEngineData(workRoot);
    process.chdir(workRoot);
    process.env.HARNESS_LOCAL_DB_ROOT = path.join(workRoot, "local-db");
    process.env.HARNESS_API_AUTH_MODE = "none";
    process.env.HARNESS_ENABLE_ASSISTANT = "1";
    process.env.AUDIT_LLM_PROVIDER = "mock";
    process.env.PORT = "0";

    const { createApiServer } = await import(pathToFileURL(distApiServer).href);
    const { createWebUiServer } = await import(pathToFileURL(distWebUiServer).href);
    server = createApiServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${getListeningPort(server)}`;
    webServer = createWebUiServer({ apiBaseUrl: baseUrl });
    await new Promise((resolve) => webServer.listen(0, "127.0.0.1", resolve));
    const webUrl = `http://127.0.0.1:${getListeningPort(webServer)}`;

    async function api(method, route, body, expectedStatus = 200) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-harness-actor": "pi-ui-e2e-reviewer",
          "x-harness-project": "default"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      if (response.status !== expectedStatus) {
        throw new Error(`${method} ${route} expected ${expectedStatus} but received ${response.status}\n${JSON.stringify(payload, null, 2)}`);
      }
      return payload;
    }

    await api("PUT", "/ui/settings", {
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
    });

    log("creating direct Pi static audit run for UI workflow");
    const directResult = await api("POST", "/runs", buildPiRequest());
    const runId = directResult?.run_id;
    assert.ok(runId, "Direct run did not return a run_id.");
    assert.equal(directResult.target?.snapshot?.commit_sha, piCommit);
    const findingsPayload = await api("GET", `/runs/${encodeURIComponent(runId)}/findings`);
    const finding = findingsPayload.findings?.[0];
    assert.ok(finding?.id, "UI E2E requires a persisted finding.");
    const assistantContextKey = `default:default:run:${runId}:${finding.id}`;
    await api("POST", "/assistant/sessions", {
      scope_type: "run",
      scope_id: runId,
      context_key: assistantContextKey,
      title: "UI E2E seeded assistant chat"
    }, 201);

    browser = await chromium.launch({ headless: process.env.TETHERMARK_STATIC_PI_UI_HEADLESS !== "0" });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
      ignoreHTTPSErrors: true
    });
    const pageMessages = [];
    page.on("console", (message) => pageMessages.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => pageMessages.push(`pageerror: ${error.message}`));
    page.setDefaultTimeout(Number(process.env.TETHERMARK_STATIC_PI_UI_ACTION_TIMEOUT_MS ?? 60_000));

    log("opening web UI and selecting the Pi run");
    await page.goto(webUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await clickOrExplain(page, page.getByRole("button", { name: "Audits" }).first(), "Audits navigation", pageMessages);
    await clickOrExplain(page, page.getByText(runId).first(), `run ${runId}`, pageMessages);
    await page.locator('main button[aria-label="Hide run queue"]').click();
    assert.equal(await page.locator('main button[aria-label="Show run queue"]').isVisible(), true);
    assert.equal(await page.getByPlaceholder("Search runs").isVisible().catch(() => false), false);
    await page.locator('main button[aria-label="Show run queue"]').click();
    assert.equal(await page.getByPlaceholder("Search runs").isVisible(), true);
    await page.getByTestId("run-detail-tab-review").click();
    await page.getByTestId("review-assignee-input").fill("pi-ui-e2e-reviewer");
    await page.getByTestId("assign-reviewer-button").click();
    await expectApiAction(api, runId, "assign_reviewer");
    await waitForUiSettled(page);

    await page.getByTestId("start-review-button").click();
    await expectApiAction(api, runId, "start_review");
    await waitForUiSettled(page);

    log("triaging first finding through the browser");
    await page.getByTestId("run-detail-tab-findings").click();
    await page.getByTestId("finding-list-item").first().click();
    await page.getByTestId("finding-detail-tab-governance").click();
    await page.getByTestId("triage-decision-select").selectOption("needs_validation");
    await page.getByTestId("triage-severity-select").selectOption("low");
    await page.getByTestId("triage-priority-select").selectOption("p2");
    await page.getByTestId("triage-validation-intent-select").selectOption("rerun_required");
    await page.getByTestId("triage-notes-input").fill("UI E2E reviewer downgraded severity pending capable-env validation.");
    await page.getByTestId("save-triage-decision-button").click();
    await expectApiAction(api, runId, "request_validation");
    await waitForUiSettled(page);

    await page.getByTestId("run-detail-tab-findings").click();
    await page.getByTestId("finding-detail-tab-governance").click();
    await page.getByTestId("triage-decision-select").selectOption("needs_validation");
    await page.getByTestId("triage-validation-intent-select").selectOption("rerun_required");
    await page.getByTestId("rerun-capable-env-button").click();
    await expectApiAction(api, runId, "rerun_in_capable_env");
    await waitForUiSettled(page);

    log("tracking remediation through the browser");
    await page.getByTestId("run-detail-tab-findings").click();
    await page.getByTestId("finding-detail-tab-remediation").click();
    await page.getByTestId("remediation-owner-input").fill("pi-ui-e2e-owner");
    await page.getByTestId("remediation-issue-url-input").fill("https://github.com/example/repo/issues/123");
    await page.getByTestId("remediation-open-button").click();
    await expectApiAction(api, runId, "open_remediation");
    await waitForUiSettled(page);
    await page.getByTestId("finding-detail-tab-remediation").click();
    await page.getByTestId("remediation-start-fix-button").click();
    await expectApiAction(api, runId, "mark_fix_in_progress");
    await waitForUiSettled(page);
    await page.getByTestId("finding-detail-tab-remediation").click();
    await page.getByTestId("remediation-commit-input").fill("abc123def456");
    await page.getByTestId("remediation-validation-run-input").fill("run_validation_ui_e2e");
    await page.getByTestId("remediation-resolve-button").click();
    await expectApiAction(api, runId, "resolve_finding");
    await waitForUiSettled(page);

    log("verifying assistant drawer chat history workflow");
    await page.getByTestId("run-detail-assistant-toggle").click();
    await page.getByTestId("assistant-context-label").waitFor({ state: "visible" });
    assert.match(await page.getByTestId("assistant-context-label").innerText(), /Run:|finding:/);
    await page.getByTestId("assistant-history-toggle").click();
    await pollUntil(async () => {
      const text = await page.getByTestId("assistant-history").innerText();
      return /Conversations|Recent chats/i.test(text) && /UI E2E seeded assistant chat/i.test(text);
    }, "assistant recent chat entry");
    await page.getByTestId("assistant-new-chat-button").click();
    assert.equal(await page.getByTestId("assistant-history").getByText("UI E2E seeded assistant chat").first().isVisible(), true);
    await page.getByTestId("run-detail-assistant-toggle").click();

    log("posting review comment and approving run through the browser");
    await page.getByTestId("run-detail-tab-review").click();
    await page.getByTestId("review-comment-input").first().fill("UI E2E comment: remediation should call out static evidence limits and validation follow-up.");
    await page.getByTestId("post-review-comment-button").first().click();
    await expectReviewComment(api, runId, "UI E2E comment");
    await waitForUiSettled(page);

    await page.getByTestId("approve-run-button").click();
    await expectWorkflowStatus(api, runId, "approved");
    await waitForUiSettled(page);

    log("verifying persisted UI-driven review trail");
    const actions = await api("GET", `/runs/${encodeURIComponent(runId)}/review-actions`);
    const actionTypes = actions.review_actions.map((item) => item.action_type);
    for (const actionType of ["assign_reviewer", "start_review", "request_validation", "rerun_in_capable_env", "open_remediation", "mark_fix_in_progress", "resolve_finding", "approve_run"]) {
      assert.ok(actionTypes.includes(actionType), `Missing UI-submitted review action ${actionType}.`);
    }
    assert.ok(actions.review_actions.some((item) => item.finding_id === finding.id && item.updated_severity === "low"), "UI severity triage was not persisted.");
    const followups = await api("GET", `/runs/${encodeURIComponent(runId)}/runtime-followups`);
    assert.ok(followups.runtime_followups.some((item) => item.finding_id === finding.id), "UI capable-env rerun follow-up was not persisted.");
    const remediation = await api("GET", `/runs/${encodeURIComponent(runId)}/remediation`);
    assert.ok(remediation.remediation_memo?.checklist_json?.length, "UI run remediation memo/checklist is missing.");
    const remediationItems = await api("GET", `/runs/${encodeURIComponent(runId)}/remediation-items`);
    assert.ok(remediationItems.remediation_items.some((item) => item.finding_id === finding.id && item.status === "resolved"), "UI remediation item was not resolved.");
    log("verifying operator-started Learning workflow renders generated signals and candidates");
    await clickOrExplain(page, page.getByRole("button", { name: "Learning" }).first(), "Learning navigation", pageMessages);
    await page.getByRole("heading", { name: "Learning Candidates" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Run learning now" }).click();
    await pollUntil(async () => {
      const text = await page.locator("main").innerText();
      return /signals\s+[1-9]/i.test(text) && /open candidates\s+[1-9]/i.test(text) && !/No learning candidates in the current filter/i.test(text);
    }, "Learning workspace populated counts");
    const learningEvents = await api("GET", `/learning/events?run_id=${encodeURIComponent(runId)}`);
    assert.ok(learningEvents.learning_events.some((item) => item.event_type === "review_needs_validation"), "UI review triage did not produce a learning event.");
    assert.ok(learningEvents.learning_events.some((item) => item.event_type === "remediation_state"), "UI remediation resolution did not produce a learning event.");
    const learningCandidates = await api("GET", `/learning/candidates?run_id=${encodeURIComponent(runId)}`);
    assert.ok(learningCandidates.learning_candidates.length > 0, "Explicit UI learning run did not produce learning candidates.");

    log(`passed. Run: ${runId}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (webServer) await closeServer(webServer).catch(() => undefined);
    if (server) await closeServer(server).catch(() => undefined);
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (!configuredWorkRoot && process.env.TETHERMARK_STATIC_PI_UI_E2E_KEEP_TEMP !== "1") {
      await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function expectApiAction(api, runId, actionType) {
  await pollUntil(async () => {
    const payload = await api("GET", `/runs/${encodeURIComponent(runId)}/review-actions`);
    return payload.review_actions?.some((item) => item.action_type === actionType);
  }, `review action ${actionType}`);
}

async function expectReviewComment(api, runId, bodyText) {
  await pollUntil(async () => {
    const payload = await api("GET", `/runs/${encodeURIComponent(runId)}/review-comments`);
    return payload.review_comments?.some((item) => String(item.body || "").includes(bodyText));
  }, `review comment containing ${bodyText}`);
}

async function expectWorkflowStatus(api, runId, status) {
  await pollUntil(async () => {
    const payload = await api("GET", `/runs/${encodeURIComponent(runId)}/review-workflow`);
    return payload.review_workflow?.status === status;
  }, `workflow status ${status}`);
}

async function pollUntil(check, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}.${lastError ? ` Last error: ${lastError.message}` : ""}`);
}

async function waitForUiSettled(page) {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

async function clickOrExplain(page, locator, label, pageMessages) {
  try {
    await locator.click();
  } catch (error) {
    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText({ timeout: 1000 }).catch(() => "");
    throw new Error([
      `Could not click ${label}: ${error instanceof Error ? error.message : String(error)}`,
      `page title: ${title || "n/a"}`,
      `body: ${bodyText.slice(0, 1000) || "n/a"}`,
      `browser messages:\n${pageMessages.slice(-20).join("\n") || "n/a"}`
    ].join("\n"));
  }
}

main().catch((error) => {
  console.error("[tethermark:static-pi-ui-e2e] failed", error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
