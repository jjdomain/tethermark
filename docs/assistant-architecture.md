# AI Audit Assistant Architecture

Tethermark's assistant is split between the Community Edition engine layer and Tethermark Cloud platform extensions.

## Community Edition Assistant Availability

The Community Edition assistant is enabled by default, like the other local audit agents. It uses persisted Tethermark audit data and the configured assistant/global LLM settings.

If no usable assistant LLM is configured or the configured model cannot be reached, the chat drawer remains available and returns deterministic evidence-grounded fallback answers with limitations. Operators should see this as a model-configuration warning inside the assistant, not as a disabled feature.

Administrators can explicitly disable assistant routes by setting `HARNESS_DISABLE_ASSISTANT=1` or `HARNESS_ENABLE_ASSISTANT=0`. When disabled this way, `/assistant/*` routes return `assistant_disabled`. If the web UI reports that assistant routes are missing, rebuild and restart the API server so it picks up the latest backend routes.

## Community Edition Boundary

Community Edition ships the assistant as a local, evidence-grounded interface over one self-hosted installation. It can audit many repos or paths, but assistant sessions are scoped to a selected run or target.

Enabled Community Edition capabilities:

- read audit evidence, findings, review state, exports, and target history
- draft reviewer-facing rationale, remediation guidance, and outbound payloads
- confirm bounded internal actions, such as preparing exports, saving finding dispositions, adding comments, launching runs, retrying or canceling jobs, and queueing runtime follow-ups when existing backend rules allow it

External connector execution remains draft-only in Community Edition. The assistant may prepare a payload, but it does not create GitHub issues, post PR comments, listen for GitHub webhooks, or send Jira, Slack, or email actions. For GitHub code scanning, Community Edition uses SARIF export and upload rather than connector execution.

## Community Edition Model Routing And Fallback

The assistant uses the same persisted audit data as the run detail UI. It does not ask the model to invent audit state.

Model selection order:

1. If Settings -> LLM -> Assistant Model is set to inherit, the assistant uses the global default provider/model.
2. If an assistant-specific provider/model is configured, the assistant uses that override.
3. Environment defaults can prefill assistant settings through `ASSISTANT_LLM_PROVIDER` and `ASSISTANT_LLM_MODEL`.
4. If no usable assistant LLM is available, Community Edition returns deterministic evidence-grounded fallback answers.

The deterministic fallback is intentional. It can summarize the selected run, cite findings and evidence, and explain limits without relying on model inference. It should be treated as lower fluency but safer than returning unsupported claims.

Assistant responses include:

- `message`: user-facing answer
- `citations`: run, finding, evidence, artifact, and review-action references
- `confidence`: `high`, `medium`, `low`, or `insufficient_evidence`
- `proposed_actions`: typed actions requiring confirmation
- `limitations`: explicit gaps when evidence is missing or the selected scope is too narrow

## Community Edition UI Behavior

The run detail assistant opens as a right-side drawer. The drawer intentionally stays secondary to the canonical audit UI:

- run detail, finding detail, review state, and exports remain the source of truth
- assistant conversations are scoped to either the selected run or target history
- conversation history is local and shown as contextual conversations
- suggested prompts appear only as starting points
- mutating proposals require explicit confirmation before execution

The composer does not expose attachment or permission icons in Community Edition. File attachment should wait for a real ingestion path that can persist, scan, and cite uploaded context. Permissions belong in Settings/Admin and backend action checks, not in per-message UI controls.

Dark mode is app-level, not assistant-specific. The default Community Edition web UI theme is dark, with a sidebar toggle for light mode. The theme preference is stored in local browser storage.

## Confirmed Internal Actions

Community Edition assistant actions are intentionally bounded to local Tethermark operations. Supported confirmed actions include:

- adding review comments
- saving finding dispositions when backend validation allows it
- drafting remediation rationale and referring users to local remediation items
- generating exports or review bundles
- starting or retrying eligible runs/jobs
- canceling eligible async jobs
- queueing runtime follow-up only when existing backend rules say it is launchable

Every confirmed or rejected proposal writes an assistant action execution record. The audit trail includes actor, timestamp, original request, proposed payload, confirmation result, and before/after state when applicable.

## Community Edition Limitations

Community Edition must not:

- execute external GitHub/Jira/Slack/email/webhook sends
- create GitHub issues or update Tethermark from GitHub webhook state
- answer project, workspace, organization, or portfolio questions
- bypass normal review workflow rules
- claim exploitability without supporting evidence
- use assistant memory across projects or organizations
- run autonomous scheduled assistant workflows

Cloud-only scope requests return the stable `hosted_only` compatibility code.

## Tethermark Cloud Extension Boundary

Cloud implementations should import the shared assistant interfaces from `packages/core-engine/src/assistant.ts` and add platform-specific adapters outside the Community Edition repository.

Tethermark Cloud should replace or extend:

- `AssistantStorage` with a Supabase/Postgres implementation
- `AssistantContextBuilder` with project, workspace, organization, owner, SLA, connector-health, and historical trend context
- `AssistantToolRegistry` with RBAC-aware external and autonomous tools
- `AssistantProvider` with hosted model/provider routing and policy-aware memory

Tethermark Cloud remediation should add a GitHub/Jira connector layer outside Community Edition. The Cloud layer should create issues only after user confirmation and permission checks, subscribe to signed GitHub App webhooks, record issue/PR/merge events, and queue validation audits. GitHub issue closure or PR merge should move a remediation item to `fix_merged` or `verification_pending`, not directly to `resolved`. Tethermark should mark `resolved` only after a validation run no longer reproduces the finding, or after an explicit accepted-risk/suppression path.

The Community Edition API and UI must stay wired only to the shared interfaces. Cloud-only tools are added through `AssistantToolRegistryExtension` so the private Cloud layer can register connector and autonomous tools without scattering Cloud conditionals through Community Edition handlers.

## Capability Matrix

| Capability | Community Edition | Tethermark Cloud |
| --- | --- | --- |
| Run Q&A | yes | yes |
| Target-history Q&A | yes | yes |
| Project/workspace/org Q&A | no, returns `hosted_only` compatibility code | yes, RBAC scoped |
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

Tethermark Cloud Supabase should mirror the Community Edition assistant records:

- `assistant_sessions`
- `assistant_messages`
- `assistant_citations`
- `assistant_action_proposals`
- `assistant_action_executions`

Cloud-only tables can add:

- `assistant_memories`
- `assistant_schedules`
- `assistant_notification_routes`
- `connector_events`
- `connector_delivery_attempts`
- `hosted_remediation_links`

Cloud rows should include tenant fields such as `organization_id`, `workspace_id`, `project_id`, and `actor_id`, with RLS policies enforcing scoped read/write access. Confirmed assistant actions must go through the same backend permission checks as normal UI/API actions.

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
