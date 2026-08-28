import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { resolveEnvironmentFilePath, loadEnvironment } from "../dist/packages/core-engine/src/env.js";
import { resolveArtifactPath, resolveArtifactRoot } from "../dist/packages/core-engine/src/local-paths.js";
import { defaultPersistenceRoot } from "../dist/packages/core-engine/src/persistence/backend.js";

const repoRoot = process.cwd();
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-service-deployment-"));

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function requireText(contents, fragments, label) {
  for (const fragment of fragments) assert.ok(contents.includes(fragment), `${label} must include ${fragment}`);
}

async function collectTypeScriptFiles(root) {
  const files = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectTypeScriptFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".ts") && entry.name !== "test-runner.ts") files.push(entryPath);
  }
  return files;
}

const saved = new Map(["HARNESS_ARTIFACT_ROOT", "HARNESS_LOCAL_DB_ROOT", "HARNESS_ENV_FILE", "TETHERMARK_SERVICE_TEST_VALUE"].map((key) => [key, process.env[key]]));
try {
  const fakeCheckout = path.join(temporaryRoot, "checkout");
  const dataRoot = path.join(temporaryRoot, "service-data");
  const envPath = path.join(dataRoot, "config", "tethermark.env");
  await fs.mkdir(path.dirname(envPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(envPath, "TETHERMARK_SERVICE_TEST_VALUE=loaded-from-protected-file\n", { encoding: "utf8", mode: 0o600 });

  assert.equal(resolveArtifactRoot({}, fakeCheckout), path.resolve(fakeCheckout, ".artifacts"));
  assert.equal(resolveArtifactRoot({ HARNESS_ARTIFACT_ROOT: dataRoot }, fakeCheckout), path.resolve(dataRoot));

  process.env.HARNESS_ARTIFACT_ROOT = dataRoot;
  delete process.env.HARNESS_LOCAL_DB_ROOT;
  assert.equal(resolveArtifactPath("runs"), path.join(path.resolve(dataRoot), "runs"));
  assert.equal(defaultPersistenceRoot("local"), path.join(path.resolve(dataRoot), "state", "local-db"));

  process.env.HARNESS_ENV_FILE = envPath;
  delete process.env.TETHERMARK_SERVICE_TEST_VALUE;
  assert.equal(resolveEnvironmentFilePath(), path.resolve(envPath));
  loadEnvironment();
  assert.equal(process.env.TETHERMARK_SERVICE_TEST_VALUE, "loaded-from-protected-file");

  const sourceFiles = [
    ...await collectTypeScriptFiles(path.join(repoRoot, "packages")),
    ...await collectTypeScriptFiles(path.join(repoRoot, "apps"))
  ];
  for (const file of sourceFiles) {
    const contents = await fs.readFile(file, "utf8");
    assert.ok(!/process\.cwd\(\)\s*,\s*["']\.artifacts["']/.test(contents), `${path.relative(repoRoot, file)} bypasses HARNESS_ARTIFACT_ROOT`);
  }

  const systemd = await read("deploy/systemd/tethermark.service");
  requireText(systemd, [
    "User=tethermark",
    "Group=tethermark",
    "UMask=0077",
    "ProtectSystem=strict",
    "ProtectHome=true",
    "NoNewPrivileges=true",
    "CapabilityBoundingSet=",
    "AmbientCapabilities=",
    "ReadWritePaths=/var/lib/tethermark",
    "EnvironmentFile=/var/lib/tethermark/config/tethermark.env"
  ], "systemd unit");
  assert.ok(!/User=(?:root|0)\b/.test(systemd), "systemd unit must not run as root");
  assert.ok(!systemd.includes("docker.sock"), "systemd unit must not expose a rootful Docker socket");

  const launchd = await read("deploy/launchd/dev.tethermark.community.plist");
  requireText(launchd, [
    "<string>_tethermark</string>",
    "<key>HARNESS_ENV_FILE</key>",
    "<key>HARNESS_ARTIFACT_ROOT</key>",
    "<key>HARNESS_LOCAL_DB_ROOT</key>",
    "<string>/opt/tethermark</string>"
  ], "launchd plist");

  const windows = await read("deploy/windows/start-tethermark.ps1");
  requireText(windows, [
    "[Parameter(Mandatory = $true)][string]$InstallDir",
    "$env:HARNESS_ENV_FILE = $ConfigPath",
    "$env:HARNESS_ARTIFACT_ROOT = Join-Path $DataDir \"artifacts\"",
    "$env:HARNESS_LOCAL_DB_ROOT = Join-Path $DataDir \"state\\local-db\"",
    "& $NodePath $entrypoint"
  ], "Windows launcher");
  assert.ok(!windows.includes("Start-Process"), "Windows launcher must retain the Node process directly");
  assert.ok(!windows.includes("Invoke-Expression"), "Windows launcher must not evaluate a command string");

  for (const example of ["deploy/systemd/tethermark.env.example", "deploy/windows/tethermark.env.example"]) {
    const contents = await read(example);
    assert.match(contents, /^HARNESS_API_KEY=\s*$/m, `${example} must not ship an API key`);
    assert.match(contents, /^(?:OPENAI_API_KEY|AUDIT_LLM_API_KEY)=\s*$/m, `${example} must not ship a model API key`);
  }

  if (process.platform === "win32") {
    const windowsLauncherPath = path.join(repoRoot, "deploy", "windows", "start-tethermark.ps1").replaceAll("'", "''");
    const syntax = spawnSync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('${windowsLauncherPath}',[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }`
    ], { encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout || "PowerShell syntax validation failed");
  }
} finally {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const resolved = path.resolve(temporaryRoot);
  const allowedPrefix = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(allowedPrefix) || !path.basename(resolved).startsWith("tethermark-service-deployment-")) throw new Error("Refusing to remove an unexpected service-deployment test path.");
  await fs.rm(resolved, { recursive: true, force: true });
}

console.log("Least-privilege service paths and deployment examples passed.");
