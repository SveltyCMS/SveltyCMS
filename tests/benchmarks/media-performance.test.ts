/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS Media Engine (DAM) using Sharp.
 *              Measures hashing, metadata extraction, multi-scale resizing, and bulk processing.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import sharp from "sharp";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SIZES = { sm: 200, md: 600, lg: 1200 };
const QUALITY = 80;
const TEST_IMAGE_PATH = path.join(os.tmpdir(), "svelty-bench-media", "test-1920x1080.jpg");

async function setupTestImage() {
  const tmpDir = path.dirname(TEST_IMAGE_PATH);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    await fs.access(TEST_IMAGE_PATH);
    return await fs.readFile(TEST_IMAGE_PATH);
  } catch {
    console.log("🎨 Generating realistic 1920×1080 test image...");
    const image = sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 4,
        background: { r: 100, g: 150, b: 200, alpha: 1 },
      },
    }).composite([
      {
        input: Buffer.from(
          '<svg><text x="50%" y="50%" font-size="180" text-anchor="middle" dominant-baseline="middle" fill="white">SveltyCMS</text></svg>',
        ),
        gravity: "center",
      },
    ]);

    await image.jpeg({ quality: 90 }).toFile(TEST_IMAGE_PATH);
    const buffer = await image.toBuffer();
    console.log(`📸 Test image ready: 1920×1080 JPEG (~${(buffer.length / 1024).toFixed(1)} KB)\n`);
    return buffer;
  }
}

export async function runMediaBenchmark() {
  console.log("🖼️ Starting SveltyCMS Media Engine (Sharp) Performance Benchmark...\n");

  const originalBuffer = await setupTestImage();

  const ITER_FAST = 3000;
  const ITER_HEAVY = 400; // Fewer iterations for expensive operations
  const WARMUP = 150;
  const RUNS = 3;

  // 1. SHA-256 Hashing
  const hashResult = await runBenchmark({
    name: "Media: SHA-256 Hashing",
    iterations: ITER_FAST,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    onIteration: async () => {
      createHash("sha256").update(originalBuffer).digest("hex");
    },
    silent: true,
  });

  // 2. Metadata Extraction
  const metaResult = await runBenchmark({
    name: "Media: Metadata Extraction",
    iterations: ITER_FAST,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    onIteration: async () => {
      await sharp(originalBuffer).metadata();
    },
    silent: true,
  });

  // 3. Multi-scale Resize + JPEG (realistic DAM pipeline)
  const resizeResult = await runBenchmark({
    name: "Media: Multi-scale Resize + JPEG (sm/md/lg)",
    iterations: ITER_HEAVY,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    onIteration: async () => {
      const img = sharp(originalBuffer);
      for (const width of Object.values(SIZES)) {
        await img
          .clone()
          .resize(width, null, { fit: "cover", withoutEnlargement: true })
          .jpeg({ quality: QUALITY, mozjpeg: true })
          .toBuffer();
      }
    },
    silent: true,
  });

  // 4. Bulk Concurrent Processing (background job simulation)
  console.log("\n🔀 Testing bulk concurrent processing (10 images in parallel)...");
  const bulkStart = performance.now();

  await Promise.all(
    Array.from({ length: 10 }, async () => {
      const img = sharp(originalBuffer);
      for (const width of Object.values(SIZES)) {
        await img
          .clone()
          .resize(width, null, { fit: "cover", withoutEnlargement: true })
          .jpeg({ quality: QUALITY, mozjpeg: true })
          .toBuffer();
      }
    }),
  );

  const bulkMs = performance.now() - bulkStart;

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(130));
  console.log("   🖼️  SVELTYCMS MEDIA ENGINE (SHARP) PERFORMANCE AUDIT");
  console.log("   High-Fidelity • Multiple Runs • IQR Trimming • Memory Tracking");
  console.log("=".repeat(130));

  console.log(
    `| ${"Operation".padEnd(38)} | ${"Avg Latency".padEnd(22)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(38 + 22 + 14 + 12 + 12 + 6) + "|");

  const mediaResults = [hashResult, metaResult, resizeResult];

  for (const r of mediaResults) {
    const rssDelta =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    console.log(
      `| ${r.name.padEnd(38)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(22) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${rssDelta.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(130));

  console.log(`\n📈 Bulk Processing (10 images concurrent): ${bulkMs.toFixed(1)} ms total`);
  console.log(`   → ~${(bulkMs / 10).toFixed(2)} ms per image`);

  const syncTotal = hashResult.avgMs + metaResult.avgMs + resizeResult.avgMs;
  console.log(`\n✨ Pipeline Insights:`);
  console.log(`   • Synchronous full pipeline (hash + meta + resize): ${syncTotal.toFixed(3)} ms`);
  console.log(`   • Async offload recommended for resize step`);
  console.log(
    `   • Expected API impact if resize is done inline: +${resizeResult.avgMs.toFixed(1)} ms`,
  );

  // Export results
  mediaResults.forEach((r) => exportResult(r));

  const resultsDir = process.env.RESULTS_DIR || "tests/benchmarks/results";
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(
    path.join(resultsDir, "media-performance.json"),
    JSON.stringify(
      {
        name: "Media Engine (Sharp)",
        timestamp: new Date().toISOString(),
        runtime: "Bun",
        cores: os.cpus().length,
        hash: { avgMs: hashResult.avgMs, p95Ms: hashResult.p95Ms, rps: hashResult.rps },
        metadata: { avgMs: metaResult.avgMs, p95Ms: metaResult.p95Ms, rps: metaResult.rps },
        multiScaleResize: {
          avgMs: resizeResult.avgMs,
          p95Ms: resizeResult.p95Ms,
          rps: resizeResult.rps,
        },
        bulk10ImagesMs: bulkMs,
        syncTotalAvgMs: syncTotal,
      },
      null,
      2,
    ),
  );

  console.log("\n✅ Media Engine benchmark completed.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Media Engine Performance (Sharp)", async () => {
    await runMediaBenchmark();
  }, 600000);
}
