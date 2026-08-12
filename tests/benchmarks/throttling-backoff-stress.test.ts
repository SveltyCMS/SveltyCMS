/**
 * @file tests/benchmarks/throttling-backoff-stress.test.ts
 * @description API Rate-Limiting & Throttling Stress Benchmark (Optimized)
 * @summary Simulates high-velocity traffic from a single client IP to verify rate-limiting enforcement and backoff consistency.
 *
 * ### Features:
 * - High-concurrency bombardment to trigger rate-limiting (HTTP 429)
 * - Rate-limiter consistency validation (no unexpected failures)
 * - Backoff policy verification under sustained load
 */

import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runThrottlingAudit() {
  console.log("🚀 Starting Enterprise Throttling & Backoff Audit...\n");

  try {
    // 🛡️ HONEST THROTTLING: a shared (matrix) server is spawned with
    // RATE_LIMIT_MAX_REQUESTS=20000 — 429 can never fire, so the old run
    // printed a fabricated "Backoff Policy: ACTIVE". Require a dedicated
    // low-limit server instead of faking the result.
    if (process.env.API_BASE_URL) {
      throw new Error(
        "[throttling-backoff-stress] requires a server spawned with RATE_LIMIT_MAX_REQUESTS=100 " +
          "(shared/matrix servers use 20000 and never throttle). Run standalone.",
      );
    }
    process.env.RATE_LIMIT_MAX_REQUESTS = "100";

    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    // Cache immutable request configuration — REAL admin session (production auth).
    // x-forwarded-for drives per-IP throttling via the address header (proxy deploy).
    // /api/system/health bypasses the limiter (terminal turbo fast-path) — hit a
    // real API route instead so 429 is actually reachable.
    const rateLimiterHeaders = {
      ...benchmarkAuthHeaders(),
      "x-forwarded-for": "10.0.0.1", // Standard lowercase format for optimized mapping lookups
    };

    console.log("   → Bombarding API with 10x design load to trigger Throttling...");

    let throttled = 0;
    const results = await runBenchmark({
      name: "Throttling Enforcement",
      iterations: 150,
      runs: 1,
      concurrency: 15,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/bench-shared-001`, {
          method: "GET",
          headers: rateLimiterHeaders,
        });

        if (res.status === 429) {
          throttled++;
        } else if (res.status !== 200) {
          throw new Error(`Unexpected failure state: ${res.status}`);
        }

        // Native stream collector prevents object tree allocation logic from inflating client metric runtimes
        await res.arrayBuffer();
      },
    });

    // 🛡️ HONESTY GUARD: the limiter MUST have engaged — otherwise the "Backoff
    // Policy: ACTIVE" row below would be fabricated.
    if (throttled === 0) {
      throw new Error(
        `Rate limiter never engaged (0/150 requests returned 429 with RATE_LIMIT_MAX_REQUESTS=100). ` +
          `Refusing to report fabricated backoff results.`,
      );
    }

    printTruthTable({
      title: "SVELTYCMS — THROTTLING AUDIT",
      shortLabel: "Limiter",
      subtitle: `Rate-Limiter Efficiency • ${getDbType().toUpperCase()}`,
      results: [{ ...results, shortLabel: "Limiter", layer: "API Firewall" }],
    });

    printSummaryTable([
      {
        key: "Throughput (RPS)",
        val: Math.round(results.rps || 0),
        unit: "req/s",
      },
      {
        key: "429 Responses",
        val: throttled,
        unit: "",
      },
      {
        key: "Limiter Consistency",
        val: results.errorRate === 0 ? "STABLE" : "BYPASSED",
        unit: "",
      },
      { key: "Backoff Policy", val: throttled > 0 ? "ACTIVE" : "NOT-TRIGGERED", unit: "" },
    ]);
  } catch (err: any) {
    logger.error(`Throttling audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Rate Limiting & Backoff Stress", async () => {
  await runThrottlingAudit();
}, 600000);
