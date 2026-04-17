import fs from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import type { AuditRequest, ContainerWorkspaceContract, SandboxExecutionPlan, SandboxExecutionResult, SandboxExecutionStep, SandboxSession } from "../../contracts.js";
import { createId } from "../../utils.js";
import { buildSourceProvenance, cloneRepo, collectStorageUsage, inferGitRepoUrl, mirrorDirectory } from "./shared.js";

const execFileAsync = promisify(execFile);
const EXECUTION_OUTPUT_LIMIT = 2_000;
const RUNTIME_PROBE_WARMUP_MS = 1_500;
const DEFAULT_RUNTIME_PROBE_PATHS = ["/", "/health", "/healthz"];

type RuntimeProbeAttempt = {
  port: number;
  path: string;
  status_code: number | null;
  response_excerpt: string | null;
  error: string | null;
};

type RuntimeProbeResult = {
  ok: boolean;
  successful_target: string | null;
  status_code: number | null;
  response_excerpt: string | null;
  error: string | null;
  attempts: RuntimeProbeAttempt[];
};

function truncateOutput(value: string | Buffer | null | undefined): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > EXECUTION_OUTPUT_LIMIT ? `${text.slice(0, EXECUTION_OUTPUT_LIMIT)}…` : text;
}

function isHostSandboxExecutionEnabled(): boolean {
  return process.env.HARNESS_ENABLE_HOST_SANDBOX_EXECUTION === "1";
}

function getStepTimeoutMs(phase: SandboxExecutionStep["phase"]): number {
  const configured = Number(process.env.HARNESS_SANDBOX_STEP_TIMEOUT_MS ?? "");
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  switch (phase) {
    case "runtime_probe":
      return 10_000;
    case "install":
      return 120_000;
    case "build":
    case "test":
    default:
      return 60_000;
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("which", [command], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function detectContainerRuntime(): Promise<ContainerWorkspaceContract["runtime"]> {
  if (await commandExists("docker")) {
    return "docker";
  }
  if (await commandExists("podman")) {
    return "podman";
  }
  return "unconfigured";
}

async function commandExistsOnHost(command: string): Promise<boolean> {
  if (!command) return false;
  try {
    await execFileAsync(command, ["--version"], { maxBuffer: 1024 * 1024 });
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") return false;
    return true;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function appendOutput(current: string, chunk: string | Buffer | null | undefined): string | null {
  return truncateOutput(`${current}\n${String(chunk ?? "")}`);
}

async function detectPythonEntrypoint(targetDir: string): Promise<string | null> {
  const candidates = [
    "app.py",
    "main.py",
    "server.py",
    "src/app.py",
    "src/main.py",
    "service.py"
  ];
  for (const candidate of candidates) {
    if (await fileExists(path.join(targetDir, candidate))) {
      return candidate;
    }
  }
  return null;
}

function detectRuntimeProbePort(command: string[]): number | null {
  const joined = command.join(" ");
  const envMatch = joined.match(/\bPORT=(\d{2,5})\b/);
  if (envMatch) return Number(envMatch[1]);
  const flagMatch = joined.match(/(?:--port|-p)\s+(\d{2,5})/);
  if (flagMatch) return Number(flagMatch[1]);
  return null;
}

function detectRuntimeProbePorts(step: SandboxExecutionStep): number[] {
  const configured = Array.isArray(step.artifact_context?.probe_ports)
    ? step.artifact_context.probe_ports
    : typeof step.artifact_context?.probe_port === "number"
      ? [step.artifact_context.probe_port]
      : [];
  const detected = detectRuntimeProbePort(step.command);
  const defaults = step.artifact_context?.stack === "python" ? [8000, 5000, 3000] : [3000];
  const ports = [...configured, ...(detected != null ? [detected] : []), ...defaults]
    .filter((value): value is number => Number.isFinite(value) && Number(value) > 0)
    .map((value) => Number(value));
  return [...new Set(ports)];
}

function detectRuntimeProbePaths(step: SandboxExecutionStep): string[] {
  const configured = Array.isArray(step.artifact_context?.probe_paths)
    ? step.artifact_context.probe_paths.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  return [...new Set([...(configured.length ? configured : []), ...DEFAULT_RUNTIME_PROBE_PATHS])];
}

async function probeHttpService(ports: number[], paths: string[], timeoutMs: number): Promise<RuntimeProbeResult> {
  const attempts: RuntimeProbeAttempt[] = [];
  for (const port of ports) {
    for (const probePath of paths) {
      const url = new URL(`http://127.0.0.1:${port}${probePath}`);
      const attempt = await new Promise<RuntimeProbeAttempt>((resolve) => {
        const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
        const req = requester(url, { method: "GET", timeout: timeoutMs }, (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            resolve({
              port,
              path: probePath,
              status_code: res.statusCode ?? null,
              response_excerpt: truncateOutput(body),
              error: null
            });
          });
        });
        req.on("timeout", () => {
          req.destroy(new Error("probe timeout"));
        });
        req.on("error", (error) => {
          resolve({
            port,
            path: probePath,
            status_code: null,
            response_excerpt: null,
            error: String(error?.message ?? error)
          });
        });
        req.end();
      });
      attempts.push(attempt);
      if ((attempt.status_code ?? 500) < 500) {
        return {
          ok: true,
          successful_target: `http://127.0.0.1:${attempt.port}${attempt.path}`,
          status_code: attempt.status_code,
          response_excerpt: attempt.response_excerpt,
          error: null,
          attempts
        };
      }
    }
  }
  const lastAttempt = attempts.at(-1) ?? null;
  return {
    ok: false,
    successful_target: null,
    status_code: lastAttempt?.status_code ?? null,
    response_excerpt: lastAttempt?.response_excerpt ?? null,
    error: lastAttempt?.error ?? "no successful runtime probe response",
    attempts
  };
}

function buildNormalizedArtifact(step: SandboxExecutionStep, result: {
  status: SandboxExecutionResult["status"];
  summary: string;
  exitCode?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  runtimeProbe?: RuntimeProbeResult | null;
}): NonNullable<SandboxExecutionResult["normalized_artifact"]> {
  const detailsJson: Record<string, unknown> = {
    adapter: step.adapter,
    command: step.command,
    exit_code: result.exitCode ?? null,
    ...(step.artifact_context || {})
  };
  if (result.stdout) detailsJson.stdout_excerpt = result.stdout;
  if (result.stderr) detailsJson.stderr_excerpt = result.stderr;
  if (result.runtimeProbe) {
    detailsJson.probe = {
      ok: result.runtimeProbe.ok,
      attempted_targets: result.runtimeProbe.attempts.map((attempt) => `http://127.0.0.1:${attempt.port}${attempt.path}`),
      successful_target: result.runtimeProbe.successful_target,
      status_code: result.runtimeProbe.status_code,
      response_excerpt: result.runtimeProbe.response_excerpt,
      error: result.runtimeProbe.error,
      attempts: result.runtimeProbe.attempts
    };
  }
  return {
    type: step.phase,
    title: step.expected_artifact || `${step.phase} result`,
    summary: result.summary,
    details_json: detailsJson
  };
}

async function buildExecutionPlan(targetDir: string, runMode: NonNullable<AuditRequest["run_mode"]>): Promise<SandboxExecutionPlan> {
  const packageJson = await readJsonFile(path.join(targetDir, "package.json"));
  const hasPackageLock = await fileExists(path.join(targetDir, "package-lock.json"));
  const hasPnpmLock = await fileExists(path.join(targetDir, "pnpm-lock.yaml"));
  const hasYarnLock = await fileExists(path.join(targetDir, "yarn.lock"));
  const hasPyproject = await fileExists(path.join(targetDir, "pyproject.toml"));
  const hasRequirements = await fileExists(path.join(targetDir, "requirements.txt"));
  const hasDockerfile = await fileExists(path.join(targetDir, "Dockerfile"));
  const hasCompose = await fileExists(path.join(targetDir, "docker-compose.yml")) || await fileExists(path.join(targetDir, "docker-compose.yaml")) || await fileExists(path.join(targetDir, "compose.yaml"));
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
  const steps: SandboxExecutionStep[] = [];
  const detectedStack = new Set<string>();
  const entrySignals: string[] = [];
  const warnings: string[] = [];
  const nodePackageManager = hasPnpmLock ? "pnpm" : hasYarnLock ? "yarn" : "npm";

  if (packageJson) {
    detectedStack.add("node");
    if (hasPnpmLock) detectedStack.add("pnpm");
    else if (hasYarnLock) detectedStack.add("yarn");
    else if (hasPackageLock) detectedStack.add("npm");

    if (hasPnpmLock) {
      steps.push({
        step_id: "install-pnpm",
        phase: "install",
        adapter: "node_npm",
        command: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
        rationale: "Pinned pnpm dependencies can be installed reproducibly without lifecycle scripts.",
        requires_network: true,
        enabled: true,
        expected_artifact: "node-install",
        artifact_context: {
          stack: "node",
          package_manager: "pnpm",
          lockfile: "pnpm-lock.yaml",
          artifact_role: "dependency_install"
        }
      });
    } else if (hasYarnLock) {
      steps.push({
        step_id: "install-yarn",
        phase: "install",
        adapter: "node_npm",
        command: ["yarn", "install", "--frozen-lockfile", "--ignore-scripts"],
        rationale: "Pinned yarn dependencies can be installed reproducibly without lifecycle scripts.",
        requires_network: true,
        enabled: true,
        expected_artifact: "node-install",
        artifact_context: {
          stack: "node",
          package_manager: "yarn",
          lockfile: "yarn.lock",
          artifact_role: "dependency_install"
        }
      });
    } else {
      steps.push({
        step_id: "install-npm",
        phase: "install",
        adapter: "node_npm",
        command: ["npm", "ci", "--ignore-scripts"],
        rationale: hasPackageLock
          ? "npm lockfile present, so a bounded clean install is available."
          : "Fallback npm install path is available, but reproducibility may be weaker without a lockfile.",
        requires_network: true,
        enabled: true,
        expected_artifact: "node-install",
        artifact_context: {
          stack: "node",
          package_manager: "npm",
          lockfile: hasPackageLock ? "package-lock.json" : null,
          artifact_role: "dependency_install"
        }
      });
      if (!hasPackageLock) warnings.push("Node project has no package-lock.json; runtime install reproducibility is reduced.");
    }

    if (typeof scripts.build === "string" && scripts.build.trim()) {
      steps.push({
        step_id: "build-node",
        phase: "build",
        adapter: "node_npm",
        command: hasPnpmLock ? ["pnpm", "run", "build"] : hasYarnLock ? ["yarn", "build"] : ["npm", "run", "build"],
        rationale: "package.json defines a build script.",
        requires_network: false,
        enabled: true,
        expected_artifact: "node-build",
        artifact_context: {
          stack: "node",
          package_manager: nodePackageManager,
          script_name: "build",
          artifact_role: "build_output"
        }
      });
      entrySignals.push("package.json:scripts.build");
    }
    if (typeof scripts.test === "string" && scripts.test.trim()) {
      steps.push({
        step_id: "test-node",
        phase: "test",
        adapter: "node_npm",
        command: hasPnpmLock ? ["pnpm", "run", "test", "--", "--runInBand"] : hasYarnLock ? ["yarn", "test", "--runInBand"] : ["npm", "run", "test", "--", "--runInBand"],
        rationale: "package.json defines a test script suitable for bounded execution.",
        requires_network: false,
        enabled: true,
        expected_artifact: "node-test",
        artifact_context: {
          stack: "node",
          package_manager: nodePackageManager,
          script_name: "test",
          artifact_role: "test_report"
        }
      });
      entrySignals.push("package.json:scripts.test");
    }
    const runtimeScript = typeof scripts.start === "string" && scripts.start.trim()
      ? "start"
      : typeof scripts.dev === "string" && scripts.dev.trim()
        ? "dev"
        : null;
    if (runtimeScript) {
      steps.push({
        step_id: "runtime-node",
        phase: "runtime_probe",
        adapter: "http_service",
        command: hasPnpmLock ? ["pnpm", "run", runtimeScript] : hasYarnLock ? ["yarn", runtimeScript] : ["npm", "run", runtimeScript],
        rationale: `package.json defines a ${runtimeScript} script for bounded runtime probing.`,
        requires_network: runMode === "runtime",
        enabled: runMode !== "build",
        expected_artifact: "http-runtime-probe",
        artifact_context: {
          stack: "node",
          package_manager: nodePackageManager,
          script_name: runtimeScript,
          artifact_role: "service_probe",
          probe_paths: DEFAULT_RUNTIME_PROBE_PATHS,
          probe_ports: [detectRuntimeProbePort(hasPnpmLock ? ["pnpm", "run", runtimeScript] : hasYarnLock ? ["yarn", runtimeScript] : ["npm", "run", runtimeScript]) ?? 3000]
        }
      });
      entrySignals.push(`package.json:scripts.${runtimeScript}`);
    }
  }

  if (hasPyproject || hasRequirements) {
    detectedStack.add("python");
    steps.push({
      step_id: "install-python",
      phase: "install",
      adapter: "python_pytest",
      command: hasPyproject ? ["python", "-m", "pip", "install", "-e", "."] : ["python", "-m", "pip", "install", "-r", "requirements.txt"],
      rationale: hasPyproject ? "Python project metadata detected via pyproject.toml." : "requirements.txt detected for bounded dependency installation.",
      requires_network: true,
      enabled: true,
      expected_artifact: "python-install",
      artifact_context: {
        stack: "python",
        install_source: hasPyproject ? "pyproject.toml" : "requirements.txt",
        artifact_role: "dependency_install"
      }
    });
    if (await fileExists(path.join(targetDir, "pytest.ini")) || await fileExists(path.join(targetDir, "tests"))) {
      steps.push({
        step_id: "test-python",
        phase: "test",
        adapter: "python_pytest",
        command: ["python", "-m", "pytest", "-q"],
        rationale: "Pytest configuration or tests directory detected.",
        requires_network: false,
        enabled: true,
        expected_artifact: "python-test",
        artifact_context: {
          stack: "python",
          test_runner: "pytest",
          artifact_role: "test_report"
        }
      });
      entrySignals.push("pytest");
    }
    const pythonEntrypoint = await detectPythonEntrypoint(targetDir);
    if (pythonEntrypoint && runMode !== "build") {
      steps.push({
        step_id: "runtime-python",
        phase: "runtime_probe",
        adapter: "http_service",
        command: ["python", pythonEntrypoint],
        rationale: `Python entrypoint '${pythonEntrypoint}' is available for bounded runtime probing.`,
        requires_network: runMode === "runtime",
        enabled: true,
        expected_artifact: "python-runtime-probe",
        artifact_context: {
          stack: "python",
          entrypoint: pythonEntrypoint,
          artifact_role: "service_probe",
          probe_paths: DEFAULT_RUNTIME_PROBE_PATHS,
          probe_ports: [8000, 5000, 3000]
        }
      });
      entrySignals.push(`python:${pythonEntrypoint}`);
    }
  }

  if (hasDockerfile) {
    detectedStack.add("dockerfile");
    entrySignals.push("Dockerfile");
  }
  if (hasCompose) {
    detectedStack.add("compose");
    entrySignals.push("compose");
  }

  if (!steps.length) {
    warnings.push("No bounded install/build/test/runtime commands could be derived from the target contents.");
  }
  if (!detectedStack.size) {
    warnings.push("No recognized runtime stack markers were detected for build/runtime execution.");
  }

  const readinessStatus: SandboxExecutionPlan["readiness_status"] = !steps.length
    ? "blocked"
    : warnings.length
      ? "ready_with_warnings"
      : "ready";

  return {
    readiness_status: readinessStatus,
    detected_stack: [...detectedStack],
    entry_signals: entrySignals,
    steps,
    warnings
  };
}

async function evaluateExecutionPlan(targetDir: string, plan: SandboxExecutionPlan, runtime: ContainerWorkspaceContract["runtime"]): Promise<SandboxExecutionResult[]> {
  const checkedAt = new Date().toISOString();
  const results: SandboxExecutionResult[] = [];
  for (const step of plan.steps) {
    if (!step.enabled) {
      results.push({
        step_id: step.step_id,
        status: "skipped",
        checked_at: checkedAt,
        execution_runtime: runtime === "unconfigured" ? "host_probe" : "container",
        summary: "Step is disabled for this run mode.",
        adapter: step.adapter,
        normalized_artifact: buildNormalizedArtifact(step, {
          status: "skipped",
          summary: "Step is disabled for this run mode."
        })
      });
      continue;
    }
    if (!isHostSandboxExecutionEnabled()) {
      if (runtime === "unconfigured") {
        results.push({
          step_id: step.step_id,
          status: "blocked",
          checked_at: checkedAt,
          execution_runtime: "host_probe",
          summary: "Container runtime is not configured, so bounded execution cannot start.",
          adapter: step.adapter,
          normalized_artifact: buildNormalizedArtifact(step, {
            status: "blocked",
            summary: "Container runtime is not configured, so bounded execution cannot start."
          })
        });
        continue;
      }
      const binary = step.command[0] ?? "";
      const binaryAvailable = await commandExistsOnHost(binary);
      results.push({
        step_id: step.step_id,
        status: binaryAvailable ? "ready" : "blocked",
        checked_at: checkedAt,
        execution_runtime: "container",
        adapter: step.adapter,
        summary: binaryAvailable
          ? `Command '${binary}' is available for bounded container execution.`
          : `Command '${binary}' is not available on the host used to launch containerized execution.`,
        normalized_artifact: buildNormalizedArtifact(step, {
          status: binaryAvailable ? "ready" : "blocked",
          summary: binaryAvailable
            ? `Command '${binary}' is available for bounded container execution.`
            : `Command '${binary}' is not available on the host used to launch containerized execution.`
        })
      });
      continue;
    }

    const binary = step.command[0] ?? "";
    const binaryAvailable = await commandExistsOnHost(binary);
    const startedAt = new Date().toISOString();
    const started = Date.now();
    if (!binaryAvailable) {
      results.push({
        step_id: step.step_id,
        status: "blocked",
        checked_at: checkedAt,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        execution_runtime: "host_bounded",
        summary: `Command '${binary}' is not available for bounded host execution.`,
        exit_code: null,
        adapter: step.adapter,
        normalized_artifact: buildNormalizedArtifact(step, {
          status: "blocked",
          summary: `Command '${binary}' is not available for bounded host execution.`,
          exitCode: null
        })
      });
      continue;
    }
    if (step.phase === "runtime_probe" && step.adapter === "http_service") {
      results.push(await executeRuntimeProbeStep(targetDir, step, checkedAt, startedAt, runtime));
      continue;
    }
    try {
      const output = await execFileAsync(binary, step.command.slice(1), {
        cwd: targetDir,
        timeout: getStepTimeoutMs(step.phase),
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          CI: "1"
        }
      });
      results.push({
        step_id: step.step_id,
        status: "completed",
        checked_at: checkedAt,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        execution_runtime: "host_bounded",
        summary: `Bounded host execution completed successfully for '${step.command.join(" ")}'.`,
        exit_code: 0,
        stdout_excerpt: truncateOutput(output.stdout),
        stderr_excerpt: truncateOutput(output.stderr),
        adapter: step.adapter,
        normalized_artifact: buildNormalizedArtifact(step, {
          status: "completed",
          summary: `Bounded host execution completed successfully for '${step.command.join(" ")}'.`,
          exitCode: 0,
          stdout: truncateOutput(output.stdout),
          stderr: truncateOutput(output.stderr)
        })
      });
    } catch (error: any) {
      const timedOut = error?.killed || error?.signal === "SIGTERM";
      const blockedByHost = error?.code === "EPERM" || /spawn EPERM/i.test(String(error?.message ?? error?.stderr ?? ""));
      const summary = blockedByHost
        ? `Bounded host execution is blocked by the current host for '${step.command.join(" ")}'.`
        : timedOut
          ? `Bounded host execution timed out for '${step.command.join(" ")}'.`
          : `Bounded host execution failed for '${step.command.join(" ")}'.`;
      results.push({
        step_id: step.step_id,
        status: blockedByHost ? "blocked" : "failed",
        checked_at: checkedAt,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        execution_runtime: "host_bounded",
        summary,
        exit_code: typeof error?.code === "number" ? error.code : null,
        stdout_excerpt: truncateOutput(error?.stdout),
        stderr_excerpt: truncateOutput(error?.stderr ?? error?.message),
        adapter: step.adapter,
        normalized_artifact: buildNormalizedArtifact(step, {
          status: blockedByHost ? "blocked" : "failed",
          summary,
          exitCode: typeof error?.code === "number" ? error.code : null,
          stdout: truncateOutput(error?.stdout),
          stderr: truncateOutput(error?.stderr ?? error?.message)
        })
      });
    }
  }
  return results;
}

async function executeRuntimeProbeStep(
  targetDir: string,
  step: SandboxExecutionStep,
  checkedAt: string,
  startedAt: string,
  runtime: ContainerWorkspaceContract["runtime"]
): Promise<SandboxExecutionResult> {
  const binary = step.command[0] ?? "";
  const started = Date.now();
  const ports = detectRuntimeProbePorts(step);
  const paths = detectRuntimeProbePaths(step);
  let stdoutExcerpt = "";
  let stderrExcerpt = "";
  let exitCode: number | null = null;
  let exited = false;
  let spawnError: any = null;
  const env = {
    ...process.env,
    CI: "1",
    PORT: String(ports[0] ?? 3000)
  };

  let child: ReturnType<typeof spawn> | null = null;
  try {
    child = spawn(binary, step.command.slice(1), {
      cwd: targetDir,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    spawnError = error;
    exited = true;
  }
  const exitPromise = new Promise<void>((resolve) => {
    if (!child) {
      resolve();
      return;
    }
    child.once("error", (error: Error) => {
      spawnError = error;
      exited = true;
      resolve();
    });
    child.once("exit", (code: number | null) => {
      exitCode = typeof code === "number" ? code : null;
      exited = true;
      resolve();
    });
  });
  child?.stdout?.on("data", (chunk) => {
    stdoutExcerpt = appendOutput(stdoutExcerpt, chunk) ?? "";
  });
  child?.stderr?.on("data", (chunk) => {
    stderrExcerpt = appendOutput(stderrExcerpt, chunk) ?? "";
  });

  const warmupMs = Math.min(RUNTIME_PROBE_WARMUP_MS, Math.max(750, Math.floor(getStepTimeoutMs(step.phase) / 4)));
  await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, warmupMs))]);

  let runtimeProbe: RuntimeProbeResult | null = null;
  if (!spawnError) {
    runtimeProbe = await probeHttpService(ports, paths, Math.min(2_000, getStepTimeoutMs(step.phase)));
  }

  if (!exited) {
    child?.kill("SIGTERM");
    await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 1_000))]);
  }

  const blockedByHost = spawnError?.code === "EPERM" || /spawn EPERM/i.test(String(spawnError?.message ?? stderrExcerpt));
  const durationMs = Date.now() - started;
  const completedAt = new Date().toISOString();
  const trimmedStdout = truncateOutput(stdoutExcerpt);
  const trimmedStderr = truncateOutput(stderrExcerpt || spawnError?.message);

  if (blockedByHost) {
    const summary = `Bounded host execution is blocked by the current host for '${step.command.join(" ")}'.`;
    return {
      step_id: step.step_id,
      status: "blocked",
      checked_at: checkedAt,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      execution_runtime: runtime === "unconfigured" ? "host_probe" : "host_bounded",
      summary,
      exit_code: null,
      stdout_excerpt: trimmedStdout,
      stderr_excerpt: trimmedStderr,
      adapter: step.adapter,
      normalized_artifact: buildNormalizedArtifact(step, {
        status: "blocked",
        summary,
        exitCode: null,
        stdout: trimmedStdout,
        stderr: trimmedStderr
      })
    };
  }

  if (runtimeProbe?.ok) {
    const summary = `Bounded runtime probe reached ${runtimeProbe.successful_target} successfully.`;
    return {
      step_id: step.step_id,
      status: "completed",
      checked_at: checkedAt,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      execution_runtime: "host_bounded",
      summary,
      exit_code: exitCode,
      stdout_excerpt: trimmedStdout,
      stderr_excerpt: trimmedStderr,
      adapter: step.adapter,
      normalized_artifact: buildNormalizedArtifact(step, {
        status: "completed",
        summary,
        exitCode,
        stdout: trimmedStdout,
        stderr: trimmedStderr,
        runtimeProbe
      })
    };
  }

  const summary = spawnError
    ? `Bounded runtime probe failed to start '${step.command.join(" ")}'.`
    : exited && exitCode === 0
      ? `Runtime command exited before exposing a healthy HTTP endpoint for '${step.command.join(" ")}'.`
      : `Bounded runtime probe failed for '${step.command.join(" ")}'.`;
  return {
    step_id: step.step_id,
    status: "failed",
    checked_at: checkedAt,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    execution_runtime: "host_bounded",
    summary,
    exit_code: exitCode,
    stdout_excerpt: trimmedStdout,
    stderr_excerpt: trimmedStderr,
    adapter: step.adapter,
    normalized_artifact: buildNormalizedArtifact(step, {
      status: "failed",
      summary,
      exitCode,
      stdout: trimmedStdout,
      stderr: trimmedStderr,
      runtimeProbe
    })
  };
}

export class LinuxContainerSandboxBackend {
  constructor(private readonly rootDir: string) {}

  async create(runId: string, request: AuditRequest): Promise<SandboxSession> {
    const runMode = request.run_mode ?? "static";
    if (runMode === "static") {
      throw new Error("linux-container backend is intended for build/runtime/validate modes.");
    }

    const sandboxId = createId("sandbox");
    const sandboxRoot = path.join(this.rootDir, runId);
    const targetDir = path.join(sandboxRoot, "target");
    const artifactDir = path.join(sandboxRoot, "artifacts");
    const runtime = await detectContainerRuntime();

    await fs.mkdir(sandboxRoot, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });
    await fs.mkdir(artifactDir, { recursive: true });

    let commitSha: string | null = null;
    let upstreamRepoUrl: string | null = request.repo_url ?? null;
    if (request.repo_url) {
      commitSha = await cloneRepo(request.repo_url, targetDir);
    } else if (request.local_path) {
      upstreamRepoUrl = await inferGitRepoUrl(request.local_path);
      await mirrorDirectory(path.resolve(request.local_path), targetDir, sandboxRoot);
    }

    const storageUsage = await collectStorageUsage(targetDir);
    const executionPlan = await buildExecutionPlan(targetDir, runMode);
    const executionResults = await evaluateExecutionPlan(targetDir, executionPlan, runtime);
    await fs.writeFile(path.join(artifactDir, "execution-plan.json"), JSON.stringify(executionPlan, null, 2));
    await fs.writeFile(path.join(artifactDir, "execution-results.json"), JSON.stringify(executionResults, null, 2));

    return {
      sandbox_id: sandboxId,
      backend: "linux-container",
      platform: process.platform,
      root_dir: sandboxRoot,
      target_dir: targetDir,
      run_mode: runMode,
      enforcement_notes: [
        "Linux container sandbox backend.",
        "Per-run target and artifact directories are prepared for container mounting.",
        `Derived ${executionPlan.steps.length} bounded execution step(s) for ${runMode} mode.`,
        `Execution readiness is ${executionPlan.readiness_status}.`,
        isHostSandboxExecutionEnabled()
          ? "Bounded host execution is enabled; derived steps were attempted with per-step timeouts."
          : "Bounded host execution is disabled; execution results reflect readiness probes only.",
        "Repository provenance and storage usage are captured before execution phases."
      ],
      command_policy: {
        allow_install_commands: true,
        allow_target_execution: true,
        allow_network_egress: runMode !== "validate",
        allowed_command_prefixes: [...new Set([
          ...executionPlan.steps.map((step) => step.command.slice(0, 3).join(" ")),
          "python -m",
          "node",
          "uv run",
          "semgrep",
          "trivy",
          "garak",
          "pyrit"
        ])],
        blocked_command_patterns: [
          "curl | sh",
          "wget | sh",
          "sudo",
          "mount ",
          "rm -rf /",
          "shutdown",
          "reboot",
          "sc delete",
          "net user"
        ]
      },
      container_workspace: {
        runtime,
        image: "ghcr.io/jjdomain/tethermark/linux-runner:latest",
        workspace_mount: "/workspace/target",
        artifact_mount: "/workspace/artifacts",
        network_mode: runMode === "validate" ? "none" : "bounded",
        notes: [
          "Mount target directory read-only by default during build/runtime execution.",
          "Mount artifact directory read-write for logs, traces, and exported evidence.",
          isHostSandboxExecutionEnabled()
            ? "Current OSS implementation can execute bounded step attempts on the host when explicitly enabled."
            : "Current OSS implementation derives bounded execution steps and readiness without running them unless host execution is explicitly enabled.",
          "Future implementation should enforce CPU, memory, PID, and network caps at container launch."
        ]
      },
      execution_plan: executionPlan,
      execution_results: executionResults,
      source_provenance: buildSourceProvenance({ repoUrl: request.repo_url, localPath: request.local_path, endpointUrl: request.endpoint_url, commitSha, upstreamRepoUrl }),
      storage_usage: storageUsage
    };
  }
}
