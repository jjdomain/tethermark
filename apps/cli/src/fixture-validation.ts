import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createEngine, type AuditPackageId, type AuditRequest, type DatabaseMode, type RunPlan, type TargetClass } from "../../../packages/core-engine/src/index.js";

interface ValidationExpectations {
  id: string;
  expected_target_class: TargetClass;
  expected_findings: string[];
  expected_likely_controls: string[];
  expected_human_review_required: boolean;
  notes?: string[];
}

export interface FixtureValidationResult {
  fixture_id: string;
  fixture_path: string;
  passed: boolean;
  issues: string[];
  run_id: string;
  target_class: TargetClass;
  finding_categories: string[];
  control_ids: string[];
  human_review_required: boolean;
}

export interface FixtureValidationSummary {
  root: string;
  selected_fixtures: number;
  passed_fixtures: number;
  failed_fixtures: number;
  results: FixtureValidationResult[];
}

async function readExpectations(filePath: string): Promise<ValidationExpectations> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as ValidationExpectations;
}

async function listFixtureDirs(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

export async function validateFixtures(args?: {
  rootDir?: string;
  fixtureId?: string;
  persistenceRoot?: string;
  auditPackage?: AuditPackageId;
  dbMode?: DatabaseMode;
  llmProvider?: AuditRequest["llm_provider"];
  llmModel?: string;
}): Promise<FixtureValidationSummary> {
  const rootDir = path.resolve(args?.rootDir ?? path.join(process.cwd(), "fixtures", "validation-targets"));
  const fixtureDirs = await listFixtureDirs(rootDir);
  const engine = createEngine();
  const results: FixtureValidationResult[] = [];
  const dbMode = args?.dbMode ?? "embedded";
  const envVar = dbMode === "embedded"
    ? "HARNESS_EMBEDDED_DB_ROOT"
    : dbMode === "local"
      ? "HARNESS_LOCAL_DB_ROOT"
      : "HARNESS_HOSTED_DB_ROOT";
  const previousRoot = process.env[envVar];
  const persistenceRoot = path.resolve(args?.persistenceRoot ?? await fs.mkdtemp(path.join(os.tmpdir(), `harness-fixture-${dbMode}-`)));

  process.env[envVar] = persistenceRoot;

  try {
    for (const fixtureDir of fixtureDirs) {
      const expectationsPath = path.join(fixtureDir, "validation-expectations.json");
      const expectations = await readExpectations(expectationsPath);
      if (args?.fixtureId && expectations.id !== args.fixtureId) {
        continue;
      }

      const request: AuditRequest = {
        local_path: fixtureDir,
        run_mode: "static",
        audit_package: args?.auditPackage ?? "agentic-static",
        db_mode: dbMode,
        llm_provider: args?.llmProvider ?? "mock",
        llm_model: args?.llmModel
      };

      const result = await engine.run(request);
      const findingCategories = [...new Set(result.findings.map((finding) => finding.category))].sort();
      const controlIds = [...new Set(result.control_results.map((control) => control.control_id))].sort();
      const targetClass = result.target_profile.semantic_review.final_class;
      const humanReviewRequired = result.publishability.human_review_required;
      const issues: string[] = [];

      if (targetClass !== expectations.expected_target_class) {
        issues.push(`expected target class '${expectations.expected_target_class}' but got '${targetClass}'`);
      }

      for (const category of expectations.expected_findings) {
        if (!findingCategories.includes(category)) {
          issues.push(`expected finding category '${category}' was not produced`);
        }
      }

      for (const controlId of expectations.expected_likely_controls) {
        if (!controlIds.includes(controlId)) {
          issues.push(`expected control '${controlId}' was not assessed`);
        }
      }

      if (humanReviewRequired !== expectations.expected_human_review_required) {
        issues.push(`expected human_review_required=${expectations.expected_human_review_required} but got ${humanReviewRequired}`);
      }

      results.push({
        fixture_id: expectations.id,
        fixture_path: fixtureDir,
        passed: issues.length === 0,
        issues,
        run_id: result.run_id,
        target_class: targetClass,
        finding_categories: findingCategories,
        control_ids: controlIds,
        human_review_required: humanReviewRequired
      });
    }
  } finally {
    if (previousRoot === undefined) delete process.env[envVar];
    else process.env[envVar] = previousRoot;

    if (!args?.persistenceRoot) {
      await fs.rm(persistenceRoot, { recursive: true, force: true });
    }
  }

  return {
    root: rootDir,
    selected_fixtures: results.length,
    passed_fixtures: results.filter((item) => item.passed).length,
    failed_fixtures: results.filter((item) => !item.passed).length,
    results
  };
}
