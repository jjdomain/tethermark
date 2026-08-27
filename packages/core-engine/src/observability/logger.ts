import type { HarnessEvent } from "../contracts.js";

import { redactUrlCredentials } from "../security-boundaries.js";

function redactSensitiveString(value: string): string {
  return redactUrlCredentials(value)
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret)\s*[:=]\s*)(["'])[^"']+\2/gi, "$1[redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]");
}

export function sanitizeLogValue(value: unknown, key = "", depth = 0): unknown {
  if (/api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|cookie/i.test(key)) return "[redacted]";
  if (depth >= 8) return "[truncated]";
  if (typeof value === "string") return redactSensitiveString(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeLogValue(item, "", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
      nestedKey,
      sanitizeLogValue(nestedValue, nestedKey, depth + 1)
    ]));
  }
  return value;
}

function sanitizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return details ? sanitizeLogValue(details) as Record<string, unknown> : undefined;
}

export function logHarnessEvent(event: HarnessEvent): void {
  const payload = {
    ...event,
    details: sanitizeDetails(event.details)
  };
  const line = JSON.stringify(payload);
  if (event.level === "error") console.error(line);
  else if (event.level === "warn") console.warn(line);
  else console.log(line);
}
