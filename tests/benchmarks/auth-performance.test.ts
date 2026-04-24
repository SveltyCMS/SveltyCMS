/**
 * @file tests/benchmarks/auth-performance.test.ts
 * @description Enterprise authentication benchmark for SveltyCMS.
 * Measures session validation, RBAC resolution, and middleware overhead.
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;
let testSessionId: string;
let testUser: any;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  const { ensureFullInitialization, getDb } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db?.auth) throw new Error("Auth system not initialized");

  // SEED: Create Test User & Session
  console.log("📊 Seeding Auth benchmark data...");
  const userRes = await db.auth.createUser({
    email: `bench-${Math.random().toString(36).slice(2)}@test.com`,
    password: "Password123!",
    role: "admin",
    username: "benchmark-user",
    tenantId: "global" as any,
  });

  if (!userRes.success) throw new Error("Failed to create bench user");
  testUser = userRes.data;

  const sessionRes = await db.auth.createSession({
    user_id: testUser._id,
    tenantId: "global" as any,
    expires: new Date(Date.now() + 86400000).toISOString() as any,
  });

  if (!sessionRes.success) throw new Error("Failed to create bench session");
  testSessionId = (sessionRes.data as any)._id || sessionRes.data;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

async function runAuthAudit() {
  console.log("🚀 Starting Enterprise Auth & RBAC Audit...\n");

  const { getDb } = await import("@src/databases/db");
  const db = getDb();
  const auth = db!.auth!;

  await stabilize();

  const ITERATIONS = 500;
  const RUNS = 2;
  const allResults: any[] = [];

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Internal Session Validation (SDK Layer)
    console.log("   → Measuring SDK Session Validation...");
    const sdkResult = await runBenchmark({
      name: "SDK Session Validation",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await auth.validateSession(testSessionId as any);
        if (!res.success) throw new Error("Session validation failed");
      },
    });
    allResults.push({ ...sdkResult, layer: "SDK" });

    // 2. Full HTTP Middleware Auth (E2E Layer)
    console.log("   → Measuring HTTP Middleware Auth (8c)...");
    const httpResult = await runBenchmark({
      name: "HTTP Auth Pipeline @ 8c",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${apiBaseUrl}/api/user/me`, {
          headers: {
            Cookie: `session=${testSessionId}`,
            "x-test-mode": "true",
          },
        });
        if (!res.ok) throw new Error(`HTTP Auth failed: ${res.status}`);
        await res.json();
      },
    });
    allResults.push({ ...httpResult, layer: "HTTP" });

    printTruthTable({
      title: "SVELTYCMS  —  AUTHENTICATION TELEMETRY",
      subtitle: "Session Verification • RBAC Resolution • Middleware Tax",
      results: allResults,
    });

    printSummaryTable([
      { key: "SDK Validation Latency", val: sdkResult.avgMs, unit: "ms" },
      { key: "HTTP Pipeline Latency", val: httpResult.avgMs, unit: "ms" },
      { key: "Peak Auth RPS", val: Math.round(httpResult.rps), unit: "req/s" },
      { key: "Auth Memory RSS Δ", val: (httpResult.rssDelta || 0).toFixed(2), unit: "MB" },
    ]);

    for (const r of allResults) exportResult(r);
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Authentication audit completed.");
}

test("Auth & RBAC Enterprise Suite", async () => {
  await runAuthAudit();
}, 450000);
