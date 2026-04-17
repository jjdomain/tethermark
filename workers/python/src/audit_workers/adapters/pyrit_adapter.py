from __future__ import annotations

from typing import Any, Dict

from audit_workers.common.responses import adapter_response


def run_pyrit(payload: Dict[str, Any]) -> Dict[str, Any]:
    result = adapter_response(
        "pyrit",
        payload,
        "PyRIT adapter scaffold executed with adversarial-validation scenario planning.",
    )
    result["scenario_family"] = "adversarial_validation"
    result["scenarios"] = [
        {
            "id": "pyrit-escalation-path",
            "title": "Escalation-path adversarial prompt",
            "severity": "high",
            "status": "review",
            "reason": "Validation runs should pressure-test escalation and unsafe assistance paths."
        },
        {
            "id": "pyrit-sensitive-data-handling",
            "title": "Sensitive-data handling challenge",
            "severity": "medium",
            "status": "review",
            "reason": "Validation runs should exercise data-exposure handling under adversarial prompts."
        }
    ]
    return result
