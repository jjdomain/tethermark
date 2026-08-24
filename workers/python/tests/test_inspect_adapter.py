from __future__ import annotations

import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from audit_workers.adapters.inspect_adapter import (
    ADAPTER_SCHEMA_VERSION,
    AI_SECURITY_PACK_ID,
    HTTP_BASELINE_PACK_ID,
    MAX_RESPONSE_BYTES,
    SENSITIVE_TOOL_NAME,
    _bounded_timeout,
    _validate_endpoint,
    run_inspect,
)


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/slow":
            time.sleep(0.4)
        body = b"x" * (MAX_RESPONSE_BYTES + 1024)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_HEAD(self) -> None:
        self.send_response(204)
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()

    def do_POST(self) -> None:
        if self.path == "/slow-post":
            time.sleep(0.4)
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        try:
            request = json.loads(body)
        except json.JSONDecodeError:
            request = {}
        probe = request.get("metadata", {}).get("tethermark_probe")
        if self.path == "/malformed":
            response = b"not-json"
            content_type = "text/plain"
        elif self.path == "/vulnerable-secret" and probe == "secret_nondisclosure":
            system_text = request.get("messages", [{}])[0].get("content", "")
            secret = next((part.rstrip(".") for part in system_text.split() if part.startswith("TM_SYNTHETIC_SECRET_")), "missing")
            response = json.dumps({"choices": [{"message": {"role": "assistant", "content": secret}}]}).encode("utf-8")
            content_type = "application/json"
        elif self.path == "/vulnerable-tool" and probe == "unconfirmed_sensitive_tool":
            response = json.dumps({
                "choices": [{"message": {"role": "assistant", "content": None, "tool_calls": [{
                    "type": "function",
                    "function": {"name": SENSITIVE_TOOL_NAME, "arguments": "{}"},
                }]}}]
            }).encode("utf-8")
            content_type = "application/json"
        else:
            response = json.dumps({"choices": [{"message": {"role": "assistant", "content": "I cannot comply with that request."}}]}).encode("utf-8")
            content_type = "application/json"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        try:
            self.wfile.write(response)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format: str, *args: object) -> None:
        return


class InspectAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.endpoint = f"http://127.0.0.1:{cls.server.server_port}/"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_executes_real_inspect_task_with_bounded_output(self) -> None:
        result = run_inspect({"request": {
            "endpoint_url": self.endpoint,
            "run_mode": "runtime",
            "hints": {"inspect_eval_pack": "http-baseline"},
        }})
        self.assertEqual(result["schema_version"], ADAPTER_SCHEMA_VERSION)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["eval_pack"]["id"], HTTP_BASELINE_PACK_ID)
        self.assertEqual(result["execution"]["inspect_log_status"], "success")
        self.assertEqual(result["limits"]["inspect_sample_time_limit_seconds"], 15)
        self.assertEqual(result["coverage"], {"status": "complete", "attempted": 2, "completed": 2, "findings": 0, "inconclusive": 0, "errors": 0})
        self.assertEqual(len(result["observations"]), 2)
        get_observation = next(item for item in result["observations"] if item["probe_id"] == "inspect-http-get-baseline")
        self.assertTrue(get_observation["response"]["body_truncated"])
        self.assertEqual(get_observation["response"]["body_bytes_retained"], MAX_RESPONSE_BYTES)
        self.assertNotIn("body", get_observation["response"])
        self.assertLess(len(json.dumps(result).encode("utf-8")), result["limits"]["max_adapter_output_bytes"])

    def test_ai_security_pack_is_default_and_no_finding_is_not_a_pass(self) -> None:
        endpoint = f"http://127.0.0.1:{self.server.server_port}/secure-agent"
        result = run_inspect({"request": {"endpoint_url": endpoint, "run_mode": "runtime"}})
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["eval_pack"]["id"], AI_SECURITY_PACK_ID)
        self.assertEqual(result["coverage"]["findings"], 0)
        self.assertEqual(result["orchestrator_model_route"]["provider"], "openai_codex")
        self.assertEqual(result["orchestrator_model_route"]["credential_class"], "chatgpt_session")
        self.assertTrue(all(item["outcome"] == "no_finding_observed" for item in result["observations"]))
        self.assertTrue(all(item["outcome"] != "pass" for item in result["observations"]))
        self.assertTrue(any("not a control pass" in item for item in result["limitations"]))

    def test_ai_security_pack_detects_secret_disclosure_without_retaining_secret(self) -> None:
        endpoint = f"http://127.0.0.1:{self.server.server_port}/vulnerable-secret"
        result = run_inspect({"request": {"endpoint_url": endpoint, "run_mode": "validate"}})
        finding = next(item for item in result["observations"] if item["probe_id"] == "inspect-ai-system-secret-nondisclosure")
        self.assertEqual(finding["outcome"], "finding")
        self.assertEqual(finding["severity"], "high")
        self.assertIn("runtime.secret_retrieval_isolation", finding["control_refs"])
        self.assertTrue(finding["response"]["synthetic_secret_disclosed"])
        self.assertNotIn("TM_SYNTHETIC_SECRET_", json.dumps(result))

    def test_ai_security_pack_detects_unconfirmed_tool_call(self) -> None:
        endpoint = f"http://127.0.0.1:{self.server.server_port}/vulnerable-tool"
        result = run_inspect({"request": {"endpoint_url": endpoint, "run_mode": "runtime"}})
        finding = next(item for item in result["observations"] if item["probe_id"] == "inspect-ai-unconfirmed-sensitive-tool")
        self.assertEqual(finding["outcome"], "finding")
        self.assertEqual(finding["severity"], "high")
        self.assertEqual(finding["control_refs"], ["runtime.tool_authorization_boundary"])
        self.assertTrue(finding["response"]["unconfirmed_sensitive_tool_call"])

    def test_api_key_orchestrator_route_is_optional_and_redacted(self) -> None:
        endpoint = f"http://127.0.0.1:{self.server.server_port}/secure-agent"
        result = run_inspect({"request": {
            "endpoint_url": endpoint,
            "run_mode": "runtime",
            "llm_provider": "openai",
            "llm_model": "gpt-5.4-mini",
            "llm_credential_class": "api_key",
            "llm_api_key": "must-not-be-retained",
        }})
        self.assertEqual(result["orchestrator_model_route"]["provider"], "openai")
        self.assertEqual(result["orchestrator_model_route"]["credential_class"], "api_key")
        self.assertNotIn("must-not-be-retained", json.dumps(result))

    def test_unknown_pack_and_unsupported_response_are_inconclusive(self) -> None:
        unknown = run_inspect({"request": {
            "endpoint_url": self.endpoint,
            "hints": {"inspect_eval_pack": "not-installed"},
        }})
        self.assertEqual(unknown["status"], "inconclusive")
        self.assertEqual(unknown["coverage"]["status"], "not_run")
        malformed_endpoint = f"http://127.0.0.1:{self.server.server_port}/malformed"
        malformed = run_inspect({"request": {"endpoint_url": malformed_endpoint, "run_mode": "runtime"}})
        self.assertEqual(malformed["status"], "inconclusive")
        self.assertTrue(all(item["outcome"] == "inconclusive" for item in malformed["observations"]))

    def test_missing_endpoint_is_inconclusive_not_passed(self) -> None:
        result = run_inspect({"request": {"local_path": ".", "run_mode": "runtime"}})
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(result["coverage"]["status"], "not_run")
        self.assertEqual(result["observations"], [])
        self.assertTrue(any("No runtime control may be marked passed" in item for item in result["limitations"]))

    def test_metadata_and_invalid_endpoint_boundaries(self) -> None:
        self.assertIsNotNone(_validate_endpoint("http://169.254.169.254/latest/meta-data")[1])
        self.assertIsNotNone(_validate_endpoint("file:///etc/passwd")[1])
        self.assertIsNotNone(_validate_endpoint("https://user:secret@example.com/")[1])

    def test_timeout_is_capped_and_reported_inconclusive(self) -> None:
        self.assertEqual(_bounded_timeout({"hints": {"inspect_probe_timeout_seconds": 999}}), 5.0)
        slow = f"http://127.0.0.1:{self.server.server_port}/slow"
        result = run_inspect({"request": {"endpoint_url": slow, "hints": {
            "inspect_probe_timeout_seconds": 0.1,
            "inspect_eval_pack": "http-baseline",
        }}})
        self.assertEqual(result["status"], "inconclusive")
        self.assertGreaterEqual(result["coverage"]["inconclusive"], 1)
        self.assertTrue(all(item["outcome"] != "pass" for item in result["observations"]))


if __name__ == "__main__":
    unittest.main()
