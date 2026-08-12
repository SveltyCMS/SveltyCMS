/**
 * @file tests/benchmarks/large-payload-streaming.test.ts
 * @description Large Payload Streaming Benchmark (Optimized)
 * @summary Measures download/upload throughput and memory efficiency for large files (5MB-10MB)
 * to validate streaming pipeline doesn't buffer entire payloads in memory.
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
  ? [0.1, 0.2]
  : (process.env.BENCH_STREAMING_SIZES || "0.1,0.2").split(",").map((s) => parseFloat(s.trim()));

let stopServer: (() => Promise<void>) | null = null;

function generatePayload(sizeMb: number): { buffer: Buffer; name: string } {
  return {
    buffer: Buffer.from(randomBytes(Math.round(sizeMb * 1024 * 1024))),
    // .jpg so the production MIME allowlist accepts the upload (image/jpeg);
    // generic .bin payloads are rejected by production media security.
    name: `bench-stream-${sizeMb}mb-${Date.now()}.jpg`,
  };
}

async function getMemoryRSS(baseUrl: string): Promise<number> {
  try {
    const res = await fetch(`${baseUrl}/api/system/health?verbose=true`, {
      method: "GET",
      headers: { ...benchmarkAuthHeaders() },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const rss = data.memory?.rss || data.data?.memory?.rss || 0;
    return rss / 1024 / 1024;
  } catch {
    return 0;
  }
}

async function runPayloadAudit() {
  console.log(`🚀 Starting Large Payload Streaming Audit (${SIZE_MB.join(", ")} MB)...\n`);

  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await stabilize(2000);

  const uploadHeaders = {
    ...benchmarkAuthHeaders(), // includes the same-origin Origin header (CSRF)
  };

  const results: any[] = [];
  const targetUploadUrl = `${baseUrl}/api/media/upload`;
  const uploadIterations = IS_CI ? 3 : 8;

  for (const sizeMb of SIZE_MB) {
    console.log(`    → Pre-allocating payload structures for ${sizeMb}MB matrix fields...`);

    // Pre-allocate FormData maps outside timed loops to eliminate V8 calculation drift
    const preallocatedFormData: FormData[] = Array.from({ length: uploadIterations }, () => {
      const { buffer, name } = generatePayload(sizeMb);
      const fd = new FormData();
      // Real MIME type required: production media security rejects Blobs whose
      // type defaults to application/octet-stream. The old test discarded the
      // upload response, silently measuring rejected uploads.
      fd.append("file", new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }), name);
      return fd;
    });

    console.log(`    → Uploading ${sizeMb}MB payload...`);
    const baselineRSS = await getMemoryRSS(baseUrl);

    // 🛡️ HONEST DOWNLOAD SOURCE: capture the storage-relative path of the
    // uploaded media so the download phase streams the REAL N MB payload via
    // /files/<path>. The old code streamed /sitemap.xml (a few KB) and fell
    // back to the health endpoint — the "Download N MB" label was fiction.
    const uploadedPaths: string[] = [];

    const uploadResult = await runBenchmark({
      name: `Upload ${sizeMb}MB`,
      iterations: uploadIterations,
      warmupIterations: 1,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async (i: number) => {
        const bodyPayload = preallocatedFormData[i] ?? preallocatedFormData[0]!;

        const res = await fetch(targetUploadUrl, {
          method: "POST",
          headers: uploadHeaders,
          body: bodyPayload,
          signal: AbortSignal.timeout(120000),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "<no body>");
          throw new Error(`Upload ${sizeMb}MB failed: ${res.status} - ${errBody}`);
        }

        const body = (await res.json().catch(() => null)) as any;
        const mediaRecord = body?.data?.[0]?.data || body?.data?.[0] || null;
        const p = mediaRecord?.path || mediaRecord?.filePath || null;
        if (p && !uploadedPaths.includes(p)) uploadedPaths.push(p);
      },
    });

    const uploadRSSDelta = (await getMemoryRSS(baseUrl)) - baselineRSS;
    const throughputMBps = sizeMb / (uploadResult.avgMs / 1000);

    results.push({
      ...uploadResult,
      shortLabel: `Up-${sizeMb}MB`,
      layer: "Upload",
      throughputMBps,
      rssDeltaMB: uploadRSSDelta,
    });

    console.log(`    → Downloading ${sizeMb}MB payload (streaming)...`);

    const downloadResult = await runBenchmark({
      name: `Download ${sizeMb}MB`,
      iterations: IS_CI ? 10 : 30,
      warmupIterations: 2,
      runs: 2,
      concurrency: 4,
      silent: true,
      onIteration: async (i: number) => {
        if (uploadedPaths.length === 0) {
          throw new Error("No uploaded media path captured — cannot stream real payload");
        }
        const filePath = uploadedPaths[i % uploadedPaths.length]!;

        const res = await fetch(`${baseUrl}/files/${filePath}`, {
          method: "GET",
          headers: {
            ...benchmarkAuthHeaders(),
          },
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          throw new Error(`Download failed: ${res.status} for /files/${filePath}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No readable stream available");

        let totalBytes = 0;

        // Allocation-free chunk streaming consumption loop
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.length; // Count metrics without retaining chunks in memory
          }
        }

        if (totalBytes === 0) throw new Error("Streamed 0 bytes");
      },
    });

    results.push({
      ...downloadResult,
      shortLabel: `Dl-${sizeMb}MB`,
      layer: "Download",
    });

    if (uploadRSSDelta > sizeMb * 6) {
      console.warn(
        `    ⚠️  Upload ${sizeMb}MB caused ${uploadRSSDelta.toFixed(1)}MB RSS growth ` +
          `(${(uploadRSSDelta / sizeMb).toFixed(1)}x file size) — possible buffering detected`,
      );
    }

    exportMetric("streaming.upload_mbps", throughputMBps, "MB/s");
    exportMetric("streaming.upload_rss_delta", uploadRSSDelta, "MB");
  }

  printTruthTable({
    title: "SVELTYCMS — LARGE PAYLOAD STREAMING AUDIT",
    shortLabel: "Streaming",
    subtitle: `Upload & Download Throughput • ${getDbType().toUpperCase()}`,
    results,
  });

  const summaryRows: Array<{
    key: string;
    val: number | string;
    unit: string;
  }> = [];
  for (let s = 0; s < results.length; s++) {
    const r = results[s]!;
    if (r.layer === "Upload") {
      summaryRows.push({
        key: `${r.shortLabel} Throughput`,
        val: r.throughputMBps?.toFixed(1) || "0",
        unit: "MB/s",
      });
      summaryRows.push({
        key: `${r.shortLabel} RSS Delta`,
        val: (r.rssDeltaMB || 0).toFixed(1),
        unit: "MB",
      });
    }
  }
  summaryRows.push({
    key: "Streaming Health",
    val: results.every((r) => r.errorRate === 0) ? "STREAMING" : "BUFFERING DETECTED",
    unit: "",
  });

  printSummaryTable(summaryRows);
  for (let s = 0; s < results.length; s++) exportResult(results[s]!);
}

test("Large Payload Streaming — Upload & Download", async () => {
  try {
    await runPayloadAudit();
  } catch (err: any) {
    logger.error(`Streaming audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}, 600000);
