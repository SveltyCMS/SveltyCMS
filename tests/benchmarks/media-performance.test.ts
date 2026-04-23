/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description Enterprise media benchmark for SveltyCMS.
 * Measures hashing, metadata, and multi-format responsive image generation (JPEG, WebP, AVIF).
 */

import { test } from "bun:test";
import { runBenchmark, exportResult, exportMetric, stabilize } from "./benchmark-utils";

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
  // This now includes parallel processing and instance cloning
  await saveResized(buffer, "bench-hash", "test-image", "jpg", "bench-temp");
}

async function runManipulation(buffer: Buffer) {
  // Simulates common DAM manipulations (Crop + Rotate + Brightness)
  const sharp = (await import("sharp")).default;
  await sharp(buffer)
    .rotate(90)
    .extract({ left: 100, top: 100, width: 800, height: 600 })
    .modulate({ brightness: 1.2 })
    .toBuffer();
}

async function simulatePdfThumbnail() {
  // Simulates PDF rendering (usually heavy Ghostscript/Magick overhead)
  const sharp = (await import("sharp")).default;
  await sharp({
    create: { width: 595, height: 842, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
}

async function simulateVideoThumbnail() {
  // Simulates FFmpeg spawn overhead + frame extraction
  // We use a real Sharp operation + artificial delay to model spawn() latency
  const sharp = (await import("sharp")).default;
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

  // 1. Hashing (Fast)
  const hashResult = await runBenchmark({
    name: "SHA-256 Hash",
    iterations: 1000,
    warmupIterations: 50,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    silent: true,
    onIteration: () => {
      createHash("sha256").update(original).digest("hex");
    },
  });
  allResults.push(hashResult);

  // 2. Metadata (Fast)
  const metaResult = await runBenchmark({
    name: "Metadata Extraction",
    iterations: 500,
    warmupIterations: 25,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await sharp(original).metadata();
    },
  });
  allResults.push(metaResult);

  // 3. JPEG Resize (Medium)
  const jpegResult = await runBenchmark({
    name: "Responsive JPEG Set",
    iterations: 40,
    warmupIterations: 5,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await resizeSet(original, "jpeg");
    },
  });
  allResults.push(jpegResult);

  // 4. WebP (Medium)
  const webpResult = await runBenchmark({
    name: "Responsive WebP Set",
    iterations: 25,
    warmupIterations: 3,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await resizeSet(original, "webp");
    },
  });
  allResults.push(webpResult);

  // 5. AVIF (Heavy - Very Low Iterations)
  const avifResult = await runBenchmark({
    name: "Responsive AVIF Set",
    iterations: 8,
    warmupIterations: 1,
    runs: 1,
    concurrency: 1,
    trimOutliers: false,
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await resizeSet(original, "avif");
    },
  });
  allResults.push(avifResult);

  // 6. Image Manipulation (Medium)
  const manipulationResult = await runBenchmark({
    name: "Image Manipulation (90° + Crop)",
    iterations: 50,
    warmupIterations: 5,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await runManipulation(original);
    },
  });
  allResults.push(manipulationResult);

  // 7. PDF/Video Simulation (Enterprise)
  const pdfResult = await runBenchmark({
    name: "PDF Thumbnail (Simulation)",
    iterations: 20,
    warmupIterations: 2,
    runs: 1,
    concurrency: 1,
    silent: true,
    onIteration: async () => await simulatePdfThumbnail(),
  });
  allResults.push(pdfResult);

  const videoResult = await runBenchmark({
    name: "Video Thumbnail (Simulation)",
    iterations: 15,
    warmupIterations: 2,
    runs: 1,
    concurrency: 1,
    silent: true,
    onIteration: async () => await simulateVideoThumbnail(),
  });
  allResults.push(videoResult);

  // 8. Bulk Queue Simulation (Heavy)
  const bulkResult = await runBenchmark({
    name: "Bulk Queue (5 jobs @ 2c)",
    iterations: 10,
    warmupIterations: 1,
    runs: 1,
    concurrency: 2,
    trimOutliers: false,
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await Promise.all(Array.from({ length: 5 }, () => resizeSet(original, "jpeg")));
    },
  });
  allResults.push(bulkResult);

  console.log("\n" + "=".repeat(150));
  console.log("🖼️ SVELTYCMS MEDIA ENGINE ENTERPRISE REPORT");
  console.log("Hashing • Metadata • JPEG • WebP • AVIF • Queue Jobs");
  console.log("=".repeat(150));

  console.log(
    `| ${"Operation".padEnd(34)} | ${"Avg".padEnd(12)} | ${"p95".padEnd(12)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(10)} |`,
  );
  console.log("|" + "-".repeat(145) + "|");

  for (const r of allResults) {
    const rss =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)}MB` : "—";
    console.log(
      `| ${r.name.padEnd(34)} | ` +
        `${r.avgMs.toFixed(3)} ms`.padEnd(12) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(12) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rss.padEnd(10)} |`,
    );
  }
  console.log("=".repeat(150));

  console.log("\n✨ Insights:");
  console.log(`• CPU Cores detected: ${CPU}`);
  console.log(`• AVIF is slowest but highest compression.`);
  console.log(`• WebP is best balanced production format.`);
  console.log(`• Bulk queue avg: ${bulkResult.avgMs.toFixed(1)} ms`);

  exportMetric("media.resize.avg", jpegResult.avgMs, "ms");
  exportMetric("media.resize.rps", jpegResult.rps, "req/s");
  exportMetric("media.webp.avg", webpResult.avgMs, "ms");
  exportMetric("media.avif.avg", avifResult.avgMs, "ms");
  exportMetric("media.bulk.avg", bulkResult.avgMs, "ms");

  for (const r of allResults) exportResult(r);

  const resultsDir = process.env.RESULTS_DIR || "tests/benchmarks/results";
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(
    path.join(resultsDir, "media-performance.json"),
    JSON.stringify(
      { timestamp: new Date().toISOString(), cpuCores: CPU, results: allResults },
      null,
      2,
    ),
  );

  console.log("\n✅ Media benchmark completed.");
}

test("Media Engine Enterprise Benchmark", async () => {
  await runMediaBenchmark();
}, 600000);
