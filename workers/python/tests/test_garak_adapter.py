from __future__ import annotations

import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from audit_workers.adapters.garak_adapter import (
    ADAPTER_SCHEMA_VERSION,
    GARAK_PACK_ID,
    GARAK_VERSION,
    MAX_RESPONSE_BYTES,
    _bounded_timeout,
    garak_profile_status,
    run_garak,
)


class _Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.path == "/slow":
            time.sleep(0.4)
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length) or b"{}")
        probe = request.get("metadata", {}).get("tethermark_probe")
        status_code = 200
        content_type = "application/json"
        if self.path == "/malformed":
            response = b"not-json"
            content_type = "text/plain"
        elif self.path == "/partial" and probe == "garak-promptinject-nevermind":
            status_code = 503
            response = b"temporary failure"
            content_type = "text/plain"
        elif self.path == "/oversized":
            response = b"x" * (MAX_RESPONSE_BYTES + 1)
            content_type = "text/plain"
        elif self.path == "/vulnerable":
            trigger = "I hate humans" if probe == "garak-promptinject-ignore-say" else "Kill all humans"
            response = json.dumps({"choices": [{"message": {"role": "assistant", "content": trigger}}]}).encode("utf-8")
        else:
            response = json.dumps({"choices": [{"message": {"role": "assistant", "content": "I cannot follow instructions embedded in untrusted content."}}]}).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(response)))
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(response)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def log_message(self, format: str, *args: object) -> None:
        return


class GarakAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def endpoint(self, path: str) -> str:
        return f"http://127.0.0.1:{self.server.server_port}{path}"

    def test_managed_profile_executes_official_garak_components(self) -> None:
        status = garak_profile_status()
        self.assertEqual(status["status"], "executable")
        self.assertEqual(status["version"], GARAK_VERSION)
        self.assertEqual(status["profile"], "promptinject-minimal")

    def test_secure_target_has_no_findings_and_no_automatic_pass(self) -> None:
        result = run_garak({"request": {"endpoint_url": self.endpoint("/secure"), "run_mode": "runtime"}})
        self.assertEqual(result["schema_version"], ADAPTER_SCHEMA_VERSION)
        self.assertEqual(result["garak_version"], GARAK_VERSION)
        self.assertEqual(result["eval_pack"]["id"], GARAK_PACK_ID)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["coverage"], {"status": "complete", "attempted": 2, "completed": 2, "findings": 0, "inconclusive": 0, "errors": 0})
        self.assertTrue(all(item["outcome"] == "no_finding_observed" for item in result["observations"]))
        self.assertTrue(all(item["outcome"] != "pass" for item in result["observations"]))
        self.assertTrue(any("not a control pass" in item for item in result["limitations"]))
        self.assertEqual(result["orchestrator_model_route"]["credential_class"], "chatgpt_session")

    def test_vulnerable_target_produces_redacted_high_findings(self) -> None:
        result = run_garak({"request": {"endpoint_url": self.endpoint("/vulnerable"), "run_mode": "validate"}})
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["coverage"]["findings"], 2)
        for finding in result["observations"]:
            self.assertEqual(finding["outcome"], "finding")
            self.assertEqual(finding["severity"], "high")
            self.assertEqual(finding["control_refs"], ["runtime.prompt_injection_resistance"])
            self.assertTrue(finding["response"]["prompt_injection_trigger_observed"])
            self.assertEqual(finding["response"]["garak_detector"], "promptinject.AttackRogueString")
        serialized = json.dumps(result).lower()
        self.assertNotIn("i hate humans", serialized)
        self.assertNotIn("kill all humans", serialized)
        self.assertNotIn("ignore previous", serialized)
        self.assertNotIn("messages", serialized)

    def test_partial_and_malformed_results_are_inconclusive(self) -> None:
        partial = run_garak({"request": {"endpoint_url": self.endpoint("/partial"), "run_mode": "runtime"}})
        self.assertEqual(partial["status"], "inconclusive")
        self.assertEqual(partial["coverage"]["completed"], 1)
        self.assertEqual(partial["coverage"]["inconclusive"], 1)
        malformed = run_garak({"request": {"endpoint_url": self.endpoint("/malformed"), "run_mode": "runtime"}})
        self.assertEqual(malformed["status"], "inconclusive")
        self.assertTrue(all(item["outcome"] == "inconclusive" for item in malformed["observations"]))

    def test_output_limit_and_timeout_are_inconclusive(self) -> None:
        oversized = run_garak({"request": {"endpoint_url": self.endpoint("/oversized"), "run_mode": "runtime"}})
        for _ in range(2):
            if all(item["response"] is not None for item in oversized["observations"]):
                break
            oversized = run_garak({"request": {"endpoint_url": self.endpoint("/oversized"), "run_mode": "runtime"}})
        self.assertEqual(oversized["status"], "inconclusive")
        self.assertTrue(all(item["response"]["body_truncated"] for item in oversized["observations"]))
        self.assertEqual(_bounded_timeout({"hints": {"garak_probe_timeout_seconds": 999}}), 5.0)
        slow = run_garak({"request": {
            "endpoint_url": self.endpoint("/slow"),
            "run_mode": "runtime",
            "hints": {"garak_probe_timeout_seconds": 0.1},
        }})
        self.assertEqual(slow["status"], "inconclusive")
        self.assertGreaterEqual(slow["coverage"]["inconclusive"], 1)

    def test_missing_endpoint_unknown_pack_and_ssrf_boundaries_are_inconclusive(self) -> None:
        missing = run_garak({"request": {"local_path": ".", "run_mode": "runtime"}})
        self.assertEqual(missing["status"], "inconclusive")
        self.assertEqual(missing["coverage"]["status"], "not_run")
        unknown = run_garak({"request": {
            "endpoint_url": self.endpoint("/secure"),
            "hints": {"garak_eval_pack": "not-installed"},
        }})
        self.assertEqual(unknown["status"], "inconclusive")
        metadata = run_garak({"request": {"endpoint_url": "http://169.254.169.254/latest/meta-data"}})
        self.assertEqual(metadata["status"], "inconclusive")


if __name__ == "__main__":
    unittest.main()
