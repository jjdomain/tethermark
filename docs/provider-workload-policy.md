# Provider Workload Policy

Last reviewed: 2026-08-07
Policy version: `provider-policy.v1`

This policy controls which model provider, credential class, and initiation mode may be used for each Tethermark Community Edition workload. Enforcement lives in `packages/llm-provider/src/policy.ts`; documentation does not override the code.

## Configuration matrix

| Product use | Workload class | Initiation mode | Allowed provider | Credential class | Default behavior |
|---|---|---|---|---|---|
| Explicit local static or runtime-validation CLI/web launch | `interactive_operator` | `operator` | `openai_codex` | `chatgpt_session` | Community Edition default after the operator signs in locally |
| Explicit local static or runtime-validation CLI/web launch | `interactive_operator` | `operator` | `openai` | `api_key` | Optional only when the operator explicitly selects it and configures a key |
| Deterministic development or an offline fixture | Any declared class | matching class | `mock` | `none` | Allowed, but output is never evidence of a real-model audit |
| Local scheduler, queued automation, or background learning synthesis | `unattended_local` | `background` | `openai` | `api_key` | Allowed within the configured request/token/rate limits |
| Ordinary pull-request CI | `unattended_local` | `background` | `mock` | `none` | Required; live credentials are removed by the test runner |
| Explicit trusted live CI workflow | `external_service` | `service` | `openai` | `api_key` | Opt-in only; not part of ordinary CI |
| Downstream worker or hosted integration | `external_service` | `service` | `openai` | `api_key` | Allowed only with service-owned quotas and audit logs |
| Unattended or service use through `openai_codex` | `unattended_local` or `external_service` | `background` or `service` | none | `chatgpt_session` | Rejected before the model process starts |

OpenAI documents enterprise Codex access tokens for trusted non-interactive workflows. Community Edition does not yet provision, verify, rotate, or revoke that credential class, so `enterprise_access_token` remains fail-closed rather than being treated as implemented support.

## Classification rules

- `interactive_operator` means a person explicitly launches the run from the local CLI or web UI. A confirmed diagnostic or linked rerun may execute through the durable queue while retaining this class because the initiating intent is explicit and local.
- `unattended_local` means a scheduler, hook, unattended queue client, or background workflow starts the work without a current operator confirmation.
- `external_service` means a downstream worker, hosted integration, service account, or trusted live CI workflow starts the work.
- API clients that omit a workload class on an asynchronous request are classified as `unattended_local`.
- CLI scans and synchronous local API launches default to `interactive_operator`.
- Operator-started runtime validation inherits the `openai_codex`/`chatgpt_session` default. Selecting an isolated runtime backend never silently switches the model provider to API-key mode.

## Enforcement

Before model work starts, Tethermark resolves and validates:

1. workload class and initiation mode;
2. provider and credential class;
3. exact model allowlist;
4. per-run request and token budgets;
5. provider concurrency and request pacing;
6. retry ceiling with exponential backoff;
7. circuit-breaker state.

Built-in audit-package budgets are hard upper bounds. A request may lower them but cannot raise the workload policy ceiling. Exact model allowlists can be replaced deliberately with `AUDIT_LLM_ALLOWED_MODELS_<PROVIDER>`, using a comma-separated list. Unknown models fail closed.

Provider controls can be tuned with:

```env
AUDIT_LLM_ALLOWED_MODELS_OPENAI=gpt-5.4-mini,gpt-5.4,gpt-5.2,gpt-4.1
AUDIT_LLM_ALLOWED_MODELS_OPENAI_CODEX=gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna
AUDIT_LLM_MAX_CONCURRENCY_OPENAI=2
AUDIT_LLM_MAX_CONCURRENCY_OPENAI_CODEX=1
AUDIT_LLM_MIN_REQUEST_INTERVAL_MS_OPENAI=250
AUDIT_LLM_MIN_REQUEST_INTERVAL_MS_OPENAI_CODEX=1000
AUDIT_LLM_MAX_RETRIES=3
AUDIT_LLM_BACKOFF_BASE_MS=500
AUDIT_LLM_CIRCUIT_FAILURE_THRESHOLD=3
AUDIT_LLM_CIRCUIT_COOLDOWN_MS=120000
```

## Audit record

Every agent invocation records the provider, model, credential class, workload class, initiation mode, per-run request index, attempts, start/completion timestamps, token usage, estimated cost when configured, status, and terminal reason. Learning synthesis additionally records whether exact-scope operator initiation was verified or whether the Phase 2 `unattended_local` API-key/mock exception authorized background work. The OpenAI API path records response usage; the Codex path runs `codex exec --json` and records its `turn.completed` usage. A non-mock provider response without auditable usage stops the run before another request. The `provider-policy.json` run artifact records the resolved non-secret policy decisions.

Authentication tokens, API keys, authorization headers, and local authentication-cache contents are never included in these records.

## Language and output boundary

Tethermark uses model output only to produce the current audit's structured planning, review, and remediation artifacts or to summarize bounded human-reviewed improvement candidates. It does not build a model-output corpus or use provider output to develop a competing model. User-facing copy, prompts, job names, and learning workflows must describe the actual audit or governed-review purpose and must not imply model replication.

See [Provider Policy Decision Log](./provider-policy-decision-log.md) for the dated source review behind this matrix.
