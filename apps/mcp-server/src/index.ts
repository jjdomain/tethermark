import http from "node:http";

import { loadEnvironment } from "../../../packages/core-engine/src/env.js";
import { createEngine, type AuditRequest } from "../../../packages/core-engine/src/index.js";

loadEnvironment();

const engine = createEngine();
const host = "127.0.0.1";
const port = Number(process.env.PORT ?? "8790");

function send(res: http.ServerResponse, payload: unknown): void {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }

  const body = await readBody(req);
  if (body.method === "tools/list") {
    send(res, {
      jsonrpc: "2.0",
      id: body.id,
      result: {
        tools: [
          { name: "audit_repo", description: "Audit a local path or repo URL" },
          { name: "get_run_trace", description: "Trace retrieval is artifact-based in this rewrite" }
        ]
      }
    });
    return;
  }

  if (body.method === "tools/call" && body.params?.name === "audit_repo") {
    const args = body.params.arguments as AuditRequest;
    const result = await engine.run(args);
    send(res, { jsonrpc: "2.0", id: body.id, result });
    return;
  }

  send(res, { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } });
});

server.listen(port, host, () => {
  console.log(`MCP bridge listening on http://${host}:${port}`);
});