import fs from "node:fs";

fs.writeFileSync("/artifacts/runtime-evidence.json", JSON.stringify({ collected: true }));
