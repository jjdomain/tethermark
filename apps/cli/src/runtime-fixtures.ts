import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { LocalSandboxBackendId, RuntimeSandboxReadiness } from "../../../packages/validation-runner/src/index.js";

export const RUNTIME_FIXTURE_IMAGE = "docker.io/library/alpine@sha256:1e42bbe2508154c9126d48c2b8a75420c3544343bf86fd041fb7527e017a4b4a";
export const RUNTIME_FIXTURE_IMAGE_DIGEST = "sha256:1e42bbe2508154c9126d48c2b8a75420c3544343bf86fd041fb7527e017a4b4a";

const FIXTURE_MEMORY_BYTES = 128 * 1024 * 1024;
const FIXTURE_PIDS_LIMIT = 64;
const FIXTURE_NANO_CPUS = 1_000_000_000;
const FIXTURE_TMPFS_BYTES = 16 * 1024 * 1024;
const FIXTURE_MAX_FILE_BYTES = 1024 * 1024;
const FIXTURE_TIMEOUT_MS = 60_000;
const COMMAND_OUTPUT_LIMIT_BYTES = 256 * 1024;
const SOURCE_MARKER = "tethermark-runtime-source-v1";

const CONTAINER_SCRIPT = [
  "set -eu",
  `test \"$(cat /workspace/source-marker.txt)\" = \"${SOURCE_MARKER}\"`,
  "if { printf 'mutation' > /workspace/blocked-write.txt; } 2>/dev/null; then echo 'source mount was writable' >&2; exit 31; fi",
  "printf 'temporary-write-ok' > /tmp/runtime-fixture.tmp",
  "test \"$(cat /tmp/runtime-fixture.tmp)\" = 'temporary-write-ok'",
  "test \"$(awk '/^CapEff:/ { print $2 }' /proc/self/status)\" = '0000000000000000'",
  "test \"$(awk '/^NoNewPrivs:/ { print $2 }' /proc/self/status)\" = '1'",
  "test -z \"${TETHERMARK_HOST_SECRET-}\"",
  "test \"${TETHERMARK_FAKE_SECRET-}\" = 'tm_fake_runtime_validation_only'",
  "if dd if=/dev/zero of=/tmp/oversized.bin bs=1048576 count=2 2>/dev/null; then echo 'file-size limit unexpectedly allowed oversized file' >&2; exit 34; fi",
  "command -v wget >/dev/null",
  "if wget -q -T 2 -O /tmp/network-response http://example.com 2>/dev/null; then echo 'network request unexpectedly succeeded' >&2; exit 32; fi",
  "printf 'ready' > /output/ready",
  "attempt=0",
  "while [ ! -f /output/continue ]; do attempt=$((attempt + 1)); [ \"$attempt\" -lt 30 ] || exit 33; sleep 1; done",
  "printf '%s' '{\"source_readonly\":true,\"writable_tmpfs\":true,\"network_blocked\":true,\"capabilities_dropped\":true,\"no_new_privileges\":true,\"host_secret_blocked\":true,\"synthetic_credential_only\":true,\"file_size_blocked\":true}' > /output/result.json",
  "echo 'tethermark-runtime-fixture-complete'"
].join("\n");

interface CommandResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

export interface RuntimeFixtureExecutionResult {
  schema_version: 1;
  passed: boolean;
  backend_id: LocalSandboxBackendId;
  runtime_command: "docker" | "podman" | null;
  image: string;
  image_digest: string;
  container_name: string | null;
  create_command: {
    command: "docker" | "podman";
    args: string[];
  } | null;
  resource_policy: {
    network_mode: "none";
    root_filesystem_readonly: true;
    source_mount_readonly: true;
    non_root_user: "65532:65532";
    capabilities: "drop_all";
    no_new_privileges: true;
    memory_bytes: number;
    pids_limit: number;
    nano_cpus: number;
    tmpfs_bytes: number;
    max_file_bytes: number;
  };
  started_at: string;
  completed_at: string;
  duration_ms: number;
  assertions: Record<string, boolean>;
  command: {
    exit_code: number | null;
    stdout: string;
    stderr: string;
    timed_out: boolean;
  } | null;
  cleanup: {
    container_removed: boolean;
    temp_root_removed: boolean;
  };
  evidence_path: string | null;
  error: string | null;
}

interface RuntimeFixturePaths {
  tempRoot: string;
  sourceRoot: string;
  outputRoot: string;
}

interface DockerInspectShape {
  ImageName?: string;
  Config?: {
    Image?: string;
    User?: string;
    Env?: string[];
  };
  HostConfig?: {
    AutoRemove?: boolean;
    CapDrop?: string[] | null;
    CpuPeriod?: number;
    CpuQuota?: number;
    Init?: boolean | null;
    Memory?: number;
    NanoCpus?: number;
    NetworkMode?: string;
    PidsLimit?: number | null;
    Privileged?: boolean;
    ReadonlyRootfs?: boolean;
    Runtime?: string;
    SecurityOpt?: string[] | null;
    Tmpfs?: Record<string, string> | null;
    Ulimits?: Array<{ Name?: string; Soft?: number; Hard?: number }> | null;
  };
  Mounts?: Array<{
    Destination?: string;
    RW?: boolean;
    Source?: string;
    Type?: string;
  }>;
}

function normalizePathForComparison(value: string): string {
  return path.resolve(value).replaceAll("\\", "/").toLowerCase();
}

function boundedText(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.byteLength <= maxBytes) return value;
  return buffer.subarray(0, maxBytes).toString("utf8");
}

async function runCommand(command: string, args: string[], options: { timeoutMs?: number; allowFailure?: boolean } = {}): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? FIXTURE_TIMEOUT_MS;
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (error: Error | null, exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result: CommandResult = {
        exit_code: exitCode,
        stdout: boundedText(stdout, COMMAND_OUTPUT_LIMIT_BYTES),
        stderr: boundedText(stderr, COMMAND_OUTPUT_LIMIT_BYTES),
        timed_out: timedOut
      };
      if (error) {
        reject(Object.assign(error, { command_result: result }));
      } else if (!options.allowFailure && exitCode !== 0) {
        reject(Object.assign(new Error(`${command} ${args[0] ?? ""} failed with exit ${exitCode}: ${result.stderr || result.stdout}`), { command_result: result }));
      } else {
        resolve(result);
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (Buffer.byteLength(stdout, "utf8") > COMMAND_OUTPUT_LIMIT_BYTES * 2) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (Buffer.byteLength(stderr, "utf8") > COMMAND_OUTPUT_LIMIT_BYTES * 2) child.kill("SIGKILL");
    });
    child.once("error", (error) => finish(error, null));
    child.once("close", (code) => finish(timedOut ? new Error(`${command} timed out after ${timeoutMs}ms`) : null, code));
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  return await fs.access(filePath).then(() => true).catch(() => false);
}

async function waitForFile(filePath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fileExists(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Runtime fixture did not signal readiness within ${timeoutMs}ms.`);
}

async function ensurePinnedImage(runtimeCommand: "docker" | "podman"): Promise<void> {
  const inspection = await runCommand(runtimeCommand, ["image", "inspect", RUNTIME_FIXTURE_IMAGE], { allowFailure: true, timeoutMs: 15_000 });
  if (inspection.exit_code === 0) return;
  await runCommand(runtimeCommand, ["pull", RUNTIME_FIXTURE_IMAGE], { timeoutMs: 180_000 });
  const afterPull = await runCommand(runtimeCommand, ["image", "inspect", RUNTIME_FIXTURE_IMAGE], { allowFailure: true, timeoutMs: 15_000 });
  if (afterPull.exit_code !== 0) throw new Error("Pinned runtime fixture image was not available after pull.");
}

export function buildDockerRuntimeFixtureCreateArgs(input: {
  containerName: string;
  sourceRoot: string;
  outputRoot: string;
  backend?: LocalSandboxBackendId;
}): string[] {
  const args = [
    "create",
    "--name", input.containerName,
    "--network", "none",
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", String(FIXTURE_PIDS_LIMIT),
    "--memory", String(FIXTURE_MEMORY_BYTES),
    "--cpus", "1",
    "--ulimit", `fsize=${FIXTURE_MAX_FILE_BYTES}:${FIXTURE_MAX_FILE_BYTES}`,
    "--init",
    "--user", "65532:65532",
    "--workdir", "/workspace",
    "--env", "TETHERMARK_RUNTIME_FIXTURE=1",
    "--env", "TETHERMARK_RUNTIME_CREDENTIAL_MODE=synthetic",
    "--env", "TETHERMARK_FAKE_SECRET=tm_fake_runtime_validation_only",
    "--tmpfs", `/tmp:rw,noexec,nosuid,nodev,size=${FIXTURE_TMPFS_BYTES}`,
    "--mount", `type=bind,source=${path.resolve(input.sourceRoot)},target=/workspace,readonly`,
    "--mount", `type=bind,source=${path.resolve(input.outputRoot)},target=/output`,
    RUNTIME_FIXTURE_IMAGE,
    "/bin/sh",
    "-c",
    CONTAINER_SCRIPT
  ];
  if (input.backend === "gvisor_container") args.splice(3, 0, "--runtime", "runsc");
  return args;
}

export function validateDockerRuntimeFixtureInspect(inspection: DockerInspectShape, expected: {
  sourceRoot: string;
  outputRoot: string;
  backend?: LocalSandboxBackendId;
}): Record<string, boolean> {
  const mounts = inspection.Mounts ?? [];
  const sourceMount = mounts.find((item) => item.Destination === "/workspace");
  const outputMount = mounts.find((item) => item.Destination === "/output");
  const env = inspection.Config?.Env ?? [];
  const secretEnvPattern = /^(?:.*(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?))=/i;
  const approvedSyntheticEnvironment = new Set([
    "TETHERMARK_RUNTIME_CREDENTIAL_MODE=synthetic",
    "TETHERMARK_FAKE_SECRET=tm_fake_runtime_validation_only"
  ]);
  const tmpfs = inspection.HostConfig?.Tmpfs?.["/tmp"] ?? "";
  const cpuLimited = inspection.HostConfig?.NanoCpus === FIXTURE_NANO_CPUS
    || (Number(inspection.HostConfig?.CpuPeriod) > 0
      && Number(inspection.HostConfig?.CpuQuota) / Number(inspection.HostConfig?.CpuPeriod) === 1);
  const ulimits = inspection.HostConfig?.Ulimits ?? [];
  return {
    pinned_image: inspection.Config?.Image === RUNTIME_FIXTURE_IMAGE || inspection.ImageName === RUNTIME_FIXTURE_IMAGE,
    non_root_user: inspection.Config?.User === "65532:65532",
    network_disabled: inspection.HostConfig?.NetworkMode === "none",
    root_filesystem_readonly: inspection.HostConfig?.ReadonlyRootfs === true,
    capabilities_dropped: (inspection.HostConfig?.CapDrop ?? []).map((item) => item.toUpperCase()).includes("ALL"),
    no_new_privileges: (inspection.HostConfig?.SecurityOpt ?? []).some((item) => item === "no-new-privileges" || item === "no-new-privileges:true"),
    unprivileged_container: inspection.HostConfig?.Privileged === false,
    pids_limited: inspection.HostConfig?.PidsLimit === FIXTURE_PIDS_LIMIT,
    memory_limited: inspection.HostConfig?.Memory === FIXTURE_MEMORY_BYTES,
    cpu_limited: cpuLimited,
    init_enabled: inspection.HostConfig?.Init === true,
    tmpfs_bounded: tmpfs.includes("noexec") && tmpfs.includes("nosuid") && tmpfs.includes("nodev") && tmpfs.includes(`size=${FIXTURE_TMPFS_BYTES}`),
    source_mount_readonly: sourceMount?.Type === "bind" && sourceMount.RW === false && normalizePathForComparison(sourceMount.Source ?? "") === normalizePathForComparison(expected.sourceRoot),
    output_mount_writable: outputMount?.Type === "bind" && outputMount.RW === true && normalizePathForComparison(outputMount.Source ?? "") === normalizePathForComparison(expected.outputRoot),
    only_expected_host_mounts: mounts.length === 2 && mounts.every((item) => item.Destination === "/workspace" || item.Destination === "/output"),
    synthetic_credential_injected: env.includes("TETHERMARK_FAKE_SECRET=tm_fake_runtime_validation_only"),
    no_real_secret_environment: !env.some((item) => secretEnvPattern.test(item) && !approvedSyntheticEnvironment.has(item)),
    file_size_limited: ulimits.some((item) => /(?:^|_)fsize$/i.test(item.Name ?? "") && item.Soft === FIXTURE_MAX_FILE_BYTES && item.Hard === FIXTURE_MAX_FILE_BYTES),
    explicit_cleanup_required: inspection.HostConfig?.AutoRemove === false,
    selected_runtime_matches_backend: expected.backend === "gvisor_container"
      ? inspection.HostConfig?.Runtime === "runsc"
      : inspection.HostConfig?.Runtime !== "runsc"
  };
}

async function createFixturePaths(): Promise<RuntimeFixturePaths> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-runtime-fixture-"));
  const sourceRoot = path.join(tempRoot, "source");
  const outputRoot = path.join(tempRoot, "output");
  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.join(sourceRoot, "source-marker.txt"), SOURCE_MARKER, "utf8");
  return { tempRoot, sourceRoot, outputRoot };
}

async function writeEvidence(result: RuntimeFixtureExecutionResult): Promise<string | null> {
  try {
    const root = path.resolve(process.cwd(), ".artifacts", "runtime-readiness");
    await fs.mkdir(root, { recursive: true });
    const stamp = result.started_at.replaceAll(":", "-").replaceAll(".", "-");
    const evidencePath = path.join(root, `runtime-fixture-${stamp}.json`);
    await fs.writeFile(evidencePath, `${JSON.stringify({ ...result, evidence_path: evidencePath }, null, 2)}\n`, "utf8");
    return evidencePath;
  } catch {
    return null;
  }
}

function selectedRuntimeCommand(backend: LocalSandboxBackendId): "docker" | "podman" | null {
  if (backend === "docker" || backend === "docker_desktop" || backend === "gvisor_container") return "docker";
  if (backend === "podman" || backend === "rootless_podman") return "podman";
  return null;
}

export async function executeRuntimeReadinessFixture(readiness: RuntimeSandboxReadiness): Promise<RuntimeFixtureExecutionResult> {
  const startedAt = new Date();
  const backend = readiness.resolution.selected_backend;
  const runtimeCommand = selectedRuntimeCommand(backend);
  const result: RuntimeFixtureExecutionResult = {
    schema_version: 1,
    passed: false,
    backend_id: backend,
    runtime_command: runtimeCommand,
    image: RUNTIME_FIXTURE_IMAGE,
    image_digest: RUNTIME_FIXTURE_IMAGE_DIGEST,
    container_name: null,
    create_command: null,
    resource_policy: {
      network_mode: "none",
      root_filesystem_readonly: true,
      source_mount_readonly: true,
      non_root_user: "65532:65532",
      capabilities: "drop_all",
      no_new_privileges: true,
      memory_bytes: FIXTURE_MEMORY_BYTES,
      pids_limit: FIXTURE_PIDS_LIMIT,
      nano_cpus: FIXTURE_NANO_CPUS,
      tmpfs_bytes: FIXTURE_TMPFS_BYTES,
      max_file_bytes: FIXTURE_MAX_FILE_BYTES
    },
    started_at: startedAt.toISOString(),
    completed_at: startedAt.toISOString(),
    duration_ms: 0,
    assertions: {},
    command: null,
    cleanup: { container_removed: false, temp_root_removed: false },
    evidence_path: null,
    error: null
  };
  let paths: RuntimeFixturePaths | null = null;
  let containerCreated = false;
  try {
    if (!runtimeCommand) throw new Error(`Runtime readiness fixtures are not implemented for backend ${backend}.`);
    if (!readiness.launchable || readiness.resolution.readiness_status === "blocked") {
      throw new Error(`Runtime backend ${backend} is not launchable.`);
    }
    await ensurePinnedImage(runtimeCommand);
    paths = await createFixturePaths();
    const containerName = `tethermark-runtime-readiness-${process.pid}-${Date.now()}`.toLowerCase();
    result.container_name = containerName;
    const createArgs = buildDockerRuntimeFixtureCreateArgs({
      containerName,
      sourceRoot: paths.sourceRoot,
      outputRoot: paths.outputRoot,
      backend
    });
    result.create_command = { command: runtimeCommand, args: createArgs };
    const createResult = await runCommand(runtimeCommand, createArgs);
    containerCreated = createResult.exit_code === 0;
    const inspectResult = await runCommand(runtimeCommand, ["inspect", containerName]);
    const inspection = (JSON.parse(inspectResult.stdout) as DockerInspectShape[])[0];
    if (!inspection) throw new Error(`${runtimeCommand} inspect returned no fixture container record.`);
    Object.assign(result.assertions, validateDockerRuntimeFixtureInspect(inspection, {
      sourceRoot: paths.sourceRoot,
      outputRoot: paths.outputRoot,
      backend
    }));
    const failedConfigAssertions = Object.entries(result.assertions).filter(([, passed]) => !passed).map(([name]) => name);
    if (failedConfigAssertions.length) throw new Error(`Runtime fixture container policy assertions failed: ${failedConfigAssertions.join(", ")}`);

    const executionPromise = runCommand(runtimeCommand, ["start", "--attach", containerName], { timeoutMs: FIXTURE_TIMEOUT_MS });
    void executionPromise.catch(() => undefined);
    await waitForFile(path.join(paths.outputRoot, "ready"), 20_000);
    await fs.writeFile(path.join(paths.outputRoot, "continue"), "continue", "utf8");
    const execution = await executionPromise;
    result.command = execution;
    const containerResultPath = path.join(paths.outputRoot, "result.json");
    const containerResult = JSON.parse(await fs.readFile(containerResultPath, "utf8")) as Record<string, unknown>;
    for (const key of ["source_readonly", "writable_tmpfs", "network_blocked", "capabilities_dropped", "no_new_privileges", "host_secret_blocked", "synthetic_credential_only", "file_size_blocked"]) {
      result.assertions[`executed_${key}`] = containerResult[key] === true;
    }
    result.assertions.container_exit_zero = execution.exit_code === 0 && !execution.timed_out;
    result.assertions.completion_marker = execution.stdout.includes("tethermark-runtime-fixture-complete");
    result.assertions.source_unchanged = await fs.readFile(path.join(paths.sourceRoot, "source-marker.txt"), "utf8") === SOURCE_MARKER
      && !(await fileExists(path.join(paths.sourceRoot, "blocked-write.txt")));
    result.assertions.stdout_bounded = Buffer.byteLength(execution.stdout, "utf8") <= readiness.settings.max_stdout_bytes;
    result.assertions.stderr_bounded = Buffer.byteLength(execution.stderr, "utf8") <= readiness.settings.max_stderr_bytes;
  } catch (error) {
    const commandResult = error && typeof error === "object" && "command_result" in error
      ? (error as { command_result?: CommandResult }).command_result ?? null
      : null;
    if (commandResult && !result.command) result.command = commandResult;
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (runtimeCommand && containerCreated && result.container_name) {
      const removal = await runCommand(runtimeCommand, ["rm", "--force", result.container_name], { allowFailure: true, timeoutMs: 20_000 }).catch(() => null);
      const postRemovalInspect = await runCommand(runtimeCommand, ["inspect", result.container_name], { allowFailure: true, timeoutMs: 10_000 }).catch(() => null);
      result.cleanup.container_removed = removal?.exit_code === 0 && postRemovalInspect?.exit_code !== 0;
    } else {
      result.cleanup.container_removed = !containerCreated;
    }
    if (paths) {
      await fs.rm(paths.tempRoot, { recursive: true, force: true }).catch(() => undefined);
      result.cleanup.temp_root_removed = !(await fileExists(paths.tempRoot));
    } else {
      result.cleanup.temp_root_removed = true;
    }
    result.assertions.container_cleanup = result.cleanup.container_removed;
    result.assertions.temp_cleanup = result.cleanup.temp_root_removed;
    result.completed_at = new Date().toISOString();
    result.duration_ms = new Date(result.completed_at).getTime() - startedAt.getTime();
    result.evidence_path = await writeEvidence(result);
    result.assertions.evidence_persisted = result.evidence_path !== null;
    result.passed = !result.error && Object.keys(result.assertions).length > 0 && Object.values(result.assertions).every(Boolean);
    if (result.evidence_path) await writeEvidence(result);
  }
  return result;
}
