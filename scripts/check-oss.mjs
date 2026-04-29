import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

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

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve numeric port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
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
  const apiPort = await reservePort();
  const webPort = await reservePort();
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const urlChecks = [
    `${apiBaseUrl}/health`,
    `http://127.0.0.1:${webPort}`,
    `http://127.0.0.1:${webPort}/vendor/react.production.min.js`,
    `http://127.0.0.1:${webPort}/vendor/react-dom.production.min.js`
  ];
  const childEnv = {
    ...process.env,
    PORT: String(apiPort),
    WEB_UI_PORT: String(webPort),
    WEB_UI_API_BASE_URL: apiBaseUrl
  };
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", "npm", "run", "oss"], {
          cwd: process.cwd(),
          env: childEnv,
          stdio: "inherit"
        })
      : spawn("npm", ["run", "oss"], {
          cwd: process.cwd(),
          env: childEnv,
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
