/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description Professional benchmark for SveltyCMS REST API endpoints.
 * Measures latency and throughput for common public & authenticated routes.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { safeFetch } from "../integration/helpers/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";

async function stabilize() {
  if (typeof Bun !== "undefined") Bun.gc(true);
  await new Promise((r) => setTimeout(r, 20));
}

test("REST API Professional Performance Suite", async () => {
  console.log("🚀 Starting SveltyCMS REST API Performance Benchmark...\n");

  // ========================
  // Server Health Check
  // ========================
  console.log("📡 Checking server availability...");
  try {
    const healthCheck = await safeFetch(`${API_BASE_URL}/api/system/health`, { method: "GET" });
    if (!healthCheck.ok) {
      throw new Error(`Server returned ${healthCheck.status}`);
    }
    console.log(`✅ Server reachable at ${API_BASE_URL}`);
  } catch (err: any) {
    console.error(`\n❌ ERROR: REST API server not reachable at ${API_BASE_URL}`);
    console.warn("   This benchmark requires a running preview or production server.");
    console.warn("   Run in another terminal: bun run build && bun run preview");
    throw err; // Fail the test clearly
  }

  await stabilize();

  const TEST_API_SECRET = process.env.TEST_API_SECRET || "enterprise-audit-2026";
  const authHeaders = { "x-test-secret": TEST_API_SECRET };

  const ITERATIONS = 800; // Good statistical significance for fast endpoints
  const WARMUP = 100;
  const CONCURRENCY = 12; // Realistic moderate concurrency

  const results: any[] = [];

  // 1. Public Health Check (lightweight, no auth)
  console.log("📊 Benchmarking: /api/system/health (Public)");
  const healthResult = await runBenchmark({
    name: "REST: /api/system/health (Public)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: CONCURRENCY,
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/system/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  });
  results.push(healthResult);
  exportResult(healthResult, "rest-system-health.json");

  await stabilize();

  // 2. Authenticated /api/user/me
  console.log("📊 Benchmarking: /api/user/me (Authenticated)");
  const meResult = await runBenchmark({
    name: "REST: /api/user/me (Auth)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: CONCURRENCY,
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/user/me`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.text(); // consume body
    },
  });
  results.push(meResult);
  exportResult(meResult, "rest-user-me.json");

  await stabilize();

  // 3. List Collections (DB-heavy)
  console.log("📊 Benchmarking: /api/collections (Database query)");
  const collectionsResult = await runBenchmark({
    name: "REST: /api/collections (DB)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: CONCURRENCY,
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/collections`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.text();
    },
  });
  results.push(collectionsResult);
  exportResult(collectionsResult, "rest-collections-list.json");

  await stabilize();

  // ========================
  // Professional Summary
  // ========================
  console.log("\n" + "=".repeat(95));
  console.log("📊 REST API PERFORMANCE MATRIX");
  console.log("=".repeat(95));

  console.log(
    `| ${"Endpoint".padEnd(38)} | ${"Avg (ms)".padEnd(10)} | ${"p95 (ms)".padEnd(10)} | ${"RPS".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(38 + 10 + 10 + 12 + 6) + "|");

  for (const r of results) {
    const cleanName = r.name.replace("REST: ", "");
    console.log(
      `| ${cleanName.padEnd(38)} | ${r.avgMs.toFixed(3).padEnd(10)} | ${r.p95Ms.toFixed(3).padEnd(10)} | ${Math.round(r.rps).toLocaleString().padEnd(12)} |`,
    );
  }
  console.log("=".repeat(95));

  console.log(`\nTested with ${ITERATIONS} iterations @ concurrency ${CONCURRENCY}`);
  console.log("All benchmarks include full response body consumption.");
}, 600000);
