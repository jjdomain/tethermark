# Remediation Workflow

Tethermark separates finding review from remediation closure.

## Community Edition Workflow

Community Edition does not have automatic GitHub integration. Confirmed findings can create local remediation items, and operators can paste manual external issue, PR, commit, and validation-run links. Community Edition can also export SARIF for GitHub code scanning upload; see [GitHub SARIF Upload](./github-sarif-upload.md).

Recommended Community Edition flow:

1. Triage the finding.
2. For real issues, choose `Confirmed`.
3. Open the finding `Remediation` tab.
4. Create a remediation item with owner, priority, due date, summary, and acceptance criteria.
5. If work is tracked externally, paste the GitHub/Jira issue URL and PR URL manually.
6. Move status through fix-in-progress and validation states.
7. Run a follow-up audit against the fixed commit.
8. Resolve the finding only after recording validation evidence, fix commit, or explicit closure notes.

Remediation item actions write review actions automatically so users do not have to update finding state separately:

- `open_remediation`
- `mark_fix_in_progress`
- `mark_fix_ready_for_validation`
- `mark_verification_pending`
- `resolve_finding`
- `reopen_finding`

False positives and not-applicable findings use suppressions. Accepted risk uses waivers. These are exception paths, not remediation closure paths.

## Tethermark Cloud Workflow

Tethermark Cloud should add connector automation outside Community Edition:

- create GitHub/Jira issues after confirmation and RBAC checks
- record issue IDs, URLs, labels, owner/team mappings, and SLA state
- receive signed GitHub App webhooks for issue, PR, merge, and comment events
- update remediation item state from connector events
- queue validation audits after merge or explicit fix-ready events
- close findings only after validation evidence shows the finding no longer reproduces, or after an explicit exception

GitHub issue closure or PR merge should not directly mark a Tethermark finding as resolved. It should move the item to a verification state and attach the merge SHA or PR URL. Tethermark resolution requires validation evidence or a reviewer-recorded exception.

## Assistant Behavior

Community Edition assistant:

- explains current remediation status from local remediation items
- drafts issue text, PR comments, acceptance criteria, and closure notes
- can point users to the Remediation tab for local updates
- must not create GitHub/Jira issues or claim webhook-driven status updates exist

Tethermark Cloud assistant:

- may create issues, update tickets, post comments, schedule verification, and summarize cross-project remediation state
- must use backend RBAC and connector permission checks
- must require confirmation before state-changing or external actions
- must write assistant action execution records for every confirmed or rejected action
