import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { buildToolPathEnv, staticToolPathDetails } from "../../../packages/core-engine/src/tool-paths.js";
import { resolveAgentProviderConfig } from "../../../packages/llm-provider/src/index.js";

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

function commandVersion(command: string, args: string[] = ["--version"], shell = false): { available: boolean; version: string | null; message: string | null } {
  const result = run(command, args, { shell });
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  if (!result.ok) {
    return { available: false, version: null, message: result.error ?? (firstLine(combined) || `Exit status ${result.status}`) };
  }
  return { available: true, version: firstLine(combined) || "available", message: null };
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
  fix?: string[];
}): void {
  const version = commandVersion(args.command, args.versionArgs ?? ["--version"], args.shell ?? false);
  checks.push({
    id: args.id,
    label: args.label,
    status: version.available ? "pass" : args.required ? "fail" : "warn",
    summary: version.available ? `${args.command} detected (${version.version}).` : `${args.command} not available: ${version.message ?? "not found"}.`,
    details: { command: args.command, version: version.version },
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
          ? "Windows Codex app command is present but not executable from this shell; Tethermark will try the npm Codex fallback for provider execution."
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
  addCommandCheck(checks, { id: "python", label: "Python", command: envValue("PYTHON_BIN") ?? "python", required: false, fix: ["Install Python 3.10+ for runtime worker adapters."] });
  checks.push({
    id: "static-tools-path",
    label: "Managed Static Tools Path",
    status: "pass",
    summary: toolPathDetails.managed_dirs.length
      ? `Static tools are resolved from ${toolPathDetails.managed_dirs.join(", ")} before PATH.`
      : "No managed static tools path configured; system PATH will be used.",
    details: toolPathDetails
  });
  addCommandCheck(checks, { id: "scorecard", label: "OpenSSF Scorecard", command: "scorecard", versionArgs: ["version"], required: false, fix: ["Install OpenSSF Scorecard through an OS-approved package manager or set HARNESS_STATIC_TOOLS_PATH to a trusted bin directory."] });
  addCommandCheck(checks, { id: "semgrep", label: "Semgrep", command: "semgrep", required: false, fix: ["Install Semgrep with python -m pip install semgrep, pipx install semgrep, or an OS-approved package manager."] });
  addCommandCheck(checks, { id: "trivy", label: "Trivy", command: "trivy", required: false, fix: ["Install Trivy through Aqua Security packages, Homebrew, winget, choco, or another OS-approved package manager."] });
  addCommandCheck(checks, { id: "docker", label: "Docker", command: "docker", required: false, fix: ["Install Docker or Podman for Linux runtime validation."] });
  addCommandCheck(checks, { id: "podman", label: "Podman", command: "podman", required: false, fix: ["Install Podman or Docker for Linux runtime validation."] });
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
  console.log("3. Install optional static tools flagged by doctor: scorecard, semgrep, trivy.");
  console.log("4. Run npm run scan -- validate-fixtures --llm-provider mock.");
  console.log("5. Start the local app with npm run oss and open http://127.0.0.1:8788.");
  console.log("6. Run your first static repo audit before trying runtime validation.");
}

export function runOnboarding(args: { dryRun?: boolean; skipDoctor?: boolean; skipFixtures?: boolean } = {}): DoctorReport | null {
  const envExists = fs.existsSync(path.resolve(process.cwd(), ".env"));
  console.log("Tethermark onboarding");
  console.log("Step 1/5: Workspace configuration");
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
    console.log("Step 2/5: Doctor skipped by flag.");
    console.log("Next: run npm run scan -- doctor when ready.");
    return null;
  }

  console.log("");
  console.log("Step 2/5: Readiness check");
  const report = buildDoctorReport();
  printDoctorReport(report);

  const missingExternalTools = report.checks
    .filter((check) => ["scorecard", "semgrep", "trivy"].includes(check.id) && check.status !== "pass")
    .map((check) => check.id);
  console.log("");
  console.log("Step 3/5: External audit tools");
  if (missingExternalTools.length) {
    console.log(`Missing recommended tools: ${missingExternalTools.join(", ")}`);
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
  console.log("Step 4/5: Fixture validation");
  if (args.skipFixtures) {
    console.log("Fixture validation skipped by flag.");
  } else {
    console.log("Run the offline smoke fixtures before auditing real repos:");
    console.log("  npm run scan -- validate-fixtures --llm-provider mock");
  }

  console.log("");
  console.log("Step 5/5: Start local UI");
  console.log("  npm run oss");
  console.log("  open http://127.0.0.1:8788");
  console.log("The web UI will use the external tool paths recorded in .env when the local API starts.");
  console.log("");
  console.log("First repo smoke test:");
  console.log("  npm run scan -- scan repo <github-url> --mode static");
  return report;
}
