/**
 * @file tests/benchmarks/mixed-workload.test.ts
 * @description Realistic mixed production workload benchmark (Read-heavy with writes, GraphQL & Media).
 * Measures overall system behavior under representative traffic patterns.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { safeFetch } from "../integration/helpers/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";
const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";

const authHeaders = {
  "Content-Type": "application/json",
  "x-test-secret": TEST_API_SECRET,
};

test("Realistic Mixed Workload Benchmark (60% Read / 20% Write / 15% GraphQL / 5% Media)", async () => {
  console.log("🚀 Starting Realistic Mixed Workload Benchmark...\n");

  // Pre-warm data and discover collections
  console.log("🔧 Warming up data and discovering collections...");
  const collectionsRes = await safeFetch(`${API_BASE_URL}/api/collections`, {
    headers: authHeaders,
  });
  if (!collectionsRes.ok) throw new Error("Failed to fetch collections");

  const collections = (await collectionsRes.json()).data || [];
  if (collections.length === 0) throw new Error("No collections available for benchmark");

  const targetCollection =
    collections.find((c: any) => c.name?.toLowerCase() === "posts") || collections[0];
  console.log(`Using collection: ${targetCollection.name || targetCollection._id}`);

  // Pre-create sample entries so writes aren't always cold
  console.log("Pre-creating sample entries...");
  const sampleIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const res = await safeFetch(`${API_BASE_URL}/api/collections/${targetCollection._id}`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: `Warmup Post ${i}`,
        content: "Pre-warmed content for mixed workload benchmark.",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data?._id) sampleIds.push(data.data._id);
    }
  }

  const result = await runBenchmark({
    name: "Mixed Workload (60R/20W/15G/5M)",
    iterations: 1200,
    warmupIterations: 150,
    concurrency: 18, // realistic concurrent users
    runs: 2, // run twice for stability
    onIteration: async (i: number) => {
      const roll = Math.random() * 100;

      if (roll < 60) {
        // 60% — List / Read-heavy (most common in CMS)
        const res = await safeFetch(
          `${API_BASE_URL}/api/collections/${targetCollection._id}?limit=15`,
          {
            headers: authHeaders,
          },
        );
        if (!res.ok) throw new Error(`Read failed: ${res.status}`);
        await res.text();
      } else if (roll < 80) {
        // 20% — Writes (Create/Update)
        const isUpdate = Math.random() < 0.4 && sampleIds.length > 0;
        if (isUpdate) {
          const targetId = sampleIds[Math.floor(Math.random() * sampleIds.length)];
          const res = await safeFetch(
            `${API_BASE_URL}/api/collections/${targetCollection._id}/${targetId}`,
            {
              method: "PATCH",
              headers: authHeaders,
              body: JSON.stringify({ title: `Updated Post ${Date.now()}` }),
            },
          );
          if (!res.ok && res.status !== 404) throw new Error(`Update failed: ${res.status}`);
        } else {
          // Create
          const res = await safeFetch(`${API_BASE_URL}/api/collections/${targetCollection._id}`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              title: `Mixed Workload Post ${i}-${Date.now()}`,
              content: "Realistic mixed workload test content.",
            }),
          });
          if (!res.ok) throw new Error(`Create failed: ${res.status}`);
        }
      } else if (roll < 95) {
        // 15% — GraphQL queries
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: `query { me { username email role } }`,
          }),
        });
        if (!res.ok) throw new Error(`GraphQL failed: ${res.status}`);
        await res.text();
      } else {
        // 5% — Media operations (light)
        const res = await safeFetch(`${API_BASE_URL}/api/media?limit=8`, { headers: authHeaders });
        if (!res.ok) throw new Error(`Media endpoint failed: ${res.status}`);
        await res.text();
      }
    },
  });

  exportResult(result, "mixed-workload.json");

  console.log("\n" + "=".repeat(85));
  console.log("📊 MIXED WORKLOAD SUMMARY");
  console.log("=".repeat(85));
  console.log(`Total iterations : ${result.iterations}`);
  console.log(`Average latency  : ${result.avgMs.toFixed(3)} ms`);
  console.log(`p95 latency      : ${result.p95Ms.toFixed(3)} ms`);
  console.log(`Throughput       : ${result.rps.toFixed(1)} req/sec`);
  console.log(
    `Success rate     : ${((result.successCount / result.iterations) * 100).toFixed(2)}%`,
  );
  console.log("=".repeat(85));
}, 600000); // 10-minute timeout
