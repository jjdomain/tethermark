# Garak Adapter

Status: bounded executable PromptInject profile as of 2026-08-25.

Tethermark runs the official Garak `0.16.0` wheel through the versioned `tethermark.garak.prompt-injection@1.0.0` pack. The adapter uses Garak's PromptInject resource builder, `Attempt`/`Message` contract, and `promptinject.AttackRogueString` detector directly. It does not substitute a Tethermark string matcher for Garak's detector.

## Bounded pack

The pack sends two serialized synthetic PromptInject samples to the exact operator-selected `endpoint_url` using an OpenAI-compatible chat request. Each sample uses a different Garak attack/rogue-string fixture. Garak evaluates returned assistant text, and a detector score of at least `0.5` becomes a high-severity finding mapped to `runtime.prompt_injection_resistance`.

A response without a detected trigger is `no_finding_observed`, never a control pass. Unsupported response shapes, non-success HTTP responses, truncation, transport failures, and timeouts are inconclusive. Pack selection can be made explicit with `hints.garak_eval_pack: prompt-injection`; a target-side model name can be supplied through `hints.garak_target_model`.

## Minimal managed profile

Garak's standard package metadata installs model frameworks and every generator integration even when only PromptInject is selected. Tethermark therefore installs the official Garak wheel, `colorama`, and `xdg-base-dirs` into a separate hash-locked `tethermark-garak-profile` directory with dependency resolution disabled. The self-check imports the exact PromptInject builder/detector path and verifies Garak `0.16.0` before advertising the adapter as executable.

This profile does not advertise the full Garak CLI, model generators, probes, detectors, buffs, or optional ML stacks. Adding another Garak family requires an explicit versioned Tethermark pack, dependency review, deterministic fixtures, resource limits, normalization, and cross-platform verification.

## Security and privacy boundaries

- Only an explicit HTTP(S) endpoint without embedded credentials or fragments is accepted.
- Cloud metadata hostnames and link-local, multicast, or unspecified resolved addresses are blocked.
- Redirects are not followed.
- At most two target requests run, each with a five-second maximum network timeout.
- Prompts are capped at 16 KiB and target responses at 64 KiB; adapter output is capped at 256 KiB.
- Prompts, response bodies, detector trigger strings, credentials, and tool arguments are discarded. Output retains response metadata, digests, detector identifiers/scores, coverage, and control references.
- The target probe is separate from Tethermark's audit-orchestration model. ChatGPT-session routing remains the default, while the existing OpenAI API-key route remains an explicit optional override; neither credential is sent to Garak or retained in its output.

No new UI control or layout is required. Garak runs through the existing runtime evidence-provider contract.

## Verification

```bash
npm run scan -- setup-workers --yes
npm run scan -- worker-doctor
npm run scan -- worker-tests
npm run scan -- worker-smoke
```

The managed-worker matrix executes the environment, adapter tests, and worker smoke on Windows, Linux, and macOS with Python 3.11 and 3.13. The official project describes Garak as an LLM vulnerability scanner and documents its probe/detector selection contract: [Garak repository](https://github.com/NVIDIA/garak), [CLI reference](https://reference.garak.ai/en/latest/cliref.html), and [getting started](https://reference.garak.ai/en/latest/usage.html).
