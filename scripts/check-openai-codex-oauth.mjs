import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distApiServer = path.join(repoRoot, "dist", "apps", "api-server", "src", "index.js");
const distLlmProvider = path.join(repoRoot, "dist", "packages", "llm-provider", "src", "index.js");
const realMode = process.argv.includes("--real") || process.env.TETHERMARK_OPENAI_CODEX_OAUTH_REAL === "1";

function log(message) {
  console.log(`[tethermark:codex-oauth-smoke] ${message}`);
}

function codexRealModeFixGuide(status) {
  const command = status?.command ? `\n  command: ${status.command}` : "";
  const detail = status?.execution_note ? `\n  status: ${status.execution_status ?? "not_ready"}\n  detail: ${status.execution_note}` : "";
  return [
    "Real Codex OAuth smoke requires an authenticated local Codex CLI session.",
    command,
    detail,
    "",
    "Fix:",
    "  1. Install the native Codex CLI explicitly through an official distribution channel.",
    "  2. If Codex is not on PATH, point the audit engine at the native executable for this shell:",
    "     $env:AUDIT_LLM_CODEX_COMMAND=\"C:\\path\\to\\codex.exe\"",
    "  3. Sign in once from the same user account:",
    "     & $env:AUDIT_LLM_CODEX_COMMAND login",
    "  4. Confirm status returns quickly:",
    "     & $env:AUDIT_LLM_CODEX_COMMAND login status",
    "  5. Rerun:",
    "     npm run smoke:openai-codex-oauth:real",
    "",
    "If npm package installation hangs, fix npm network/proxy/TLS first or install Codex CLI by another managed path, then set AUDIT_LLM_CODEX_COMMAND to that executable."
  ].filter(Boolean).join("\n");
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
  if (!address || typeof address === "string") throw new Error("API server did not expose a numeric listening port.");
  return address.port;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function createFakeCodexCommand(rootDir) {
  if (process.platform === "win32") {
    // `spawn(..., { shell: false })` intentionally rejects cmd wrappers on
    // Windows. Node can act as a native fake command by loading `login` from
    // the isolated working directory when the API invokes `node login status`.
    await fs.writeFile(path.join(rootDir, "login"), [
      "if (process.argv[2] !== 'status') process.exit(2);",
      "if (process.env.FAKE_CODEX_CONNECTED === '1') {",
      "  console.log('Authenticated with ChatGPT OAuth');",
      "  process.exit(0);",
      "}",
      "console.error('Not logged in');",
      "process.exit(1);"
    ].join("\n"), "utf8");
    return process.execPath;
  }
  const commandPath = path.join(rootDir, "fake-codex");
  await fs.writeFile(commandPath, [
    "#!/usr/bin/env sh",
    "if [ \"$1\" = \"login\" ] && [ \"$2\" = \"status\" ]; then",
    "  if [ \"$FAKE_CODEX_CONNECTED\" = \"1\" ]; then",
    "    echo 'Authenticated with ChatGPT OAuth'",
    "    exit 0",
    "  fi",
    "  echo 'Not logged in'",
    "  exit 1",
    "fi",
    "echo 'fake codex command'",
    "exit 0"
  ].join("\n"), "utf8");
  await fs.chmod(commandPath, 0o755);
  return commandPath;
}

async function createFakeCodexExec(rootDir) {
  const cliPath = path.join(rootDir, "fake-codex-exec.mjs");
  await fs.writeFile(cliPath, [
    "import fs from 'node:fs';",
    "if (!process.argv.includes('--skip-git-repo-check')) process.exit(3);",
    "const outIndex = process.argv.indexOf('--output-last-message');",
    "if (outIndex < 0) process.exit(2);",
    "fs.writeFileSync(process.argv[outIndex + 1], JSON.stringify({ ok: true, provider: 'openai_codex', credential: 'oauth-local' }));"
  ].join("\n"), "utf8");
  return cliPath;
}

async function main() {
  if (!(await pathExists(distApiServer))) {
    throw new Error(`Built API server not found at ${distApiServer}. Run npm run build first.`);
  }
  if (!(await pathExists(distLlmProvider))) {
    throw new Error(`Built LLM provider package not found at ${distLlmProvider}. Run npm run build first.`);
  }

  const originalCwd = process.cwd();
  const originalEnv = {
    HARNESS_LOCAL_DB_ROOT: process.env.HARNESS_LOCAL_DB_ROOT,
    HARNESS_API_AUTH_MODE: process.env.HARNESS_API_AUTH_MODE,
    HARNESS_API_KEY: process.env.HARNESS_API_KEY,
    HARNESS_ENABLE_LOCAL_OAUTH_CONNECT: process.env.HARNESS_ENABLE_LOCAL_OAUTH_CONNECT,
    HARNESS_LOCAL_OAUTH_CONNECT_DRY_RUN: process.env.HARNESS_LOCAL_OAUTH_CONNECT_DRY_RUN,
    AUDIT_LLM_PROVIDER: process.env.AUDIT_LLM_PROVIDER,
    AUDIT_LLM_CODEX_COMMAND: process.env.AUDIT_LLM_CODEX_COMMAND,
    AUDIT_LLM_CODEX_STATUS_TIMEOUT_MS: process.env.AUDIT_LLM_CODEX_STATUS_TIMEOUT_MS,
    CODEX_HOME: process.env.CODEX_HOME,
    FAKE_CODEX_CONNECTED: process.env.FAKE_CODEX_CONNECTED,
    PORT: process.env.PORT
  };
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-codex-oauth-"));
  let server = null;

  try {
    await stageBuiltinCoreEngineData(workRoot);
    process.chdir(workRoot);
    process.env.HARNESS_LOCAL_DB_ROOT = path.join(workRoot, "local-db");
    process.env.HARNESS_API_AUTH_MODE = "api_key";
    process.env.HARNESS_API_KEY = "codex-oauth-smoke-key";
    process.env.HARNESS_ENABLE_LOCAL_OAUTH_CONNECT = "0";
    delete process.env.HARNESS_LOCAL_OAUTH_CONNECT_DRY_RUN;
    process.env.AUDIT_LLM_PROVIDER = "openai_codex";
    process.env.AUDIT_LLM_CODEX_STATUS_TIMEOUT_MS = process.env.AUDIT_LLM_CODEX_STATUS_TIMEOUT_MS ?? "10000";
    process.env.PORT = "0";

    if (!realMode) {
      process.env.CODEX_HOME = path.join(workRoot, "codex-home");
      process.env.AUDIT_LLM_CODEX_COMMAND = await createFakeCodexCommand(workRoot);
      process.env.FAKE_CODEX_CONNECTED = "0";
    }

    const { createApiServer } = await import(pathToFileURL(distApiServer).href);
    server = createApiServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${getListeningPort(server)}`;

    async function api(method, route, body, expectedStatus = 200) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
          "content-type": "application/json",
          "x-api-key": "codex-oauth-smoke-key",
          "x-harness-actor": "codex-oauth-smoke",
          "x-harness-project": "provider-readiness"
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

    log("checking provider registry");
    const providersPayload = await api("GET", "/llm-providers");
    const codexProvider = providersPayload.providers.find((item) => item.id === "openai_codex");
    assert.equal(codexProvider?.mode, "agent_oauth");
    assert.equal(codexProvider?.requires_api_key, false);
    assert.equal(providersPayload.presets.find((item) => item.id === "openai_codex_local")?.provider_id, "openai_codex");

    log("checking local OAuth status endpoint");
    const initialStatus = await api("GET", "/llm-providers/openai_codex/status");
    if (realMode) {
      assert.equal(initialStatus.connected, true, `${codexRealModeFixGuide(initialStatus)}\n\nStatus payload:\n${JSON.stringify(initialStatus, null, 2)}`);
      assert.equal(initialStatus.authenticated, true);
      assert.equal(initialStatus.command_available, true, `${codexRealModeFixGuide(initialStatus)}\n\nStatus payload:\n${JSON.stringify(initialStatus, null, 2)}`);
      assert.equal(initialStatus.executable_ready, true, `${codexRealModeFixGuide(initialStatus)}\n\nStatus payload:\n${JSON.stringify(initialStatus, null, 2)}`);
      assert.equal(initialStatus.ready, true, `${codexRealModeFixGuide(initialStatus)}\n\nStatus payload:\n${JSON.stringify(initialStatus, null, 2)}`);
      assert.match(String(initialStatus.credential_source ?? ""), /codex_auth_file|cli/);
    } else {
      assert.equal(initialStatus.connected, false);
      assert.equal(initialStatus.authenticated, false);
      assert.equal(initialStatus.command_available, true);
      assert.equal(initialStatus.executable_ready, false);
      assert.equal(initialStatus.ready, false);
      assert.equal(initialStatus.status, "not_connected");
    }

    log("checking connect endpoint guardrails");
    const disabledConnect = await api("POST", "/llm-providers/openai_codex/connect", {}, 400);
    assert.match(disabledConnect.error, /disabled/i);
    process.env.HARNESS_ENABLE_LOCAL_OAUTH_CONNECT = "1";
    process.env.HARNESS_LOCAL_OAUTH_CONNECT_DRY_RUN = "1";
    const dryRunConnect = await api("POST", "/llm-providers/openai_codex/connect");
    assert.equal(dryRunConnect.provider_id, "openai_codex");
    assert.equal(dryRunConnect.status, "started");
    assert.equal(dryRunConnect.dry_run, true);

    if (!realMode) {
      log("checking first-run empty Codex profile behavior");
      const emptyCodexHome = path.join(workRoot, "new-user-codex-home");
      await fs.mkdir(emptyCodexHome, { recursive: true });
      process.env.CODEX_HOME = emptyCodexHome;
      process.env.FAKE_CODEX_CONNECTED = "0";
      const firstRunStatus = await api("GET", "/llm-providers/openai_codex/status");
      assert.equal(firstRunStatus.connected, false);
      assert.equal(firstRunStatus.authenticated, false);
      assert.equal(firstRunStatus.ready, false);
      assert.equal(firstRunStatus.status, "not_connected");
      assert.doesNotMatch(String(firstRunStatus.note ?? ""), /timed out/i);

      process.env.CODEX_HOME = path.join(workRoot, "codex-home");
      process.env.FAKE_CODEX_CONNECTED = "1";
      await fs.mkdir(process.env.CODEX_HOME, { recursive: true });
      await fs.writeFile(path.join(process.env.CODEX_HOME, "auth.json"), JSON.stringify({
        auth_mode: "chatgpt",
        tokens: {
          access_token: "fake.access.token",
          id_token: "fake.id.token",
          refresh_token: "fake-refresh-token"
        }
      }), "utf8");
      const connectedStatus = await api("GET", "/llm-providers/openai_codex/status");
      assert.equal(connectedStatus.connected, true);
      assert.equal(connectedStatus.authenticated, true);
      assert.equal(connectedStatus.command_available, true);
      assert.equal(connectedStatus.executable_ready, true);
      assert.equal(connectedStatus.ready, true);
      assert.equal(connectedStatus.status, "ready");

      log("checking authenticated-session/CLI-unavailable distinction");
      process.env.AUDIT_LLM_CODEX_COMMAND = path.join(workRoot, "missing-codex-command");
      const unavailableStatus = await api("GET", "/llm-providers/openai_codex/status");
      assert.equal(unavailableStatus.connected, true);
      assert.equal(unavailableStatus.authenticated, true);
      assert.equal(unavailableStatus.command_available, false);
      assert.equal(unavailableStatus.executable_ready, false);
      assert.equal(unavailableStatus.ready, false);
      assert.equal(unavailableStatus.status, "authenticated_cli_unavailable");
      assert.equal(unavailableStatus.execution_status, "command_missing");
      assert.match(String(unavailableStatus.note ?? ""), /blocked/i);
      process.env.AUDIT_LLM_CODEX_COMMAND = await createFakeCodexCommand(workRoot);

      log("checking structured Codex provider execution with fake OAuth command");
      const { OpenAICodexCliProvider, resolveAgentProviderConfig } = await import(pathToFileURL(distLlmProvider).href);
      const resolved = resolveAgentProviderConfig("planner_agent", { provider: "openai_codex", model: "gpt-5.6-sol" });
      assert.equal(resolved.provider, "openai_codex");
      assert.equal(resolved.apiKeySource, "oauth-local");
      assert.equal(resolved.apiKey, undefined);
      const fakeExec = await createFakeCodexExec(workRoot);
      const provider = new OpenAICodexCliProvider("gpt-5.6-sol", process.execPath, "read-only", 10_000, [fakeExec]);
      const result = await provider.generateStructured({
        agentName: "planner_agent",
        schemaName: "codex_oauth_smoke",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok", "provider", "credential"],
          properties: {
            ok: { type: "boolean" },
            provider: { type: "string" },
            credential: { type: "string" }
          }
        },
        systemPrompt: "Return structured smoke output.",
        userPrompt: "Confirm OAuth-local provider wiring.",
        metadata: {},
        temperature: 0.1
      });
      assert.deepEqual(result.parsed, { ok: true, provider: "openai_codex", credential: "oauth-local" });
      assert.equal(result.provider, "openai_codex");
    } else {
      log("real Codex OAuth session and CLI are ready; skipping live structured exec to avoid unbounded subscription usage");
    }

    log("passed");
  } finally {
    if (server) await closeServer(server).catch(() => undefined);
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (process.env.TETHERMARK_CODEX_OAUTH_KEEP_TEMP !== "1") {
      await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error("[tethermark:codex-oauth-smoke] failed", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
