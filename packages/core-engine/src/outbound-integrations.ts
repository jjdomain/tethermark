import type {
  OutboundDeliveryArtifact,
  OutboundVerificationArtifact
} from "./contracts.js";
import type { PersistedFindingRecord, PersistedReviewWorkflowRecord } from "./persistence/contracts.js";
import type { ReviewSummary } from "./review-summary.js";

export type GithubIntegrationMode = "disabled" | "manual" | "project_opt_in" | "workspace_default";
export type GithubOutboundAction = "pr_comment" | "issue_create" | "label" | "check";

export type GithubIntegrationPolicy = {
  mode: GithubIntegrationMode;
  allowed_actions: GithubOutboundAction[];
  owned_repo_only: boolean;
  owned_repo_prefixes: string[];
  require_per_run_approval: boolean;
};

export type GithubExecutionConfig = {
  api_base_url: string;
  token: string | null;
  configured: boolean;
};

type GithubRepoRef = {
  owner: string;
  repo: string;
  full_name: string;
};

function safeString(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

export function normalizeGithubIntegrationPolicy(integrations: Record<string, unknown> | null | undefined): GithubIntegrationPolicy {
  const allowedActions = Array.isArray(integrations?.github_allowed_actions)
    ? integrations.github_allowed_actions.filter((item): item is GithubOutboundAction => ["pr_comment", "issue_create", "label", "check"].includes(String(item)))
    : [];
  const ownedRepoPrefixes = Array.isArray(integrations?.github_owned_repo_prefixes)
    ? integrations.github_owned_repo_prefixes.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const mode = ["disabled", "manual", "project_opt_in", "workspace_default"].includes(String(integrations?.github_mode))
    ? String(integrations?.github_mode) as GithubIntegrationMode
    : "disabled";
  return {
    mode,
    allowed_actions: allowedActions,
    owned_repo_only: integrations?.github_owned_repo_only !== false,
    owned_repo_prefixes: ownedRepoPrefixes,
    require_per_run_approval: integrations?.github_require_per_run_approval !== false
  };
}

export function normalizeGithubExecutionConfig(credentials: Record<string, unknown> | null | undefined): GithubExecutionConfig {
  const apiBaseUrl = safeString(credentials?.github_api_base_url) ?? "https://api.github.com";
  const token = safeString(credentials?.github_token);
  return {
    api_base_url: apiBaseUrl.replace(/\/+$/, ""),
    token,
    configured: Boolean(token)
  };
}

function inferRepoName(repoUrl: string | null | undefined, fallback: string): string {
  if (!repoUrl) return fallback;
  const cleaned = repoUrl.replace(/\.git$/i, "").replace(/\/+$/, "");
  const segment = cleaned.split("/").at(-1)?.trim();
  return segment || fallback;
}

function repoMatchesOwnedPrefixes(repoUrl: string, prefixes: string[]): boolean {
  const normalized = repoUrl.toLowerCase();
  return prefixes.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

export function parseGithubRepoRef(repoUrl: string | null | undefined): GithubRepoRef | null {
  const value = safeString(repoUrl);
  if (!value) return null;
  const sshMatch = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    const owner = sshMatch[1] ?? "";
    const repo = (sshMatch[2] ?? "").replace(/\.git$/i, "");
    return owner && repo ? { owner, repo, full_name: `${owner}/${repo}` } : null;
  }
  try {
    const url = new URL(value);
    if (!/github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.replace(/\/+$/, "").replace(/^\/+/, "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0] ?? "";
    const repo = (parts[1] ?? "").replace(/\.git$/i, "");
    return owner && repo ? { owner, repo, full_name: `${owner}/${repo}` } : null;
  } catch {
    return null;
  }
}

async function readResponseBody(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { value: parsed };
  } catch {
    return { raw_text: text };
  }
}

function createGithubHeaders(token: string): Record<string, string> {
  return {
    "accept": "application/vnd.github+json",
    "authorization": `Bearer ${token}`,
    "user-agent": "tethermark"
  };
}

function normalizePermissions(value: unknown): OutboundVerificationArtifact["permissions"] {
  if (!value || typeof value !== "object") return null;
  const permissions = value as Record<string, unknown>;
  return {
    admin: permissions.admin === true,
    maintain: permissions.maintain === true,
    push: permissions.push === true,
    triage: permissions.triage === true,
    pull: permissions.pull === true
  };
}

export async function verifyGithubRepositoryAccess(args: {
  repoUrl: string | null | undefined;
  config: GithubExecutionConfig;
  actorId: string;
}): Promise<OutboundVerificationArtifact> {
  const repoRef = parseGithubRepoRef(args.repoUrl);
  const baseArtifact = {
    integration: "github" as const,
    verified_by: args.actorId,
    verified_at: new Date().toISOString(),
    repo_full_name: repoRef?.full_name ?? null,
    api_base_url: args.config.api_base_url,
    permissions: null
  };
  if (!repoRef) {
    return {
      ...baseArtifact,
      status: "blocked",
      reason: "Run target does not resolve to a GitHub repository URL."
    };
  }
  if (!args.config.token) {
    return {
      ...baseArtifact,
      status: "blocked",
      reason: "GitHub API token is not configured for outbound verification."
    };
  }
  try {
    const response = await fetch(`${args.config.api_base_url}/repos/${repoRef.owner}/${repoRef.repo}`, {
      method: "GET",
      headers: createGithubHeaders(args.config.token)
    });
    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      return {
        ...baseArtifact,
        status: response.status === 403 || response.status === 404 ? "blocked" : "error",
        reason: `GitHub repository lookup failed with status ${response.status}.`,
        permissions: normalizePermissions(responseBody?.permissions)
      };
    }
    const permissions = normalizePermissions(responseBody?.permissions);
    if (!permissions || !(permissions.admin || permissions.maintain || permissions.push)) {
      return {
        ...baseArtifact,
        status: "blocked",
        reason: "GitHub credentials do not have write access to the target repository.",
        permissions
      };
    }
    return {
      ...baseArtifact,
      status: "verified",
      reason: "Verified GitHub repository access with write permissions.",
      permissions
    };
  } catch (error) {
    return {
      ...baseArtifact,
      status: "error",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function executeGithubOutboundDelivery(args: {
  config: GithubExecutionConfig;
  verification: OutboundVerificationArtifact | null;
  actionType: GithubOutboundAction;
  payloadPreview: Record<string, unknown> | null;
  actorId: string;
  targetNumber?: number | null;
}): Promise<OutboundDeliveryArtifact> {
  const attemptedAt = new Date().toISOString();
  const repoFullName = args.verification?.repo_full_name ?? null;
  const blockedBase = {
    integration: "github" as const,
    action_type: args.actionType,
    attempted_by: args.actorId,
    attempted_at: attemptedAt,
    target_number: args.targetNumber ?? null,
    external_url: null,
    response_status: null,
    payload_preview: args.payloadPreview,
    response_body: null
  };
  if (!args.config.token) {
    return {
      ...blockedBase,
      status: "blocked",
      reason: "GitHub API token is not configured."
    };
  }
  if (!repoFullName || args.verification?.status !== "verified") {
    return {
      ...blockedBase,
      status: "blocked",
      reason: "GitHub repository access has not been verified for this run."
    };
  }
  if (args.actionType === "check") {
    return {
      ...blockedBase,
      status: "blocked",
      reason: "GitHub check delivery is not yet supported by the OSS harness."
    };
  }

  let path = "";
  let method = "POST";
  let body: Record<string, unknown> | null = null;
  if (args.actionType === "issue_create") {
    path = `/repos/${repoFullName}/issues`;
    body = {
      title: args.payloadPreview?.title ?? "[AI Security Audit]",
      body: args.payloadPreview?.body ?? ""
    };
  } else if (args.actionType === "pr_comment") {
    if (!args.targetNumber) {
      return {
        ...blockedBase,
        status: "blocked",
        reason: "A pull request or issue number is required for GitHub comment delivery."
      };
    }
    path = `/repos/${repoFullName}/issues/${args.targetNumber}/comments`;
    body = { body: args.payloadPreview?.body ?? "" };
  } else if (args.actionType === "label") {
    if (!args.targetNumber) {
      return {
        ...blockedBase,
        status: "blocked",
        reason: "An issue or pull request number is required for GitHub label delivery."
      };
    }
    path = `/repos/${repoFullName}/issues/${args.targetNumber}/labels`;
    body = { labels: Array.isArray(args.payloadPreview?.labels) ? args.payloadPreview.labels : [] };
  }

  try {
    const response = await fetch(`${args.config.api_base_url}${path}`, {
      method,
      headers: {
        ...createGithubHeaders(args.config.token),
        "content-type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const responseBody = await readResponseBody(response);
    return {
      ...blockedBase,
      status: response.ok ? "sent" : "failed",
      reason: response.ok ? "GitHub outbound delivery completed." : `GitHub outbound delivery failed with status ${response.status}.`,
      external_url: safeString(responseBody?.html_url) ?? safeString(responseBody?.url),
      response_status: response.status,
      response_body: responseBody
    };
  } catch (error) {
    return {
      ...blockedBase,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export function buildGithubOutboundPreview(args: {
  run: {
    target_id: string;
    audit_package?: string | null;
    status?: string | null;
    rating?: string | null;
    overall_score?: number | null;
    target?: { repo_url?: string | null; canonical_name?: string | null } | null;
    target_summary?: { repo_url?: string | null; canonical_name?: string | null } | null;
  };
  summary: Record<string, unknown>;
  findings: PersistedFindingRecord[];
  reviewWorkflow: PersistedReviewWorkflowRecord | null;
  reviewSummary: ReviewSummary;
  policy: GithubIntegrationPolicy;
  executionConfig?: GithubExecutionConfig | null;
  approval?: { approved_by: string; approved_at: string } | null;
  verification?: OutboundVerificationArtifact | null;
}): Record<string, unknown> {
  const repoUrl = args.run.target?.repo_url ?? args.run.target_summary?.repo_url ?? null;
  const repoRef = parseGithubRepoRef(repoUrl);
  const repoName = inferRepoName(repoUrl, args.run.target?.canonical_name ?? args.run.target_summary?.canonical_name ?? args.run.target_id);
  const criticalFindings = args.findings.filter((item) => item.severity === "critical" || item.severity === "high").length;
  const readinessReasons: string[] = [];
  let status: "disabled" | "blocked" | "preview_ready" = "preview_ready";

  if (args.policy.mode === "disabled") {
    status = "disabled";
    readinessReasons.push("GitHub outbound integration is disabled by policy.");
  }
  if (!repoUrl || !repoRef) {
    status = "blocked";
    readinessReasons.push("No GitHub repository URL is available for this run.");
  }
  if (args.policy.owned_repo_only) {
    if (!args.policy.owned_repo_prefixes.length) {
      status = "blocked";
      readinessReasons.push("Owned-repository-only mode is enabled, but no owned repository prefixes are configured.");
    } else if (repoUrl && !repoMatchesOwnedPrefixes(repoUrl, args.policy.owned_repo_prefixes)) {
      status = "blocked";
      readinessReasons.push("Repository URL does not match any configured owned repository prefixes.");
    }
  }
  const approvalRequired = args.policy.require_per_run_approval;
  const approved = Boolean(args.approval?.approved_at);
  const verified = args.verification?.status === "verified";
  const executionConfigured = Boolean(args.executionConfig?.configured);

  const commentBody = [
    `Tethermark completed a ${String(args.summary["audit_package"] ?? args.run.audit_package)} run for ${repoName}.`,
    `Status: ${String(args.summary["status"] ?? args.run.status)}.`,
    `Rating: ${String(args.summary["rating"] ?? args.run.rating ?? "unknown")} (${String(args.summary["overall_score"] ?? args.run.overall_score ?? "n/a")}/100).`,
    `Findings: ${args.findings.length} total, ${criticalFindings} high or critical.`,
    `Review workflow: ${args.reviewWorkflow?.status ?? "none"}.`,
    args.reviewSummary.handoff.latest_notes.length ? `Recent review notes: ${args.reviewSummary.handoff.latest_notes.join(" | ")}` : null
  ].filter(Boolean).join("\n");

  const proposedActions = args.policy.allowed_actions.map((action) => {
    if (action === "pr_comment") {
      return { action_type: action, requires_target_number: true, payload_preview: { body: commentBody } };
    }
    if (action === "issue_create") {
      return {
        action_type: action,
        requires_target_number: false,
        payload_preview: {
          title: `[AI Security Audit] ${repoName}: ${args.findings.length} finding(s)`,
          body: commentBody
        }
      };
    }
    if (action === "label") {
      return {
        action_type: action,
        requires_target_number: true,
        payload_preview: {
          labels: [
            "tethermark",
            args.reviewWorkflow?.status === "requires_rerun" ? "requires-rerun" : "reviewed"
          ]
        }
      };
    }
    return {
      action_type: action,
      requires_target_number: false,
      payload_preview: {
        name: "tethermark",
        summary: `${args.findings.length} finding(s), review status ${args.reviewWorkflow?.status ?? "none"}`
      }
    };
  });

  return {
    integration: "github",
    policy: args.policy,
    execution: {
      configured: executionConfigured,
      api_base_url: args.executionConfig?.api_base_url ?? null
    },
    target: {
      repo_url: repoUrl,
      canonical_name: repoName,
      repo_full_name: repoRef?.full_name ?? null
    },
    readiness: {
      status,
      reasons: readinessReasons,
      requires_manual_approval: approvalRequired,
      approved,
      requires_verification: executionConfigured,
      verified,
      send_allowed: status === "preview_ready" && (!approvalRequired || approved),
      execute_supported: executionConfigured,
      execute_allowed: executionConfigured && status === "preview_ready" && (!approvalRequired || approved) && verified
    },
    approval: args.approval ?? null,
    verification: args.verification ?? null,
    proposed_actions: proposedActions,
    preview_summary: {
      title: `[AI Security Audit] ${repoName}`,
      body: commentBody
    }
  };
}
