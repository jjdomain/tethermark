import fs from "node:fs/promises";
import zlib from "node:zlib";

const [sarifPath, repo, commitSha, ref] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;

if (!sarifPath || !repo || !commitSha || !ref) {
  console.error("Usage: GITHUB_TOKEN=... node examples/upload-sarif-to-github.mjs <report.sarif.json> <owner/repo> <commit_sha> <ref>");
  process.exit(1);
}

if (!token) {
  console.error("GITHUB_TOKEN is required.");
  process.exit(1);
}

const sarifContent = await fs.readFile(sarifPath);
const sarif = JSON.parse(sarifContent.toString("utf8"));
const gzipped = zlib.gzipSync(Buffer.from(JSON.stringify(sarif)));
const encodedSarif = gzipped.toString("base64");

const response = await fetch(`https://api.github.com/repos/${repo}/code-scanning/sarifs`, {
  method: "POST",
  headers: {
    "authorization": `Bearer ${token}`,
    "accept": "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "tethermark-example-uploader"
  },
  body: JSON.stringify({
    commit_sha: commitSha,
    ref,
    sarif: encodedSarif,
    tool_name: "tethermark"
  })
});

if (!response.ok) {
  const errorText = await response.text();
  console.error(`GitHub SARIF upload failed (${response.status}): ${errorText}`);
  process.exit(1);
}

const result = await response.json();
console.log(`SARIF upload accepted for ${repo}.`);
console.log(`GitHub upload id: ${result.id}`);
