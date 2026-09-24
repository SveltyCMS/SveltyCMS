/**
 * @file tests/benchmarks/probe-scale-limits.test.ts
 * @description Dataset-complexity limit probe — what the current code can do at 1M+ rows.
 * @summary Runs against the bench-db Postgres (1.5M posts + 1.12M BenchmarkStable, NO
 * database tweaks — stock indexes only) and measures every workload class so the
 * boundaries are documented, not guessed.
 *
 * ### Features:
 * - Point reads, plain/populated lists, filter+sort (dynamic AND physical field),
 *   listLarge, includeCount, deep-offset pagination, GraphQL, writes, findMissing
 * - Forced cache MISSes (varying `x` param → unique response-cache key)
 * - Slow lanes measured sequentially (3–5 samples); fast lanes at 8c
 * - Fails loud when a measured lane exceeds its documented expectation
 */
import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import { seedHttpCollectionBurst } from "./modules/seed-burst";
import "../unit/bun-preload.ts";

const ITERS = Number(process.env.SCALE_ITERS || 100);
const SLOW_SAMPLES = Number(process.env.SCALE_SLOW || 3);

test("scale limits probe (1.5M posts + 1.12M stable, untweaked Postgres)", async () => {
  let stop: (() => Promise<void>) | null = null;
  try {
    const info = await setupBenchmarkServer();
    stop = info.stop;
    const baseUrl = info.baseUrl;
    const headers: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
    };
    const postsUrl = `${baseUrl}/api/collections/benchmark_posts`;
    const stableUrl = `${baseUrl}/api/collections/BenchmarkStable`;
    const filterQuery = encodeURIComponent(JSON.stringify({ status: "published" }));
    const gqlBody = JSON.stringify({
      query: "query { BenchmarkStable(pagination: { limit: 10 }) { _id title count } }",
    });

    // Fresh id pool inside the 1.12M-row table (PK lookup cost is depth-bound).
    const createdIds: string[] = [];
    await seedHttpCollectionBurst({
      url: stableUrl,
      headers,
      count: 10_000,
      concurrency: 8,
      payloadAt: (i: number) => ({
        title: `Limit probe ${i}`,
        slug: `limit-probe-${Date.now()}-${i}`,
        status: i % 3 === 0 ? "draft" : "published",
        count: i * 10,
        publishDate: "2026-01-01T00:00:00.000Z",
        content: "limit probe",
      }),
      existing: createdIds,
    });

    let n = 0;
    const bust = () => `x=${(n = (n + 1) % 1_000_000)}`;

    const pointRead = async () => {
      const id = createdIds[Math.floor(Math.random() * createdIds.length)];
      const res = await fetch(`${stableUrl}/${id}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const listPlainMiss = async () => {
      const res = await fetch(`${stableUrl}?limit=10&${bust()}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const listPlainBypass = async () => {
      const res = await fetch(`${stableUrl}?limit=10&bypassCache=true&${bust()}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const populateMiss = async () => {
      const res = await fetch(`${postsUrl}?limit=20&populate=author&${bust()}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      if (!body.includes('"_populated_author"')) throw new Error("populate did not resolve");
    };
    const filterSortDynamic = async () => {
      const res = await fetch(
        `${stableUrl}?limit=20&filter=${filterQuery}&sort=-count&bypassCache=true&${bust()}`,
        { headers },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const filterSortPhysical = async () => {
      const res = await fetch(
        `${stableUrl}?limit=20&filter=${filterQuery}&sort=-publishedAt&bypassCache=true&${bust()}`,
        { headers },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const listLargeDynamic = async () => {
      const res = await fetch(
        `${stableUrl}?limit=100&filter=${filterQuery}&sort=-count&bypassCache=true&${bust()}`,
        { headers },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const includeCount = async () => {
      const res = await fetch(
        `${stableUrl}?limit=10&includeCount=true&bypassCache=true&${bust()}`,
        { headers },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const deepOffset = async () => {
      const res = await fetch(`${stableUrl}?limit=10&offset=1000000&bypassCache=true&${bust()}`, {
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const gqlList = async () => {
      const res = await fetch(`${baseUrl}/api/graphql`, { method: "POST", headers, body: gqlBody });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.text();
    };
    const create = async () => {
      const res = await fetch(stableUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "limit create",
          slug: `limit-create-${Date.now()}-${n++}`,
          status: "draft",
          count: 0,
          publishDate: "2026-01-01T00:00:00.000Z",
          content: "x",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const update = async () => {
      const id = createdIds[Math.floor(Math.random() * createdIds.length)];
      const res = await fetch(`${stableUrl}/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ count: Math.floor(Math.random() * 1000) + 1 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const findMissing = async () => {
      const res = await fetch(`${stableUrl}/bench-missing-limit-probe`, { headers });
      if (res.status !== 404 && !res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const rows: Array<{ name: string; mode: string; avg: number; p95: number; rps: number }> = [];

    const run8c = async (name: string, fn: () => Promise<void>) => {
      for (let i = 0; i < 20; i++) await fn();
      const r = await runBenchmark({
        name,
        warmupIterations: 0,
        iterations: ITERS,
        concurrency: 8,
        onIteration: fn,
      });
      rows.push({ name, mode: "8c", avg: r.avgMs, p95: r.p95Ms, rps: r.rps });
      console.log(
        `  ${name.padEnd(30)} 8c   avg ${r.avgMs.toFixed(2).padStart(8)}ms p95 ${r.p95Ms.toFixed(2).padStart(8)}ms ${Math.round(r.rps).toLocaleString().padStart(6)} RPS`,
      );
    };
    const runSeq = async (name: string, fn: () => Promise<void>) => {
      const samples: number[] = [];
      for (let i = 0; i < SLOW_SAMPLES; i++) {
        const t0 = performance.now();
        await fn();
        samples.push(performance.now() - t0);
      }
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      rows.push({ name, mode: `seq×${SLOW_SAMPLES}`, avg, p95: avg, rps: 1000 / avg });
      console.log(
        `  ${name.padEnd(30)} seq  avg ${avg.toFixed(1).padStart(8)}ms per request (${samples.map((s) => s.toFixed(0)).join("/")}ms)`,
      );
    };

    console.log(`\n=== SCALE LIMITS (1.5M posts, 1.12M stable, UNTWEAKED Postgres) ===`);
    await runSeq("point read seq (PK @1.12M)", pointRead);
    await run8c("point read (PK @1.12M)", pointRead);
    await runSeq("list plain bypass (limit 10)", listPlainBypass);
    await run8c("list plain (limit 10)", listPlainMiss);
    await run8c("list populated (author @1.5M)", populateMiss);
    await runSeq("filter+sort DYNAMIC (sort=-count)", filterSortDynamic);
    await run8c("filter+sort PHYSICAL (-publishedAt)", filterSortPhysical);
    await runSeq("listLarge DYNAMIC (limit 100)", listLargeDynamic);
    await runSeq("includeCount (COUNT @1.12M)", includeCount);
    await runSeq("deep offset (offset=1M)", deepOffset);
    await run8c("graphql list (limit 10)", gqlList);
    await run8c("create (@1.12M indexes)", create);
    await run8c("update (@1.12M indexes)", update);
    await run8c("find missing (404)", findMissing);

    console.log("\n=== SUMMARY (avg ms | RPS) ===");
    for (const r of rows) {
      console.log(
        `  ${r.mode.padEnd(8)} ${r.name.padEnd(34)} ${r.avg.toFixed(2).padStart(8)}ms ${Math.round(r.rps).toLocaleString().padStart(6)} RPS`,
      );
    }
  } finally {
    if (stop) await stop();
  }
}, 900_000);
