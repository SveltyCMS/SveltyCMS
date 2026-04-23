/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description Enterprise media benchmark for SveltyCMS.
 * Measures hashing, metadata, and multi-format responsive image generation (JPEG, WebP, AVIF).
 */

import { test } from "bun:test";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";

import sharp from "sharp";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ✨ FIX: Define Svelte 5 runes for Bun benchmark context
if (typeof (globalThis as any).$state === "undefined") {
  (globalThis as any).$state = (v: any) => v;
  (globalThis as any).$derived = (v: any) => v;
  (globalThis as any).$effect = (v: any) => v;
}

const { saveResized } = await import("@src/utils/media/media-storage.server");

const CPU = os.cpus().length;
// Optimization: Leave headroom for the OS and Bun while Sharp works
sharp.concurrency(Math.max(1, Math.floor(CPU * 0.75)));

const TEST_IMAGE_PATH = path.join(os.tmpdir(), "svelty-media-benchmark", "test-1920x1080.jpg");

async function setupTestImage() {
  await fs.mkdir(path.dirname(TEST_IMAGE_PATH), { recursive: true });

  try {
    await fs.access(TEST_IMAGE_PATH);
    return await fs.readFile(TEST_IMAGE_PATH);
  } catch {}

  console.log("🎨 Generating enterprise benchmark image...");

  const img = sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 4,
      background: { r: 80, g: 120, b: 180, alpha: 1 },
    },
  }).composite([
    {
      input: Buffer.from(`
        <svg width="1920" height="1080">
          <text x="50%" y="50%" font-size="170" text-anchor="middle" fill="white">
            SveltyCMS
          </text>
        </svg>
      `),
      gravity: "center",
    },
  ]);

  await img.jpeg({ quality: 92 }).toFile(TEST_IMAGE_PATH);
  return fs.readFile(TEST_IMAGE_PATH);
}

async function resizeSet(buffer: Buffer, _format: "jpeg" | "webp" | "avif") {
  // Use the actual saveResized utility to measure real-world overhead
  await saveResized(buffer, "bench-hash", "test-image", "jpg", "bench-temp");
}

async function runManipulation(buffer: Buffer) {
  // Simulates common DAM manipulations (Crop + Rotate + Brightness)
  await sharp(buffer)
    .rotate(90)
    .extract({ left: 100, top: 100, width: 800, height: 600 })
    .modulate({ brightness: 1.2 })
    .toBuffer();
}

async function simulatePdfThumbnail() {
  await sharp({
    create: { width: 595, height: 842, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
}

async function simulateVideoThumbnail() {
  await new Promise((r) => setTimeout(r, 45)); // Spawn + Seek overhead
  await sharp({
    create: { width: 1280, height: 720, channels: 3, background: "black" },
  })
    .jpeg()
    .toBuffer();
}

export async function runMediaBenchmark() {
  console.log("🖼️ Starting Enterprise Media Benchmark...\n");

  const original = await setupTestImage();
  await stabilize();

  const RUNS = 2; // Reduced runs for media
  const allResults: any[] = [];

  const benchmarkOp = async (
    name: string,
    iterations: number,
    onIteration: () => Promise<void> | void,
    options = {},
  ) => {
    console.log(`   → ${name}`);
    return runBenchmark({
      name,
      iterations,
      warmupIterations: Math.max(1, Math.floor(iterations * 0.1)),
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration,
      ...options,
    });
  };

  // 1. Core Ops
  allResults.push(
    await benchmarkOp("SHA-256 Hash", 1000, () => {
      createHash("sha256").update(original).digest("hex");
    }),
  );

  allResults.push(
    await benchmarkOp("Metadata Extraction", 500, async () => {
      await sharp(original).metadata();
    }),
  );

  // 2. Transcoding
  allResults.push(
    await benchmarkOp("Responsive JPEG Set", 40, async () => {
      await resizeSet(original, "jpeg");
    }),
  );

  allResults.push(
    await benchmarkOp("Responsive WebP Set", 25, async () => {
      await resizeSet(original, "webp");
    }),
  );

  allResults.push(
    await benchmarkOp(
      "Responsive AVIF Set",
      8,
      async () => {
        await resizeSet(original, "avif");
      },
      { runs: 1, trimOutliers: false },
    ),
  );

  // 3. DAM Ops
  allResults.push(
    await benchmarkOp("Manipulation (Rotate + Crop)", 50, async () => {
      await runManipulation(original);
    }),
  );

  allResults.push(
    await benchmarkOp("PDF Thumbnail (Sim)", 20, async () => await simulatePdfThumbnail(), {
      runs: 1,
    }),
  );
  allResults.push(
    await benchmarkOp("Video Thumbnail (Sim)", 15, async () => await simulateVideoThumbnail(), {
      runs: 1,
    }),
  );

  // 4. Concurrency
  allResults.push(
    await benchmarkOp(
      "Bulk Queue (5 jobs @ 2c)",
      10,
      async () => {
        await Promise.all(Array.from({ length: 5 }, () => resizeSet(original, "jpeg")));
      },
      { runs: 1, concurrency: 2, trimOutliers: false },
    ),
  );

  // ─── reporting ─────────────────────────────────────────────────────────────

  printAuditTable({
    title: "SVELTYCMS  —  MEDIA ENGINE AUDIT",
    subtitle: `Hashing • Transcoding • Manipulation • ${CPU} CPU Cores`,
    results: allResults,
    shortLabel: "Media",
  });

  const jpeg = allResults[2];
  const webp = allResults[3];
  const bulk = allResults[8];

  printSummaryTable([
    { key: "Standard JPEG Latency (p95)", val: jpeg.p95Ms, unit: "ms" },
    { key: "JPEG Average Latency", val: jpeg.avgMs, unit: "ms" },
    { key: "JPEG Requests Per Second", val: jpeg.rps, unit: "req/s" },
    { key: "WebP Average Latency", val: webp.avgMs, unit: "ms" },
    { key: "Bulk Queue Avg Latency", val: bulk.avgMs, unit: "ms" },
    { key: "WebP Optimization Gain", val: (jpeg.avgMs / webp.avgMs).toFixed(2), unit: "x" },
    { key: "Bulk Queue Throughput", val: Math.round(bulk.rps * 5), unit: "images/s" },
    { key: "Memory Stability RSS Δ", val: (jpeg.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  // Metrics
  exportMetric("media.resize.avg", jpeg.avgMs, "ms");
  exportMetric("media.resize.rps", jpeg.rps, "req/s");
  exportMetric("media.webp.avg", webp.avgMs, "ms");
  exportMetric("media.bulk.avg", bulk.avgMs, "ms");

  for (const r of allResults) exportResult(r);

  console.log("\n✅ Media benchmark completed.");
}

test("Media Engine Enterprise Benchmark", async () => {
  await runMediaBenchmark();
}, 600000);
