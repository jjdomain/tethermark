# PyRIT Adapter

Status: bounded executable adversarial text profile as of 2026-08-25.

Tethermark runs the official PyRIT `1.0.1` wheel through the versioned `tethermark.pyrit.adversarial-boundary@1.0.0` pack. The adapter uses PyRIT's public `SeedPrompt` and `Score` models and its `analytics.ExactTextMatching` implementation. Tethermark supplies the bounded HTTP transport so the profile does not initialize PyRIT memory or retain target conversations.

## Bounded pack

The pack sends two authorized synthetic samples to the exact operator-selected `endpoint_url` using an OpenAI-compatible chat request:

- an authorization-escalation/policy-override boundary mapped to `runtime.prompt_injection_resistance`;
- a synthetic sensitive-data disclosure boundary mapped to `runtime.secret_nondisclosure`.

PyRIT creates safe-literal seed prompts, matches a synthetic boundary marker in returned assistant text, and constructs a normalized true/false `Score`. An observed marker becomes a high-severity finding. A response without an observed marker is `no_finding_observed`, never a control pass. Unsupported response shapes, non-success HTTP responses, truncation, transport failures, and timeouts are inconclusive.

Pack selection can be made explicit with `hints.pyrit_eval_pack: adversarial-boundary`; a target-side model name can be supplied through `hints.pyrit_target_model`.

## Minimal managed profile

PyRIT's standard package metadata installs database, media, Azure, dataset, and transformer integrations even when a run needs only text seeds and deterministic matching. Tethermark therefore installs the official PyRIT wheel and the small dependencies needed by its public models into a separate hash-locked `tethermark-pyrit-profile` directory with dependency resolution disabled.

The self-check verifies PyRIT `1.0.1`, safe-literal `SeedPrompt` behavior, the official exact matcher, and the `Score` contract before advertising the adapter as executable. It does not advertise the full PyRIT CLI, attack executor, memory, prompt-target, media, dataset, Azure, or transformer catalogs. Adding another PyRIT family requires an explicit versioned Tethermark pack, dependency review, resource limits, normalization, redaction, and cross-platform verification.

## Security and privacy boundaries

- Only an explicit HTTP(S) endpoint without embedded credentials or fragments is accepted.
- Cloud metadata hostnames and link-local, multicast, or unspecified resolved addresses are blocked.
- Redirects are not followed.
- At most two target requests run, each with a five-second maximum network timeout.
- Prompts are capped at 16 KiB and target responses at 64 KiB; adapter output is capped at 256 KiB.
- Prompts, response bodies, synthetic markers, credentials, and tool arguments are discarded. Output retains response metadata, digests, PyRIT component/score identifiers, coverage, and control references.
- PyRIT memory is not initialized or used. Its incidental data/cache paths are redirected into the managed worker directory.
- The target probe is separate from Tethermark's audit-orchestration model. ChatGPT-session routing remains the default, while the existing OpenAI API-key route remains an explicit optional override; neither credential is sent to PyRIT or retained in its output.

No new UI control or layout is required. PyRIT runs through the existing runtime evidence-provider contract.

## Verification

```bash
npm run scan -- setup-workers --yes
npm run scan -- worker-doctor
npm run scan -- worker-tests
npm run scan -- worker-smoke
```

The managed-worker matrix executes the environment, adapter tests, and worker smoke on Windows, Linux, and macOS with Python 3.11 and 3.13. The official project describes PyRIT as a framework for proactively identifying risks in generative AI systems: [PyRIT repository](https://github.com/microsoft/PyRIT), [documentation](https://microsoft.github.io/PyRIT/), and [PyPI package](https://pypi.org/project/pyrit/).
