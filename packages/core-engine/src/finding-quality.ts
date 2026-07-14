import type {
  AuditRequest,
  ControlResult,
  EvidenceRecord,
  Finding,
  FindingControlMappingQuality,
  FindingControlMappingVerdict,
  FindingEvidenceSupportVerdict,
  FindingQualityNextAction,
  FindingQualityRecord,
  FindingQualitySummary,
  StandardControlDefinition,
  ToolExecutionRecord
} from "./contracts.js";

type AnyRecord = Record<string, any>;
type FindingQualityMode = "legacy_quality" | "pre_supervisor_evidence_packet" | "post_supervisor_integrity";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function normalizeTokens(value: unknown): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, " ")
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
}

function tokenSet(value: unknown): Set<string> {
  return new Set(normalizeTokens(value));
}

function tokenOverlapCount(left: unknown, right: unknown): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  let count = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) count += 1;
  }
  return count;
}

function includesLoose(haystack: unknown, needle: unknown): boolean {
  const normalizedHaystack = String(haystack ?? "").toLowerCase();
  const normalizedNeedle = String(needle ?? "").toLowerCase().trim();
  if (!normalizedNeedle) return false;
  if (normalizedNeedle.length >= 16 && normalizedHaystack.includes(normalizedNeedle)) return true;
  return tokenOverlapCount(normalizedHaystack, normalizedNeedle) >= 2;
}

function normalizeFinding(finding: Finding | AnyRecord): Finding {
  return {
    finding_id: String((finding as AnyRecord).finding_id ?? (finding as AnyRecord).id ?? ""),
    title: String((finding as AnyRecord).title ?? ""),
    severity: ((finding as AnyRecord).severity ?? "low") as Finding["severity"],
    category: String((finding as AnyRecord).category ?? ""),
    description: String((finding as AnyRecord).description ?? ""),
    evidence: asStringArray((finding as AnyRecord).evidence ?? (finding as AnyRecord).evidence_json),
    public_safe: Boolean((finding as AnyRecord).public_safe ?? ((finding as AnyRecord).publication_state === "public_safe")),
    confidence: Number((finding as AnyRecord).confidence ?? 0),
    score_impact: Number((finding as AnyRecord).score_impact ?? 0),
    source: ((finding as AnyRecord).source ?? "agent_synthesis") as Finding["source"],
    control_ids: asStringArray((finding as AnyRecord).control_ids ?? (finding as AnyRecord).control_ids_json),
    standards_refs: asStringArray((finding as AnyRecord).standards_refs ?? (finding as AnyRecord).standards_refs_json)
  };
}

function normalizeControl(control: ControlResult | AnyRecord): ControlResult {
  return {
    control_id: String((control as AnyRecord).control_id ?? ""),
    framework: String((control as AnyRecord).framework ?? ""),
    standard_ref: String((control as AnyRecord).standard_ref ?? ""),
    title: String((control as AnyRecord).title ?? ""),
    applicability: ((control as AnyRecord).applicability ?? "applicable") as ControlResult["applicability"],
    assessability: ((control as AnyRecord).assessability ?? "not_assessed") as ControlResult["assessability"],
    status: ((control as AnyRecord).status ?? "not_assessed") as ControlResult["status"],
    score_weight: Number((control as AnyRecord).score_weight ?? 0),
    max_score: Number((control as AnyRecord).max_score ?? 0),
    score_awarded: Number((control as AnyRecord).score_awarded ?? 0),
    rationale: asStringArray((control as AnyRecord).rationale ?? (control as AnyRecord).rationale_json),
    evidence: asStringArray((control as AnyRecord).evidence ?? (control as AnyRecord).evidence_json),
    finding_ids: asStringArray((control as AnyRecord).finding_ids ?? (control as AnyRecord).finding_ids_json),
    sources: asStringArray((control as AnyRecord).sources ?? (control as AnyRecord).sources_json)
  };
}

function normalizeEvidence(record: EvidenceRecord | AnyRecord): EvidenceRecord {
  return {
    evidence_id: String((record as AnyRecord).evidence_id ?? (record as AnyRecord).id ?? ""),
    run_id: String((record as AnyRecord).run_id ?? ""),
    lane_name: (record as AnyRecord).lane_name ?? undefined,
    source_type: ((record as AnyRecord).source_type ?? "analysis") as EvidenceRecord["source_type"],
    source_id: String((record as AnyRecord).source_id ?? ""),
    control_ids: asStringArray((record as AnyRecord).control_ids ?? (record as AnyRecord).control_ids_json),
    summary: String((record as AnyRecord).summary ?? ""),
    confidence: Number((record as AnyRecord).confidence ?? 0),
    raw_artifact_path: (record as AnyRecord).raw_artifact_path ?? undefined,
    locations: Array.isArray((record as AnyRecord).locations) ? (record as AnyRecord).locations : Array.isArray((record as AnyRecord).locations_json) ? (record as AnyRecord).locations_json : [],
    metadata: ((record as AnyRecord).metadata ?? (record as AnyRecord).metadata_json ?? {}) as Record<string, unknown>
  };
}

function controlCatalogText(control: StandardControlDefinition | ControlResult | AnyRecord): string {
  return [
    (control as AnyRecord).control_id,
    (control as AnyRecord).framework,
    (control as AnyRecord).standard_ref,
    (control as AnyRecord).title,
    (control as AnyRecord).description,
    (control as AnyRecord).baseline_dimension,
    ...asStringArray((control as AnyRecord).applicability),
    ...asStringArray((control as AnyRecord).rationale)
  ].filter(Boolean).join(" ");
}

function findingText(finding: Finding): string {
  return [finding.title, finding.category, finding.description, ...finding.evidence].join(" ");
}

function evidenceText(record: EvidenceRecord): string {
  const locations = (record.locations ?? []).map((location) => [location.path, location.uri, location.symbol, location.label].filter(Boolean).join(" "));
  return [record.evidence_id, record.source_id, record.source_type, record.summary, ...record.control_ids, ...locations].join(" ");
}

function classifyFindingTopic(finding: Finding): string[] {
  const text = findingText(finding).toLowerCase();
  const topics: string[] = [];
  const addIf = (topic: string, pattern: RegExp) => {
    if (pattern.test(text)) topics.push(topic);
  };
  addIf("security_policy", /security\.md|security policy|disclosure|vulnerability intake|responsible disclosure/);
  addIf("dependency_update", /dependabot|dependency update|lockfile|unpinned|pinned|package|dependency|supply chain|trivy|slsa|provenance/);
  addIf("workflow_ci", /workflow|github action|ci\/cd|token|permission|branch protection|build/);
  addIf("secret_handling", /secret|credential|token|api key|environment variable|sensitive/);
  addIf("prompt_injection", /prompt injection|untrusted content|guardrail|jailbreak/);
  addIf("tool_permissions", /mcp|tool|permission|allowlist|sandbox|shell|filesystem|browser|network/);
  addIf("logging_audit", /log|telemetry|audit|trace|observability|redaction/);
  return topics;
}

function controlMatchesTopic(control: StandardControlDefinition | ControlResult | AnyRecord, topics: string[]): boolean {
  const text = controlCatalogText(control).toLowerCase();
  return topics.some((topic) => {
    if (topic === "security_policy") return /security|disclosure|vulnerability|policy/.test(text);
    if (topic === "dependency_update") return /dependency|supply|slsa|ssdf|provenance|pin|update|package/.test(text);
    if (topic === "workflow_ci") return /workflow|ci|build|branch|token|permission|slsa/.test(text);
    if (topic === "secret_handling") return /secret|credential|sensitive|env|redaction/.test(text);
    if (topic === "prompt_injection") return /prompt|injection|untrusted|guardrail|llm/.test(text);
    if (topic === "tool_permissions") return /tool|permission|mcp|agent|sandbox|allowlist|browser|network/.test(text);
    if (topic === "logging_audit") return /log|telemetry|audit|trace|observability|redaction/.test(text);
    return false;
  });
}

function findRelatedEvidence(finding: Finding, evidenceRecords: EvidenceRecord[]): {
  matched: EvidenceRecord[];
  missingRefs: string[];
  directMatchedIds: Set<string>;
} {
  const findingControls = new Set(finding.control_ids);
  const findingRefs = finding.evidence;
  const directMatchedIds = new Set<string>();
  const matched = new Map<string, EvidenceRecord>();
  const missingRefs: string[] = [];
  const findingBody = findingText(finding);

  for (const ref of findingRefs) {
    const direct = evidenceRecords.find((record) => {
      const identifiers = [record.evidence_id, record.source_id, record.raw_artifact_path].filter(Boolean);
      return identifiers.some((id) => String(id) === ref || includesLoose(id, ref))
        || includesLoose(record.summary, ref)
        || (record.locations ?? []).some((location) => includesLoose([location.path, location.uri, location.symbol, location.label].filter(Boolean).join(" "), ref));
    });
    if (direct) {
      directMatchedIds.add(direct.evidence_id);
      matched.set(direct.evidence_id, direct);
    } else if (ref.trim()) {
      missingRefs.push(ref);
    }
  }

  for (const record of evidenceRecords) {
    const key = record.evidence_id;
    if (matched.has(key)) continue;
    const controlOverlap = record.control_ids.some((controlId) => findingControls.has(controlId));
    const contentOverlap = tokenOverlapCount(evidenceText(record), findingBody) >= 2;
    if (controlOverlap || contentOverlap) matched.set(key, record);
  }

  return { matched: [...matched.values()], missingRefs, directMatchedIds };
}

function deriveEvidenceSupport(args: {
  finding: Finding;
  matchedEvidence: EvidenceRecord[];
  directMatchedIds: Set<string>;
  missingRefs: string[];
  toolExecutions: ToolExecutionRecord[] | AnyRecord[];
}): { verdict: FindingEvidenceSupportVerdict; reasons: string[] } {
  const reasons: string[] = [];
  const completedTools = args.toolExecutions.filter((tool) => String((tool as AnyRecord).status ?? "") === "completed").length;
  if (!args.finding.evidence.length && !args.matchedEvidence.length) {
    return { verdict: "unsupported", reasons: ["Finding has no persisted evidence references and no related normalized evidence records."] };
  }
  if (args.directMatchedIds.size > 0) {
    reasons.push(`${args.directMatchedIds.size} cited evidence reference(s) matched normalized evidence records.`);
  }
  if (args.missingRefs.length > 0) {
    reasons.push(`${args.missingRefs.length} finding evidence reference(s) did not match normalized evidence records.`);
  }
  if (args.matchedEvidence.length > 0 && args.directMatchedIds.size === 0) {
    reasons.push(`${args.matchedEvidence.length} related evidence record(s) matched by control or text overlap, but cited references were indirect.`);
  }
  if (args.finding.source === "tool" && completedTools > 0 && args.matchedEvidence.length > 0) {
    reasons.push("Tool-sourced finding has completed tool evidence available.");
  }
  if (args.directMatchedIds.size > 0 && args.missingRefs.length === 0) return { verdict: "supported", reasons };
  if (args.matchedEvidence.length > 0 || args.finding.evidence.length > 0) return { verdict: "partially_supported", reasons };
  return { verdict: "unsupported", reasons };
}

function detectUnsupportedClaims(finding: Finding, request: AuditRequest, matchedEvidence: EvidenceRecord[]): string[] {
  const runMode = request.run_mode ?? "static";
  const text = findingText(finding).toLowerCase();
  const evidenceBlob = matchedEvidence.map(evidenceText).join(" ").toLowerCase();
  const claims: string[] = [];
  const staticOnly = runMode === "static";
  const maybeEvidenceSupportsRuntime = /runtime|test|build|execution|sandbox|probe|dynamic/.test(evidenceBlob);
  if (staticOnly && /runtime|execut(?:e|ed|ion)|sandbox reproduction|dynamic validation|service unhealthy|build failure|test failure/.test(text) && !maybeEvidenceSupportsRuntime) {
    claims.push("Runtime or execution behavior is claimed from a static-only run without runtime evidence.");
  }
  if (/\b(exploitable|exploitation|arbitrary code execution|rce|privilege escalation|data exfiltration)\b/.test(text) && !/\b(poc|exploit|runtime|execution|trace|validated|reproduced)\b/.test(evidenceBlob)) {
    claims.push("Exploitability is claimed without direct exploit, runtime, or reproduction evidence.");
  }
  if (/\b(secret leak|credential leak|api key exposed|token exposed)\b/.test(text) && !/\b(secret|credential|api key|token|trivy|semgrep|leak)\b/.test(evidenceBlob)) {
    claims.push("Secret exposure is claimed without matching secret-scanning or source evidence.");
  }
  return claims;
}

function recommendControls(finding: Finding, catalog: StandardControlDefinition[], limit = 5): string[] {
  const topics = classifyFindingTopic(finding);
  const text = findingText(finding);
  const scored = catalog.map((control) => {
    let score = tokenOverlapCount(text, controlCatalogText(control));
    if (controlMatchesTopic(control, topics)) score += 5;
    if (finding.control_ids.includes(control.control_id)) score += 2;
    return { control, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.control.control_id.localeCompare(right.control.control_id))
    .slice(0, limit)
    .map((item) => item.control.control_id);
}

function evaluateControlMappings(args: {
  finding: Finding;
  matchedEvidence: EvidenceRecord[];
  controlResults: ControlResult[];
  controlCatalog: StandardControlDefinition[];
  strictSemanticMapping?: boolean;
}): { verdict: FindingControlMappingVerdict; mappings: FindingControlMappingQuality[]; recommended: string[]; reasons: string[] } {
  const reasons: string[] = [];
  if (!args.finding.control_ids.length) {
    const recommended = recommendControls(args.finding, args.controlCatalog);
    return {
      verdict: "missing_control",
      mappings: [],
      recommended,
      reasons: ["Finding has no mapped control IDs."]
    };
  }

  const catalogById = new Map(args.controlCatalog.map((control) => [control.control_id, control]));
  const resultById = new Map(args.controlResults.map((control) => [control.control_id, control]));
  const topics = classifyFindingTopic(args.finding);
  const evidenceControls = new Set(args.matchedEvidence.flatMap((record) => record.control_ids));
  const mappings: FindingControlMappingQuality[] = args.finding.control_ids.map((controlId) => {
    const catalogControl = catalogById.get(controlId);
    const resultControl = resultById.get(controlId);
    if (!catalogControl && !resultControl) {
      return { control_id: controlId, verdict: "wrong_control", reason: "Control ID is not present in the control catalog or normalized control results." };
    }
    const effectiveControl = catalogControl ?? resultControl!;
    const relatedControlResult = resultControl;
    const findingBacklink = relatedControlResult?.finding_ids.includes(args.finding.finding_id) ?? false;
    const evidenceOverlap = evidenceControls.has(controlId) || args.matchedEvidence.some((record) => record.control_ids.includes(controlId));
    const topicMatch = controlMatchesTopic(effectiveControl, topics);
    const textOverlap = tokenOverlapCount(findingText(args.finding), controlCatalogText(effectiveControl));
    if (topics.length > 0 && !topicMatch && textOverlap < 2) {
      if (args.strictSemanticMapping === false) {
        return { control_id: controlId, verdict: "weak", reason: "Finding topic does not strongly correspond to this control. Treated as a post-supervisor semantic hint rather than a hard integrity failure." };
      }
      return { control_id: controlId, verdict: "wrong_control", reason: "Finding topic does not correspond to this control; self-referential backlinks or evidence control IDs are insufficient." };
    }
    if (findingBacklink && (topicMatch || textOverlap >= 2)) {
      return { control_id: controlId, verdict: "correct", reason: "Control is linked back to the finding and matches evidence, topic, or control text." };
    }
    if (evidenceOverlap && (topicMatch || textOverlap >= 2)) {
      return { control_id: controlId, verdict: "plausible", reason: "Evidence and finding text plausibly match the mapped control, but the normalized control result does not strongly backlink the finding." };
    }
    if (topicMatch || textOverlap >= 2 || findingBacklink) {
      return { control_id: controlId, verdict: "weak", reason: "Control appears related, but supporting evidence or bidirectional linkage is incomplete." };
    }
    if (args.strictSemanticMapping === false) {
      return { control_id: controlId, verdict: "weak", reason: "Finding topic and evidence do not strongly correspond to this control. Treated as a post-supervisor semantic hint rather than a hard integrity failure." };
    }
    return { control_id: controlId, verdict: "wrong_control", reason: "Finding topic and evidence do not correspond to this control." };
  });

  const recommended = recommendControls(args.finding, args.controlCatalog);
  if (mappings.some((item) => item.verdict === "wrong_control")) reasons.push("At least one mapped control appears unsupported by the finding topic/evidence.");
  if (mappings.some((item) => item.verdict === "weak")) reasons.push("At least one mapped control has incomplete evidence or backlink support.");
  const rank: Record<FindingControlMappingVerdict, number> = {
    correct: 0,
    plausible: 1,
    weak: 2,
    wrong_control: 3,
    missing_control: 4
  };
  const worst = mappings.reduce<FindingControlMappingVerdict>((current, item) => rank[item.verdict] > rank[current] ? item.verdict : current, "correct");
  const verdict = worst === "correct" && mappings.some((item) => item.verdict === "plausible") ? "plausible" : worst;
  return { verdict, mappings, recommended, reasons };
}

function qualityScore(args: {
  evidenceVerdict: FindingEvidenceSupportVerdict;
  mappingVerdict: FindingControlMappingVerdict;
  unsupportedClaims: string[];
  missingRefs: string[];
}): number {
  let score = 100;
  if (args.evidenceVerdict === "partially_supported") score -= 25;
  if (args.evidenceVerdict === "unsupported") score -= 55;
  if (args.mappingVerdict === "plausible") score -= 10;
  if (args.mappingVerdict === "weak") score -= 25;
  if (args.mappingVerdict === "wrong_control") score -= 45;
  if (args.mappingVerdict === "missing_control") score -= 45;
  score -= Math.min(25, args.unsupportedClaims.length * 15);
  score -= Math.min(15, args.missingRefs.length * 5);
  return Math.max(0, Math.min(100, score));
}

function nextAction(args: {
  evidenceVerdict: FindingEvidenceSupportVerdict;
  mappingVerdict: FindingControlMappingVerdict;
  unsupportedClaims: string[];
}): FindingQualityNextAction {
  if (args.evidenceVerdict === "unsupported") return "needs_evidence";
  if (args.mappingVerdict === "wrong_control" || args.mappingVerdict === "missing_control") return "fix_control_mapping";
  if (args.unsupportedClaims.some((claim) => /runtime/i.test(claim))) return "needs_runtime_validation";
  if (args.unsupportedClaims.length) return "downgrade_or_reword";
  if (args.evidenceVerdict === "partially_supported" || args.mappingVerdict === "weak") return "manual_review";
  return "ready_for_review";
}

function validateOneFinding(args: {
  finding: Finding;
  request: AuditRequest;
  evidenceRecords: EvidenceRecord[];
  controlResults: ControlResult[];
  controlCatalog: StandardControlDefinition[];
  toolExecutions: ToolExecutionRecord[] | AnyRecord[];
  mode: FindingQualityMode;
}): FindingQualityRecord {
  const relatedEvidence = findRelatedEvidence(args.finding, args.evidenceRecords);
  const evidenceSupport = deriveEvidenceSupport({
    finding: args.finding,
    matchedEvidence: relatedEvidence.matched,
    directMatchedIds: relatedEvidence.directMatchedIds,
    missingRefs: relatedEvidence.missingRefs,
    toolExecutions: args.toolExecutions
  });
  const unsupportedClaims = detectUnsupportedClaims(args.finding, args.request, relatedEvidence.matched);
  const controlMapping = evaluateControlMappings({
    finding: args.finding,
    matchedEvidence: relatedEvidence.matched,
    controlResults: args.controlResults,
    controlCatalog: args.controlCatalog,
    strictSemanticMapping: args.mode !== "post_supervisor_integrity"
  });
  const hardIntegrityBlocking = evidenceSupport.verdict === "unsupported"
    || controlMapping.verdict === "missing_control"
    || controlMapping.mappings.some((item) => item.verdict === "wrong_control" && /not present in the control catalog|normalized control results/i.test(item.reason))
    || unsupportedClaims.length > 0;
  const semanticBlocking = controlMapping.verdict === "wrong_control";
  const qaBlocking = args.mode === "post_supervisor_integrity"
    ? hardIntegrityBlocking
    : evidenceSupport.verdict === "unsupported"
    || controlMapping.verdict === "wrong_control"
    || controlMapping.verdict === "missing_control"
    || unsupportedClaims.length > 0;
  const score = qualityScore({
    evidenceVerdict: evidenceSupport.verdict,
    mappingVerdict: controlMapping.verdict,
    unsupportedClaims,
    missingRefs: relatedEvidence.missingRefs
  });
  return {
    finding_id: args.finding.finding_id,
    title: args.finding.title,
    evidence_support_verdict: evidenceSupport.verdict,
    control_mapping_verdict: controlMapping.verdict,
    qa_blocking: qaBlocking,
    integrity_blocking: hardIntegrityBlocking,
    semantic_review_hint: semanticBlocking || controlMapping.verdict === "weak" || controlMapping.verdict === "plausible",
    quality_score: score,
    matched_evidence_ids: relatedEvidence.matched.map((record) => record.evidence_id).filter(Boolean),
    missing_evidence_refs: relatedEvidence.missingRefs,
    unsupported_claims: unsupportedClaims,
    claimed_control_ids: args.finding.control_ids,
    recommended_control_ids: controlMapping.recommended,
    control_mappings: controlMapping.mappings,
    reasons: [...evidenceSupport.reasons, ...controlMapping.reasons, ...unsupportedClaims],
    next_action: nextAction({
      evidenceVerdict: evidenceSupport.verdict,
      mappingVerdict: controlMapping.verdict,
      unsupportedClaims
    })
  };
}

export function buildFindingQualitySummary(args: {
  runId: string;
  request?: AuditRequest;
  findings: Array<Finding | AnyRecord>;
  evidenceRecords?: Array<EvidenceRecord | AnyRecord>;
  controlResults?: Array<ControlResult | AnyRecord>;
  controlCatalog?: StandardControlDefinition[];
  toolExecutions?: Array<ToolExecutionRecord | AnyRecord>;
  generatedAt?: string;
  mode?: FindingQualityMode;
}): FindingQualitySummary {
  const request = args.request ?? { run_mode: "static" };
  const mode = args.mode ?? "legacy_quality";
  const findings = args.findings.map(normalizeFinding).filter((finding) => finding.finding_id);
  const evidenceRecords = (args.evidenceRecords ?? []).map(normalizeEvidence);
  const controlResults = (args.controlResults ?? []).map(normalizeControl);
  const controlCatalog = args.controlCatalog ?? controlResults.map((control) => ({
    control_id: control.control_id,
    framework: control.framework,
    standard_ref: control.standard_ref,
    title: control.title,
    description: asStringArray(control.rationale).join(" "),
    weight: control.score_weight,
    static_assessable: control.assessability !== "not_assessed",
    baseline_dimension: "evidence_readiness",
    catalog: "harness_internal",
    applicability: ["all"]
  } as StandardControlDefinition));
  const qualityFindings = findings.map((finding) => validateOneFinding({
    finding,
    request,
    evidenceRecords,
    controlResults,
    controlCatalog,
    toolExecutions: args.toolExecutions ?? [],
    mode
  }));
  const unsupportedCount = qualityFindings.filter((item) => item.evidence_support_verdict === "unsupported").length;
  const wrongControlCount = qualityFindings.filter((item) => item.control_mapping_verdict === "wrong_control").length;
  const missingControlCount = qualityFindings.filter((item) => item.control_mapping_verdict === "missing_control").length;
  const blockingCount = qualityFindings.filter((item) => item.qa_blocking).length;
  const weakCount = qualityFindings.filter((item) => item.control_mapping_verdict === "weak" || item.evidence_support_verdict === "partially_supported").length;
  const unsupportedClaimCount = qualityFindings.filter((item) => item.unsupported_claims.length > 0).length;
  const overallVerdict: FindingQualitySummary["overall_verdict"] = unsupportedCount || wrongControlCount || missingControlCount || unsupportedClaimCount
    ? "fail"
    : blockingCount || weakCount
      ? "needs_review"
      : "pass";
  return {
    run_id: args.runId,
    generated_at: args.generatedAt ?? new Date().toISOString(),
    artifact_role: mode,
    authority: mode === "post_supervisor_integrity" ? "deterministic_integrity_gate" : "deterministic_facts_and_hints",
    overall_verdict: overallVerdict,
    validated_count: qualityFindings.filter((item) => item.evidence_support_verdict === "supported" && item.control_mapping_verdict === "correct").length,
    plausible_count: qualityFindings.filter((item) => item.control_mapping_verdict === "plausible").length,
    weak_count: weakCount,
    unsupported_count: unsupportedCount,
    wrong_control_count: wrongControlCount,
    missing_control_count: missingControlCount,
    blocking_count: blockingCount,
    findings: qualityFindings
  };
}

export function buildPreSupervisorEvidencePacket(args: Omit<Parameters<typeof buildFindingQualitySummary>[0], "mode">): FindingQualitySummary {
  return buildFindingQualitySummary({ ...args, mode: "pre_supervisor_evidence_packet" });
}

export function buildPostSupervisorIntegritySummary(args: Omit<Parameters<typeof buildFindingQualitySummary>[0], "mode">): FindingQualitySummary {
  return buildFindingQualitySummary({ ...args, mode: "post_supervisor_integrity" });
}
