export function health() {
  return { status: "ok" };
}

if (process.argv[1]?.endsWith("index.js")) {
  console.log(JSON.stringify(health()));
}
