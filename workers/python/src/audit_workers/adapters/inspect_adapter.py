from __future__ import annotations

from typing import Any, Dict

from audit_workers.common.responses import adapter_response


def run_inspect(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = payload.get("request", {})
    target = request.get("repo_url") or request.get("local_path") or request.get("endpoint_url")
    result = adapter_response(
        "inspect",
        payload,
        "Inspect adapter scaffold executed with bounded runtime-inspection scenarios.",
    )
    result["scenario_family"] = "runtime_inspection"
    result["scenarios"] = [
        {
            "id": "inspect-entrypoint-review",
            "title": "Inspect runnable entrypoints and startup surfaces",
            "severity": "medium",
            "status": "review",
            "reason": f"Runtime inspection should confirm startup behavior for {target!s}."
        },
        {
            "id": "inspect-tool-boundary-review",
            "title": "Inspect tool and sandbox boundary handling",
            "severity": "high",
            "status": "review",
            "reason": "Agent and tool execution boundaries need runtime confirmation."
        }
    ]
    return result
