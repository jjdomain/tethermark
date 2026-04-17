export function main() {
  console.log("repo-posture-good fixture");
}

if (process.argv.includes("--self-test")) {
  main();
}
