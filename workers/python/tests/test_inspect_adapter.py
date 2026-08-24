from __future__ import annotations

import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from audit_workers.adapters.inspect_adapter import (
    ADAPTER_SCHEMA_VERSION,
    MAX_RESPONSE_BYTES,
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
        result = run_inspect({"request": {"endpoint_url": self.endpoint, "run_mode": "runtime"}})
        self.assertEqual(result["schema_version"], ADAPTER_SCHEMA_VERSION)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["execution"]["inspect_log_status"], "success")
        self.assertEqual(result["coverage"], {"status": "complete", "attempted": 2, "completed": 2, "inconclusive": 0, "errors": 0})
        self.assertEqual(len(result["observations"]), 2)
        get_observation = next(item for item in result["observations"] if item["probe_id"] == "inspect-http-get-baseline")
        self.assertTrue(get_observation["response"]["body_truncated"])
        self.assertEqual(get_observation["response"]["body_bytes_retained"], MAX_RESPONSE_BYTES)
        self.assertNotIn("body", get_observation["response"])
        self.assertLess(len(json.dumps(result).encode("utf-8")), result["limits"]["max_adapter_output_bytes"])

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
        result = run_inspect({"request": {"endpoint_url": slow, "hints": {"inspect_probe_timeout_seconds": 0.1}}})
        self.assertEqual(result["status"], "inconclusive")
        self.assertGreaterEqual(result["coverage"]["inconclusive"], 1)
        self.assertTrue(all(item["outcome"] != "pass" for item in result["observations"]))


if __name__ == "__main__":
    unittest.main()
