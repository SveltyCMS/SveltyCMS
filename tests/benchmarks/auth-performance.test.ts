/**
 * @file tests/benchmarks/auth-performance.test.ts
 * @description Authentication & RBAC Pipeline Benchmark (Production Optimized)
 * @summary Evaluates authenticated session resolution, RBAC evaluation, and rejection paths.
 */

import {
  test,
  runBenchmark,
  exportResult,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  benchmarkAuthHeaders,
  getDbType,
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

async function runAuthAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Auth & RBAC Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await stabilize(500);

    const targetUrl = `${baseUrl}/api/user/me`;

    // Static plain record headers to eliminate runtime prototype lookups
    const authHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };

    const unauthHeaders: Record<string, string> = {
      "content-type": "application/json",
      connection: "keep-alive",
    };

    // Verify authenticated endpoint baseline before timing loop
    const verifyRes = await fetch(targetUrl, { headers: authHeaders });
    if (!verifyRes.ok) {
      const errText = await verifyRes.text().catch(() => "");
      throw new Error(`Auth benchmark baseline failed: HTTP ${verifyRes.status} ${errText}`);
    }
    await verifyRes.arrayBuffer().catch(() => {});

    const results = [];

    // ── 1. UNAUTHENTICATED REJECTION BASELINE (401 Fast Path) ───────────────
    console.log("   → Measuring Unauthenticated Fast-Path Rejection...");
    const unauthResult = await runBenchmark({
      name: "Unauthenticated (401 Fast Path)",
      iterations: 400,
      warmupIterations: 50,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers: unauthHeaders,
          signal: AbortSignal.timeout(10000),
        });
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(`Expected 401/403 rejection, got HTTP ${res.status}`);
        }
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...unauthResult, layer: "Security", shortLabel: "Reject-401" });

    // ── 2. AUTH VALIDATION & RBAC (1 Concurrent) ────────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → Measuring Auth Validation & RBAC (1c)...");
    const lightResult = await runBenchmark({
      name: "Auth Validation @ 1c",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers: authHeaders,
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...lightResult, layer: "Auth", shortLabel: "Auth-1c" });

    // ── 3. AUTH PIPELINE (8 Concurrent Stress) ──────────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → Measuring HTTP Auth Pipeline @ 8c concurrency...");
    const httpResult = await runBenchmark({
      name: "HTTP Auth Pipeline @ 8c",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers: authHeaders,
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...httpResult, layer: "Auth", shortLabel: "Auth-8c" });

    // ── REPORTING & EXPORT ──────────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — AUTHENTICATION TELEMETRY",
      shortLabel: "Auth",
      subtitle: `Session Verification • RBAC Resolution • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database", val: dbType, unit: "" },
        { key: "401 Reject Latency", val: unauthResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Auth Latency (1c)", val: lightResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Auth Pipeline Latency (8c)", val: httpResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Peak Auth RPS (8c)", val: Math.round(httpResult.rps), unit: "req/s" },
        { key: "Memory RSS Δ (8c)", val: (httpResult.rssDelta ?? 0).toFixed(2), unit: "MB" },
      ],
      "Auth Performance Summary",
    );

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Auth audit failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Auth & RBAC Enterprise Suite", async () => {
  await runAuthAudit();
}, 450_000);
