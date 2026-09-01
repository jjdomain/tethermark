import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  ensureBuiltinSystemPolicies,
  listBuiltinSystemPolicyTemplates,
  persistPolicyResolutionSnapshot,
  readPersistedPolicyResolutionSnapshot,
  resolvePersistedSystemPolicy,
  setDefaultPersistedSystemPolicy,
  validateSystemPolicyDefinition
} from "../dist/packages/core-engine/src/system-policies.js";
import { CONTROL_CATALOG_VERSION, getControlCatalog } from "../dist/packages/core-engine/src/standards.js";
import { hashObject } from "../dist/packages/core-engine/src/utils.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const knownArgs = new Set(["--allow-dirty", "--output"]);
for (let index = 0; index < args.length; index += 1) {
  if (!knownArgs.has(args[index])) throw new Error(`Unknown System Policy candidate option: ${args[index]}`);
  if (args[index] === "--output") index += 1;
}
if (outputIndex >= 0 && (!args[outputIndex + 1] || args[outputIndex + 1].startsWith("--"))) throw new Error("--output requires a path");

function git(commandArgs, allowFailure = false) {
  const result = spawnSync("git", commandArgs, { cwd: repoRoot, encoding: "utf8", shell: false });
  if (!allowFailure) {
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `git ${commandArgs.join(" ")} failed:\n${result.stderr ?? ""}`);
  }
  return { status: result.status, stdout: String(result.stdout ?? "").trim() };
}

async function runFilteredRegression(name, filter) {
  const started = Date.now();
  const child = spawn(process.execPath, [path.join(repoRoot, "dist", "packages", "core-engine", "src", "test-runner.js")], {
    cwd: repoRoot,
    env: { ...process.env, TETHERMARK_TEST_FILTER: filter },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const tail = [];
  const retain = (chunk, stream) => {
    const output = chunk.toString();
    stream.write(output);
    tail.push(...output.split(/\r?\n/).filter(Boolean));
    if (tail.length > 20) tail.splice(0, tail.length - 20);
  };
  child.stdout.on("data", (chunk) => retain(chunk, process.stdout));
  child.stderr.on("data", (chunk) => retain(chunk, process.stderr));
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(exitCode, 0, `${name} failed with exit code ${exitCode}`);
  return { name, status: "passed", duration_ms: Date.now() - started, output_tail: tail.slice(-5) };
}

const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, "System Policy candidate verification requires a stable semantic package version");
const revision = git(["rev-parse", "HEAD"]).stdout;
assert.match(revision, /^[a-f0-9]{40}$/i);
const checkoutStatus = git(["status", "--porcelain", "--untracked-files=all"]).stdout;
const cleanCheckout = checkoutStatus.length === 0;
if (!cleanCheckout && !args.includes("--allow-dirty")) throw new Error("System Policy candidate verification requires a clean checkout. Commit the candidate or pass --allow-dirty for development only.");
const proposedTag = `v${packageJson.version}`;
const existingTag = git(["rev-list", "-n", "1", proposedTag], true);
if (existingTag.status === 0 && existingTag.stdout !== revision) throw new Error(`${proposedTag} already identifies a different revision and must not be moved.`);

const catalogIds = getControlCatalog().map((control) => control.control_id).sort();
const expectedTemplates = {
  "extensive-static-safe": {
    checksum: "4fa13cb2a3040df6754262d1c5193c373072e441afaf65a2b0df666abe2f7047",
    audit_package: "deep-static",
    allowed_packages: ["deep-static"],
    evidence_providers: ["repo_analysis", "scorecard", "semgrep", "trivy"],
    runtime_allowed: false
  },
  "extensive-runtime-local-safe": {
    checksum: "83ca5b53e83b95ad4aa88ce605490c23d4fac4c45c87cb4d61071ec24b054a1f",
    audit_package: "runtime-validated",
    allowed_packages: ["comprehensive-local", "runtime-validated"],
    evidence_providers: ["local_runtime", "repo_analysis", "scorecard", "semgrep", "trivy"],
    runtime_allowed: true
  }
};
const templates = listBuiltinSystemPolicyTemplates().filter((template) => template.id in expectedTemplates);
assert.equal(templates.length, 2);
const templateEvidence = templates.map((template) => {
  const expected = expectedTemplates[template.id];
  const validation = validateSystemPolicyDefinition(template.definition);
  assert.equal(validation.valid, true, validation.errors.join("; "));
  assert.equal(validation.checksum, expected.checksum);
  assert.deepEqual([...template.definition.required_control_ids].sort(), catalogIds, `${template.id} must require every catalog control`);
  assert.equal(template.definition.default_audit_package, expected.audit_package);
  assert.deepEqual([...template.definition.allowed_audit_packages].sort(), expected.allowed_packages);
  assert.deepEqual([...template.definition.required_evidence_provider_ids].sort(), expected.evidence_providers);
  assert.equal(template.definition.evidence_failure_policy, "block");
  assert.equal(template.definition.review.publishability_threshold, "high");
  assert.equal(template.definition.review.require_human_review_on_incomplete_evidence, true);
  assert.equal(template.definition.runtime.allowed, expected.runtime_allowed);
  assert.equal(template.definition.runtime.no_host_fallback, true);
  if (expected.runtime_allowed) assert.equal(template.definition.runtime.require_isolation, true);
  return {
    template_id: template.id,
    checksum: validation.checksum,
    required_control_count: template.definition.required_control_ids.length,
    audit_package: template.definition.default_audit_package,
    evidence_providers: [...template.definition.required_evidence_provider_ids]
  };
});

const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tethermark-policy-candidate-"));
const targetClasses = [
  "repo_posture_only",
  "runnable_local_app",
  "hosted_endpoint_black_box",
  "tool_using_multi_turn_agent",
  "mcp_server_plugin_skill_package"
];
const resolutionMatrix = [];
try {
  await ensureBuiltinSystemPolicies("release-candidate", stateRoot);
  await setDefaultPersistedSystemPolicy("extensive-static-safe", "release-reviewer", "release-candidate", stateRoot);
  for (const template of templates) {
    for (const targetClass of targetClasses) {
      const request = {
        local_path: stateRoot,
        repo_url: "https://example.invalid/tethermark-system-policy-candidate",
        audit_package: template.definition.default_audit_package,
        run_mode: template.definition.runtime.allowed ? "runtime" : "static",
        llm_provider: "mock",
        workspace_id: "release-candidate",
        project_id: `matrix-${template.id}`
      };
      const runId = `policy-candidate:${template.id}:${targetClass}`;
      const first = await resolvePersistedSystemPolicy({ request, target_class: targetClass, run_id: runId, rootDirOrOptions: stateRoot });
      const repeated = await resolvePersistedSystemPolicy({ request, target_class: targetClass, run_id: `${runId}:repeat`, rootDirOrOptions: stateRoot });
      assert.ok(first);
      assert.equal(first.policy_id, template.id);
      assert.equal(first.control_catalog_version, CONTROL_CATALOG_VERSION);
      assert.deepEqual([...first.applicable_required_control_ids].sort(), catalogIds);
      assert.equal(repeated?.checksum, first.checksum, "Equivalent resolutions must have a stable semantic checksum");
      const persisted = await persistPolicyResolutionSnapshot(first, runId, stateRoot);
      const readBack = await readPersistedPolicyResolutionSnapshot(runId, stateRoot);
      assert.equal(readBack?.checksum, persisted.checksum);
      await assert.rejects(
        () => persistPolicyResolutionSnapshot({ ...first, checksum: "mutated" }, runId, stateRoot),
        /policy_resolution_snapshot_is_immutable/
      );
      resolutionMatrix.push({
        template_id: template.id,
        target_class: targetClass,
        policy_version: first.policy_version,
        policy_checksum: first.policy_checksum,
        resolution_checksum: first.checksum,
        applicable_control_count: first.applicable_required_control_ids.length,
        persisted_immutable: true
      });
    }
  }
} finally {
  await fs.rm(stateRoot, { recursive: true, force: true });
}

assert.equal(resolutionMatrix.length, 10);
assert.equal(new Set(resolutionMatrix.map((item) => item.resolution_checksum)).size, 10);
const resolutionMatrixChecksum = hashObject(resolutionMatrix);
assert.equal(resolutionMatrixChecksum, "976a875c7ffc1f7161b0b82f145541ac3150b1352650fe514ea5c48c66fb37bc", `Unexpected extensive-policy resolution matrix: ${resolutionMatrixChecksum}`);

const regressionChecks = [
  await runFilteredRegression("System Policy lifecycle and deterministic resolution", "system policy lifecycle and deterministic resolution"),
  await runFilteredRegression("Extensive static incomplete-evidence behavior", "extensive static policy coverage is explicit")
];

const evidence = {
  schema_version: "2026-08-29.system-policy-candidate.v1",
  status: "passed",
  generated_at: new Date().toISOString(),
  candidate: {
    package_version: packageJson.version,
    proposed_tag: proposedTag,
    revision_sha: revision,
    clean_checkout: cleanCheckout,
    development_override: !cleanCheckout
  },
  control_catalog: { version: CONTROL_CATALOG_VERSION, control_count: catalogIds.length, control_ids: catalogIds },
  templates: templateEvidence,
  resolution_matrix_checksum: resolutionMatrixChecksum,
  resolutions: resolutionMatrix,
  regression_checks: regressionChecks,
  assertions: {
    extensive_templates_require_complete_catalog: true,
    target_resolution_matrix_is_deterministic: true,
    snapshots_persist_and_reject_mutation: true,
    static_runtime_controls_do_not_false_pass: true,
    incomplete_required_evidence_blocks_publishability: true
  },
  credentials_included: false,
  local_paths_included: false
};
const outputPath = outputIndex >= 0
  ? path.resolve(args[outputIndex + 1])
  : path.join(repoRoot, ".artifacts", "release-candidate", `system-policies-${revision.slice(0, 12)}.json`);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ status: evidence.status, candidate: evidence.candidate, templates: evidence.templates, resolution_matrix_checksum: resolutionMatrixChecksum, evidence_path: path.relative(repoRoot, outputPath).replaceAll("\\", "/") }, null, 2));
