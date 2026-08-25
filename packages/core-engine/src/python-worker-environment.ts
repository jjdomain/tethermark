import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const PYTHON_WORKER_ENVIRONMENT_SCHEMA_VERSION = 1;
export const PYTHON_WORKER_MIN_VERSION = { major: 3, minor: 11 } as const;
export const PYTHON_WORKER_MAX_VERSION_EXCLUSIVE = { major: 3, minor: 14 } as const;
export const PYTHON_WORKER_PACKAGE_VERSION = "0.2.0";
export const PYTHON_WORKER_INSPECT_VERSION = "0.3.260";

export interface PythonVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

export interface PythonWorkerEnvironmentManifest {
  schema_version: 1;
  created_at: string;
  worker_package_version: string;
  python_version: string;
  lock_sha256: string;
  installed_packages: Record<string, string>;
}

export interface PythonWorkerEnvironmentInspection {
  ready: boolean;
  status: "available" | "unavailable";
  summary: string;
  worker_root: string;
  lock_path: string;
  lock_sha256: string | null;
  venv_root: string;
  python_executable: string;
  python_version: PythonVersion | null;
  manifest: PythonWorkerEnvironmentManifest | null;
  lock_current: boolean;
  packages_current: boolean;
  self_check: Record<string, unknown> | null;
  errors: string[];
}

export function pythonWorkerRoot(workspaceRoot = process.cwd()): string {
  return path.resolve(workspaceRoot, "workers", "python");
}

export function pythonWorkerLockPath(workspaceRoot = process.cwd()): string {
  return path.join(pythonWorkerRoot(workspaceRoot), "requirements.lock");
}

export function pythonWorkerBootstrapLockPath(workspaceRoot = process.cwd()): string {
  return path.join(pythonWorkerRoot(workspaceRoot), "requirements-bootstrap.lock");
}

export function pythonWorkerVenvRoot(workspaceRoot = process.cwd()): string {
  const configured = process.env.HARNESS_PYTHON_WORKER_VENV?.trim();
  return path.resolve(configured || path.join(workspaceRoot, ".tethermark", "python-worker"));
}

export function pythonWorkerVenvExecutable(venvRoot: string): string {
  return process.platform === "win32"
    ? path.join(venvRoot, "Scripts", "python.exe")
    : path.join(venvRoot, "bin", "python");
}

export function pythonWorkerManifestPath(venvRoot: string): string {
  return path.join(venvRoot, "tethermark-worker-environment.json");
}

export function resolvePythonWorkerExecutable(workspaceRoot = process.cwd()): string {
  const managed = pythonWorkerVenvExecutable(pythonWorkerVenvRoot(workspaceRoot));
  if (fs.existsSync(managed)) return managed;
  const explicit = process.env.PYTHON_BIN?.trim();
  return explicit || "python";
}

export function parsePythonVersion(value: string): PythonVersion | null {
  const match = value.trim().match(/^(?:Python\s+)?(\d+)\.(\d+)\.(\d+)(?:\D.*)?$/i);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: `${match[1]}.${match[2]}.${match[3]}`
  };
}

export function isSupportedPythonWorkerVersion(version: PythonVersion | null): boolean {
  if (!version) return false;
  const atLeastMinimum = version.major > PYTHON_WORKER_MIN_VERSION.major
    || version.major === PYTHON_WORKER_MIN_VERSION.major && version.minor >= PYTHON_WORKER_MIN_VERSION.minor;
  const belowMaximum = version.major < PYTHON_WORKER_MAX_VERSION_EXCLUSIVE.major
    || version.major === PYTHON_WORKER_MAX_VERSION_EXCLUSIVE.major && version.minor < PYTHON_WORKER_MAX_VERSION_EXCLUSIVE.minor;
  return atLeastMinimum && belowMaximum;
}

export function parsePythonWorkerLock(value: string): Record<string, string> {
  const packages: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z0-9_.-]+)==([^\s;\\]+)(?:\s*;[^\\]+)?(?:\s*\\)?$/);
    if (match) packages[match[1].toLowerCase().replaceAll("_", "-")] = match[2];
  }
  return packages;
}

export function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function packageInventoriesMatch(left: Record<string, string>, right: Record<string, string>): boolean {
  const normalize = (value: Record<string, string>) => Object.entries(value)
    .map(([name, version]) => [name.toLowerCase().replaceAll("_", "-"), version] as const)
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function runPython(executable: string, args: string[], workspaceRoot: string) {
  return spawnSync(executable, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      PYTHONPATH: path.join(pythonWorkerRoot(workspaceRoot), "src"),
      PYTHONDONTWRITEBYTECODE: "1",
      PIP_DISABLE_PIP_VERSION_CHECK: "1"
    }
  });
}

export function inspectPythonWorkerEnvironment(workspaceRoot = process.cwd(), options: { venvRoot?: string } = {}): PythonWorkerEnvironmentInspection {
  const workerRoot = pythonWorkerRoot(workspaceRoot);
  const lockPath = pythonWorkerLockPath(workspaceRoot);
  const venvRoot = path.resolve(options.venvRoot ?? pythonWorkerVenvRoot(workspaceRoot));
  const pythonExecutable = pythonWorkerVenvExecutable(venvRoot);
  const manifestPath = pythonWorkerManifestPath(venvRoot);
  const errors: string[] = [];
  const lockSha256 = fs.existsSync(lockPath) ? sha256File(lockPath) : null;
  if (!lockSha256) errors.push("Python worker lockfile is missing.");
  if (!fs.existsSync(pythonExecutable)) errors.push("Managed Python worker virtual environment is not installed.");

  let manifest: PythonWorkerEnvironmentManifest | null = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PythonWorkerEnvironmentManifest;
    } catch (error) {
      errors.push(`Python worker environment manifest is malformed (${error instanceof Error ? error.message : String(error)}).`);
    }
  } else {
    errors.push("Python worker environment manifest is missing.");
  }

  let pythonVersion: PythonVersion | null = null;
  let selfCheck: Record<string, unknown> | null = null;
  let installedPackages: Record<string, string> = {};
  let dependencyCheckPassed = false;
  if (fs.existsSync(pythonExecutable)) {
    const versionProbe = runPython(pythonExecutable, ["--version"], workspaceRoot);
    pythonVersion = parsePythonVersion(`${versionProbe.stdout || ""}\n${versionProbe.stderr || ""}`.trim());
    if (versionProbe.status !== 0 || !isSupportedPythonWorkerVersion(pythonVersion)) {
      errors.push(`Managed Python version is unsupported (${pythonVersion?.raw ?? versionProbe.error?.message ?? "unknown"}); expected >=3.11 <3.14.`);
    }

    const packageProbe = runPython(pythonExecutable, ["-m", "pip", "list", "--format", "json", "--disable-pip-version-check"], workspaceRoot);
    if (packageProbe.status === 0) {
      try {
        const rows = JSON.parse(packageProbe.stdout || "[]") as Array<{ name?: string; version?: string }>;
        installedPackages = Object.fromEntries(rows
          .filter((item) => item.name && item.version)
          .map((item) => [String(item.name).toLowerCase().replaceAll("_", "-"), String(item.version)]));
      } catch {
        errors.push("Managed Python package inventory was not valid JSON.");
      }
    } else {
      errors.push(`Managed Python package inventory failed (${packageProbe.error?.message ?? packageProbe.stderr ?? `exit ${packageProbe.status}`}).`);
    }

    const dependencyProbe = runPython(pythonExecutable, ["-m", "pip", "check"], workspaceRoot);
    dependencyCheckPassed = dependencyProbe.status === 0;
    if (!dependencyCheckPassed) {
      errors.push(`Managed Python dependency check failed (${dependencyProbe.error?.message ?? dependencyProbe.stdout ?? dependencyProbe.stderr ?? `exit ${dependencyProbe.status}`}).`);
    }

    const selfCheckProbe = runPython(pythonExecutable, ["-m", "audit_workers.cli", "--self-check"], workspaceRoot);
    if (selfCheckProbe.status === 0) {
      try {
        selfCheck = JSON.parse(selfCheckProbe.stdout) as Record<string, unknown>;
      } catch {
        errors.push("Python worker self-check returned malformed JSON.");
      }
    } else {
      errors.push(`Python worker self-check failed (${selfCheckProbe.error?.message ?? selfCheckProbe.stderr ?? `exit ${selfCheckProbe.status}`}).`);
    }
  }

  const expectedPackages = fs.existsSync(lockPath) ? parsePythonWorkerLock(fs.readFileSync(lockPath, "utf8")) : {};
  const requiredVersions = {
    "audit-workers": PYTHON_WORKER_PACKAGE_VERSION,
    "inspect-ai": PYTHON_WORKER_INSPECT_VERSION,
    pip: expectedPackages.pip,
    setuptools: expectedPackages.setuptools,
    virtualenv: expectedPackages.virtualenv,
    wheel: expectedPackages.wheel
  };
  const requiredPackagesCurrent = Object.entries(requiredVersions)
    .every(([name, version]) => Boolean(version) && installedPackages[name] === version);
  const manifestInventoryCurrent = Boolean(manifest && packageInventoriesMatch(manifest.installed_packages ?? {}, installedPackages));
  const packagesCurrent = fs.existsSync(pythonExecutable)
    && Object.keys(expectedPackages).length > 0
    && requiredPackagesCurrent
    && manifestInventoryCurrent
    && dependencyCheckPassed;
  if (fs.existsSync(pythonExecutable) && !requiredPackagesCurrent) errors.push("Managed Python worker package versions do not match the pinned environment contract.");
  const lockCurrent = Boolean(lockSha256 && manifest?.lock_sha256 === lockSha256);
  if (manifest && !lockCurrent) errors.push("Managed Python environment was created from a different worker lockfile.");
  if (manifest && manifest.schema_version !== PYTHON_WORKER_ENVIRONMENT_SCHEMA_VERSION) {
    errors.push(`Managed worker environment schema is ${manifest.schema_version}; expected ${PYTHON_WORKER_ENVIRONMENT_SCHEMA_VERSION}.`);
  }
  if (manifest && manifest.worker_package_version !== PYTHON_WORKER_PACKAGE_VERSION) {
    errors.push(`Managed worker package version is ${manifest?.worker_package_version ?? "unknown"}; expected ${PYTHON_WORKER_PACKAGE_VERSION}.`);
  }
  if (manifest && pythonVersion && manifest.python_version !== pythonVersion.raw) {
    errors.push(`Managed worker manifest records Python ${manifest.python_version}; interpreter reports ${pythonVersion.raw}.`);
  }
  if (manifest && !manifestInventoryCurrent) {
    errors.push("Managed Python package inventory has drifted from its environment manifest.");
  }
  if (fs.existsSync(pythonExecutable) && selfCheck?.["worker_package_version"] !== PYTHON_WORKER_PACKAGE_VERSION) {
    errors.push("Python worker self-check did not report the expected worker package version.");
  }
  const adapterStatuses = selfCheck?.["adapter_statuses"] as Record<string, unknown> | undefined;
  if (fs.existsSync(pythonExecutable) && (
    adapterStatuses?.inspect !== "executable"
    || adapterStatuses?.garak !== "scaffold"
    || adapterStatuses?.pyrit !== "scaffold"
  )) {
    errors.push("Python worker self-check did not report the expected executable/scaffold adapter boundary.");
  }
  if (fs.existsSync(pythonExecutable) && selfCheck?.["inspect_ai_version"] !== PYTHON_WORKER_INSPECT_VERSION) {
    errors.push(`Inspect AI version does not match the pinned ${PYTHON_WORKER_INSPECT_VERSION} adapter contract.`);
  }

  return {
    ready: errors.length === 0,
    status: errors.length === 0 ? "available" : "unavailable",
    summary: errors.length === 0
      ? `Managed Python worker environment is ready (${pythonVersion?.raw}; lock ${lockSha256?.slice(0, 12)}). Inspect ${PYTHON_WORKER_INSPECT_VERSION} is executable; Garak and PyRIT remain scaffolds.`
      : errors.join(" "),
    worker_root: workerRoot,
    lock_path: lockPath,
    lock_sha256: lockSha256,
    venv_root: venvRoot,
    python_executable: pythonExecutable,
    python_version: pythonVersion,
    manifest,
    lock_current: lockCurrent,
    packages_current: packagesCurrent,
    self_check: selfCheck,
    errors
  };
}
