/**
 * @file tests/benchmarks/openapi-cache-perf.ts
 * @description Retesting OpenAPI performance enhancements (Caching & Generation).
 */

import { performance } from "node:perf_hooks";

const API_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";
const TEST_SECRET = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

async function measureOpenApi() {
  console.log(`🚀 Retesting OpenAPI Performance at ${API_URL}...`);

  // 1. Initial Load (Likely Cache Miss or Cold Start)
  const start1 = performance.now();
  const res1 = await fetch(`${API_URL}/api/openapi.json`);
  const end1 = performance.now();
  if (!res1.ok) throw new Error(`Initial fetch failed: ${res1.status}`);
  console.log(`⏱️ Initial Load (Miss/Cold): ${(end1 - start1).toFixed(2)}ms`);

  // 2. Subsequent Load (Should be L1/L2 Cache Hit)
  const iterations = 5;
  let totalHitTime = 0;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fetch(`${API_URL}/api/openapi.json`);
    totalHitTime += performance.now() - start;
  }
  console.log(
    `⏱️ Cached Load (Average of ${iterations}): ${(totalHitTime / iterations).toFixed(2)}ms`,
  );

  // 3. Verify Invalidation
  console.log("🔄 Triggering Cache Invalidation via Reinitialization...");
  const reinitRes = await fetch(`${API_URL}/api/testing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-secret": TEST_SECRET },
    body: JSON.stringify({ action: "reinitialize" }),
  });
  if (!reinitRes.ok) throw new Error("Reinitialization failed");

  // 4. Fetch after invalidation (Should be a Miss)
  const start2 = performance.now();
  await fetch(`${API_URL}/api/openapi.json`);
  const end2 = performance.now();
  console.log(`⏱️ Post-Invalidation Load (Miss): ${(end2 - start2).toFixed(2)}ms`);

  console.log("\n✅ Retest Complete.");
}

measureOpenApi().catch(console.error);
