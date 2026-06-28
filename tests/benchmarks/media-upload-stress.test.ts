/**
 * @file tests/benchmarks/media-upload-stress.test.ts
 * @description Media Upload Stress Test
 * @summary Measures throughput for large file uploads, concurrent transfers, and streaming efficiency.
 *
 * ### Features:
 * - Large file upload throughput measurement
 * - Concurrent upload stress testing
 * - Streaming efficiency analysis
 * - Multi-size payload performance profiling
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
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { randomBytes } from "node:crypto";

let stopServer: (() => Promise<void>) | null = null;

// Pre-allocated static buffers to avoid randomBytes + allocation per iteration
let staticLargeBuffer: Uint8Array;
let staticSmallBuffer: Uint8Array;

function initializeStaticBuffers(largeSizeMb: number) {
  staticLargeBuffer = new Uint8Array(randomBytes(largeSizeMb * 1024 * 1024));
  staticSmallBuffer = new Uint8Array(randomBytes(1 * 1024 * 1024));
}

async function runUploadAudit() {
  // pre-existing unused var removed for TS strict mode
  const FILE_SIZE_MB = parseInt(process.env.BENCH_UPLOAD_SIZE || "10", 10);
  console.log(`🚀 Starting Media Upload Stress Audit (${FILE_SIZE_MB}MB files)...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    // Pre-allocate payloads once — out of benchmark timing
    initializeStaticBuffers(FILE_SIZE_MB);

    const uploadHeaders = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      Origin: baseUrl,
    };

    // 1. Single upload throughput
    console.log(`   → Measuring Single Upload (${FILE_SIZE_MB}MB)...`);
    const singleResult = await runBenchmark({
      name: `Single Upload (${FILE_SIZE_MB}MB)`,
      iterations: 10,
      warmupIterations: 2,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async (i: number) => {
        const formData = new FormData();
        const blob = new Blob([staticLargeBuffer as BlobPart], {
          type: "application/octet-stream",
        });
        formData.append("file", blob, `bench-upload-${FILE_SIZE_MB}mb-${i}.bin`);

        const res = await fetch(`${baseUrl}/api/media/upload`, {
          method: "POST",
          headers: uploadHeaders,
          body: formData,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "<no body>");
          throw new Error(`Upload failed: ${res.status} - ${errBody}`);
        }
        await res.json();
      },
    });

    // 2. Small file upload (1MB, high throughput)
    console.log("   → Measuring Small File Upload (1MB)...");
    const smallResult = await runBenchmark({
      name: "Small Upload (1MB)",
      iterations: 50,
      warmupIterations: 10,
      runs: 2,
      concurrency: 4,
      silent: true,
      onIteration: async (i: number) => {
        const formData = new FormData();
        const blob = new Blob([staticSmallBuffer as BlobPart], {
          type: "application/octet-stream",
        });
        formData.append("file", blob, `bench-upload-1mb-${i}.bin`);

        const res = await fetch(`${baseUrl}/api/media/upload`, {
          method: "POST",
          headers: uploadHeaders,
          body: formData,
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        await res.json();
      },
    });

    const throughput = FILE_SIZE_MB / (singleResult.avgMs / 1000);

    const results = [singleResult, smallResult];

    printTruthTable({
      title: "SVELTYCMS — MEDIA UPLOAD STRESS AUDIT",
      shortLabel: "Media Upload",
      subtitle: `${FILE_SIZE_MB}MB Upload • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: `Upload ${FILE_SIZE_MB}MB`, val: singleResult.avgMs, unit: "ms" },
      { key: "Upload 1MB", val: smallResult.avgMs, unit: "ms" },
      { key: "Throughput", val: throughput.toFixed(1), unit: "MB/s" },
      {
        key: "Small RPS",
        val: Math.round(smallResult.rps || 0),
        unit: "req/s",
      },
    ]);

    for (const r of results) exportResult(r);
    exportMetric("media.upload.large_ms", singleResult.avgMs, "ms");
    exportMetric("media.upload.small_ms", smallResult.avgMs, "ms");
    exportMetric("media.upload.throughput_mbps", throughput, "MB/s");
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
}, 300000);
