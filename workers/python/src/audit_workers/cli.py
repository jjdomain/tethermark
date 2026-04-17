from __future__ import annotations

import json
import sys

from audit_workers.adapters.garak_adapter import run_garak
from audit_workers.adapters.inspect_adapter import run_inspect
from audit_workers.adapters.pyrit_adapter import run_pyrit


def main() -> None:
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