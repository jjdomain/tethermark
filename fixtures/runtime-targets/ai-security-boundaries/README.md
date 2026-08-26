# AI security boundary runtime fixture

This dependency-free, synthetic-only loopback service is a deterministic target for Tethermark's prompt/secret, tool-authorization, indirect-injection/data-exfiltration, cross-session-memory, and MCP boundary packs.

It exposes versioned secure, vulnerable, and partial profiles from `fixture-catalog.json`. Tool calls are inert response objects and are never executed. Request traces retain only path, probe identifier, status, byte count, and a body digest; request bodies, synthetic secrets, records, session identifiers, and tool arguments are not retained.

Run it locally with:

```bash
node fixtures/runtime-targets/ai-security-boundaries/server.mjs --port 3100
```

The service binds only to `127.0.0.1`. `GET /health` returns readiness, `GET /__trace` returns the bounded redacted trace, and `POST /__reset` clears transient memory and trace state. This is test evidence, not independent real-world calibration ground truth.
