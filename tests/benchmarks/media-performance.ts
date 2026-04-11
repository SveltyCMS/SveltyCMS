/**
 * @file tests/benchmarks/media-performance.ts
 * @description Enhanced high-resolution benchmark for SveltyCMS Media Engine (DAM) – Phase 3
 * Features:
 * - Multi-scale resizing + JPEG compression
 * - Statistical analysis (Avg, p95, StdDev)
 * - Thread pool scaling demo
 * - JSON result export
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";

const SIZES = { sm: 200, md: 600, lg: 1200 };
const QUALITY = 80; // realistic web quality
const ITERATIONS_FAST = 2000; // hash + meta
const ITERATIONS_HEAVY = 50; // resize (expensive)
const WARMUP_ROUNDS = 5;

const TMP_DIR = path.join(os.tmpdir(), "svelty-bench-media");
const TEST_IMAGE_PATH = path.join(TMP_DIR, "test-1920x1080.jpg");

async function setup() {
  await fs.mkdir(TMP_DIR, { recursive: true });

  // Create realistic test image if missing
  try {
    await fs.access(TEST_IMAGE_PATH);
  } catch {
    console.log("Generating realistic test image (1920x1080)...");
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
            '<svg><text x="50%" y="50%" font-size="200" text-anchor="middle" dominant-baseline="middle" fill="white">SveltyCMS Benchmark</text></svg>',
          ),
          gravity: "center",
        },
      ])
      .jpeg({ quality: 90 })
      .toFile(TEST_IMAGE_PATH);
  }

  const buffer = await fs.readFile(TEST_IMAGE_PATH);
  const fileSizeKb = (buffer.length / 1024).toFixed(2);
  console.log(`Test Image: 1920×1080 JPEG (${fileSizeKb} KB) from ${TEST_IMAGE_PATH}\n`);

  return buffer;
}

function stats(times: number[]): {
  avg: string;
  min: string;
  max: string;
  p95: string;
  stddev: string;
} {
  const sum = times.reduce((a, b) => a + b, 0);
  const avg = sum / times.length;
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(times.length * 0.95)];
  const variance = times.reduce((a, b) => a + (b - avg) ** 2, 0) / times.length;
  const stddev = Math.sqrt(variance);
  return {
    avg: avg.toFixed(3),
    min: Math.min(...times).toFixed(3),
    max: Math.max(...times).toFixed(3),
    p95: p95.toFixed(3),
    stddev: stddev.toFixed(3),
  };
}

async function runBenchmark() {
  console.log(`🖼️ SveltyCMS Media Engine Benchmark – ${new Date().toISOString()}`);
  console.log(
    `Node: ${process.version} | CPU cores: ${os.cpus().length} | Thread pool: ${process.env.UV_THREADPOOL_SIZE ?? 4}\n`,
  );

  const originalBuffer = await setup();

  // Warm-up
  console.log(`Warm-up (${WARMUP_ROUNDS} rounds)...`);
  for (let i = 0; i < WARMUP_ROUNDS; i++) {
    await sharp(originalBuffer).metadata();
    await sharp(originalBuffer).resize(600).toBuffer();
  }

  // 1. Hashing
  const hashTimes: number[] = [];
  console.log(`1. SHA-256 Hashing (${ITERATIONS_FAST} iterations)...`);
  for (let i = 0; i < ITERATIONS_FAST; i++) {
    const start = performance.now();
    createHash("sha256").update(originalBuffer).digest("hex");
    hashTimes.push(performance.now() - start);
  }
  const hashStats = stats(hashTimes);
  console.log(
    ` Avg: ${hashStats.avg} ms | min/max/p95: ${hashStats.min}/${hashStats.max}/${hashStats.p95} ms | stddev: ${hashStats.stddev} ms\n`,
  );

  // 2. Metadata
  const metaTimes: number[] = [];
  console.log(`2. Metadata Extraction (${ITERATIONS_FAST} iterations)...`);
  for (let i = 0; i < ITERATIONS_FAST; i++) {
    const start = performance.now();
    await sharp(originalBuffer).metadata();
    metaTimes.push(performance.now() - start);
  }
  const metaStats = stats(metaTimes);
  console.log(
    ` Avg: ${metaStats.avg} ms | min/max/p95: ${metaStats.min}/${metaStats.max}/${metaStats.p95} ms | stddev: ${metaStats.stddev} ms\n`,
  );

  // 3. Multi-scale Resizing + Compression (realistic pipeline)
  const resizeTimes: number[] = [];
  console.log(`3. Multi-scale Resize + JPEG compress (${ITERATIONS_HEAVY} iterations)...`);
  for (let i = 0; i < ITERATIONS_HEAVY; i++) {
    const start = performance.now();
    const img = sharp(originalBuffer);
    for (const width of Object.values(SIZES)) {
      await img
        .clone()
        .resize(width, null, { fit: "cover", withoutEnlargement: true })
        .jpeg({ quality: QUALITY, mozjpeg: true })
        .toBuffer(); // simulate write
    }
    resizeTimes.push(performance.now() - start);
  }
  const resizeStats = stats(resizeTimes);
  console.log(
    ` Avg: ${resizeStats.avg} ms | min/max/p95: ${resizeStats.min}/${resizeStats.max}/${resizeStats.p95} ms | stddev: ${resizeStats.stddev} ms\n`,
  );

  // 4. Bulk Processing (Next-Level Validation)
  console.log(`4. Bulk Parallel Processing (10 concurrent images)...`);
  const bulkStart = performance.now();
  await Promise.all(
    Array.from({ length: 10 }).map(async () => {
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
  const bulkTotal = (performance.now() - bulkStart).toFixed(2);
  console.log(` Total time for 10 images: ${bulkTotal} ms\n`);

  // Phase 3 Impact
  console.log("-----------------------------------------------------------");
  console.log("📈 PHASE 3 IMPACT ANALYSIS (Background Jobs)");
  console.log("-----------------------------------------------------------");
  const syncTotalAvg =
    parseFloat(hashStats.avg) + parseFloat(metaStats.avg) + parseFloat(resizeStats.avg);
  const asyncTotalAvg = parseFloat(hashStats.avg) + parseFloat(metaStats.avg);
  console.log(`Synchronous Block Time (avg): ~${syncTotalAvg.toFixed(2)} ms`);
  console.log(`Asynchronous Block Time (avg): ~${asyncTotalAvg.toFixed(2)} ms`);
  const reduction = ((parseFloat(resizeStats.avg) / syncTotalAvg) * 100).toFixed(1);
  console.log(`⚡ API Latency Reduction: -${reduction}% (resize deferred)`);
  console.log(`🚀 Real UX: Instant response vs. ${resizeStats.avg} ms processing delay per image`);
  console.log("-----------------------------------------------------------");

  // Save results to JSON for CI tracking
  const resultsDir =
    process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
  const filePath = path.join(resultsDir, "media-performance.json");

  const results = {
    name: "Media Engine",
    timestamp: new Date().toISOString(),
    node: process.version,
    cores: os.cpus().length,
    threadPool: process.env.UV_THREADPOOL_SIZE ?? 4,
    hashStats,
    metaStats,
    resizeStats,
    bulkTotal,
    syncTotalAvg: syncTotalAvg.toFixed(3),
    asyncTotalAvg: asyncTotalAvg.toFixed(3),
    reduction: `${reduction}%`,
  };

  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(results, null, 2));
  console.log(`💾 Results exported to: ${filePath}`);
}

runBenchmark().catch(console.error);
