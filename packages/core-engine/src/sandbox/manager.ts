import path from "node:path";

import type { AuditRequest, SandboxSession } from "../contracts.js";
import { LinuxContainerSandboxBackend } from "./backends/linux-container.js";
import { LinuxStaticSandboxBackend } from "./backends/linux-static.js";
import { WindowsLocalStaticSandboxBackend } from "./backends/windows-local-static.js";

export interface SandboxManager {
  create(runId: string, request: AuditRequest): Promise<SandboxSession>;
}

function defaultSandboxRoot(): string {
  return path.resolve(process.cwd(), ".artifacts", "sandboxes");
}

export function createSandboxManager(rootDir = defaultSandboxRoot()): SandboxManager {
  const runMode = (request: AuditRequest) => request.run_mode ?? "static";

  if (process.platform === "win32") {
    return {
      async create(runId: string, request: AuditRequest): Promise<SandboxSession> {
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

      const backend = new LinuxContainerSandboxBackend(rootDir);
      return backend.create(runId, request);
    }
  };
}