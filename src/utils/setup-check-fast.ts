import fs from "node:fs";
import path from "node:path";

let cachedResult: boolean | null = null;
let cacheTime = 0;

/**
 * ⚡️ FAST SHALLOW CHECK
 * Checks if config/private.ts exists and contains the required fields.
 * Safe to call from anywhere (middleware, Vite, etc.) without pulling in DB dependencies.
 *
 * Uses a 2-second module-level cache to avoid per-request filesystem I/O.
 * The cache is intentionally short-lived to pick up config changes after a setup restart.
 */
export function isSetupComplete(): boolean {
  if (
    typeof globalThis !== "undefined" &&
    ((globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ === true ||
      (globalThis as any).__SVELTY_SETUP_COMPLETE__ === true ||
      process.env.BENCHMARK === "true")
  ) {
    return true;
  }

  // 2-second cache to avoid redundant I/O across requests in the same process
  if (cachedResult === true && Date.now() - cacheTime < 2000) {
    return true;
  }

  try {
    const isTestMode =
      typeof process !== "undefined" &&
      (process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true");

    if (isTestMode && !process.env.STRICT_SETUP_CHECK) return true;

    const configFileName = isTestMode ? "private.test.ts" : "private.ts";
    const privateConfigPath = path.join(process.cwd(), "config", configFileName);

    if (!fs.existsSync(privateConfigPath)) {
      return false;
    }

    // Single synchronous read — fs.existsSync + readFileSync is atomic enough.
    // ⚠️ REMOVED: The previous synchronous busy-wait retry loop (`while (Date.now() - start < 100) {}`)
    // blocked the Node.js event loop on every middleware invocation during startup.
    // If the file exists but is temporarily empty (mid-write race), the next request
    // will re-read it within the 2-second cache window.
    try {
      const content = fs.readFileSync(privateConfigPath, "utf8");
      if (
        content.length > 50 &&
        content.includes("JWT_SECRET_KEY") &&
        content.includes("DB_HOST")
      ) {
        cachedResult = true;
        cacheTime = Date.now();
        return true;
      }
    } catch {
      // File may be locked momentarily during write — treat as incomplete
    }

    return false;
  } catch {
    return false;
  }
}
