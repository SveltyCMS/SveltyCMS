import fs from "node:fs";
import path from "node:path";

let cachedResult: boolean | null = null;
let cacheTime = 0;

/**
 * ⚡️ FAST SHALLOW CHECK
 * Checks if config/private.ts exists.
 * Safe to call from anywhere (middleware, Vite, etc.) without pulling in DB dependencies.
 */
export function isSetupComplete(): boolean {
  if (
    typeof globalThis !== "undefined" &&
    (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ === true
  ) {
    return true;
  }

  // Use a short-lived cache (2 seconds) to avoid redundant I/O and race conditions during restarts
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

    // 3. Robust Read with retries (Handles race conditions during file write/restart)
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelay = 100; // ms

    while (attempts < maxAttempts) {
      try {
        const content = fs.readFileSync(privateConfigPath, "utf8");
        // Validate content - Must have essential keys to be considered complete
        if (
          content.length > 50 &&
          content.includes("JWT_SECRET_KEY") &&
          content.includes("DB_HOST")
        ) {
          // Success! Memoize for 2 seconds to bridge server restart gaps
          cachedResult = true;
          cacheTime = Date.now();
          return true;
        }
      } catch {
        // File might be locked or just created
      }

      attempts++;
      if (attempts < maxAttempts) {
        // Synchronous wait - only during bootstrap, so acceptable impact
        const start = Date.now();
        while (Date.now() - start < retryDelay) {
          // block
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
