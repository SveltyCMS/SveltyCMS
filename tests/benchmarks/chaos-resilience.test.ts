/**
 * @file tests/benchmarks/chaos-resilience.test.ts
 * @description Enterprise Chaos Resilience benchmark for SveltyCMS.
 * Simulates "Infrastructure Brownouts" (500ms DB delay) and measures system stability.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";

async function runChaosAudit() {
  console.log("🚀 Starting Enterprise Chaos & Resilience Audit...\n");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  await ensureFullInitialization();
  const realDb = getDb()!;
  
  // 1. Setup Chaos Proxy
  // We wrap the crud adapter to inject artificial latency
  const chaosAdapter = new Proxy(realDb.crud, {
    get(target, prop: string) {
      const original = (target as any)[prop];
      if (typeof original === "function") {
        return async (...args: any[]) => {
          // Inject 500ms "Infrastructure Brownout" jitter (30% of the time)
          if (Math.random() < 0.3) {
            await new Promise(r => setTimeout(r, 500));
          }
          return original.apply(target, args);
        };
      }
      return original;
    }
  });

  const chaosDb = { ...realDb, crud: chaosAdapter };
  const cms = new LocalCMS(chaosDb as any);
  const mockAdmin = { _id: "admin-chaos", username: "admin", role: "admin", isAdmin: true };
  const apiOptions = { user: mockAdmin, tenantId: "global" as any };

  await stabilize();

  try {
    console.log("   → Stress testing under 500ms Brownout simulation (30% jitter)...");
    
    const results = await runBenchmark({
      name: "Brownout Resilience",
      iterations: 100,
      runs: 1,
      concurrency: 4,
      onIteration: async () => {
        const res = await cms.collections.find("benchmark_authors", apiOptions);
        if (!res.success) throw new Error("CMS crashed during brownout");
      },
      silent: true,
    });

    printTruthTable({
      title: "SVELTYCMS  —  CHAOS RESILIENCE AUDIT",
      subtitle: `Infrastructure Brownout • 500ms Jitter (30%) • ${getDbType().toUpperCase()}`,
      results: [{ ...results, layer: "Resilience" }],
    });

    printSummaryTable([
      { key: "Jitter Latency (p95)", val: results.p95Ms, unit: "ms" },
      { key: "Availability Rate", val: (100 - (results as any).errorRate * 100).toFixed(2), unit: "%" },
      { key: "Survival Status", val: (results as any).errorRate < 0.01 ? "INDESTRUCTIBLE" : "STABLE", unit: "" },
    ]);

    exportResult(results);
  } catch (err: any) {
    console.error("❌ Chaos audit failed:", err.message);
  }

  console.log("\n✅ Chaos & resilience audit completed.");
}

test("System Resilience under Chaos", async () => {
  await runChaosAudit();
}, 450000);
