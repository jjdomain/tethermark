export interface PersistenceFieldDefinition {
  name: string;
  type: "text" | "integer" | "real" | "boolean" | "json" | "timestamp";
  nullable: boolean;
}

export interface PersistenceTableDefinition {
  name: string;
  description: string;
  primary_key: string[];
  fields: PersistenceFieldDefinition[];
}

function field(name: string, type: PersistenceFieldDefinition["type"], nullable = false): PersistenceFieldDefinition {
  return { name, type, nullable };
}

export const SELF_LEARNING_TABLE_DEFINITIONS: PersistenceTableDefinition[] = [
  {
    name: "learning_events",
    description: "Immutable self-learning signals extracted from review, disposition, quality, runtime, remediation, and assistant records.",
    primary_key: ["id"],
    fields: [
      field("id", "text"),
      field("run_id", "text", true),
      field("target_id", "text", true),
      field("workspace_id", "text"),
      field("project_id", "text"),
      field("event_type", "text"),
      field("source_table", "text"),
      field("source_id", "text"),
      field("finding_id", "text", true),
      field("finding_signature", "text", true),
      field("control_ids_json", "json"),
      field("signal_summary", "text"),
      field("confidence", "real"),
      field("actor_id", "text", true),
      field("evidence_refs_json", "json"),
      field("payload_json", "json", true),
      field("created_at", "timestamp")
    ]
  },
  {
    name: "learning_candidates",
    description: "Approval-gated self-learning proposals, including deterministic and LLM-synthesized rationale.",
    primary_key: ["id"],
    fields: [
      field("id", "text"),
      field("workspace_id", "text"),
      field("project_id", "text"),
      field("scope_type", "text"),
      field("scope_id", "text"),
      field("target_id", "text", true),
      field("candidate_type", "text"),
      field("status", "text"),
      field("title", "text"),
      field("summary", "text"),
      field("rationale", "text"),
      field("proposed_change_json", "json"),
      field("source_event_ids_json", "json"),
      field("affected_finding_signatures_json", "json"),
      field("expected_effect_json", "json"),
      field("risk_level", "text"),
      field("requires_human_approval", "boolean"),
      field("created_at", "timestamp"),
      field("updated_at", "timestamp"),
      field("created_by", "text"),
      field("reviewed_by", "text", true),
      field("reviewed_at", "timestamp", true),
      field("rejection_reason", "text", true),
      field("expires_at", "timestamp", true),
      field("metadata_json", "json")
    ]
  },
  {
    name: "learning_experiments",
    description: "Dry-run experiment records for learning candidates. Experiments do not mutate audit behavior.",
    primary_key: ["id"],
    fields: [
      field("id", "text"),
      field("candidate_id", "text"),
      field("workspace_id", "text"),
      field("project_id", "text"),
      field("status", "text"),
      field("baseline_metrics_json", "json"),
      field("candidate_metrics_json", "json"),
      field("regressions_json", "json"),
      field("notes_json", "json"),
      field("created_at", "timestamp"),
      field("created_by", "text")
    ]
  },
  {
    name: "learning_promotions",
    description: "Approved learning overlays with rollback pointers and expiry metadata.",
    primary_key: ["id"],
    fields: [
      field("id", "text"),
      field("candidate_id", "text"),
      field("experiment_id", "text", true),
      field("workspace_id", "text"),
      field("project_id", "text"),
      field("scope_type", "text"),
      field("scope_id", "text"),
      field("target_id", "text", true),
      field("promoted_artifact_type", "text"),
      field("promoted_artifact_version", "text"),
      field("applied_change_json", "json"),
      field("rollback_pointer_json", "json"),
      field("status", "text"),
      field("promoted_by", "text"),
      field("promoted_at", "timestamp"),
      field("rolled_back_by", "text", true),
      field("rolled_back_at", "timestamp", true),
      field("rollback_reason", "text", true),
      field("expires_at", "timestamp", true),
      field("metadata_json", "json")
    ]
  },
  {
    name: "learning_jobs",
    description: "Self-learning pipeline run records, including trigger, threshold, synthesis, and error state.",
    primary_key: ["id"],
    fields: [
      field("id", "text"),
      field("workspace_id", "text"),
      field("project_id", "text"),
      field("run_id", "text", true),
      field("trigger", "text"),
      field("status", "text"),
      field("events_synced", "integer"),
      field("candidates_generated", "integer"),
      field("candidates_synthesized", "integer"),
      field("synthesis_skipped", "integer"),
      field("settings_snapshot_json", "json"),
      field("metadata_json", "json"),
      field("error", "text", true),
      field("created_by", "text"),
      field("started_at", "timestamp"),
      field("completed_at", "timestamp")
    ]
  },
  {
    name: "ui_settings",
    description: "Operator settings. Self-learning configuration is persisted in learning_json.",
    primary_key: ["id"],
    fields: [
      field("id", "text"),
      field("scope", "text"),
      field("scope_id", "text"),
      field("workspace_id", "text", true),
      field("project_id", "text", true),
      field("updated_at", "timestamp"),
      field("providers_json", "json"),
      field("credentials_json", "json"),
      field("audit_defaults_json", "json"),
      field("preflight_json", "json"),
      field("review_json", "json"),
      field("integrations_json", "json"),
      field("test_mode_json", "json"),
      field("learning_json", "json")
    ]
  }
];

export const SYSTEM_POLICY_TABLE_DEFINITIONS: PersistenceTableDefinition[] = [
  {
    name: "system_policies",
    description: "Workspace-scoped system-policy identities and lifecycle pointers.",
    primary_key: ["id"],
    fields: [field("id", "text"), field("workspace_id", "text"), field("name", "text"), field("description", "text"), field("status", "text"), field("scope", "text"), field("current_version_id", "text"), field("active_version_id", "text", true), field("is_default", "boolean"), field("created_by", "text"), field("created_at", "timestamp"), field("updated_by", "text"), field("updated_at", "timestamp")]
  },
  {
    name: "system_policy_versions",
    description: "Immutable, checksummed system-policy definitions and publication state.",
    primary_key: ["id"],
    fields: [field("id", "text"), field("policy_id", "text"), field("workspace_id", "text"), field("version", "integer"), field("state", "text"), field("schema_version", "text"), field("definition_json", "json"), field("checksum", "text"), field("created_by", "text"), field("created_reason", "text"), field("created_at", "timestamp"), field("published_at", "timestamp", true)]
  },
  {
    name: "system_policy_bindings",
    description: "Default, project, target, and audit-package policy bindings used by deterministic resolution.",
    primary_key: ["id"],
    fields: [field("id", "text"), field("workspace_id", "text"), field("project_id", "text", true), field("target_ref", "text", true), field("audit_package", "text", true), field("binding_type", "text"), field("policy_id", "text"), field("policy_version_id", "text"), field("priority", "integer"), field("active", "boolean"), field("created_by", "text"), field("created_at", "timestamp"), field("updated_at", "timestamp")]
  },
  {
    name: "policy_resolution_snapshots",
    description: "Immutable per-run snapshots of the fully resolved system policy.",
    primary_key: ["run_id"],
    fields: [field("run_id", "text"), field("workspace_id", "text"), field("project_id", "text"), field("target_ref", "text", true), field("target_class", "text", true), field("policy_id", "text"), field("policy_version_id", "text"), field("policy_version", "integer"), field("policy_checksum", "text"), field("control_catalog_version", "text"), field("audit_package", "text"), field("applicable_required_control_ids", "json"), field("required_evidence_provider_ids", "json"), field("definition_json", "json"), field("resolution_layers", "json"), field("warnings", "json"), field("resolved_at", "timestamp"), field("checksum", "text")]
  },
  {
    name: "policy_change_events",
    description: "Append-only policy lifecycle and administrative audit events.",
    primary_key: ["id"],
    fields: [field("id", "text"), field("workspace_id", "text"), field("policy_id", "text"), field("policy_version_id", "text", true), field("event_type", "text"), field("actor_id", "text"), field("reason", "text"), field("details_json", "json"), field("created_at", "timestamp")]
  }
];

export const PERSISTENCE_TABLE_DEFINITIONS: PersistenceTableDefinition[] = [...SELF_LEARNING_TABLE_DEFINITIONS, ...SYSTEM_POLICY_TABLE_DEFINITIONS];

function postgresColumnType(type: PersistenceFieldDefinition["type"]): string {
  switch (type) {
    case "integer":
      return "INTEGER";
    case "real":
      return "DOUBLE PRECISION";
    case "boolean":
      return "BOOLEAN";
    case "json":
      return "JSONB";
    case "timestamp":
      return "TIMESTAMPTZ";
    case "text":
    default:
      return "TEXT";
  }
}

export function buildPostgresCreateTableStatement(definition: PersistenceTableDefinition): string {
  const columns = definition.fields.map((item) => {
    const nullable = item.nullable ? "" : " NOT NULL";
    return `  ${item.name} ${postgresColumnType(item.type)}${nullable}`;
  });
  columns.push(`  PRIMARY KEY (${definition.primary_key.join(", ")})`);
  return `CREATE TABLE IF NOT EXISTS ${definition.name} (\n${columns.join(",\n")}\n);`;
}

export const SELF_LEARNING_POSTGRES_DDL = SELF_LEARNING_TABLE_DEFINITIONS
  .map(buildPostgresCreateTableStatement)
  .join("\n\n");

export const PERSISTENCE_POSTGRES_DDL = PERSISTENCE_TABLE_DEFINITIONS
  .map(buildPostgresCreateTableStatement)
  .join("\n\n");
