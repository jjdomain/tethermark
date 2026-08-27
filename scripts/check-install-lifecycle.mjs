import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function invoke(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: process.env,
    shell: false
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    error: result.error
  };
}

function expectSuccess(result, label) {
  assert.equal(result.error, undefined, `${label}: ${result.error?.message ?? "spawn failed"}`);
  assert.equal(result.status, 0, `${label}:\n${result.output}`);
}

function nativeScript(scriptName, args) {
  if (process.platform === "win32") {
    return invoke("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(repoRoot, "scripts", `${scriptName}.ps1`), ...args]);
  }
  return invoke("bash", [path.join(repoRoot, "scripts", `${scriptName}.sh`), ...args]);
}

function installArgs(installDir, extra = []) {
  return process.platform === "win32"
    ? ["-DryRun", "-InstallDir", installDir, "-Ref", "release-test", ...extra]
    : ["--dry-run", `--prefix=${installDir}`, "--ref=release-test", ...extra];
}

function uninstallArgs(installDir, extra = []) {
  return process.platform === "win32"
    ? ["-DryRun", "-InstallDir", installDir, ...extra]
    : ["--dry-run", `--prefix=${installDir}`, ...extra];
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-install-lifecycle-"));
try {
  const installTarget = path.join(tempRoot, "install target");
  const installPreview = nativeScript("install", installArgs(installTarget));
  expectSuccess(installPreview, "install dry run");
  assert.match(installPreview.output, /clone .*--no-checkout/i);
  assert.match(installPreview.output, /fetch .*--depth 1 origin release-test/i);
  assert.match(installPreview.output, /checkout .*--detach .*FETCH_HEAD/i);
  assert.match(installPreview.output, /first-run\.mjs/i);

  const firstRunPreview = invoke(process.execPath, [path.join(repoRoot, "scripts", "first-run.mjs"), "--dry-run"]);
  expectSuccess(firstRunPreview, "first-run dry run");
  assert.match(firstRunPreview.output, /npm(?:\.cmd)? ci/i);
  assert.match(firstRunPreview.output, /index\.js onboard/i);
  assert.match(firstRunPreview.output, /no files or dependencies were changed/i);

  const updateTarget = path.join(tempRoot, "update target");
  await fs.mkdir(updateTarget, { recursive: true });
  await fs.writeFile(path.join(updateTarget, "package.json"), `${JSON.stringify({ name: "tethermark", version: "0.2.0" }, null, 2)}\n`, "utf8");
  expectSuccess(invoke("git", ["init"], { cwd: updateTarget }), "git init");
  expectSuccess(invoke("git", ["add", "package.json"], { cwd: updateTarget }), "git add");
  expectSuccess(invoke("git", ["-c", "user.name=Tethermark Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture"], { cwd: updateTarget }), "git commit");

  const updateSwitch = process.platform === "win32" ? ["-Update"] : ["--update"];
  const updatePreview = nativeScript("install", installArgs(updateTarget, updateSwitch));
  expectSuccess(updatePreview, "update dry run");
  assert.match(updatePreview.output, /Tethermark update/i);
  assert.match(updatePreview.output, /fetch .*release-test/i);

  const commit = "0123456789abcdef0123456789abcdef01234567";
  const markerResult = invoke(process.execPath, [
    path.join(repoRoot, "scripts", "write-install-marker.mjs"),
    "--install-dir", updateTarget,
    "--repo", "https://operator:secret@example.invalid/tethermark.git?token=secret#fragment",
    "--ref", "release-test",
    "--commit", commit
  ]);
  expectSuccess(markerResult, "install marker");
  const marker = JSON.parse(await fs.readFile(path.join(updateTarget, ".tethermark-install.json"), "utf8"));
  assert.equal(marker.commit_sha, commit);
  assert.equal(marker.requested_ref, "release-test");
  assert.equal(marker.repository, "https://example.invalid/tethermark.git");

  await fs.mkdir(path.join(updateTarget, ".artifacts", "state"), { recursive: true });
  await fs.writeFile(path.join(updateTarget, ".env"), "AUDIT_LLM_PROVIDER=mock\n", "utf8");
  const uninstallPreview = nativeScript("uninstall", uninstallArgs(updateTarget));
  expectSuccess(uninstallPreview, "uninstall dry run");
  assert.match(uninstallPreview.output, /will be preserved/i);
  assert.match(uninstallPreview.output, /Remove-Item|rm -rf/i);
  await fs.access(updateTarget);

  const unsafeArgs = process.platform === "win32"
    ? ["-DryRun", "-InstallDir", os.homedir()]
    : ["--dry-run", `--prefix=${os.homedir()}`];
  const unsafe = nativeScript("uninstall", unsafeArgs);
  assert.notEqual(unsafe.status, 0, "uninstaller must reject the user profile as a target");

  const backupRoot = path.join(tempRoot, "preserved state");
  const confirmedArgs = process.platform === "win32"
    ? ["-Yes", "-InstallDir", updateTarget, "-BackupDir", backupRoot]
    : ["--yes", `--prefix=${updateTarget}`, `--backup-dir=${backupRoot}`];
  const uninstall = nativeScript("uninstall", confirmedArgs);
  expectSuccess(uninstall, "confirmed uninstall");
  await assert.rejects(fs.access(updateTarget), "confirmed uninstall must remove the verified checkout");
  const backups = await fs.readdir(backupRoot);
  assert.equal(backups.length, 1, "uninstall must create one state backup");
  const preservedRoot = path.join(backupRoot, backups[0]);
  assert.equal(await fs.readFile(path.join(preservedRoot, ".env"), "utf8"), "AUDIT_LLM_PROVIDER=mock\n");
  await fs.access(path.join(preservedRoot, ".artifacts", "state"));

  console.log(`[tethermark:install-lifecycle] ${process.platform} install, update, first-run, marker, and guarded uninstall checks passed`);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
