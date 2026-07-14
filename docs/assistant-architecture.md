# AI Audit Assistant Architecture

Tethermark's assistant is split between the OSS engine layer and hosted platform extensions.

## Enabling OSS Assistant

The OSS assistant is feature-flagged. Start the local stack with:

```bash
HARNESS_ENABLE_ASSISTANT=1 npm run oss
```

Windows PowerShell:

```powershell
$env:HARNESS_ENABLE_ASSISTANT='1'; npm run oss
```

When the flag is off, `/assistant/*` routes return `assistant_disabled`. If the web UI reports that assistant routes are missing, rebuild and restart the API server so it picks up the latest backend routes and environment.

## OSS Boundary

OSS ships the assistant as a local, evidence-grounded interface over one self-hosted installation. It can audit many repos or paths, but assistant sessions are scoped to a selected run or target.

Enabled OSS capabilities:

- read audit evidence, findings, review state, exports, and target history
- draft reviewer-facing rationale, remediation guidance, and outbound payloads
- confirm bounded internal actions, such as preparing exports, saving finding dispositions, adding comments, launching runs, retrying or canceling jobs, and queueing runtime follow-ups when existing backend rules allow it

External connector execution remains draft-only in OSS. The assistant may prepare a payload, but it does not create GitHub issues, post PR comments, listen for GitHub webhooks, or send Jira, Slack, or email actions. For GitHub code scanning, OSS uses SARIF export and upload rather than connector execution.

## OSS Model Routing And Fallback

The assistant uses the same persisted audit data as the run detail UI. It does not ask the model to invent audit state.

Model selection order:

1. If Settings -> LLM -> Assistant Model is set to inherit, the assistant uses the global default provider/model.
2. If an assistant-specific provider/model is configured, the assistant uses that override.
3. Environment defaults can prefill assistant settings through `ASSISTANT_LLM_PROVIDER` and `ASSISTANT_LLM_MODEL`.
4. If no usable assistant LLM is available, OSS returns deterministic evidence-grounded fallback answers.

The deterministic fallback is intentional. It can summarize the selected run, cite findings and evidence, and explain limits without relying on model inference. It should be treated as lower fluency but safer than returning unsupported claims.

Assistant responses include:

- `message`: user-facing answer
- `citations`: run, finding, evidence, artifact, and review-action references
- `confidence`: `high`, `medium`, `low`, or `insufficient_evidence`
- `proposed_actions`: typed actions requiring confirmation
- `limitations`: explicit gaps when evidence is missing or the selected scope is too narrow

## OSS UI Behavior

The run detail assistant opens as a right-side drawer. The drawer intentionally stays secondary to the canonical audit UI:

- run detail, finding detail, review state, and exports remain the source of truth
- assistant conversations are scoped to either the selected run or target history
- conversation history is local and shown as contextual conversations
- suggested prompts appear only as starting points
- mutating proposals require explicit confirmation before execution

The composer does not expose attachment or permission icons in OSS. File attachment should wait for a real ingestion path that can persist, scan, and cite uploaded context. Permissions belong in Settings/Admin and backend action checks, not in per-message UI controls.

Dark mode is app-level, not assistant-specific. The default OSS web UI theme is dark, with a sidebar toggle for light mode. The theme preference is stored in local browser storage.

## Confirmed Internal Actions

OSS assistant actions are intentionally bounded to local Tethermark operations. Supported confirmed actions include:

- adding review comments
- saving finding dispositions when backend validation allows it
- drafting remediation rationale and referring users to local remediation items
- generating exports or review bundles
- starting or retrying eligible runs/jobs
- canceling eligible async jobs
- queueing runtime follow-up only when existing backend rules say it is launchable

Every confirmed or rejected proposal writes an assistant action execution record. The audit trail includes actor, timestamp, original request, proposed payload, confirmation result, and before/after state when applicable.

## OSS Limitations

OSS must not:

- execute external GitHub/Jira/Slack/email/webhook sends
- create GitHub issues or update Tethermark from GitHub webhook state
- answer project, workspace, organization, or portfolio questions
- bypass normal review workflow rules
- claim exploitability without supporting evidence
- use assistant memory across projects or organizations
- run autonomous scheduled assistant workflows

Hosted-only scope requests return `hosted_only`.

## Hosted Extension Boundary

Hosted implementations should import the shared assistant interfaces from `packages/core-engine/src/assistant.ts` and add platform-specific adapters outside the OSS repo.

Hosted should replace or extend:

- `AssistantStorage` with a Supabase/Postgres implementation
- `AssistantContextBuilder` with project, workspace, organization, owner, SLA, connector-health, and historical trend context
- `AssistantToolRegistry` with RBAC-aware external and autonomous tools
- `AssistantProvider` with hosted model/provider routing and policy-aware memory

Hosted remediation should add a GitHub/Jira connector layer outside OSS. The hosted layer should create issues only after user confirmation and permission checks, subscribe to signed GitHub App webhooks, record issue/PR/merge events, and queue validation audits. GitHub issue closure or PR merge should move a remediation item to `fix_merged` or `verification_pending`, not directly to `resolved`. Tethermark should mark `resolved` only after a validation run no longer reproduces the finding, or after an explicit accepted-risk/suppression path.

The OSS API and UI must stay wired only to the shared interfaces. Hosted-only tools are added through `AssistantToolRegistryExtension` so the private hosted layer can register connector and autonomous tools without scattering `hosted` conditionals through OSS handlers.

## Capability Matrix

| Capability | OSS | Hosted |
| --- | --- | --- |
| Run Q&A | yes | yes |
| Target-history Q&A | yes | yes |
| Project/workspace/org Q&A | no, returns `hosted_only` | yes, RBAC scoped |
| Draft triage/remediation/export text | yes | yes |
| Confirm internal actions | yes | yes |
| Create/update GitHub/Jira issues | no, draft/manual link only | yes, permission and connector gated |
| Ingest GitHub/Jira webhooks for remediation state | no | yes, signed webhook + RBAC scoped |
| Execute GitHub/Jira/Slack/email/webhook sends | no, draft-only | yes, permission and connector gated |
| Autonomous schedules/digests | no | yes, policy limited |

All mutating actions require explicit confirmation and write an execution audit record with actor, original request, proposed action, before/after state when available, and confirmation result.

## Self-Learning Boundary

Assistant-confirmed actions can feed the governed self-learning loop only when tied to cited run or finding evidence. V1 stores those signals as auditable candidates and dry-run experiments; it does not inject hidden memory into future audit prompts or automatically change audit behavior. The v1/v2 boundary is documented in [`self-learning-governed-improvement-loop.md`](self-learning-governed-improvement-loop.md).

## Supabase Tables

Hosted Supabase should mirror the OSS assistant records:

- `assistant_sessions`
- `assistant_messages`
- `assistant_citations`
- `assistant_action_proposals`
- `assistant_action_executions`

Hosted-only tables can add:

- `assistant_memories`
- `assistant_schedules`
- `assistant_notification_routes`
- `connector_events`
- `connector_delivery_attempts`
- `hosted_remediation_links`

Hosted rows should include tenant fields such as `organization_id`, `workspace_id`, `project_id`, and `actor_id`, with RLS policies enforcing scoped read/write access. Confirmed assistant actions must go through the same backend permission checks as normal UI/API actions.

Minimum hosted column contract:

- `assistant_sessions`: `id`, `organization_id`, `workspace_id`, `project_id`, `scope_type`, `scope_id`, `target_id`, `run_id`, `actor_id`, `status`, `metadata_json`, timestamps.
- `assistant_messages`: `id`, `session_id`, `organization_id`, `workspace_id`, `project_id`, `role`, `body`, `response_json`, timestamp.
- `assistant_citations`: `id`, `session_id`, `message_id`, tenant fields, citation identifiers, timestamp.
- `assistant_action_proposals`: `id`, `session_id`, `message_id`, tenant fields, `action_type`, `capability`, `status`, `requires_confirmation`, `hosted_only`, `payload_json`, resolution fields, timestamps.
- `assistant_action_executions`: `id`, `session_id`, `action_id`, tenant fields, `actor_id`, `original_user_request`, `proposed_action_json`, `confirmation_result`, `before_state_json`, `after_state_json`, `request_json`, `result_json`, `error`, timestamp.
- `assistant_memories`: `id`, tenant fields, `memory_type`, `scope_type`, `scope_id`, `content_json`, `source_action_id`, `confidence`, timestamps.

RLS policies should enforce:

- users can read sessions/messages only for tenant/project scopes they can read
- users can create messages only in sessions they can read
- users can confirm actions only when the backing product action is also allowed for that user
- service-role workers can execute scheduled hosted workflows, but must record the initiating policy/schedule id
- no cross-tenant memory retrieval; org memories are included only when the user can read that org scope
