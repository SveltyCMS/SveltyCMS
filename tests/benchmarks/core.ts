/**
 * @file tests/benchmarks/core.ts
 * @description Core benchmark tests for CI gating.
 *
 * These 6 tests cover the critical performance paths:
 * - HTTP overhead (truth-latency)
 * - Database CRUD (database-performance)
 * - Transaction integrity (transaction-acid)
 * - Cache efficiency (cache-performance)
 * - Middleware trace (hooks-performance)
 * - REST API throughput (rest-api-performance)
 *
 * Run individually: bun test tests/benchmarks/truth-latency.test.ts
 * Run all core:    bun run benchmark-core
 */

export const CORE_BENCHMARKS = [
  "tests/benchmarks/truth-latency.test.ts",
  "tests/benchmarks/database-performance.test.ts",
  "tests/benchmarks/transaction-acid.test.ts",
  "tests/benchmarks/cache-performance.test.ts",
  "tests/benchmarks/hooks-performance.test.ts",
  "tests/benchmarks/rest-api-performance.test.ts",
] as const;

export type CoreBenchmark = (typeof CORE_BENCHMARKS)[number];
