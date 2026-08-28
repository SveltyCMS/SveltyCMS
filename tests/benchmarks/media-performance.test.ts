/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description Enterprise Media Pipeline Benchmark (Optimized)
 * @summary Measures full upload, Sharp thumbnail processing, SDK vs HTTP latency, and asset streaming throughput.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import sharp from "sharp";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

// Pre-render static base JPEG buffer
let baseJpegBuffer: Buffer;

async function prepareBaseImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 64, g: 64, b: 96 },
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Creates an isolated worker-safe buffer with unique trailing bytes */
function createWorkerImageBuffer(seq: number): Buffer {
  const buf = Buffer.allocUnsafe(baseJpegBuffer.length + 4);
  baseJpegBuffer.copy(buf);
  buf.writeUInt32BE(seq, baseJpegBuffer.length);
  return buf;
}

async function runMediaAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Media Pipeline Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    baseJpegBuffer = await prepareBaseImage();

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    const { LocalCMS } = await import("@src/services/sdk");
    const { settingsService } = await import("@src/services/core/settings-service");

    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database initialization failed");

    await settingsService.loadSettingsCache();
    const cms = new LocalCMS(db);

    const results: any[] = [];
    const uploadedAssetPaths: string[] = [];

    // ── 1. IN-PROCESS SDK MEDIA PROCESSING BENCHMARK ─────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 1. Measuring Local SDK Media Upload & Sharp Processing...");
    let sdkSeq = 0;

    const sdkResult = await runBenchmark({
      name: "SDK: Media Processing",
      iterations: 80,
      warmupIterations: 8,
      runs: 2,
      concurrency: 2,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const currentSeq = sdkSeq++;
        const imageBuffer = createWorkerImageBuffer(currentSeq);

        const file = new File([new Uint8Array(imageBuffer)], `sdk-media-${currentSeq}.jpg`, {
          type: "image/jpeg",
        });

        const res = await cms.media.upload(file, {
          userId: "system",
          tenantId: "global" as any,
        });

        if (!res.success || (!res.data?.url && !(res.data as any)?.path)) {
          throw new Error("SDK media upload returned invalid payload");
        }

        const p = (res.data as any)?.path || res.data?.url;
        if (p) uploadedAssetPaths.push(p);
      },
    });
    results.push({ ...sdkResult, shortLabel: "SDK", layer: "SDK" });

    // ── 2. HTTP MEDIA UPLOAD PIPELINE BENCHMARK ──────────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 2. Measuring HTTP Multipart Upload & Processing Pipeline...");
    let httpSeq = 0;
    const uploadHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      Origin: baseUrl,
      connection: "keep-alive",
    };

    const httpResult = await runBenchmark({
      name: "HTTP: Media Upload",
      iterations: 80,
      warmupIterations: 8,
      runs: 2,
      concurrency: 2,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const currentSeq = httpSeq++;
        const imageBuffer = createWorkerImageBuffer(currentSeq);

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
        formData.append("files", blob, `http-media-${currentSeq}.jpg`);

        const res = await fetch(`${baseUrl}/api/media/upload`, {
          method: "POST",
          headers: uploadHeaders,
          body: formData,
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Media upload failed: HTTP ${res.status} ${text}`);
        }

        // Fast zero-copy stream drain
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...httpResult, shortLabel: "HTTP", layer: "HTTP" });

    // ── 3. THUMBNAIL RETRIEVAL & ASSET STREAMING ────────────────────────────
    if (uploadedAssetPaths.length > 0) {
      forceGarbageCollection();
      await stabilize(150);

      console.log("   → 3. Measuring Thumbnail Transformation & Asset Streaming...");
      const samplePath = uploadedAssetPaths[0]!;
      const cleanPath = samplePath.startsWith("/") ? samplePath.slice(1) : samplePath;

      const streamResult = await runBenchmark({
        name: "HTTP: Asset Stream (Thumbnail)",
        iterations: 100,
        warmupIterations: 10,
        runs: 2,
        concurrency: 4,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const res = await fetch(`${baseUrl}/files/${cleanPath}?w=300&h=200&q=80`, {
            method: "GET",
            headers: {
              ...benchmarkAuthHeaders(),
              connection: "keep-alive",
            },
            signal: AbortSignal.timeout(10_000),
          });

          if (!res.ok) {
            throw new Error(`Thumbnail stream failed: HTTP ${res.status}`);
          }
          await res.arrayBuffer().catch(() => {});
        },
      });
      results.push({ ...streamResult, shortLabel: "Stream", layer: "Storage" });
    }

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    const httpOverheadMs = Math.max(0, httpResult.avgMs - sdkResult.avgMs);
    const httpTaxPct =
      sdkResult.avgMs > 0 ? ((httpOverheadMs / sdkResult.avgMs) * 100).toFixed(1) : "0.0";

    printTruthTable({
      title: "SVELTYCMS — MEDIA PIPELINE AUDIT",
      shortLabel: "Media",
      subtitle: `Upload → Sharp Resize → Storage • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "SDK Upload Latency (Avg)", val: sdkResult.avgMs.toFixed(2), unit: "ms" },
        { key: "HTTP Pipeline Latency (Avg)", val: httpResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "HTTP p95 Latency",
          val: (httpResult.p95Ms || httpResult.avgMs).toFixed(2),
          unit: "ms",
        },
        {
          key: "HTTP Transport Tax",
          val: `+${httpOverheadMs.toFixed(2)} (${httpTaxPct}%)`,
          unit: "ms",
        },
        { key: "SDK Throughput", val: Math.round(sdkResult.rps || 0), unit: "img/s" },
        { key: "HTTP Throughput", val: Math.round(httpResult.rps || 0), unit: "img/s" },
        { key: "HTTP Memory RSS Δ", val: (httpResult.rssDelta ?? 0).toFixed(1), unit: "MB" },
      ],
      "Media Pipeline Summary",
    );

    exportMetric("media.sdk.latency_avg_ms", sdkResult.avgMs, "ms");
    exportMetric("media.http.latency_avg_ms", httpResult.avgMs, "ms");
    exportMetric("media.http.latency_p95_ms", httpResult.p95Ms || httpResult.avgMs, "ms");
    exportMetric("media.http.throughput_rps", Math.round(httpResult.rps || 0), "img/s");
    exportMetric("media.http.rss_delta_mb", httpResult.rssDelta ?? 0, "MB");

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Media benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Media Engine Enterprise Suite", async () => {
  await runMediaAudit();
}, 600_000);
