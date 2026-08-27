import { verifyToolchainLock } from "./toolchain-integrity.mjs";

const lock = await verifyToolchainLock();
console.log(`[tethermark:toolchain-integrity] Playwright ${lock.browser.package_version}, three static-tool policies, and three runtime image digests match the checked-in integrity lock.`);
