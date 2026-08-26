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
export const PYTHON_WORKER_DEFAULT_MAX_ATTEMPTS = 2;
export const PYTHON_WORKER_MAX_ATTEMPTS = 3;
export const PYTHON_WORKER_DEFAULT_RETRY_DELAY_MS = 100;
export const PYTHON_WORKER_MAX_RETRY_DELAY_MS = 1_000;

export type PythonWorkerInvocationStatus = "completed" | "failed" | "canceled";
export type PythonWorkerErrorKind = "canceled" | "timeout" | "output_limit" | "malformed_output" | "execution_error";

export interface PythonWorkerInvocationResult {
  worker: string;
  status: PythonWorkerInvocationStatus;
  output: unknown;
  attempts: number;
}

interface PythonWorkerAttemptOptions {
  timeoutMs: number;
  maxBufferBytes: number;
  signal?: AbortSignal;
}

type PythonWorkerAttemptExecutor = (options: PythonWorkerAttemptOptions) => Promise<{ stdout: string | Buffer }>;

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

export function resolvePythonWorkerRetryPolicy(options: { maxAttempts?: number; retryDelayMs?: number } = {}): { maxAttempts: number; retryDelayMs: number } {
  const maxAttempts = Number.isFinite(options.maxAttempts)
    ? Math.min(Math.max(Math.floor(options.maxAttempts!), 1), PYTHON_WORKER_MAX_ATTEMPTS)
    : PYTHON_WORKER_DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = Number.isFinite(options.retryDelayMs)
    ? Math.min(Math.max(Math.floor(options.retryDelayMs!), 0), PYTHON_WORKER_MAX_RETRY_DELAY_MS)
    : PYTHON_WORKER_DEFAULT_RETRY_DELAY_MS;
  return { maxAttempts, retryDelayMs };
}

function classifyPythonWorkerError(error: any, signal?: AbortSignal): PythonWorkerErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  if (signal?.aborted || error?.name === "AbortError" || error?.code === "ABORT_ERR") return "canceled";
  if (error instanceof SyntaxError) return "malformed_output";
  if (error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" || /maxbuffer|stdout maxbuffer|stderr maxbuffer/i.test(message)) return "output_limit";
  if (error?.killed || /timed out|timeout/i.test(message)) return "timeout";
  return "execution_error";
}

function pythonWorkerFailureMessage(errorKind: PythonWorkerErrorKind): string {
  switch (errorKind) {
    case "canceled": return "Python worker invocation was canceled.";
    case "timeout": return "Python worker invocation exceeded its process timeout.";
    case "output_limit": return "Python worker output exceeded its byte limit.";
    case "malformed_output": return "Python worker output was not a valid result object.";
    default: return "Python worker process execution failed.";
  }
}

function withInvocationMetadata(output: Record<string, unknown>, args: {
  attempts: number;
  maxAttempts: number;
  terminalReason: string;
}): Record<string, unknown> {
  return {
    ...output,
    worker_invocation: {
      attempts: args.attempts,
      max_attempts: args.maxAttempts,
      retry_count: Math.max(args.attempts - 1, 0),
      terminal_reason: args.terminalReason
    }
  };
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw signal.reason ?? new Error("Python worker invocation canceled.");
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Python worker invocation canceled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function runPythonWorkerAttempts(
  worker: string,
  options: { timeoutMs?: number; maxBufferBytes?: number; maxAttempts?: number; retryDelayMs?: number; signal?: AbortSignal },
  executeAttempt: PythonWorkerAttemptExecutor
): Promise<PythonWorkerInvocationResult> {
  const limits = resolvePythonWorkerInvocationLimits(options);
  const retryPolicy = resolvePythonWorkerRetryPolicy(options);
  let attempts = 0;
  let lastError: unknown = new Error("Python worker did not start.");

  while (attempts < retryPolicy.maxAttempts) {
    if (options.signal?.aborted) {
      return {
        worker,
        status: "canceled",
        attempts,
        output: withInvocationMetadata({
          status: "canceled",
          error: pythonWorkerFailureMessage("canceled"),
          error_kind: "canceled",
          limits: { timeout_ms: limits.timeoutMs, max_output_bytes: limits.maxBufferBytes }
        }, { attempts, maxAttempts: retryPolicy.maxAttempts, terminalReason: "canceled" })
      };
    }

    attempts += 1;
    try {
      const { stdout } = await executeAttempt({ ...limits, signal: options.signal });
      const parsed = JSON.parse(String(stdout));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new SyntaxError("Python worker output must be a JSON object.");
      }
      const failed = parsed.status === "failed";
      return {
        worker,
        status: failed ? "failed" : "completed",
        attempts,
        output: withInvocationMetadata(parsed as Record<string, unknown>, {
          attempts,
          maxAttempts: retryPolicy.maxAttempts,
          terminalReason: failed ? "worker_result_failed" : attempts > 1 ? "completed_after_retry" : "completed"
        })
      };
    } catch (error) {
      lastError = error;
      const errorKind = classifyPythonWorkerError(error, options.signal);
      if (errorKind === "execution_error" && attempts < retryPolicy.maxAttempts) {
        try {
          await waitForRetry(retryPolicy.retryDelayMs, options.signal);
          continue;
        } catch (retryError) {
          lastError = retryError;
        }
      }
      const terminalKind = classifyPythonWorkerError(lastError, options.signal);
      const canceled = terminalKind === "canceled";
      return {
        worker,
        status: canceled ? "canceled" : "failed",
        attempts,
        output: withInvocationMetadata({
          status: canceled ? "canceled" : "failed",
          error: pythonWorkerFailureMessage(terminalKind),
          error_kind: terminalKind,
          limits: { timeout_ms: limits.timeoutMs, max_output_bytes: limits.maxBufferBytes }
        }, {
          attempts,
          maxAttempts: retryPolicy.maxAttempts,
          terminalReason: canceled
            ? "canceled"
            : terminalKind === "execution_error" && attempts >= retryPolicy.maxAttempts
              ? "retry_exhausted"
              : terminalKind
        })
      };
    }
  }

  throw new Error("Python worker retry policy terminated without a result.");
}

export async function runPythonWorkerAttemptsForTests(
  worker: string,
  options: { timeoutMs?: number; maxBufferBytes?: number; maxAttempts?: number; retryDelayMs?: number; signal?: AbortSignal },
  executeAttempt: PythonWorkerAttemptExecutor
): Promise<PythonWorkerInvocationResult> {
  return runPythonWorkerAttempts(worker, options, executeAttempt);
}

export async function invokePythonWorker(
  worker: string,
  request: AuditRequest,
  cwd: string,
  options: { timeoutMs?: number; maxBufferBytes?: number; maxAttempts?: number; retryDelayMs?: number; signal?: AbortSignal } = {}
): Promise<PythonWorkerInvocationResult> {
  const python = resolvePythonWorkerExecutable();
  const moduleRoot = getModuleRoot();
  const payload = JSON.stringify({ worker, request, cwd });
  return runPythonWorkerAttempts(worker, options, async (attemptOptions) => {
    const { stdout } = await execFileAsync(python, ["-m", "audit_workers.cli", worker, payload], {
      cwd,
      env: {
        ...process.env,
        PYTHONPATH: moduleRoot,
        PYTHONDONTWRITEBYTECODE: "1"
      },
      timeout: attemptOptions.timeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: attemptOptions.maxBufferBytes,
      signal: attemptOptions.signal,
      windowsHide: true
    });
    return { stdout };
  });
}
