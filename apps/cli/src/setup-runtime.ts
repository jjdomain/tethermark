import { spawnSync } from "node:child_process";

import { buildRuntimeSandboxReadiness, buildRuntimeSetupCommands } from "../../../packages/validation-runner/src/index.js";
import { executeRuntimeReadinessFixture, type RuntimeFixtureExecutionResult } from "./runtime-fixtures.js";

export interface RuntimeSetupCommand {
  label: string;
  command: string;
  args: string[];
  reason: string;
  auto_run: boolean;
  post_install?: string[];
}

export interface RuntimeSetupExecutionResult {
  label: string;
  command: string;
  args: string[];
  exit_code: number | null;
  error: string | null;
  stdout: string;
  stderr: string;
}

export interface RuntimeSetupExecutionSummary {
  plan: RuntimeSetupCommand[];
  executed: RuntimeSetupExecutionResult[];
  skipped: RuntimeSetupCommand[];
}

function commandExists(command: string): boolean {
  const probe = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    timeout: 10_000
  });
  return !probe.error && probe.status === 0;
}

export function runtimeSetupCommandLine(item: RuntimeSetupCommand): string {
  if (item.command === "detected" || item.command === "manual") return item.args.join(" ");
  return [item.command, ...item.args].join(" ");
}

function shellCommand(label: string, command: string, args: string[], reason: string, post_install?: string[]): RuntimeSetupCommand {
  return { label, command, args, reason, auto_run: true, post_install };
}

function manualCommand(label: string, text: string, reason: string): RuntimeSetupCommand {
  return { label, command: "manual", args: [text], reason, auto_run: false };
}

function detectedCommand(label: string, text: string): RuntimeSetupCommand {
  return { label, command: "detected", args: [text], reason: "No install needed.", auto_run: false };
}

export function buildRuntimeSetupPlan(): RuntimeSetupCommand[] {
  const plan: RuntimeSetupCommand[] = [];
  const docker = commandExists("docker");
  const podman = commandExists("podman");
  const runsc = commandExists("runsc");
  const winget = commandExists("winget");
  const choco = commandExists("choco");
  const brew = commandExists("brew");
  const aptGet = commandExists("apt-get");
  const dnf = commandExists("dnf");
  const pacman = commandExists("pacman");

  if (docker) plan.push(detectedCommand("Docker", "docker is already available."));
  if (podman) plan.push(detectedCommand("Podman", "podman is already available."));
  if (runsc) plan.push(detectedCommand("gVisor runsc", "runsc is already available."));
  if (docker || podman || runsc) return plan;

  if (process.platform === "win32") {
    if (winget) {
      plan.push(shellCommand(
        "Docker Desktop",
        "winget",
        ["install", "--id", "Docker.DockerDesktop", "-e", "--accept-source-agreements", "--accept-package-agreements"],
        "Docker Desktop is the supported local runtime path on Windows when winget is available.",
        ["Start Docker Desktop after installation completes.", "Run: npm run scan -- runtime-doctor"]
      ));
    } else if (choco) {
      plan.push(shellCommand(
        "Docker Desktop",
        "choco",
        ["install", "docker-desktop", "-y"],
        "Chocolatey can install Docker Desktop when winget is unavailable.",
        ["Start Docker Desktop after installation completes.", "Run: npm run scan -- runtime-doctor"]
      ));
    } else {
      plan.push(manualCommand(
        "Docker Desktop",
        "Install Docker Desktop from https://www.docker.com/products/docker-desktop/, start it, then run npm run scan -- runtime-doctor.",
        "No supported Windows package manager was detected."
      ));
    }
    plan.push(manualCommand(
      "Hardened local runtime",
      "For stronger local isolation, use a Linux worker with rootless Podman or gVisor runsc.",
      "Windows Docker Desktop runs through a shared VM boundary and is treated as ready_with_warnings."
    ));
    return plan;
  }

  if (process.platform === "darwin") {
    if (brew) {
      plan.push(shellCommand(
        "Docker Desktop",
        "brew",
        ["install", "--cask", "docker"],
        "Docker Desktop is the supported local runtime path on macOS when Homebrew is available.",
        ["Open Docker Desktop after installation completes.", "Run: npm run scan -- runtime-doctor"]
      ));
    } else {
      plan.push(manualCommand(
        "Docker Desktop",
        "Install Docker Desktop from https://www.docker.com/products/docker-desktop/, start it, then run npm run scan -- runtime-doctor.",
        "No supported macOS package manager was detected."
      ));
    }
    plan.push(manualCommand(
      "Hardened local runtime",
      "For stronger local isolation, use a Linux worker with rootless Podman or gVisor runsc.",
      "macOS Docker Desktop runs through a shared VM boundary and is treated as ready_with_warnings."
    ));
    return plan;
  }

  if (process.platform === "linux") {
    if (aptGet) {
      plan.push(shellCommand(
        "Rootless Podman",
        "sudo",
        ["apt-get", "install", "-y", "podman", "uidmap", "slirp4netns", "fuse-overlayfs"],
        "Rootless Podman is the preferred OSS local runtime backend on Linux.",
        ["Run: npm run scan -- runtime-doctor"]
      ));
    } else if (dnf) {
      plan.push(shellCommand(
        "Rootless Podman",
        "sudo",
        ["dnf", "install", "-y", "podman", "uidmap", "slirp4netns", "fuse-overlayfs"],
        "Rootless Podman is the preferred OSS local runtime backend on Linux.",
        ["Run: npm run scan -- runtime-doctor"]
      ));
    } else if (pacman) {
      plan.push(shellCommand(
        "Rootless Podman",
        "sudo",
        ["pacman", "-S", "--needed", "podman", "slirp4netns", "fuse-overlayfs"],
        "Rootless Podman is the preferred OSS local runtime backend on Linux.",
        ["Run: npm run scan -- runtime-doctor"]
      ));
    } else if (brew) {
      plan.push(shellCommand(
        "Podman",
        "brew",
        ["install", "podman"],
        "Homebrew can install Podman on Linux when distro package managers are unavailable.",
        ["Run: npm run scan -- runtime-doctor"]
      ));
    } else {
      plan.push(manualCommand(
        "Rootless Podman",
        "Install Podman plus rootless networking support through your distro package manager, then run npm run scan -- runtime-doctor.",
        "No supported Linux package manager was detected."
      ));
    }
    plan.push(manualCommand(
      "gVisor runsc",
      "Optionally install gVisor runsc for the strongest local container boundary, then run npm run scan -- runtime-doctor.",
      "gVisor setup is distro-specific and remains an explicit operator choice."
    ));
    return plan;
  }

  plan.push(manualCommand(
    "Local Runtime Sandbox",
    "Install Docker, Podman, or gVisor for your platform, then run npm run scan -- runtime-doctor.",
    "This platform does not have an automatic runtime setup path."
  ));
  return plan;
}

export function printRuntimeSetupPlan(plan: RuntimeSetupCommand[]): void {
  console.log("Tethermark Local Runtime Sandbox setup plan");
  console.log("These commands use OS/package-manager installers. They are executed only with --yes.");
  for (const item of plan) {
    const runnable = item.command === "detected" ? "ready" : item.auto_run ? "auto" : "manual";
    console.log(`[${runnable}] ${item.label}: ${runtimeSetupCommandLine(item)}`);
    console.log(`  reason: ${item.reason}`);
    if (item.post_install?.length) {
      for (const step of item.post_install) console.log(`  after: ${step}`);
    }
  }
}

export function executeRuntimeSetupPlan(): RuntimeSetupExecutionSummary {
  const plan = buildRuntimeSetupPlan();
  const runnable = plan.filter((item) => item.auto_run);
  const executed: RuntimeSetupExecutionResult[] = [];
  for (const item of runnable) {
    const result = spawnSync(item.command, item.args, {
      encoding: "utf8",
      shell: process.platform === "win32",
      windowsHide: false,
      timeout: 30 * 60_000
    });
    const execution: RuntimeSetupExecutionResult = {
      label: item.label,
      command: item.command,
      args: item.args,
      exit_code: result.status,
      error: result.error?.message ?? null,
      stdout: result.stdout || "",
      stderr: result.stderr || ""
    };
    executed.push(execution);
    if (result.status !== 0 || result.error) {
      throw Object.assign(new Error(`${item.label} setup failed: ${result.error?.message ?? `exit ${result.status}`}`), {
        setup_summary: {
          plan,
          executed,
          skipped: plan.filter((candidate) => !candidate.auto_run)
        } satisfies RuntimeSetupExecutionSummary
      });
    }
  }
  return {
    plan,
    executed,
    skipped: plan.filter((item) => !item.auto_run)
  };
}

export function printRuntimeDoctor(json = false): void {
  const readiness = buildRuntimeSandboxReadiness();
  if (json) {
    console.log(JSON.stringify({ runtime_sandbox: readiness }, null, 2));
    return;
  }
  console.log("Tethermark Local Runtime Sandbox doctor");
  console.log(`Status: ${readiness.resolution.readiness_status}`);
  console.log(`Selected backend: ${readiness.resolution.selected_backend}`);
  for (const candidate of readiness.resolution.candidates) {
    console.log(`- ${candidate.backend_id}: ${candidate.status} - ${candidate.reason}`);
  }
  for (const warning of readiness.resolution.warnings) console.log(`warning: ${warning}`);
  for (const blocker of readiness.resolution.blockers) console.log(`blocker: ${blocker}`);
  if (readiness.resolution.readiness_status === "blocked") {
    console.log("Setup guidance:");
    for (const command of readiness.setup_commands) console.log(`  ${command}`);
  }
}

export function runSetupRuntime(args: { dryRun?: boolean; yes?: boolean } = {}): void {
  const commands = buildRuntimeSetupCommands();
  const plan = buildRuntimeSetupPlan();
  const readiness = buildRuntimeSandboxReadiness();
  console.log("Tethermark Local Runtime Sandbox setup");
  console.log(`Current status: ${readiness.resolution.readiness_status}`);
  console.log(`Selected backend: ${readiness.resolution.selected_backend}`);
  console.log("");
  printRuntimeSetupPlan(plan);
  console.log("");
  console.log("Platform guidance:");
  for (const command of commands) console.log(`- ${command}`);

  if (args.dryRun || !args.yes) {
    console.log("");
    console.log("No runtime dependencies installed. Re-run with --yes to execute auto-supported commands:");
    console.log("  npm run scan -- setup-runtime --yes");
    return;
  }

  if (!plan.some((item) => item.auto_run)) {
    console.log("");
    console.log("No auto-supported runtime installer is available for this environment.");
    console.log("Follow the manual setup guidance above, then run npm run scan -- runtime-doctor.");
    return;
  }

  const summary = executeRuntimeSetupPlan();
  for (const item of summary.executed) {
    console.log(`+ ${[item.command, ...item.args].join(" ")}`);
    console.log(`  exit: ${item.exit_code ?? "error"}`);
  }
  console.log("");
  console.log("Runtime setup command finished. Start the runtime if required, then run npm run scan -- runtime-doctor.");
}

export async function validateRuntimeFixtures(): Promise<{
  passed: boolean;
  backend_launchable: boolean;
  fixture_execution_status: "blocked" | "failed" | "completed";
  status: string;
  selected_backend: string;
  blockers: string[];
  fixture: RuntimeFixtureExecutionResult | null;
}> {
  const readiness = buildRuntimeSandboxReadiness();
  const backendLaunchable = readiness.resolution.readiness_status !== "blocked";
  const blockers = [...readiness.resolution.blockers];
  const fixture = backendLaunchable ? await executeRuntimeReadinessFixture(readiness) : null;
  const fixtureExecutionStatus = !backendLaunchable ? "blocked" : fixture?.passed ? "completed" : "failed";
  if (backendLaunchable && !fixture?.passed) blockers.push(fixture?.error ?? "Runtime fixture execution failed.");
  console.log("Runtime fixture readiness");
  console.log(`Status: ${readiness.resolution.readiness_status}`);
  console.log(`Selected backend: ${readiness.resolution.selected_backend}`);
  for (const blocker of blockers) console.log(`blocker: ${blocker}`);
  if (readiness.resolution.readiness_status === "ready_with_warnings") {
    for (const warning of readiness.resolution.warnings) console.log(`warning: ${warning}`);
  }
  if (!backendLaunchable) {
    console.log("Runtime fixtures were not launched because Local Runtime Sandbox is not ready.");
  } else if (!fixture?.passed) {
    console.log("Runtime backend launch gate passed, but isolated fixture execution failed. Production runtime readiness fails closed.");
  } else {
    console.log(`Runtime fixture execution passed. Evidence: ${fixture.evidence_path ?? "stdout only"}`);
  }
  return {
    passed: fixture?.passed === true,
    backend_launchable: backendLaunchable,
    fixture_execution_status: fixtureExecutionStatus,
    status: readiness.resolution.readiness_status,
    selected_backend: readiness.resolution.selected_backend,
    blockers,
    fixture
  };
}
