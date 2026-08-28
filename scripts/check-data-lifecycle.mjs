import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildDiagnosticsBundle, DIAGNOSTICS_SCHEMA_VERSION } from "../dist/apps/cli/src/diagnostics.js";
import { removeManagedCredentials } from "../dist/apps/cli/src/credentials.js";
import { readPersistedUiSettingsLayer, updatePersistedUiSettings } from "../dist/packages/core-engine/src/persistence/ui-settings.js";

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-data-lifecycle-"));
const saved = new Map(["HARNESS_ARTIFACT_ROOT", "HARNESS_LOCAL_DB_ROOT", "HARNESS_ENV_FILE"].map((key) => [key, process.env[key]]));
try {
  const artifactRoot = path.join(temporaryRoot, "artifacts-private-location");
  const persistenceRoot = path.join(temporaryRoot, "state-private-location");
  const environmentFile = path.join(temporaryRoot, "config-private-location", "tethermark.env");
  const outputPath = path.join(temporaryRoot, "diagnostics.json");
  const syntheticSecret = "synthetic-do-not-disclose-key-123456789";
  await fs.mkdir(path.dirname(environmentFile), { recursive: true });
  await fs.mkdir(persistenceRoot, { recursive: true });
  await fs.writeFile(environmentFile, `HARNESS_API_KEY=${syntheticSecret}\n`, "utf8");
  await updatePersistedUiSettings({
    credentials: { openai_api_key: syntheticSecret, prefer_env_credentials: true },
    integrations: { generic_webhook_secret: syntheticSecret },
    providers: { agent_overrides: { planner_agent: { api_key: syntheticSecret } } }
  }, persistenceRoot, { scopeLevel: "global" });
  process.env.HARNESS_ARTIFACT_ROOT = artifactRoot;
  process.env.HARNESS_LOCAL_DB_ROOT = persistenceRoot;
  process.env.HARNESS_ENV_FILE = environmentFile;

  const result = await buildDiagnosticsBundle({
    outputPath,
    now: new Date("2026-08-28T00:00:00.000Z"),
    doctorReport: {
      generated_at: "2026-08-28T00:00:00.000Z",
      platform: process.platform,
      arch: process.arch,
      cwd: temporaryRoot,
      checks: [{ id: "synthetic_check", label: syntheticSecret, status: "warn", summary: temporaryRoot }],
      summary: { pass: 0, warn: 1, fail: 0 }
    }
  });
  assert.equal(result.bundle.schema_version, DIAGNOSTICS_SCHEMA_VERSION);
  const serialized = await fs.readFile(outputPath, "utf8");
  assert.ok(!serialized.includes(syntheticSecret), "diagnostics included an environment or doctor secret");
  assert.ok(!serialized.includes(temporaryRoot), "diagnostics included a local path");
  assert.ok(!serialized.includes("harness.sqlite"), "diagnostics included a local filename");
  assert.equal(result.bundle.privacy.includes_credentials, false);
  assert.equal(result.bundle.privacy.includes_audit_content, false);

  const uiSource = await fs.readFile(path.resolve("apps/web-ui/static/client/app-root.js"), "utf8");
  assert.ok(uiSource.includes("apiKeySessionStorageKey"), "UI must keep the instance API key in session storage");
  assert.ok(uiSource.includes("const { apiKey, ...nonSecretContext } = requestContext"), "UI must exclude the API key from persisted context");
  assert.ok(!uiSource.includes("localStorage.setItem(contextStorageKey, JSON.stringify(requestContext))"), "UI must not persist the API key in localStorage");

  const preview = await removeManagedCredentials({ envPath: environmentFile, persistenceRoot, yes: false });
  assert.equal(preview.env_values_found, 1);
  assert.equal(preview.persisted_values_found, 3);
  assert.ok((await fs.readFile(environmentFile, "utf8")).includes(syntheticSecret), "credential preview changed the environment file");
  const removal = await removeManagedCredentials({ envPath: environmentFile, persistenceRoot, yes: true });
  assert.equal(removal.changed, true);
  const scrubbed = await fs.readFile(environmentFile, "utf8");
  assert.ok(!scrubbed.includes(syntheticSecret), "credential removal retained the secret value");
  assert.match(scrubbed, /^HARNESS_API_KEY=\s*$/m);
  const settings = await readPersistedUiSettingsLayer("global", persistenceRoot);
  assert.equal(settings.credentials_json.openai_api_key, null);
  assert.equal(settings.integrations_json.generic_webhook_secret, null);
  assert.equal(settings.providers_json.agent_overrides.planner_agent.api_key, null);
} finally {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const resolved = path.resolve(temporaryRoot);
  const allowedPrefix = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(allowedPrefix) || !path.basename(resolved).startsWith("tethermark-data-lifecycle-")) throw new Error("Refusing to remove an unexpected data-lifecycle test path.");
  await fs.rm(resolved, { recursive: true, force: true });
}

console.log("Redacted diagnostics and browser credential-storage checks passed.");
