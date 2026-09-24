/**
 * @file tests/benchmarks/probe-point-read-split.test.ts
 * @description MISS-rebuild decomposition for the collection point-read lane.
 * @summary Hot (cached) vs cold (unique-id) point reads, decomposed by x-srv-split.
 *
 * ### Features:
 * - Standalone benchmark server (production mode, node:http fast lane)
 * - HOT id read until warm, then measured (TURBO-HIT path)
 * - COLD unique-id reads (guaranteed MISS → rebuild) with per-phase p50s
 * - Phases: lookup (cache get), db (findById), build (stringify+etag),
 *   cachewrite (responseCache.set), serve (Response build)
 * - Runs with SVELTY_SRV_SPLIT=1 / SVELTY_SRV_DUR=1 propagated to the server
 */
import { test, setupBenchmarkServer, benchmarkAuthHeaders } from "./modules/benchmark-utils";
import { seedHttpCollectionBurst } from "./modules/seed-burst";
import "../unit/bun-preload.ts";

const N = Number(process.env.PROBE_N || 800);
const SEED = Number(process.env.PROBE_SEED || 2500);

const PHASES = ["lookup", "db", "build", "cachewrite", "serve"] as const;

function pct(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? NaN;
}

test("point-read MISS rebuild split (x-srv-split)", async () => {
  // Propagated to the spawned server via ...process.env (setupBenchmarkServer).
  process.env.SVELTY_SRV_SPLIT = "1";
  process.env.SVELTY_SRV_DUR = "1";

  let stop: (() => Promise<void>) | null = null;
  try {
    const info = await setupBenchmarkServer();
    stop = info.stop;
    const baseUrl = info.baseUrl;
    const headers: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
    };
    const collectionUrl = `${baseUrl}/api/collections/BenchmarkStable`;

    const createdIds: string[] = [];
    await seedHttpCollectionBurst({
      url: collectionUrl,
      headers,
      count: SEED,
      concurrency: 8,
      payloadAt: (i: number) => ({
        title: `Probe article ${i}`,
        slug: `probe-split-${i}`,
        status: i % 3 === 0 ? "draft" : "published",
        count: i * 10,
        publishDate: "2026-01-01T00:00:00.000Z",
        content:
          `# Article ${i}\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. `.repeat(12),
      }),
      existing: createdIds,
    });
    if (createdIds.length < N + 2) {
      throw new Error(`probe: seeded ${createdIds.length}, need ${N + 2}`);
    }

    interface ReadRow {
      status: number;
      cache: string;
      srv: number;
      split: Partial<Record<(typeof PHASES)[number], number>>;
      bytes: number;
    }

    const read = async (id: string): Promise<ReadRow> => {
      const res = await fetch(`${collectionUrl}/${id}`, { headers });
      const body = await res.text();
      const split: ReadRow["split"] = {};
      for (const part of (res.headers.get("x-srv-split") || "").split(";")) {
        const eq = part.indexOf("=");
        if (eq <= 0) continue;
        const label = part.slice(0, eq);
        const ms = Number(part.slice(eq + 1));
        if ((PHASES as readonly string[]).includes(label) && Number.isFinite(ms)) {
          split[label as (typeof PHASES)[number]] = ms;
        }
      }
      return {
        status: res.status,
        cache: res.headers.get("x-cache") || "-",
        srv: Number(res.headers.get("x-srv-dur") || "NaN"),
        split,
        bytes: Buffer.byteLength(body),
      };
    };

    // Warm the hot row so it is a genuine cache HIT during measurement.
    for (let i = 0; i < 50; i++) await read(createdIds[0]);
    const hot: ReadRow[] = [];
    for (let i = 0; i < N; i++) hot.push(await read(createdIds[0]));

    // Cold: each id read exactly once (first touch = guaranteed cache miss).
    const cold: ReadRow[] = [];
    for (let i = 1; i <= N; i++) cold.push(await read(createdIds[i]));

    const f = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : "n/a");
    const cacheDist = (rows: ReadRow[]) =>
      JSON.stringify(
        rows.reduce<Record<string, number>>((m, r) => {
          m[r.cache] = (m[r.cache] || 0) + 1;
          return m;
        }, {}),
      );

    const summarize = (label: string, rows: ReadRow[]) => {
      const srv = rows.map((r) => r.srv).filter(Number.isFinite);
      console.log(
        `${label.padEnd(6)} total-ms n/a | srv avg ${f(srv.reduce((a, b) => a + b, 0) / srv.length)} p50 ${f(pct(srv, 50))} p95 ${f(pct(srv, 95))}` +
          ` | cache ${cacheDist(rows)} | bytes ${rows[0]?.bytes ?? 0}`,
      );
      for (const phase of PHASES) {
        const vals = rows
          .map((r) => r.split[phase])
          .filter((v): v is number => Number.isFinite(v as number));
        if (vals.length === 0) continue;
        console.log(
          `    ${phase.padEnd(10)} avg ${f(vals.reduce((a, b) => a + b, 0) / vals.length)} p50 ${f(pct(vals, 50))} p95 ${f(pct(vals, 95))} (n=${vals.length})`,
        );
      }
    };

    console.log(`\n=== POINT-READ SPLIT (${SEED} docs, N=${N}) ===`);
    summarize("HOT", hot);
    summarize("COLD", cold);

    const hotSrv = hot.map((r) => r.srv).filter(Number.isFinite);
    const coldSrv = cold.map((r) => r.srv).filter(Number.isFinite);
    console.log(`\ncold − hot server: +${f(pct(coldSrv, 50) - pct(hotSrv, 50))} ms (p50)`);
  } finally {
    if (stop) await stop();
  }
}, 600_000);
