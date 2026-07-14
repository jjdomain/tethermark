# Manual Pi Static Audit Test Plan

Use this plan to manually validate the OSS static audit workflow before implementing or releasing local runtime sandbox support. The goal is to confirm that Tethermark behaves like a credible standalone AI security harness: findings are evidence-grounded, mapped to controls, reviewable, remediable, exportable, and explainable through the assistant.

Automated Pi E2E scripts remain useful smoke/regression checks. This manual plan validates agent judgment quality, evidence quality, control mapping quality, and end-to-end remediation workflow quality.

## Target

- Repo: `https://github.com/earendil-works/pi.git`
- Commit: `3d9e14d7482f4a99d5224926099bec0d17ff86fd`
- Audit package: `agentic-static`
- Run mode: `static`
- Baseline provider: `mock`
- Optional second pass: configured live LLM provider

The first manual validation should use the mock provider so behavior is deterministic. A second live-provider pass is useful for assessing real model behavior, but it should not replace the deterministic baseline.

## 1. Pre-Test Setup

Start from a clean local OSS environment.

Set:

```powershell
$env:HARNESS_ENABLE_ASSISTANT = "1"
$env:HARNESS_API_AUTH_MODE = "none"
$env:HARNESS_LOCAL_DB_ROOT = "<manual-test-work-root>\\local-db"
```

Build and start the OSS API and web UI.

Verify:

- `/health`
- `/static-tools`

Record whether Scorecard, Semgrep, and Trivy are available, skipped, or failed. A skipped tool is acceptable only when the audit records the reason and does not treat the missing tool as a pass.

## 2. Launch Static Audit

Run the Pi Agent static audit from the UI if all fields are exposed. Otherwise use the API request shape from the existing Pi static E2E script.

Expected launch configuration:

- `repo_url`: `https://github.com/earendil-works/pi.git`
- `repo_checkout_ref`: `3d9e14d7482f4a99d5224926099bec0d17ff86fd`
- `run_mode`: `static`
- `audit_package`: `agentic-static`
- runtime execution: disabled
- network/install/build/target execution: disabled for target code
- external static tools: Scorecard, Semgrep, Trivy
- provider: `mock`

Pass criteria:

- Run completes successfully or records explainable tool-level failures.
- The run records the pinned commit as source provenance.
- The selected run plan is static-only.
- No target install, build, runtime execution, Docker execution, or network egress is attempted.

Fail criteria:

- Static audit attempts to execute target code.
- Runtime validation is silently treated as completed.
- Tool failure is hidden or converted into a clean pass.

## 3. Validate Agent Planning And Scope

Inspect the run detail, run plan, stage executions, agent invocations, and artifact index.

Validate:

- Target classification correctly identifies Pi Agent as the audited target.
- The audit package and policy pack are correct.
- The planner selects static analysis and repo posture checks.
- Runtime probes are not executed.
- Agent stages explain what they assessed and what they could not assess.
- The audit records limitations when evidence is missing.

Pass criteria:

- The plan matches static audit intent.
- Agent reasoning is specific to the repo and does not invent runtime behavior.
- Limitations are visible and understandable.

## 4. Validate Findings

For the top findings, manually inspect each one against the cited evidence.

For each selected finding, record:

- Finding ID
- Title/category
- Severity and confidence
- Source stage/tool
- Cited evidence records
- Observations
- Mapped controls
- Remediation guidance
- False-positive risk
- Validation or follow-up recommendation
- Manual verdict: correct, partially correct, false positive, duplicate, or unsupported

Required checks:

- Every factual claim has evidence or a clear limitation.
- Every finding maps to one or more controls.
- Severity and confidence match the evidence strength.
- Duplicate findings are either deduplicated or clearly related.
- Remediation is specific enough for an engineer to act on.
- Findings do not claim exploitability without evidence.

Fail criteria:

- A finding has no evidence.
- A finding has no control mapping.
- The assistant or agent invents files, behavior, workflows, dependencies, or exploitability.
- Missing static tools are treated as evidence that a risk is absent.

## 5. Validate Control Mapping

Inspect control results and compare them with findings.

Validate:

- Failed or needs-review controls have linked findings or clear supporting observations.
- Passed controls have evidence, not assumptions.
- Not-assessed controls are marked as not assessed or limited, not passed.
- Agent/security-specific controls are represented where applicable, including tool permissions, dependency hygiene, secrets posture, policy boundaries, CI permissions, and disclosure/security policy posture.

Pass criteria:

- Control state, finding state, and evidence state are consistent.
- The control view can be used as a governance summary without reading every finding.

## 6. Validate Evidence And Observations

Inspect:

- Evidence records
- Tool executions
- Observations
- Artifact index
- Stage executions
- Agent invocations

Validate:

- Scorecard/Semgrep/Trivy statuses are recorded with output or skip/failure reasons.
- Evidence records cite source files, tool output, observations, or artifacts where available.
- Artifact links open from the UI.
- Evidence supports the finding text.
- Evidence timestamps and run IDs match the selected run.

Pass criteria:

- A reviewer can reconstruct why the finding exists.
- Evidence and observations are stable enough to support export and assistant answers.

## 7. Validate Review And Triage

Perform these manual review actions:

- Assign a reviewer.
- Start review.
- Select one finding and mark it `Confirmed`.
- Select one finding and mark it `Needs validation`.
- Select one finding and mark it `False positive` or `Not applicable`.
- Select one finding and mark it `Accepted risk`.
- Add a review comment.
- Save each decision and refresh the page.

Validate:

- Decisions persist.
- Review action history records each action.
- Suppression/waiver-style decisions include reason, scope, and expiration where supported.
- Confirmed findings become eligible for remediation.
- Needs-validation findings become eligible for follow-up validation.

Pass criteria:

- Review workflow is understandable without using an external tracker.
- Decision history is auditable.
- Triage status updates the finding and review posture.

## 8. Validate Remediation Workflow

For a confirmed finding:

- Open or create a remediation item.
- Assign owner/priority if supported.
- Add remediation notes and acceptance criteria.
- Move the item through fix-in-progress or equivalent status.
- Mark it ready for verification if supported.
- Resolve it only after entering closure evidence such as fix commit SHA, validation run ID, manual verification notes, or resolution notes.

Validate:

- The remediation tab shows only remediation-relevant confirmed findings or clearly explains why other findings are not eligible.
- Status changes persist.
- The finding status updates automatically when remediation actions are taken.
- Review audit history records remediation creation and resolution.
- Resolved findings remain visible in history for later runs.

Pass criteria:

- A user does not need to remember to manually update multiple disconnected statuses.
- Closure is documented enough for the next audit to reference.

## 9. Validate Re-Run And Follow-Up Audit Behavior

For a needs-validation finding:

- Trigger a capable-environment follow-up or rerun request.
- Confirm that the follow-up is linked to the finding.
- Confirm that OSS does not falsely claim runtime validation completed if no runtime sandbox exists.
- Start a follow-up static rerun if appropriate.
- Compare current run vs prior run for recurring, resolved, and new findings.

Pass criteria:

- Follow-up state is linked to findings.
- Rerun history can show whether remediation changed audit results.
- Prior decisions and remediation history are available to future audit context.

## 10. Validate Assistant Behavior

Use the assistant against the selected run and selected finding.

Ask:

- `Give me a manager summary for this audit.`
- `What are the top risks and release blockers?`
- `What evidence supports this finding?`
- `Which findings are likely false positives?`
- `What remediation should engineering do first?`
- `Draft a triage rationale for this finding.`
- `Add a review comment summarizing this decision.`
- `Create a GitHub issue for this finding.`

Expected behavior:

- Answers cite run, finding, evidence, artifact, or review records.
- Low-evidence answers state limitations.
- Draft actions are separated from confirmed actions.
- Internal state-changing actions require confirmation.
- GitHub/Jira/Slack/email execution remains unavailable in OSS and is presented as draft/manual only.
- Assistant history is scoped to the selected run or target, not one unbounded global chat.

Pass criteria:

- Assistant improves comprehension without becoming the source of truth.
- Assistant never invents evidence.
- Assistant can support remediation and follow-up decisions.

## 11. Validate Exports

Generate and inspect:

- Markdown report
- Executive report
- SARIF report
- Review audit report
- Finding evaluations
- Remediation/follow-up summary if available

Validate:

- Executive report reflects real findings and limitations.
- SARIF includes results and locations where possible.
- Review audit includes triage, comments, remediation, and closure actions.
- Exported content matches the UI and API state.

Pass criteria:

- Reports can be shared with managers, engineers, and auditors without losing critical context.

## Acceptance Criteria

The Pi manual static audit passes only if all of these are true:

- Static-only sandbox policy is enforced.
- Pinned commit provenance is recorded.
- Findings are evidence-grounded.
- Findings map to controls.
- Tool failures/skips are visible and not treated as passes.
- Review decisions persist and are auditable.
- Confirmed findings can move into remediation.
- Remediation actions update finding/remediation state automatically where applicable.
- Follow-up and rerun history links back to findings.
- Assistant answers cite evidence and respect OSS/hosted boundaries.
- Exports accurately reflect the run, findings, review, remediation, and limitations.

Critical failure conditions:

- Any unsupported or fabricated finding claim.
- Any finding without evidence or control mapping.
- Static audit executing target code.
- Runtime validation presented as complete without runtime execution.
- Assistant executing external hosted-only actions in OSS.
- Remediation closure without any documented verification or closure evidence.

## Test Record Template

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Tethermark version/commit | |
| Pi repo commit | `3d9e14d7482f4a99d5224926099bec0d17ff86fd` |
| Run ID | |
| Static tools available | |
| Static tools skipped/failed | |
| Top findings manually checked | |
| Control mapping verdict | Pass / Fail |
| Evidence verdict | Pass / Fail |
| Review workflow verdict | Pass / Fail |
| Remediation workflow verdict | Pass / Fail |
| Follow-up/rerun verdict | Pass / Fail |
| Assistant verdict | Pass / Fail |
| Export verdict | Pass / Fail |
| Critical issues found | |
| Final release verdict | Pass / Fail |
