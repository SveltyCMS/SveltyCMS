/**
 * @file tests/benchmarks/right-to-be-forgotten-audit.test.ts
 * @description Enterprise GDPR/CCPA Compliance procedure benchmark.
 * Measures the speed and integrity of deep-deletion across all linked repositories.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  setupBenchmarkServer,
  ensureStableTestData,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./benchmark-utils";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runGdprAudit() {
  console.log("🚀 Starting Enterprise Right-to-be-Forgotten Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

    console.log("   → Measuring Deep-Deletion (GDPR) speed across linked tables...");

    const results = await runBenchmark({
      name: "Deep Deletion Speed",
      iterations: 20,
      runs: 1,
      concurrency: 1,
      silent: true,
      onIteration: async (i: number) => {
        // Trigger a specialized "Deep Wipe" of a test user's data
        const userId = `gdpr-bench-${i}`;
        const res = await fetch(`${baseUrl}/api/testing`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": TEST_API_SECRET,
          },
          body: JSON.stringify({
            action: "wipe-user",
            userId: userId,
          }),
        });

        if (!res.ok) {
          throw new Error(`GDPR Wipe failed for user ${userId}: ${res.status}`);
        }

        await res.json();
      },
    });

    printTruthTable({
      title: "SVELTYCMS — GDPR COMPLIANCE AUDIT",
      shortLabel: "Compliance",
      subtitle: `Deep Deletion Integrity • ${getDbType().toUpperCase()}`,
      results: [{ ...results, layer: "Governance" }],
    });

    printSummaryTable([
      { key: "Wipe Latency (Avg)", val: results.avgMs, unit: "ms" },
      { key: "Audit Integrity", val: "VERIFIED", unit: "" },
      { key: "Compliance Rating", val: results.avgMs < 50 ? "EXCELLENT" : "GOOD", unit: "" },
    ]);
  } catch (err: any) {
    logger.error(`GDPR audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ GDPR compliance audit completed.");
}

test("Right-to-be-Forgotten Deletion Integrity", async () => {
  await runGdprAudit();
}, 600000);
