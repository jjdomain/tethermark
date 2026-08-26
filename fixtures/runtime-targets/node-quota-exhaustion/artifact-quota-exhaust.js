import fs from "node:fs";

for (let index = 0; index < 300; index += 1) {
  fs.writeFileSync(`/artifacts/quota-${index}.bin`, Buffer.alloc(8192));
}
