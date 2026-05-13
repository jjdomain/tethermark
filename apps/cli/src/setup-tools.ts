import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ToolId = "scorecard" | "semgrep" | "trivy";

interface SetupCommand {
  tool: ToolId;
  label: string;
  command: string;
  args: string[];
  reason: string;
  auto_run: boolean;
}

interface CommandProbe {
  available: boolean;
  command: string;
}

function hasCommand(command: string): boolean {
  if (resolveCommandPath(command)) return true;
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    timeout: 10_000
  });
  return result.status === 0 && !result.error;
}

function resolveCommandPath(command: string): string | null {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];
  const names = process.platform === "win32" && !path.extname(command)
    ? extensions.map((extension) => `${command}${extension.toLowerCase()}`)
    : [command];
  for (const dir of splitPathList(process.env.PATH)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function firstAvailable(commands: string[]): CommandProbe | null {
  for (const command of commands) {
    if (hasCommand(command)) return { available: true, command };
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
  return [item.command, ...item.args].join(" ");
}

function splitPathList(value: string | undefined): string[] {
  return (value ?? "").split(path.delimiter).map((item) => item.trim()).filter(Boolean);
}

function uniqueExistingDirs(values: string[]): string[] {
  return [...new Set(values.map((item) => path.resolve(item)).filter((item) => fs.existsSync(item) && fs.statSync(item).isDirectory()))];
}

function runCapture(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    timeout: 30_000
  });
  if (result.status !== 0 || result.error) return null;
  return (result.stdout ?? "").trim();
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
          if (/^Python\d+$/i.test(versionDir)) {
            dirs.push(path.join(localPackages, versionDir, "Scripts"));
          }
        }
      }
    }
    dirs.push(path.join(process.env.APPDATA ?? "", "Python", "Scripts"));
  } else {
    dirs.push(path.join(os.homedir(), ".local", "bin"));
  }
  dirs.push(path.join(os.homedir(), "go", "bin"));
  if (process.platform === "win32") {
    dirs.push(path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages", "AquaSecurity.Trivy_Microsoft.Winget.Source_8wekyb3d8bbwe"));
  }
  return uniqueExistingDirs(dirs);
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

function recordManagedToolPath(): string[] {
  const envPath = path.resolve(process.cwd(), ".env");
  const existingContents = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const existingEnv = existingContents.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("HARNESS_STATIC_TOOLS_PATH="))
    ?.slice("HARNESS_STATIC_TOOLS_PATH=".length)
    .replace(/^["']|["']$/g, "");
  const dirs = uniqueExistingDirs([...splitPathList(existingEnv), ...discoverToolDirs()]);
  if (!dirs.length) return [];
  fs.writeFileSync(envPath, upsertEnvValue(existingContents, "HARNESS_STATIC_TOOLS_PATH", dirs.join(path.delimiter)), "utf8");
  process.env.HARNESS_STATIC_TOOLS_PATH = dirs.join(path.delimiter);
  process.env.PATH = [...dirs, ...splitPathList(process.env.PATH)].join(path.delimiter);
  return dirs;
}

export function buildSetupToolsPlan(args: { tools?: string } = {}): SetupCommand[] {
  const discoveredDirs = discoverToolDirs();
  if (discoveredDirs.length) {
    process.env.PATH = [...discoveredDirs, ...splitPathList(process.env.PATH)].join(path.delimiter);
  }
  const tools = selectedTools(args.tools);
  const plan: SetupCommand[] = [];
  const winget = firstAvailable(["winget"]);
  const choco = firstAvailable(["choco"]);
  const brew = firstAvailable(["brew"]);
  const pipx = firstAvailable(["pipx"]);
  const python = firstAvailable(["python", "python3"]);
  const go = firstAvailable(["go"]);

  if (tools.includes("scorecard")) {
    if (hasCommand("scorecard")) {
      plan.push({
        tool: "scorecard",
        label: "OpenSSF Scorecard",
        command: "detected",
        args: ["scorecard is already available."],
        reason: "No install needed.",
        auto_run: false
      });
    } else if (process.platform === "win32") {
      plan.push({
        tool: "scorecard",
        label: "OpenSSF Scorecard",
        command: "manual",
        args: ["OpenSSF Scorecard local CLI support is not installed automatically on Windows; Tethermark can use Scorecard API fallback for public GitHub repositories."],
        reason: "Avoid repo-local executable downloads and endpoint-security false positives.",
        auto_run: false
      });
    } else if (go) {
      plan.push({
        tool: "scorecard",
        label: "OpenSSF Scorecard",
        command: go.command,
        args: ["install", "github.com/ossf/scorecard/v5@latest"],
        reason: "OpenSSF publishes Scorecard as a Go CLI; this installs into the user's Go bin path.",
        auto_run: true
      });
    } else {
      plan.push({
        tool: "scorecard",
        label: "OpenSSF Scorecard",
        command: "manual",
        args: ["Install Go or use the official Scorecard release/Docker instructions, then ensure scorecard is on PATH."],
        reason: "No supported package manager was detected for an automatic local Scorecard install.",
        auto_run: false
      });
    }
  }

  if (tools.includes("semgrep")) {
    if (hasCommand("semgrep")) {
      plan.push({
        tool: "semgrep",
        label: "Semgrep",
        command: "detected",
        args: ["semgrep is already available."],
        reason: "No install needed.",
        auto_run: false
      });
    } else if (pipx) {
      plan.push({
        tool: "semgrep",
        label: "Semgrep",
        command: pipx.command,
        args: ["install", "semgrep"],
        reason: "Semgrep recommends pipx for isolated CLI installs.",
        auto_run: true
      });
    } else if (python) {
      plan.push({
        tool: "semgrep",
        label: "Semgrep",
        command: python.command,
        args: ["-m", "pip", "install", "--user", "semgrep"],
        reason: "pipx was not detected; user-site pip install is the fallback.",
        auto_run: true
      });
    } else {
      plan.push({
        tool: "semgrep",
        label: "Semgrep",
        command: "manual",
        args: ["Install pipx or Python, then run pipx install semgrep."],
        reason: "No Python package installer was detected.",
        auto_run: false
      });
    }
  }

  if (tools.includes("trivy")) {
    if (hasCommand("trivy")) {
      plan.push({
        tool: "trivy",
        label: "Trivy",
        command: "detected",
        args: ["trivy is already available."],
        reason: "No install needed.",
        auto_run: false
      });
    } else if (process.platform === "win32" && winget) {
      plan.push({
        tool: "trivy",
        label: "Trivy",
        command: winget.command,
        args: ["install", "--id", "AquaSecurity.Trivy", "-e"],
        reason: "winget is the preferred Windows package-manager path when available.",
        auto_run: true
      });
    } else if (process.platform === "win32" && choco) {
      plan.push({
        tool: "trivy",
        label: "Trivy",
        command: choco.command,
        args: ["install", "trivy", "-y"],
        reason: "Chocolatey is available and can install Trivy without repo-local binaries.",
        auto_run: true
      });
    } else if (brew) {
      plan.push({
        tool: "trivy",
        label: "Trivy",
        command: brew.command,
        args: ["install", "trivy"],
        reason: "Homebrew is available and supported on macOS/Linux.",
        auto_run: true
      });
    } else {
      plan.push({
        tool: "trivy",
        label: "Trivy",
        command: "manual",
        args: ["Install Trivy through Aqua Security's official package instructions, then ensure trivy is on PATH."],
        reason: "No supported package manager was detected for an automatic Trivy install.",
        auto_run: false
      });
    }
  }

  return plan;
}

export function printSetupToolsPlan(plan: SetupCommand[]): void {
  console.log("Tethermark external tool setup plan");
  console.log("These commands avoid repo-local scanner binaries and prefer OS/user package managers.");
  for (const item of plan) {
    const runnable = item.command === "detected" ? "ready" : item.auto_run ? "auto" : "manual";
    console.log(`[${runnable}] ${item.label}: ${commandLine(item)}`);
    console.log(`  reason: ${item.reason}`);
  }
}

export function runSetupTools(args: { tools?: string; yes?: boolean; dryRun?: boolean } = {}): void {
  const plan = buildSetupToolsPlan({ tools: args.tools });
  printSetupToolsPlan(plan);
  const runnable = plan.filter((item) => item.auto_run);
  if (args.dryRun || !args.yes) {
    console.log("");
    console.log("No tools installed. Re-run with --yes to execute auto commands:");
    console.log(`  npm run scan -- setup-tools --yes${args.tools ? ` --tool ${args.tools}` : ""}`);
    return;
  }

  if (!runnable.length) {
    console.log("");
    console.log("No auto installs needed.");
  }
  for (const item of runnable) {
    console.log(`+ ${commandLine(item)}`);
    const result = spawnSync(item.command, item.args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: false,
      timeout: 10 * 60_000
    });
    if (result.status !== 0 || result.error) {
      throw new Error(`${item.label} install failed: ${result.error?.message ?? `exit ${result.status}`}`);
    }
  }

  const managedDirs = recordManagedToolPath();
  console.log("");
  console.log("Tool setup finished.");
  if (managedDirs.length) {
    console.log(`Recorded HARNESS_STATIC_TOOLS_PATH in .env: ${managedDirs.join(path.delimiter)}`);
  }
  console.log("Run npm run scan -- doctor to verify versions.");
}
