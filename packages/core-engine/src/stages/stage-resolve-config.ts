import type { AuditPackageDefinition } from "../audit-packages.js";
import type { AuditPolicyArtifact, AuditRequest, DatabaseMode, ResolvedConfigurationArtifact, TargetClass, TargetKind } from "../contracts.js";

function targetKindForRequest(request: AuditRequest): TargetKind {
  if (request.repo_url) return "repo";
  if (request.local_path) return "path";
  return "endpoint";
}

export function stageResolveConfig(args: {
  runId: string;
  request: AuditRequest;
  auditPolicy: AuditPolicyArtifact;
  auditPackage?: AuditPackageDefinition | null;
  initialTargetClass?: TargetClass | null;
}): ResolvedConfigurationArtifact {
  const selectionMode: ResolvedConfigurationArtifact["audit_package"]["selection_mode"] = args.auditPackage
    ? (args.request.audit_package ? "explicit" : args.initialTargetClass ? "auto" : "deferred_auto")
    : (args.request.audit_package ? "explicit" : "deferred_auto");

  const notes: string[] = [];
  if (args.auditPolicy.policy_pack_id) {
    notes.push(`Resolved policy pack '${args.auditPolicy.policy_pack_id}'.`);
  } else {
    notes.push("Using inline request policy without a named pack.");
  }
  if (args.request.audit_package) {
    notes.push(`Explicit audit package request '${args.request.audit_package}' validated.`);
  } else if (args.auditPackage) {
    notes.push(`Audit package auto-selected as '${args.auditPackage.id}' after target analysis.`);
  } else {
    notes.push("Audit package will be auto-selected after target preparation and analysis.");
  }

  return {
    run_id: args.runId,
    request_summary: {
      target_kind: targetKindForRequest(args.request),
      run_mode: args.request.run_mode ?? "static",
      requested_audit_package: args.request.audit_package ?? null,
      requested_policy_pack: args.request.audit_policy_pack ?? null,
      db_mode: args.request.db_mode ?? (process.env.HARNESS_DB_MODE as DatabaseMode | undefined) ?? "local",
      output_dir: args.request.output_dir ?? null
    },
    policy_pack: {
      id: args.auditPolicy.policy_pack_id ?? null,
      name: args.auditPolicy.policy_pack_name ?? null,
      source: args.auditPolicy.policy_pack_source ?? null,
      profile: args.auditPolicy.profile ?? null,
      version: args.auditPolicy.version ?? null
    },
    audit_package: {
      selection_mode: selectionMode,
      selected_id: args.auditPackage?.id ?? null,
      title: args.auditPackage?.title ?? null,
      initial_target_class: args.initialTargetClass ?? null
    },
    validation: {
      policy_pack_validated: true,
      audit_package_validated: !!args.request.audit_package || !!args.auditPackage,
      notes
    }
  };
}