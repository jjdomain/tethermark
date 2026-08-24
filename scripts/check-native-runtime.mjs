import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { executeRuntimeReadinessFixture } from "../dist/apps/cli/src/runtime-fixtures.js";
import {
  buildRuntimeExecutionPolicy,
  buildRuntimeSandboxReadiness,
  createLocalRuntimeProvider
} from "../dist/packages/validation-runner/src/index.js";

const SUPPORTED_BACKENDS = new Set([
  "gvisor_container",
  "rootless_podman",
  "podman",
  "docker",
  "docker_desktop"
]);

function flagValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: options.timeoutMs ?? 30_000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, ...(options.env ?? {}) }
  });
  const output = {
    command,
    args,
    exit_code: result.status,
    error: result.error?.message ?? null,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim()
  };
  if (!options.allowFailure && (result.error || result.status !== 0)) {
    throw Object.assign(new Error(`${command} ${args.join(" ")} failed: ${output.error ?? output.stderr ?? `exit ${result.status}`}`), { command_result: output });
  }
  return output;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runtimeCommand(backend) {
  return backend === "rootless_podman" || backend === "podman" ? "podman" : "docker";
}

function tethermarkNames(output) {
  return output.split(/\r?\n/).map((item) => item.trim()).filter((item) => item.startsWith("tethermark-"));
}

function resourceSnapshot(command) {
  const containers = run(command, ["ps", "-a", "--format", "{{.Names}}"], { allowFailure: true });
  const volumes = run(command, ["volume", "ls", "--format", "{{.Name}}"], { allowFailure: true });
  const networks = run(command, ["network", "ls", "--format", "{{.Name}}"], { allowFailure: true });
  return {
    containers: tethermarkNames(containers.stdout),
    volumes: tethermarkNames(volumes.stdout),
    networks: tethermarkNames(networks.stdout),
    probes: {
      containers: { exit_code: containers.exit_code, error: containers.error },
      volumes: { exit_code: volumes.exit_code, error: volumes.error },
      networks: { exit_code: networks.exit_code, error: networks.error }
    }
  };
}

function runtimeProof(backend) {
  const command = runtimeCommand(backend);
  const version = run(command, ["version", "--format", "{{json .}}"], { allowFailure: true });
  const info = run(command, ["info", "--format", "{{json .}}"], { allowFailure: true });
  const versionJson = parseJson(version.stdout);
  const infoJson = parseJson(info.stdout);
  const proof = {
    command,
    version: command === "docker" && versionJson ? {
      client_version: versionJson.Client?.Version ?? null,
      client_os: versionJson.Client?.Os ?? null,
      client_arch: versionJson.Client?.Arch ?? null,
      context: versionJson.Client?.Context ?? null,
      server_version: versionJson.Server?.Version ?? null,
      server_os: versionJson.Server?.Os ?? null,
      server_arch: versionJson.Server?.Arch ?? null,
      server_platform: versionJson.Server?.Platform?.Name ?? null,
      kernel_version: versionJson.Server?.KernelVersion ?? null
    } : command === "podman" && versionJson ? {
      client_version: versionJson.Client?.Version ?? versionJson.Client?.VersionString ?? null,
      server_version: versionJson.Server?.Version ?? versionJson.Server?.VersionString ?? null
    } : version,
    info: command === "docker" && infoJson ? {
      server_version: infoJson.ServerVersion ?? null,
      operating_system: infoJson.OperatingSystem ?? null,
      os_type: infoJson.OSType ?? null,
      architecture: infoJson.Architecture ?? null,
      driver: infoJson.Driver ?? null,
      cgroup_driver: infoJson.CgroupDriver ?? null,
      cgroup_version: infoJson.CgroupVersion ?? null,
      security_options: infoJson.SecurityOptions ?? null,
      runtimes: Object.entries(infoJson.Runtimes ?? {}).map(([name, value]) => ({ name, path: value?.path ?? null })),
      default_runtime: infoJson.DefaultRuntime ?? null
    } : command === "podman" && infoJson ? {
      version: infoJson.version?.Version ?? infoJson.version?.version ?? null,
      os: infoJson.host?.os ?? null,
      architecture: infoJson.host?.arch ?? null,
      cgroup_manager: infoJson.host?.cgroupManager ?? null,
      cgroup_version: infoJson.host?.cgroupVersion ?? null,
      network_backend: infoJson.host?.networkBackend ?? null,
      rootless: infoJson.host?.security?.rootless ?? null
    } : info
  };
  if (backend === "gvisor_container") {
    proof.runsc = run("runsc", ["--version"], { allowFailure: true });
  }
  return proof;
}

function emptyResources(snapshot) {
  return snapshot.containers.length === 0 && snapshot.volumes.length === 0 && snapshot.networks.length === 0;
}

async function executeProviderVerification(backend, artifactRoot) {
  const provider = createLocalRuntimeProvider();
  const targetDir = path.resolve("fixtures", "runtime-targets", "node-smoke");
  const collectedDir = path.join(artifactRoot, "collected");
  await fs.mkdir(collectedDir, { recursive: true });
  if (process.platform !== "win32") await fs.chmod(collectedDir, 0o777);
  const policy = buildRuntimeExecutionPolicy({
    selectedBackend: backend,
    settings: {
      max_duration_ms: 180_000,
      step_timeout_ms: 45_000,
      memory_limit_mb: 256,
      pids_limit: 64,
      max_file_bytes: 1024 * 1024,
      max_workspace_bytes: 32 * 1024 * 1024,
      max_artifact_bytes: 8 * 1024 * 1024,
      network_policy: "none",
      dependency_install_network: "never",
      runtime_probe_network: "never"
    }
  });
  const request = {
    run_id: `native_${backend}_${Date.now()}`,
    target_dir: targetDir,
    artifact_dir: collectedDir,
    policy,
    detected_stack: ["node"],
    steps: [
      {
        step_id: "node-test",
        phase: "test",
        adapter: "node_npm",
        command: ["node", "--test"],
        requires_network: false,
        enabled: true,
        artifact_context: { stack: "node", native_verification: true }
      },
      {
        step_id: "artifact-write",
        phase: "test",
        adapter: "node_npm",
        command: ["node", "artifact-writer.js"],
        requires_network: false,
        enabled: true,
        artifact_context: { stack: "node", native_verification: true }
      },
      {
        step_id: "bounded-service",
        phase: "runtime_probe",
        adapter: "node_npm",
        command: ["node", "server.js"],
        requires_network: false,
        enabled: true,
        artifact_context: { stack: "node", native_verification: true }
      }
    ]
  };
  const plan = await provider.plan(request);
  const result = await provider.execute(request, plan);
  const collectedArtifact = parseJson(await fs.readFile(path.join(collectedDir, "runtime-evidence.json"), "utf8").catch(() => ""));
  const assertions = {
    provider_completed: result.status === "completed",
    backend_preserved: result.selected_backend === backend,
    every_step_completed: result.steps.length === request.steps.length && result.steps.every((step) => step.status === "completed"),
    every_step_containerized: result.steps.every((step) => step.execution_runtime === "container"),
    every_step_default_deny_network: result.steps.every((step) => step.network_mode === "none"),
    exact_commands_preserved: result.steps.every((step, index) => JSON.stringify(step.command) === JSON.stringify(request.steps[index].command)),
    quotas_measured: result.steps.every((step) => step.resource_summary?.workspace_bytes !== null && step.resource_summary?.artifact_bytes !== null),
    cleanup_confirmed: result.cleanup.containers_removed && result.cleanup.workspace_volume_removed && result.cleanup.errors.length === 0,
    artifact_collected: collectedArtifact?.collected === true,
    gvisor_runtime_explicit: backend !== "gvisor_container" || result.steps.every((step) => step.container_create_argv?.includes("runsc"))
  };
  return { plan, result, assertions };
}

async function main() {
  const backend = flagValue("--backend");
  const expectBlocked = process.argv.includes("--expect-blocked");
  if (!SUPPORTED_BACKENDS.has(backend)) {
    throw new Error(`--backend is required and must be one of: ${[...SUPPORTED_BACKENDS].join(", ")}`);
  }

  const startedAt = new Date();
  const artifactRoot = path.resolve(".artifacts", "runtime-native", `${process.platform}-${backend}`);
  await fs.rm(artifactRoot, { recursive: true, force: true });
  await fs.mkdir(artifactRoot, { recursive: true });
  const command = runtimeCommand(backend);
  const proof = runtimeProof(backend);
  const readiness = buildRuntimeSandboxReadiness({
    settings: {
      resolution_mode: "pinned",
      preferred_backend: backend,
      allowed_backends: [backend]
    }
  });
  const evidence = {
    schema_version: 1,
    backend,
    expected_outcome: expectBlocked ? "blocked_boundary" : "executable",
    started_at: startedAt.toISOString(),
    completed_at: null,
    host: {
      platform: process.platform,
      arch: process.arch,
      os_type: os.type(),
      os_release: os.release(),
      os_version: os.version(),
      ci: process.env.CI === "true",
      github_sha: process.env.GITHUB_SHA ?? null,
      github_run_id: process.env.GITHUB_RUN_ID ?? null
    },
    runtime_proof: proof,
    readiness,
    fixture: null,
    provider_verification: null,
    resources_before: null,
    resources_after: null,
    assertions: {},
    passed: false,
    error: null
  };

  try {
    if (expectBlocked) {
      evidence.assertions.native_platform_executed = ["darwin", "win32"].includes(process.platform);
      evidence.assertions.requested_backend_not_launchable = !readiness.launchable;
      evidence.assertions.no_false_backend_selection = readiness.resolution.selected_backend === "unavailable";
      evidence.assertions.blocker_recorded = readiness.resolution.blockers.length > 0;
    } else {
      evidence.resources_before = resourceSnapshot(command);
      if (!emptyResources(evidence.resources_before)) {
        throw new Error(`Existing Tethermark runtime resources would make cleanup evidence ambiguous: ${JSON.stringify(evidence.resources_before)}`);
      }
      evidence.assertions.backend_launchable = readiness.launchable;
      evidence.assertions.pinned_backend_selected = readiness.resolution.selected_backend === backend;
      if (backend === "rootless_podman") {
        evidence.assertions.rootless_runtime_proven = proof.info?.rootless === true && typeof process.getuid === "function" && process.getuid() !== 0;
      }
      if (backend === "gvisor_container") {
        evidence.assertions.runsc_registered = proof.info?.runtimes?.some((item) => item.name === "runsc") === true && proof.runsc?.exit_code === 0;
      }

      const savedHostSecret = process.env.TETHERMARK_HOST_SECRET;
      process.env.TETHERMARK_HOST_SECRET = "native-verification-host-secret-must-not-enter-container";
      try {
        evidence.fixture = await executeRuntimeReadinessFixture(readiness);
        evidence.provider_verification = await executeProviderVerification(backend, artifactRoot);
      } finally {
        if (savedHostSecret === undefined) delete process.env.TETHERMARK_HOST_SECRET;
        else process.env.TETHERMARK_HOST_SECRET = savedHostSecret;
      }
      evidence.assertions.readiness_fixture_passed = evidence.fixture.passed === true;
      evidence.assertions.provider_fixture_passed = Object.values(evidence.provider_verification.assertions).every(Boolean);
      evidence.resources_after = resourceSnapshot(command);
      evidence.assertions.zero_tethermark_resources_after = emptyResources(evidence.resources_after);
    }
    evidence.passed = Object.keys(evidence.assertions).length > 0 && Object.values(evidence.assertions).every(Boolean);
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    if (!evidence.resources_after && !expectBlocked) evidence.resources_after = resourceSnapshot(command);
  } finally {
    evidence.completed_at = new Date().toISOString();
    const evidencePath = path.join(artifactRoot, "native-runtime-verification.json");
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      native_runtime_verification: {
        backend: evidence.backend,
        expected_outcome: evidence.expected_outcome,
        passed: evidence.passed,
        assertions: evidence.assertions,
        error: evidence.error
      },
      evidence_path: evidencePath
    }, null, 2));
  }

  if (!evidence.passed) process.exitCode = 1;
}

await main();
