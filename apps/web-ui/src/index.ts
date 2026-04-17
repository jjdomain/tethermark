import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const host = "127.0.0.1";
const port = Number(process.env.WEB_UI_PORT ?? "8788");
const defaultApiBaseUrl = process.env.WEB_UI_API_BASE_URL ?? "http://127.0.0.1:8787";
const staticDir = path.resolve(process.cwd(), "apps", "web-ui", "static");

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function safeJoin(rootDir: string, pathname: string): string | null {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(rootDir, "." + normalized);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function proxyApiRequest(req: http.IncomingMessage, res: http.ServerResponse, url: URL, apiBaseUrl: string): Promise<void> {
  const targetUrl = new URL(url.pathname.replace(/^\/api/, "") + url.search, apiBaseUrl);
  const body = await readBody(req);
  const headers = new Headers();
  for (const name of ["content-type", "x-api-key", "x-harness-workspace", "x-harness-project", "x-harness-actor"]) {
    if (req.headers[name]) headers.set(name, String(req.headers[name]));
  }
  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/octet-stream" });
  res.end(buffer);
}

async function serveStaticAsset(res: http.ServerResponse, pathname: string): Promise<boolean> {
  const assetPath = safeJoin(staticDir, pathname);
  if (!assetPath) return false;
  try {
    const stat = await fs.stat(assetPath);
    if (!stat.isFile()) return false;
    const body = await fs.readFile(assetPath);
    res.writeHead(200, { "content-type": contentTypeFor(assetPath) });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function serveIndex(res: http.ServerResponse): Promise<void> {
  const indexPath = path.join(staticDir, "index.html");
  const body = await fs.readFile(indexPath);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

export function createWebUiServer(options?: { apiBaseUrl?: string }): http.Server {
  const apiBaseUrl = options?.apiBaseUrl ?? defaultApiBaseUrl;
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);

    if (url.pathname.startsWith("/api/")) {
      try {
        await proxyApiRequest(req, res, url, apiBaseUrl);
      } catch (error) {
        res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
        res.end(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(`${JSON.stringify({ status: "ok", service: "tethermark-web-ui", api_base_url: apiBaseUrl }, null, 2)}\n`);
      return;
    }

    if (req.method === "GET") {
      const served = await serveStaticAsset(res, url.pathname);
      if (served) return;
      await serveIndex(res);
      return;
    }

    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(`${JSON.stringify({ error: "not_found" }, null, 2)}\n`);
  });
}

const entryHref = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryHref && import.meta.url === entryHref) {
  const server = createWebUiServer();
  server.listen(port, host, () => {
    console.log(`Web UI listening on http://${host}:${port}`);
  });
}
