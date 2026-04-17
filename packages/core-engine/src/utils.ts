import crypto from "node:crypto";

export function slugify(value: string, maxLength = 32): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return normalized || "item";
}

export function createId(prefix: string, label?: string): string {
  const labelPart = label ? `_${slugify(label)}` : "";
  return `${prefix}${labelPart}_${crypto.randomUUID()}`;
}

export function createStableId(prefix: string, value: string, length = 16): string {
  return `${prefix}_${sha256Hex(value).slice(0, length)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return Object.fromEntries(Object.entries(current).sort(([left], [right]) => left.localeCompare(right)));
    }
    return current;
  });
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashObject(value: unknown): string {
  return sha256Hex(stableStringify(value));
}
