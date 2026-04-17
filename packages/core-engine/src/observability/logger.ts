import type { HarnessEvent } from "../contracts.js";

function sanitizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (/api[_-]?key|token|password|secret/i.test(key)) {
      sanitized[key] = "[redacted]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
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
