/**
 * @file tests/benchmarks/throttling-backoff-stress.test.ts
 * @description API Rate-Limiting & Throttling Stress Benchmark (Optimized)
 * @summary Measures rate-limiter enforcement (HTTP 429), header contract compliance, and backoff recovery under sustained high-velocity bombardment.
 */

import {
  test,
  expect,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function runThrottlingAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Throttling & Backoff Audit (${dbType})...\n`);

  try {
    if (process.env.API_BASE_URL) {
      throw new Error(
        "[throttling-backoff-stress] requires a standalone server spawned with RATE_LIMIT_MAX_REQUESTS=100. " +
          "Shared/matrix servers use 20000 and do not throttle.",
      );
    }
    // 🛡️ PRODUCTION PARITY: `bun test` forces TEST_MODE=true + NODE_ENV=test on
    // this process — if left set, the spawned server inherits them and the
    // rate-limiter skips every request (`isLocal && IS_TEST_MODE`). Delete both
    // so the benchmark server boots in real production semantics and 429 is
    // actually reachable (verified: without this, 0/160 → 429).
    delete process.env.TEST_MODE;
    delete process.env.PLAYWRIGHT_TEST;
    process.env.RATE_LIMIT_MAX_REQUESTS = "100";
    process.env.RATE_LIMIT_WINDOW_MS = "2000"; // 2-second rate-limit window for deterministic backoff tests

    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;
    const targetEndpoint = `${baseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`;

    await stabilize(1000);

    // 🛡️ MUTATION LANE: handleRateLimit only budgets POST/PUT/PATCH/DELETE (GET
    // reads are terminal turbo fast-paths by design) — a PATCH on the stable
    // entry is the honest way to hit the per-IP bucket. X-Forwarded-For is
    // deliberately absent: getClientIp() trusts ONLY the platform address, so a
    // spoofed header would be silently ignored (all requests share one bucket).
    const rateLimiterHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };
    // Idempotent mutation body — keeps the stable entry intact across bursts.
    const mutationBody = JSON.stringify({ count: 0 });

    const results: any[] = [];
    let passed200 = 0;
    let throttled429 = 0;
    let capturedRetryAfter: string | null = null;
    let capturedRateLimitLimit: string | null = null;
    let remainingHeaderViolations = 0;

    // ── 1. HIGH-CONCURRENCY RATE-LIMIT ENFORCEMENT BOMBARDMENT ──────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → 1. Bombarding API with 15x concurrency to trigger HTTP 429 Throttling...");

    const enforceResult = await runBenchmark({
      name: "Rate-Limiter Bombardment",
      iterations: 160,
      warmupIterations: 0,
      runs: 1,
      concurrency: 15,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetEndpoint, {
          method: "PATCH",
          headers: rateLimiterHeaders,
          body: mutationBody,
          signal: AbortSignal.timeout(10_000),
        });

        if (res.status === 429) {
          throttled429++;
          // Header contract (RFC 6585 + X-RateLimit-*): every 429 must carry
          // Retry-After and report the exhausted bucket via limit/remaining.
          if (!capturedRetryAfter) {
            capturedRetryAfter =
              res.headers.get("retry-after") || res.headers.get("x-ratelimit-reset");
          }
          if (!capturedRateLimitLimit) {
            capturedRateLimitLimit = res.headers.get("x-ratelimit-limit");
          }
          if (res.headers.get("x-ratelimit-remaining") !== "0") {
            remainingHeaderViolations++;
          }
        } else if (res.status === 200) {
          passed200++;
        } else {
          throw new Error(`Unexpected HTTP status encountered: ${res.status}`);
        }

        await res.arrayBuffer().catch(() => {});
      },
    });

    if (throttled429 === 0) {
      throw new Error(
        "Rate limiter failed to engage: 0/160 requests returned HTTP 429 with " +
          "RATE_LIMIT_MAX_REQUESTS=100. Is TEST_MODE leaking into the spawned server?",
      );
    }
    if (!capturedRetryAfter) {
      throw new Error("Rate limiter returned 429 without a Retry-After header.");
    }

    results.push({
      ...enforceResult,
      shortLabel: "Enforcement",
      layer: "Firewall",
    });

    // ── 2. BACKOFF & COOLDOWN RECOVERY VERIFICATION ──────────────────────────
    console.log("   → 2. Entering Cooldown Backoff Period (Waiting for Window Reset)...");
    const backoffWaitMs = capturedRetryAfter
      ? Math.min(parseInt(capturedRetryAfter, 10) * 1000, 3000)
      : 2200;

    await stabilize(backoffWaitMs);
    forceGarbageCollection();

    console.log("   → 3. Measuring Post-Backoff Recovery Latency (Verifying 200 OK Return)...");

    let recoverySuccessCount = 0;
    const recoveryResult = await runBenchmark({
      name: "Post-Backoff Recovery",
      iterations: 20,
      warmupIterations: 0,
      runs: 1,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetEndpoint, {
          method: "PATCH",
          headers: rateLimiterHeaders,
          body: mutationBody,
          signal: AbortSignal.timeout(5000),
        });

        if (res.status === 200) {
          recoverySuccessCount++;
        } else {
          throw new Error(`Post-backoff request failed with unexpected status: HTTP ${res.status}`);
        }

        await res.arrayBuffer().catch(() => {});
      },
    });

    results.push({
      ...recoveryResult,
      shortLabel: "Recovery",
      layer: "Recovery",
    });

    // ── 3. REPORTING & TELEMETRY ────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — RATE LIMITING & BACKOFF AUDIT",
      shortLabel: "Limiter",
      subtitle: `Rate-Limiter Enforcement • Cooldown Recovery • ${dbType}`,
      results,
    });

    const isLimiterOptimal = throttled429 > 0 && recoverySuccessCount === 20;

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Bombardment Throughput", val: Math.round(enforceResult.rps || 0), unit: "req/s" },
        { key: "Accepted Requests (200 OK)", val: passed200, unit: "reqs" },
        { key: "Throttled Requests (429)", val: throttled429, unit: "reqs" },
        {
          key: "Throttle Trigger Ratio",
          val: `${((throttled429 / 160) * 100).toFixed(1)}%`,
          unit: "",
        },
        {
          key: "Retry-After Header Provided",
          val: capturedRetryAfter ? `YES (${capturedRetryAfter}s)` : "NO",
          unit: "",
        },
        {
          key: "X-RateLimit-Limit Header",
          val: capturedRateLimitLimit ? `YES (${capturedRateLimitLimit})` : "NO",
          unit: "",
        },
        {
          key: "X-RateLimit-Remaining on 429",
          val:
            remainingHeaderViolations === 0 ? "OK (0)" : `${remainingHeaderViolations} violations`,
          unit: "",
        },
        { key: "Post-Backoff Recovery Latency", val: recoveryResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Post-Backoff Recovery p95",
          val: (recoveryResult.p95Ms || recoveryResult.avgMs).toFixed(2),
          unit: "ms",
        },
        {
          key: "Backoff Policy Health",
          val: isLimiterOptimal ? "OPTIMAL (Enforced & Recovered)" : "FAILED",
          unit: "",
        },
      ],
      "Rate Limiting & Backoff Summary",
    );

    exportMetric("throttling.enforcement_rps", Math.round(enforceResult.rps || 0), "req/s");
    exportMetric("throttling.accepted_200_count", passed200, "reqs");
    exportMetric("throttling.throttled_429_count", throttled429, "reqs");
    exportMetric(
      "throttling.header_ratelimit_limit",
      capturedRateLimitLimit ? Number(capturedRateLimitLimit) : 0,
      "reqs",
    );
    exportMetric("throttling.header_remaining_violations", remainingHeaderViolations, "count");
    exportMetric("throttling.recovery_avg_ms", recoveryResult.avgMs, "ms");
    exportMetric("throttling.recovery_p95_ms", recoveryResult.p95Ms || recoveryResult.avgMs, "ms");

    for (const r of results) exportResult(r);

    expect(throttled429).toBeGreaterThan(0);
    expect(capturedRetryAfter).not.toBeNull();
    expect(capturedRateLimitLimit).not.toBeNull();
    expect(remainingHeaderViolations).toBe(0);
    expect(recoverySuccessCount).toBe(20);
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
}, 600_000);
