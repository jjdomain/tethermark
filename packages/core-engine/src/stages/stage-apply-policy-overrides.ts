import type {
  AuditPolicyArtifact,
  ControlResult,
  Finding,
  PolicyApplicationArtifact
} from "../contracts.js";

function isRuleActive(expiresAt?: string | null): boolean {
  return !expiresAt || expiresAt >= new Date().toISOString();
}

function includesAny<T>(left: T[], right: T[]): boolean {
  return left.some((value) => right.includes(value));
}

function matchSuppression(rule: NonNullable<AuditPolicyArtifact["finding_suppressions"]>[number], finding: Finding): boolean {
  const selectors: boolean[] = [];

  if (rule.finding_ids?.length) selectors.push(rule.finding_ids.includes(finding.finding_id));
  if (rule.categories?.length) selectors.push(rule.categories.includes(finding.category));
  if (rule.control_ids?.length) selectors.push(includesAny(rule.control_ids, finding.control_ids));
  if (rule.title_contains?.length) {
    const title = finding.title.toLowerCase();
    selectors.push(rule.title_contains.some((item) => title.includes(item.toLowerCase())));
  }

  return selectors.length > 0 && selectors.every(Boolean);
}

function matchWaiver(rule: NonNullable<AuditPolicyArtifact["control_waivers"]>[number], control: ControlResult): boolean {
  if (!rule.control_ids.includes(control.control_id)) return false;
  if (!rule.finding_ids?.length) return true;
  return includesAny(rule.finding_ids, control.finding_ids);
}

export function stageApplyPolicyOverrides(args: {
  auditPolicy: AuditPolicyArtifact;
  findings: Finding[];
  controlResults: ControlResult[];
}): {
  findings: Finding[];
  controlResults: ControlResult[];
  policyApplication: PolicyApplicationArtifact;
} {
  const activeSuppressions = (args.auditPolicy.finding_suppressions ?? []).filter((rule) => isRuleActive(rule.expires_at));
  const activeWaivers = (args.auditPolicy.control_waivers ?? []).filter((rule) => isRuleActive(rule.expires_at));

  const suppressedFindingIds = new Set<string>();
  const appliedSuppressions: PolicyApplicationArtifact["applied_suppressions"] = [];

  for (const rule of activeSuppressions) {
    const matchedIds = args.findings.filter((finding) => matchSuppression(rule, finding)).map((finding) => finding.finding_id);
    if (!matchedIds.length) continue;
    matchedIds.forEach((id) => suppressedFindingIds.add(id));
    appliedSuppressions.push({ rule_id: rule.rule_id, reason: rule.reason, finding_ids: matchedIds });
  }

  const findings = args.findings.filter((finding) => !suppressedFindingIds.has(finding.finding_id));

  const appliedWaivers: PolicyApplicationArtifact["applied_waivers"] = [];
  const controlResults = args.controlResults.map((control) => {
    const matchingRules = activeWaivers.filter((rule) => matchWaiver(rule, control));
    if (!matchingRules.length) return control;

    const waiverReasons = matchingRules.map((rule) => `Policy waiver ${rule.rule_id}: ${rule.reason}`);
    appliedWaivers.push(...matchingRules.map((rule) => ({
      rule_id: rule.rule_id,
      reason: rule.reason,
      control_ids: [control.control_id],
      finding_ids: control.finding_ids.filter((findingId) => !suppressedFindingIds.has(findingId))
    })));

    return {
      ...control,
      rationale: [...control.rationale, ...waiverReasons]
    };
  });

  const notes: string[] = [];
  if (appliedSuppressions.length) notes.push(`Applied ${appliedSuppressions.length} finding suppression rule(s).`);
  if (appliedWaivers.length) notes.push(`Applied ${appliedWaivers.length} control waiver record(s).`);
  if (!notes.length) notes.push("No active suppression or waiver rules matched this run.");

  return {
    findings,
    controlResults,
    policyApplication: {
      applied_suppressions: appliedSuppressions,
      applied_waivers: appliedWaivers,
      effective_finding_ids: findings.map((finding) => finding.finding_id),
      effective_control_ids: controlResults.map((control) => control.control_id),
      notes
    }
  };
}