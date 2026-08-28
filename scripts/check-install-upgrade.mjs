import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
if (args.some((item, index) => item !== "--output" && index !== outputIndex + 1)) throw new Error("Usage: node scripts/check-install-upgrade.mjs [--output <evidence.json>]");
if (outputIndex >= 0 && (!args[outputIndex + 1] || args[outputIndex + 1].startsWith("--"))) throw new Error("--output requires a path");
const outputPath = outputIndex >= 0 ? path.resolve(args[outputIndex + 1]) : null;

function invoke(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    shell: false,
    timeout: options.timeout ?? 10 * 60_000,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${options.label ?? command} failed:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result;
}

function resolveNpmInvocation() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
  ].filter(Boolean);
  const npmCli = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (npmCli) return { command: process.execPath, prefix: [npmCli] };
  if (process.platform === "win32") return { command: process.env.ComSpec || "cmd.exe", prefix: ["/d", "/s", "/c", "npm.cmd"] };
  return { command: "npm", prefix: [] };
}

function installer(installDir, repoUrl, ref, update = false) {
  if (process.platform === "win32") {
    const commandArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(repoRoot, "scripts", "install.ps1"), "-InstallDir", installDir, "-RepoUrl", repoUrl, "-Ref", ref, "-NoOnboard"];
    if (update) commandArgs.push("-Update");
    return invoke("powershell.exe", commandArgs, { label: update ? "Windows update" : "Windows install" });
  }
  const commandArgs = [path.join(repoRoot, "scripts", "install.sh"), `--prefix=${installDir}`, `--repo=${repoUrl}`, `--ref=${ref}`, "--no-onboard"];
  if (update) commandArgs.push("--update");
  return invoke("bash", commandArgs, { label: update ? "Unix update" : "Unix install" });
}

async function markerAt(installDir) {
  return JSON.parse(await fs.readFile(path.join(installDir, ".tethermark-install.json"), "utf8"));
}

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-install-upgrade-"));
const startedAt = new Date().toISOString();
try {
  const remote = path.join(temporaryRoot, "release-remote.git");
  const installDir = path.join(temporaryRoot, "installed application");
  const baseRevision = invoke("git", ["rev-parse", "HEAD"], { label: "resolve base revision" }).stdout.trim();
  const baseTree = invoke("git", ["rev-parse", "HEAD^{tree}"], { label: "resolve candidate tree" }).stdout.trim();
  assert.match(baseRevision, /^[a-f0-9]{40}$/i);
  invoke("git", ["clone", "--bare", "--", repoRoot, remote], { label: "create local release remote" });
  const candidateRevision = invoke("git", [
    "-C", remote,
    "-c", "user.name=Tethermark Lifecycle",
    "-c", "user.email=lifecycle@example.invalid",
    "-c", "commit.gpgsign=false",
    "commit-tree", baseTree,
    "-p", baseRevision,
    "-m", "install-upgrade candidate fixture"
  ], { label: "create candidate revision" }).stdout.trim();
  assert.match(candidateRevision, /^[a-f0-9]{40}$/i);
  assert.notEqual(baseRevision, candidateRevision);
  invoke("git", ["-C", remote, "update-ref", "refs/heads/install-base", baseRevision], { label: "create base release ref" });
  invoke("git", ["-C", remote, "update-ref", "refs/heads/install-candidate", candidateRevision], { label: "create candidate release ref" });

  installer(installDir, remote, "install-base");
  const baseMarker = await markerAt(installDir);
  assert.equal(baseMarker.commit_sha, baseRevision);
  await fs.access(path.join(installDir, "node_modules"));
  await fs.access(path.join(installDir, "dist", "apps", "api-server", "src", "index.js"));

  const configuration = "AUDIT_LLM_PROVIDER=mock\nAUDIT_LLM_MODEL=mock-agent-runtime\n";
  const sentinel = "state-preserved-across-upgrade\n";
  await fs.writeFile(path.join(installDir, ".env"), configuration, "utf8");
  await fs.mkdir(path.join(installDir, ".artifacts", "state"), { recursive: true });
  await fs.writeFile(path.join(installDir, ".artifacts", "state", "upgrade-sentinel.txt"), sentinel, "utf8");

  installer(installDir, remote, "install-candidate", true);
  const candidateMarker = await markerAt(installDir);
  assert.equal(candidateMarker.commit_sha, candidateRevision);
  assert.equal(await fs.readFile(path.join(installDir, ".env"), "utf8"), configuration);
  assert.equal(await fs.readFile(path.join(installDir, ".artifacts", "state", "upgrade-sentinel.txt"), "utf8"), sentinel);
  assert.equal(invoke("git", ["status", "--porcelain"], { cwd: installDir, label: "post-update checkout status" }).stdout.trim(), "");
  const npm = resolveNpmInvocation();
  invoke(npm.command, [...npm.prefix, "run", "oss:check"], {
    cwd: installDir,
    label: "post-update application smoke",
    env: {
      AUDIT_LLM_PROVIDER: "mock",
      AUDIT_LLM_MODEL: "mock-agent-runtime",
      HARNESS_DISABLE_LEARNING_SCHEDULER: "1",
      HARNESS_DISABLE_LOCAL_BINARIES: "1",
      HARNESS_DISABLE_PYTHON_WORKERS: "1"
    }
  });

  const evidence = {
    schema_version: "2026-08-28.install-upgrade-evidence.v1",
    status: "passed",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    host: { platform: process.platform, architecture: process.arch, os_release: os.release(), node_version: process.version },
    base_revision: baseRevision,
    candidate_revision: candidateRevision,
    assertions: {
      clean_clone: true,
      lockfile_install: true,
      compiled_application_present: true,
      detached_marker_matches_base: true,
      update_marker_matches_candidate: true,
      protected_configuration_preserved: true,
      local_state_preserved: true,
      checkout_clean_after_update: true,
      post_update_api_ui_smoke: true
    },
    local_paths_included: false,
    credentials_included: false
  };
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  const resolved = path.resolve(temporaryRoot);
  const allowedPrefix = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(allowedPrefix) || !path.basename(resolved).startsWith("tethermark-install-upgrade-")) throw new Error("Refusing to remove an unexpected install-upgrade path.");
  await fs.rm(resolved, { recursive: true, force: true });
}
