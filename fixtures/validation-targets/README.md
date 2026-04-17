# Validation Targets

This directory contains bundled fixture targets for quick harness validation.

Each fixture is intentionally small and designed to exercise a different part of the audit flow:

- `repo-posture-good`: a relatively healthy repository-posture target
- `agent-tool-boundary-risky`: an intentionally risky agent/tool boundary target
- `noisy-fixtures`: a target with deliberately noisy fixture content to exercise review handling

Each target includes a `validation-expectations.json` file with the expected target class, likely finding families, and review posture.

These fixtures are meant for:

- local smoke testing
- CI regression coverage
- demo runs for new users

They are not meant to be realistic production systems or complete benchmark suites.
