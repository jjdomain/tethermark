import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  evaluateStaticToolVersion,
  resolveStaticToolInvocation,
  resolveStaticToolReleaseAsset,
  STATIC_TOOL_POLICIES,
  type ProductionStaticToolId,
  type StaticToolReleaseAsset
} from "../../../packages/core-engine/src/static-tool-policy.js";
import { buildToolPathEnv } from "../../../packages/core-engine/src/tool-paths.js";

type ToolId = ProductionStaticToolId;
type SetupKind = "detected" | "managed_archive" | "managed_python" | "manual";

export interface SetupCommand {
  tool: ToolId;
  label: string;
  kind: SetupKind;
  command: string;
  args: string[];
  reason: string;
  auto_run: boolean;
  release_asset?: StaticToolReleaseAsset;
}

interface CommandProbe {
  available: boolean;
  command: string;
}

function splitPathList(value: string | undefined): string[] {
  return (value ?? "").split(path.delimiter).map((item) => item.trim()).filter(Boolean);
}

function executableNames(command: string): string[] {
  if (process.platform !== "win32" || path.extname(command)) return [command];
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return [command, ...extensions.flatMap((extension) => [`${command}${extension.toLowerCase()}`, `${command}${extension.toUpperCase()}`])];
}

function resolveCommandPath(command: string): string | null {
  if (path.isAbsolute(command) || path.parse(command).dir) {
    for (const name of executableNames(command)) {
      try {
        if (fs.statSync(name).isFile()) return name;
      } catch {
        // Continue through platform executable suffixes.
      }
    }
    return null;
  }
  for (const dir of splitPathList(buildToolPathEnv())) {
    for (const name of executableNames(command)) {
      const candidate = path.join(dir, name);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Continue searching trusted PATH entries.
      }
    }
  }
  return null;
}

function runCapture(command: string, args: string[], timeout = 30_000): { ok: boolean; output: string } {
  const resolved = resolveCommandPath(command) ?? command;
  const result = spawnSync(resolved, args, {
    encoding: "utf8",
    env: { ...process.env, PATH: buildToolPathEnv() },
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(resolved),
    windowsHide: true,
    timeout
  });
  return {
    ok: result.status === 0 && !result.error,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
  };
}

function probeTool(toolId: ToolId): ReturnType<typeof evaluateStaticToolVersion> & { available: boolean } {
  const policy = STATIC_TOOL_POLICIES[toolId];
  const invocation = resolveStaticToolInvocation(toolId);
  const resolved = resolveCommandPath(invocation.command);
  if (!resolved) {
    return { available: false, detected_version: null, supported: false, pinned: false, reason: `${policy.label} was not found.` };
  }
  const result = runCapture(resolved, [...invocation.prefix_args, ...policy.version_args]);
  if (!result.ok) {
    return { available: false, detected_version: null, supported: false, pinned: false, reason: `${policy.label} version probe failed.` };
  }
  return { available: true, ...evaluateStaticToolVersion(toolId, result.output) };
}

function hasCommand(command: string): boolean {
  const resolved = resolveCommandPath(command);
  return Boolean(resolved && runCapture(resolved, ["--version"], 10_000).ok);
}

function firstAvailable(commands: string[]): CommandProbe | null {
  for (const command of commands) {
    if (hasCommand(command)) return { available: true, command: resolveCommandPath(command) ?? command };
  }
  return null;
}

function selectedTools(value: string | undefined): ToolId[] {
  const defaults: ToolId[] = ["scorecard", "semgrep", "trivy"];
  if (!value) return defaults;
  const allowed = new Set(defaults);
  const selected = value.split(",").map((item) => item.trim().toLowerCase()).filter((item): item is ToolId => allowed.has(item as ToolId));
  return selected.length ? [...new Set(selected)] : defaults;
}

function commandLine(item: SetupCommand): string {
  if (item.kind === "managed_archive" && item.release_asset) {
    return `verified download ${item.release_asset.url} (sha256:${item.release_asset.sha256})`;
  }
  return [item.command, ...item.args].join(" ");
}

function uniqueExistingDirs(values: string[]): string[] {
  return [...new Set(values.map((item) => path.resolve(item)).filter((item) => {
    try {
      return fs.statSync(item).isDirectory();
    } catch {
      return false;
    }
  }))];
}

function discoverToolDirs(): string[] {
  const dirs: string[] = [];
  if (process.platform === "win32") {
    const pythonPackageRoot = path.join(process.env.LOCALAPPDATA ?? "", "Packages");
    if (fs.existsSync(pythonPackageRoot)) {
      for (const entry of fs.readdirSync(pythonPackageRoot)) {
        if (!entry.startsWith("PythonSoftwareFoundation.Python.")) continue;
        const localPackages = path.join(pythonPackageRoot, entry, "LocalCache", "local-packages");
        if (!fs.existsSync(localPackages)) continue;
        dirs.push(path.join(localPackages, "Scripts"));
        for (const versionDir of fs.readdirSync(localPackages)) {
          if (/^Python\d+$/i.test(versionDir)) dirs.push(path.join(localPackages, versionDir, "Scripts"));
        }
      }
    }
    const roamingPythonRoot = path.join(process.env.APPDATA ?? "", "Python");
    dirs.push(path.join(roamingPythonRoot, "Scripts"));
    if (fs.existsSync(roamingPythonRoot)) {
      for (const entry of fs.readdirSync(roamingPythonRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && /^Python\d+$/i.test(entry.name)) dirs.push(path.join(roamingPythonRoot, entry.name, "Scripts"));
      }
    }
  } else {
    dirs.push(path.join(os.homedir(), ".local", "bin"));
  }
  const managedRoot = managedToolsRoot();
  if (fs.existsSync(managedRoot)) {
    for (const entry of fs.readdirSync(managedRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const toolRoot = path.join(managedRoot, entry.name);
        dirs.push(toolRoot, path.join(toolRoot, "Scripts"), path.join(toolRoot, "bin"));
      }
    }
  }
  return uniqueExistingDirs(dirs);
}

function managedToolsRoot(): string {
  return process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Tethermark", "tools")
    : path.join(os.homedir(), ".local", "share", "tethermark", "tools");
}

function upsertEnvValue(contents: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const lines = contents.split(/\r?\n/);
  const index = lines.findIndex((item) => item.trim().startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = line;
    return lines.join(os.EOL);
  }
  const suffix = contents.endsWith("\n") || contents.length === 0 ? "" : os.EOL;
  return `${contents}${suffix}${line}${os.EOL}`;
}

function recordManagedToolPath(installedDirs: string[]): string[] {
  const envPath = path.resolve(process.cwd(), ".env");
  const existingContents = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const existingEnv = existingContents.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("HARNESS_STATIC_TOOLS_PATH="))
    ?.slice("HARNESS_STATIC_TOOLS_PATH=".length)
    .replace(/^["']|["']$/g, "");
  const dirs = uniqueExistingDirs([...installedDirs, ...splitPathList(existingEnv), ...discoverToolDirs()]);
  if (!dirs.length) return [];
  let updatedContents = upsertEnvValue(existingContents, "HARNESS_STATIC_TOOLS_PATH", dirs.join(path.delimiter));
  const semgrepRoot = path.join(managedToolsRoot(), `semgrep-${STATIC_TOOL_POLICIES.semgrep.pinned_version}`);
  const semgrepRunner = path.join(semgrepRoot, "bin", "semgrep_runner.py");
  const configuredPython = process.env.HARNESS_SEMGREP_PYTHON?.trim() ?? process.env.PYTHON_BIN?.trim();
  if (configuredPython && fs.existsSync(configuredPython) && fs.existsSync(semgrepRunner)) {
    updatedContents = upsertEnvValue(updatedContents, "HARNESS_SEMGREP_PYTHON", configuredPython);
    updatedContents = upsertEnvValue(updatedContents, "HARNESS_SEMGREP_RUNNER", semgrepRunner);
    process.env.HARNESS_SEMGREP_PYTHON = configuredPython;
    process.env.HARNESS_SEMGREP_RUNNER = semgrepRunner;
  }
  fs.writeFileSync(envPath, updatedContents, "utf8");
  process.env.HARNESS_STATIC_TOOLS_PATH = dirs.join(path.delimiter);
  return dirs;
}

function detectedPlan(toolId: ToolId, version: string): SetupCommand {
  const policy = STATIC_TOOL_POLICIES[toolId];
  return {
    tool: toolId,
    label: policy.label,
    kind: "detected",
    command: "detected",
    args: [`${policy.command} ${version} matches the production pin.`],
    reason: "No install needed.",
    auto_run: false
  };
}

function managedArchivePlan(toolId: "scorecard" | "trivy", priorReason: string): SetupCommand {
  const policy = STATIC_TOOL_POLICIES[toolId];
  const asset = resolveStaticToolReleaseAsset(toolId);
  if (!asset) {
    return {
      tool: toolId,
      label: policy.label,
      kind: "manual",
      command: "manual",
      args: [`No verified ${process.platform}/${process.arch} release asset is in the production lock.`],
      reason: `${priorReason} Install ${policy.label} ${policy.pinned_version} manually and verify its publisher checksum.`,
      auto_run: false
    };
  }
  return {
    tool: toolId,
    label: policy.label,
    kind: "managed_archive",
    command: "verified-download",
    args: [],
    reason: `${priorReason} The archive is installed in the user Tethermark tools directory, not the repository.`,
    auto_run: true,
    release_asset: asset
  };
}

export function buildSetupToolsPlan(args: { tools?: string } = {}): SetupCommand[] {
  const discovered = discoverToolDirs();
  if (discovered.length) {
    process.env.HARNESS_STATIC_TOOLS_PATH = [...new Set([...discovered, ...splitPathList(process.env.HARNESS_STATIC_TOOLS_PATH)])].join(path.delimiter);
  }
  const tools = selectedTools(args.tools);
  const plan: SetupCommand[] = [];
  const configuredPython = process.env.PYTHON_BIN?.trim();
  const actionsPython = process.env.Python3_ROOT_DIR?.trim();
  const pythonCandidates = process.platform === "win32"
    ? [configuredPython, actionsPython ? path.join(actionsPython, "python.exe") : undefined, "python", "py", "python3"]
    : [configuredPython, "python3", "python"];
  const python = firstAvailable(pythonCandidates.filter((item): item is string => Boolean(item)));

  for (const toolId of tools) {
    const policy = STATIC_TOOL_POLICIES[toolId];
    const probe = probeTool(toolId);
    if (probe.available && probe.pinned && probe.detected_version) {
      plan.push(detectedPlan(toolId, probe.detected_version));
      continue;
    }
    const priorReason = probe.available ? `${probe.reason}` : `${policy.label} is not installed.`;
    if (toolId === "scorecard" || toolId === "trivy") {
      plan.push(managedArchivePlan(toolId, priorReason));
      continue;
    }
    if (python) {
      plan.push({
        tool: "semgrep",
        label: policy.label,
        kind: "managed_python",
        command: python.command,
        args: [],
        reason: `${priorReason} A user-scoped virtual environment isolates the exact Semgrep version from system and project Python packages.`,
        auto_run: true
      });
    } else {
      plan.push({
        tool: "semgrep",
        label: policy.label,
        kind: "manual",
        command: "manual",
        args: [`Install Python 3.10+ and semgrep==${policy.pinned_version}.`],
        reason: `${priorReason} No Python package installer was detected.`,
        auto_run: false
      });
    }
  }
  return plan;
}

export function printSetupToolsPlan(plan: SetupCommand[]): void {
  console.log("Tethermark production static-tool setup plan");
  console.log("Scorecard and Trivy use checksum-verified publisher archives; Semgrep uses an exact PyPI version and bundled offline rules.");
  for (const item of plan) {
    const runnable = item.kind === "detected" ? "ready" : item.auto_run ? "auto" : "manual";
    console.log(`[${runnable}] ${item.label}: ${commandLine(item)}`);
    console.log(`  reason: ${item.reason}`);
  }
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await fsp.readFile(filePath)).digest("hex");
}

async function findFile(root: string, names: Set<string>): Promise<string | null> {
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && names.has(entry.name.toLowerCase())) return candidate;
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, names);
      if (nested) return nested;
    }
  }
  return null;
}

async function downloadFile(url: string, destination: string): Promise<void> {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await fsp.writeFile(destination, Buffer.from(await response.arrayBuffer()));
    return;
  } catch (fetchError) {
    const curl = firstAvailable(["curl"]);
    if (!curl) {
      const detail = fetchError instanceof Error ? `${fetchError.message}${fetchError.cause ? `: ${String(fetchError.cause)}` : ""}` : String(fetchError);
      throw new Error(`download failed and curl is unavailable (${detail})`);
    }
    const result = spawnSync(curl.command, ["--fail", "--location", "--retry", "2", "--connect-timeout", "30", "--max-time", "120", "--output", destination, url], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 180_000
    });
    if (result.status !== 0 || result.error) {
      throw new Error(`download failed: ${result.error?.message ?? result.stderr ?? `curl exit ${result.status}`}`);
    }
  }
}

async function installManagedArchive(item: SetupCommand): Promise<string> {
  const asset = item.release_asset;
  if (!asset) throw new Error(`${item.label} has no release asset.`);
  const policy = STATIC_TOOL_POLICIES[item.tool];
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), `tethermark-${item.tool}-`));
  try {
    const archivePath = path.join(tempRoot, asset.filename);
    const extractRoot = path.join(tempRoot, "extract");
    await fsp.mkdir(extractRoot, { recursive: true });
    await downloadFile(asset.url, archivePath);
    const digest = await sha256File(archivePath);
    if (digest !== asset.sha256) throw new Error(`checksum mismatch: expected ${asset.sha256}, received ${digest}`);
    const extraction = spawnSync("tar", ["-xf", archivePath, "-C", extractRoot], { encoding: "utf8", windowsHide: true, timeout: 120_000 });
    if (extraction.status !== 0 || extraction.error) {
      throw new Error(`archive extraction failed: ${extraction.error?.message ?? extraction.stderr ?? `exit ${extraction.status}`}`);
    }
    const binaryNames = new Set([policy.command.toLowerCase(), `${policy.command}.exe`]);
    const extractedBinary = await findFile(extractRoot, binaryNames);
    if (!extractedBinary) throw new Error(`${policy.command} executable was not present in ${asset.filename}`);
    const installDir = path.join(managedToolsRoot(), `${item.tool}-${policy.pinned_version}`);
    await fsp.mkdir(installDir, { recursive: true });
    const destination = path.join(installDir, process.platform === "win32" ? `${policy.command}.exe` : policy.command);
    await fsp.copyFile(extractedBinary, destination);
    if (process.platform !== "win32") await fsp.chmod(destination, 0o755);
    const version = spawnSync(destination, policy.version_args, { encoding: "utf8", windowsHide: true, timeout: 30_000 });
    const output = `${version.stdout ?? ""}\n${version.stderr ?? ""}`.trim();
    const verification = evaluateStaticToolVersion(item.tool, output);
    if (version.status !== 0 || version.error || !verification.pinned) {
      throw new Error(`installed executable verification failed: ${version.error?.message ?? verification.reason}`);
    }
    return installDir;
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

async function installManagedSemgrep(item: SetupCommand): Promise<string> {
  const policy = STATIC_TOOL_POLICIES.semgrep;
  const installRoot = path.join(managedToolsRoot(), `semgrep-${policy.pinned_version}`);
  const packageRoot = path.join(installRoot, "python-packages");
  const binDir = path.join(installRoot, "bin");
  const binary = path.join(binDir, process.platform === "win32" ? "semgrep.cmd" : "semgrep");
  const runner = path.join(binDir, "semgrep_runner.py");
  const existing = fs.existsSync(binary) ? runCapture(binary, policy.version_args, 120_000) : null;
  if (existing?.ok && evaluateStaticToolVersion("semgrep", existing.output).pinned) return binDir;

  await fsp.rm(packageRoot, { recursive: true, force: true });
  await fsp.mkdir(binDir, { recursive: true });
  const downloadRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "tethermark-semgrep-wheel-"));
  try {
    const download = spawnSync(item.command, ["-m", "pip", "download", "--disable-pip-version-check", "--only-binary=:all:", "--no-deps", "--dest", downloadRoot, `semgrep==${policy.pinned_version}`], {
      stdio: "inherit",
      windowsHide: true,
      timeout: 5 * 60_000
    });
    if (download.status !== 0 || download.error) throw new Error(`Semgrep wheel download failed: ${download.error?.message ?? `exit ${download.status}`}`);
    const wheels = (await fsp.readdir(downloadRoot)).filter((name) => /^semgrep-.+\.whl$/i.test(name));
    if (wheels.length !== 1) throw new Error(`Expected one Semgrep wheel, found ${wheels.length}.`);
    const wheelPath = path.join(downloadRoot, wheels[0]!);
    const wheelDigest = await sha256File(wheelPath);
    if (!policy.package_sha256?.includes(wheelDigest)) throw new Error(`Semgrep wheel checksum is not in the production allowlist: ${wheelDigest}`);
    const install = spawnSync(item.command, ["-m", "pip", "install", "--disable-pip-version-check", "--target", packageRoot, wheelPath], {
      stdio: "inherit",
      windowsHide: true,
      timeout: 10 * 60_000
    });
    if (install.status !== 0 || install.error) throw new Error(`Semgrep isolated install failed: ${install.error?.message ?? `exit ${install.status}`}`);
  } finally {
    await fsp.rm(downloadRoot, { recursive: true, force: true });
  }
  await fsp.writeFile(runner, [
    "import sys",
    "import os",
    "os.environ['SEMGREP_ENABLE_VERSION_CHECK'] = '0'",
    `sys.path.insert(0, ${JSON.stringify(packageRoot)})`,
    "sys.argv.insert(1, '--legacy')",
    "from semgrep.console_scripts.entrypoint import main",
    "main()"
  ].join("\n") + "\n", "utf8");
  if (process.platform === "win32") {
    await fsp.writeFile(binary, [
      "@echo off",
      "set \"SEMGREP_ENABLE_VERSION_CHECK=0\"",
      `"${item.command}" "${runner}" %*`
    ].join("\r\n") + "\r\n", "utf8");
  } else {
    const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
    await fsp.writeFile(binary, `#!/bin/sh\nSEMGREP_ENABLE_VERSION_CHECK=0 exec ${quote(item.command)} ${quote(runner)} \"\$@\"\n`, "utf8");
    await fsp.chmod(binary, 0o755);
  }
  const verification = runCapture(binary, policy.version_args, 120_000);
  const evaluation = evaluateStaticToolVersion("semgrep", verification.output);
  if (!verification.ok || !evaluation.pinned) throw new Error(`Semgrep isolated install verification failed: ${evaluation.reason}`);
  process.env.HARNESS_SEMGREP_PYTHON = item.command;
  process.env.HARNESS_SEMGREP_RUNNER = runner;
  return binDir;
}

export async function runSetupTools(args: { tools?: string; yes?: boolean; dryRun?: boolean } = {}): Promise<void> {
  const plan = buildSetupToolsPlan({ tools: args.tools });
  printSetupToolsPlan(plan);
  const runnable = plan.filter((item) => item.auto_run);
  if (args.dryRun || !args.yes) {
    console.log("");
    console.log("No tools installed. Re-run with --yes to execute auto commands:");
    console.log(`  npm run scan -- setup-tools --yes${args.tools ? ` --tool ${args.tools}` : ""}`);
    return;
  }

  const installedDirs: string[] = [];
  if (!runnable.length) console.log("\nNo auto installs needed.");
  for (const item of runnable) {
    console.log(`+ ${commandLine(item)}`);
    if (item.kind === "managed_archive") {
      const installDir = await installManagedArchive(item);
      installedDirs.push(installDir);
      recordManagedToolPath(installedDirs);
      continue;
    }
    if (item.kind === "managed_python") {
      const installDir = await installManagedSemgrep(item);
      installedDirs.push(installDir);
      recordManagedToolPath(installedDirs);
      continue;
    }
    throw new Error(`${item.label} has an unsupported automatic setup kind: ${item.kind}`);
  }

  const managedDirs = recordManagedToolPath(installedDirs);
  console.log("\nTool setup finished.");
  if (managedDirs.length) console.log(`Recorded HARNESS_STATIC_TOOLS_PATH in .env: ${managedDirs.join(path.delimiter)}`);
  console.log("Run npm run scan -- doctor to verify versions, rules, PATH propagation, and scanner execution.");
}
