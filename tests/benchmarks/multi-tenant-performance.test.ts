/**
 * @file tests/benchmarks/multi-tenant-performance.test.ts
 * @description Enterprise-grade Multi-Tenant Performance & Isolation Benchmark
 */

import { test } from "bun:test";
import { runBenchmark } from "./benchmark-utils";
import { safeFetch } from "../integration/helpers/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";
const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";

const TENANT_COUNTS = [5, 15, 30]; // Test scaling behavior

async function provisionTenants(count: number) {
  console.log(`📡 Provisioning ${count} test tenants...`);
  const tenants: string[] = [];

  for (let i = 1; i <= count; i++) {
    const tenantId = `bench-tenant-${i}`;
    const res = await safeFetch(`${API_BASE_URL}/api/testing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-secret": TEST_API_SECRET,
      },
      body: JSON.stringify({
        action: "create-tenant",
        tenantId,
        name: `Benchmark Tenant ${i}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create tenant ${tenantId}: ${res.status}`);
    }
    tenants.push(tenantId);
  }
  return tenants;
}

test("Multi-Tenant Performance & Isolation Benchmark", async () => {
  console.log("🚀 Starting Enterprise Multi-Tenant Performance Benchmark...\n");

  const results: any = {};

  for (const tenantCount of TENANT_COUNTS) {
    console.log(`\n=== Testing with ${tenantCount} tenants ===`);

    const tenants = await provisionTenants(tenantCount);

    // 1. Scoped Collection Listing (Primary Latency Test)
    const listResult = await runBenchmark({
      name: `Multi-Tenant: Scoped Collection List (${tenantCount} tenants)`,
      iterations: 600,
      warmupIterations: 80,
      concurrency: 12,
      onIteration: async (i) => {
        const tenantId = tenants[i % tenants.length];
        const res = await safeFetch(`${API_BASE_URL}/api/collections`, {
          headers: {
            "x-test-secret": TEST_API_SECRET,
            "x-tenant-id": tenantId,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for tenant ${tenantId}`);
        await res.text(); // consume body
      },
    });

    results[`list-${tenantCount}`] = listResult;

    // 2. Cross-Tenant Isolation Test (Security + Correctness)
    console.log(`🔒 Testing cross-tenant isolation for ${tenantCount} tenants...`);
    let isolationFailures = 0;

    for (let i = 0; i < 50; i++) {
      const tenantA = tenants[i % tenants.length];

      const res = await safeFetch(`${API_BASE_URL}/api/collections`, {
        headers: {
          "x-test-secret": TEST_API_SECRET,
          "x-tenant-id": tenantA,
        },
      });

      const data = await res.json();
      // Ensure only collections belonging to tenantA (or global ones with no tenantId) are returned
      const leaked = data.data?.some((col: any) => col.tenantId && col.tenantId !== tenantA);

      if (leaked) {
        console.error(`Leak detected! Tenant ${tenantA} saw data from another tenant.`);
        isolationFailures++;
      }
    }

    console.log(`Isolation check: ${50 - isolationFailures}/50 successful`);
    results[`isolation-${tenantCount}`] = {
      successRate: (50 - isolationFailures) / 50,
      failures: isolationFailures,
    };

    // 3. Memory Growth Check
    const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
    // Force some activity across many tenants to check for cache bloat
    await Promise.all(
      tenants.map((t) =>
        safeFetch(`${API_BASE_URL}/api/collections`, {
          headers: { "x-test-secret": TEST_API_SECRET, "x-tenant-id": t },
        }),
      ),
    );
    const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
    const growth = memAfter - memBefore;

    console.log(`Memory growth with ${tenantCount} tenants: ${growth.toFixed(2)} MB`);
    results[`memory-growth-${tenantCount}`] = growth;
  }

  // Export combined results
  const finalResult = {
    name: "Multi-Tenant Performance & Isolation",
    timestamp: new Date().toISOString(),
    results,
  };

  // Custom export since it's a multi-metric test
  const dir = process.env.RESULTS_DIR || "tests/benchmarks/results";
  const fs = require("node:fs");
  const path = require("node:path");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "multi-tenant-performance.json"),
    JSON.stringify(finalResult, null, 2),
  );

  console.log("\n✅ Multi-Tenant benchmark suite completed.");
}, 450000); // 7.5 minute timeout
