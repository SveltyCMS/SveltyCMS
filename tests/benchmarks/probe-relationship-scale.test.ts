/**
 * @file tests/benchmarks/probe-relationship-scale.test.ts
 * @description Relationship + sort scale probe — 500k relational docs on PostgreSQL.
 * @summary Seeds 2k authors + 500k posts (author relation), then measures populated
 * list HIT/MISS and filter+sort MISS on the existing 1.1M-row BenchmarkStable.
 *
 * ### Features:
 * - Populated list (`populate=author`) at 500k docs — HIT (cached) and
 *   forced-MISS (varying offset → unique cache key → real query every time)
 * - Filter+sort (`status=published`, `sort=-count`) at 1.1M rows, forced MISS
 * - Plain list + point read carried as controls
 * - Runs with the benchmark server (production mode, fast lane)
 */
import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import { seedHttpCollectionBurst } from "./modules/seed-burst";
import "../unit/bun-preload.ts";

const POSTS = Number(process.env.SCALE_POSTS || 500_000);
const AUTHORS = Number(process.env.SCALE_AUTHORS || 2_000);
const ITERS = Number(process.env.SCALE_ITERS || 150);
/** `SCALE_SKIP_SORT=1` skips the two dynamic-field sort workloads (they run seconds per request at 1M+ rows). */
const SKIP_SORT = process.env.SCALE_SKIP_SORT === "1";

test("relationship + sort scale probe (500k posts, 1.1M sort rows)", async () => {
  let stop: (() => Promise<void>) | null = null;
  try {
    const info = await setupBenchmarkServer();
    stop = info.stop;
    const baseUrl = info.baseUrl;
    const headers: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
    };

    // ── 1. Authors (relation target) ─────────────────────────────────────
    const authorIds: string[] = [];
    await seedHttpCollectionBurst({
      url: `${baseUrl}/api/collections/benchmark_authors`,
      headers,
      count: AUTHORS,
      concurrency: 8,
      payloadAt: (i: number) => ({ name: `Author ${i}` }),
      existing: authorIds,
    });
    console.log(`seeded ${authorIds.length} authors`);

    // ── 2. Posts with author references ──────────────────────────────────
    const postIds: string[] = [];
    const seedT0 = performance.now();
    await seedHttpCollectionBurst({
      url: `${baseUrl}/api/collections/benchmark_posts`,
      headers,
      count: POSTS,
      concurrency: 8,
      payloadAt: (i: number) => ({
        title: `Scale post ${i}`,
        author: authorIds[i % authorIds.length],
      }),
      existing: postIds,
    });
    console.log(
      `seeded ${postIds.length} posts in ${((performance.now() - seedT0) / 1000).toFixed(1)}s (${Math.round(POSTS / ((performance.now() - seedT0) / 1000))} docs/s)`,
    );

    const postsUrl = `${baseUrl}/api/collections/benchmark_posts`;
    const stableUrl = `${baseUrl}/api/collections/BenchmarkStable`;
    const filterQuery = encodeURIComponent(JSON.stringify({ status: "published" }));

    let offsetCursor = 0;
    const populateHit = async () => {
      const res = await fetch(`${postsUrl}?limit=20&populate=author`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    // Varying cache-busting param → unique cache key → the real list + $in populate
    // query per call, WITHOUT offset scanning (offset would dominate the cost).
    const populateMiss = async () => {
      const n = (offsetCursor = (offsetCursor + 1) % 100_000);
      const res = await fetch(`${postsUrl}?limit=20&populate=author&x=${n}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      if (!body.includes('"_populated_author"')) {
        throw new Error("populate did not resolve");
      }
    };
    const filterSortMiss = async () => {
      const offset = (offsetCursor = (offsetCursor + 20) % 40_000);
      const res = await fetch(
        `${stableUrl}?limit=20&filter=${filterQuery}&sort=-count&offset=${offset}`,
        { headers },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const listLargeMiss = async () => {
      const offset = (offsetCursor = (offsetCursor + 100) % 40_000);
      const res = await fetch(
        `${stableUrl}?limit=100&filter=${filterQuery}&sort=-count&offset=${offset}`,
        { headers },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };
    const pointRead = async () => {
      const id = postIds[Math.floor(Math.random() * postIds.length)] || postIds[0];
      const res = await fetch(`${postsUrl}/${id}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
    };

    const run = async (name: string, fn: () => Promise<void>, warm = 30) => {
      for (let i = 0; i < warm; i++) await fn();
      const r = await runBenchmark({
        name,
        warmupIterations: 0,
        iterations: ITERS,
        concurrency: 8,
        onIteration: fn,
      });
      console.log(
        `  ${name.padEnd(24)} avg ${r.avgMs.toFixed(2)}ms p95 ${r.p95Ms.toFixed(2)}ms ${Math.round(r.rps)} RPS`,
      );
      return r;
    };

    console.log(`\n=== SCALE PROBE (${POSTS} posts + ${AUTHORS} authors, PostgreSQL) ===`);
    await run("populated list HIT", populateHit);
    await run("populated list MISS", populateMiss);
    if (!SKIP_SORT) {
      await run("filter+sort MISS (1.1M)", filterSortMiss);
      await run("listLarge MISS (1.1M)", listLargeMiss);
    } else {
      console.log("  (sort workloads skipped — SCALE_SKIP_SORT=1)");
    }
    await run("point read (control)", pointRead);
  } finally {
    if (stop) await stop();
  }
}, 900_000);
