export const TETHERMARK_EXPORT_SCHEMA_VERSION = "1.0.0";

export interface ExportCompatibilityMetadata {
  contract: string;
  major_version: number;
  minimum_reader_schema_version: string;
  policy: "same-major-additive";
}

export interface TethermarkExportEnvelope<T> {
  schema_name: string;
  schema_version: string;
  generated_at: string;
  tethermark_version: string;
  compatibility: ExportCompatibilityMetadata;
  payload: T;
}

function schemaMajor(version: string): number | null {
  const match = String(version).match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

export function buildExportCompatibility(schemaName: string): ExportCompatibilityMetadata {
  return {
    contract: schemaName,
    major_version: 1,
    minimum_reader_schema_version: "1.0.0",
    policy: "same-major-additive"
  };
}

export function buildTethermarkExportEnvelope<T>(args: {
  schemaName: string;
  tethermarkVersion: string;
  payload: T;
  generatedAt?: string;
}): TethermarkExportEnvelope<T> {
  return {
    schema_name: args.schemaName,
    schema_version: TETHERMARK_EXPORT_SCHEMA_VERSION,
    generated_at: args.generatedAt ?? new Date().toISOString(),
    tethermark_version: args.tethermarkVersion,
    compatibility: buildExportCompatibility(args.schemaName),
    payload: args.payload
  };
}

export function isCompatibleExportEnvelope(value: unknown, args: {
  schemaName: string;
  supportedSchemaVersion?: string;
}): boolean {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Record<string, unknown>;
  if (envelope.schema_name !== args.schemaName) return false;
  const producerMajor = schemaMajor(String(envelope.schema_version ?? ""));
  const readerMajor = schemaMajor(args.supportedSchemaVersion ?? TETHERMARK_EXPORT_SCHEMA_VERSION);
  if (producerMajor == null || readerMajor == null || producerMajor !== readerMajor) return false;
  return "payload" in envelope;
}
