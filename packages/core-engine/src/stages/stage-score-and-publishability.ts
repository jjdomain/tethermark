import type { AuditPackageDefinition } from "../audit-packages.js";
import type { AuditPolicyArtifact, Finding, PublishabilityArtifact, RemediationArtifact, SkepticArtifact } from "../contracts.js";

function hasLowEvidence(skeptic: SkepticArtifact): boolean {
  return skeptic.summary.overall_evidence_sufficiency === "low";
}

function hasHighFalsePositiveRisk(skeptic: SkepticArtifact): boolean {
  return skeptic.summary.overall_false_positive_risk === "high";
}

function hasNonPublicFinding(findings: Finding[]): boolean {
  return findings.some((finding) => !finding.public_safe);
}

function highSeverityFindingIds(findings: Finding[]): string[] {
  return findings.filter((finding) => finding.severity === "high" || finding.severity === "critical").map((finding) => finding.finding_id);
}

export function stageScoreAndPublishability(args: {
  findings: Finding[];
  skepticReview: SkepticArtifact;
  remediation: RemediationArtifact;
  auditPackage: AuditPackageDefinition;
  auditPolicy: AuditPolicyArtifact;
}): PublishabilityArtifact {
  const rationale: string[] = [];
  const gatingFindings = highSeverityFindingIds(args.findings);
  const nonPublicFindingPresent = hasNonPublicFinding(args.findings);
  const lowEvidence = hasLowEvidence(args.skepticReview);
  const highFalsePositiveRisk = hasHighFalsePositiveRisk(args.skepticReview);
  const threshold = args.auditPackage.publishability_threshold;

  if (args.remediation.human_review_required) {
    rationale.push("Remediation stage marked the audit as requiring human review.");
  }
  if (lowEvidence) {
    rationale.push("Supervisor marked overall evidence sufficiency as low.");
  }
  if (highFalsePositiveRisk) {
    rationale.push("Supervisor marked overall false-positive risk as high.");
  }
  if (nonPublicFindingPresent) {
    rationale.push("At least one finding is not marked public-safe.");
  }
  if (args.skepticReview.summary.publication_safety_note) {
    rationale.push(`Supervisor publication note: ${args.skepticReview.summary.publication_safety_note}`);
  }
  if (args.auditPolicy.publication_rules?.length) {
    rationale.push(`Publication rules applied: ${args.auditPolicy.publication_rules[0]}`);
  }

  let publishabilityStatus: PublishabilityArtifact["publishability_status"] = "publishable";
  let humanReviewRequired = args.remediation.human_review_required;
  let publicSummarySafe = !nonPublicFindingPresent;
  let recommendedVisibility: PublishabilityArtifact["recommended_visibility"] = publicSummarySafe ? "public" : "internal";

  if (lowEvidence || highFalsePositiveRisk) {
    publishabilityStatus = "review_required";
    humanReviewRequired = true;
  }

  if (nonPublicFindingPresent) {
    publishabilityStatus = publishabilityStatus === "publishable" ? "internal_only" : publishabilityStatus;
    recommendedVisibility = "internal";
    publicSummarySafe = false;
  }

  if (threshold === "high" && (humanReviewRequired || gatingFindings.length > 0)) {
    publishabilityStatus = nonPublicFindingPresent ? "internal_only" : "review_required";
    humanReviewRequired = true;
  }

  if (threshold === "medium" && lowEvidence) {
    publishabilityStatus = "review_required";
    humanReviewRequired = true;
  }

  if (args.findings.some((finding) => !finding.public_safe && finding.severity === "critical") && lowEvidence) {
    publishabilityStatus = "blocked";
    humanReviewRequired = true;
    recommendedVisibility = "internal";
    publicSummarySafe = false;
    rationale.push("Critical non-public-safe finding combined with low evidence blocks publication pending review.");
  }

  if (rationale.length === 0) {
    rationale.push("No publication gates were triggered by the audit package threshold or supervisor review.");
  }

  return {
    publishability_status: publishabilityStatus,
    human_review_required: humanReviewRequired,
    public_summary_safe: publicSummarySafe,
    threshold,
    rationale,
    gating_findings: gatingFindings,
    recommended_visibility: recommendedVisibility
  };
}
