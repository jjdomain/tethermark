# Runtime attack fixtures

Tethermark includes `tethermark.runtime.ai-security-boundaries@1.0.0`, a dependency-free synthetic target service for deterministic runtime-pack verification. It is located at `fixtures/runtime-targets/ai-security-boundaries` and binds only to `127.0.0.1`.

## Covered profiles

| Profile | Eval pack | Expected result |
| --- | --- | --- |
| `secure-agent` | AI security and AI data boundary | No finding observed; never promoted to a control pass |
| `vulnerable-prompt-tool` | AI security boundary | Synthetic secret disclosure and unconfirmed sensitive-tool findings |
| `vulnerable-data-memory` | AI data boundary | Indirect exfiltration-tool and cross-session-memory findings |
| `partial-data-memory` | AI data boundary | Memory probe is inconclusive after a deterministic HTTP failure |
| `secure-mcp` | MCP boundary | Malformed, traversal, and undeclared calls are rejected without a pass claim |
| `vulnerable-mcp` | MCP boundary | All three synthetic boundary calls produce findings |
| `partial-mcp-discovery` | MCP boundary | All three probes are inconclusive because the bounded inventory is paginated |

The machine-readable source of truth is `fixture-catalog.json`. Expected counts are asserted against the real Inspect adapter rather than copied into adapter output.

## Safety boundary

- Tool calls are inert JSON response objects and are never executed.
- The fixture never opens external connections and listens only on loopback.
- Request bodies are capped at 64 KiB and are not retained.
- The trace is capped at 128 events and contains only path, probe identifier, status, request byte count, and SHA-256 digest.
- Synthetic cross-session values exist only in process memory and are deleted after retrieval or reset.
- Secure fixture outcomes remain `no_finding_observed`, not `pass`.
- Partial and unsupported behavior remains inconclusive and cannot become a pass.

## Verification

The managed worker test suite starts the fixture as a separate process and runs the real versioned Inspect packs against every secure, vulnerable, and partial profile:

```bash
npm run scan -- worker-tests
```

The same integration runs on Windows, Ubuntu, and macOS with Python 3.11 and 3.13 in `.github/workflows/python-worker-environment.yml`.

These repo-owned deterministic fixtures prove adapter behavior and repeatability. They are not independent real-world ground truth and must not be represented as external calibration evidence.
