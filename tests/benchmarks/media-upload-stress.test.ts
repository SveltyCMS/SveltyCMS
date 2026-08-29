/**
 * @file tests/benchmarks/media-upload-stress.test.ts
 * @description Media Upload Stress Test (Optimized)
 * @summary Measures throughput for large file uploads, concurrent transfers, and streaming efficiency with valid media fixtures.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  getDbType,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import sharp from "sharp";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

// Pre-allocated genuine JPEG buffers for valid Sharp image processing
let staticLargeBuffer: Buffer;
let staticSmallBuffer: Buffer;

async function initializeStaticBuffers() {
  staticLargeBuffer = await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 64, g: 64, b: 96 },
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();

  staticSmallBuffer = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function runUploadAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Media Upload Stress Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;
    const uploadUrl = `${baseUrl}/api/media/upload`;

    await ensureStableTestData();
    await stabilize(1000);

    await initializeStaticBuffers();
    const largeSizeMb = parseFloat((staticLargeBuffer.length / (1024 * 1024)).toFixed(2));
    const smallSizeMb = parseFloat((staticSmallBuffer.length / (1024 * 1024)).toFixed(3));

    const uploadHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      Origin: baseUrl,
      connection: "keep-alive",
    };

    const results: any[] = [];

    // ── 1. SINGLE LARGE FILE UPLOAD THROUGHPUT ───────────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log(`   → 1. Measuring Single Large File Upload (${largeSizeMb}MB)...`);
    let largeSeq = 0;

    const singleResult = await runBenchmark({
      name: `Single Upload (${largeSizeMb}MB)`,
      iterations: 12,
      warmupIterations: 2,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const currentSeq = largeSeq++;
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(staticLargeBuffer)], { type: "image/jpeg" });
        formData.append("files", blob, `bench-upload-${largeSizeMb}mb-${currentSeq}.jpg`);

        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: uploadHeaders,
          body: formData,
          signal: AbortSignal.timeout(60_000),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "<no body>");
          throw new Error(`Upload ${largeSizeMb}MB failed: HTTP ${res.status} - ${errBody}`);
        }

        // Fast zero-copy stream drain
        await res.arrayBuffer().catch(() => {});
      },
    });

    const largeThroughput = largeSizeMb / (singleResult.avgMs / 1000);
    results.push({
      ...singleResult,
      shortLabel: `Large-${largeSizeMb}MB`,
      layer: "Large File",
      throughputMBps: largeThroughput,
    });

    // ── 2. SMALL FILE CONCURRENT UPLOAD (HIGH THROUGHPUT) ───────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log(`   → 2. Measuring Concurrent Small File Uploads (${smallSizeMb}MB @ 4c)...`);
    let smallSeq = 0;

    const smallResult = await runBenchmark({
      name: `Small Upload (${smallSizeMb}MB @ 4c)`,
      iterations: 60,
      warmupIterations: 10,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const currentSeq = smallSeq++;
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(staticSmallBuffer)], { type: "image/jpeg" });
        formData.append("files", blob, `bench-upload-small-${currentSeq}.jpg`);

        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: uploadHeaders,
          body: formData,
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "<no body>");
          throw new Error(`Small upload failed: HTTP ${res.status} - ${errBody}`);
        }

        await res.arrayBuffer().catch(() => {});
      },
    });

    const smallThroughput = smallSizeMb * smallResult.rps;
    results.push({
      ...smallResult,
      shortLabel: `Small-${smallSizeMb}MB`,
      layer: "Small File",
      throughputMBps: smallThroughput,
    });

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — MEDIA UPLOAD STRESS AUDIT",
      shortLabel: "Media Upload",
      subtitle: `${largeSizeMb}MB Large vs ${smallSizeMb}MB Concurrent • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        {
          key: `Large File Latency (${largeSizeMb}MB)`,
          val: singleResult.avgMs.toFixed(2),
          unit: "ms",
        },
        {
          key: `Large File p95`,
          val: (singleResult.p95Ms || singleResult.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Large File Throughput", val: largeThroughput.toFixed(1), unit: "MB/s" },
        {
          key: `Small File Latency (${smallSizeMb}MB)`,
          val: smallResult.avgMs.toFixed(2),
          unit: "ms",
        },
        { key: "Small File Throughput", val: Math.round(smallResult.rps || 0), unit: "req/s" },
        { key: "Small Aggregate Bandwidth", val: smallThroughput.toFixed(2), unit: "MB/s" },
        { key: "Memory RSS Δ", val: (singleResult.rssDelta ?? 0).toFixed(1), unit: "MB" },
      ],
      "Upload Stress Summary",
    );

    for (const r of results) exportResult(r);
    exportMetric("media.upload.large_avg_ms", singleResult.avgMs, "ms");
    exportMetric("media.upload.large_p95_ms", singleResult.p95Ms || singleResult.avgMs, "ms");
    exportMetric(
      "media.upload.large_throughput_mbps",
      parseFloat(largeThroughput.toFixed(2)),
      "MB/s",
    );
    exportMetric("media.upload.small_avg_ms", smallResult.avgMs, "ms");
    exportMetric("media.upload.small_rps", Math.round(smallResult.rps || 0), "req/s");
  } catch (err: any) {
    console.error(`Upload audit failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Media Upload Stress Audit", async () => {
  await runUploadAudit();
}, 300_000);
