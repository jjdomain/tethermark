# Noisy Fixtures

This fixture is designed to be noisy rather than truly unsafe.

Signals included:

- fake credential-looking test data
- evaluation and benchmark markers
- architecture notes
- explicit comments explaining that fixture literals are not production secrets

Expected behavior:

- likely classified as `tool_using_multi_turn_agent`
- at least one sensitive-information style finding
- human review likely required because the evidence is intentionally ambiguous
