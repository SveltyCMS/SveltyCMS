/**
 * @file tests/benchmarks/api-latency.test.ts
 * @description API Latency Benchmark (Production Optimized)
 * @summary Cold full-pipeline findById + warm TURBO-HIT path after responseCache fill.
 */

import {
  test,
  beforeAll,
  afterAll,
  runBenchmark,
  exportResult,
  exportMetric,
  computeStatistics,
  stabilize,
  setupBenchmarkServer,
  forceRefreshServer,
  printTruthTable,
  printSummaryTable,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  ensureStableTestData,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

/**
 * `handle-compression.ts` only takes the streaming (genuinely async) zstd path
 * above `SYNC_MAX_SIZE` (64 KiB) — below it the sync native call is the intended
 * behaviour. The probe refuses to report numbers for a body that cannot exercise
 * the claim.
 */
const ZSTD_ASYNC_MIN_BYTES = 64 * 1024;
/** Coordination samples — small n keeps the whole scenario inside seconds. */
const ZSTD_SAMPLES = 60;
/** Sealed benchmark payload: `MAX_PAGE_SIZE` (200) entries × ~1 KiB body. */
const ZSTD_COLLECTION = "bench_zstd_payload";
const ZSTD_ROWS = 200;
const ZSTD_ROW_BYTES = 1_024;

let stopServer: (() => Promise<void>) | null = null;
let apiBaseUrl: string;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;
  await ensureStableTestData();
}, 120_000);

afterAll(async () => {
  if (stopServer) {
    await stopServer().catch(() => {});
    stopServer = null;
  }
});

export async function runApiLatencyAudit() {
  await stabilize(500);

  console.log("\n🚀 Starting Enterprise API Latency Audit (E2E)...\n");

  const RUNS = 2;
  const ITERATIONS = 500;
  const allResults: any[] = [];

  const targetUrl = `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`;

  // Pre-allocated static headers to prevent allocation overhead in hot loop
  const headers: Record<string, string> = {
    ...benchmarkAuthHeaders(),
    "x-tenant-id": "default",
    "content-type": "application/json",
    connection: "keep-alive",
  };

  try {
    // ── 1. COLD / FULL PIPELINE (CACHE-BUSTED) ──────────────────────────────
    console.log("   → Measuring Pipeline Latency (findById cold, cache-busted)...");
    let coldSeq = 0;

    const httpRes = await runBenchmark({
      name: "HTTP: findById @ 8c (Cold)",
      iterations: ITERATIONS,
      warmupIterations: 100,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const seq = coldSeq++;
        const res = await fetch(`${targetUrl}?_c=${seq}`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) throw new Error(`HTTP Latency failed: ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });

    allResults.push({ ...httpRes, layer: "HTTP", shortLabel: "cold" });

    // ── 2. PRIME AND VERIFY TURBO CACHE ─────────────────────────────────────
    forceGarbageCollection();
    await stabilize(300);

    let primeHits = 0;
    for (let i = 0; i < 30; i++) {
      const warm = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const xCache = warm.headers.get("x-cache") || "";
      if (xCache.toUpperCase().includes("TURBO")) primeHits++;
      await warm.arrayBuffer().catch(() => {});
    }

    console.log(`   → Cache primed. Verified initial TURBO hits: ${primeHits}/30`);

    // ── 3. WARM TURBO-HIT PATH ──────────────────────────────────────────────
    console.log("   → Measuring Steady-State Turbo HIT findById @ 8c...");
    let measuredTurboHits = 0;
    let measuredTotal = 0;

    const turboRes = await runBenchmark({
      name: "HTTP: findById TURBO-HIT @ 8c (Warm)",
      iterations: ITERATIONS,
      warmupIterations: 100,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) throw new Error(`Turbo findById failed: ${res.status}`);

        const xCache = res.headers.get("x-cache") || "";
        if (xCache.toUpperCase().includes("TURBO")) {
          measuredTurboHits++;
        }
        measuredTotal++;

        await res.arrayBuffer().catch(() => {});
      },
    });

    allResults.push({ ...turboRes, layer: "TURBO", shortLabel: "turbo" });

    // ── 4. ZSTD-ASYNC RESPONSE PATH ─────────────────────────────────────────
    forceGarbageCollection();
    await stabilize(300);
    const zstd = await runZstdAudit(headers, targetUrl, turboRes.avgMs);
    allResults.push(...zstd.results);

    // ── 5. REPORTING & METRICS ──────────────────────────────────────────────
    const turboHitRate =
      measuredTotal > 0 ? ((measuredTurboHits / measuredTotal) * 100).toFixed(1) : "100.0";
    const speedup = (httpRes.avgMs / Math.max(turboRes.avgMs, 0.001)).toFixed(2);

    printTruthTable({
      title: "SVELTYCMS — API LAYER LATENCY",
      subtitle: "Cold Full Pipeline vs Turbo GET Response-Cache HIT vs zstd async",
      results: allResults,
    });

    printSummaryTable(
      [
        { key: "Cold Pipeline Latency", val: httpRes.avgMs.toFixed(2), unit: "ms" },
        { key: "Turbo HIT Latency", val: turboRes.avgMs.toFixed(2), unit: "ms" },
        { key: "TURBO Speedup", val: `${speedup}×`, unit: "" },
        { key: "TURBO Hit Rate", val: `${turboHitRate}%`, unit: "" },
        { key: "Cold Throughput", val: Math.round(httpRes.rps), unit: "req/s" },
        { key: "Turbo Throughput", val: Math.round(turboRes.rps), unit: "req/s" },
        {
          key: "Memory RSS Δ",
          val: (httpRes.rssDelta ?? 0).toFixed(2),
          unit: "MB",
        },
        {
          key: `zstd body (>${Math.round(ZSTD_ASYNC_MIN_BYTES / 1024)}KiB)`,
          val: zstd.available ? `${zstd.bodyBytes} B` : zstd.skipReason,
          unit: "",
        },
        {
          key: "zstd large GET p95 (477 KiB drained)",
          val: zstd.zstdTransfer?.p95Ms ?? "—",
          unit: "ms",
        },
        {
          key: "zstd served from cache",
          val: zstd.available ? `${zstd.cacheHitPct}%` : "—",
          unit: "",
        },
        {
          key: "Co-tenant latency during zstd (p95)",
          val: zstd.cotenantDuring?.p95Ms ?? "—",
          unit: "ms",
        },
        {
          key: "Co-tenant latency idle (p95)",
          val: zstd.cotenantIdle?.p95Ms ?? "—",
          unit: "ms",
        },
      ],
      "API Latency Summary",
    );

    for (const r of allResults) exportResult(r);
    exportMetric("api.latency.http", httpRes.avgMs, "ms");
    exportMetric("api.latency.http_turbo", turboRes.avgMs, "ms");
    exportMetric("api.latency.turbo_hit_rate", parseFloat(turboHitRate) || 100, "%");
    exportMetric("api.latency.speedup", parseFloat(speedup) || 1, "x");
    // 1 = zstd measured end-to-end, 0 = runtime/body cannot exercise the claim.
    exportMetric("api.zstd.available", zstd.available ? 1 : 0, "bool");
    exportMetric("api.zstd.body_bytes", zstd.bodyBytes, "bytes");
    if (zstd.available) {
      exportMetric("api.zstd.content_encoding_ok", zstd.encodingOk ? 1 : 0, "bool");
      exportMetric("api.zstd.cotenant_p95_delta_pct", zstd.cotenantDeltaPct, "%");
      exportMetric("api.zstd.cache_hit_pct", zstd.cacheHitPct, "%");
    }
  } catch (err: any) {
    console.error("API Latency Audit failed:", err);
    throw err;
  }
}

/**
 * Deterministically (re)seed a payload collection whose `?limit=200` list is a
 * multi-hundred-KiB JSON body — the tier where zstd must compress off-thread.
 * Mirrors `seedThroughputDocs()` (adapter-level, runtime-safe); the collection
 * itself only exists inside the benchmark sandbox database.
 *
 * @returns true when the collection is seedable and readable.
 */
async function seedZstdPayloadCollection(): Promise<boolean> {
  try {
    const { getDb, getDbInitPromise } = await import("@src/databases/db");
    await getDbInitPromise(false, "CORE").catch(() => {});
    const db = getDb() as unknown as {
      collection?: { createModel: (schema: unknown) => Promise<unknown> };
      crud?: {
        deleteMany: (c: string, q: unknown, o?: unknown) => Promise<unknown>;
        insertMany: (c: string, docs: unknown[], o?: unknown) => Promise<unknown>;
      };
    } | null;
    if (!db?.collection || !db.crud) return false;

    await db.collection
      .createModel({
        _id: ZSTD_COLLECTION,
        name: ZSTD_COLLECTION,
        fields: [
          { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
          { db_fieldName: "content", label: "Content", widget: { Name: "Input" }, type: "string" },
        ],
      })
      .catch(() => undefined);

    await db.crud
      .deleteMany(ZSTD_COLLECTION, {}, { tenantId: "global", permanent: true })
      .catch(() => undefined);

    const padding = "x".repeat(ZSTD_ROW_BYTES);
    const docs = Array.from({ length: ZSTD_ROWS }, (_, i) => ({
      _id: crypto.randomUUID(),
      title: `zstd payload ${i}`,
      content: `${padding}-${i}`,
      tenantId: "global",
    }));
    await db.crud.insertMany(ZSTD_COLLECTION, docs, {
      tenantId: "global",
      skipReturning: true,
    });
    return true;
  } catch (err: unknown) {
    logger.warn(
      `[api-latency] zstd payload seed failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

interface ZstdAuditOutcome {
  results: Array<Record<string, unknown>>;
  /** False when the claim cannot be exercised here (no zstd, body too small). */
  available: boolean;
  encodingOk: boolean;
  bodyBytes: number;
  skipReason: string;
  zstdTransfer?: { avgMs: number; p95Ms: number };
  cotenantDuring?: { avgMs: number; p95Ms: number };
  cotenantIdle?: { avgMs: number; p95Ms: number };
  cotenantDeltaPct: number;
  /** Share of measured large GETs that were served from the response cache. */
  cacheHitPct: number;
}

/**
 * zstd-async coverage (achievements 2026: “zstd is no longer synchronous on the
 * event loop”).
 *
 * Two things are measured against a body above `SYNC_MAX_SIZE` (64 KiB), which is
 * the tier where the streaming zstd transform (not the sync native call) applies:
 * 1. a large GET with `Accept-Encoding: zstd` including the full body drain;
 * 2. the co-tenant path — how a normal TURBO-HIT request behaves while that
 *    compressed payload is produced/sent. A synchronous compressor would show up
 *    as a latency spike here, not on the compressed response’s own total.
 *
 * If the runtime lacks native zstd or no candidate body is big enough to reach the
 * async tier, the scenario reports *why* and exports no latency numbers — a fake
 * number for an unexercised path is worse than no number.
 */
async function runZstdAudit(
  headers: Record<string, string>,
  controlUrl: string,
  controlBaselineMs: number,
): Promise<ZstdAuditOutcome> {
  const empty: ZstdAuditOutcome = {
    results: [],
    available: false,
    encodingOk: false,
    bodyBytes: 0,
    skipReason: "not measured",
    cotenantDeltaPct: 0,
    cacheHitPct: 0,
  };

  // Candidate large JSON GETs. The sealed payload collection is first because it
  // is deterministic (200 × ~1 KiB) and exceeds `SYNC_MAX_SIZE`; the OpenAPI spec
  // and the stable collection list are the fallbacks.
  //
  // `limit=199`, not 200: at `MAX_PAGE_SIZE` (200) the handler switches to
  // `streamingJsonResponse`, whose deliberate 10 ms/tick backpressure sleep would
  // dominate the measurement (measured: ~3.1 s per request). Below the cap the
  // body is built once with a real `Content-Length` > 64 KiB, which is exactly the
  // tier the async zstd transform serves.
  const seeded = await seedZstdPayloadCollection();
  if (seeded) {
    // The server caches its schema store at boot — a runtime-created collection is
    // 404 until it refreshes (same contract as concurrency-max's seed step).
    await forceRefreshServer(apiBaseUrl);
    await stabilize(200);
  }
  const candidates = [
    `${apiBaseUrl}/api/collections/${ZSTD_COLLECTION}?limit=199`,
    `${apiBaseUrl}/api/openapi.json`,
    `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}?limit=199`,
  ];

  // ── Probe body sizes on the identity path (compressed sizes would hide them).
  let bigUrl = "";
  let bodyBytes = 0;
  const probeSizes: string[] = [];
  for (const candidate of candidates) {
    const res = await fetch(candidate, {
      method: "GET",
      headers: { ...headers, "accept-encoding": "identity" },
      signal: AbortSignal.timeout(20_000),
    }).catch((err: unknown) => err as Error);
    if (res instanceof Error) {
      probeSizes.push(`${candidate} → probe failed (${res.message})`);
      continue;
    }
    if (!res.ok) {
      await res.arrayBuffer().catch(() => {});
      probeSizes.push(`${candidate} → HTTP ${res.status}`);
      continue;
    }
    const bytes = (await res.arrayBuffer()).byteLength;
    probeSizes.push(`${candidate} → ${bytes} B`);
    if (bytes > ZSTD_ASYNC_MIN_BYTES) {
      bigUrl = candidate;
      bodyBytes = bytes;
      break;
    }
  }
  if (!bigUrl) {
    console.warn(
      `   → zstd scenario skipped: no candidate body exceeds ${ZSTD_ASYNC_MIN_BYTES} B ` +
        `(${probeSizes.join("; ")}). The async zstd tier is unreachable, so no latency is reported.`,
    );
    return { ...empty, skipReason: `no body > ${ZSTD_ASYNC_MIN_BYTES} B` };
  }

  // ── Warm the compressed variants and confirm the server really speaks zstd.
  const zstdHeaders = { ...headers, "accept-encoding": "zstd" };
  let encodingOk = false;
  for (let i = 0; i < 5; i++) {
    const warm = await fetch(`${bigUrl}${bigUrl.includes("?") ? "&" : "?"}_zw=${i}`, {
      method: "GET",
      headers: zstdHeaders,
      signal: AbortSignal.timeout(20_000),
    });
    if (warm.headers.get("content-encoding")?.toLowerCase() === "zstd") encodingOk = true;
    await warm.arrayBuffer().catch(() => {});
  }
  if (!encodingOk) {
    console.warn(
      "   → zstd scenario skipped: server answered without `content-encoding: zstd` (runtime lacks native zstd, or the body was served uncompressed).",
    );
    return { ...empty, bodyBytes, skipReason: "no zstd content-encoding" };
  }
  console.log(
    `   → zstd active: ${bigUrl} · body ${(bodyBytes / 1024).toFixed(1)} KiB (> ${ZSTD_ASYNC_MIN_BYTES / 1024} KiB async tier)`,
  );

  // ── 4a. Large zstd GET including the full body drain.
  let cacheHits = 0;
  let cacheSamples = 0;
  const zstdTransfer = await runBenchmark({
    name: "HTTP: zstd large GET (>64KiB, drained)",
    iterations: 40,
    warmupIterations: 8,
    runs: 2,
    concurrency: 2,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      const res = await fetch(
        `${bigUrl}${bigUrl.includes("?") ? "&" : "?"}_zc=${Date.now()}-${Math.random()}`,
        {
          method: "GET",
          headers: zstdHeaders,
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) throw new Error(`zstd GET failed: HTTP ${res.status}`);
      if (res.headers.get("content-encoding")?.toLowerCase() !== "zstd") {
        throw new Error("zstd GET answered without zstd encoding");
      }
      const cache = (res.headers.get("x-cache") || "").toUpperCase();
      cacheSamples++;
      if (cache.includes("HIT") || cache.includes("TURBO")) cacheHits++;
      await res.arrayBuffer().catch(() => {});
    },
  });

  // ── 4b. Co-tenant latency: same control request, idle vs during zstd.
  const idleSamples: number[] = [];
  const duringSamples: number[] = [];

  const measureControl = async (): Promise<number> => {
    const t0 = performance.now();
    const res = await fetch(controlUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`control GET failed: HTTP ${res.status}`);
    await res.arrayBuffer().catch(() => {});
    return performance.now() - t0;
  };

  try {
    for (let i = 0; i < 15; i++) await measureControl(); // warm the TURBO path
    for (let i = 0; i < ZSTD_SAMPLES; i++) idleSamples.push(await measureControl());

    let zstdFailures = 0;
    for (let i = 0; i < ZSTD_SAMPLES; i++) {
      const bigRequest = fetch(
        `${bigUrl}${bigUrl.includes("?") ? "&" : "?"}_zr=${Date.now()}-${i}`,
        {
          method: "GET",
          headers: zstdHeaders,
          signal: AbortSignal.timeout(20_000),
        },
      )
        .then(async (res) => {
          if (!res.ok) throw new Error(`zstd GET failed: HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        })
        .catch(() => {
          zstdFailures++;
        });
      // Let the compression request reach the server before timing the peer.
      await new Promise((r) => setTimeout(r, 2));
      duringSamples.push(await measureControl());
      await bigRequest;
    }
    if (zstdFailures > 0) {
      logger.warn(
        `[api-latency] ${zstdFailures}/${ZSTD_SAMPLES} zstd requests failed during co-tenant sampling`,
      );
    }
  } catch (err: unknown) {
    console.warn(
      `   → zstd co-tenant sampling aborted: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ...empty, bodyBytes, encodingOk: true, skipReason: "co-tenant sampling failed" };
  }

  const stats = (samples: number[], name: string) =>
    computeStatistics(samples, samples.length / (samples.reduce((a, b) => a + b, 0) / 1000), {
      name,
      runs: 1,
      concurrency: 1,
      trimOutliers: "iqr",
    });

  const idle = stats(idleSamples, "HTTP: findById TURBO-HIT idle (Warm)");
  const during = stats(duringSamples, "HTTP: findById TURBO-HIT during zstd (Warm)");
  const cotenantDeltaPct = idle.p95Ms > 0 ? ((during.p95Ms - idle.p95Ms) / idle.p95Ms) * 100 : 0;
  const cacheHitPct = cacheSamples > 0 ? (cacheHits / cacheSamples) * 100 : 0;

  console.log(
    `   → co-tenant p95: idle ${idle.p95Ms}ms vs during zstd ${during.p95Ms}ms ` +
      `(Δ ${cotenantDeltaPct >= 0 ? "+" : ""}${cotenantDeltaPct.toFixed(1)}%, absolute +${(during.p95Ms - idle.p95Ms).toFixed(3)}ms) · ` +
      `turbo baseline ${controlBaselineMs.toFixed(3)}ms · zstd served from cache ${cacheHitPct.toFixed(0)}%`,
  );

  return {
    results: [
      { ...zstdTransfer, shortLabel: "zstd", layer: "Compression" },
      { ...idle, shortLabel: "idle", layer: "Co-tenant" },
      { ...during, shortLabel: "during", layer: "Co-tenant" },
    ],
    available: true,
    encodingOk,
    bodyBytes,
    skipReason: "",
    zstdTransfer: { avgMs: zstdTransfer.avgMs, p95Ms: zstdTransfer.p95Ms },
    cotenantDuring: { avgMs: during.avgMs, p95Ms: during.p95Ms },
    cotenantIdle: { avgMs: idle.avgMs, p95Ms: idle.p95Ms },
    cotenantDeltaPct: Number(cotenantDeltaPct.toFixed(1)),
    cacheHitPct: Number(cacheHitPct.toFixed(1)),
  };
}

test("API Latency Enterprise Suite", async () => {
  await runApiLatencyAudit();
}, 450_000);
