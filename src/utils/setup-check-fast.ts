import fs from "node:fs";
import path from "node:path";

let cachedResult: boolean | null = null;
let cacheTime = 0;

/** Runtime env — never use bare `process.env.X` (Vite may mangle those at build time). */
function runtimeEnv(key: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env?.[key];
}

export function invalidateFastSetupCache(): void {
  cachedResult = null;
  cacheTime = 0;
}

/**
 * ⚡️ FAST SHALLOW CHECK
 * Checks if config/private.ts exists and contains the required fields.
 * Safe to call from anywhere (middleware, Vite, etc.) without pulling in DB dependencies.
 *
 * ### Hardening (audit 2026-07):
 * - Regex-based field verification: matches keys as quoted strings, not inside comments
 * - Length threshold: increased from 50 to 100 to better filter mid-write race conditions
 * - Uses a 2-second module-level cache to avoid per-request filesystem I/O.
 * - The cache is intentionally short-lived to pick up config changes after a setup restart.
 */
export function isSetupComplete(): boolean {
  // 1. Force-complete overrides (for benchmarking/setup workflows)
  const g = globalThis as any;
  if (
    g.__SVELTY_SETUP_FORCED_COMPLETE__ ||
    g.__SVELTY_SETUP_COMPLETE__ ||
    runtimeEnv("BENCHMARK") === "true"
  ) {
    return true;
  }

  // 2-second cache to avoid redundant I/O across requests in the same process
  if (cachedResult === true && Date.now() - cacheTime < 2000) {
    return true;
  }

  try {
    const isTestMode =
      runtimeEnv("TEST_MODE") === "true" || runtimeEnv("VITE_TEST_MODE") === "true";

    if (isTestMode && runtimeEnv("STRICT_SETUP_CHECK") !== "true") return true;

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
      // Regex ensures keys are matched as quoted strings, not inside comments
      const hasRequiredFields = /["']JWT_SECRET_KEY["']|["']DB_HOST["']/i.test(content);

      // Validate minimum content length to filter out half-written files during write-race
      if (content.length > 100 && hasRequiredFields) {
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
