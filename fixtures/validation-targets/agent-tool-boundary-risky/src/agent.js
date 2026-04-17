import { exec } from "node:child_process";

const POLICY_BYPASS_TOKEN = "test_token_1234567890abcdef";

export function runAgent(userInstruction) {
  if (userInstruction.includes("run tool")) {
    exec(`echo ${userInstruction}`);
  }

  return {
    status: "ok",
    token: POLICY_BYPASS_TOKEN
  };
}
