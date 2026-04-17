import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AuditRequest } from "./contracts.js";

const execFileAsync = promisify(execFile);
export const PYTHON_WORKER_ADAPTERS = ["inspect", "garak", "pyrit"] as const;
export type PythonWorkerAdapter = (typeof PYTHON_WORKER_ADAPTERS)[number];

let pythonWorkerCapabilityProbe: Promise<{ status: "available" | "blocked" | "unavailable"; message: string | null; adapters: PythonWorkerAdapter[] }> | null = null;

function getModuleRoot(): string {
  return path.resolve(process.cwd(), "workers", "python", "src");
}

export function resolvePythonWorkerAdapter(providerId: string, request: AuditRequest): PythonWorkerAdapter {
  if (providerId === "inspect" || providerId === "garak" || providerId === "pyrit") {
    return providerId;
  }
  if (request.run_mode === "validate") return "pyrit";
  if (request.endpoint_url) return "inspect";
  if (request.run_mode === "runtime") return "garak";
  return "inspect";
}

export async function getPythonWorkerCapability(): Promise<{ status: "available" | "blocked" | "unavailable"; message: string | null; adapters: PythonWorkerAdapter[] }> {
  if (process.env.HARNESS_DISABLE_PYTHON_WORKERS === "1") {
    return {
      status: "blocked",
      message: "Python worker execution disabled by HARNESS_DISABLE_PYTHON_WORKERS.",
      adapters: [...PYTHON_WORKER_ADAPTERS]
    };
  }
  if (!pythonWorkerCapabilityProbe) {
    pythonWorkerCapabilityProbe = (async () => {
      const python = process.env.PYTHON_BIN ?? "python";
      const moduleRoot = getModuleRoot();
      try {
        await execFileAsync(python, ["-c", "import audit_workers.cli; print('ok')"], {
          env: {
            ...process.env,
            PYTHONPATH: moduleRoot
          },
          maxBuffer: 1024 * 1024
        });
        return {
          status: "available" as const,
          message: null,
          adapters: [...PYTHON_WORKER_ADAPTERS]
        };
      } catch (error: any) {
        const message = error?.message ?? String(error);
        if (/spawn EPERM|operation not permitted|access is denied/i.test(message)) {
          return {
            status: "blocked" as const,
            message: `Python worker execution blocked by host environment (${message}).`,
            adapters: [...PYTHON_WORKER_ADAPTERS]
          };
        }
        return {
          status: "unavailable" as const,
          message: `Python worker runtime unavailable (${message}).`,
          adapters: [...PYTHON_WORKER_ADAPTERS]
        };
      }
    })();
  }
  return pythonWorkerCapabilityProbe;
}

export function resetPythonWorkerCapabilityCacheForTests(): void {
  pythonWorkerCapabilityProbe = null;
}

export async function invokePythonWorker(worker: string, request: AuditRequest, cwd: string): Promise<{ worker: string; status: string; output: unknown }> {
  const python = process.env.PYTHON_BIN ?? "python";
  const moduleRoot = getModuleRoot();
  try {
    const payload = JSON.stringify({ worker, request, cwd });
    const { stdout } = await execFileAsync(python, ["-m", "audit_workers.cli", worker, payload], {
      cwd,
      env: {
        ...process.env,
        PYTHONPATH: moduleRoot
      },
      maxBuffer: 4 * 1024 * 1024
    });
    return { worker, status: "completed", output: JSON.parse(stdout) };
  } catch (error) {
    return {
      worker,
      status: "failed",
      output: {
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
