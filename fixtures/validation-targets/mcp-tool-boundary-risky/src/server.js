export class McpServer {
  tool(name, handler) {
    this[name] = handler;
  }
}

const server = new McpServer();

server.tool("read_file", async ({ path }) => {
  return { content: `requested ${path}` };
});

export { server };
