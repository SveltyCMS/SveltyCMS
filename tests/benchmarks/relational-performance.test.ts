/**
 * @file tests/benchmarks/relational-performance.test.ts
 * @description Professional benchmark for SveltyCMS Relational Queries and Population performance.
 * Tests GraphQL population (Depth 1, 2, & 3) and REST relational filtering.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { getApiBaseUrl, safeFetch } from "../integration/helpers/server";

const API_BASE_URL = getApiBaseUrl();
const POSTS_COLLECTION_ID = "00000000000000000000000000000002";

let authorsFieldName = "Authors_00000000";
let postsRelationField = "Posts"; // fallback

async function discoverRelationalFields() {
  console.log("🔍 Discovering relational field names via GraphQL introspection...");

  const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";

  const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
    },
    body: JSON.stringify({
      query: `
        {
          __schema {
            queryType { fields { name } }
            types {
              name
              fields { name }
            }
          }
        }
      `,
    }),
  });

  if (!res.ok) {
    console.warn("⚠️ Schema introspection failed. Using fallback field names.");
    return;
  }

  const { data } = await res.json();
  const queryFields = data?.__schema?.queryType?.fields || [];

  const authorMatch = queryFields.find((f: any) => f.name.startsWith("Authors_"));
  if (authorMatch) {
    authorsFieldName = authorMatch.name;
    const typeName = authorMatch.type?.name;
    const authorType = data?.__schema?.types?.find((t: any) => t.name === typeName);

    if (authorType) {
      const relationMatch = authorType.fields?.find((f: any) =>
        f.name.toLowerCase().includes("post"),
      );
      if (relationMatch) postsRelationField = relationMatch.name;
    }
  }

  console.log(
    `[Relational] Using → Authors: ${authorsFieldName} | Posts relation: ${postsRelationField}`,
  );
}

async function stabilize() {
  if (typeof Bun !== "undefined") Bun.gc(true);
  await new Promise((r) => setTimeout(r, 40));
}

function getMemoryMb() {
  const mem = process.memoryUsage();
  return (mem.heapUsed / 1024 / 1024).toFixed(2);
}

test("Relational Performance Suite (GraphQL Population + REST Filtering)", async () => {
  console.log("🚀 Starting Professional SveltyCMS Relational Performance Benchmark...\n");

  const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";
  const authHeaders = {
    "Content-Type": "application/json",
    "x-test-secret": TEST_API_SECRET,
  };

  // Discover correct field names once before measuring
  await discoverRelationalFields();
  await stabilize();

  const ITERATIONS = 600;
  const WARMUP = 80;

  const results: any[] = [];

  // 0. Baseline (Non-relational)
  console.log(`📊 Memory baseline: ${getMemoryMb()} MB`);
  console.log("🔍 Benchmarking Baseline fetch (Authors only)...");
  const baselineResult = await runBenchmark({
    name: "Relational: Baseline (No Population)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 6,
    onIteration: async () => {
      const res = await safeFetch(
        `${API_BASE_URL}/api/collections/00000000000000000000000000000001?limit=20`,
        {
          headers: authHeaders,
        },
      );
      await res.json();
    },
  });
  results.push(baselineResult);

  await stabilize();

  // 1. GraphQL Population - Depth 1 (Authors → Posts)
  console.log("📚 Benchmarking GraphQL Population (Depth 1)...");
  const populationResult = await runBenchmark({
    name: "Relational: GraphQL Population (Depth 1)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 6,
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          query: `query { ${authorsFieldName} { name ${postsRelationField} { title } } }`,
        }),
      });
      if (!res.ok) throw new Error(`GraphQL failed: ${res.status}`);
      const data = await res.json();
      if (!data.data?.[authorsFieldName]?.length) {
        throw new Error("No data returned from GraphQL population query");
      }
    },
  });
  results.push(populationResult);
  exportResult(populationResult, "relational-graphql-population.json");

  await stabilize();

  // 2. GraphQL Nested Population - Depth 2 (Authors -> Posts -> Author)
  console.log("📚 Benchmarking GraphQL Nested Population (Depth 2)...");
  const nestedResult = await runBenchmark({
    name: "Relational: GraphQL Nested (Depth 2)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 5,
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          query: `query { ${authorsFieldName} { name ${postsRelationField} { title author { name } } } }`,
        }),
      });
      if (!res.ok) throw new Error(`GraphQL nested failed: ${res.status}`);
      const data = await res.json();
      if (!data.data?.[authorsFieldName]?.length) {
        throw new Error("No data returned from nested GraphQL query");
      }
    },
  });
  results.push(nestedResult);
  exportResult(nestedResult, "relational-graphql-nested.json");

  await stabilize();

  // 3. GraphQL Extreme Population - Depth 3 (Authors -> Posts -> Author -> Posts)
  console.log("📚 Benchmarking GraphQL Extreme Population (Depth 3)...");
  console.log(`📊 Memory before Depth 3: ${getMemoryMb()} MB`);
  const extremeResult = await runBenchmark({
    name: "Relational: GraphQL Extreme (Depth 3)",
    iterations: Math.floor(ITERATIONS / 2),
    warmupIterations: Math.floor(WARMUP / 4),
    concurrency: 4,
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          query: `query { ${authorsFieldName} { name ${postsRelationField} { title author { name ${postsRelationField} { title } } } } }`,
        }),
      });
      if (!res.ok) throw new Error(`GraphQL depth-3 failed: ${res.status}`);
      const data = await res.json();
      if (!data.data?.[authorsFieldName]?.length) {
        throw new Error("No data returned from depth-3 GraphQL query");
      }
    },
  });
  console.log(`📊 Memory after Depth 3: ${getMemoryMb()} MB`);
  results.push(extremeResult);
  exportResult(extremeResult, "relational-graphql-extreme.json");

  await stabilize();

  // 4. REST Relational Filtering (via aggregation / dotted notation)
  console.log("🔍 Benchmarking REST Relational Search/Filter (Limit+Sort)...");
  const restResult = await runBenchmark({
    name: "Relational: REST Search (Dotted Filter)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 6,
    onIteration: async () => {
      const filter = JSON.stringify({
        "author.name": { $regex: "Author", $options: "i" },
      });

      const res = await safeFetch(
        `${API_BASE_URL}/api/collections/${POSTS_COLLECTION_ID}?filter=${encodeURIComponent(filter)}&limit=20&sort=title`,
        { headers: authHeaders },
      );

      if (!res.ok) throw new Error(`REST filter failed: ${res.status}`);
      const data = await res.json();
      if (!data.data?.length) {
        throw new Error("REST relational filter returned no results");
      }
    },
  });
  results.push(restResult);
  exportResult(restResult, "relational-rest-search.json");

  // ========================
  // Professional Summary Matrix
  // ========================
  console.log("\n" + "=".repeat(105));
  console.log("📊 RELATIONAL QUERIES PERFORMANCE MATRIX");
  console.log("=".repeat(105));

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(
    `| ${pad("Query Type", 42)} | ${pad("Avg (ms)", 10)} | ${pad("p95 (ms)", 10)} | ${pad("p99 (ms)", 10)} | ${pad("RPS", 12)} |`,
  );
  console.log("|" + "-".repeat(103) + "|");

  for (const r of results) {
    const cleanName = r.name.replace("Relational: ", "");
    console.log(
      `| ${pad(cleanName, 42)} | ${pad(r.avgMs.toFixed(3), 10)} | ${pad(r.p95Ms.toFixed(3), 10)} | ${pad(r.p99Ms.toFixed(3), 10)} | ${pad(Math.round(r.rps).toLocaleString(), 12)} |`,
    );
  }
  console.log("=".repeat(105));

  console.log(`\nFinal Memory State: ${getMemoryMb()} MB`);
  console.log(`Tested with high-precision statistical analysis and forced GC stabilization.`);
}, 600000);
