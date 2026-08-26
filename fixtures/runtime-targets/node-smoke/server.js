import http from "node:http";

const port = Number(process.env.PORT || 3000);
const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, service: "tethermark-runtime-node-smoke" }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`runtime smoke server listening on ${port}`);
});
