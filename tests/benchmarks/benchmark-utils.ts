/**
 * @file tests/benchmarks/benchmark-utils.ts
 * @description Re-exports benchmark utilities from the modules directory.
 */

// Re-export everything from the canonical modules/benchmark-utils
export {
  // Test runner shims
  test,
  expect,
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  // Benchmark core
  runBenchmark,
  runStochasticLoadTest,
  stabilize,
  getRecommendedConcurrency,
  getMemorySnapshot,
  printTruthTable,
  printSummaryTable,
  // Server management
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  waitForCollection,
  // Results
  exportResult,
  exportMetric,
  exportSubMetric,
  // Utilities
  getDbLabel,
  getDbType,
  measureMemory,
  generateRealisticEntry,
  waitThinkTime,
  // Constants
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  TEST_API_SECRET,
  CONCURRENCY_GROUPS,
} from "./modules/benchmark-utils";

// Types
export type { BenchmarkResult } from "./modules/benchmark-utils";
