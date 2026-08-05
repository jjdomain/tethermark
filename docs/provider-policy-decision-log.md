# Provider Policy Decision Log

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
