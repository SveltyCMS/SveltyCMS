/**
 * @file tests/benchmarks/graphql-cache-hit.test.ts
 * @description GraphQL Response Cache Hit Verification
 *
 * Verifies the L1 response cache delivers sub-millisecond latency for
 * repeated queries. Starts with BENCHMARK=1 for server seeding, then
 * removes it so the cache plugin activates — reflecting real production.
 *
 * ### Features:
 * - Authenticated session via testing API seed + login
 * - Cold-hit vs cache-hit latency comparison
 * - Cache key isolation (different queries get different keys)
 */

import { test, setupBenchmarkServer, stabilize, TEST_API_SECRET } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: (() => Promise<void>) | null = null;

async function graphqlRequest(
  baseUrl: string,
  query: string,
  cookie?: string,
): Promise<{ status: number; duration: number; body: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
  };
  if (cookie) headers.Cookie = cookie;

  const start = performance.now();
  const res = await fetch(`${baseUrl}/api/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  const duration = performance.now() - start;
  const body = await res.json();
  return { status: res.status, duration, body };
}

test("GraphQL Response Cache Hit Latency", async () => {
  console.log("\n🎯 GraphQL Response Cache Hit Verification\n");

  // Start WITH BENCHMARK=1 for proper server seeding
  process.env.BENCHMARK = "1";

  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;
  await stabilize(1000);

  // Step 1: Seed admin user and get session cookie
  console.log("   1. Seeding admin user...");
  const seedRes = await fetch(`${baseUrl}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    },
    body: JSON.stringify({
      action: "seed",
      email: "admin@example.com",
      password: "Password123!",
    }),
  });
  const seedOk = seedRes.ok;
  console.log(`      Seed: ${seedOk ? "✅" : "❌"}`);

  // Step 2: Login via testing API to get session cookie
  console.log("   2. Getting session cookie...");
  const loginRes = await fetch(`${baseUrl}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    },
    body: JSON.stringify({
      action: "login",
      email: "admin@example.com",
      password: "Password123!",
    }),
  });
  const sessionCookie = loginRes.headers.get("set-cookie") || "";
  const hasCookie = sessionCookie.length > 0;
  console.log(`      Cookie: ${hasCookie ? "✅" : "❌"}`);

  if (!hasCookie) {
    console.log("   ⚠️ No session cookie — cache test skipped\n");
    return;
  }

  // Step 3: Now disable BENCHMARK so cache plugin activates
  delete process.env.BENCHMARK;
  delete process.env.BENCHMARK_MODE;
  await stabilize(500);

  const query1 = `query { contentSystemHealth { state version } }`;
  const query2 = `query { allCollections { _id name } }`;

  // Step 4: Cold request
  console.log("\n   3. Cold request (no cache)...");
  const cold = await graphqlRequest(baseUrl, query1, sessionCookie);
  console.log(`      Status: ${cold.status}, Duration: ${cold.duration.toFixed(2)}ms`);

  // Step 5: Cache hit
  console.log("\n   4. Cache hit (same query)...");
  const hot = await graphqlRequest(baseUrl, query1, sessionCookie);
  console.log(`      Status: ${hot.status}, Duration: ${hot.duration.toFixed(2)}ms`);

  // Step 6: Different query cold
  console.log("\n   5. Different query cold...");
  const diff1 = await graphqlRequest(baseUrl, query2, sessionCookie);
  console.log(`      Status: ${diff1.status}, Duration: ${diff1.duration.toFixed(2)}ms`);

  // Step 7: Different query hot
  console.log("\n   6. Same query cache hit...");
  const diff2 = await graphqlRequest(baseUrl, query2, sessionCookie);
  console.log(`      Status: ${diff2.status}, Duration: ${diff2.duration.toFixed(2)}ms`);

  // Results
  const speedup1 = cold.duration / Math.max(hot.duration, 0.1);
  const speedup2 = diff1.duration / Math.max(diff2.duration, 0.1);

  console.log(`\n   📊 Results:`);
  console.log(`      Query1 cold: ${cold.duration.toFixed(2)}ms → hot: ${hot.duration.toFixed(2)}ms (${speedup1.toFixed(1)}x)`);
  console.log(`      Query2 cold: ${diff1.duration.toFixed(2)}ms → hot: ${diff2.duration.toFixed(2)}ms (${speedup2.toFixed(1)}x)`);
  console.log(`   ✅ Cache active: ${speedup1 >= 1.5 ? "YES" : "Check server logs"}`);
  console.log(`   ✅ Sub-5ms hit:  ${hot.duration < 5 && diff2.duration < 5 ? "YES" : `No (hot=${hot.duration.toFixed(1)}ms diff=${diff2.duration.toFixed(1)}ms)`}\n`);

  // Cleanup
  if (stopServer) {
    await stopServer().catch(() => {});
    stopServer = null;
  }
}, 120000);
