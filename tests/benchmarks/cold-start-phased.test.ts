/**
 * @file tests/benchmarks/cold-start-phased.test.ts
 * @description Benchmark to measure "Cold Start" latency with Phased Initialization.
 */

import { describe, it } from "bun:test";
import { runSystemBoot } from "@src/databases/db-init";
import { systemStateStore } from "@src/stores/system/state.svelte";
import { get } from "svelte/store";

describe("Cold Start Benchmark (Phased)", () => {
  it("should measure phased boot latency", async () => {
    console.log("\n🚀 Starting Cold Start Phased Benchmark...");
    
    // We assume the adapter is already mocked or we use a real one
    // In our setup.ts, the adapter is usually mocked.
    // We need a real-ish adapter to measure actual boot time.
    const { SQLiteAdapter } = await import("@src/databases/sqlite/sqlite-adapter");
    const { createSchemaProxy } = await import("@src/databases/agnostic/schema-proxy");
    
    let dbAdapter = new SQLiteAdapter() as any;
    dbAdapter = createSchemaProxy(dbAdapter);
    
    // 🔌 Ensure adapter is connected before boot
    await dbAdapter.connect(":memory:");

    console.log("⏱️  Phase 1: Measuring CORE Boot (READY State)...");
    const t0 = performance.now();
    
    // Trigger boot
    void runSystemBoot(dbAdapter);
    
    // Poll for READY state
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const state = get(systemStateStore);
        // We look for READY or beyond
        if (state.overallState === "READY" || state.overallState === "WARMING" || state.overallState === "WARMED") {
          const d0 = performance.now() - t0;
          clearInterval(check);
          console.log(`✅ System reached READY state in ${d0.toFixed(2)}ms`);
          
          console.log("⏱️  Phase 2: Waiting for FULL Boot (WARMED State) in background...");
          const t1 = performance.now();
          
          const checkWarmed = setInterval(() => {
            const state = get(systemStateStore);
            if (state.overallState === "WARMED") {
              const d1 = performance.now() - t1;
              clearInterval(checkWarmed);
              console.log(`✨ System reached WARMED state in background after ${d1.toFixed(2)}ms`);
              console.log("--------------------------------------------------");
              console.log(`📈 CORE Boot Latency (READY): ${d0.toFixed(2)}ms`);
              console.log(`📉 Background Warming (WARM): ${d1.toFixed(2)}ms`);
              console.log(`📊 Total System Warmed: ${(d0 + d1).toFixed(2)}ms`);
              console.log("--------------------------------------------------");
              resolve();
            }
          }, 50);
        }
      }, 5);
    });
  }, 30000); // 30s timeout
});
