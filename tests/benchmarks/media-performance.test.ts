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

const CPU = os.cpus().length;
// Optimization: Leave headroom for the OS and Bun while Sharp works
sharp.concurrency(Math.max(1, Math.floor(CPU * 0.75)));

const TEST_IMAGE_PATH = path.join(os.tmpdir(), "svelty-media-benchmark", "test-1920x1080.jpg");

const SIZES = [200, 600, 1200];

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

async function resizeSet(buffer: Buffer, format: "jpeg" | "webp" | "avif") {
  for (const width of SIZES) {
    let pipe = sharp(buffer).resize(width, null, {
      fit: "cover",
      withoutEnlargement: true,
    });

    if (format === "jpeg") pipe = pipe.jpeg({ quality: 82, mozjpeg: true });
    if (format === "webp") pipe = pipe.webp({ quality: 80 });
    if (format === "avif") pipe = pipe.avif({ quality: 50, effort: 2 }); // Faster AVIF for bench

    await pipe.toBuffer();
  }
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

  // 6. Bulk Queue Simulation (Heavy)
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
