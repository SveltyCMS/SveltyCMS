import fs from "node:fs";
import path from "node:path";

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

    let content = "";
    let attempts = 0;
    while (attempts < 3) {
      content = fs.readFileSync(privateConfigPath, "utf8");
      if (content.includes("JWT_SECRET_KEY") && content.includes("DB_HOST")) {
        return true;
      }
      attempts++;
      if (attempts < 3) {
        const start = Date.now();
        while (Date.now() - start < 50) {}
      }
    }

    return false;
  } catch {
    return false;
  }
}
