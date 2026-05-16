/**
 * @file tests/benchmarks/auth-performance.test.ts
 * @description Enterprise authentication benchmark for SveltyCMS.
 * Measures session validation, RBAC resolution, and middleware overhead.
 */

import {
  test,
  runBenchmark,
  exportResult,
  stabilize,
  setupBenchmarkServer,
  ensureStableTestData,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
  getDbType
} from "./benchmark-utils";
import "../unit/setup.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runAuthAudit() {
  console.log(`🚀 Starting Enterprise Auth & RBAC Audit (${getDbType().toUpperCase()})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    const { ensureFullInitialization, getDb } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db?.auth) throw new Error("Auth system not initialized");

    await ensureStableTestData();

    // SEED: Create Test User & Session
    console.log("   → Seeding Auth benchmark data...");
    const userRes = await db.auth.createUser({
      email: `bench-${Math.random().toString(36).slice(2)}@test.com`,
      password: "Password123!",
      role: "admin",
      username: "benchmark-user",
      tenantId: "global" as any,
    });

    if (!userRes.success) throw new Error("Failed to create bench user");
    const testUser = userRes.data;
    console.log("     - Test User created:", testUser?._id);

    const sessionRes = await db.auth.createSession({
      user_id: testUser._id,
      tenantId: "global" as any,
      expires: new Date(Date.now() + 86400000).toISOString() as any,
    });

    if (!sessionRes.success) {
      console.error("Session creation failed. sessionRes:", JSON.stringify(sessionRes, null, 2));
      throw new Error("Failed to create bench session");
    }
    const testSessionId = (sessionRes.data as any)._id || sessionRes.data;

    await stabilize(1000);

    const results = [];

    // 1. Internal Session Validation (SDK Layer)
    console.log("   → Measuring SDK Session Validation...");
    const sdkResult = await runBenchmark({
      name: "SDK Session Validation",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await db.auth!.validateSession(testSessionId as any);
        if (!res.success) throw new Error("Session validation failed");
      },
    });
    results.push({ ...sdkResult, layer: "SDK", shortLabel: "SDK-Val" });

    // 2. Full HTTP Middleware Auth (E2E Layer)
    console.log("   → Measuring HTTP Middleware Auth (8c)...");
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
        const res = await fetch(`${baseUrl}/api/user/me`, {
          headers: {
            Cookie: `session=${testSessionId}`,
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
          },
        });
        if (!res.ok) throw new Error(`HTTP Auth failed: ${res.status}`);
        await res.json();
      },
    });
    results.push({ ...httpResult, layer: "HTTP", shortLabel: "HTTP-Auth" });

    printTruthTable({
      title: "SVELTYCMS — AUTHENTICATION TELEMETRY",
      shortLabel: "Auth",
      subtitle: `Session Verification • RBAC Resolution • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "SDK Validation Latency", val: sdkResult.avgMs, unit: "ms" },
      { key: "HTTP Pipeline Latency", val: httpResult.avgMs, unit: "ms" },
      { key: "Peak Auth RPS", val: Math.round(httpResult.rps), unit: "req/s" },
      { key: "Auth Memory RSS Δ", val: (httpResult.rssDelta || 0).toFixed(2), unit: "MB" },
    ]);

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Auth audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Authentication audit completed.");
}

test("Auth & RBAC Enterprise Suite", async () => {
  await runAuthAudit();
}, 450000);
