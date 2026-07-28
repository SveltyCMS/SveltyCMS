/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description Enterprise Media Pipeline Benchmark
 * @summary Measures full upload, processing, and storage pipeline via HTTP E2E
 *
 * ### Features:
 * - Image upload throughput (sharp-based processing)
 * - Thumbnail generation latency
 * - Storage write/read pipeline end-to-end timing
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import sharp from "sharp";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

// Pre-allocated scratch buffer for zero-allocation mutation in hot loops
const NOISE_BYTES = 2;
let scratchBuffer: Buffer;
let baseImageLength: number;

async function generateTestImage() {
  const baseImage = await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 64, g: 64, b: 96 },
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();

  baseImageLength = baseImage.length;

  // Single combined buffer: [Base Image | 2 Bytes for noise]
  // Mutate the trailing bytes in-place instead of allocating per iteration
  const combined = Buffer.alloc(baseImageLength + NOISE_BYTES);
  baseImage.copy(combined);
  return combined;
}

async function runMediaAudit() {
  // pre-existing unused var removed for TS strict mode
  console.log("🚀 Starting Enterprise Media Pipeline Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1200);

    // Generate test image scratch buffer once (zero-allocation hot path)
    scratchBuffer = await generateTestImage();

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    const { LocalCMS } = await import("@src/services/sdk");
    const { settingsService } = await import("@src/services/core/settings-service");
    await ensureFullInitialization();
    const db = getDb();
    await settingsService.loadSettingsCache();
    const cms = new LocalCMS(db!);

    const results: any[] = [];
    const uploadedSdkPaths: string[] = [];

    console.log("   → Measuring Local SDK Media Processing...");
    const sdkResult = await runBenchmark({
      name: "SDK: Media Processing",
      iterations: 80,
      warmupIterations: 8,
      runs: 2,
      concurrency: 2,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        // Zero-allocation: mutate trailing bytes of the scratch buffer in place
        scratchBuffer[baseImageLength] = i % 256;
        scratchBuffer[baseImageLength + 1] = Math.floor(Math.random() * 256);

        const file = new File([scratchBuffer as BlobPart], `sdk-media-${i}.jpg`, {
          type: "image/jpeg",
        });
        const res = await cms.media.upload(file, {
          userId: "system",
          tenantId: "global" as any,
        });
        if (!res.success || (!res.data?.url && !(res.data as any)?.path)) {
          console.error("SDK upload failed, FULL res:", res);
          throw new Error(`SDK upload failed: Missing URL/Path`);
        }
        if ((res.data as any)?.path) uploadedSdkPaths.push((res.data as any).path);
      },
    });
    results.push({ ...sdkResult, shortLabel: "SDK", layer: "SDK" });

    console.log("   → Measuring HTTP Media Upload Pipeline...");
    const httpResult = await runBenchmark({
      name: "HTTP: Media Upload",
      iterations: 80,
      warmupIterations: 8,
      runs: 2,
      concurrency: 2,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const formData = new FormData();

        // Zero-allocation: mutate trailing bytes of the scratch buffer in place
        scratchBuffer[baseImageLength] = i % 256;
        scratchBuffer[baseImageLength + 1] = Math.floor(Math.random() * 256);

        const blob = new Blob([scratchBuffer as BlobPart], {
          type: "image/jpeg",
        });
        formData.append("files", blob, `bench-media-${i}.jpg`);

        const res = await fetch(`${baseUrl}/api/media/upload`, {
          method: "POST",
          headers: {
            "x-test-mode": "true",
            "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
            Origin: baseUrl,
          },
          body: formData,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Media upload failed: ${res.status} ${text}`);
        }
        await res.json();
      },
    });
    results.push({ ...httpResult, shortLabel: "HTTP", layer: "HTTP" });

    // Cleanup skipped — matrix GC handles artifact purging
    // (Adapter delete has known circular call stack issue in bulk path)
    if (uploadedSdkPaths.length > 0) {
      console.log(
        `   → Skipping artifact cleanup (${uploadedSdkPaths.length} files) — matrix GC will handle`,
      );
    }

    printTruthTable({
      title: "SVELTYCMS — MEDIA PIPELINE AUDIT",
      shortLabel: "Media",
      subtitle: `Upload → Resize → Storage • SDK vs HTTP • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "SDK Processing Latency", val: sdkResult.avgMs, unit: "ms" },
      { key: "HTTP Pipeline Latency", val: httpResult.avgMs, unit: "ms" },
      {
        key: "SDK Throughput",
        val: Math.round(sdkResult.rps || 0),
        unit: "images/s",
      },
      {
        key: "HTTP Throughput",
        val: Math.round(httpResult.rps || 0),
        unit: "images/s",
      },
      {
        key: "HTTP p95 Latency",
        val: httpResult.p95Ms || httpResult.avgMs,
        unit: "ms",
      },
      {
        key: "Memory Growth",
        val: (httpResult.rssDelta || 0).toFixed(1),
        unit: "MB",
      },
    ]);

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
}, 600000);
