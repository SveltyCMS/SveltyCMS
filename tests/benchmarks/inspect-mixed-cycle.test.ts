/**
 * @file tests/benchmarks/inspect-mixed-cycle.test.ts
 * @description Diagnostic: per-operation latency plus X-Cache / X-Svelty-Lane
 * attribution for the 10-operation MIX_CYCLE.
 * @summary Not a gate — seeds its own baseline, warms once, then prints three
 * measured cycles so lane routing can be eyeballed against the competitive
 * replica numbers. Asserts only that every operation succeeded.
 *
 * ### Features:
 * - Self-contained 200-row baseline burst (no reliance on a prior seed phase)
 * - One warm cycle, then three measured cycles of the mixed workload
 * - Prints the server-side lane time (`x-srv-dur`, off unless `SVELTY_SRV_DUR=1`)
 *   next to the client total, so lane cost is separable from transport cost
 * - Fails loudly if any operation returns a non-2xx status
 * - `try/finally` server teardown so a failed assertion cannot leak the server
 */

import { expect, test } from "vitest";
import { setupBenchmarkServer, benchmarkAuthHeaders } from "./modules/benchmark-utils";
import { seedHttpCollectionBurst } from "./modules/seed-burst";

interface CycleResult {
  op: string;
  ms: number;
  status: number;
  cache: string | null;
  lane: string | null;
  fetchMs?: number;
  bodyMs?: number;
  srv?: string | null;
  bytes?: number;
}

const SEED_COUNT = 200;
const MEASURED_CYCLES = 3;

/** 6 reads / 2 writes / 2 GraphQL — mirrors the competitive harness cycle. */
const MIX_CYCLE = [
  "findByIdRandom",
  "listFilterSort",
  "findByIdRandom",
  "create",
  "findByIdRandom",
  "update",
  "listLarge",
  "findByIdRandom",
  "graphql",
  "graphql",
];

test("Inspect MIX_CYCLE latency and X-Cache headers", async () => {
  process.env.SVELTY_SRV_DUR = "1";
  const serverInfo = await setupBenchmarkServer();
  const baseUrl = serverInfo.baseUrl;

  const headers: Record<string, string> = {
    ...benchmarkAuthHeaders(),
    "content-type": "application/json",
    "x-test-security": "true",
    connection: "keep-alive",
  };

  try {
    const collectionUrl = `${baseUrl}/api/collections/BenchmarkStable`;
    const filterQuery = encodeURIComponent(JSON.stringify({ status: "published" }));
    const listFilterUrl = `${collectionUrl}?limit=20&filter=${filterQuery}&sort=-count`;
    const listLargeUrl = `${collectionUrl}?limit=100&filter=${filterQuery}&sort=-count`;
    const gqlBody = JSON.stringify({
      query: "query { BenchmarkStable(pagination: { limit: 10 }) { _id title count } }",
    });

    const createdIds: string[] = [];
    await seedHttpCollectionBurst({
      url: collectionUrl,
      headers,
      count: SEED_COUNT,
      concurrency: 4,
      payloadAt: (i) => ({
        title: `Diag article ${i}`,
        slug: `diag-article-${i}`,
        status: i % 2 === 0 ? "published" : "draft",
        count: i * 5,
        publishDate: "2026-01-01T00:00:00.000Z",
        content: "Diagnostic content test",
      }),
      existing: createdIds,
    });

    const stableId = createdIds[0];
    let cursor = 0;

    const handlers: Record<string, () => Promise<CycleResult>> = {
      findByIdRandom: async () => {
        const t0 = performance.now();
        const randomIndex = Math.floor(Math.random() * createdIds.length);
        const targetId = createdIds[randomIndex] || stableId;
        const res = await fetch(`${collectionUrl}/${targetId}`, { headers });
        const t1 = performance.now();
        const buf = await res.arrayBuffer();
        const t2 = performance.now();
        return {
          op: "findByIdRandom",
          ms: t2 - t0,
          fetchMs: t1 - t0,
          bodyMs: t2 - t1,
          srv: res.headers.get("x-srv-dur"),
          bytes: buf.byteLength,
          status: res.status,
          cache: res.headers.get("x-cache"),
          lane: res.headers.get("x-svelty-lane"),
        };
      },
      listFilterSort: async () => {
        const t0 = performance.now();
        const res = await fetch(listFilterUrl, { headers });
        const t1 = performance.now();
        const buf = await res.arrayBuffer();
        const t2 = performance.now();
        return {
          op: "listFilterSort",
          ms: t2 - t0,
          fetchMs: t1 - t0,
          bodyMs: t2 - t1,
          srv: res.headers.get("x-srv-dur"),
          bytes: buf.byteLength,
          status: res.status,
          cache: res.headers.get("x-cache"),
          lane: res.headers.get("x-svelty-lane"),
        };
      },
      listLarge: async () => {
        const t0 = performance.now();
        const res = await fetch(listLargeUrl, { headers });
        const t1 = performance.now();
        const buf = await res.arrayBuffer();
        const t2 = performance.now();
        return {
          op: "listLarge",
          ms: t2 - t0,
          fetchMs: t1 - t0,
          bodyMs: t2 - t1,
          srv: res.headers.get("x-srv-dur"),
          bytes: buf.byteLength,
          status: res.status,
          cache: res.headers.get("x-cache"),
          lane: res.headers.get("x-svelty-lane"),
        };
      },
      create: async () => {
        const t0 = performance.now();
        const seq = cursor++;
        const payload = JSON.stringify({
          title: "Diag create",
          slug: `diag-create-${seq}`,
          status: "draft",
          count: 0,
          publishDate: "2026-01-01T00:00:00.000Z",
          content: "Diag content",
        });
        const res = await fetch(collectionUrl, { method: "POST", headers, body: payload });
        const buf = await res.arrayBuffer();
        return {
          op: "create",
          ms: performance.now() - t0,
          bytes: buf.byteLength,
          status: res.status,
          cache: res.headers.get("x-cache"),
          lane: res.headers.get("x-svelty-lane"),
        };
      },
      update: async () => {
        const t0 = performance.now();
        const randomIndex = Math.floor(Math.random() * createdIds.length);
        const targetId = createdIds[randomIndex] || stableId;
        const payload = JSON.stringify({ count: Math.floor(Math.random() * 1000) + 1 });
        const res = await fetch(`${collectionUrl}/${targetId}`, {
          method: "PATCH",
          headers,
          body: payload,
        });
        const buf = await res.arrayBuffer();
        return {
          op: "update",
          ms: performance.now() - t0,
          bytes: buf.byteLength,
          status: res.status,
          cache: res.headers.get("x-cache"),
          lane: res.headers.get("x-svelty-lane"),
        };
      },
      graphql: async () => {
        const t0 = performance.now();
        const res = await fetch(`${baseUrl}/api/graphql`, {
          method: "POST",
          headers,
          body: gqlBody,
        });
        const buf = await res.arrayBuffer();
        return {
          op: "graphql",
          ms: performance.now() - t0,
          bytes: buf.byteLength,
          status: res.status,
          cache: res.headers.get("x-cache"),
          lane: res.headers.get("x-svelty-lane"),
        };
      },
    };

    console.log("\n── WARMING CACHE (1 cycle) ──");
    for (const op of MIX_CYCLE) {
      const r = await handlers[op]();
      console.log(
        `[WARM] ${r.op.padEnd(16)}: ${r.ms.toFixed(2)}ms, status: ${r.status}, x-cache: ${r.cache}, lane: ${r.lane}`,
      );
    }

    const results: CycleResult[] = [];
    console.log(`\n── RUNNING MIXED CYCLE (${MEASURED_CYCLES} cycles) ──`);
    for (let cycle = 1; cycle <= MEASURED_CYCLES; cycle++) {
      console.log(`\n-- Cycle ${cycle} --`);
      for (const op of MIX_CYCLE) {
        const r = await handlers[op]();
        results.push(r);
        console.log(
          `[C${cycle}] ${r.op.padEnd(16)}: total ${r.ms.toFixed(2)}ms (fetch: ${r.fetchMs?.toFixed(2) ?? "N/A"}ms, body: ${r.bodyMs?.toFixed(2) ?? "N/A"}ms, srv: ${r.srv ?? "N/A"}ms, ${r.bytes}B), status: ${r.status}, x-cache: ${r.cache}, x-svelty-lane: ${r.lane}`,
        );
      }
    }

    // The workload is only interpretable if the baseline seeded and every
    // operation reached the app (a broken lane shows up as a 4xx/5xx here).
    expect(createdIds.length).toBeGreaterThan(0);
    expect(results).toHaveLength(MIX_CYCLE.length * MEASURED_CYCLES);
    expect(
      results.filter((r) => r.status < 200 || r.status >= 300).map((r) => `${r.op}:${r.status}`),
    ).toEqual([]);
  } finally {
    await serverInfo.stop();
  }
}, 30000);
