/**
 * @file src/utils/benchmark-runtime.ts
 * @description Lightweight benchmark/test-runtime guards with zero path-alias imports.
 *
 * Kept alias-free so Vite config bundling (`.vite-temp/`) and collection compile
 * can import these without Node resolving `@utils` before Vite aliases apply.
 *
 * ### Features:
 * - benchmark runtime env detection
 * - external service disable guards (Redis, SMTP, AI, webhooks)
 * - benchmark artifact filename matching
 */

/** True when outbound external services must not be contacted (benchmark matrix / soak). */
export function isBenchmarkExternalServicesDisabled(): boolean {
  return (
    process.env.BENCHMARK === "true" ||
    process.env.SVELTY_BENCHMARK_SUITE === "true" ||
    process.env.BENCHMARK_MODE === "true" ||
    process.env.BENCHMARK_MODE === "1"
  );
}

/** True when Redis L2 cache must not connect (benchmark env or explicit opt-out). */
export function isBenchmarkRedisDisabled(): boolean {
  return isBenchmarkExternalServicesDisabled() || process.env.BENCHMARK_NO_REDIS === "1";
}

/** True when benchmark/test collections should be loaded (matrix, CI, soak tests). */
export function isBenchmarkRuntime(): boolean {
  return (
    process.env.BENCHMARK === "true" ||
    process.env.BENCHMARK_MODE === "true" ||
    process.env.BENCHMARK_MODE === "1" ||
    process.env.BENCHMARK_STABLE === "true" ||
    process.env.SVELTY_BENCHMARK_SUITE === "true" ||
    process.env.TEST_MODE === "true"
  );
}

/** Normalizes collection ids for mock/benchmark pattern matching (strips spaces, _, -). */
export function normalizeCollectionId(id: string): string {
  return id.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Detects benchmark-only collection artifacts that must not appear in wizard presets.
 */
export function isBenchmarkArtifact(fileName: string): boolean {
  const base = fileName.replace(/\.(ts|js)$/, "");
  const lower = base.toLowerCase();
  return (
    base.includes("Mock Collection") ||
    lower.startsWith("bench_") ||
    lower.startsWith("benchmark_") ||
    lower === "benchmarkstable" ||
    base.startsWith("BenchmarkStable") ||
    lower.startsWith("mock-collection") ||
    lower.startsWith("mock_") ||
    lower.startsWith("mock-") ||
    lower.startsWith("stress_") ||
    lower.startsWith("stress-")
  );
}
