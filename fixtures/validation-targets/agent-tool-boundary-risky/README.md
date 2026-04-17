# Agent Tool Boundary Risky

This fixture is intentionally unsafe.

Signals included:

- agent and tool-use markers
- shell execution patterns
- broad CI workflow permissions
- credential-like literals
- architecture notes describing tool and trust boundaries

Expected behavior:

- classified as `tool_using_multi_turn_agent`
- multiple medium/high findings
- human review likely required
