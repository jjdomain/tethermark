import { spawnSync } from "node:child_process";
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
  outbound_allowlist: string[];
  max_duration_ms: number;
  step_timeout_ms: number;
  memory_limit_mb: number;
  pids_limit: number;
  max_stdout_bytes: number;
  max_stderr_bytes: number;
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
  outbound_allowlist: string[];
  max_duration_ms: number;
  step_timeout_ms: number;
  max_stdout_bytes: number;
  max_stderr_bytes: number;
  memory_limit_mb?: number;
  pids_limit?: number;
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
}

export interface RuntimeValidationPlan {
  provider_id: RuntimeSandboxProviderId;
  selected_backend: LocalSandboxBackendId;
  steps: unknown[];
}

export interface RuntimeValidationResult {
  provider_id: RuntimeSandboxProviderId;
  selected_backend: LocalSandboxBackendId;
  status: "completed" | "failed" | "blocked";
  artifacts: RuntimeValidationArtifact[];
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
  outbound_allowlist: [],
  max_duration_ms: 300_000,
  step_timeout_ms: 60_000,
  memory_limit_mb: 2048,
  pids_limit: 512,
  max_stdout_bytes: 2000,
  max_stderr_bytes: 2000
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
    outbound_allowlist: stringArray(input.outbound_allowlist),
    max_duration_ms: positiveNumber(input.max_duration_ms, DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_duration_ms),
    step_timeout_ms: positiveNumber(input.step_timeout_ms, DEFAULT_RUNTIME_SANDBOX_SETTINGS.step_timeout_ms),
    memory_limit_mb: positiveNumber(input.memory_limit_mb, DEFAULT_RUNTIME_SANDBOX_SETTINGS.memory_limit_mb),
    pids_limit: positiveNumber(input.pids_limit, DEFAULT_RUNTIME_SANDBOX_SETTINGS.pids_limit),
    max_stdout_bytes: positiveNumber(input.max_stdout_bytes, DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_stdout_bytes),
    max_stderr_bytes: positiveNumber(input.max_stderr_bytes, DEFAULT_RUNTIME_SANDBOX_SETTINGS.max_stderr_bytes)
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
    outbound_allowlist: settings.outbound_allowlist,
    max_duration_ms: settings.max_duration_ms,
    step_timeout_ms: settings.step_timeout_ms,
    max_stdout_bytes: settings.max_stdout_bytes,
    max_stderr_bytes: settings.max_stderr_bytes,
    memory_limit_mb: settings.memory_limit_mb,
    pids_limit: settings.pids_limit,
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

export const localRuntimeProvider: RuntimeSandboxProvider = {
  id: "local_runtime",
  async readiness(input) {
    return buildRuntimeSandboxReadiness(input);
  },
  async plan(input) {
    return {
      provider_id: "local_runtime",
      selected_backend: input.policy.selected_backend,
      steps: []
    };
  },
  async execute(input) {
    return {
      provider_id: "local_runtime",
      selected_backend: input.policy.selected_backend,
      status: "blocked",
      artifacts: []
    };
  },
  async collectArtifacts() {
    return [];
  },
  async terminate() {}
};
