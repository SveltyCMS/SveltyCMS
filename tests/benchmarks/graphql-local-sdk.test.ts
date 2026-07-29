/**
 * @file tests/benchmarks/graphql-local-sdk.test.ts
 * @description Local SDK query performance (zero HTTP, pure in-process)
 *
 * Initializes SQLite directly, no HTTP server. Measures the true floor
 * for +page.server.ts, hooks, and actions.
 *
 * ### Expected: <0.5ms warm, <3ms cold
 */

import { test, getDbType } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

test("Local SDK Query Performance (zero HTTP, pure in-process)", async () => {
  console.log("\n🎯 Local SDK Performance (zero HTTP, pure in-process)\n");

  // Initialize DB directly — no HTTP server
  const { loadAdapters, initializeDatabase } = await import("@src/databases/db-init");
  const adapter = await loadAdapters({
    DB_TYPE: "sqlite",
    DB_NAME: "local_sdk_bench.sqlite",
  });
  if (!adapter) {
    console.log("   ⚠️ No adapter — skipping\n");
    return;
  }
  await initializeDatabase(adapter);

  const { LocalCMS } = await import("@src/services/sdk");
  const cms = new LocalCMS(adapter);

  // Cold
  console.log("   1. Cold health check...");
  const t0 = performance.now();
  const h1 = await cms.system.getHealth();
  const cold = performance.now() - t0;
  console.log(`      ${cold.toFixed(2)}ms — ${h1?.overallStatus || "N/A"}`);

  // Warm
  console.log("\n   2. Warm health check...");
  const t1 = performance.now();
  await cms.system.getHealth();
  const warm = performance.now() - t1;

  // Warm 2
  const t2 = performance.now();
  await cms.system.getHealth();
  const warm2 = performance.now() - t2;
  console.log(`      Run 1: ${warm.toFixed(3)}ms  Run 2: ${warm2.toFixed(3)}ms`);

  // Settings read
  console.log("\n   3. Settings read...");
  const t3 = performance.now();
  await cms.system.settings.getAll({ tenantId: "global" as any });
  const settings = performance.now() - t3;
  console.log(`      ${settings.toFixed(2)}ms`);

  const speedup = cold / Math.max(warm, 0.001);

  console.log(`\n   📊 Results (Local SDK, ${getDbType().toUpperCase()}):`);
  console.log(`      Cold:    ${cold.toFixed(2)}ms`);
  console.log(`      Warm:    ${warm.toFixed(3)}ms (${speedup.toFixed(1)}x)`);
  console.log(`      Settings: ${settings.toFixed(2)}ms`);
  console.log(`   ✅ Sub-1ms warm:  ${warm < 1 ? "YES" : `No (${warm.toFixed(3)}ms)`}`);
  console.log(`   ✅ Sub-0.5ms:     ${warm < 0.5 ? "YES" : `No (${warm.toFixed(3)}ms)`}\n`);
}, 60000);
