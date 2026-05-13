import type http from "node:http";

export function listenWithFriendlyErrors(args: {
  server: http.Server;
  host: string;
  port: number;
  serviceName: string;
  portEnvVar: string;
  onListening: () => void;
}): void {
  args.server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`${args.serviceName} could not start because http://${args.host}:${args.port} is already in use.`);
      console.error(`Use the existing server, stop the process using that port, or set ${args.portEnvVar} to another port.`);
      process.exitCode = 1;
      return;
    }
    console.error(`${args.serviceName} failed to start: ${error.message}`);
    process.exitCode = 1;
  });
  args.server.listen(args.port, args.host, args.onListening);
}
