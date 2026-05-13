# LLM Provider And Agent Backend Modes

## Purpose

Tethermark supports two different ways to run model-backed audit agents:

- API providers, where Tethermark calls a hosted model API directly with an API key.
- Local agent backends, where Tethermark delegates a structured agent step to a user-owned local agent process that already has its own authentication.

This distinction matters because subscription-backed tools such as Codex are not the same thing as a general-purpose API billing account. They are local agent products with their own login flow, rate limits, supported models, sandbox behavior, and usage policies.

## External Patterns Reviewed

### OpenClaw

OpenClaw is useful as a reference because it separates the local control plane from model/provider auth. Its README describes a local-first gateway, ChatGPT/Codex subscription OAuth support, a model CLI, and security defaults for tool execution. Its model docs describe provider/model allowlists and onboarding for OpenAI Code/Codex subscription OAuth. Its failover docs describe auth profiles for both API keys and OAuth tokens, profile rotation, cooldowns, and session stickiness.

Useful patterns for Tethermark:

- keep operator-owned credentials local
- make model selection explicit
- separate API-key profiles from OAuth profiles
- keep sandbox/tool execution policy outside the model provider itself
- surface provider readiness and auth status without exposing secrets

Sources:

- `https://github.com/openclaw/openclaw`
- `https://docs.openclaw.ai/concepts/models`
- `https://docs.openclaw.ai/concepts/model-failover`

### OpenAI Codex CLI

Codex CLI provides the specific local backend Tethermark can reuse. Its non-interactive `codex exec` mode supports automation, stdin prompts, `--output-last-message`, and `--output-schema` for structured output. OpenAI's help docs state Codex can be used with ChatGPT plans and that usage limits depend on the user's plan.

Useful patterns for Tethermark:

- delegate structured agent calls through `codex exec`
- require users to authenticate with Codex outside Tethermark
- use `--output-schema` so Tethermark can keep structured artifacts
- run in read-only mode by default
- treat usage as plan/rate-limit bound, not token-price predictable

Sources:

- `https://www.mintlify.com/openai/codex/advanced/exec-mode`
- `https://help.openai.com/en/articles/11369540-codex-in-chatgpt`

### Paperclip

Paperclip is useful as a control-plane reference rather than a provider implementation reference. Its README emphasizes bringing your own agents, tracking work and costs, enforcing budgets, approval governance, heartbeats, and audit logs across agents such as OpenClaw, Claude Code, Codex, CLI agents, and HTTP bots.

Useful patterns for Tethermark:

- treat external agents as worker backends, not as the product boundary
- keep governance, budgets, and audit logs in the orchestrator
- preserve durable task/evidence records instead of relying on transient agent chat state

Source:

- `https://github.com/paperclipai/paperclip`

## Implemented Modes

### `mock`

Local deterministic provider for tests, fixtures, smoke runs, and offline UI work.

Configuration:

```env
AUDIT_LLM_PROVIDER=mock
AUDIT_LLM_MODEL=mock-agent-runtime
```

### `openai`

Direct API-key provider for predictable token-billed model calls.

Configuration:

```env
AUDIT_LLM_PROVIDER=openai
AUDIT_LLM_MODEL=gpt-5.4-mini
AUDIT_LLM_API_KEY=sk-...
```

Fallback API key environment variables are still supported:

- `AUDIT_LLM_API_KEY`
- `LLM_API_KEY`
- `OPENAI_API_KEY`

### `openai_codex`

Local OpenAI Codex CLI backend for user-owned OAuth/subscription-backed runs.

Configuration:

```env
AUDIT_LLM_PROVIDER=openai_codex
AUDIT_LLM_MODEL=gpt-5.1-codex
AUDIT_LLM_CODEX_COMMAND=codex
AUDIT_LLM_CODEX_SANDBOX=read-only
AUDIT_LLM_CODEX_TIMEOUT_MS=600000
```

Before running, the operator must install Codex CLI and sign in through the official Codex/ChatGPT flow. Tethermark does not store OpenAI OAuth tokens for this mode.

The provider invokes:

```bash
codex exec --ephemeral --sandbox read-only --output-schema <schema.json> --output-last-message <result.json> --model <model>
```

Tethermark sends the agent prompt through stdin and parses the final structured JSON artifact from the output file.

The OSS web UI exposes this mode under Settings -> Agent Configuration as an account connection flow:

1. Select an OpenAI Codex model.
2. Choose Connect ChatGPT account.
3. Complete the browser sign-in prompt opened by the local Codex CLI.
4. Return to Tethermark and choose Check connection or Save and check.

Do not make non-technical users copy CLI commands in the primary path. Keep the Codex command path as an advanced optional setting for custom installs only. In `auth=none` local mode the connection action is enabled by default. In an authenticated deployment, set `HARNESS_ENABLE_LOCAL_OAUTH_CONNECT=1` before exposing that action, because it launches a local process on the API host.

## Product Boundary

Tethermark owns:

- target classification
- policy-pack selection
- sandbox and runtime validation policy
- prompt/schema selection for Tethermark agent roles
- evidence capture
- finding normalization
- scoring
- persistence and exports
- review workflow

The provider/backend owns:

- model execution
- user authentication with the provider
- provider-specific rate limits or plan limits
- provider-specific local agent behavior

This keeps Tethermark from becoming a thin wrapper around one agent product.

## Usage Guidance

Use API mode when:

- running unattended service scans
- operating a shared or hosted deployment
- needing predictable billing and observability
- using non-Codex OpenAI models

Use Codex OAuth mode when:

- running local OSS scans as the operator
- running manual deep/runtime audits
- using the user's own ChatGPT/Codex allowance
- avoiding storage of API keys in Tethermark

Do not position OAuth mode as free unlimited scanning. It is subject to provider plan limits and can fail or throttle independently of Tethermark.
