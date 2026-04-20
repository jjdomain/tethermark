import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const children = [];
let shuttingDown = false;
const apiEntrypoint = path.resolve(process.cwd(), "dist/apps/api-server/src/index.js");
const webEntrypoint = path.resolve(process.cwd(), "dist/apps/web-ui/src/index.js");

function terminate(child) {
  if (child.killed) {
    return;
  }
  if (process.platform === "win32") {
    child.kill();
    return;
  }
  child.kill("SIGTERM");
}

function launch(name, entrypoint) {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const other of children) {
      if (other !== child && !other.killed) {
        terminate(other);
      }
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
  child.on("error", (error) => {
    console.error(`[tethermark:${name}] failed to start`, error);
    if (!shuttingDown) {
      shuttingDown = true;
      for (const other of children) {
        if (other !== child && !other.killed) {
          terminate(other);
        }
      }
      process.exit(1);
    }
  });
  children.push(child);
}

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      terminate(child);
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

launch("api", apiEntrypoint);
launch("web", webEntrypoint);
