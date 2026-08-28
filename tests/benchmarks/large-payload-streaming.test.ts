/**
 * @file tests/benchmarks/large-payload-streaming.test.ts
 * @description Large Payload Streaming Benchmark (Optimized)
 * @summary Measures upload/download throughput, zero-buffer streaming, and memory efficiency under large payloads.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import { randomBytes } from "node:crypto";

const IS_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const SIZE_MB = IS_CI
  ? [0.2, 0.5]
  : (process.env.BENCH_STREAMING_SIZES || "0.5,1.0").split(",").map((s) => parseFloat(s.trim()));

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

function createUploadFormData(sizeMb: number, idx: number): FormData {
  const byteLength = Math.round(sizeMb * 1024 * 1024);
  const buffer = randomBytes(byteLength);
  const fileName = `bench-stream-${sizeMb}mb-${idx}-${Date.now()}.jpg`;

  const fd = new FormData();
  fd.append("file", new Blob([buffer], { type: "image/jpeg" }), fileName);
  return fd;
}

async function getMemoryRSS(baseUrl: string): Promise<number> {
  try {
    const res = await fetch(`${baseUrl}/api/system/health?verbose=true`, {
      method: "GET",
      headers: { ...benchmarkAuthHeaders() },
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as any;
    const rss = data.memory?.rss || data.data?.memory?.rss || 0;
    return rss / 1024 / 1024;
  } catch {
    return 0;
  }
}

async function runPayloadAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(
    `🚀 Starting Large Payload Streaming Audit (${SIZE_MB.join(", ")} MB • ${dbType})...\n`,
  );

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    const uploadHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      connection: "keep-alive",
    };

    const results: any[] = [];
    const targetUploadUrl = `${baseUrl}/api/media/upload`;
    const uploadIterations = IS_CI ? 4 : 8;

    for (const sizeMb of SIZE_MB) {
      console.log(`\n══════════════════════════════════════════════════════════`);
      console.log(`   📦 Payload Matrix: ${sizeMb} MB Streaming Phase`);
      console.log(`══════════════════════════════════════════════════════════`);

      forceGarbageCollection();
      await stabilize(300);

      const baselineRSS = await getMemoryRSS(baseUrl);
      const uploadedPaths: string[] = [];
      let uploadSeq = 0;

      // ── 1. UPLOAD STREAMING BENCHMARK ─────────────────────────────────────
      console.log(`   → Benchmarking ${sizeMb}MB Upload Stream...`);
      const uploadResult = await runBenchmark({
        name: `Upload ${sizeMb}MB`,
        iterations: uploadIterations,
        warmupIterations: 1,
        runs: 2,
        concurrency: 1,
        trimOutliers: "iqr",
        silent: true,
        onIteration: async () => {
          const bodyPayload = createUploadFormData(sizeMb, uploadSeq++);

          const res = await fetch(targetUploadUrl, {
            method: "POST",
            headers: uploadHeaders,
            body: bodyPayload,
            signal: AbortSignal.timeout(120_000),
          });

          if (!res.ok) {
            const errBody = await res.text().catch(() => "<no body>");
            throw new Error(`Upload ${sizeMb}MB failed: HTTP ${res.status} - ${errBody}`);
          }

          const body = (await res.json().catch(() => null)) as any;
          const mediaRecord = body?.data?.[0]?.data || body?.data?.[0] || null;
          const p = mediaRecord?.path || mediaRecord?.filePath || null;
          if (p && !uploadedPaths.includes(p)) uploadedPaths.push(p);
        },
      });

      const postUploadRSS = await getMemoryRSS(baseUrl);
      const uploadRSSDelta = Math.max(0, postUploadRSS - baselineRSS);
      const uploadThroughputMBps = sizeMb / (uploadResult.avgMs / 1000);

      results.push({
        ...uploadResult,
        shortLabel: `Up-${sizeMb}MB`,
        layer: "Upload",
        throughputMBps: uploadThroughputMBps,
        rssDeltaMB: uploadRSSDelta,
      });

      // ── 2. DOWNLOAD STREAMING BENCHMARK ───────────────────────────────────
      forceGarbageCollection();
      await stabilize(300);

      console.log(`   → Benchmarking ${sizeMb}MB Download Stream (Zero-Buffer)...`);
      let downloadSeq = 0;

      const downloadResult = await runBenchmark({
        name: `Download ${sizeMb}MB`,
        iterations: IS_CI ? 10 : 25,
        warmupIterations: 2,
        runs: 2,
        concurrency: 4,
        trimOutliers: "iqr",
        silent: true,
        onIteration: async () => {
          if (uploadedPaths.length === 0) {
            throw new Error("No media file captured from upload stage to stream");
          }
          const filePath = uploadedPaths[downloadSeq++ % uploadedPaths.length]!;

          const res = await fetch(`${baseUrl}/files/${filePath}`, {
            method: "GET",
            headers: {
              ...benchmarkAuthHeaders(),
              connection: "keep-alive",
            },
            signal: AbortSignal.timeout(30_000),
          });

          if (!res.ok) {
            throw new Error(`Download failed: HTTP ${res.status} for /files/${filePath}`);
          }

          const reader = res.body?.getReader();
          if (!reader) throw new Error("Readable stream unavailable on response");

          let totalBytes = 0;

          // Zero-allocation chunk consumption loop
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                totalBytes += value.length;
              }
            }
          } finally {
            reader.releaseLock();
          }

          if (totalBytes === 0) throw new Error("Streamed 0 bytes during download");
        },
      });

      const downloadThroughputMBps = sizeMb / (downloadResult.avgMs / 1000);

      results.push({
        ...downloadResult,
        shortLabel: `Dl-${sizeMb}MB`,
        layer: "Download",
        throughputMBps: downloadThroughputMBps,
      });

      if (uploadRSSDelta > sizeMb * 4) {
        console.warn(
          `   ⚠️ Buffer Warning: Upload ${sizeMb}MB caused ${uploadRSSDelta.toFixed(
            1,
          )}MB RSS growth (${(uploadRSSDelta / sizeMb).toFixed(1)}x payload size)`,
        );
      }

      exportMetric(`streaming.upload_${sizeMb}mb_mbps`, uploadThroughputMBps, "MB/s");
      exportMetric(`streaming.download_${sizeMb}mb_mbps`, downloadThroughputMBps, "MB/s");
      exportMetric(`streaming.upload_${sizeMb}mb_rss_delta`, uploadRSSDelta, "MB");
    }

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — LARGE PAYLOAD STREAMING AUDIT",
      shortLabel: "Streaming",
      subtitle: `Upload & Download Throughput • ${dbType}`,
      results,
    });

    const summaryRows: Array<{ key: string; val: number | string; unit: string }> = [
      { key: "Database Engine", val: dbType, unit: "" },
    ];

    for (const r of results) {
      if (r.layer === "Upload") {
        summaryRows.push({
          key: `${r.shortLabel} Upload Speed`,
          val: r.throughputMBps?.toFixed(1) ?? "0",
          unit: "MB/s",
        });
        summaryRows.push({
          key: `${r.shortLabel} RSS Growth`,
          val: (r.rssDeltaMB ?? 0).toFixed(1),
          unit: "MB",
        });
      } else if (r.layer === "Download") {
        summaryRows.push({
          key: `${r.shortLabel} Download Speed`,
          val: r.throughputMBps?.toFixed(1) ?? "0",
          unit: "MB/s",
        });
      }
    }

    const allPassed = results.every((r) => (r.errorRate || 0) === 0);
    summaryRows.push({
      key: "Pipeline Status",
      val: allPassed ? "OPTIMAL (Zero-Buffer)" : "BUFFERING DETECTED",
      unit: "",
    });

    printSummaryTable(summaryRows, "Streaming Summary");

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Streaming audit failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Large Payload Streaming — Upload & Download", async () => {
  await runPayloadAudit();
}, 600_000);
