import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  inspectPythonWorkerEnvironment,
  isSupportedPythonWorkerVersion,
  parsePythonVersion,
  parsePythonWorkerLock,
  pythonWorkerBootstrapLockPath,
  pythonWorkerLockPath,
  pythonWorkerManifestPath,
  pythonWorkerRoot,
  pythonWorkerVenvExecutable,
  pythonWorkerVenvRoot,
  PYTHON_WORKER_ENVIRONMENT_SCHEMA_VERSION,
  PYTHON_WORKER_PACKAGE_VERSION,
  sha256File,
  type PythonWorkerEnvironmentInspection
} from "../../../packages/core-engine/src/python-worker-environment.js";
import { invokePythonWorker } from "../../../packages/core-engine/src/python-worker.js";

interface PythonCommand {
  command: string;
  prefix_args: string[];
  version: string;
}

export interface PythonWorkerSetupStep {
  label: string;
  command: string;
  args: string[];
}

export interface PythonWorkerSetupPlan {
  supported: boolean;
  reason: string | null;
  base_python: PythonCommand | null;
  worker_root: string;
  lock_path: string;
  bootstrap_lock_path: string;
  lock_sha256: string | null;
  venv_root: string;
  managed_python: string;
  steps: PythonWorkerSetupStep[];
}

function probePython(command: string, prefixArgs: string[] = []): PythonCommand | null {
  const probe = spawnSync(command, [...prefixArgs, "--version"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 10_000
  });
  const parsed = parsePythonVersion(`${probe.stdout || ""}\n${probe.stderr || ""}`.trim());
  return probe.status === 0 && isSupportedPythonWorkerVersion(parsed)
    ? { command, prefix_args: prefixArgs, version: parsed!.raw }
    : null;
}

function resolveBasePython(explicit?: string): PythonCommand | null {
  const configured = explicit?.trim() || process.env.PYTHON_BIN?.trim();
  if (configured) return probePython(configured);
  const candidates: Array<{ command: string; prefix: string[] }> = process.platform === "win32"
    ? [{ command: "python", prefix: [] }, { command: "py", prefix: ["-3"] }]
    : [{ command: "python3", prefix: [] }, { command: "python", prefix: [] }];
  for (const candidate of candidates) {
    const resolved = probePython(candidate.command, candidate.prefix);
    if (resolved) return resolved;
  }
  return null;
}

export function buildPythonWorkerSetupPlan(options: { workspaceRoot?: string; python?: string; venvRoot?: string } = {}): PythonWorkerSetupPlan {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const workerRoot = pythonWorkerRoot(workspaceRoot);
  const lockPath = pythonWorkerLockPath(workspaceRoot);
  const bootstrapLockPath = pythonWorkerBootstrapLockPath(workspaceRoot);
  const venvRoot = path.resolve(options.venvRoot ?? pythonWorkerVenvRoot(workspaceRoot));
  const bootstrapRoot = `${venvRoot}-bootstrap`;
  const managedPython = pythonWorkerVenvExecutable(venvRoot);
  const basePython = resolveBasePython(options.python);
  const lockSha256 = fs.existsSync(lockPath) ? sha256File(lockPath) : null;
  const reason = !basePython
    ? "Python >=3.11 <3.14 was not found. Install a supported Python interpreter or pass --python <executable>."
    : !fs.existsSync(bootstrapLockPath)
      ? `Python worker bootstrap lockfile is missing at ${bootstrapLockPath}.`
    : !lockSha256
      ? `Python worker lockfile is missing at ${lockPath}.`
      : null;
  const steps: PythonWorkerSetupStep[] = reason === null && basePython && lockSha256 ? [
    {
      label: "Stage the hash-locked environment bootstrap",
      command: basePython.command,
      args: [...basePython.prefix_args, "-m", "pip", "install", "--require-hashes", "--only-binary=:all:", "--no-deps", "--upgrade", "--target", bootstrapRoot, "-r", bootstrapLockPath]
    },
    {
      label: "Create managed virtual environment",
      command: basePython.command,
      args: [
        ...basePython.prefix_args,
        "-c",
        "import runpy,sys;sys.path.insert(0,sys.argv.pop(1));runpy.run_module('virtualenv',run_name='__main__')",
        bootstrapRoot,
        "--no-download",
        venvRoot
      ]
    },
    {
      label: "Install hash-locked bootstrap packages",
      command: managedPython,
      args: ["-m", "pip", "install", "--require-hashes", "--only-binary=:all:", "--no-deps", "-r", lockPath]
    },
    {
      label: "Install the local worker package without dependency resolution",
      command: managedPython,
      args: ["-m", "pip", "install", "--no-index", "--no-deps", "--no-build-isolation", "--editable", workerRoot]
    },
    {
      label: "Run the worker import boundary self-check",
      command: managedPython,
      args: ["-m", "audit_workers.cli", "--self-check"]
    }
  ] : [];
  return {
    supported: reason === null,
    reason,
    base_python: basePython,
    worker_root: workerRoot,
    lock_path: lockPath,
    bootstrap_lock_path: bootstrapLockPath,
    lock_sha256: lockSha256,
    venv_root: venvRoot,
    managed_python: managedPython,
    steps
  };
}

function printPlan(plan: PythonWorkerSetupPlan): void {
  console.log("Tethermark Python worker environment setup");
  console.log(`Supported: ${plan.supported}`);
  console.log(`Base Python: ${plan.base_python ? `${plan.base_python.command} ${plan.base_python.version}` : "not found"}`);
  console.log(`Virtual environment: ${plan.venv_root}`);
  console.log(`Lockfile: ${plan.lock_path}${plan.lock_sha256 ? ` (${plan.lock_sha256})` : " (missing)"}`);
  console.log(`Bootstrap lockfile: ${plan.bootstrap_lock_path}`);
  if (plan.reason) console.log(`blocker: ${plan.reason}`);
  for (const step of plan.steps) console.log(`- ${step.label}: ${[step.command, ...step.args].join(" ")}`);
}

function runStep(step: PythonWorkerSetupStep, workspaceRoot: string): void {
  const result = spawnSync(step.command, step.args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 10 * 60_000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: "1",
      PIP_DISABLE_PIP_VERSION_CHECK: "1"
    }
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`${step.label} failed: ${result.error?.message ?? (result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
  }
}

export function runSetupWorkers(options: { dryRun?: boolean; yes?: boolean; python?: string; venvRoot?: string } = {}): PythonWorkerEnvironmentInspection | null {
  const workspaceRoot = process.cwd();
  const plan = buildPythonWorkerSetupPlan({ workspaceRoot, python: options.python, venvRoot: options.venvRoot });
  printPlan(plan);
  if (!plan.supported) {
    if (options.yes) throw new Error(plan.reason ?? "Python worker setup is not supported in this environment.");
    return null;
  }
  if (options.dryRun || !options.yes) {
    console.log("No changes made. Re-run with --yes after reviewing the commands.");
    return null;
  }

  for (const step of plan.steps) {
    console.log(`Running: ${step.label}`);
    runStep(step, workspaceRoot);
  }

  const packageList = spawnSync(plan.managed_python, ["-m", "pip", "list", "--format", "json", "--disable-pip-version-check"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: "1" }
  });
  if (packageList.status !== 0 || packageList.error) throw new Error("Could not inventory the managed Python worker environment.");
  const installed = JSON.parse(packageList.stdout || "[]") as Array<{ name: string; version: string }>;
  const installedPackages = Object.fromEntries(installed.map((item) => [item.name.toLowerCase().replaceAll("_", "-"), item.version]));
  const expectedPackages = parsePythonWorkerLock(fs.readFileSync(plan.lock_path, "utf8"));
  for (const name of ["inspect-ai", "pip", "setuptools", "virtualenv", "wheel"]) {
    const version = expectedPackages[name];
    if (!version || installedPackages[name] !== version) throw new Error(`Locked Python package mismatch for ${name}: expected ${version ?? "a pinned version"}, found ${installedPackages[name] ?? "missing"}.`);
  }
  const versionProbe = spawnSync(plan.managed_python, ["--version"], { encoding: "utf8", shell: false, windowsHide: true, timeout: 10_000 });
  const version = parsePythonVersion(`${versionProbe.stdout || ""}\n${versionProbe.stderr || ""}`.trim());
  if (!isSupportedPythonWorkerVersion(version)) throw new Error("Managed Python worker interpreter failed the supported-version check.");
  fs.writeFileSync(pythonWorkerManifestPath(plan.venv_root), `${JSON.stringify({
    schema_version: PYTHON_WORKER_ENVIRONMENT_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    worker_package_version: PYTHON_WORKER_PACKAGE_VERSION,
    python_version: version!.raw,
    lock_sha256: plan.lock_sha256,
    installed_packages: installedPackages
  }, null, 2)}\n`, "utf8");

  const inspection = inspectPythonWorkerEnvironment(workspaceRoot, { venvRoot: plan.venv_root });
  if (!inspection.ready) throw new Error(`Python worker environment did not pass doctor: ${inspection.summary}`);
  console.log(inspection.summary);
  return inspection;
}

export function printWorkerDoctor(json = false): PythonWorkerEnvironmentInspection {
  const inspection = inspectPythonWorkerEnvironment();
  if (json) console.log(JSON.stringify({ python_worker_environment: inspection }, null, 2));
  else {
    console.log("Tethermark Python worker doctor");
    console.log(`Status: ${inspection.ready ? "ready" : "blocked"}`);
    console.log(inspection.summary);
    if (!inspection.ready) console.log("fix: npm run scan -- setup-workers --dry-run");
  }
  return inspection;
}

export function runWorkerTests(): boolean {
  const workspaceRoot = process.cwd();
  const inspection = inspectPythonWorkerEnvironment(workspaceRoot);
  if (!inspection.ready) throw new Error(`Python worker tests require a ready managed environment: ${inspection.summary}`);
  const result = spawnSync(inspection.python_executable, ["-m", "unittest", "discover", "-s", "workers/python/tests", "-v"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 2 * 60_000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0 && !result.error;
}

export async function runWorkerSmoke(): Promise<boolean> {
  const inspection = inspectPythonWorkerEnvironment();
  if (!inspection.ready) throw new Error(`Python worker smoke requires a ready managed environment: ${inspection.summary}`);
  const server = http.createServer((request, response) => {
    response.statusCode = request.method === "HEAD" ? 204 : 200;
    response.setHeader("Content-Type", "application/json");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(request.method === "HEAD" ? undefined : JSON.stringify({ status: "ok" }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Worker smoke server did not expose a TCP port.");
    const result = await invokePythonWorker("inspect", {
      endpoint_url: `http://127.0.0.1:${address.port}/agent`,
      run_mode: "runtime",
      llm_provider: "mock",
      hints: { inspect_eval_pack: "http-baseline" }
    }, process.cwd());
    const output = result.output as any;
    const passed = result.status === "completed"
      && output?.schema_version === "2026-08-24.inspect-worker.v1"
      && output?.status === "completed"
      && output?.coverage?.status === "complete"
      && output?.execution?.inspect_log_status === "success"
      && Array.isArray(output?.observations)
      && output.observations.length === 2;
    console.log(JSON.stringify({
      inspect_worker_smoke: {
        passed,
        worker_status: result.status,
        adapter_status: output?.status ?? null,
        coverage: output?.coverage ?? null,
        inspect_log_status: output?.execution?.inspect_log_status ?? null
      }
    }, null, 2));
    return passed;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
