# Webhook Security And Trust Boundary

Tethermark Community Edition has two outbound callback surfaces. Neither receives inbound commands or changes audit state.

## Audit Event Webhook

The generic audit-event webhook supports HMAC SHA-256 signing. Configure both the webhook URL and a signing secret in **System -> Integrations**. Signed requests include:

- `x-harness-event-id`
- `x-harness-event-type`
- `x-harness-signature: sha256=<hex digest>`

The digest is `HMAC-SHA256(secret, exact raw HTTP request body)`. Receivers must calculate the digest from the raw bytes before parsing JSON and compare it with a constant-time comparison. Reject missing, malformed, or mismatched signatures. Use TLS for any receiver that is not on loopback.

When no signing secret is configured, Tethermark labels the webhook as unsigned. Unsigned events are untrusted and are enforced as loopback-only. They must not authorize deployments, remediation closure, publication, or any other state-changing operation.

A non-loopback generic receiver requires both a signing secret and HTTPS. URL credentials, query strings, fragments, redirects, and private/special network targets are rejected by default. A trusted-team private HTTPS receiver can be enabled with `HARNESS_ALLOW_PRIVATE_WEBHOOKS=1`; this is an explicit SSRF-boundary exception and should be paired with firewall or egress-proxy policy.

## Job Completion Callback

The per-job completion callback is an unsigned compatibility callback. It is enforced as loopback-only and is for trusted local automation only. A receiver must treat its payload as advisory and untrusted; it must not use the callback as proof of identity or authorization. Leave the callback blank for normal use.

Both callback paths reject redirects and use a bounded timeout. Generic webhook response bodies are discarded rather than retained in audit state.

Use the signed audit-event webhook for shared or remote automation. Community Edition does not provide inbound webhook processing or automatic connector-driven remediation state changes.
