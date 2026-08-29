import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const knownArgs = new Set(["--allow-dirty", "--output"]);
for (let index = 0; index < args.length; index += 1) {
  if (!knownArgs.has(args[index])) throw new Error(`Unknown lifecycle-release option: ${args[index]}`);
  if (args[index] === "--output") index += 1;
}
if (outputIndex >= 0 && (!args[outputIndex + 1] || args[outputIndex + 1].startsWith("--"))) throw new Error("--output requires a path");

function invokeSync(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: repoRoot, encoding: "utf8", shell: false });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${commandArgs.join(" ")} failed:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return String(result.stdout ?? "").trim();
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

async function runCheck(check) {
  const started = Date.now();
  process.stdout.write(`\n[tethermark:release-lifecycle] START ${check.name}\n`);
  const child = spawn(check.command, check.args, {
    cwd: repoRoot,
    env: { ...process.env, ...(check.env ?? {}) },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const tail = [];
  const retain = (chunk, stream) => {
    const output = chunk.toString();
    stream.write(output);
    tail.push(...output.split(/\r?\n/).filter(Boolean));
    if (tail.length > 20) tail.splice(0, tail.length - 20);
  };
  child.stdout.on("data", (chunk) => retain(chunk, process.stdout));
  child.stderr.on("data", (chunk) => retain(chunk, process.stderr));
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const durationMs = Date.now() - started;
  assert.equal(exitCode, 0, `${check.name} failed with exit code ${exitCode}`);
  process.stdout.write(`[tethermark:release-lifecycle] PASS ${check.name} (${durationMs} ms)\n`);
  return { id: check.id, name: check.name, status: "passed", duration_ms: durationMs, output_tail: tail.slice(-5) };
}

const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, "Release candidate package version must be a stable semantic version");
const revision = invokeSync("git", ["rev-parse", "HEAD"]);
assert.match(revision, /^[a-f0-9]{40}$/i);
const gitStatus = invokeSync("git", ["status", "--porcelain", "--untracked-files=all"]);
const cleanCheckout = gitStatus.length === 0;
if (!cleanCheckout && !args.includes("--allow-dirty")) throw new Error("Release lifecycle verification requires a clean checkout. Commit the candidate or pass --allow-dirty for development only.");
const proposedTag = `v${packageJson.version}`;
const existingTagRevision = spawnSync("git", ["rev-list", "-n", "1", proposedTag], { cwd: repoRoot, encoding: "utf8", shell: false });
if (existingTagRevision.status === 0 && String(existingTagRevision.stdout ?? "").trim() !== revision) throw new Error(`${proposedTag} already identifies a different revision and must not be moved.`);

const npm = resolveNpmInvocation();
const npmRun = (script, extra = []) => ({ command: npm.command, args: [...npm.prefix, "run", script, ...extra] });
const testRunner = path.join(repoRoot, "dist", "packages", "core-engine", "src", "test-runner.js");
const filterCheck = (id, name, filter) => ({
  id,
  name,
  command: process.execPath,
  args: [testRunner],
  env: { TETHERMARK_TEST_FILTER: filter }
});
const upgradeEvidencePath = path.join(repoRoot, ".artifacts", "release-candidate", `install-upgrade-${revision.slice(0, 12)}.json`);
const checks = [
  { id: "build", name: "TypeScript build", ...npmRun("build", ["--silent"]) },
  { id: "fresh_install", name: "Fresh install, update, first-run, and guarded uninstall", ...npmRun("test:install-lifecycle") },
  { id: "upgrade", name: "Clean clone and two-ref upgrade with state preservation", ...npmRun("test:install-upgrade", ["--", "--output", upgradeEvidencePath]) },
  filterCheck("backup_restore", "Verified SQLite backup, restore, tamper, and compatibility", "sqlite automatic backup verification and restore"),
  filterCheck("database_migration", "SQLite release migration and rollback", "sqlite release upgrade fixture and rollback"),
  filterCheck("cancellation", "Durable cancellation and retry lifecycle", "async run lifecycle api"),
  filterCheck("restart_recovery", "Durable async restart recovery", "async lifecycle crash stage recovery"),
  filterCheck("terminal_recovery", "Terminal follow-up crash recovery", "async terminal followup crash recovery"),
  filterCheck("policy_migration", "System Policy export/import migration and rollback selection", "system policy lifecycle and deterministic resolution"),
  filterCheck("export_compatibility", "Current and legacy export compatibility", "export compatibility metadata and legacy v1 reader"),
  filterCheck("export_snapshots", "Golden export schema snapshots", "golden export snapshots"),
  { id: "export_catalog", name: "Export catalog compatibility", command: process.execPath, args: [path.join(repoRoot, "dist", "packages", "core-engine", "src", "export-maintenance.js"), "check"] }
];

const startedAt = new Date().toISOString();
const results = [];
for (const check of checks) results.push(await runCheck(check));
const evidence = {
  schema_version: "2026-08-29.release-lifecycle-recovery.v1",
  status: "passed",
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  candidate: {
    version: packageJson.version,
    proposed_tag: proposedTag,
    revision_sha: revision,
    clean_checkout: cleanCheckout,
    development_override: !cleanCheckout
  },
  assertions: {
    fresh_install: true,
    upgrade: true,
    backup_restore: true,
    cancellation_recovery: true,
    policy_migration: true,
    export_compatibility: true
  },
  checks: results,
  retained_evidence: {
    install_upgrade: path.relative(repoRoot, upgradeEvidencePath).replaceAll("\\", "/")
  },
  credentials_included: false,
  local_paths_included: false
};
const outputPath = outputIndex >= 0
  ? path.resolve(args[outputIndex + 1])
  : path.join(repoRoot, ".artifacts", "release-candidate", `lifecycle-recovery-${revision.slice(0, 12)}.json`);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ status: evidence.status, candidate: evidence.candidate, assertions: evidence.assertions, evidence_path: path.relative(repoRoot, outputPath).replaceAll("\\", "/") }, null, 2));
