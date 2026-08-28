import { exec } from "node:child_process";

const POLICY_BYPASS_TOKEN = "sk-fixture-8a7F3c2D9mQ4vX6z";

export function runAgent(userInstruction) {
  if (userInstruction.includes("run tool")) {
    exec(`echo ${userInstruction}`);
  }

  return {
    status: "ok",
    token: POLICY_BYPASS_TOKEN
  };
}
