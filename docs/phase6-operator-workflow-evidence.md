# Phase 6 Operator Workflow Evidence

Date: 2026-08-20

This record captures the bounded Community Edition release walkthrough. It is product verification evidence, not a security assessment of the fixture.

## Environment

- Fresh isolated local persistence root under `.artifacts/phase6-clean-user-20260820`
- Community Edition API and web UI started with `npm run oss`
- Local binaries and Python workers disabled deliberately so incomplete evidence behavior was observable
- ChatGPT subscription authentication and Codex CLI readiness verified in **System -> Audit Behavior -> Agents & Models**
- Deterministic mock model used for the lifecycle audit; no additional live-model calibration run was launched

## Walkthrough

- Readiness accepted for the small agent-tool-boundary fixture with eight visible warnings and no blockers.
- Durable async audit `run_async_b161d51c-fc48-42c8-a953-74ad77bba1db` completed successfully.
- Reviewer assignment, review start, and reviewer discussion were persisted.
- One runtime-sensitive finding was placed into a capable-environment rerun workflow.
- A remediation item was assigned to `platform-security`, linked to a manual GitHub issues location, and moved to `fix_in_progress` without falsely claiming closure.
- Runtime follow-up remained `pending`; no redundant runtime audit was launched.
- Executive JSON reported `validation_completeness.status = incomplete`, including four skipped tools, mock-model limitations, and two not-assessed controls.
- SARIF was generated as version 2.1.0 with one run and ten results.
- Executive export metadata reported `executive_summary.v1`, schema version `1.0.0`, compatibility major `1`, and `same-major-additive` policy.

## Restart Recovery

Before and after stopping and restarting the same Community Edition instance, the persisted record contained:

- 6 review actions
- 1 review comment
- 1 remediation item in `fix_in_progress`
- 1 runtime follow-up in `pending`

The web UI reopened the run after restart and displayed the pending runtime follow-up. Export routes remained available.

## Screenshots

- [ChatGPT and Codex readiness](./images/phase6-chatgpt-ready.png)
- [Accepted audit readiness](./images/phase6-audit-readiness.png)
- [Persisted runtime follow-up](./images/phase6-runtime-followup.png)

## Release Interpretation

The walkthrough proves the operator lifecycle and restart recovery. It does not convert skipped scanners, mock model stages, or an unexecuted runtime follow-up into passing evidence. A live GitHub SARIF upload remains an authorized maintainer action because it writes to repository code-scanning state; the documented SARIF 2.1.0 contract and manual upload procedure are verified locally.
