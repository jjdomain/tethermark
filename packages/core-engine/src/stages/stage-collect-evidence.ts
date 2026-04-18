import type { AnalysisSummary, AuditLanePlan, AuditRequest, EvidenceExecutionRecord, EvidenceLocation, EvidenceRecord, RepoContextArtifact, TargetDescriptor } from "../contracts.js";
import { runEvidenceProviders } from "../evidence-runner.js";
import { createId } from "../utils.js";

function normalizeLocationPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.replace(/\\/g, "/");
}

function dedupeLocations(locations: EvidenceLocation[]): EvidenceLocation[] {
  const seen = new Set<string>();
  const results: EvidenceLocation[] = [];
  for (const location of locations) {
    const key = JSON.stringify(location);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(location);
  }
  return results;
}

function fileLocation(args: {
  path: unknown;
  line?: unknown;
  column?: unknown;
  endLine?: unknown;
  endColumn?: unknown;
  label?: string | null;
}): EvidenceLocation | null {
  const normalizedPath = normalizeLocationPath(args.path);
  if (!normalizedPath) return null;
  return {
    source_kind: "file",
    path: normalizedPath,
    line: typeof args.line === "number" ? args.line : null,
    column: typeof args.column === "number" ? args.column : null,
    end_line: typeof args.endLine === "number" ? args.endLine : null,
    end_column: typeof args.endColumn === "number" ? args.endColumn : null,
    label: args.label ?? null
  };
}

function deriveLocationsFromExecution(execution: EvidenceExecutionRecord): EvidenceLocation[] {
  const locations: EvidenceLocation[] = [];
  const normalized = execution.normalized as Record<string, any> | null | undefined;
  if (Array.isArray(normalized?.locations)) {
    for (const location of normalized.locations) {
      if (location && typeof location === "object") locations.push(location as EvidenceLocation);
    }
  }
  if (Array.isArray(normalized?.coverage_paths)) {
    for (const pathValue of normalized.coverage_paths) {
      const location = fileLocation({ path: pathValue, label: execution.provider_id });
      if (location) locations.push(location);
    }
  }
  const parsed = execution.parsed as Record<string, any> | null | undefined;
  if (Array.isArray(parsed?.results)) {
    for (const result of parsed.results) {
      const location = fileLocation({
        path: result?.path,
        line: result?.start?.line,
        column: result?.start?.col,
        endLine: result?.end?.line,
        endColumn: result?.end?.col,
        label: result?.check_id || execution.provider_id
      });
      if (location) locations.push(location);
    }
  }
  if (Array.isArray(parsed?.Results)) {
    for (const result of parsed.Results) {
      const location = fileLocation({
        path: result?.Target,
        label: result?.Type || execution.provider_id
      });
      if (location) locations.push(location);
    }
  }
  return dedupeLocations(locations).slice(0, 25);
}

function executionKeys(execution: EvidenceExecutionRecord): string[] {
  return [
    execution.tool,
    execution.provider_id,
    execution.adapter?.requested_provider_id,
    execution.fallback_from ?? undefined
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function laneForExecution(plans: AuditLanePlan[], execution: EvidenceExecutionRecord): string | undefined {
  const keys = executionKeys(execution);
  return plans.find((plan) => keys.some((key) => plan.allowed_tools.includes(key)))?.lane_name;
}

function controlsForExecution(plans: AuditLanePlan[], execution: EvidenceExecutionRecord): string[] {
  const keys = executionKeys(execution);
  return plans
    .filter((plan) => keys.some((key) => plan.allowed_tools.includes(key)))
    .flatMap((plan) => plan.controls_in_scope);
}

export async function stageCollectEvidence(args: {
  runId: string;
  request: AuditRequest;
  target: TargetDescriptor;
  analysis: AnalysisSummary;
  repoContext: RepoContextArtifact;
  lanePlans: AuditLanePlan[];
}): Promise<{ evidenceExecutions: EvidenceExecutionRecord[]; evidenceRecords: EvidenceRecord[] }> {
  const providerIds = [...new Set(args.lanePlans.flatMap((plan) => plan.allowed_tools))];
  const evidenceExecutions = await runEvidenceProviders({
    providerIds,
    rootPath: args.target.local_path ?? args.target.snapshot.value,
    repoUrl: args.target.repo_url,
    request: args.request,
    analysisSummary: { analysis: args.analysis, repoContext: args.repoContext }
  });

  const evidenceRecords: EvidenceRecord[] = [];
  evidenceRecords.push({
    evidence_id: createId("evidence"),
    run_id: args.runId,
    source_type: "analysis",
    source_id: "analysis",
    control_ids: args.lanePlans.flatMap((plan) => plan.controls_in_scope),
    summary: `Repository analysis captured ${args.analysis.file_count} files across ${args.analysis.languages.length} languages.`,
    confidence: 0.95,
    metadata: {
      project_name: args.analysis.project_name,
      languages: args.analysis.languages,
      frameworks: args.analysis.frameworks,
      package_ecosystems: args.analysis.package_ecosystems,
      package_managers: args.analysis.package_managers
    }
  });
  evidenceRecords.push({
    evidence_id: createId("evidence"),
    run_id: args.runId,
    source_type: "analysis",
    source_id: "package_surface",
    control_ids: args.lanePlans.flatMap((plan) => plan.controls_in_scope),
    summary: `Package surface spans ${args.analysis.package_ecosystems.length || 0} ecosystems and ${args.analysis.package_managers.length || 0} package managers.`,
    confidence: args.analysis.package_ecosystems.length ? 0.9 : 0.75,
    locations: dedupeLocations([
      ...args.analysis.dependency_manifests.map((item) => fileLocation({ path: item, label: "manifest" })).filter(Boolean) as EvidenceLocation[],
      ...args.analysis.lockfiles.map((item) => fileLocation({ path: item, label: "lockfile" })).filter(Boolean) as EvidenceLocation[]
    ]),
    metadata: {
      dependency_manifests: args.analysis.dependency_manifests,
      lockfiles: args.analysis.lockfiles,
      package_ecosystems: args.analysis.package_ecosystems,
      package_managers: args.analysis.package_managers
    }
  });
  evidenceRecords.push({
    evidence_id: createId("evidence"),
    run_id: args.runId,
    source_type: "repo_context",
    source_id: "repo_context",
    control_ids: args.lanePlans.flatMap((plan) => plan.controls_in_scope),
    summary: `Curated repo context contains ${args.repoContext.documents.length} documents and ${args.repoContext.capability_signals.length} capability signals.`,
    confidence: 0.9,
    locations: dedupeLocations(
      args.repoContext.documents
        .map((document) => fileLocation({ path: document.path, label: document.kind }))
        .filter(Boolean) as EvidenceLocation[]
    ).slice(0, 25),
    metadata: {
      summary: args.repoContext.summary,
      capability_signals: args.repoContext.capability_signals.slice(0, 20)
    }
  });

  for (const execution of evidenceExecutions) {
    evidenceRecords.push({
      evidence_id: createId("evidence"),
      run_id: args.runId,
      lane_name: laneForExecution(args.lanePlans, execution),
      source_type: "tool",
      source_id: execution.provider_id,
      control_ids: controlsForExecution(args.lanePlans, execution),
      summary: execution.summary,
      confidence: execution.status === "completed" ? 0.9 : execution.status === "skipped" ? 0.4 : 0.5,
      locations: deriveLocationsFromExecution(execution),
      metadata: {
        tool: execution.tool,
        provider_kind: execution.provider_kind,
        status: execution.status,
        artifact_type: execution.artifact_type,
        exit_code: execution.exit_code,
        fallback_from: execution.fallback_from ?? null,
        adapter: execution.adapter ?? null,
        normalized: execution.normalized ?? null
      }
    });
  }

  return { evidenceExecutions, evidenceRecords };
}
