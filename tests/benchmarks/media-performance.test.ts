/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description Enterprise media benchmark for SveltyCMS.
 * Measures the full upload and processing pipeline via HTTP E2E.
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";
import sharp from "sharp";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;
let testImageBuffer: Buffer;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  // Create a realistic 1MB test image
  testImageBuffer = await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 50, g: 50, b: 80 },
    },
  })
    .jpeg()
    .toBuffer();
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

async function runMediaAudit() {
  console.log("🚀 Starting Enterprise Media Audit (E2E)...\n");

  const ITERATIONS = 50; // Media is heavy
  const RUNS = 1;
  const results: any[] = [];

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    console.log("   → Measuring Media Upload & Processing Pipeline...");
    const uploadResult = await runBenchmark({
      name: "Media Upload & Transform",
      iterations: ITERATIONS,
      warmupIterations: 5,
      runs: RUNS,
      concurrency: 2,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const formData = new FormData();
        // Append random noise to the end of the JPEG to ensure unique hash without corruption
        const noise = new Uint8Array([
          Math.floor(Math.random() * 255),
          Math.floor(Math.random() * 255),
        ]);
        const blob = new Blob([new Uint8Array(testImageBuffer), noise], { type: "image/jpeg" });
        formData.append("files", blob, `bench-${i}-${Math.random().toString(36).slice(2)}.jpg`);

        const res = await fetch(`${apiBaseUrl}/api/media/upload`, {
          method: "POST",
          headers: {
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
            Origin: apiBaseUrl,
          },
          body: formData,
        });

        if (!res.ok) throw new Error(`Media upload failed: ${res.status}`);
        await res.json();
      },
    });
    results.push({ ...uploadResult, layer: "E2E" });

    printTruthTable({
      title: "SVELTYCMS  —  MEDIA PIPELINE AUDIT",
      subtitle: "Full Upload → Resize → Storage E2E",
      results,
    });

    printSummaryTable([
      { key: "Avg Upload Latency", val: uploadResult.avgMs, unit: "ms" },
      { key: "p95 Upload Latency", val: uploadResult.p95Ms, unit: "ms" },
      { key: "Media Throughput", val: Math.round(uploadResult.rps), unit: "img/s" },
      { key: "Memory RSS Δ", val: (uploadResult.rssDelta || 0).toFixed(2), unit: "MB" },
    ]);

    exportResult(uploadResult);
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Media audit completed.");
}

test("Media Engine Enterprise Suite", async () => {
  await runMediaAudit();
}, 600000);
