# Live Model Validation

Phase 3 keeps ordinary CI deterministic while providing two explicit, bounded release gates that use a real model. These commands are never part of pull-request CI and require a one-command acknowledgement before they can consume quota.

## Validation matrix

| Gate | Scope | Hard default ceiling | Supported credential path |
|---|---|---:|---|
| `test:integration:llm:live` | One structured-output call; schema, usage, timeout, and redaction assertions | 1 request / 4,096 tokens | OpenAI API key or local Codex ChatGPT session |
| `e2e:audit:live` | Fixed local risky fixture through planner, threat model, eval selection, one lane specialist, supervisor, remediation, persistence, and exports | 12 requests / 60,000 tokens | OpenAI API key |
| `e2e:audit:codex:live` | Same E2E using the local Codex CLI | 12 requests / 60,000 tokens | Local interactive Codex ChatGPT session only |

The E2E uses `deep-static` with a one-lane package override. Static target execution, local binaries, Python workers, and learning are disabled. The target is always `fixtures/validation-targets/agent-tool-boundary-risky`; a live command does not accept an arbitrary repository.

## Local OpenAI API validation

Load `OPENAI_API_KEY` through the operator's normal secret manager, then run the following in PowerShell from the repository root. Do not save the acknowledgement in `.env`.

```powershell
$env:TETHERMARK_LIVE_MODEL_VALIDATION = "I_UNDERSTAND_THIS_USES_A_LIVE_MODEL"
$env:TETHERMARK_LIVE_LLM_PROVIDER = "openai"
$env:TETHERMARK_LIVE_LLM_MODEL = "gpt-5.4-mini"
$env:TETHERMARK_LIVE_WORKLOAD_CLASS = "interactive_operator"
npm run test:integration:llm:live
npm run e2e:audit:live
Remove-Item Env:TETHERMARK_LIVE_MODEL_VALIDATION
```

The model must be in the exact Phase 2 provider allowlist. A maintainer may lower the budgets but cannot raise them above the script ceilings:

```powershell
$env:TETHERMARK_LIVE_INTEGRATION_MAX_TOKENS = "4096"
$env:TETHERMARK_LIVE_E2E_MAX_REQUESTS = "12"
$env:TETHERMARK_LIVE_E2E_MAX_TOKENS = "60000"
$env:TETHERMARK_LIVE_REQUEST_TIMEOUT_MS = "90000"
$env:TETHERMARK_LIVE_E2E_TIMEOUT_MS = "720000"
```

## Local Codex ChatGPT-session validation

Install the Codex CLI and sign in interactively before running these commands. OpenAI documents both [Codex authentication](https://learn.chatgpt.com/docs/auth) and [`codex exec` non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode). Tethermark permits this credential class only for an interactive local operator; it fails closed when `CI=true` or when the workload is classified as an external service.

```powershell
$env:TETHERMARK_LIVE_MODEL_VALIDATION = "I_UNDERSTAND_THIS_USES_A_LIVE_MODEL"
$env:TETHERMARK_LIVE_LLM_PROVIDER = "openai_codex"
$env:TETHERMARK_LIVE_LLM_MODEL = "gpt-5.1-codex"
$env:TETHERMARK_LIVE_WORKLOAD_CLASS = "interactive_operator"
npm run test:integration:llm:live -- --codex
npm run e2e:audit:codex:live
Remove-Item Env:TETHERMARK_LIVE_MODEL_VALIDATION
```

## Manual GitHub workflow

The `Live Model Validation` workflow is dispatch-only. Configure a protected GitHub environment named `live-model-validation`, require maintainer approval, and add `OPENAI_API_KEY` as an environment secret. The workflow uses the `external_service` API-key policy, asks for a second quota confirmation, applies the same hard budgets, and retains only redacted JSON evidence for 30 days.

ChatGPT-session credentials are not used by the hosted workflow. For Codex-specific coverage, use a signed-in maintainer workstation. OpenAI's [Codex GitHub Action guidance](https://learn.chatgpt.com/docs/github-action) should be reviewed before any future Codex CLI CI path is introduced.

## Evidence and acceptance

Successful and in-flight failure summaries are written to `.artifacts/live-validation/` locally or the configured `TETHERMARK_LIVE_EVIDENCE_DIR`. Filenames contain an ISO timestamp. The summary records the source revision, provider/model identifiers, measured usage, ceilings, duration, assertion results, and aggregate counts. It deliberately excludes raw model output, source contents, credentials, and absolute local paths.

A Phase 3 release evidence set is current only when both the structured integration gate and E2E gate pass on the release candidate commit. A deterministic harness pass proves fail-closed behavior and redaction code; it is not evidence of real inference.

## Deterministic maintenance check

```bash
npm run test:live-validation-harness
```

This check is safe for normal CI. It exercises opt-in rejection, provider/workload policy, hard budget validation, usage accounting, secret/path redaction, and dated evidence writes without contacting a model.
