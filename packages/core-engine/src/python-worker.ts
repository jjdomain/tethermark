import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AuditRequest } from "./contracts.js";
import { inspectPythonWorkerEnvironment, pythonWorkerRoot, resolvePythonWorkerExecutable } from "./python-worker-environment.js";

const execFileAsync = promisify(execFile);
export const PYTHON_WORKER_ADAPTERS = ["inspect", "garak", "pyrit"] as const;
export type PythonWorkerAdapter = (typeof PYTHON_WORKER_ADAPTERS)[number];
export const PYTHON_WORKER_DEFAULT_TIMEOUT_MS = 45_000;
export const PYTHON_WORKER_MAX_TIMEOUT_MS = 120_000;
export const PYTHON_WORKER_DEFAULT_OUTPUT_BYTES = 1024 * 1024;
export const PYTHON_WORKER_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

let pythonWorkerCapabilityProbe: Promise<{ status: "available" | "blocked" | "unavailable"; message: string | null; adapters: PythonWorkerAdapter[] }> | null = null;

function getModuleRoot(): string {
  return path.join(pythonWorkerRoot(process.cwd()), "src");
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
      const inspection = inspectPythonWorkerEnvironment();
      if (inspection.ready) {
        const statuses = inspection.self_check?.["adapter_statuses"] as Record<string, unknown> | undefined;
        const adapters = PYTHON_WORKER_ADAPTERS.filter((adapter) => statuses?.[adapter] === "executable");
        return {
          status: "available" as const,
          message: inspection.summary,
          adapters
        };
      }
      return {
        status: "unavailable" as const,
        message: `${inspection.summary} Run npm run scan -- setup-workers --dry-run.`,
        adapters: [...PYTHON_WORKER_ADAPTERS]
      };
    })();
  }
  return pythonWorkerCapabilityProbe;
}

export function resetPythonWorkerCapabilityCacheForTests(): void {
  pythonWorkerCapabilityProbe = null;
}

export function resolvePythonWorkerInvocationLimits(options: { timeoutMs?: number; maxBufferBytes?: number } = {}): { timeoutMs: number; maxBufferBytes: number } {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.min(Math.max(Math.floor(options.timeoutMs!), 1), PYTHON_WORKER_MAX_TIMEOUT_MS)
    : PYTHON_WORKER_DEFAULT_TIMEOUT_MS;
  const maxBufferBytes = Number.isFinite(options.maxBufferBytes)
    ? Math.min(Math.max(Math.floor(options.maxBufferBytes!), 1024), PYTHON_WORKER_MAX_OUTPUT_BYTES)
    : PYTHON_WORKER_DEFAULT_OUTPUT_BYTES;
  return { timeoutMs, maxBufferBytes };
}

export async function invokePythonWorker(
  worker: string,
  request: AuditRequest,
  cwd: string,
  options: { timeoutMs?: number; maxBufferBytes?: number } = {}
): Promise<{ worker: string; status: string; output: unknown }> {
  const python = resolvePythonWorkerExecutable();
  const moduleRoot = getModuleRoot();
  const limits = resolvePythonWorkerInvocationLimits(options);
  try {
    const payload = JSON.stringify({ worker, request, cwd });
    const { stdout } = await execFileAsync(python, ["-m", "audit_workers.cli", worker, payload], {
      cwd,
      env: {
        ...process.env,
        PYTHONPATH: moduleRoot,
        PYTHONDONTWRITEBYTECODE: "1"
      },
      timeout: limits.timeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: limits.maxBufferBytes,
      windowsHide: true
    });
    const output = JSON.parse(stdout);
    return { worker, status: output?.status === "failed" ? "failed" : "completed", output };
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const errorKind = error?.killed || /timed out|timeout/i.test(message)
      ? "timeout"
      : /maxbuffer|stdout maxbuffer|stderr maxbuffer/i.test(message)
        ? "output_limit"
        : error instanceof SyntaxError
          ? "malformed_output"
          : "execution_error";
    return {
      worker,
      status: "failed",
      output: {
        error: message,
        error_kind: errorKind,
        limits: {
          timeout_ms: limits.timeoutMs,
          max_output_bytes: limits.maxBufferBytes
        }
      }
    };
  }
}
