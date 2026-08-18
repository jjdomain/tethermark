# Provider Policy Decision Log

## 2026-08-07 — Codex subscription is the live and runtime-validation default

Status: approved clarification for Community Edition `provider-policy.v1`

### Official sources reviewed

- [OpenAI Codex authentication](https://learn.chatgpt.com/docs/auth), reviewed 2026-08-07. Codex supports ChatGPT subscription sign-in for local work and reuses the cached session.
- [OpenAI Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), reviewed 2026-08-07. `codex exec` supports JSONL usage events and JSON Schema-constrained final output while reusing saved CLI authentication.

### Decision

1. The primary Phase 3 live integration and E2E gates use `openai_codex` with `chatgpt_session`; API-key passes are secondary interoperability evidence and cannot close the primary gate.
2. Operator-started Community Edition runtime-validation audits use the same Codex/ChatGPT-session default for model-backed planning, supervision, and remediation.
3. Runtime target execution remains confined to the selected isolated backend. Phase 8 must separately make the Codex model subprocess inference-only for this path and prove it cannot execute the target or become a host-command fallback; `read-only` alone is insufficient evidence.
4. API-key routing requires an explicit operator override. Ordinary CI remains mock-only, and unattended ChatGPT-session use remains rejected.

This clarification changes the validation command defaults and release evidence requirement without weakening the existing workload-class enforcement.

## 2026-08-03 — Credential and workload boundary

Status: approved for Community Edition `provider-policy.v1`

### Official sources reviewed

- [OpenAI Codex authentication](https://developers.openai.com/codex/auth), reviewed 2026-08-03. It distinguishes ChatGPT subscription sign-in from usage-based API-key sign-in, recommends API-key authentication for programmatic workflows such as CI/CD, and documents enterprise access tokens for trusted non-interactive local workflows.
- [OpenAI Codex CLI reference](https://developers.openai.com/codex/cli/reference), reviewed 2026-08-03. It documents `codex exec` as a non-interactive command and exposes bounded structured-output and sandbox flags. A non-interactive command surface does not by itself determine which credential is appropriate for a product workload.
- [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/), effective 2026-01-01 and reviewed 2026-08-03. These govern individual services and prohibit programmatic output extraction, circumventing rate limits or safeguards, and using output to develop competing models.
- [OpenAI Services Agreement](https://openai.com/policies/services-agreement/), effective 2026-01-01 and reviewed 2026-08-03. This governs API and business/developer service use, permits API integration into customer applications, and requires compliance with usage limits and applicable policies.
- [OpenAI Service Terms](https://openai.com/policies/service-terms/), updated 2026-06-12 and reviewed 2026-08-03.

### Decision

1. `openai_codex` with a local `chatgpt_session` is allowed only for `interactive_operator` Community Edition runs that a person explicitly starts.
2. `openai` with an `api_key` is allowed for interactive, unattended-local, and external-service workloads, subject to Tethermark and provider limits.
3. Ordinary CI remains mock-only. Any live CI workflow must be separately opted in, use a service-appropriate credential, and apply a low hard budget.
4. Enterprise Codex access tokens are acknowledged but unsupported in Community Edition until Tethermark can verify the active auth mode and provide credential lifecycle controls. Requests that claim this class fail closed.
5. The presence of an API key does not silently change the Community Edition provider default. Provider selection must be explicit; otherwise the default remains `openai_codex` for operator-started local work.
6. Provider output is used for the current audit or bounded reviewer-facing candidate synthesis, not collected to reproduce or develop a competing model.

### Re-review triggers

Re-review this decision before changing the unattended ChatGPT-session block, adding an enterprise access-token integration, changing credential storage, enabling a live model in ordinary CI, or materially changing OpenAI's documented authentication or applicable terms.

This engineering decision records a conservative product boundary; it is not legal advice.
