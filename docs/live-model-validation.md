# Live Model Validation

Phase 3 keeps ordinary CI deterministic while providing explicit, bounded release gates that use a real model. The primary Community Edition acceptance path is the local Codex CLI signed in with ChatGPT subscription access. API-key checks are optional secondary interoperability evidence and do not replace the Codex/ChatGPT-session gate.

## Validation matrix

| Gate | Scope | Hard default ceiling | Credential path |
|---|---|---:|---|
| `phase3:codex:live` | Runs both primary Phase 3 gates in sequence | Combined ceilings below | Local Codex ChatGPT session |
| `test:integration:llm:live` | One structured-output call; schema, usage, timeout, and redaction assertions | 1 request / 20,000 measured total tokens | Local Codex ChatGPT session |
| `e2e:audit:live` | Fixed local risky fixture through planner, threat model, evidence selection, one approved validation lane, bounded corrections, supervisor, remediation, persistence, and exports | 12 requests / 240,000 measured total tokens | Local Codex ChatGPT session |
| `phase3:api:live` | Optional API-key integration and E2E checks | Explicit workflow overrides: 4,096 / 60,000 tokens | Explicit OpenAI API key |

The standard live command names deliberately invoke `openai_codex`; the presence of `OPENAI_API_KEY` does not change them. The explicit API commands are `test:integration:llm:api:live` and `e2e:audit:api:live`. `e2e:audit:codex:live` remains as a descriptive alias for the primary E2E.

The E2E uses `deep-static` with a one-lane package override. Static target execution, local binaries, Python workers, and learning are disabled. The target is always `fixtures/validation-targets/agent-tool-boundary-risky`; a live command does not accept an arbitrary repository.

## Primary local Codex validation

OpenAI documents [ChatGPT subscription sign-in for Codex](https://learn.chatgpt.com/docs/auth) and structured [`codex exec` non-interactive output](https://learn.chatgpt.com/docs/non-interactive-mode). Install a directly executable Codex CLI, sign in with ChatGPT, and verify the active method without exposing the cached session:

```powershell
codex login
codex login status
```

Then run the primary Phase 3 gate from the repository root:

```powershell
$env:TETHERMARK_LIVE_MODEL_VALIDATION = "I_UNDERSTAND_THIS_USES_A_LIVE_MODEL"
$env:TETHERMARK_LIVE_LLM_PROVIDER = "openai_codex"
$env:TETHERMARK_LIVE_LLM_MODEL = "gpt-5.6-sol"
$env:TETHERMARK_LIVE_WORKLOAD_CLASS = "interactive_operator"
npm run phase3:codex:live
Remove-Item Env:TETHERMARK_LIVE_MODEL_VALIDATION
```

Tethermark permits ChatGPT-session credentials only for an explicit local operator launch. It fails closed when `CI=true` or when the workload is classified as an external service. Do not copy, commit, print, or attach the Codex authentication cache.

## Hard budgets

A maintainer may lower these budgets but cannot raise them above the script ceilings:

```powershell
$env:TETHERMARK_LIVE_INTEGRATION_MAX_TOKENS = "20000"
$env:TETHERMARK_LIVE_E2E_MAX_REQUESTS = "12"
$env:TETHERMARK_LIVE_E2E_MAX_TOKENS = "240000"
$env:TETHERMARK_LIVE_REQUEST_TIMEOUT_MS = "180000"
$env:TETHERMARK_LIVE_E2E_TIMEOUT_MS = "720000"
```

## Optional API-key validation

API validation is available for interoperability and service-policy coverage, but it is not the Community Edition default and cannot close the primary Codex acceptance gate. Load `OPENAI_API_KEY` through the operator's normal secret manager, then run:

```powershell
$env:TETHERMARK_LIVE_MODEL_VALIDATION = "I_UNDERSTAND_THIS_USES_A_LIVE_MODEL"
$env:TETHERMARK_LIVE_LLM_MODEL = "gpt-5.4-mini"
$env:TETHERMARK_LIVE_WORKLOAD_CLASS = "interactive_operator"
npm run phase3:api:live
Remove-Item Env:TETHERMARK_LIVE_MODEL_VALIDATION
```

The dispatch-only `Optional API Live Model Validation` GitHub workflow provides the same secondary coverage for a protected `optional-api-live-validation` environment. It requires `OPENAI_API_KEY`, explicit approval, and a separate quota confirmation. It does not satisfy the Codex/ChatGPT-session release requirement.

The Codex ceilings include the CLI's measured fixed instruction and tool context in addition to the harness prompt and response. They were calibrated against Codex CLI 0.147.0 after the supported ChatGPT-session model catalog moved to GPT-5.6; one minimal structured call measured 14,810 total tokens, while a representative bounded E2E used less than the current package envelope. The integration ceiling remains one request, and the E2E remains limited to the fixed fixture and named agent stages. Its explicit operator-approved `agentic_controls` lane narrowing is part of the validation workload boundary; System Policies retain the immutable approval record and may not silently widen the run. The 240,000-token ceiling matches the fixed `deep-static` package and `agentic-static-safe` system-policy envelope, while the 12-request ceiling remains below the package maximum. The deterministic harness asserts both relationships. The integration call defaults to a 90-second request limit; multi-finding E2E stages use the 180-second request maximum while the whole run remains capped at 12 minutes. The E2E submits through the persisted asynchronous run API and polls the bounded job to avoid coupling the audit duration to an HTTP response-header timeout. OpenAI's current [model guidance](https://developers.openai.com/api/docs/guides/latest-model) identifies GPT-5.6 Sol as the flagship starting point, with Terra and Luna providing balanced and efficient roles.

## Runtime-validation provider boundary

Phase 3 validates the model-backed static audit pipeline. Phase 8 will add real isolated target execution. For an operator-started Community Edition runtime-validation audit, model-backed planning, supervision, and remediation must also default to `openai_codex` with the operator's ChatGPT session. The runtime sandbox backend and model provider are separate controls: target code is authorized to execute only inside the selected isolated backend. Phase 8 must also prove that the Codex model subprocess cannot launch the target or become a host-command fallback; `read-only` by itself is not runtime-isolation evidence. An API-key provider requires an explicit operator override and API-only evidence cannot close the Codex runtime release gate.

## Evidence and acceptance

Successful and in-flight failure summaries are written to `.artifacts/live-validation/` locally or the configured `TETHERMARK_LIVE_EVIDENCE_DIR`. Filenames contain an ISO timestamp. The summary records the source revision, provider/model identifiers, measured usage, ceilings, duration, assertion results, and aggregate counts. It deliberately excludes raw model output, source contents, credentials, and absolute local paths.

A Phase 3 release evidence set is current only when both primary gates pass with `provider=openai_codex` and `credential_class=chatgpt_session` on the release-candidate commit. A deterministic harness pass or API-key pass does not prove this requirement.

## Troubleshooting the local CLI

If `codex login status` reports that the executable is missing or access is denied, install or expose a standalone Codex CLI that the terminal can execute, then sign in again. The Microsoft Store application package path may not be directly executable from every host process. Do not work around this by copying its credential cache into the repository.

The Connections/Agent Configuration status is intentionally stricter than cached sign-in detection. It reports `ready` only when the auth cache is valid and the configured command completes a bounded `codex login status` probe. If the UI shows **CLI unavailable**, set **Advanced: Codex CLI command** to the runnable executable path, choose **Save & check**, and require both status rows to pass before starting the live gate.

## Deterministic maintenance check

```bash
npm run test:live-validation-harness
```

This check is safe for normal CI. It exercises the Codex-default command mapping, opt-in rejection, provider/workload policy, hard budget validation, usage accounting, secret/path redaction, and dated evidence writes without contacting a model.
