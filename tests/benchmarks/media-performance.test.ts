/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description Professional benchmark for SveltyCMS Media Engine (DAM) using Sharp.
 * Measures hashing, metadata, multi-scale resizing, and realistic pipeline performance.
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
  } catch {
    console.log("🎨 Generating realistic 1920×1080 test image...");
    await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 4,
        background: { r: 100, g: 150, b: 200, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg><text x="50%" y="50%" font-size="180" text-anchor="middle" dominant-baseline="middle" fill="white">SveltyCMS</text></svg>',
          ),
          gravity: "center",
        },
      ])
      .jpeg({ quality: 90 })
      .toFile(TEST_IMAGE_PATH);
  }

  const buffer = await fs.readFile(TEST_IMAGE_PATH);
  console.log(`📸 Test image ready: 1920×1080 JPEG (~${(buffer.length / 1024).toFixed(1)} KB)\n`);
  return buffer;
}

async function stabilize() {
  if (typeof Bun !== "undefined") Bun.gc(true);
  await new Promise((r) => setTimeout(r, 30)); // Give libvips / GC time to settle
}

test("Media Engine Performance Benchmark (Sharp)", async () => {
  console.log(`🖼️ SveltyCMS Media Engine Benchmark – ${new Date().toISOString()}`);
  console.log(
    `Runtime: Bun | Cores: ${os.cpus().length} | UV_THREADPOOL_SIZE: ${process.env.UV_THREADPOOL_SIZE ?? "default"}\n`,
  );

  const originalBuffer = await setupTestImage();
  await stabilize();

  const ITER_FAST = 2500;
  const ITER_HEAVY = 120; // More samples for expensive operations
  const WARMUP = 80;

  // 1. SHA-256 Hashing (very fast, CPU-bound)
  const hashResult = await runBenchmark({
    name: "Media: SHA-256 Hashing",
    iterations: ITER_FAST,
    warmupIterations: WARMUP,
    onIteration: async () => {
      createHash("sha256").update(originalBuffer).digest("hex");
    },
  });

  await stabilize();

  // 2. Metadata Extraction
  const metaResult = await runBenchmark({
    name: "Media: Metadata Extraction",
    iterations: ITER_FAST,
    warmupIterations: WARMUP,
    onIteration: async () => {
      await sharp(originalBuffer).metadata();
    },
  });

  await stabilize();

  // 3. Multi-scale Resize + JPEG Compression (realistic DAM pipeline)
  const resizeResult = await runBenchmark({
    name: "Media: Multi-scale Resize + JPEG (sm/md/lg)",
    iterations: ITER_HEAVY,
    warmupIterations: WARMUP,
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
  });

  await stabilize();

  // 4. Bulk / Concurrent Processing (realistic background job simulation)
  console.log("\n🔀 Testing bulk concurrent processing (10 images)...");
  const bulkStart = performance.now();

  await Promise.all(
    Array.from({ length: 10 }, async () => {
      const img = sharp(originalBuffer);
      for (const width of Object.values(SIZES)) {
        await img
          .clone()
          .resize(width, null, { fit: "cover", withoutEnlargement: true })
          .jpeg({ quality: QUALITY })
          .toBuffer();
      }
    }),
  );

  const bulkMs = performance.now() - bulkStart;

  // ========================
  // Summary
  // ========================
  console.log("\n" + "=".repeat(85));
  console.log("📊 SVELTYCMS MEDIA ENGINE PERFORMANCE SUMMARY");
  console.log("=".repeat(85));

  const table = [
    {
      Operation: "SHA-256 Hash",
      Avg: hashResult.avgMs.toFixed(4),
      p95: hashResult.p95Ms.toFixed(4),
      RPS: Math.round(hashResult.rps),
    },
    {
      Operation: "Metadata",
      Avg: metaResult.avgMs.toFixed(4),
      p95: metaResult.p95Ms.toFixed(4),
      RPS: Math.round(metaResult.rps),
    },
    {
      Operation: "Multi-scale Resize",
      Avg: resizeResult.avgMs.toFixed(4),
      p95: resizeResult.p95Ms.toFixed(4),
      RPS: Math.round(resizeResult.rps),
    },
  ];

  console.table(table);

  console.log(
    `\nBulk 10× multi-scale: ${bulkMs.toFixed(2)} ms total (~${(bulkMs / 10).toFixed(2)} ms per image)`,
  );

  const syncAvg = hashResult.avgMs + metaResult.avgMs + resizeResult.avgMs;
  console.log(`\n📈 PHASE 3 IMPACT (Background Jobs)`);
  console.log(`Synchronous total (avg): ${syncAvg.toFixed(3)} ms per upload`);
  console.log(`Async (hash + meta only): ${(hashResult.avgMs + metaResult.avgMs).toFixed(3)} ms`);
  console.log(
    `→ Potential API latency reduction: ~${resizeResult.avgMs.toFixed(1)} ms per request`,
  );
  console.log("=".repeat(85));

  // Export everything
  exportResult(hashResult);
  exportResult(metaResult);
  exportResult(resizeResult);

  const fullReport = {
    name: "Media Engine (Sharp)",
    timestamp: new Date().toISOString(),
    runtime: "Bun",
    cores: os.cpus().length,
    threadPool: process.env.UV_THREADPOOL_SIZE ?? "default",
    hash: { avgMs: hashResult.avgMs, p95Ms: hashResult.p95Ms, rps: hashResult.rps },
    metadata: { avgMs: metaResult.avgMs, p95Ms: metaResult.p95Ms, rps: metaResult.rps },
    multiScaleResize: {
      avgMs: resizeResult.avgMs,
      p95Ms: resizeResult.p95Ms,
      rps: resizeResult.rps,
    },
    bulk10ImagesMs: bulkMs,
    syncTotalAvgMs: syncAvg,
  };

  const resultsDir =
    process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(
    path.join(resultsDir, "media-performance.json"),
    JSON.stringify(fullReport, null, 2),
  );

  console.log(`💾 Full results exported to media-performance.json`);
}, 600000);
