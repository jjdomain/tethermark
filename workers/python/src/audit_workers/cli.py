from __future__ import annotations

import json
from importlib.metadata import version
import platform
import sys

from audit_workers.adapters.garak_adapter import garak_profile_status, run_garak
from audit_workers.adapters.inspect_adapter import run_inspect
from audit_workers.adapters.pyrit_adapter import run_pyrit


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-check":
        garak_status = garak_profile_status()
        sys.stdout.write(json.dumps({
            "schema_version": 1,
            "worker_package_version": "0.2.0",
            "python_version": platform.python_version(),
            "adapter_implementation_status": "partial",
            "adapter_statuses": {
                "inspect": "executable",
                "garak": garak_status["status"],
                "pyrit": "scaffold",
            },
            "inspect_ai_version": version("inspect-ai"),
            "garak_version": garak_status["version"],
            "garak_profile": garak_status["profile"],
            "adapters": ["inspect", "garak", "pyrit"],
            "imports_ready": True,
        }))
        return

    if len(sys.argv) < 3:
        raise SystemExit("usage: python -m audit_workers.cli <worker> '<json-payload>'")

    worker = sys.argv[1]
    payload = json.loads(sys.argv[2])

    if worker == "garak":
        result = run_garak(payload)
    elif worker == "inspect":
        result = run_inspect(payload)
    elif worker == "pyrit":
        result = run_pyrit(payload)
    else:
        result = {
            "worker": worker,
            "status": "unsupported",
            "message": "No adapter is registered for this worker"
        }

    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
