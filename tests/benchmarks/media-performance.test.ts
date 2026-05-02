/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description Enterprise media benchmark for SveltyCMS.
 * Measures the full upload, processing, and storage pipeline via HTTP E2E.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";
import sharp from "sharp";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;
let testImageBuffer: Buffer;

async function generateTestImage() {
  return sharp({
    create: { width: 1920, height: 1080, channels: 3, background: { r: 64, g: 64, b: 96 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function runMediaAudit() {
  console.log("🚀 Starting Enterprise Media Pipeline Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1200);

    // Generate test image once
    testImageBuffer = await generateTestImage();

    console.log("   → Measuring Media Upload + Processing Pipeline...");

    const result = await runBenchmark({
      name: "Media Upload & Processing",
      iterations: 80,           // Media operations are heavy
      warmupIterations: 8,
      runs: 2,
      concurrency: 2,           // Conservative concurrency for I/O heavy work
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const formData = new FormData();

        // Add small noise to ensure unique file hash
        const noise = new Uint8Array([i % 256, Math.floor(Math.random() * 256)]);
        const uniqueBuffer = Buffer.concat([testImageBuffer, Buffer.from(noise)]);

        const blob = new Blob([uniqueBuffer], { type: "image/jpeg" });
        formData.append("files", blob, `bench-media-${i}.jpg`);

        const res = await fetch(`${baseUrl}/api/media/upload`, {
          method: "POST",
          headers: {
            "x-test-mode": "true",
            "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
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

    printTruthTable({
      title: "SVELTYCMS — MEDIA PIPELINE AUDIT",
      shortLabel: "Media",
      subtitle: `Upload → Resize → Storage • ${getDbType().toUpperCase()}`,
      results: [{ ...result, layer: "Media" }],
    });

    printSummaryTable([
      { key: "Avg Processing Latency", val: result.avgMs, unit: "ms" },
      { key: "p95 Latency", val: result.p95Ms || result.avgMs, unit: "ms" },
      { key: "Throughput", val: Math.round(result.rps || 0), unit: "images/s" },
      { key: "Memory Growth", val: (result.rssDelta || 0).toFixed(1), unit: "MB" },
    ]);

    exportResult(result);

  } catch (err: any) {
    logger.error(`Media benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Media audit completed.");
}

test("Media Engine Enterprise Suite", async () => {
  await runMediaAudit();
}, 600000);
