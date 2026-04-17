from __future__ import annotations

from typing import Any, Dict

from audit_workers.common.responses import adapter_response


def run_garak(payload: Dict[str, Any]) -> Dict[str, Any]:
    result = adapter_response(
        "garak",
        payload,
        "garak adapter scaffold executed with prompt-stress probe planning.",
    )
    result["scenario_family"] = "prompt_stress"
    result["scenarios"] = [
        {
            "id": "garak-prompt-injection",
            "title": "Prompt-injection resilience probe",
            "severity": "high",
            "status": "review",
            "reason": "Agent target should be exercised against prompt-injection style inputs."
        },
        {
            "id": "garak-tool-misuse",
            "title": "Tool-misuse probe",
            "severity": "medium",
            "status": "review",
            "reason": "Runtime validation should check whether tool invocation policies hold under adversarial prompts."
        }
    ]
    return result
