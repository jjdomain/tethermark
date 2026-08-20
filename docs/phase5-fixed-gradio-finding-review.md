# Phase 5 fixed-Gradio finding review packet

Status: **Project owner approved the AI-adjudicated labels for engineering use; no independent-human-review claim is made**

Review date: 2026-08-20

## Scope

This packet reviews the five findings present only in the Terra result for the
fixed Gradio snapshot. It does not review the shared build-integrity finding or
assert that the repository has no other security issues.

- Repository: `gradio-app/gradio`
- Pinned fixed commit: `dcfa7ad3e819002c0213a592ad726ccfd9e2bf0c`
- Historical Sol report: `.artifacts/benchmarks/model-variance/gradio-fixed-sol-nondowngradable-plan/external-reviewed-agentic-v1.2026.08.18-v3.2026-08-19T04-11-18-701Z.json`
- Historical Terra report: `.artifacts/benchmarks/model-variance/gradio-fixed-terra-reconciled-plan/external-reviewed-agentic-v1.2026.08.18-v3.2026-08-19T06-15-22-122Z.json`

The two reports have the same score of 68. Sol retained one finding and Terra
retained six. In both reports, all five controls associated with the Terra-only
findings finish as `not_assessed`, with zero awarded score. The difference is
therefore final-finding reconciliation, not a scored control disagreement.

## Recommended decisions

| Terra-only finding | Recommended label | Evidence-based reason |
|---|---|---|
| Implement prompt and tool-use guardrails | Reject as publishable finding | The record is an absence-of-evidence claim with confidence 0.46, `partially_supported` integrity, and a final `not_assessed` control. The cited agent demo does establish an agent surface, but the finding does not establish a specific missing safeguard or exploitable path. |
| Bound agent tool use | Reject as duplicate and unsupported | It repeats the preceding root claim under another framework mapping. The cited demo explicitly constructs the agent with a bounded tool list, `tools=[image_generation_tool]`, so the evidence does not support the broad claim as written. |
| Mitigate AI-enabled tool misuse paths | Reject as duplicate and unsupported | It is the third copy of the same generic root claim. No cited evidence connects an adversary-controlled path to a dangerous tool action or demonstrates that a specific mitigation is absent. |
| Agent shell, file, network, or browser capability lacks visible permission boundary | Reject current category and control mapping | The shell citations come from an audio-debugger demo, a text-analysis setup command, and a notebook-generation script. They are not connected to the cited LLM agent path, so they cannot support an agent-permission-boundary finding. The audio-debugger code warrants separate command-execution triage described below. |
| Untrusted content ingestion lacks prompt-injection handling evidence | Reject as unsupported | The cited `.changeset`, `.config`, and `.devcontainer` files do not establish external content entering an LLM prompt or tool flow. The final control is correctly `not_assessed`; a publishable failure requires source-to-prompt dataflow evidence. |

Recommended calibration label for all five current records: **manual false
positive / do not publish**. Keep the corresponding controls `not_assessed`
rather than converting absence of evidence into passes.

## Independent-context AI second review

A separate AI reviewer independently inspected the two reports and pinned
source without being instructed to agree with the first review. It agreed that
all five current records are unfit for publication and that `not_assessed`
controls cannot independently support publishable failures.

Its material clarification is that the fourth record should not cause the
underlying shell sink to be discarded. The current agentic finding and mappings
remain rejected, but the `audio_debugger` behavior should be rewritten and
reclassified as a separate command-injection candidate. In practical terms,
the two reviews agree on the calibration label for the current record and on
preserving the underlying issue for appsec triage.

The second review also identified a possible tool-provenance concern:
`demo/agent_chatbot/requirements.txt` installs Transformers from an unpinned
Git `main`, while `run.py` loads a mutable Hub tool identifier. This may be
subsumed by the shared build-integrity finding and is not evidence for any of
the five current prompt/tool-boundary claims.

## Source verification

The pinned source confirms that an agent example exists:

- [`demo/agent_chatbot/run.py`](https://github.com/gradio-app/gradio/blob/dcfa7ad3e819002c0213a592ad726ccfd9e2bf0c/demo/agent_chatbot/run.py#L1-L13) loads one image-generation tool and passes it explicitly to `ReactCodeAgent`.
- [`demo/agent_chatbot/run.py`](https://github.com/gradio-app/gradio/blob/dcfa7ad3e819002c0213a592ad726ccfd9e2bf0c/demo/agent_chatbot/run.py#L15-L19) forwards a user prompt to that agent.
- [`guides/05_chatbots/03_agents-and-tool-usage.md`](https://github.com/gradio-app/gradio/blob/dcfa7ad3e819002c0213a592ad726ccfd9e2bf0c/guides/05_chatbots/03_agents-and-tool-usage.md#L27-L68) documents the same example.

Those facts make the agentic controls applicable for review, but do not by
themselves prove each control failed. In particular, they do not justify three
separate findings for the same generic guardrail concern.

The pinned source also confirms a separate issue candidate:

- [`demo/audio_debugger/run.py`](https://github.com/gradio-app/gradio/blob/dcfa7ad3e819002c0213a592ad726ccfd9e2bf0c/demo/audio_debugger/run.py#L22-L30) sends textbox input to `subprocess.run(..., shell=True)`.

That evidence should be triaged as a scoped command-execution risk in a demo,
including whether the demo is deployed or intended only for trusted local use.
It must not be used as evidence that an LLM agent owns shell capability. The
current five-finding review does not assign it a severity or publishable status.

Deployment relevance is plausible but not yet confirmed: pinned
`scripts/upload_website_demos.py` enumerates runnable demo directories for Space
upload, and pinned `scripts/copy_demos.py` explicitly includes
`audio_debugger`. A human reviewer should confirm whether the affected snapshot
was actually reachable in a public deployment before assigning severity.

## Engine follow-up implied by the review

- [x] Do not retain a finding solely through controls whose final state is
  `not_assessed`, unless another assessed control independently supports it.
- [x] Consolidate identical root claims mapped to OWASP LLM, OWASP Agentic, and
  MITRE ATLAS into one finding with multiple control mappings.
- [x] Require path-local evidence connecting an agent surface to a dangerous
  capability before emitting an agent-permission-boundary finding.
- [x] Require source-to-prompt or source-to-tool dataflow evidence before
  failing the untrusted-content prompt-injection control.
- [x] Preserve direct non-agent command-execution patterns as application-
  security triage observations instead of borrowing agentic mappings.
- [x] Exclude fixture-only `validation-expectations.json` records from source
  evidence so calibration labels cannot change the audit result.

## Post-review validation

Fresh ChatGPT-subscription runs on the same pinned fixed commit validate the
engineering changes under the suite-v4 fixed evidence plan:

- Sol: score 87, one `build_integrity` finding.
- Terra: score 87, one `build_integrity` finding.
- Sol repeat: score 87, one `build_integrity` finding.
- Formal Sol/Terra variance: pass, score spread 0, finding-count spread 0.
- Formal Sol/Sol repeat variance: pass, score spread 0, finding-count spread 0.

The five disputed agentic findings no longer survive in any of the three fresh
runs. The direct audio-debugger shell sink remains available as a non-agent
application-security triage observation in the engine and is covered by a
regression test. The retained build-integrity finding is outside the five-item
review scope and outside the fixed advisory's ground-truth claim.

Reports:

- `.artifacts/benchmarks/model-variance/gradio-fixed-post-review-sol/external-reviewed-agentic-v1.2026.08.19-v4.2026-08-20T07-12-59-222Z.json`
- `.artifacts/benchmarks/model-variance/gradio-fixed-post-review-terra/external-reviewed-agentic-v1.2026.08.19-v4.2026-08-20T07-16-27-546Z.json`
- `.artifacts/benchmarks/model-variance/gradio-fixed-post-review-sol-repeat/external-reviewed-agentic-v1.2026.08.19-v4.2026-08-20T07-22-52-246Z.json`

## Owner approval

- [x] Approve the five recommended false-positive/do-not-publish labels for
  engineering and calibration use.
- [x] Proceed without representing this packet as independently human reviewed.

Approver: Project owner, recorded through the Codex task

Approval date: 2026-08-20

Rationale: the pinned-source reviews, deterministic regressions, and fresh
Sol/Terra/Sol-repeat validation provide sufficient evidence to proceed. The
labels retain AI-review provenance and are not advertised as independent human
ground truth.
