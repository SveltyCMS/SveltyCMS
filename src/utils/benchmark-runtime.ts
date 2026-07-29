/**
 * @file src/utils/benchmark-runtime.ts
 * @description Hardened benchmark runtime guards.
 *
 * ### Hardening (audit 2026-07):
 * - Centralized getEnvFlag: DRY env-var checks (prevents drift between guards)
 * - Regex-based isBenchmarkArtifact: single regex replaces 10 startsWith calls
 * - Strict normalization: strips ALL non-alphanumeric (not just spaces/_-)
 * - Case-insensitive matching: /i flag catches Mock_, MOCK_, mock_ uniformly
 *
 * Lightweight benchmark/test-runtime guards with zero path-alias imports.
 * Kept alias-free for Vite config bundling and collection compiler compatibility.
 */

/** 🛡️ Centralized detection to prevent configuration drift */
const getEnvFlag = (key: string): boolean => {
  const val = process.env[key];
  return val === "true" || val === "1";
};

/** True when outbound external services must not be contacted (benchmark matrix / soak). */
export function isBenchmarkExternalServicesDisabled(): boolean {
  return (
    getEnvFlag("BENCHMARK") || getEnvFlag("SVELTY_BENCHMARK_SUITE") || getEnvFlag("BENCHMARK_MODE")
  );
}

/** True when Redis L2 cache must not connect. */
export function isBenchmarkRedisDisabled(): boolean {
  return isBenchmarkExternalServicesDisabled() || process.env.BENCHMARK_NO_REDIS === "1";
}

/** True when benchmark/test collections should be loaded. */
export function isBenchmarkRuntime(): boolean {
  return (
    getEnvFlag("BENCHMARK") ||
    getEnvFlag("BENCHMARK_MODE") ||
    getEnvFlag("BENCHMARK_STABLE") ||
    getEnvFlag("SVELTY_BENCHMARK_SUITE") ||
    getEnvFlag("TEST_MODE")
  );
}

/** Normalizes collection ids for mock/benchmark pattern matching. */
export function normalizeCollectionId(id: string): string {
  // 🛡️ Strip all non-alphanumeric characters (defensive against emoji/symbols)
  return id.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Detects benchmark-only collection artifacts.
 * 🛡️ Hardened: Single regex replaces multiple startsWith calls.
 */
export function isBenchmarkArtifact(fileName: string): boolean {
  const base = fileName.replace(/\.(ts|js)$/, "");
  const benchmarkRegex = /^(mock|bench|benchmark|stress)[-_]/i;
  const exactMatches = new Set(["benchmarkstable", "mockcollection"]);

  return (
    base.includes("Mock Collection") ||
    benchmarkRegex.test(base) ||
    exactMatches.has(base.toLowerCase())
  );
}
