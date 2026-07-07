/**
 * @file tests/benchmarks/benchmark-utils.ts
 * @description Enterprise Abstraction & Lazy-Loading Export Layer for SveltyCMS Benchmarks.
 * Insulates micro-benchmarks from premature module graph instantiation and environment pollution.
 */

// ── 1. Pure Primitives & Statistical Utilities (Fast, Zero-Side-Effect Evaluation) ──
export {
  test,
  expect,
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  stabilize,
  getRecommendedConcurrency,
  getMemorySnapshot,
  getDbLabel,
  getDbType,
  measureMemory,
  generateRealisticEntry,
  waitThinkTime,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  CONCURRENCY_GROUPS,
} from "./modules/benchmark-utils";

// ── 2. Lazy Token Extraction (Prevents Cross-Thread Environment Bleeding) ──
export const TEST_API_SECRET = (() => {
  if (typeof process !== "undefined" && process.env) {
    return (
      process.env.TEST_API_SECRET ||
      process.env.VITE_TEST_API_SECRET ||
      "SVELTYCMS_TEST_SECRET_2026"
    );
  }
  return "SVELTYCMS_TEST_SECRET_2026";
})();

// ── 2b. Result Assertion Helpers (Lazy-loaded for zero-penalty in non-benchmark paths) ──
export function assertSuccess(
  result:
    | { success: boolean; message?: string; error?: any; [key: string]: any }
    | null
    | undefined,
  operation: string,
): void {
  if (!result || !result.success) {
    const msg = result?.message || result?.error?.message || "Unknown error";
    throw new Error(`[${operation}] ${msg}`);
  }
}

// ── 3. Deferred Orchestration Exporters (Isolated from Barrel Evaluation Code Path) ──
export async function runBenchmark(config: any) {
  const { runBenchmark: canonicalRun } = await import("./modules/benchmark-utils");
  return canonicalRun(config);
}

export async function runStochasticLoadTest(config: any) {
  const { runStochasticLoadTest: canonicalLoad } = await import("./modules/benchmark-utils");
  return canonicalLoad(config);
}

export async function printTruthTable(options: any) {
  const { printTruthTable: canonicalTable } = await import("./modules/benchmark-utils");
  return canonicalTable(options);
}

export async function printSummaryTable(metrics: any[], shortLabel?: string) {
  const { printSummaryTable: canonicalSummary } = await import("./modules/benchmark-utils");
  return canonicalSummary(metrics, shortLabel);
}

export async function setupBenchmarkServer() {
  const { setupBenchmarkServer: canonicalServer } = await import("./modules/benchmark-utils");
  return canonicalServer();
}

export async function ensureStableTestData(db?: any, tenantId: string = "global") {
  const { ensureStableTestData: canonicalData } = await import("./modules/benchmark-utils");
  return canonicalData(db, tenantId);
}

export async function forceRefreshServer(baseUrl: string, tenantId: string = "global") {
  const { forceRefreshServer: canonicalRefresh } = await import("./modules/benchmark-utils");
  return canonicalRefresh(baseUrl, tenantId);
}

export async function waitForCollection(
  baseUrl: string,
  collectionId: string,
  tenantId: string = "global",
) {
  const { waitForCollection: canonicalWait } = await import("./modules/benchmark-utils");
  return canonicalWait(baseUrl, collectionId, tenantId);
}

export async function exportResult(r: any) {
  const { exportResult: canonicalExport } = await import("./modules/benchmark-utils");
  return canonicalExport(r);
}

export async function exportMetric(key: string, value: number, unit: string) {
  const { exportMetric: canonicalMetric } = await import("./modules/benchmark-utils");
  return canonicalMetric(key, value, unit);
}

export async function exportSubMetric(
  key: string,
  value: number,
  unit: string = "ms",
  phase: "cold" | "warm" | "mixed" = "warm",
) {
  const { exportSubMetric: canonicalSubMetric } = await import("./modules/benchmark-utils");
  return canonicalSubMetric(key, value, unit, phase);
}

// ── 4. Types ──
export type { BenchmarkResult } from "./modules/benchmark-utils";
