import path from "node:path";

import { assertRuntimeLaunchAllowed, buildRuntimeSandboxReadiness, isRuntimeRunMode } from "../../../validation-runner/src/index.js";
import type { AuditRequest, SandboxSession } from "../contracts.js";
import { resolveArtifactPath } from "../local-paths.js";
import { LinuxContainerSandboxBackend } from "./backends/linux-container.js";
import { LinuxStaticSandboxBackend } from "./backends/linux-static.js";
import { WindowsLocalStaticSandboxBackend } from "./backends/windows-local-static.js";

export interface SandboxManager {
  create(runId: string, request: AuditRequest): Promise<SandboxSession>;
}

function defaultSandboxRoot(): string {
  return resolveArtifactPath("sandboxes");
}

export function createSandboxManager(rootDir = defaultSandboxRoot()): SandboxManager {
  const runMode = (request: AuditRequest) => request.run_mode ?? "static";
  const runtimeSettings = (request: AuditRequest) => (request.hints as any)?.runtime_sandbox ?? null;
  const runtimeAcceptedWarnings = (request: AuditRequest) => {
    const hints = (request.hints ?? {}) as Record<string, any>;
    return Boolean(hints.runtime_sandbox_accepted_at || hints.preflight_accepted_at || hints.launch_intent?.preflight_accepted_at);
  };

  function assertRuntimeReady(request: AuditRequest): void {
    if (!isRuntimeRunMode(runMode(request))) return;
    const readiness = buildRuntimeSandboxReadiness({
      settings: runtimeSettings(request),
      target: {
        source_type: request.repo_url ? "repo" : request.local_path ? "path" : request.endpoint_url ? "endpoint" : null,
        trusted: Boolean(request.local_path)
      }
    });
    assertRuntimeLaunchAllowed({
      readiness,
      acceptedWarnings: runtimeAcceptedWarnings(request)
    });
  }

  if (process.platform === "win32") {
    return {
      async create(runId: string, request: AuditRequest): Promise<SandboxSession> {
        if (isRuntimeRunMode(runMode(request))) {
          assertRuntimeReady(request);
          const backend = new LinuxContainerSandboxBackend(rootDir);
          return backend.create(runId, request);
        }
        const backend = new WindowsLocalStaticSandboxBackend(rootDir);
        return backend.create(runId, request);
      }
    };
  }

  return {
    async create(runId: string, request: AuditRequest): Promise<SandboxSession> {
      if (runMode(request) === "static") {
        const backend = new LinuxStaticSandboxBackend(rootDir);
        return backend.create(runId, request);
      }

      assertRuntimeReady(request);
      const backend = new LinuxContainerSandboxBackend(rootDir);
      return backend.create(runId, request);
    }
  };
}
