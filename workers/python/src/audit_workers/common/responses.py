from __future__ import annotations

from typing import Any, Dict


def adapter_response(name: str, payload: Dict[str, Any], summary: str) -> Dict[str, Any]:
    request = payload.get("request", {})
    return {
        "worker": name,
        "status": "completed",
        "summary": summary,
        "run_mode": request.get("run_mode", "static"),
        "target": request.get("repo_url") or request.get("local_path") or request.get("endpoint_url"),
    }