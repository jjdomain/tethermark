import fs from "node:fs/promises";
import path from "node:path";

import { buildExecutiveMarkdownReport, buildExecutiveSummaryPayload, buildSarifRunReport } from "./report-exports.js";

export function buildGoldenExportInputs(): {
  run: any;
  summary: Record<string, unknown>;
  findings: any[];
  evaluations: any;
  reviewDecision: any;
  remediation: any;
  resolvedConfiguration: any;
  evidenceRecords: any[];
} {
  return {
    run: {
      id: "run_golden",
      status: "succeeded",
      audit_package: "deep-static",
      run_mode: "static",
      rating: "strong",
      overall_score: 91
    },
    summary: { overall_score: 91 },
    findings: [{
      id: "finding_golden",
      run_id: "run_golden",
      lane_name: null,
      title: "Unsafe tool access",
      severity: "high",
      category: "tool_boundary",
      description: "Agent can invoke privileged tool without confirmation.",
      confidence: 0.91,
      source: "supervisor",
      publication_state: "internal_only",
      needs_human_review: true,
      score_impact: 12,
      control_ids_json: ["harness_internal.tool_restrictions"],
      standards_refs_json: [],
      evidence_json: ["src/agent.js:17 privileged tool path", "docs/ARCHITECTURE.md"],
      created_at: "2026-04-17T00:00:00.000Z"
    }],
    evaluations: {
      overall_evidence_sufficiency: "high",
      overall_false_positive_risk: "low",
      findings_needing_validation_count: 1,
      runtime_validation_validated_count: 0,
      runtime_validation_blocked_count: 1,
      runtime_validation_failed_count: 0,
      runtime_validation_recommended_count: 0,
      runtime_followup_required_count: 1,
      runtime_followup_resolved_count: 0,
      runtime_followup_rerun_requested_count: 1,
      runtime_followup_completed_count: 0,
      runtime_validated_finding_count: 0,
      runtime_strengthened_finding_count: 0,
      runtime_weakened_finding_count: 1,
      runtime_generated_finding_count: 0,
      suppressed_finding_count: 0,
      waived_finding_count: 0,
      expired_disposition_count: 0,
      reopened_disposition_count: 0,
      findings_needing_disposition_review_count: 0,
      duplicate_groups: [],
      conflict_pairs: [],
      sandbox_execution: {
        readiness_status: "blocked",
        execution_runtime: "host",
        total_steps: 2,
        completed_step_count: 0,
        failed_step_count: 0,
        blocked_step_count: 2,
        attention_required: true,
        attention_reasons: ["Host blocked bounded runtime execution."]
      },
      evaluations: [{
        finding_id: "finding_golden",
        title: "Unsafe tool access",
        current_severity: "high",
        current_visibility: "internal_only",
        review_disposition: "needs_validation",
        active_disposition_type: null,
        active_disposition_scope: null,
        active_disposition_reason: null,
        active_disposition_expires_at: null,
        active_disposition_review_due_by: null,
        evidence_sufficiency: "high",
        false_positive_risk: "low",
        runtime_validation_status: "blocked",
        runtime_followup_policy: "rerun_in_capable_env",
        runtime_followup_resolution: "rerun_requested",
        runtime_followup_outcome: "pending",
        runtime_followup_linked_run_id: null,
        validation_recommendation: "yes",
        validation_reasons: ["bounded sandbox execution did not complete cleanly for this run"],
        next_action: "rerun_in_capable_env",
        duplicate_with_finding_ids: [],
        conflict_with_finding_ids: [],
        runtime_impact: "weakened",
        runtime_evidence_ids: ["evidence_runtime_1"]
      }]
    },
    reviewDecision: {
      run_id: "run_golden",
      publishability_status: "review_required",
      human_review_required: true,
      public_summary_safe: false,
      threshold: "high",
      rationale_json: [],
      gating_findings_json: ["finding_golden"],
      recommended_visibility: "internal"
    },
    remediation: {
      run_id: "run_golden",
      summary: "Add a confirmation gate before privileged tool calls.",
      checklist_json: ["Require explicit approval for privileged tool use"],
      human_review_required: true
    },
    resolvedConfiguration: {
      run_id: "run_golden",
      initial_target_class: "tool_using_multi_turn_agent"
    },
    evidenceRecords: [{
      id: "evidence_runtime_1",
      evidence_id: "evidence_runtime_1",
      locations_json: [
        {
          source_kind: "file",
          path: "src/agent.js",
          line: 17,
          column: 3,
          label: "tool_boundary_entrypoint"
        },
        {
          source_kind: "symbol",
          symbol: "unsafe_tool_access",
          label: "finding_symbol"
        }
      ]
    }]
  };
}

export function buildGoldenExports(): {
  executiveJson: Record<string, unknown>;
  executiveMarkdown: string;
  sarif: Record<string, unknown>;
} {
  const inputs = buildGoldenExportInputs();
  return {
    executiveJson: buildExecutiveSummaryPayload(inputs),
    executiveMarkdown: buildExecutiveMarkdownReport(inputs),
    sarif: buildSarifRunReport({
      run: inputs.run,
      findings: inputs.findings,
      evaluations: inputs.evaluations,
      evidenceRecords: inputs.evidenceRecords
    })
  };
}

export function getGoldenExportFixturePaths(rootDir = process.cwd()): {
  executiveJson: string;
  executiveMarkdown: string;
  sarif: string;
} {
  const baseDir = path.resolve(rootDir, "fixtures", "export-golden");
  return {
    executiveJson: path.join(baseDir, "executive-summary.json"),
    executiveMarkdown: path.join(baseDir, "executive-summary.md"),
    sarif: path.join(baseDir, "report.sarif.json")
  };
}

export async function readGoldenExports(rootDir = process.cwd()): Promise<{
  executiveJson: string;
  executiveMarkdown: string;
  sarif: string;
}> {
  const fixturePaths = getGoldenExportFixturePaths(rootDir);
  const [executiveJson, executiveMarkdown, sarif] = await Promise.all([
    fs.readFile(fixturePaths.executiveJson, "utf8"),
    fs.readFile(fixturePaths.executiveMarkdown, "utf8"),
    fs.readFile(fixturePaths.sarif, "utf8")
  ]);
  return {
    executiveJson: executiveJson.trim(),
    executiveMarkdown: executiveMarkdown.trim(),
    sarif: sarif.trim()
  };
}

export async function refreshGoldenExports(rootDir = process.cwd()): Promise<void> {
  const fixturePaths = getGoldenExportFixturePaths(rootDir);
  const generated = buildGoldenExports();
  await fs.mkdir(path.dirname(fixturePaths.executiveJson), { recursive: true });
  await Promise.all([
    fs.writeFile(fixturePaths.executiveJson, `${JSON.stringify(generated.executiveJson, null, 2)}\n`, "utf8"),
    fs.writeFile(fixturePaths.executiveMarkdown, `${generated.executiveMarkdown}\n`, "utf8"),
    fs.writeFile(fixturePaths.sarif, `${JSON.stringify(generated.sarif, null, 2)}\n`, "utf8")
  ]);
}
