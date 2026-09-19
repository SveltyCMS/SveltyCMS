/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description Enterprise Media Pipeline Benchmark (Optimized)
 * @summary Measures full upload, Sharp thumbnail processing, SDK vs HTTP latency, asset streaming throughput,
 * and the media-gallery composite index (`tenantId` + `folderId` + `ORDER BY updatedAt DESC`, LIMIT 100).
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
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type {
  DatabaseAdapter,
  DatabaseId,
  EntityCreate,
  MediaItem,
  QueryFilter,
} from "@src/databases/db-interface";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

const IS_CI =
  process.env.CI === "true" ||
  process.env.BENCHMARK_CI === "true" ||
  process.env.GITHUB_ACTIONS === "true";

/**
 * Media-gallery rows to seed for the index scenario. The point is to make the
 * gallery query's index spend real work: `/mediagallery` asks for ONE folder
 * (`tenantId` + `folderId`, `ORDER BY updatedAt DESC`, `pageSize: 100` → LIMIT
 * 101) out of a tenant-wide pool, so a missing composite index degrades to a full
 * scan + sort of the whole pool.
 */
const GALLERY_ROWS = IS_CI ? 1_200 : 4_000;
const GALLERY_FOLDERS = 40;
const GALLERY_PAGE_SIZE = 100;
const GALLERY_BATCH = 250;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

// Pre-render static base JPEG buffer
let baseJpegBuffer: Buffer;

async function prepareBaseImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 3,
      background: { r: 64, g: 64, b: 96 },
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Creates an isolated worker-safe buffer with unique trailing bytes */
function createWorkerImageBuffer(seq: number): Buffer {
  const buf = Buffer.allocUnsafe(baseJpegBuffer.length + 4);
  baseJpegBuffer.copy(buf);
  buf.writeUInt32BE(seq, baseJpegBuffer.length);
  return buf;
}

async function runMediaAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Media Pipeline Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    baseJpegBuffer = await prepareBaseImage();

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    const { LocalCMS } = await import("@src/services/sdk");
    const { settingsService } = await import("@src/services/core/settings-service");

    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database initialization failed");

    await settingsService.loadSettingsCache();
    const cms = new LocalCMS(db);

    const results: any[] = [];
    const uploadedAssetPaths: string[] = [];

    // ── 1. IN-PROCESS SDK MEDIA PROCESSING BENCHMARK ─────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 1. Measuring Local SDK Media Upload & Sharp Processing...");
    let sdkSeq = 0;

    const sdkResult = await runBenchmark({
      name: "SDK: Media Processing",
      iterations: 80,
      warmupIterations: 8,
      runs: 2,
      concurrency: 2,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const currentSeq = sdkSeq++;
        const imageBuffer = createWorkerImageBuffer(currentSeq);

        const file = new File([new Uint8Array(imageBuffer)], `sdk-media-${currentSeq}.jpg`, {
          type: "image/jpeg",
        });

        const res = await cms.media.upload(file, {
          userId: "system",
          tenantId: "global" as any,
        });

        if (!res.success || (!res.data?.url && !(res.data as any)?.path)) {
          throw new Error("SDK media upload returned invalid payload");
        }

        const p = (res.data as any)?.path || res.data?.url;
        if (p) uploadedAssetPaths.push(p);
      },
    });
    results.push({ ...sdkResult, shortLabel: "SDK", layer: "SDK" });

    // ── 2. HTTP MEDIA UPLOAD PIPELINE BENCHMARK ──────────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 2. Measuring HTTP Multipart Upload & Processing Pipeline...");
    // Seed out of the SDK range so the HTTP phase produces unique buffers —
    // byte-identical buffers would hash-collide with the SDK uploads and hit
    // the media dedup branch (crud.update without a real insert), which is not
    // what this phase claims to measure.
    let httpSeq = 1_000_000;
    const uploadHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      Origin: baseUrl,
      connection: "keep-alive",
    };

    const httpResult = await runBenchmark({
      name: "HTTP: Media Upload",
      iterations: 80,
      warmupIterations: 8,
      runs: 2,
      concurrency: 2,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const currentSeq = httpSeq++;
        const imageBuffer = createWorkerImageBuffer(currentSeq);

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
        formData.append("files", blob, `http-media-${currentSeq}.jpg`);

        const res = await fetch(`${baseUrl}/api/media/upload`, {
          method: "POST",
          headers: uploadHeaders,
          body: formData,
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Media upload failed: HTTP ${res.status} ${text}`);
        }

        // Fast zero-copy stream drain
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...httpResult, shortLabel: "HTTP", layer: "HTTP" });

    // ── 3. THUMBNAIL RETRIEVAL & ASSET STREAMING ────────────────────────────
    if (uploadedAssetPaths.length > 0) {
      forceGarbageCollection();
      await stabilize(150);

      console.log("   → 3. Measuring Thumbnail Transformation & Asset Streaming...");
      const samplePath = uploadedAssetPaths[0]!;
      const cleanPath = samplePath.startsWith("/") ? samplePath.slice(1) : samplePath;

      const streamResult = await runBenchmark({
        name: "HTTP: Asset Stream (Thumbnail)",
        iterations: 100,
        warmupIterations: 10,
        runs: 2,
        concurrency: 4,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const res = await fetch(`${baseUrl}/files/${cleanPath}?w=300&h=200&q=80`, {
            method: "GET",
            headers: {
              ...benchmarkAuthHeaders(),
              connection: "keep-alive",
            },
            signal: AbortSignal.timeout(10_000),
          });

          if (!res.ok) {
            throw new Error(`Thumbnail stream failed: HTTP ${res.status}`);
          }
          await res.arrayBuffer().catch(() => {});
        },
      });
      results.push({ ...streamResult, shortLabel: "Stream", layer: "Storage" });
    }

    // ── 4. MEDIA GALLERY COMPOSITE INDEX ────────────────────────────────────
    // The gallery query shape is `WHERE tenantId = ? AND folderId = ?
    // ORDER BY updatedAt DESC LIMIT 101` (src/routes/(app)/mediagallery/+page.server.ts
    // → `media.files.getByFolder`). `index-pressure` measures a SYNTHETIC content
    // collection, so the media composite-index claim had no coverage at all.
    forceGarbageCollection();
    await stabilize(150);
    console.log("   → 4. Measuring Media Gallery Query (composite index)...");
    const gallery = await runGalleryIndexAudit(db);
    results.push({ ...gallery.result, shortLabel: "Gallery", layer: "DB" });

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    const httpOverheadMs = Math.max(0, httpResult.avgMs - sdkResult.avgMs);
    const httpTaxPct =
      sdkResult.avgMs > 0 ? ((httpOverheadMs / sdkResult.avgMs) * 100).toFixed(1) : "0.0";

    printTruthTable({
      title: "SVELTYCMS — MEDIA PIPELINE AUDIT",
      shortLabel: "Media",
      subtitle: `Upload → Sharp Resize → Storage • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "SDK Upload Latency (Avg)", val: sdkResult.avgMs.toFixed(2), unit: "ms" },
        { key: "HTTP Pipeline Latency (Avg)", val: httpResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "HTTP p95 Latency",
          val: (httpResult.p95Ms || httpResult.avgMs).toFixed(2),
          unit: "ms",
        },
        {
          key: "HTTP Transport Tax",
          val: `+${httpOverheadMs.toFixed(2)} (${httpTaxPct}%)`,
          unit: "ms",
        },
        { key: "SDK Throughput", val: Math.round(sdkResult.rps || 0), unit: "img/s" },
        { key: "HTTP Throughput", val: Math.round(httpResult.rps || 0), unit: "img/s" },
        { key: "HTTP Memory RSS Δ", val: (httpResult.rssDelta ?? 0).toFixed(1), unit: "MB" },
        {
          key: `Gallery Query p95 (${gallery.rows} rows)`,
          val: (gallery.result.p95Ms || gallery.result.avgMs).toFixed(3),
          unit: "ms",
        },
        {
          key: "Gallery Index Used",
          val: gallery.probe.supported
            ? gallery.probe.usedIndex
              ? `YES (${gallery.probe.indexName})`
              : `NO — planner picked ${gallery.probe.detail.slice(0, 80)}`
            : "not assertable (no SQL planner)",
          unit: "",
        },
        { key: "HTTP Memory RSS Δ", val: (httpResult.rssDelta ?? 0).toFixed(1), unit: "MB" },
      ],
      "Media Pipeline Summary",
    );

    exportMetric("media.sdk.latency_avg_ms", sdkResult.avgMs, "ms");
    exportMetric("media.http.latency_avg_ms", httpResult.avgMs, "ms");
    exportMetric("media.http.latency_p95_ms", httpResult.p95Ms || httpResult.avgMs, "ms");
    exportMetric("media.http.throughput_rps", Math.round(httpResult.rps || 0), "img/s");
    exportMetric("media.http.rss_delta_mb", httpResult.rssDelta ?? 0, "MB");
    exportMetric("media.gallery.rows", gallery.rows, "rows");
    // Index effectiveness is a pass/fail fact, not a latency sample:
    // 1 = planner used the composite index, 0 = full scan, -1 = not assertable (no SQL planner).
    exportMetric(
      "media.gallery.index_used",
      gallery.probe.supported ? (gallery.probe.usedIndex ? 1 : 0) : -1,
      "bool",
    );

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Media benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

interface GalleryPlanProbe {
  /** False when the adapter exposes no SQL planner (MongoDB). */
  supported: boolean;
  usedIndex: boolean;
  indexName: string;
  detail: string;
}

/** Seeded media rows for the gallery scenario — one shape, one folder pool. */
interface GalleryRowShape {
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  hash: string;
  path: string;
  createdBy: string;
  updatedBy: string;
  metadata: Record<string, unknown>;
  thumbnails: Record<string, unknown>;
  access: string;
  folderId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Composite index the gallery query must be able to ride, per SQL dialect. */
function galleryIndexNameForDialect(dbType: string): string {
  switch (dbType.toLowerCase()) {
    case "sqlite":
      return "idx_media_items_tenant_folder_updated";
    case "postgresql":
      return "media_items_tenant_folder_updated_idx";
    case "mariadb":
      return "tenant_folder_updated_idx";
    default:
      return "";
  }
}

/**
 * Ask the SQL planner how it would satisfy the gallery query shape.
 *
 * The latency number alone cannot prove index effectiveness — a small table is
 * fast unindexed. `EXPLAIN` can, and the plan is reported verbatim so a failure
 * is diagnosable instead of mysterious.
 */
async function probeGalleryIndexPlan(
  db: DatabaseAdapter,
  tenantId: string,
  folderId: string,
): Promise<GalleryPlanProbe> {
  const dialect = getDbType().toLowerCase();
  const indexName = galleryIndexNameForDialect(dialect);
  const raw = (
    db as unknown as { raw?: { execute?: (sql: string, params?: unknown[]) => Promise<unknown> } }
  ).raw;
  if (!indexName || typeof raw?.execute !== "function") {
    return {
      supported: false,
      usedIndex: false,
      indexName: "",
      detail: `${dialect}: no SQL EXPLAIN available (index usage not assertable via planner)`,
    };
  }

  // postgres.js uses 1-based `$n` placeholders; sqlite/mariadb use `?`.
  const p1 = dialect === "postgresql" ? "$1" : "?";
  const p2 = dialect === "postgresql" ? "$2" : "?";
  const select = `SELECT "tenantId", "folderId", "updatedAt" FROM "media_items" WHERE "tenantId" = ${p1} AND "folderId" = ${p2} ORDER BY "updatedAt" DESC LIMIT ${GALLERY_PAGE_SIZE + 1}`;
  const sql = dialect === "sqlite" ? `EXPLAIN QUERY PLAN ${select}` : `EXPLAIN ${select}`;

  try {
    const plan = await raw.execute(sql, [tenantId, folderId]);
    const detail = JSON.stringify(plan);
    return { supported: true, usedIndex: detail.includes(indexName), indexName, detail };
  } catch (err) {
    return {
      supported: false,
      usedIndex: false,
      indexName,
      detail: `EXPLAIN failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Media Gallery Index audit — seeds a realistic tenant-wide media pool and
 * measures the exact query the gallery page issues.
 */
async function runGalleryIndexAudit(db: DatabaseAdapter): Promise<{
  result: { name: string; avgMs: number; p95Ms: number; rps: number; [key: string]: unknown };
  rows: number;
  probe: GalleryPlanProbe;
}> {
  const tenantId = "global";
  const runTag = randomUUID().slice(0, 8);
  const folders = Array.from(
    { length: GALLERY_FOLDERS },
    (_, i) => `bench-gallery-${runTag}-f${i}`,
  );
  const seededIds: string[] = [];

  try {
    // ── Seed: spread GALLERY_ROWS across the folder pool, one row per second of
    // synthetic upload history so `ORDER BY updatedAt DESC` is a real ordering.
    const base = Date.now() - GALLERY_ROWS * 1_000;
    for (let offset = 0; offset < GALLERY_ROWS; offset += GALLERY_BATCH) {
      const batch: GalleryRowShape[] = [];
      for (let i = offset; i < Math.min(offset + GALLERY_BATCH, GALLERY_ROWS); i++) {
        const folderId = folders[i % folders.length]!;
        const ts = new Date(base + i * 1_000);
        batch.push({
          filename: `gallery-seed-${i}.jpg`,
          originalFilename: `gallery-seed-${i}.jpg`,
          mimeType: "image/jpeg",
          size: 4_096 + (i % 512),
          // Unique per row — the media table carries a hash index and the service
          // dedups on it; identical hashes would collapse the seed instead of
          // creating rows.
          hash: randomUUID().replace(/-/g, ""),
          path: `gallery/${folderId}/gallery-seed-${i}.jpg`,
          createdBy: "system",
          updatedBy: "system",
          metadata: {},
          thumbnails: {},
          access: "public",
          folderId,
          tenantId,
          // `EntityCreate` omits timestamps, but the index claim is about ORDER BY
          // updatedAt — rows sharing one timestamp would measure a degenerate sort.
          createdAt: ts,
          updatedAt: ts,
        });
      }
      const inserted = await db.media.files.uploadMany(
        batch as unknown as EntityCreate<MediaItem>[],
        { tenantId: tenantId as DatabaseId },
      );
      if (!inserted.success) {
        throw new Error(`gallery seed failed: ${inserted.message || "unknown error"}`);
      }
      for (const row of inserted.data ?? []) seededIds.push(String(row._id));
    }
    if (seededIds.length !== GALLERY_ROWS) {
      throw new Error(
        `gallery seed wrote ${seededIds.length} of ${GALLERY_ROWS} rows — refusing to measure a partial pool`,
      );
    }

    const measuredFolder = folders[folders.length - 1]!;
    const folderRows = seededIds.length / folders.length;

    // ── Sanity: the seed must be ordered, not a flat timestamp blob (a collapsed
    // timestamp would make the measured "ordered" query meaningless).
    const orderProbe = await db.media.files.getByFolder(measuredFolder as DatabaseId, {
      pageSize: GALLERY_PAGE_SIZE,
      page: 1,
      sortField: "updatedAt",
      sortDirection: "desc",
      tenantId: tenantId as DatabaseId,
    });
    if (!orderProbe.success) {
      throw new Error(`gallery order probe failed: ${orderProbe.message || "unknown error"}`);
    }
    const probeItems = orderProbe.data?.items ?? [];
    if (probeItems.length !== folderRows) {
      throw new Error(
        `gallery order probe returned ${probeItems.length} rows, expected ${folderRows} for one folder`,
      );
    }
    const timestamps = new Set(probeItems.map((item) => String(item.updatedAt)));
    if (timestamps.size < Math.min(10, folderRows)) {
      throw new Error(
        `gallery seed timestamps collapsed (${timestamps.size} distinct of ${folderRows} rows) — ORDER BY updatedAt would be trivial`,
      );
    }

    // ── Measure the exact gallery query shape.
    const result = await runBenchmark({
      name: `Gallery Query (${GALLERY_ROWS} rows, tenant+folder, ORDER BY updatedAt DESC) `,
      iterations: IS_CI ? 60 : 150,
      warmupIterations: IS_CI ? 10 : 30,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await db.media.files.getByFolder(measuredFolder as DatabaseId, {
          pageSize: GALLERY_PAGE_SIZE,
          page: 1,
          sortField: "updatedAt",
          sortDirection: "desc",
          tenantId: tenantId as DatabaseId,
        });
        if (!res.success) throw new Error(`gallery query failed: ${res.message || "unknown"}`);
        if ((res.data?.items ?? []).length !== folderRows) {
          throw new Error(
            `gallery query returned ${res.data?.items?.length ?? 0} rows, expected ${folderRows}`,
          );
        }
      },
    });

    // ── Prove index effectiveness (SQL planners only).
    const probe = await probeGalleryIndexPlan(db, tenantId, measuredFolder);
    console.log(
      `      plan: ${probe.supported ? (probe.usedIndex ? "USES " + probe.indexName : "NO INDEX — " + probe.detail.slice(0, 160)) : probe.detail}`,
    );
    if (probe.supported && !probe.usedIndex) {
      throw new Error(
        `gallery query did not use ${probe.indexName} — plan: ${probe.detail.slice(0, 400)}`,
      );
    }

    return {
      result: {
        name: `Gallery Query (${GALLERY_ROWS} rows, tenant+folder, ORDER BY updatedAt DESC)`,
        avgMs: result.avgMs,
        p95Ms: result.p95Ms,
        rps: result.rps,
        db: result.db,
        iterations: result.iterations,
        runs: result.runs,
        concurrency: result.concurrency,
        cv: result.cv,
        minMs: result.minMs,
        maxMs: result.maxMs,
        p50Ms: result.p50Ms,
        p99Ms: result.p99Ms,
        totalMs: result.totalMs,
        timestamp: result.timestamp,
        version: result.version,
      },
      rows: GALLERY_ROWS,
      probe,
    };
  } finally {
    // Never leave the pool behind — it would skew every later media benchmark.
    for (let offset = 0; offset < seededIds.length; offset += GALLERY_BATCH) {
      const ids = seededIds.slice(offset, offset + GALLERY_BATCH);
      await db.crud
        .deleteMany("media_items", { _id: { $in: ids } } as unknown as QueryFilter<MediaItem>, {
          tenantId: tenantId as DatabaseId,
        })
        .catch((err: unknown) =>
          logger.warn(
            `[Media] gallery seed cleanup failed for ${ids.length} rows: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }
  }
}

test("Media Engine Enterprise Suite", async () => {
  await runMediaAudit();
}, 600_000);
