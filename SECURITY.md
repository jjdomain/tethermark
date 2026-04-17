# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in Tethermark, do not open a public issue with exploit details.

Instead, report it privately to the project maintainers through your agreed private disclosure channel.

Include:

- affected version or commit
- impacted component or path
- reproduction steps
- expected impact
- any proof-of-concept details needed for validation

## What Counts as Security-Sensitive Here

This repository is security-sensitive in several areas:

- sandbox preparation and execution boundaries
- tool adapter command execution
- artifact storage and path isolation
- persistence integrity and review-state integrity
- API behavior that could expose run data or allow unauthorized state changes

Reports involving those areas should be treated as high priority.

## Please Avoid Public Disclosure Until Fixed

Public issues, PRs, or discussions should not contain:

- private exploit steps
- secrets or tokens
- attack payloads against live systems
- bypass details for sandbox or policy enforcement

We will aim to validate the report, determine severity, and coordinate disclosure timing after a fix or mitigation exists.

## Supported Disclosure Style

Helpful reports usually include:

- concise summary
- affected deployment assumptions
- attack preconditions
- realistic impact
- minimal reproduction target

## Hardening Areas of Special Interest

We are particularly interested in reports related to:

- sandbox escape or unsafe target execution
- artifact path traversal
- unauthorized review workflow manipulation
- API routes that permit unsafe state transitions
- persistence corruption or unsafe reconstruction behavior
- unintended network or credential exposure during scans

## Non-Issues

The following are usually not security vulnerabilities by themselves:

- findings produced against intentionally vulnerable validation fixtures
- mock-provider behavior used only for local test execution
- missing product UX features that do not create a concrete exploit path

If you are unsure whether something qualifies, report it privately first.
