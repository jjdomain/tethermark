import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { buildToolPathEnv, staticToolPathDetails } from "../../../packages/core-engine/src/tool-paths.js";
import { resolvePostgresConnectionConfig } from "../../../packages/core-engine/src/persistence/postgres.js";
import { inspectPythonWorkerEnvironment } from "../../../packages/core-engine/src/python-worker-environment.js";
import { buildRuntimeSandboxReadiness } from "../../../packages/validation-runner/src/index.js";
import { resolveAgentProviderConfig } from "../../../packages/llm-provider/src/index.js";
import { BUNDLED_SEMGREP_RULESET, BUNDLED_SEMGREP_RULESET_SHA256, BUNDLED_SEMGREP_RULESET_VERSION, evaluateStaticToolVersion, resolveStaticToolInvocation, STATIC_TOOL_POLICIES, type ProductionStaticToolId } from "../../../packages/core-engine/src/static-tool-policy.js";

type CheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  summary: string;
  details?: Record<string, unknown>;
  fix?: string[];
}

export interface DoctorReport {
  generated_at: string;
  platform: NodeJS.Platform;
  arch: string;
  cwd: string;
  checks: DoctorCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
}

function run(command: string, args: string[] = [], options?: { shell?: boolean; timeoutMs?: number }): { ok: boolean; stdout: string; stderr: string; status: number | null; error?: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, PATH: buildToolPathEnv() },
    shell: options?.shell ?? false,
    windowsHide: true,
    timeout: options?.timeoutMs ?? 10_000
  });
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    error: result.error?.message
  };
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function commandVersion(command: string, args: string[] = ["--version"], shell = false, timeoutMs?: number): { available: boolean; version: string | null; message: string | null } {
  const result = run(command, args, { shell, timeoutMs });
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  if (!result.ok) {
    return { available: false, version: null, message: result.error ?? (firstLine(combined) || `Exit status ${result.status}`) };
  }
  return { available: true, version: firstLine(combined) || "available", message: null };
}

function semgrepProbeArgs(): string[] {
  const root = path.join(os.tmpdir(), "tethermark-semgrep-probe");
  const configured = envValue("HARNESS_SEMGREP_CONFIG");
  const configPath = configured ?? path.join(root, `rules-${BUNDLED_SEMGREP_RULESET_VERSION}-${BUNDLED_SEMGREP_RULESET_SHA256.slice(0, 12)}.yml`);
  const targetPath = path.join(root, "target.txt");
  fs.mkdirSync(root, { recursive: true });
  if (!configured) fs.writeFileSync(configPath, BUNDLED_SEMGREP_RULESET, "utf8");
  fs.writeFileSync(targetPath, "const token = 'tethermark-doctor-secret-00000000';\n", "utf8");
  return ["scan", "--config", configPath, "--json", "--metrics", "off", targetPath];
}

function addProductionStaticToolCheck(checks: DoctorCheck[], toolId: ProductionStaticToolId): void {
  const policy = STATIC_TOOL_POLICIES[toolId];
  const invocation = resolveStaticToolInvocation(toolId);
  const versionProbe = run(invocation.command, [...invocation.prefix_args, ...policy.version_args], { timeoutMs: 120_000 });
  const versionOutput = `${versionProbe.stdout}\n${versionProbe.stderr}`.trim();
  if (!versionProbe.ok) {
    checks.push({
      id: toolId,
      label: policy.label,
      status: "fail",
      summary: `${policy.command} not available: ${versionProbe.error ?? (firstLine(versionOutput) || `exit ${versionProbe.status}`)}.`,
      details: { command: policy.command, pinned_version: policy.pinned_version, supported_range: `>=${policy.supported_minimum} <${policy.supported_maximum_exclusive}` },
      fix: [`Run npm run scan -- setup-tools --yes --tool ${toolId}, then rerun doctor.`]
    });
    return;
  }
  const evaluation = evaluateStaticToolVersion(toolId, versionOutput);
  if (!evaluation.supported) {
    checks.push({
      id: toolId,
      label: policy.label,
      status: "fail",
      summary: evaluation.reason,
      details: { command: policy.command, detected_version: evaluation.detected_version, pinned_version: policy.pinned_version, supported_range: `>=${policy.supported_minimum} <${policy.supported_maximum_exclusive}` },
      fix: [`Run npm run scan -- setup-tools --yes --tool ${toolId} to install the production pin.`]
    });
    return;
  }
  if (toolId === "semgrep") {
    const functionalProbe = run(invocation.command, [...invocation.prefix_args, ...semgrepProbeArgs()], { timeoutMs: 120_000 });
    const config = envValue("HARNESS_SEMGREP_CONFIG");
    const remoteConfig = Boolean(config && /^(https?:|[a-z0-9_.-]+\/)/i.test(config));
    checks.push({
      id: toolId,
      label: policy.label,
      status: functionalProbe.ok && !remoteConfig ? evaluation.pinned ? "pass" : "warn" : "fail",
      summary: !functionalProbe.ok
        ? `Semgrep ${evaluation.detected_version} was found, but the production ruleset probe failed: ${functionalProbe.error ?? (firstLine(`${functionalProbe.stderr}\n${functionalProbe.stdout}`) || `exit ${functionalProbe.status}`)}.`
        : remoteConfig
          ? "Semgrep is configured with a remote ruleset; production offline-default readiness requires the bundled or a local ruleset."
          : `${evaluation.reason} Bundled rules ${BUNDLED_SEMGREP_RULESET_VERSION} executed locally with metrics disabled.`,
      details: {
        command: policy.command,
        detected_version: evaluation.detected_version,
        pinned_version: policy.pinned_version,
        ruleset_source: config ?? "bundled",
        ruleset_version: config ? null : BUNDLED_SEMGREP_RULESET_VERSION,
        ruleset_sha256: config ? null : BUNDLED_SEMGREP_RULESET_SHA256,
        metrics: "off",
        functional_probe: functionalProbe.ok
      },
      fix: functionalProbe.ok && !remoteConfig ? undefined : ["Unset HARNESS_SEMGREP_CONFIG to use the bundled offline rules, or point it to a reviewed local file."]
    });
    return;
  }
  checks.push({
    id: toolId,
    label: policy.label,
    status: evaluation.pinned ? "pass" : "warn",
    summary: evaluation.reason,
    details: { command: policy.command, detected_version: evaluation.detected_version, pinned_version: policy.pinned_version, supported_range: `>=${policy.supported_minimum} <${policy.supported_maximum_exclusive}` },
    fix: evaluation.pinned ? undefined : [`Run npm run scan -- setup-tools --yes --tool ${toolId} to restore the production pin.`]
  });
}

function addStaticScannerNetworkCheck(checks: DoctorCheck[]): void {
  const curl = commandVersion("curl", ["--version"], false, 10_000);
  if (!curl.available) {
    checks.push({
      id: "static-scanner-network",
      label: "Static Scanner Network",
      status: "warn",
      summary: "Network reachability was not probed because curl is unavailable. Semgrep remains offline by default; Scorecard public-repo checks and initial Trivy database setup require network access.",
      details: { semgrep_network_required: false, scorecard_network_required: true, trivy_initial_database_network_required: true },
      fix: ["Install curl or independently verify access to api.scorecard.dev and ghcr.io."]
    });
    return;
  }
  const endpoints = [
    { id: "scorecard_api", url: "https://api.scorecard.dev/" },
    { id: "trivy_database_registry", url: "https://ghcr.io/v2/" }
  ].map((endpoint) => ({
    ...endpoint,
    result: run("curl", ["--silent", "--show-error", "--head", "--max-time", "10", "--output", os.devNull, endpoint.url], { timeoutMs: 15_000 })
  }));
  const unreachable = endpoints.filter((endpoint) => !endpoint.result.ok);
  const tokenSource = ["GITHUB_AUTH_TOKEN", "GITHUB_TOKEN", "GH_AUTH_TOKEN", "GH_TOKEN"].find((name) => Boolean(envValue(name))) ?? null;
  checks.push({
    id: "static-scanner-network",
    label: "Static Scanner Network",
    status: unreachable.length ? "fail" : tokenSource ? "pass" : "warn",
    summary: unreachable.length
      ? `Required scanner network endpoints are unreachable: ${unreachable.map((item) => item.url).join(", ")}.`
      : tokenSource
        ? `Scorecard API and Trivy registry are reachable; GitHub authentication is configured through ${tokenSource}. Semgrep uses bundled offline rules.`
        : "Scorecard API and Trivy registry are reachable, but no GitHub token is exported to scanner children; Scorecard may be rate-limited or time out. Semgrep uses bundled offline rules.",
    details: {
      endpoints: endpoints.map((endpoint) => ({ id: endpoint.id, url: endpoint.url, reachable: endpoint.result.ok, error: endpoint.result.error ?? (firstLine(endpoint.result.stderr) || null) })),
      github_token_source: tokenSource,
      semgrep_network_required: false
    },
    fix: unreachable.length
      ? ["Allow HTTPS access to api.scorecard.dev and ghcr.io, or use cached/local scanner evidence with the resulting coverage limitation recorded."]
      : tokenSource ? undefined : ["Export GITHUB_AUTH_TOKEN (or GITHUB_TOKEN/GH_TOKEN) before public-repository Scorecard runs to avoid unauthenticated rate limits."]
  });
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function envConfigured(names: string[]): { configured: boolean; source: string | null } {
  for (const name of names) {
    if (envValue(name)) return { configured: true, source: name };
  }
  return { configured: false, source: null };
}

function addCommandCheck(checks: DoctorCheck[], args: {
  id: string;
  label: string;
  command: string;
  versionArgs?: string[];
  required?: boolean;
  shell?: boolean;
  timeoutMs?: number;
  fix?: string[];
}): void {
  const version = commandVersion(args.command, args.versionArgs ?? ["--version"], args.shell ?? false, args.timeoutMs);
  checks.push({
    id: args.id,
    label: args.label,
    status: version.available ? "pass" : args.required ? "fail" : "warn",
    summary: version.available
      ? args.id === "semgrep"
        ? "semgrep detected and local ruleset probe completed."
        : `${args.command} detected (${version.version}).`
      : `${args.command} not available: ${version.message ?? "not found"}.`,
    details: { command: args.command, version: args.id === "semgrep" && version.available ? "available" : version.version },
    fix: version.available ? undefined : args.fix
  });
}

function checkWritableDirectory(dir: string): DoctorCheck {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.doctor-${process.pid}.tmp`);
    fs.writeFileSync(probe, "ok\n", "utf8");
    fs.rmSync(probe, { force: true });
    return {
      id: "artifacts-writable",
      label: "Artifact Directory",
      status: "pass",
      summary: `${dir} is writable.`,
      details: { path: dir }
    };
  } catch (error) {
    return {
      id: "artifacts-writable",
      label: "Artifact Directory",
      status: "fail",
      summary: `${dir} is not writable.`,
      details: { path: dir, error: error instanceof Error ? error.message : String(error) },
      fix: ["Run from a writable workspace or set HARNESS_LOCAL_DB_ROOT / artifact paths to writable directories."]
    };
  }
}

function buildProviderChecks(): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const agentNames = [
    "planner_agent",
    "threat_model_agent",
    "eval_selection_agent",
    "audit_supervisor_agent",
    "remediation_agent",
    "lane_specialist_agent"
  ];
  const resolved = agentNames.map((agent) => ({ agent, config: resolveAgentProviderConfig(agent, {}) }));
  const missingApiKey = resolved.filter((item) => item.config.provider === "openai" && !item.config.apiKey);
  checks.push({
    id: "llm-provider-config",
    label: "LLM Provider Configuration",
    status: missingApiKey.length ? "fail" : "pass",
    summary: missingApiKey.length
      ? `Missing OpenAI API keys for ${missingApiKey.map((item) => item.agent).join(", ")}.`
      : `Provider configuration resolved for ${resolved.length} agent roles.`,
    details: {
      agents: resolved.map((item) => ({
        agent: item.agent,
        provider: item.config.provider,
        model: item.config.model ?? null,
        api_key_source: item.config.apiKeySource,
        api_key_configured: Boolean(item.config.apiKey)
      }))
    },
    fix: missingApiKey.length ? ["Set OPENAI_API_KEY, AUDIT_LLM_API_KEY, or agent-specific AUDIT_LLM_*_API_KEY values."] : undefined
  });

  const defaultConfig = resolveAgentProviderConfig("", {});
  if (defaultConfig.provider === "openai_codex" || resolved.some((item) => item.config.provider === "openai_codex")) {
    const codex = commandVersion(envValue("AUDIT_LLM_CODEX_COMMAND") ?? "codex", ["--version"], process.platform === "win32");
    const denied = /access is denied/i.test(codex.message ?? "");
    checks.push({
      id: "codex-cli",
      label: "Codex CLI",
      status: codex.available ? "pass" : "warn",
      summary: codex.available
        ? `Codex CLI detected (${codex.version}).`
        : denied
          ? "The Windows Codex command is present but not directly executable. Install a native Codex CLI executable or set AUDIT_LLM_CODEX_COMMAND to its explicit path; Tethermark does not download an npm fallback automatically."
          : `Codex CLI is not ready: ${codex.message ?? "not found"}.`,
      details: {
        command: envValue("AUDIT_LLM_CODEX_COMMAND") ?? "codex",
        default_provider: defaultConfig.provider,
        default_model: defaultConfig.model ?? null
      },
      fix: codex.available ? undefined : [
        "Sign in through the web UI Connect ChatGPT account flow, or install the npm CLI with npm install -g @openai/codex.",
        "On Windows, the npm fallback is usually more reliable than the WindowsApps command alias for non-interactive runs."
      ]
    });
  }

  return checks;
}

export function buildDoctorReport(): DoctorReport {
  const checks: DoctorCheck[] = [];
  const toolPathDetails = staticToolPathDetails();
  checks.push({
    id: "platform",
    label: "Platform",
    status: "pass",
    summary: `${os.type()} ${os.release()} (${process.platform}/${process.arch}).`,
    details: { platform: process.platform, arch: process.arch, homedir: os.homedir() }
  });
  checks.push({
    id: "env-file",
    label: ".env",
    status: fs.existsSync(path.resolve(process.cwd(), ".env")) ? "pass" : "warn",
    summary: fs.existsSync(path.resolve(process.cwd(), ".env")) ? ".env found." : ".env not found; defaults and process environment will be used.",
    fix: fs.existsSync(path.resolve(process.cwd(), ".env")) ? undefined : ["Copy .env.example to .env and configure provider credentials before live runs."]
  });
  addCommandCheck(checks, { id: "node", label: "Node.js", command: "node", required: true, fix: ["Install Node.js 20+ from https://nodejs.org/."] });
  addCommandCheck(checks, { id: "npm", label: "npm", command: "npm", shell: process.platform === "win32", required: true, fix: ["Install npm with Node.js 20+."] });
  addCommandCheck(checks, { id: "git", label: "Git", command: "git", required: true, fix: ["Install Git and ensure git is on PATH."] });
  addCommandCheck(checks, { id: "python", label: "Python", command: envValue("PYTHON_BIN") ?? "python", required: false, fix: ["Install Python >=3.11 <3.14 for runtime worker adapters."] });
  const pythonWorkers = inspectPythonWorkerEnvironment();
  checks.push({
    id: "python-worker-environment",
    label: "Python Worker Environment",
    status: pythonWorkers.ready ? "pass" : "warn",
    summary: pythonWorkers.summary,
    details: {
      ready: pythonWorkers.ready,
      python_version: pythonWorkers.python_version?.raw ?? null,
      python_executable: pythonWorkers.python_executable,
      venv_root: pythonWorkers.venv_root,
      lock_path: pythonWorkers.lock_path,
      lock_sha256: pythonWorkers.lock_sha256,
      lock_current: pythonWorkers.lock_current,
      packages_current: pythonWorkers.packages_current,
      adapter_implementation_status: pythonWorkers.self_check?.["adapter_implementation_status"] ?? null,
      adapter_statuses: pythonWorkers.self_check?.["adapter_statuses"] ?? null,
      inspect_ai_version: pythonWorkers.self_check?.["inspect_ai_version"] ?? null
    },
    fix: pythonWorkers.ready ? undefined : ["Run npm run scan -- setup-workers --dry-run, review the exact commands, then rerun with --yes."]
  });
  checks.push({
    id: "static-tools-path",
    label: "Managed Static Tools Path",
    status: "pass",
    summary: toolPathDetails.managed_dirs.length
      ? `Static tools are resolved from ${toolPathDetails.managed_dirs.join(", ")} before PATH.`
      : "No managed static tools path configured; system PATH will be used.",
    details: toolPathDetails
  });
  addProductionStaticToolCheck(checks, "scorecard");
  addProductionStaticToolCheck(checks, "semgrep");
  addProductionStaticToolCheck(checks, "trivy");
  addStaticScannerNetworkCheck(checks);
  addCommandCheck(checks, { id: "docker", label: "Docker", command: "docker", required: false, fix: ["Install Docker or Podman for Linux runtime validation."] });
  addCommandCheck(checks, { id: "podman", label: "Podman", command: "podman", required: false, fix: ["Install Podman or Docker for Linux runtime validation."] });
  const runtimeReadiness = buildRuntimeSandboxReadiness();
  checks.push({
    id: "local-runtime-sandbox",
    label: "Local Runtime Sandbox",
    status: runtimeReadiness.resolution.readiness_status === "ready"
      ? "pass"
      : runtimeReadiness.resolution.readiness_status === "ready_with_warnings"
        ? "warn"
        : "fail",
    summary: runtimeReadiness.resolution.readiness_status === "blocked"
      ? `Local Runtime Sandbox blocked: ${runtimeReadiness.resolution.blockers.join("; ") || "no supported backend available"}.`
      : `Local Runtime Sandbox selected ${runtimeReadiness.resolution.selected_backend} (${runtimeReadiness.resolution.readiness_status}).`,
    details: runtimeReadiness as unknown as Record<string, unknown>,
    fix: runtimeReadiness.resolution.readiness_status === "blocked" ? runtimeReadiness.setup_commands : undefined
  });
  const postgresConfig = resolvePostgresConnectionConfig();
  const psql = commandVersion(envValue("HARNESS_PSQL_COMMAND") ?? "psql", ["--version"], process.platform === "win32");
  checks.push({
    id: "postgres-supabase",
    label: "Postgres/Supabase Storage",
    status: postgresConfig.database_url ? psql.available ? "pass" : "warn" : "warn",
    summary: postgresConfig.database_url
      ? psql.available
        ? `Remote database URL configured through ${postgresConfig.database_url_source}; psql is available for migrations.`
        : `Remote database URL configured through ${postgresConfig.database_url_source}, but psql is not available for migrations.`
      : "No remote database URL configured; SQLite local storage remains the default.",
    details: {
      database_url_source: postgresConfig.database_url_source,
      supabase_url_configured: Boolean(postgresConfig.supabase_project_url),
      supabase_service_role_key_configured: postgresConfig.supabase_service_role_key_configured,
      psql_available: psql.available,
      psql_version: psql.version
    },
    fix: postgresConfig.database_url && !psql.available
      ? ["Install PostgreSQL client tools or set HARNESS_PSQL_COMMAND to a psql-compatible executable."]
      : !postgresConfig.database_url
        ? ["Set HARNESS_POSTGRES_URL, SUPABASE_DB_URL, or DATABASE_URL, then run npm run scan -- migrate postgres --dry-run."]
        : undefined
  });
  checks.push(checkWritableDirectory(path.resolve(process.cwd(), ".artifacts")));
  checks.push(...buildProviderChecks());

  const apiKey = envConfigured(["AUDIT_LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY"]);
  checks.push({
    id: "global-api-key",
    label: "Global API Key",
    status: apiKey.configured ? "pass" : "warn",
    summary: apiKey.configured ? `A global API key is configured through ${apiKey.source}.` : "No global OpenAI API key is configured; agent-specific keys may still be configured.",
    details: { source: apiKey.source, configured: apiKey.configured }
  });

  const summary = checks.reduce((acc, check) => {
    acc[check.status] += 1;
    return acc;
  }, { pass: 0, warn: 0, fail: 0 });
  return {
    generated_at: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    checks,
    summary
  };
}

export function buildStaticScannerDoctorReport(): DoctorReport {
  const checks: DoctorCheck[] = [];
  const toolPathDetails = staticToolPathDetails();
  checks.push({
    id: "platform",
    label: "Platform",
    status: "pass",
    summary: `${os.type()} ${os.release()} (${process.platform}/${process.arch}).`,
    details: { platform: process.platform, arch: process.arch, homedir: os.homedir() }
  });
  addCommandCheck(checks, { id: "node", label: "Node.js", command: "node", required: true, fix: ["Install Node.js 20+ from https://nodejs.org/."] });
  addCommandCheck(checks, { id: "git", label: "Git", command: "git", required: true, fix: ["Install Git and ensure git is on PATH."] });
  checks.push({
    id: "static-tools-path",
    label: "Managed Static Tools Path",
    status: "pass",
    summary: toolPathDetails.managed_dirs.length ? `Static tools are resolved from ${toolPathDetails.managed_dirs.join(", ")} before PATH.` : "No managed static tools path configured; system PATH will be used.",
    details: toolPathDetails
  });
  addProductionStaticToolCheck(checks, "scorecard");
  addProductionStaticToolCheck(checks, "semgrep");
  addProductionStaticToolCheck(checks, "trivy");
  addStaticScannerNetworkCheck(checks);
  checks.push(checkWritableDirectory(path.resolve(process.cwd(), ".artifacts")));
  const summary = checks.reduce((acc, check) => {
    acc[check.status] += 1;
    return acc;
  }, { pass: 0, warn: 0, fail: 0 });
  return { generated_at: new Date().toISOString(), platform: process.platform, arch: process.arch, cwd: process.cwd(), checks, summary };
}

export function printDoctorReport(report: DoctorReport, json = false): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log("Tethermark doctor");
  console.log(`Workspace: ${report.cwd}`);
  console.log(`Summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`);
  for (const check of report.checks) {
    const marker = check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
    console.log(`[${marker}] ${check.label}: ${check.summary}`);
    if (check.fix?.length) {
      for (const fix of check.fix) console.log(`  fix: ${fix}`);
    }
  }
}

export function printOnboarding(args: { dryRun?: boolean } = {}): void {
  const envExists = fs.existsSync(path.resolve(process.cwd(), ".env"));
  console.log("Tethermark onboarding");
  if (!envExists) {
    if (args.dryRun) {
      console.log("Would create .env from .env.example.");
    } else if (fs.existsSync(path.resolve(process.cwd(), ".env.example"))) {
      fs.copyFileSync(path.resolve(process.cwd(), ".env.example"), path.resolve(process.cwd(), ".env"));
      console.log("Created .env from .env.example.");
    } else {
      console.log("No .env.example found; skipping .env creation.");
    }
  } else {
    console.log(".env already exists; leaving it unchanged.");
  }
  console.log("");
  console.log("Next steps:");
  console.log("1. Configure provider credentials in .env or the web UI Settings page.");
  console.log("2. Run npm run scan -- doctor.");
  console.log("3. Install static tools flagged by doctor: scorecard, semgrep, trivy.");
  console.log("4. Configure Local Runtime Sandbox with npm run scan -- setup-runtime --dry-run.");
  console.log("5. Configure the Python worker environment with npm run scan -- setup-workers --dry-run.");
  console.log("6. Run npm run scan -- validate-fixtures --llm-provider mock.");
  console.log("7. Run npm run scan -- validate-runtime-fixtures when local runtime is ready.");
  console.log("8. Start the local app with npm run oss and open http://127.0.0.1:8788.");
}

export function runOnboarding(args: { dryRun?: boolean; skipDoctor?: boolean; skipFixtures?: boolean } = {}): DoctorReport | null {
  const envExists = fs.existsSync(path.resolve(process.cwd(), ".env"));
  console.log("Tethermark onboarding");
  console.log("Step 1/7: Workspace configuration");
  if (!envExists) {
    if (args.dryRun) {
      console.log("Would create .env from .env.example.");
    } else if (fs.existsSync(path.resolve(process.cwd(), ".env.example"))) {
      fs.copyFileSync(path.resolve(process.cwd(), ".env.example"), path.resolve(process.cwd(), ".env"));
      console.log("Created .env from .env.example.");
    } else {
      console.log("No .env.example found; skipping .env creation.");
    }
  } else {
    console.log(".env already exists; leaving it unchanged.");
  }

  if (args.skipDoctor) {
    console.log("");
    console.log("Step 2/7: Doctor skipped by flag.");
    console.log("Next: run npm run scan -- doctor when ready.");
    return null;
  }

  console.log("");
  console.log("Step 2/7: Readiness check");
  const report = buildDoctorReport();
  printDoctorReport(report);

  const missingExternalTools = report.checks
    .filter((check) => ["scorecard", "semgrep", "trivy"].includes(check.id) && check.status !== "pass")
    .map((check) => check.id);
  console.log("");
  console.log("Step 3/7: External audit tools");
  if (missingExternalTools.length) {
    console.log(`Missing required static audit tools: ${missingExternalTools.join(", ")}`);
    console.log("Preview the safe installer plan:");
    console.log(`  npm run scan -- setup-tools --dry-run --tool ${missingExternalTools.join(",")}`);
    console.log("Install auto-supported tools after review:");
    console.log(`  npm run scan -- setup-tools --yes --tool ${missingExternalTools.join(",")}`);
    console.log("Then verify:");
    console.log("  npm run scan -- doctor");
  } else {
    console.log("Scorecard, Semgrep, and Trivy are available.");
  }

  console.log("");
  console.log("Step 4/7: Local Runtime Sandbox");
  const runtimeCheck = report.checks.find((check) => check.id === "local-runtime-sandbox");
  console.log(runtimeCheck?.summary || "Local Runtime Sandbox readiness was not reported.");
  if (runtimeCheck?.status !== "pass") {
    console.log("Preview runtime setup guidance:");
    console.log("  npm run scan -- setup-runtime --dry-run");
    console.log("Verify runtime readiness:");
    console.log("  npm run scan -- runtime-doctor");
  } else {
    console.log("Runtime-validated audits are launchable from this machine.");
  }

  console.log("");
  console.log("Step 5/7: Python worker environment");
  const pythonWorkerCheck = report.checks.find((check) => check.id === "python-worker-environment");
  console.log(pythonWorkerCheck?.summary || "Python worker environment readiness was not reported.");
  if (pythonWorkerCheck?.status !== "pass") {
    console.log("Preview the hash-locked worker setup plan:");
    console.log("  npm run scan -- setup-workers --dry-run");
  } else {
    console.log("Inspect and bounded Garak are executable; PyRIT remains scaffold-only.");
  }

  console.log("");
  console.log("Step 6/7: Fixture validation");
  if (args.skipFixtures) {
    console.log("Fixture validation skipped by flag.");
  } else {
    console.log("Run the offline smoke fixtures before auditing real repos:");
    console.log("  npm run scan -- validate-fixtures --llm-provider mock");
    console.log("When Local Runtime Sandbox is ready, run:");
    console.log("  npm run scan -- validate-runtime-fixtures");
  }

  console.log("");
  console.log("Step 7/7: Start local UI");
  console.log("  npm run oss");
  console.log("  open http://127.0.0.1:8788");
  console.log("The web UI will use the external tool paths recorded in .env when the local API starts.");
  console.log("");
  console.log("First repo smoke test:");
  console.log("  npm run scan -- scan repo <github-url> --mode static");
  return report;
}
