import { spawn } from "node:child_process";
import process from "node:process";

const urlChecks = [
  "http://127.0.0.1:8787/health",
  "http://127.0.0.1:8788",
  "http://127.0.0.1:8788/vendor/react.production.min.js",
  "http://127.0.0.1:8788/vendor/react-dom.production.min.js"
];
const timeoutMs = 30000;
const pollIntervalMs = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function terminate(child) {
  if (!child || child.killed) {
    return;
  }
  if (process.platform === "win32") {
    child.kill();
    return;
  }
  child.kill("SIGTERM");
}

async function waitForUrl(url) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `${url} responded ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function main() {
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", "npm", "run", "oss"], {
          cwd: process.cwd(),
          env: process.env,
          stdio: "inherit"
        })
      : spawn("npm", ["run", "oss"], {
          cwd: process.cwd(),
          env: process.env,
          stdio: "inherit"
        });

  const exitPromise = new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });

  try {
    for (const url of urlChecks) {
      await waitForUrl(url);
    }
    console.log("[tethermark:oss-check] API and web UI are reachable.");
  } finally {
    terminate(child);
    await Promise.race([exitPromise, sleep(5000)]);
  }

  const result = await Promise.race([exitPromise, sleep(100)]);
  if (result && typeof result === "object" && "code" in result && result.code && result.code !== 0) {
    process.exit(result.code);
  }
}

main().catch((error) => {
  console.error("[tethermark:oss-check] failed", error);
  process.exit(1);
});
