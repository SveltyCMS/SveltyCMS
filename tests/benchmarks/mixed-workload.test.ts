/**
 * @file tests/benchmarks/mixed-workload.test.ts
 * @description Realistic mixed production workload benchmark (60% Read / 20% Write / 15% GraphQL / 5% Media).
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { safeFetch, waitForServer, getApiBaseUrl } from "../integration/helpers/server";

const API_BASE_URL = process.env.API_BASE_URL || getApiBaseUrl();

export async function runMixedWorkloadBenchmark() {
  console.log("🚀 Starting Realistic Mixed Workload Benchmark...\n");

  await waitForServer();

  const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";
  const authHeaders = {
    "Content-Type": "application/json",
    "x-test-secret": TEST_API_SECRET,
    "x-test-mode": "true",
  };

  // Discover a good target collection
  const collectionsRes = await safeFetch(`${API_BASE_URL}/api/collections`, {
    headers: authHeaders,
  });
  if (!collectionsRes.ok) throw new Error("Failed to fetch collections");

  const collections = (await collectionsRes.json()).data || [];
  const targetCollection =
    collections.find(
      (c: any) =>
        c.name?.toLowerCase().includes("post") || c.name?.toLowerCase().includes("article"),
    ) || collections[0];

  if (!targetCollection) throw new Error("No collections available for mixed workload");

  console.log(`📌 Using collection: ${targetCollection.name || targetCollection._id} for writes`);

  const result = await runBenchmark({
    name: "Mixed Workload (60% R / 20% W / 15% GQL / 5% Media)",
    iterations: 2000,
    warmupIterations: 200,
    concurrency: 28,
    onIteration: async (i: number) => {
      const roll = Math.random() * 100;

      if (roll < 60) {
        // Read - List with limit
        await safeFetch(`${API_BASE_URL}/api/collections/${targetCollection._id}?limit=15`, {
          headers: authHeaders,
        });
      } else if (roll < 80) {
        // Write - Create
        const res = await safeFetch(`${API_BASE_URL}/api/collections/${targetCollection._id}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            title: `Mixed workload post ${i}`,
            content: "Benchmark content",
            status: "draft",
          }),
        });
        if (!res.ok) throw new Error(`Write failed: ${res.status}`);
      } else if (roll < 95) {
        // GraphQL - simple query
        await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: `query { me { _id username role } }`,
          }),
        });
      } else {
        // Media
        await safeFetch(`${API_BASE_URL}/api/media?limit=8`, { headers: authHeaders });
      }
    },
    silent: true,
  });

  console.log("\n" + "=".repeat(95));
  console.log("📊 MIXED WORKLOAD PERFORMANCE SUMMARY");
  console.log("=".repeat(95));

  const table = [
    { Metric: "Average Latency", Value: `${result.avgMs.toFixed(3)} ms` },
    { Metric: "p95 Latency", Value: `${result.p95Ms.toFixed(3)} ms` },
    { Metric: "Throughput", Value: `${result.rps.toFixed(1)} requests/sec` },
    { Metric: "Iterations", Value: result.iterations.toString() },
  ];

  console.table(table);
  console.log("=".repeat(95) + "\n");

  exportResult(result);
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Realistic Mixed Workload Benchmark", async () => {
    await runMixedWorkloadBenchmark();
  }, 900000);
}
