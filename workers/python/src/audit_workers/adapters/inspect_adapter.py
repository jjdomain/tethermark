from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import socket
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlsplit

from inspect_ai import Task, eval as inspect_eval
from inspect_ai.dataset import Sample
from inspect_ai.model import ModelOutput
from inspect_ai.solver import solver


ADAPTER_SCHEMA_VERSION = "2026-08-24.inspect-worker.v1"
ADAPTER_VERSION = "1.0.0"
EVAL_PACK_ID = "tethermark.inspect.http-baseline"
EVAL_PACK_VERSION = "1.0.0"
MAX_PROBES = 2
DEFAULT_PROBE_TIMEOUT_SECONDS = 3.0
MAX_PROBE_TIMEOUT_SECONDS = 5.0
MAX_RESPONSE_BYTES = 64 * 1024
MAX_ADAPTER_OUTPUT_BYTES = 256 * 1024
SECURITY_HEADER_NAMES = (
    "content-security-policy",
    "cross-origin-opener-policy",
    "permissions-policy",
    "referrer-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _bounded_timeout(request: Dict[str, Any]) -> float:
    hints = request.get("hints") if isinstance(request.get("hints"), dict) else {}
    raw = hints.get("inspect_probe_timeout_seconds")
    try:
        requested = float(raw) if raw is not None else DEFAULT_PROBE_TIMEOUT_SECONDS
    except (TypeError, ValueError):
        requested = DEFAULT_PROBE_TIMEOUT_SECONDS
    return min(max(requested, 0.1), MAX_PROBE_TIMEOUT_SECONDS)


def _validate_endpoint(raw: Any) -> tuple[str | None, str | None]:
    if not isinstance(raw, str) or not raw.strip():
        return None, "Inspect requires an explicit endpoint_url for the bounded HTTP baseline pack."
    endpoint = raw.strip()
    parsed = urlsplit(endpoint)
    if parsed.scheme not in {"http", "https"}:
        return None, "Inspect endpoint_url must use http or https."
    if not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        return None, "Inspect endpoint_url must include a host and must not contain credentials or a fragment."
    try:
        port = parsed.port
    except ValueError:
        return None, "Inspect endpoint_url contains an invalid port."
    if port is not None and not 1 <= port <= 65535:
        return None, "Inspect endpoint_url contains an invalid port."
    if parsed.hostname.lower() in {"metadata.google.internal", "metadata.azure.internal"}:
        return None, "Inspect blocks cloud metadata endpoints."
    try:
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(parsed.hostname, port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
        }
    except socket.gaierror as error:
        return None, f"Inspect could not resolve the endpoint host ({error})."
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified:
            return None, "Inspect blocks link-local, multicast, and unspecified endpoint addresses."
    return endpoint, None


def _read_bounded(response: Any) -> tuple[int, bool, str]:
    body = response.read(MAX_RESPONSE_BYTES + 1)
    truncated = len(body) > MAX_RESPONSE_BYTES
    retained = body[:MAX_RESPONSE_BYTES]
    return len(retained), truncated, hashlib.sha256(retained).hexdigest()


def _perform_probe(metadata: Dict[str, Any]) -> Dict[str, Any]:
    endpoint = str(metadata["endpoint"])
    method = str(metadata["method"])
    timeout_seconds = float(metadata["timeout_seconds"])
    request = urllib.request.Request(
        endpoint,
        method=method,
        headers={
            "Accept": "application/json,text/plain;q=0.9,*/*;q=0.1",
            "User-Agent": "Tethermark-Inspect/1.0",
        },
    )
    opener = urllib.request.build_opener(_NoRedirect())
    started = time.monotonic()
    response: Any = None
    try:
        try:
            response = opener.open(request, timeout=timeout_seconds)
        except urllib.error.HTTPError as error:
            response = error
        body_bytes, truncated, body_sha256 = _read_bounded(response) if method != "HEAD" else (0, False, hashlib.sha256(b"").hexdigest())
        headers = {key.lower(): value for key, value in response.headers.items()}
        elapsed_ms = round((time.monotonic() - started) * 1000)
        return {
            "outcome": "observed",
            "summary": f"{method} returned HTTP {int(response.status)} in {elapsed_ms} ms.",
            "request": {"method": method, "uri": endpoint},
            "response": {
                "status_code": int(response.status),
                "content_type": headers.get("content-type"),
                "body_bytes_retained": body_bytes,
                "body_truncated": truncated,
                "body_sha256": body_sha256,
                "security_headers_present": [name for name in SECURITY_HEADER_NAMES if name in headers],
                "elapsed_ms": elapsed_ms,
            },
        }
    except TimeoutError:
        return {
            "outcome": "inconclusive",
            "summary": f"{method} exceeded the {timeout_seconds:g} second probe timeout.",
            "request": {"method": method, "uri": endpoint},
            "response": None,
            "inconclusive_reason": "probe_timeout",
        }
    except (urllib.error.URLError, OSError) as error:
        return {
            "outcome": "inconclusive",
            "summary": f"{method} could not complete: {type(error).__name__}.",
            "request": {"method": method, "uri": endpoint},
            "response": None,
            "inconclusive_reason": "transport_error",
        }
    finally:
        if response is not None:
            response.close()


@solver
def bounded_http_probe():
    async def solve(state, generate):  # type: ignore[no-untyped-def]
        result = await asyncio.to_thread(_perform_probe, dict(state.metadata))
        state.output = ModelOutput.from_content(
            model="tethermark/bounded-http",
            content=json.dumps(result, separators=(",", ":"), sort_keys=True),
        )
        return state

    return solve


def _build_task(endpoint: str, timeout_seconds: float) -> Task:
    probe_specs = [
        {"id": "inspect-http-get-baseline", "title": "Bounded endpoint response observation", "method": "GET"},
        {"id": "inspect-http-head-metadata", "title": "Bounded endpoint metadata observation", "method": "HEAD"},
    ][:MAX_PROBES]
    return Task(
        dataset=[
            Sample(
                id=spec["id"],
                input=f"Execute {spec['method']} against the explicitly selected audit endpoint.",
                metadata={
                    "endpoint": endpoint,
                    "method": spec["method"],
                    "title": spec["title"],
                    "timeout_seconds": timeout_seconds,
                },
            )
            for spec in probe_specs
        ],
        solver=bounded_http_probe(),
        scorer=None,
        time_limit=max(1, int(timeout_seconds) + 1),
        fail_on_error=True,
    )


def _inconclusive_response(payload: Dict[str, Any], target: Any, reason: str) -> Dict[str, Any]:
    request = payload.get("request") if isinstance(payload.get("request"), dict) else {}
    return {
        "schema_version": ADAPTER_SCHEMA_VERSION,
        "worker": "inspect",
        "adapter_version": ADAPTER_VERSION,
        "inspect_ai_version": version("inspect-ai"),
        "status": "inconclusive",
        "summary": f"Inspect baseline pack was not executed: {reason}",
        "run_mode": request.get("run_mode", "static"),
        "target": target,
        "eval_pack": {"id": EVAL_PACK_ID, "version": EVAL_PACK_VERSION},
        "limits": {
            "probe_count": MAX_PROBES,
            "probe_timeout_seconds": DEFAULT_PROBE_TIMEOUT_SECONDS,
            "max_response_bytes": MAX_RESPONSE_BYTES,
            "max_adapter_output_bytes": MAX_ADAPTER_OUTPUT_BYTES,
            "redirects_followed": 0,
        },
        "coverage": {"status": "not_run", "attempted": 0, "completed": 0, "inconclusive": 0, "errors": 0},
        "observations": [],
        "limitations": [reason, "No runtime control may be marked passed from this result."],
    }


def run_inspect(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = payload.get("request") if isinstance(payload.get("request"), dict) else {}
    target = request.get("endpoint_url") or request.get("repo_url") or request.get("local_path")
    endpoint, validation_error = _validate_endpoint(request.get("endpoint_url"))
    if validation_error or endpoint is None:
        return _inconclusive_response(payload, target, validation_error or "Endpoint validation failed.")

    timeout_seconds = _bounded_timeout(request)
    started_at = _utc_now()
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="tethermark-inspect-") as log_dir:
        logs = inspect_eval(
            _build_task(endpoint, timeout_seconds),
            model=None,
            display="none",
            log_dir=log_dir,
            log_format="json",
            max_samples=1,
            max_tasks=1,
            fail_on_error=True,
        )
        log = logs[0]
        observations = []
        for sample in log.samples or []:
            try:
                probe = json.loads(sample.output.completion)
            except (AttributeError, TypeError, json.JSONDecodeError):
                probe = {
                    "outcome": "error",
                    "summary": "Inspect sample returned malformed probe output.",
                    "request": None,
                    "response": None,
                    "inconclusive_reason": "malformed_sample_output",
                }
            observations.append({
                "observation_id": f"inspect:{sample.id}",
                "probe_id": str(sample.id),
                "title": str(sample.metadata.get("title", sample.id)),
                "outcome": probe.get("outcome", "error"),
                "severity": "info",
                "summary": probe.get("summary", "Inspect probe returned no summary."),
                "request": probe.get("request"),
                "response": probe.get("response"),
                "inconclusive_reason": probe.get("inconclusive_reason"),
                "evidence_locations": [{"source_kind": "uri", "uri": endpoint, "label": str(sample.id)}],
                "inspect": {"sample_id": str(sample.id), "log_status": log.status},
            })
        log_path = Path(log.location)
        log_sha256 = hashlib.sha256(log_path.read_bytes()).hexdigest() if log_path.is_file() else None

    inconclusive_count = sum(item["outcome"] == "inconclusive" for item in observations)
    error_count = sum(item["outcome"] == "error" for item in observations)
    completed_count = sum(item["outcome"] == "observed" for item in observations)
    coverage_status = "complete" if completed_count == MAX_PROBES else "partial"
    status = "completed" if completed_count == MAX_PROBES else "inconclusive"
    result = {
        "schema_version": ADAPTER_SCHEMA_VERSION,
        "worker": "inspect",
        "adapter_version": ADAPTER_VERSION,
        "inspect_ai_version": version("inspect-ai"),
        "status": status,
        "summary": f"Inspect {EVAL_PACK_ID}@{EVAL_PACK_VERSION} executed {len(observations)} bounded probes; {completed_count} produced HTTP observations and {inconclusive_count + error_count} were inconclusive or errored.",
        "run_mode": request.get("run_mode", "runtime"),
        "target": endpoint,
        "eval_pack": {"id": EVAL_PACK_ID, "version": EVAL_PACK_VERSION},
        "limits": {
            "probe_count": MAX_PROBES,
            "probe_timeout_seconds": timeout_seconds,
            "max_response_bytes": MAX_RESPONSE_BYTES,
            "max_adapter_output_bytes": MAX_ADAPTER_OUTPUT_BYTES,
            "redirects_followed": 0,
        },
        "coverage": {
            "status": coverage_status,
            "attempted": len(observations),
            "completed": completed_count,
            "inconclusive": inconclusive_count,
            "errors": error_count,
        },
        "observations": observations,
        "limitations": [
            "This baseline pack observes endpoint behavior and security-header presence; it does not by itself pass or fail an AI security control.",
            "No model-driven prompt, tool, memory, or data-boundary scenario is included in this pack.",
        ],
        "execution": {
            "started_at": started_at,
            "completed_at": _utc_now(),
            "duration_ms": round((time.monotonic() - started) * 1000),
            "inspect_log_status": log.status,
            "inspect_log_sha256": log_sha256,
            "sample_count": len(observations),
        },
    }
    encoded = json.dumps(result, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_ADAPTER_OUTPUT_BYTES:
        return _inconclusive_response(payload, endpoint, "Inspect adapter output exceeded its hard byte limit.")
    return result
