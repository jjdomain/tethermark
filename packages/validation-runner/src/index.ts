import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export type LocalSandboxBackendId =
  | "gvisor_container"
  | "rootless_podman"
  | "podman"
  | "docker"
  | "docker_desktop"
  | "landlock_process"
  | "unavailable";

export type RuntimeSandboxProviderId =
  | "local_runtime"
  | "hosted_modal"
  | "hosted_e2b"
  | "hosted_daytona";

export type RuntimeReadinessStatus = "ready" | "ready_with_warnings" | "blocked";
export type RuntimeBackendCandidateStatus = "available" | "blocked" | "warning" | "not_detected";
export type RuntimeSandboxResolutionMode = "auto" | "prefer" | "pinned";

export interface RuntimeSandboxSettings {
  enabled: boolean;
  resolution_mode: RuntimeSandboxResolutionMode;
  preferred_backend: LocalSandboxBackendId | "auto";
  allowed_backends: LocalSandboxBackendId[];
  allow_warning_backends: boolean;
  require_hardened_for_untrusted_repo: boolean;
  network_policy: "none" | "dependency_install_only" | "bounded" | "allowlist";
  dependency_install_network: "explicit_only" | "never" | "allowed";
  runtime_probe_network: "explicit_only" | "never" | "allowed";
  outbound_allowlist: string[];
  max_duration_ms: number;
  step_timeout_ms: number;
  memory_limit_mb: number;
  pids_limit: number;
  max_stdout_bytes: number;
  max_stderr_bytes: number;
  max_file_bytes: number;
  max_workspace_bytes: number;
  max_artifact_bytes: number;
}

export interface RuntimeBackendCandidate {
  backend_id: LocalSandboxBackendId;
  status: RuntimeBackendCandidateStatus;
  version?: string | null;
  reason: string;
  security_notes: string[];
}

export interface LocalSandboxBackendResolution {
  selected_backend: LocalSandboxBackendId;
  candidates: RuntimeBackendCandidate[];
  readiness_status: RuntimeReadinessStatus;
  warnings: string[];
  blockers: string[];
}

export interface RuntimeSandboxReadiness {
  provider_id: "local_runtime";
  generated_at: string;
  platform: NodeJS.Platform;
  settings: RuntimeSandboxSettings;
  resolution: LocalSandboxBackendResolution;
  setup_commands: string[];
  launchable: boolean;
}

export interface RuntimeExecutionPolicy {
  provider_id: "local_runtime";
  selected_backend: LocalSandboxBackendId;
  allow_install: boolean;
  allow_build: boolean;
  allow_tests: boolean;
  allow_runtime_probe: boolean;
  network_policy: RuntimeSandboxSettings["network_policy"];
  dependency_install_network: RuntimeSandboxSettings["dependency_install_network"];
  runtime_probe_network: RuntimeSandboxSettings["runtime_probe_network"];
  outbound_allowlist: string[];
  max_duration_ms: number;
  step_timeout_ms: number;
  max_stdout_bytes: number;
  max_stderr_bytes: number;
  memory_limit_mb?: number;
  pids_limit?: number;
  max_file_bytes: number;
  max_workspace_bytes: number;
  max_artifact_bytes: number;
  filesystem: {
    target_readonly: boolean;
    artifact_writeonly: boolean;
    block_host_mounts: boolean;
    skip_symlinks: boolean;
  };
}

export interface RuntimeReadinessInput {
  settings?: unknown;
  target?: {
    source_type?: "repo" | "path" | "endpoint" | string | null;
    trusted?: boolean | null;
  } | null;
  probeCommand?: (command: string, args?: string[]) => { available: boolean; version?: string | null; ok?: boolean; message?: string | null };
  platform?: NodeJS.Platform;
}

export interface RuntimeValidationRequest {
  run_id: string;
  target_dir: string;
  artifact_dir: string;
  policy: RuntimeExecutionPolicy;
  detected_stack?: string[];
  steps?: RuntimeValidationStep[];
}

export interface RuntimeValidationStep {
  step_id: string;
  phase: "install" | "build" | "test" | "runtime_probe";
  adapter?: string;
  command: string[];
  requires_network: boolean;
  enabled: boolean;
  artifact_context?: Record<string, unknown>;
}

export interface RuntimeValidationPlan {
  provider_id: RuntimeSandboxProviderId;
  selected_backend: LocalSandboxBackendId;
  image: string | null;
  image_digest: string | null;
  steps: RuntimeValidationStep[];
}

export interface RuntimeValidationResult {
  provider_id: RuntimeSandboxProviderId;
  selected_backend: LocalSandboxBackendId;
  status: "completed" | "failed" | "blocked";
  artifacts: RuntimeValidationArtifact[];
  steps: RuntimeValidationStepResult[];
  cleanup: RuntimeValidationCleanup;
}

export interface RuntimeValidationStepResult {
  step_id: string;
  status: "completed" | "failed" | "blocked" | "skipped";
  checked_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  execution_runtime: "container";
  summary: string;
  exit_code: number | null;
  stdout_excerpt: string | null;
  stderr_excerpt: string | null;
  timed_out: boolean;
  container_name: string | null;
  image: string | null;
  command: string[];
  container_create_argv?: string[];
  runtime_version?: string | null;
  resource_summary?: RuntimeValidationResourceSummary;
  network_mode: "none" | "bridge";
  adapter?: string;
  artifact_context?: Record<string, unknown>;
}

export interface RuntimeValidationResourceSummary {
  cpu_percent: string | null;
  memory_usage: string | null;
  memory_percent: string | null;
  pids: string | null;
  block_io: string | null;
  network_io: string | null;
  oom_killed: boolean | null;
  container_pid: number | null;
  workspace_bytes: number | null;
  artifact_bytes: number | null;
  max_file_bytes: number;
  max_workspace_bytes: number;
  max_artifact_bytes: number;
  quota_exceeded: boolean;
}

export interface RuntimeValidationCleanup {
  containers_removed: boolean;
  workspace_volume_removed: boolean;
  errors: string[];
}

export interface RuntimeValidationArtifact {
  artifact_id: string;
  run_id: string;
  artifact_type: string;
  path: string | null;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface RuntimeSandboxProvider {
  id: RuntimeSandboxProviderId;
  readiness(input: RuntimeReadinessInput): Promise<RuntimeSandboxReadiness>;
  plan(input: RuntimeValidationRequest): Promise<RuntimeValidationPlan>;
  execute(input: RuntimeValidationRequest, plan: RuntimeValidationPlan): Promise<RuntimeValidationResult>;
  collectArtifacts(runId: string): Promise<RuntimeValidationArtifact[]>;
  terminate(runId: string): Promise<void>;
}

const DEFAULT_ALLOWED_BACKENDS: LocalSandboxBackendId[] = [
  "gvisor_container",
  "rootless_podman",
  "podman",
  "docker",
  "docker_desktop"
];

export const LOCAL_SANDBOX_BACKEND_ORDER: LocalSandboxBackendId[] = [
  "gvisor_container",
  "rootless_podman",
  "podman",
  "docker",
  "docker_desktop",
  "landlock_process",
  "unavailable"
];

export const DEFAULT_RUNTIME_SANDBOX_SETTINGS: RuntimeSandboxSettings = {
  enabled: true,
  resolution_mode: "auto",
  preferred_backend: "auto",
  allowed_backends: DEFAULT_ALLOWED_BACKENDS,
  allow_warning_backends: true,
  require_hardened_for_untrusted_repo: false,
  network_policy: "none",
  dependency_install_network: "explicit_only",
  runtime_probe_network: "never",
  outbound_allowlist: [],
  max_duration_ms: 300_000,
  step_timeout_ms: 60_000,
  memory_limit_mb: 2048,
  pids_limit: 512,
  max_stdout_bytes: 2000,
  max_stderr_bytes: 2000,
  max_file_bytes: 64 * 1024 * 1024,
  max_workspace_bytes: 512 * 1024 * 1024,
  max_artifact_bytes: 128 * 1024 * 1024
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function localBackendArray(value: unknown): LocalSandboxBackendId[] {
  const allowed = new Set(LOCAL_SANDBOX_BACKEND_ORDER);
  const normalized = stringArray(value).filter((item): item is LocalSandboxBackendId => allowed.has(item as LocalSandboxBackendId));
  return normalized.length ? normalized : DEFAULT_ALLOWED_BACKENDS;
}

function localBackend(value: unknown, fallback: LocalSandboxBackendId | "auto"): LocalSandboxBackendId | "auto" {
  const text = String(value ?? "").trim();
  return text === "auto" || LOCAL_SANDBOX_BACKEND_ORDER.includes(text as LocalSandboxBackendId) ? text as LocalSandboxBackendId | "auto" : fallback;
}

function resolutionMode(value: unknown): RuntimeSandboxResolutionMode {
  return value === "prefer" || value === "pinned" ? value : "auto";
}

function networkPolicy(value: unknown): RuntimeSandboxSettings["network_policy"] {
  return value === "dependency_install_only" || value === "bounded" || value === "allowlist" ? value : "none";
}

function dependencyInstallNetwork(value: unknown): RuntimeSandboxSettings["dependency_install_network"] {
  return value === "never" || value === "allowed" ? value : "explicit_only";
}

function runtimeProbeNetwork(value: unknown): RuntimeSandboxSettings["runtime_probe_network"] {
  return value === "explicit_only" || value === "allowed" ? value : "never";
}

export function normalizeRuntimeSandboxSettings(value: unknown): RuntimeSandboxSettings {
  const input = asRecord(value);
  return {
    enabled: input.enabled !== false,
    resolution_mode: resolutionMode(input.resolution_mode),
    preferred_backend: localBackend(input.preferred_backend, "auto"),
    allowed_backends: localBackendArray(input.allowed_backends),
    allow_warning_backends: input.allow_warning_backends !== false,
    require_hardened_for_untrusted_repo: input.require_hardened_for_untrusted_repo === true,
    network_policy: networkPolicy(input.network_policy),
    dependency_install_network: dependencyInstallNetwork(input.dependency_install_network),
    runtime_probe_network: runtimeProbeNetwork(input.runtime_probe_network),
    outbound_allowlist: stringArray(input.outbound_allowlist),
    max_duration_ms: positiveNumber(input.max_duration_ms, DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_duration_ms),
    step_timeout_ms: positiveNumber(input.step_timeout_ms, DEFAULT_RUNTIME_SANDBOX_SETTINGS.step_timeout_ms),
    memory_limit_mb: positiveNumber(input.memory_limit_mb, DEFAULT_RUNTIME_SANDBOX_SETTINGS.memory_limit_mb),
    pids_limit: positiveNumber(input.pids_limit, DEFAULT_RUNTIME_SANDBOX_SETTINGS.pids_limit),
    max_stdout_bytes: positiveNumber(input.max_stdout_bytes, DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_stdout_bytes),
    max_stderr_bytes: positiveNumber(input.max_stderr_bytes, DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_stderr_bytes),
    max_file_bytes: positiveNumber(input.max_file_bytes, DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_file_bytes),
    max_workspace_bytes: positiveNumber(input.max_workspace_bytes, DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_workspace_bytes),
    max_artifact_bytes: positiveNumber(input.max_artifact_bytes, DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_artifact_bytes)
  };
}

function runProbe(command: string, args: string[] = []): { available: boolean; version?: string | null; ok?: boolean; message?: string | null } {
  const managedToolPath = String(process.env.HARNESS_STATIC_TOOLS_PATH ?? "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(process.cwd(), item));
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, PATH: [...managedToolPath, process.env.PATH ?? ""].join(path.delimiter) },
    shell: false,
    windowsHide: true,
    timeout: 2_000,
    maxBuffer: 256 * 1024
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const commandMissing = result.status === 127
    || result.status === 9009
    || /is not recognized as an internal or external command|command not found|not found/i.test(output);
  return {
    available: !result.error && !commandMissing,
    ok: !result.error && result.status === 0,
    version: output.split(/\r?\n/).find(Boolean) ?? null,
    message: result.error?.message ?? (result.status === 0 ? null : output || `exit ${result.status}`)
  };
}

function probe(input: RuntimeReadinessInput, command: string, args: string[] = ["--version"]) {
  return input.probeCommand ? input.probeCommand(command, args) : runProbe(command, args);
}

function candidate(backend_id: LocalSandboxBackendId, status: RuntimeBackendCandidateStatus, reason: string, security_notes: string[], version?: string | null): RuntimeBackendCandidate {
  return { backend_id, status, reason, security_notes, version: version ?? null };
}

function backendCandidates(input: RuntimeReadinessInput, platform: NodeJS.Platform): RuntimeBackendCandidate[] {
  const runsc = probe(input, "runsc", ["--version"]);
  const podman = probe(input, "podman", ["--version"]);
  const podmanInfo = podman.available ? probe(input, "podman", ["info", "--format", "{{.Host.Security.Rootless}}"]) : null;
  const docker = probe(input, "docker", ["--version"]);
  const dockerInfo = docker.available ? probe(input, "docker", ["info"]) : null;
  const landrun = probe(input, "landrun", ["--help"]);
  const linux = platform === "linux";
  const desktopPlatform = platform === "win32" || platform === "darwin";

  return [
    runsc.available && linux
      ? candidate("gvisor_container", "available", "gVisor runsc is available on Linux.", [
        "Preferred local hardened backend for stronger syscall boundary around containerized runtime validation."
      ], runsc.version)
      : candidate("gvisor_container", linux ? "not_detected" : "blocked", linux ? "gVisor runsc was not detected." : "gVisor local runtime is Linux-only.", [
        "Install gVisor runsc for hardened local container execution."
      ]),
    podman.available && linux && String(podmanInfo?.version ?? podmanInfo?.message ?? "").toLowerCase().includes("true")
      ? candidate("rootless_podman", "available", "Rootless Podman is available.", [
        "Preferred container backend when gVisor is unavailable because it avoids rootful daemon execution."
      ], podman.version)
      : candidate("rootless_podman", podman.available && linux ? "not_detected" : linux ? "not_detected" : "blocked", podman.available && linux ? "Podman is available but rootless mode was not confirmed." : linux ? "Rootless Podman was not detected." : "Rootless Podman runtime is Linux-first.", [
        "Use rootless Podman for stronger local operator-controlled validation."
      ], podman.available ? podman.version : null),
    podman.available && linux
      ? candidate("podman", "available", "Podman is available.", [
        "Containerized local runtime backend. Prefer rootless Podman or gVisor where available."
      ], podman.version)
      : candidate("podman", linux ? "not_detected" : "blocked", linux ? "Podman was not detected." : "Podman local runtime is Linux-first in Tethermark OSS.", [
        "Install Podman for local runtime validation on Linux."
      ]),
    docker.available && !desktopPlatform && dockerInfo?.ok !== false
      ? candidate("docker", "available", "Docker CLI and daemon are available.", [
        "Containerized local runtime backend. Use for trusted operator-controlled validation."
      ], docker.version)
      : candidate("docker", desktopPlatform && docker.available ? "blocked" : docker.available ? "blocked" : "not_detected", desktopPlatform && docker.available ? "Docker Desktop is handled as a warning backend." : docker.available ? "Docker CLI is available but daemon readiness was not confirmed." : "Docker was not detected.", [
        "Install Docker or Podman and ensure the daemon is running."
      ], docker.available ? docker.version : null),
    docker.available && desktopPlatform
      ? candidate("docker_desktop", dockerInfo?.ok === false ? "blocked" : "warning", dockerInfo?.ok === false ? "Docker Desktop CLI is present but daemon readiness failed." : "Docker Desktop is available on Windows/macOS.", [
        "Docker Desktop uses a shared Linux VM boundary on Windows/macOS.",
        "Suitable for operator-controlled local validation, not strong untrusted multi-tenant execution."
      ], docker.version)
      : candidate("docker_desktop", "not_detected", "Docker Desktop was not detected or is not applicable on this platform.", [
        "Use Docker Desktop only with the local runtime warning boundary."
      ]),
    landrun.available && linux
      ? candidate("landlock_process", "warning", "landrun/Landlock-style process sandbox is available.", [
        "Useful for future single-process command wrapping.",
        "Not sufficient as the default full app/agent runtime validation backend."
      ], landrun.version)
      : candidate("landlock_process", linux ? "not_detected" : "blocked", linux ? "landrun was not detected." : "Landlock process sandboxing is Linux-only.", [
        "Optional future backend; not required for v1 local runtime validation."
      ]),
    candidate("unavailable", "blocked", "No supported local runtime backend was selected.", [
      "Install Docker, Podman, or gVisor to enable Local Runtime Sandbox."
    ])
  ];
}

function backendRank(settings: RuntimeSandboxSettings): LocalSandboxBackendId[] {
  if (settings.resolution_mode === "pinned" && settings.preferred_backend !== "auto") return [settings.preferred_backend];
  if (settings.resolution_mode === "prefer" && settings.preferred_backend !== "auto") {
    return [settings.preferred_backend, ...LOCAL_SANDBOX_BACKEND_ORDER.filter((item) => item !== settings.preferred_backend)];
  }
  return LOCAL_SANDBOX_BACKEND_ORDER;
}

function isTrustedTarget(input: RuntimeReadinessInput): boolean {
  if (input.target?.trusted === true) return true;
  return input.target?.source_type === "path";
}

function isHardened(backend: LocalSandboxBackendId): boolean {
  return backend === "gvisor_container" || backend === "rootless_podman";
}

export function resolveLocalSandboxBackend(input: RuntimeReadinessInput = {}): LocalSandboxBackendResolution {
  const settings = normalizeRuntimeSandboxSettings(input.settings);
  const platform = input.platform ?? process.platform;
  const allowed = new Set(settings.allowed_backends);
  const candidates = backendCandidates(input, platform);
  const byId = new Map(candidates.map((item) => [item.backend_id, item]));
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!settings.enabled) {
    return {
      selected_backend: "unavailable",
      candidates,
      readiness_status: "blocked",
      warnings,
      blockers: ["Local Runtime Sandbox is disabled in admin settings."]
    };
  }

  const rank = backendRank(settings).filter((backend) => backend === "unavailable" || allowed.has(backend));
  let selected: RuntimeBackendCandidate | null = null;
  for (const backend of rank) {
    const item = byId.get(backend);
    if (!item) continue;
    if (item.status === "available" || (item.status === "warning" && settings.allow_warning_backends)) {
      selected = item;
      break;
    }
  }

  if (!selected) {
    blockers.push("No allowed Local Runtime Sandbox backend is available.");
  } else if (selected.status === "warning") {
    warnings.push(selected.reason);
  }

  if (selected && settings.require_hardened_for_untrusted_repo && !isTrustedTarget(input) && !isHardened(selected.backend_id)) {
    blockers.push("Admin policy requires a hardened local backend for untrusted repository targets.");
  }

  if (settings.resolution_mode === "pinned" && settings.preferred_backend !== "auto" && selected?.backend_id !== settings.preferred_backend) {
    blockers.push(`Pinned Local Runtime Sandbox backend '${settings.preferred_backend}' is not available.`);
  }

  const selectedBackend = blockers.length ? "unavailable" : (selected?.backend_id ?? "unavailable");
  const readiness_status: RuntimeReadinessStatus = blockers.length
    ? "blocked"
    : warnings.length || selected?.status === "warning"
      ? "ready_with_warnings"
      : "ready";
  return {
    selected_backend: selectedBackend,
    candidates,
    readiness_status,
    warnings,
    blockers
  };
}

export function buildRuntimeSandboxReadiness(input: RuntimeReadinessInput = {}): RuntimeSandboxReadiness {
  const settings = normalizeRuntimeSandboxSettings(input.settings);
  const platform = input.platform ?? process.platform;
  const resolution = resolveLocalSandboxBackend({ ...input, settings, platform });
  return {
    provider_id: "local_runtime",
    generated_at: new Date().toISOString(),
    platform,
    settings,
    resolution,
    setup_commands: buildRuntimeSetupCommands(platform),
    launchable: resolution.readiness_status === "ready" || resolution.readiness_status === "ready_with_warnings"
  };
}

export function buildRuntimeExecutionPolicy(args: {
  settings?: unknown;
  selectedBackend: LocalSandboxBackendId;
}): RuntimeExecutionPolicy {
  const settings = normalizeRuntimeSandboxSettings(args.settings);
  const allowInstall = settings.dependency_install_network !== "never";
  return {
    provider_id: "local_runtime",
    selected_backend: args.selectedBackend,
    allow_install: allowInstall,
    allow_build: true,
    allow_tests: true,
    allow_runtime_probe: true,
    network_policy: settings.network_policy,
    dependency_install_network: settings.dependency_install_network,
    runtime_probe_network: settings.runtime_probe_network,
    outbound_allowlist: settings.outbound_allowlist,
    max_duration_ms: settings.max_duration_ms,
    step_timeout_ms: settings.step_timeout_ms,
    max_stdout_bytes: settings.max_stdout_bytes,
    max_stderr_bytes: settings.max_stderr_bytes,
    memory_limit_mb: settings.memory_limit_mb,
    pids_limit: settings.pids_limit,
    max_file_bytes: settings.max_file_bytes,
    max_workspace_bytes: settings.max_workspace_bytes,
    max_artifact_bytes: settings.max_artifact_bytes,
    filesystem: {
      target_readonly: true,
      artifact_writeonly: true,
      block_host_mounts: true,
      skip_symlinks: true
    }
  };
}

export function buildRuntimeSetupCommands(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "win32") {
    return [
      "Install Docker Desktop or use a Linux worker for stronger local runtime validation.",
      "Start Docker Desktop, then run: npm run scan -- runtime-doctor",
      "For hardened local validation, use a Linux host with gVisor runsc."
    ];
  }
  if (platform === "darwin") {
    return [
      "Install Docker Desktop or Colima/Podman, then run: npm run scan -- runtime-doctor",
      "Use a Linux host with gVisor runsc for hardened local runtime validation."
    ];
  }
  return [
    "Install Podman or Docker through your OS package manager.",
    "For hardened local validation, install gVisor runsc.",
    "Run: npm run scan -- runtime-doctor"
  ];
}

export function getRuntimeSandboxProviders() {
  return [
    {
      id: "local_runtime",
      title: "Local Runtime Sandbox",
      product_mode: "oss",
      enabled: true
    },
    {
      id: "hosted_modal",
      title: "Hosted Modal Sandbox",
      product_mode: "hosted",
      enabled: false,
      hosted_only: true
    },
    {
      id: "hosted_e2b",
      title: "Hosted E2B Sandbox",
      product_mode: "hosted",
      enabled: false,
      hosted_only: true
    },
    {
      id: "hosted_daytona",
      title: "Hosted Daytona Sandbox",
      product_mode: "hosted",
      enabled: false,
      hosted_only: true
    }
  ];
}

export function isRuntimeRunMode(runMode: unknown): boolean {
  return runMode === "build" || runMode === "runtime" || runMode === "validate";
}

export function assertRuntimeLaunchAllowed(args: {
  readiness: RuntimeSandboxReadiness;
  acceptedWarnings?: boolean;
}): void {
  const status = args.readiness.resolution.readiness_status;
  if (status === "blocked") {
    throw new Error(`runtime_sandbox_not_ready:${args.readiness.resolution.blockers.join("; ") || "Local Runtime Sandbox is blocked."}`);
  }
  if (status === "ready_with_warnings" && !args.acceptedWarnings) {
    throw new Error(`runtime_sandbox_warning_acceptance_required:${args.readiness.resolution.warnings.join("; ") || "Local Runtime Sandbox has warnings."}`);
  }
}

export const LOCAL_RUNTIME_IMAGES = {
  alpine: "docker.io/library/alpine@sha256:1e42bbe2508154c9126d48c2b8a75420c3544343bf86fd041fb7527e017a4b4a",
  node: "docker.io/library/node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293",
  python: "docker.io/library/python:3.12-slim@sha256:2c941e860699f878900b0edc2403613c234d4b32eda3cc9fa7036991a2a63c4a"
} as const;

interface RuntimeCommandResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

export type RuntimeCommandRunner = (
  command: string,
  args: string[],
  options: { timeout_ms: number; max_stdout_bytes: number; max_stderr_bytes: number }
) => Promise<RuntimeCommandResult>;

interface ActiveRuntimeResources {
  runtime_command: "docker" | "podman";
  containers: Set<string>;
  networks: Set<string>;
  volume_names: Set<string>;
  cancelled: boolean;
}

function boundedText(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value, "utf8");
  return buffer.byteLength <= maxBytes ? value : buffer.subarray(0, maxBytes).toString("utf8");
}

async function directoryBytes(root: string): Promise<number> {
  let total = 0;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) total += (await fs.stat(entryPath)).size;
    }
  }
  return total;
}

function parseDockerJson(value: string): Record<string, any> {
  try {
    const parsed = JSON.parse(value.trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseWorkspaceBytes(value: string): number | null {
  const first = value.trim().split(/\s+/)[0];
  if (!first) return null;
  const kib = Number(first);
  return Number.isFinite(kib) && kib >= 0 ? kib * 1024 : null;
}

const defaultRuntimeCommandRunner: RuntimeCommandRunner = async (command, args, options) => await new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH ?? "" }
  });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, Math.max(1, options.timeout_ms));
  const finish = (error: Error | null, exitCode: number | null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    const result = {
      exit_code: exitCode,
      stdout: boundedText(stdout, options.max_stdout_bytes),
      stderr: boundedText(stderr, options.max_stderr_bytes),
      timed_out: timedOut
    };
    if (error) reject(Object.assign(error, { command_result: result }));
    else resolve(result);
  };
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
    if (Buffer.byteLength(stdout, "utf8") > options.max_stdout_bytes * 2) child.kill("SIGKILL");
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
    if (Buffer.byteLength(stderr, "utf8") > options.max_stderr_bytes * 2) child.kill("SIGKILL");
  });
  child.once("error", (error) => finish(error, null));
  child.once("close", (code) => finish(null, code));
});

function runtimeCommandForBackend(backend: LocalSandboxBackendId): "docker" | "podman" | null {
  if (backend === "docker" || backend === "docker_desktop" || backend === "gvisor_container") return "docker";
  if (backend === "podman" || backend === "rootless_podman") return "podman";
  return null;
}

function runtimeName(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "run";
  return `tethermark-${safe}-${process.pid}-${Date.now().toString(36)}`.slice(0, 63);
}

function imageDigest(image: string | null): string | null {
  return image?.match(/@(.+)$/)?.[1] ?? null;
}

function selectRuntimeImage(input: RuntimeValidationRequest): string | null {
  const stacks = new Set((input.detected_stack ?? []).map((item) => item.toLowerCase()));
  for (const step of input.steps ?? []) {
    const stack = String(step.artifact_context?.stack ?? "").toLowerCase();
    if (stack) stacks.add(stack);
    const binary = step.command[0]?.toLowerCase() ?? "";
    if (["node", "npm", "npx", "pnpm", "yarn"].includes(binary)) stacks.add("node");
    if (["python", "python3", "pip", "pip3", "pytest", "uv"].includes(binary)) stacks.add("python");
  }
  const node = stacks.has("node");
  const python = stacks.has("python");
  if (node && python) return null;
  if (python) return LOCAL_RUNTIME_IMAGES.python;
  if (node) return LOCAL_RUNTIME_IMAGES.node;
  return LOCAL_RUNTIME_IMAGES.alpine;
}

function phaseAllowed(step: RuntimeValidationStep, policy: RuntimeExecutionPolicy): boolean {
  if (step.phase === "install") return policy.allow_install;
  if (step.phase === "build") return policy.allow_build;
  if (step.phase === "test") return policy.allow_tests;
  return policy.allow_runtime_probe;
}

function validateRuntimeStep(step: RuntimeValidationStep): void {
  if (!step.step_id.trim() || !step.command.length || step.command.some((item) => !item || item.includes("\0"))) {
    throw new Error(`runtime_invalid_exact_argv:${step.step_id || "unnamed"}`);
  }
  if (step.command.length > 128 || step.command.some((item) => Buffer.byteLength(item, "utf8") > 8192)) {
    throw new Error(`runtime_argv_limit_exceeded:${step.step_id}`);
  }
}

async function validateRuntimePaths(input: RuntimeValidationRequest): Promise<{ targetDir: string; artifactDir: string }> {
  const targetDir = await fs.realpath(path.resolve(input.target_dir));
  const artifactDir = await fs.realpath(path.resolve(input.artifact_dir));
  const normalizedTarget = process.platform === "win32" ? targetDir.toLowerCase() : targetDir;
  const normalizedArtifacts = process.platform === "win32" ? artifactDir.toLowerCase() : artifactDir;
  const targetPrefix = `${normalizedTarget}${path.sep}`;
  const artifactPrefix = `${normalizedArtifacts}${path.sep}`;
  if (normalizedTarget === normalizedArtifacts || normalizedTarget.startsWith(artifactPrefix) || normalizedArtifacts.startsWith(targetPrefix)) {
    throw new Error("runtime_mount_boundary_invalid:target and artifact directories must be separate siblings");
  }
  if (targetDir.includes(",") || artifactDir.includes(",")) {
    throw new Error("runtime_mount_boundary_invalid:mount paths containing commas are unsupported");
  }
  return { targetDir, artifactDir };
}

function commandOptions(policy: RuntimeExecutionPolicy, timeoutMs: number) {
  return {
    timeout_ms: Math.max(1, Math.min(timeoutMs, policy.max_duration_ms)),
    max_stdout_bytes: policy.max_stdout_bytes,
    max_stderr_bytes: policy.max_stderr_bytes
  };
}

function cleanupCommandOptions() {
  return {
    timeout_ms: 20_000,
    max_stdout_bytes: DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_stdout_bytes,
    max_stderr_bytes: DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_stderr_bytes
  };
}

function containerSecurityArgs(policy: RuntimeExecutionPolicy, network: string = "none"): string[] {
  const memory = Math.max(64, Math.floor(policy.memory_limit_mb ?? DEFAULT_RUNTIME_SANDBOX_SETTINGS.memory_limit_mb));
  const pids = Math.max(16, Math.floor(policy.pids_limit ?? DEFAULT_RUNTIME_SANDBOX_SETTINGS.pids_limit));
  return [
    "--network", network,
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", String(pids),
    "--memory", `${memory}m`,
    "--cpus", "1",
    "--ulimit", `fsize=${Math.floor(policy.max_file_bytes)}:${Math.floor(policy.max_file_bytes)}`,
    "--init",
    "--user", "65532:65532",
    "--workdir", "/workspace",
    "--env", "CI=1",
    "--env", "HOME=/tmp",
    "--env", "PORT=3000",
    "--env", "TETHERMARK_RUNTIME_CREDENTIAL_MODE=synthetic",
    "--env", "TETHERMARK_FAKE_SECRET=tm_fake_runtime_validation_only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=67108864"
  ];
}

function validatedOutboundAllowlist(values: string[]): string[] {
  const normalized = [...new Set(values.map((item) => item.trim().toLowerCase().replace(/\.$/, "")))];
  if (!normalized.length || normalized.length > 64) throw new Error("runtime_egress_allowlist_required");
  for (const value of normalized) {
    if (!/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) {
      throw new Error(`runtime_egress_allowlist_invalid:${value}`);
    }
  }
  return normalized;
}

const EGRESS_PROXY_SCRIPT = `
const http=require('http'),https=require('https'),net=require('net'),dns=require('dns').promises;
const allow=JSON.parse(process.argv[1]||'[]');
const allowed=h=>allow.some(x=>x.startsWith('*.')?(h.endsWith(x.slice(1))&&h!==x.slice(2)):h===x);
const privateIp=ip=>{const v=ip.toLowerCase();if(v.startsWith('::ffff:'))return privateIp(v.slice(7));if(v.includes(':'))return v==='::'||v==='::1'||v.startsWith('fc')||v.startsWith('fd')||/^fe[89ab]/.test(v)||v.startsWith('ff');const p=v.split('.').map(Number);return p.length!==4||p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127);};
async function resolvePublic(host){if(!allowed(host))throw Error('destination_not_allowlisted');const all=await dns.lookup(host,{all:true});if(!all.length||all.some(x=>privateIp(x.address)))throw Error('destination_not_public');return all[0].address;}
function deny(socket,code=403){socket.end('HTTP/1.1 '+code+' Forbidden\\r\\nConnection: close\\r\\n\\r\\n');}
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url);const host=u.hostname.toLowerCase();if(!['http:','https:'].includes(u.protocol))throw Error('scheme');const port=Number(u.port|| (u.protocol==='https:'?443:80));if(port!==80&&port!==443)throw Error('port');const ip=await resolvePublic(host);const client=(u.protocol==='https:'?https:http).request({hostname:ip,port,path:u.pathname+u.search,method:req.method,headers:{...req.headers,host:u.host},servername:host},up=>{res.writeHead(up.statusCode||502,up.headers);up.pipe(res)});client.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(client)}catch{res.writeHead(403);res.end()}});
server.on('connect',async(req,client,head)=>{try{const i=req.url.lastIndexOf(':');const host=(i<0?req.url:req.url.slice(0,i)).toLowerCase();const port=Number(i<0?443:req.url.slice(i+1));if(port!==443)throw Error('port');const ip=await resolvePublic(host);const upstream=net.connect(port,ip,()=>{client.write('HTTP/1.1 200 Connection Established\\r\\n\\r\\n');if(head.length)upstream.write(head);upstream.pipe(client);client.pipe(upstream)});upstream.on('error',()=>deny(client,502))}catch{deny(client)}});
server.listen(8080,'0.0.0.0');`;

const SYNTHETIC_SERVICE_SCRIPT = `
const http=require('http'),fs=require('fs'),crypto=require('crypto');
const trace='/artifacts/synthetic-service-calls.ndjson';
const send=(res,code,value)=>{const body=JSON.stringify(value);res.writeHead(code,{'content-type':'application/json','content-length':Buffer.byteLength(body)});res.end(body)};
http.createServer((req,res)=>{let body='';req.on('data',chunk=>{body+=chunk;if(Buffer.byteLength(body)>65536)req.destroy()});req.on('end',()=>{const event={at:new Date().toISOString(),method:req.method,path:req.url,body_sha256:crypto.createHash('sha256').update(body).digest('hex')};fs.appendFileSync(trace,JSON.stringify(event)+'\\n');if(req.url==='/health')return send(res,200,{ok:true,service:'tethermark-synthetic'});if(req.url==='/secret')return send(res,200,{value:'tm_fake_runtime_validation_only',synthetic:true});if(req.url==='/tool'&&req.method==='POST')return send(res,200,{ok:true,tool:'synthetic_echo',input_sha256:event.body_sha256});send(res,404,{ok:false,error:'not_found'})})}).listen(8081,'0.0.0.0');`;

function blockedStep(step: RuntimeValidationStep, summary: string, image: string | null): RuntimeValidationStepResult {
  return {
    step_id: step.step_id,
    status: step.enabled ? "blocked" : "skipped",
    checked_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    duration_ms: null,
    execution_runtime: "container",
    summary,
    exit_code: null,
    stdout_excerpt: null,
    stderr_excerpt: null,
    timed_out: false,
    container_name: null,
    image,
    command: [...step.command],
    network_mode: "none",
    adapter: step.adapter,
    artifact_context: step.artifact_context
  };
}

export function createLocalRuntimeProvider(options: { runCommand?: RuntimeCommandRunner } = {}): RuntimeSandboxProvider {
  const runCommand = options.runCommand ?? defaultRuntimeCommandRunner;
  const active = new Map<string, ActiveRuntimeResources>();
  const artifactsByRun = new Map<string, RuntimeValidationArtifact[]>();

  const measureVolume = async (args: {
    runtimeCommand: "docker" | "podman";
    resources: ActiveRuntimeResources;
    baseName: string;
    volumeName: string;
    image: string;
    policy: RuntimeExecutionPolicy;
    remainingMs: number;
    suffix: string;
    gvisor: boolean;
    mountTarget: "/workspace" | "/artifacts";
  }): Promise<number | null> => {
    const name = `${args.baseName}-quota-${args.suffix}`.slice(0, 63);
    args.resources.containers.add(name);
    const createArgs = [
      "create", "--name", name,
      "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--user", "65532:65532",
      "--mount", `type=volume,source=${args.volumeName},target=${args.mountTarget},readonly`,
      args.image, "du", "-sk", args.mountTarget
    ];
    if (args.gvisor) createArgs.splice(3, 0, "--runtime", "runsc");
    const created = await runCommand(args.runtimeCommand, createArgs, commandOptions(args.policy, Math.min(10_000, args.remainingMs)));
    if (created.exit_code !== 0) return null;
    try {
      const measured = await runCommand(args.runtimeCommand, ["start", "--attach", name], commandOptions(args.policy, Math.min(10_000, args.remainingMs)));
      return measured.exit_code === 0 ? parseWorkspaceBytes(measured.stdout) : null;
    } finally {
      const removal = await runCommand(args.runtimeCommand, ["rm", "--force", name], cleanupCommandOptions()).catch(() => null);
      if (removal?.exit_code === 0) args.resources.containers.delete(name);
    }
  };

  const cleanup = async (runId: string, markCancelled = false): Promise<RuntimeValidationCleanup> => {
    const resources = active.get(runId);
    const result: RuntimeValidationCleanup = { containers_removed: true, workspace_volume_removed: true, errors: [] };
    if (!resources) return result;
    if (markCancelled) resources.cancelled = true;
    for (const container of [...resources.containers]) {
      try {
        const removal = await runCommand(resources.runtime_command, ["rm", "--force", container], cleanupCommandOptions());
        const inspect = removal.exit_code === 0
          ? null
          : await runCommand(resources.runtime_command, ["inspect", container], cleanupCommandOptions()).catch(() => null);
        if (removal.exit_code !== 0 && inspect?.exit_code === 0) {
          result.containers_removed = false;
          result.errors.push(`container:${container}:${removal.stderr || removal.stdout}`);
        } else {
          resources.containers.delete(container);
        }
      } catch (error) {
        result.containers_removed = false;
        result.errors.push(`container:${container}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (const network of [...resources.networks]) {
      try {
        const removal = await runCommand(resources.runtime_command, ["network", "rm", network], cleanupCommandOptions());
        const inspect = removal.exit_code === 0
          ? null
          : await runCommand(resources.runtime_command, ["network", "inspect", network], cleanupCommandOptions()).catch(() => null);
        if (removal.exit_code !== 0 && inspect?.exit_code === 0) {
          result.containers_removed = false;
          result.errors.push(`network:${network}:${removal.stderr || removal.stdout}`);
        } else {
          resources.networks.delete(network);
        }
      } catch (error) {
        result.containers_removed = false;
        result.errors.push(`network:${network}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (const volumeName of [...resources.volume_names]) {
      try {
        const removal = await runCommand(resources.runtime_command, ["volume", "rm", "--force", volumeName], cleanupCommandOptions());
        const inspect = removal.exit_code === 0
          ? null
          : await runCommand(resources.runtime_command, ["volume", "inspect", volumeName], cleanupCommandOptions()).catch(() => null);
        if (removal.exit_code !== 0 && inspect?.exit_code === 0) {
          result.workspace_volume_removed = false;
          result.errors.push(`volume:${volumeName}:${removal.stderr || removal.stdout}`);
        } else {
          resources.volume_names.delete(volumeName);
        }
      } catch (error) {
        result.workspace_volume_removed = false;
        result.errors.push(`volume:${volumeName}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!markCancelled) active.delete(runId);
    return result;
  };

  return {
    id: "local_runtime",
    async readiness(input) {
      return buildRuntimeSandboxReadiness(input);
    },
    async plan(input) {
      const steps = (input.steps ?? []).map((step) => {
        validateRuntimeStep(step);
        return { ...step, command: [...step.command], enabled: step.enabled && phaseAllowed(step, input.policy) };
      });
      const image = selectRuntimeImage({ ...input, steps });
      return {
        provider_id: "local_runtime",
        selected_backend: input.policy.selected_backend,
        image,
        image_digest: imageDigest(image),
        steps
      };
    },
    async execute(input, plan) {
      const runtimeCommand = runtimeCommandForBackend(plan.selected_backend);
      const initialCleanup: RuntimeValidationCleanup = { containers_removed: true, workspace_volume_removed: true, errors: [] };
      if (!runtimeCommand) {
        const steps = plan.steps.map((step) => blockedStep(step, `Selected backend '${plan.selected_backend}' is not executable by the local provider.`, plan.image));
        return { provider_id: "local_runtime", selected_backend: plan.selected_backend, status: "blocked", artifacts: [], steps, cleanup: initialCleanup };
      }
      if (!plan.image || !plan.image_digest) {
        const steps = plan.steps.map((step) => blockedStep(step, "Mixed Node/Python runtime targets require a pinned combined runner image.", null));
        return { provider_id: "local_runtime", selected_backend: plan.selected_backend, status: "blocked", artifacts: [], steps, cleanup: initialCleanup };
      }

      let paths: { targetDir: string; artifactDir: string };
      try {
        paths = await validateRuntimePaths(input);
      } catch (error) {
        const summary = error instanceof Error ? error.message : String(error);
        const steps = plan.steps.map((step) => blockedStep(step, summary, plan.image));
        return { provider_id: "local_runtime", selected_backend: plan.selected_backend, status: "blocked", artifacts: [], steps, cleanup: initialCleanup };
      }

      try {
        const sourceBytes = await directoryBytes(paths.targetDir);
        if (sourceBytes > input.policy.max_workspace_bytes) {
          throw new Error(`runtime_workspace_quota_exceeded:source=${sourceBytes}:limit=${input.policy.max_workspace_bytes}`);
        }
      } catch (error) {
        const summary = error instanceof Error ? error.message : String(error);
        const steps = plan.steps.map((step) => blockedStep(step, summary, plan.image));
        return { provider_id: "local_runtime", selected_backend: plan.selected_backend, status: "blocked", artifacts: [], steps, cleanup: initialCleanup };
      }

      const baseName = runtimeName(input.run_id);
      const volumeName = `${baseName}-workspace`;
      const artifactVolumeName = runtimeCommand === "docker" ? `${baseName}-artifacts` : null;
      const resources: ActiveRuntimeResources = {
        runtime_command: runtimeCommand,
        containers: new Set(),
        networks: new Set(),
        volume_names: new Set([volumeName, ...(artifactVolumeName ? [artifactVolumeName] : [])]),
        cancelled: false
      };
      active.set(input.run_id, resources);
      const results: RuntimeValidationStepResult[] = [];
      const artifacts: RuntimeValidationArtifact[] = [];
      const started = Date.now();
      let runtimeVersion: string | null = null;
      let egressNetworkName: string | null = null;
      let syntheticNetworkName: string | null = null;
      let egressProxyName: string | null = null;
      let egressAllowlist: string[] = [];
      let syntheticServiceName: string | null = null;
      let infrastructureFailure: string | null = null;
      const remaining = () => Math.max(1, input.policy.max_duration_ms - (Date.now() - started));
      const ensureInternalNetwork = async (kind: "egress" | "synthetic"): Promise<string> => {
        const existing = kind === "egress" ? egressNetworkName : syntheticNetworkName;
        if (existing) return existing;
        if (runtimeCommand !== "docker") throw new Error("runtime_internal_service_backend_unsupported");
        const networkName = `${baseName}-${kind}`.slice(0, 63);
        const network = await runCommand(runtimeCommand, ["network", "create", "--internal", networkName], commandOptions(input.policy, Math.min(20_000, remaining())));
        if (network.exit_code !== 0) throw new Error(`runtime_egress_network_create_failed:${network.stderr || network.stdout}`);
        resources.networks.add(networkName);
        if (kind === "egress") egressNetworkName = networkName;
        else syntheticNetworkName = networkName;
        return networkName;
      };
      const ensureNodeServiceImage = async (): Promise<void> => {
        const proxyInspect = await runCommand(runtimeCommand, ["image", "inspect", LOCAL_RUNTIME_IMAGES.node], commandOptions(input.policy, Math.min(15_000, remaining())));
        if (proxyInspect.exit_code !== 0) {
          const proxyPull = await runCommand(runtimeCommand, ["pull", LOCAL_RUNTIME_IMAGES.node], commandOptions(input.policy, Math.min(180_000, remaining())));
          if (proxyPull.exit_code !== 0) throw new Error(`runtime_egress_proxy_image_unavailable:${proxyPull.stderr || proxyPull.stdout}`);
        }
      };
      const ensureEgressProxy = async (): Promise<string> => {
        if (egressProxyName && egressNetworkName) return egressNetworkName;
        if (runtimeCommand !== "docker") throw new Error("runtime_allowlisted_egress_backend_unsupported");
        egressAllowlist = validatedOutboundAllowlist(input.policy.outbound_allowlist);
        const networkName = await ensureInternalNetwork("egress");
        const proxyName = `${baseName}-proxy`.slice(0, 63);
        await ensureNodeServiceImage();
        resources.containers.add(proxyName);
        const proxyArgs = [
          "create", "--name", proxyName,
          ...containerSecurityArgs(input.policy, networkName),
          "--network-alias", "tethermark-egress-proxy",
          LOCAL_RUNTIME_IMAGES.node,
          "node", "-e", EGRESS_PROXY_SCRIPT, JSON.stringify(egressAllowlist)
        ];
        const proxyCreate = await runCommand(runtimeCommand, proxyArgs, commandOptions(input.policy, Math.min(20_000, remaining())));
        if (proxyCreate.exit_code !== 0) throw new Error(`runtime_egress_proxy_create_failed:${proxyCreate.stderr || proxyCreate.stdout}`);
        const bridgeConnect = await runCommand(runtimeCommand, ["network", "connect", "bridge", proxyName], commandOptions(input.policy, Math.min(20_000, remaining())));
        if (bridgeConnect.exit_code !== 0) throw new Error(`runtime_egress_proxy_bridge_failed:${bridgeConnect.stderr || bridgeConnect.stdout}`);
        const proxyStart = await runCommand(runtimeCommand, ["start", proxyName], commandOptions(input.policy, Math.min(20_000, remaining())));
        if (proxyStart.exit_code !== 0) throw new Error(`runtime_egress_proxy_start_failed:${proxyStart.stderr || proxyStart.stdout}`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, remaining())));
        egressProxyName = proxyName;
        return networkName;
      };
      const ensureSyntheticService = async (): Promise<string> => {
        if (syntheticServiceName && syntheticNetworkName) return syntheticNetworkName;
        if (!artifactVolumeName) throw new Error("runtime_synthetic_service_requires_isolated_artifacts");
        const networkName = await ensureInternalNetwork("synthetic");
        await ensureNodeServiceImage();
        const serviceName = `${baseName}-fake-tool`.slice(0, 63);
        resources.containers.add(serviceName);
        const serviceArgs = [
          "create", "--name", serviceName,
          ...containerSecurityArgs(input.policy, networkName),
          "--network-alias", "tethermark-fake-service",
          "--mount", `type=volume,source=${artifactVolumeName},target=/artifacts`,
          LOCAL_RUNTIME_IMAGES.node,
          "node", "-e", SYNTHETIC_SERVICE_SCRIPT
        ];
        const serviceCreate = await runCommand(runtimeCommand, serviceArgs, commandOptions(input.policy, Math.min(20_000, remaining())));
        if (serviceCreate.exit_code !== 0) throw new Error(`runtime_synthetic_service_create_failed:${serviceCreate.stderr || serviceCreate.stdout}`);
        const serviceStart = await runCommand(runtimeCommand, ["start", serviceName], commandOptions(input.policy, Math.min(20_000, remaining())));
        if (serviceStart.exit_code !== 0) throw new Error(`runtime_synthetic_service_start_failed:${serviceStart.stderr || serviceStart.stdout}`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(300, remaining())));
        syntheticServiceName = serviceName;
        return networkName;
      };

      try {
        const version = await runCommand(runtimeCommand, ["version", "--format", "{{.Server.Version}}"], commandOptions(input.policy, Math.min(10_000, remaining())));
        if (resources.cancelled) throw new Error("runtime_execution_cancelled");
        runtimeVersion = version.exit_code === 0 ? version.stdout.trim() || null : null;
        const inspect = await runCommand(runtimeCommand, ["image", "inspect", plan.image], commandOptions(input.policy, Math.min(15_000, remaining())));
        if (resources.cancelled) throw new Error("runtime_execution_cancelled");
        if (inspect.exit_code !== 0) {
          const pull = await runCommand(runtimeCommand, ["pull", plan.image], commandOptions(input.policy, Math.min(180_000, remaining())));
          if (resources.cancelled) throw new Error("runtime_execution_cancelled");
          if (pull.exit_code !== 0) throw new Error(`runtime_image_unavailable:${pull.stderr || pull.stdout}`);
        }
        const volumeArgs = runtimeCommand === "docker"
          ? [
            "volume", "create",
            "--driver", "local",
            "--opt", "type=tmpfs",
            "--opt", "device=tmpfs",
            "--opt", `o=size=${Math.floor(input.policy.max_workspace_bytes)},uid=65532,gid=65532,mode=0750`,
            volumeName
          ]
          : ["volume", "create", volumeName];
        const volume = await runCommand(runtimeCommand, volumeArgs, commandOptions(input.policy, Math.min(20_000, remaining())));
        if (resources.cancelled) throw new Error("runtime_execution_cancelled");
        if (volume.exit_code !== 0) throw new Error(`runtime_workspace_create_failed:${volume.stderr || volume.stdout}`);
        if (artifactVolumeName) {
          const artifactVolume = await runCommand(runtimeCommand, [
            "volume", "create",
            "--driver", "local",
            "--opt", "type=tmpfs",
            "--opt", "device=tmpfs",
            "--opt", `o=size=${Math.floor(input.policy.max_artifact_bytes)},uid=65532,gid=65532,mode=0750`,
            artifactVolumeName
          ], commandOptions(input.policy, Math.min(20_000, remaining())));
          if (artifactVolume.exit_code !== 0) throw new Error(`runtime_artifact_scratch_create_failed:${artifactVolume.stderr || artifactVolume.stdout}`);
        }

        if (runtimeCommand === "docker") {
          const keeperName = `${baseName}-keeper`.slice(0, 63);
          resources.containers.add(keeperName);
          const keeperArgs = [
            "create", "--name", keeperName,
            ...containerSecurityArgs(input.policy),
            "--mount", `type=volume,source=${volumeName},target=/workspace`,
            ...(artifactVolumeName ? ["--mount", `type=volume,source=${artifactVolumeName},target=/artifacts`] : []),
            plan.image, "/bin/sh", "-c", "while :; do sleep 3600; done"
          ];
          if (plan.selected_backend === "gvisor_container") keeperArgs.splice(3, 0, "--runtime", "runsc");
          const keeperCreate = await runCommand(runtimeCommand, keeperArgs, commandOptions(input.policy, Math.min(20_000, remaining())));
          if (keeperCreate.exit_code !== 0) throw new Error(`runtime_workspace_keeper_create_failed:${keeperCreate.stderr || keeperCreate.stdout}`);
          const keeperStart = await runCommand(runtimeCommand, ["start", keeperName], commandOptions(input.policy, Math.min(20_000, remaining())));
          if (keeperStart.exit_code !== 0) throw new Error(`runtime_workspace_keeper_start_failed:${keeperStart.stderr || keeperStart.stdout}`);
        }

        const stageName = `${baseName}-stage`.slice(0, 63);
        resources.containers.add(stageName);
        const stageArgs = [
          "create", "--name", stageName,
          "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
          ...(runtimeCommand === "docker" ? ["--user", "65532:65532"] : []),
          "--mount", `type=bind,source=${paths.targetDir},target=/input,readonly`,
          "--mount", `type=volume,source=${volumeName},target=/workspace`,
          plan.image, "/bin/sh", "-c",
          "cd /input && find . -type d -exec mkdir -p /workspace/{} ';' && find . -type f -exec cp {} /workspace/{} ';'"
        ];
        if (plan.selected_backend === "gvisor_container") stageArgs.splice(3, 0, "--runtime", "runsc");
        const stageCreate = await runCommand(runtimeCommand, stageArgs, commandOptions(input.policy, Math.min(20_000, remaining())));
        if (stageCreate.exit_code !== 0) throw new Error(`runtime_stage_create_failed:${stageCreate.stderr || stageCreate.stdout}`);
        const stageStart = await runCommand(runtimeCommand, ["start", "--attach", stageName], commandOptions(input.policy, Math.min(input.policy.step_timeout_ms, remaining())));
        if (resources.cancelled) throw new Error("runtime_execution_cancelled");
        if (stageStart.exit_code !== 0) throw new Error(`runtime_stage_copy_failed:${stageStart.stderr || stageStart.stdout}`);
        const stageRemoval = await runCommand(runtimeCommand, ["rm", "--force", stageName], commandOptions(input.policy, Math.min(20_000, remaining())));
        if (stageRemoval.exit_code === 0) resources.containers.delete(stageName);

        if (runtimeCommand !== "docker") {
          const ownerName = `${baseName}-owner`.slice(0, 63);
          resources.containers.add(ownerName);
          const ownerArgs = [
            "create", "--name", ownerName,
            "--network", "none", "--read-only", "--cap-drop", "ALL", "--cap-add", "CHOWN", "--security-opt", "no-new-privileges",
            "--mount", `type=volume,source=${volumeName},target=/workspace`,
            plan.image, "chown", "-R", "65532:65532", "/workspace"
          ];
          const ownerCreate = await runCommand(runtimeCommand, ownerArgs, commandOptions(input.policy, Math.min(20_000, remaining())));
          if (ownerCreate.exit_code !== 0) throw new Error(`runtime_workspace_owner_create_failed:${ownerCreate.stderr || ownerCreate.stdout}`);
          const ownerStart = await runCommand(runtimeCommand, ["start", "--attach", ownerName], commandOptions(input.policy, Math.min(input.policy.step_timeout_ms, remaining())));
          if (resources.cancelled) throw new Error("runtime_execution_cancelled");
          if (ownerStart.exit_code !== 0) throw new Error(`runtime_workspace_owner_failed:${ownerStart.stderr || ownerStart.stdout}`);
          const ownerRemoval = await runCommand(runtimeCommand, ["rm", "--force", ownerName], commandOptions(input.policy, Math.min(20_000, remaining())));
          if (ownerRemoval.exit_code === 0) resources.containers.delete(ownerName);
        }

        for (const [index, step] of plan.steps.entries()) {
          if (resources.cancelled) throw new Error("runtime_execution_cancelled");
          if (!step.enabled) {
            results.push(blockedStep(step, "Step is disabled by the resolved runtime policy.", plan.image));
            continue;
          }
          if (Date.now() - started >= input.policy.max_duration_ms) {
            results.push(blockedStep(step, "The overall runtime execution budget was exhausted before this step.", plan.image));
            continue;
          }
          const externalRuntimeProbe = step.requires_network
            && step.phase === "runtime_probe"
            && step.artifact_context?.external_network === true;
          const needsExternalNetwork = step.requires_network && (step.phase !== "runtime_probe" || externalRuntimeProbe);
          const allowlistedInstall = needsExternalNetwork
            && step.phase === "install"
            && input.policy.network_policy !== "none"
            && input.policy.dependency_install_network !== "never"
            && input.policy.outbound_allowlist.length > 0;
          const allowlistedRuntimeProbe = externalRuntimeProbe
            && (input.policy.network_policy === "bounded" || input.policy.network_policy === "allowlist")
            && input.policy.runtime_probe_network !== "never"
            && input.policy.outbound_allowlist.length > 0;
          const useAllowlistedEgress = allowlistedInstall || allowlistedRuntimeProbe;
          const requestedSyntheticServices = Array.isArray(step.artifact_context?.synthetic_services)
            ? (step.artifact_context.synthetic_services as unknown[]).map((item) => String(item))
            : [];
          const unsupportedSyntheticService = requestedSyntheticServices.find((item) => item !== "fake_tool_api");
          if (unsupportedSyntheticService) {
            results.push(blockedStep(step, `runtime_synthetic_service_unsupported:${unsupportedSyntheticService}`, plan.image));
            continue;
          }
          const useSyntheticService = requestedSyntheticServices.includes("fake_tool_api");
          if (useSyntheticService && useAllowlistedEgress) {
            results.push(blockedStep(step, "runtime_network_phase_conflict:synthetic services and external egress require separate steps", plan.image));
            continue;
          }
          if (needsExternalNetwork && !useAllowlistedEgress) {
            results.push(blockedStep(step, input.policy.network_policy === "none"
              ? "Step requires network access, but the resolved runtime policy is network none."
              : "External network is restricted to an explicitly enabled allowlist phase." , plan.image));
            continue;
          }
          let stepNetwork = "none";
          if (useSyntheticService) {
            try {
              stepNetwork = await ensureSyntheticService();
            } catch (error) {
              results.push(blockedStep(step, error instanceof Error ? error.message : String(error), plan.image));
              continue;
            }
          }
          if (useAllowlistedEgress) {
            try {
              stepNetwork = await ensureEgressProxy();
            } catch (error) {
              results.push(blockedStep(step, error instanceof Error ? error.message : String(error), plan.image));
              continue;
            }
          }
          const containerName = `${baseName}-${index}-${step.step_id.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-")}`.slice(0, 63);
          resources.containers.add(containerName);
          const createArgs = [
            "create", "--name", containerName,
            ...containerSecurityArgs(input.policy, stepNetwork),
            ...(useAllowlistedEgress ? [
              "--env", "HTTP_PROXY=http://tethermark-egress-proxy:8080",
              "--env", "HTTPS_PROXY=http://tethermark-egress-proxy:8080",
              "--env", "NO_PROXY=localhost,127.0.0.1,::1,tethermark-fake-service"
            ] : []),
            ...(useSyntheticService ? [
              "--env", "TETHERMARK_FAKE_SERVICE_URL=http://tethermark-fake-service:8081",
              "--env", "TETHERMARK_FAKE_TOOL_URL=http://tethermark-fake-service:8081/tool"
            ] : []),
            "--mount", `type=volume,source=${volumeName},target=/workspace`,
            "--mount", artifactVolumeName
              ? `type=volume,source=${artifactVolumeName},target=/artifacts`
              : `type=bind,source=${paths.artifactDir},target=/artifacts`,
            plan.image,
            ...step.command
          ];
          if (plan.selected_backend === "gvisor_container") createArgs.splice(3, 0, "--runtime", "runsc");
          const checkedAt = new Date().toISOString();
          const startedAt = new Date().toISOString();
          const stepStarted = Date.now();
          const createResult = await runCommand(runtimeCommand, createArgs, commandOptions(input.policy, Math.min(20_000, remaining())));
          if (createResult.exit_code !== 0) {
            results.push({
              ...blockedStep(step, `Container creation failed: ${createResult.stderr || createResult.stdout}`, plan.image),
              checked_at: checkedAt,
              started_at: startedAt,
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - stepStarted,
              status: "failed",
              stderr_excerpt: createResult.stderr || null,
              stdout_excerpt: createResult.stdout || null,
              container_name: containerName
            });
            continue;
          }

          let commandResult: RuntimeCommandResult;
          if (step.phase === "runtime_probe") {
            const startResult = await runCommand(runtimeCommand, ["start", containerName], commandOptions(input.policy, Math.min(20_000, remaining())));
            if (startResult.exit_code !== 0) {
              commandResult = startResult;
            } else {
              await new Promise((resolve) => setTimeout(resolve, Math.min(1_500, remaining())));
              const state = await runCommand(runtimeCommand, ["inspect", "--format", "{{json .State}}", containerName], commandOptions(input.policy, Math.min(10_000, remaining())));
              const logs = await runCommand(runtimeCommand, ["logs", containerName], commandOptions(input.policy, Math.min(10_000, remaining())));
              let stateJson: any = {};
              try { stateJson = JSON.parse(state.stdout.trim()); } catch {}
              commandResult = {
                exit_code: stateJson.Running === true ? 0 : typeof stateJson.ExitCode === "number" ? stateJson.ExitCode : state.exit_code,
                stdout: logs.stdout,
                stderr: logs.stderr || state.stderr,
                timed_out: false
              };
            }
          } else {
            commandResult = await runCommand(runtimeCommand, ["start", "--attach", containerName], commandOptions(input.policy, Math.min(input.policy.step_timeout_ms, remaining())));
          }
          if (resources.cancelled) throw new Error("runtime_execution_cancelled");
          const stateResult = await runCommand(runtimeCommand, ["inspect", "--format", "{{json .State}}", containerName], commandOptions(input.policy, Math.min(10_000, remaining()))).catch(() => null);
          const stateJson = parseDockerJson(stateResult?.stdout ?? "");
          const statsResult = await runCommand(runtimeCommand, ["stats", "--no-stream", "--format", "{{json .}}", containerName], commandOptions(input.policy, Math.min(10_000, remaining()))).catch(() => null);
          const statsJson = parseDockerJson(statsResult?.stdout ?? "");
          const workspaceBytes = await measureVolume({
            runtimeCommand,
            resources,
            baseName,
            volumeName,
            image: plan.image,
            policy: input.policy,
            remainingMs: remaining(),
            suffix: String(index),
            gvisor: plan.selected_backend === "gvisor_container",
            mountTarget: "/workspace"
          });
          const artifactBytes = artifactVolumeName
            ? await measureVolume({
              runtimeCommand,
              resources,
              baseName,
              volumeName: artifactVolumeName,
              image: plan.image,
              policy: input.policy,
              remainingMs: remaining(),
              suffix: `artifacts-${index}`,
              gvisor: plan.selected_backend === "gvisor_container",
              mountTarget: "/artifacts"
            })
            : await directoryBytes(paths.artifactDir).catch(() => null);
          const quotaMeasured = workspaceBytes !== null && artifactBytes !== null;
          const quotaExceeded = quotaMeasured && (workspaceBytes > input.policy.max_workspace_bytes || artifactBytes > input.policy.max_artifact_bytes);
          const oomKilled = typeof stateJson.OOMKilled === "boolean" ? stateJson.OOMKilled : null;
          const resourceSummary: RuntimeValidationResourceSummary = {
            cpu_percent: typeof statsJson.CPUPerc === "string" ? statsJson.CPUPerc : null,
            memory_usage: typeof statsJson.MemUsage === "string" ? statsJson.MemUsage : null,
            memory_percent: typeof statsJson.MemPerc === "string" ? statsJson.MemPerc : null,
            pids: typeof statsJson.PIDs === "string" ? statsJson.PIDs : null,
            block_io: typeof statsJson.BlockIO === "string" ? statsJson.BlockIO : null,
            network_io: typeof statsJson.NetIO === "string" ? statsJson.NetIO : null,
            oom_killed: oomKilled,
            container_pid: typeof stateJson.Pid === "number" ? stateJson.Pid : null,
            workspace_bytes: workspaceBytes,
            artifact_bytes: artifactBytes,
            max_file_bytes: input.policy.max_file_bytes,
            max_workspace_bytes: input.policy.max_workspace_bytes,
            max_artifact_bytes: input.policy.max_artifact_bytes,
            quota_exceeded: quotaExceeded
          };
          const completedNormally = commandResult.exit_code === 0 && !commandResult.timed_out;
          const status = completedNormally && quotaMeasured && !quotaExceeded && oomKilled !== true ? "completed" : "failed";
          const summary = !quotaMeasured
            ? `Isolated container step '${step.step_id}' failed closed because workspace quota accounting was unavailable.`
            : quotaExceeded
              ? `Isolated container step '${step.step_id}' exceeded a workspace or artifact quota.`
              : oomKilled
                ? `Isolated container step '${step.step_id}' exceeded its memory limit and was OOM-killed.`
                : status === "completed"
                  ? `Isolated container step '${step.step_id}' completed.`
                  : `Isolated container step '${step.step_id}' failed.`;
          const result: RuntimeValidationStepResult = {
            step_id: step.step_id,
            status,
            checked_at: checkedAt,
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - stepStarted,
            execution_runtime: "container",
            summary,
            exit_code: commandResult.exit_code,
            stdout_excerpt: commandResult.stdout || null,
            stderr_excerpt: commandResult.stderr || null,
            timed_out: commandResult.timed_out,
            container_name: containerName,
            image: plan.image,
            command: [...step.command],
            container_create_argv: [...createArgs],
            runtime_version: runtimeVersion,
            resource_summary: resourceSummary,
            network_mode: stepNetwork === "none" ? "none" : "bridge",
            adapter: step.adapter,
            artifact_context: step.artifact_context
          };
          results.push(result);
          artifacts.push({
            artifact_id: `${input.run_id}:${step.step_id}`,
            run_id: input.run_id,
            artifact_type: `runtime_${step.phase}`,
            path: null,
            summary: result.summary,
            metadata: {
              backend: plan.selected_backend,
              runtime_command: runtimeCommand,
              runtime_version: runtimeVersion,
              image: plan.image,
              image_digest: plan.image_digest,
              exact_command: step.command,
              policy: input.policy,
              result
            }
          });
          const containerRemoval = await runCommand(runtimeCommand, ["rm", "--force", containerName], commandOptions(input.policy, Math.min(20_000, remaining())));
          if (containerRemoval.exit_code === 0) resources.containers.delete(containerName);
        }
        if (artifactVolumeName) {
          const collectorName = `${baseName}-collector`.slice(0, 63);
          resources.containers.add(collectorName);
          const collectorArgs = [
            "create", "--name", collectorName,
            "--network", "none", "--read-only", "--cap-drop", "ALL", "--cap-add", "DAC_OVERRIDE",
            "--security-opt", "no-new-privileges", "--user", "0:0",
            "--mount", `type=volume,source=${artifactVolumeName},target=/artifacts,readonly`,
            "--mount", `type=bind,source=${paths.artifactDir},target=/output`,
            plan.image, "/bin/sh", "-c",
            "cd /artifacts && find . -type d -exec mkdir -p /output/{} ';' && find . -type f -exec cp {} /output/{} ';'"
          ];
          if (plan.selected_backend === "gvisor_container") collectorArgs.splice(3, 0, "--runtime", "runsc");
          const collectorCreate = await runCommand(runtimeCommand, collectorArgs, commandOptions(input.policy, Math.min(20_000, remaining())));
          if (collectorCreate.exit_code !== 0) throw new Error(`runtime_artifact_collector_create_failed:${collectorCreate.stderr || collectorCreate.stdout}`);
          const collectorStart = await runCommand(runtimeCommand, ["start", "--attach", collectorName], commandOptions(input.policy, Math.min(20_000, remaining())));
          if (collectorStart.exit_code !== 0) throw new Error(`runtime_artifact_collection_failed:${collectorStart.stderr || collectorStart.stdout}`);
          const collectorRemoval = await runCommand(runtimeCommand, ["rm", "--force", collectorName], commandOptions(input.policy, Math.min(20_000, remaining())));
          if (collectorRemoval.exit_code === 0) resources.containers.delete(collectorName);
        }
      } catch (error) {
        const commandResult = error && typeof error === "object" && "command_result" in error
          ? (error as { command_result?: RuntimeCommandResult }).command_result
          : null;
        const summary = error instanceof Error ? error.message : String(error);
        infrastructureFailure = summary;
        for (const step of plan.steps.slice(results.length)) {
          results.push({ ...blockedStep(step, summary, plan.image), stderr_excerpt: commandResult?.stderr || summary });
        }
      }

      const cleanupResult = await cleanup(input.run_id);
      const executionArtifact: RuntimeValidationArtifact = {
        artifact_id: `${input.run_id}:runtime-execution`,
        run_id: input.run_id,
        artifact_type: "runtime_execution",
        path: null,
        summary: cleanupResult.containers_removed && cleanupResult.workspace_volume_removed
          ? "Isolated runtime execution finished and resources were removed."
          : "Isolated runtime execution finished with cleanup errors.",
        metadata: {
          backend: plan.selected_backend,
          runtime_command: runtimeCommand,
          runtime_version: runtimeVersion,
          image: plan.image,
          image_digest: plan.image_digest,
          policy: input.policy,
          started_at: new Date(started).toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - started,
          cleanup: cleanupResult,
          infrastructure_failure: infrastructureFailure,
          egress: egressProxyName && egressNetworkName ? {
            mode: "internal_network_allowlisted_proxy",
            network_name: egressNetworkName,
            proxy_container_name: egressProxyName,
            allowlist: egressAllowlist
          } : null,
          synthetic_services: syntheticServiceName && syntheticNetworkName ? {
            network_name: syntheticNetworkName,
            service_container_name: syntheticServiceName,
            service_ids: ["fake_tool_api"],
            trace_artifact: "synthetic-service-calls.ndjson"
          } : null,
          workspace_quota: {
            mode: runtimeCommand === "docker" ? "tmpfs_volume_hard_limit" : "measured_post_step",
            max_bytes: input.policy.max_workspace_bytes
          },
          artifact_quota: {
            mode: artifactVolumeName ? "tmpfs_volume_hard_limit" : "measured_post_step",
            max_bytes: input.policy.max_artifact_bytes
          },
          steps: results
        }
      };
      artifacts.push(executionArtifact);
      artifactsByRun.set(input.run_id, artifacts);
      const status = infrastructureFailure || results.some((item) => item.status === "failed") || !cleanupResult.containers_removed || !cleanupResult.workspace_volume_removed
        ? "failed"
        : results.some((item) => item.status === "blocked")
          ? "blocked"
          : "completed";
      return { provider_id: "local_runtime", selected_backend: plan.selected_backend, status, artifacts, steps: results, cleanup: cleanupResult };
    },
    async collectArtifacts(runId) {
      return artifactsByRun.get(runId) ?? [];
    },
    async terminate(runId) {
      await cleanup(runId, true);
    }
  };
}

export const localRuntimeProvider: RuntimeSandboxProvider = createLocalRuntimeProvider();
