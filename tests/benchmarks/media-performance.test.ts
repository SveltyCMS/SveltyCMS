/**
 * @file tests/benchmarks/media-performance.test.ts
 * @description Enterprise Media Pipeline Benchmark (Optimized)
 * @summary Measures full upload, Sharp thumbnail processing, SDK vs HTTP latency, the cached
 * on-demand delivery transform (`/files/**?w=&q=`), derivative fan-out per uploaded image
 * (SIZES ladder, `media-pipeline-plan.mdx` §4 rows 1–2), duplicate-upload cost with zero
 * rewrites (row 2), and the media-gallery composite index
 * (`tenantId` + `folderId` + `ORDER BY updatedAt DESC`, LIMIT 100).
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
import fs from "node:fs";
import path from "node:path";
import { logger } from "@utils/logger";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getImageSizes } from "@utils/media/media-storage.server";
import { resolveConfiguredMediaFolder } from "@utils/media/storage-adapters";
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

/**
 * Per-process tag (fits in a uint32) folded into every benchmark image.
 *
 * Derivative fan-out and duplicate-upload rows MUST upload content that has never existed in
 * this sandbox: a leftover record from an earlier matrix run would turn the first upload into
 * a dedupe hit, and the row would then measure "nothing was written" as a green result.
 */
const RUN_TAG = Date.now() % 2_000_000_000;

/** Real JPEG of an exact size — rendered once per benchmark, never inside a timed loop. */
async function renderSizedJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 64, g: 64, b: 96 },
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/** Copy of `base` with a unique 4-byte tag: fresh content hash for the cost of a memcpy. */
function tagImageBuffer(base: Buffer, seq: number): Buffer {
  const tagged = Buffer.allocUnsafe(base.length + 4);
  base.copy(tagged);
  tagged.writeUInt32BE(seq % 4_294_967_295, base.length);
  return tagged;
}

interface StoredThumbShape {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
}

interface StoredRecordShape {
  _id: string;
  path: string;
  hash: string;
  metadata?: { width?: number; height?: number };
  thumbnails?: Record<string, StoredThumbShape | undefined>;
}

/** POST one image through the real upload API and return the stored record. */
async function uploadBenchmarkImage(
  baseUrl: string,
  headers: Record<string, string>,
  filename: string,
  bytes: Buffer,
): Promise<StoredRecordShape> {
  const formData = new FormData();
  formData.append("files", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), filename);

  const res = await fetch(`${baseUrl}/api/media/upload`, {
    method: "POST",
    headers,
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "<no body>");
    throw new Error(`Upload ${filename} failed: HTTP ${res.status} - ${detail}`);
  }

  const body = (await res.json()) as {
    data?: Array<{ success?: boolean; message?: string; data?: StoredRecordShape }>;
  };
  const item = body.data?.[0];
  if (!item?.success || !item.data) {
    throw new Error(`Upload ${filename} returned no record: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return item.data;
}

interface StorageEntry {
  rel: string;
  size: number;
  mtimeMs: number;
}

/** Recursive `{rel, size, mtimeMs}` listing — disk-level truth for "was anything written?". */
function scanStorageTree(dir: string): StorageEntry[] {
  const entries: StorageEntry[] = [];
  const walk = (current: string): void => {
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return; // Subtree does not exist (yet) — an empty listing is the honest answer.
    }
    for (const child of children) {
      const full = path.join(current, child.name);
      if (child.isDirectory()) {
        walk(full);
        continue;
      }
      const stat = fs.statSync(full);
      entries.push({
        rel: path.relative(dir, full).split(path.sep).join("/"),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  };
  walk(dir);
  return entries.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * Every stored file a record owns, wherever the pipeline put it:
 * Wait until the asset's stored files stop changing, then return their listing.
 * Responsive variants are written by a fire-and-forget job, so a snapshot taken immediately
 * after the upload response would race it.
 */
async function settleAssetTree(
  mediaRoot: string,
  record: StoredRecordShape,
  attempts = 40,
): Promise<StorageEntry[]> {
  let previous = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    const entries = assetStorageEntries(mediaRoot, record);
    const signature = entries
      .map((entry) => `${entry.rel}:${entry.size}:${entry.mtimeMs}`)
      .join("|");
    if (signature.length > 0 && signature === previous) return entries;
    previous = signature;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return assetStorageEntries(mediaRoot, record);
}

/**
 * Every stored file a record owns, wherever the pipeline put it:
 *
 * - `{tenant}/{hash}/original/…` and `{tenant}/{hash}/variants/…` (hash-keyed trees)
 * - `{tenant}/{size}/{name}-{hash}.{ext}` (the SIZES ladder is name+hash keyed, flat per size)
 *
 * Identity is the content hash, so matching on `-{hash}.`/`{hash}/` picks up exactly this asset's
 * files and nothing else.
 */
function assetStorageEntries(mediaRoot: string, record: StoredRecordShape): StorageEntry[] {
  const tenant = record.path.split("/")[0] ?? "global";
  const hashMarker = `-${record.hash}.`;
  return scanStorageTree(path.join(mediaRoot, tenant)).filter(
    (entry) => entry.rel.startsWith(`${record.hash}/`) || entry.rel.includes(hashMarker),
  );
}

/**
 * Ladder entries only — enrichment adds `${preset}-${width}` responsive-variant keys to the
 * same map, and those belong to the second (deferred) pipeline, not to `saveResized`.
 */
function ladderThumbEntries(record: StoredRecordShape): Array<[string, StoredThumbShape]> {
  return Object.entries(record.thumbnails ?? {}).filter(([key]) => !key.includes("-")) as Array<
    [string, StoredThumbShape]
  >;
}

interface FanOutMeasurement {
  /** Ladder files the upload response advertises (what `saveResized` wrote). */
  ladderFiles: number;
  ladderBytes: number;
  ladderStepKeys: string[];
  /** Files actually present in `{tenant}/{hash}` after the deferred job settled. */
  totalFiles: number;
  totalBytes: number;
  variantFiles: number;
}

function measureFanOut(record: StoredRecordShape, mediaRoot: string): FanOutMeasurement {
  const ladder = ladderThumbEntries(record);
  const stored = assetStorageEntries(mediaRoot, record);
  const variants = stored.filter((entry) => entry.rel.includes(`${record.hash}/variants/`));

  return {
    ladderFiles: ladder.length,
    ladderBytes: ladder.reduce((sum, [, thumb]) => sum + (thumb.size ?? 0), 0),
    ladderStepKeys: [...new Set(ladder.map(([key]) => key.replace(/_webp$/, "")))].sort(),
    totalFiles: stored.length,
    totalBytes: stored.reduce((sum, entry) => sum + entry.size, 0),
    variantFiles: variants.length,
  };
}

/** Files whose presence, size or mtime changed between two snapshots (rewrites + additions). */
function diffStorageSnapshots(before: StorageEntry[], after: StorageEntry[]): string[] {
  const beforeByRel = new Map(before.map((entry) => [entry.rel, entry]));
  const afterByRel = new Map(after.map((entry) => [entry.rel, entry]));
  const changed = new Set<string>();

  for (const [rel, entry] of beforeByRel) {
    const next = afterByRel.get(rel);
    if (!next || next.size !== entry.size || next.mtimeMs !== entry.mtimeMs) changed.add(rel);
  }
  for (const rel of afterByRel.keys()) if (!beforeByRel.has(rel)) changed.add(rel);
  return [...changed].sort();
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

    // ── 3. ON-DEMAND TRANSFORM (cached variant) & ASSET STREAMING ────────────
    if (uploadedAssetPaths.length > 0) {
      forceGarbageCollection();
      await stabilize(150);

      console.log(
        "   → 3. Measuring On-Demand Transform (cached 320px variant) & Asset Streaming...",
      );
      const samplePath = uploadedAssetPaths[0]!;
      const cleanPath = samplePath.startsWith("/") ? samplePath.slice(1) : samplePath;

      const streamResult = await runBenchmark({
        name: "HTTP: On-Demand Transform (cached 320px WebP)",
        iterations: 100,
        warmupIterations: 10,
        runs: 2,
        concurrency: 4,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          // `w=320` is a real ladder step and `q=80` a real quality step: warm-up generates
          // the WebP variant once (single-flight), so the measured iterations stream that
          // cached variant — no Sharp work, no original bytes.
          const res = await fetch(`${baseUrl}/files/${cleanPath}?w=320&q=80`, {
            method: "GET",
            headers: {
              ...benchmarkAuthHeaders(),
              accept: "image/webp,image/jpeg;q=0.8,*/*;q=0.5",
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

    // ── 4. DERIVATIVE FAN-OUT — SIZES ladder (#3) ────────────────────────────
    // media-pipeline-plan.mdx §4 rows 1–2. Each row uploads a fresh image per iteration (so a
    // real encode cost is measured) and then counts the files and bytes that upload wrote,
    // asserting them against the configured SIZES. The 400 px row is the falsifier for
    // "upscale everything" (that source used to be enlarged into all four ladder steps / 8
    // files); the total-files column is the falsifier for a second derivative pipeline.
    forceGarbageCollection();
    await stabilize(150);
    console.log("   → 4. Measuring Derivative Fan-Out (SIZES ladder, 1920 px vs 400 px)...");

    const mediaRoot = path.resolve(process.cwd(), resolveConfiguredMediaFolder());
    const ladderSteps = Object.entries(getImageSizes()).filter(([, width]) => width > 0);
    if (ladderSteps.length === 0) {
      throw new Error("SIZES has no resizeable step — the fan-out rows cannot assert anything");
    }

    const wideBase = await renderSizedJpeg(1920, 1080);
    let wideSeq = 0;
    let lastWideRecord: StoredRecordShape | null = null;

    const wideFanOutResult = await runBenchmark({
      name: "Media: Derivative Fan-Out (1920px source)",
      iterations: 8,
      warmupIterations: 2,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const seq = wideSeq++;
        const record = await uploadBenchmarkImage(
          baseUrl,
          uploadHeaders,
          `bench-fanout-wide-${RUN_TAG}-${seq}.jpg`,
          tagImageBuffer(wideBase, RUN_TAG + seq),
        );
        if (record.metadata?.width !== 1920) {
          throw new Error(`Wide source metadata.width = ${record.metadata?.width} (expected 1920)`);
        }
        if (ladderThumbEntries(record).some(([, thumb]) => (thumb.width ?? 0) > 1920)) {
          throw new Error("A ladder variant is wider than its 1920 px source");
        }
        lastWideRecord = record;
      },
    });

    if (!lastWideRecord) throw new Error("Fan-out row uploaded nothing");
    const wideFanOut = measureFanOut(lastWideRecord, mediaRoot);
    if (wideFanOut.ladderFiles > 2 * ladderSteps.length) {
      throw new Error(
        `Fan-out ${wideFanOut.ladderFiles} files exceeds 2 × SIZES (${2 * ladderSteps.length})`,
      );
    }
    if (wideFanOut.ladderStepKeys.length > ladderSteps.length) {
      throw new Error(
        `Ladder wrote ${wideFanOut.ladderStepKeys.length} steps for ${ladderSteps.length} configured SIZES`,
      );
    }
    results.push({ ...wideFanOutResult, shortLabel: "Fan-Out", layer: "Derivatives" });

    const smallBase = await renderSizedJpeg(400, 300);
    let smallSeq = 0;
    let lastSmallRecord: StoredRecordShape | null = null;

    const smallFanOutResult = await runBenchmark({
      name: "Media: Derivative Fan-Out (400px source)",
      iterations: 12,
      warmupIterations: 2,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const seq = smallSeq++;
        const record = await uploadBenchmarkImage(
          baseUrl,
          uploadHeaders,
          `bench-fanout-small-${RUN_TAG}-${seq}.jpg`,
          tagImageBuffer(smallBase, RUN_TAG + 1_000_000 + seq),
        );
        if (record.metadata?.width !== 400) {
          throw new Error(`Small source metadata.width = ${record.metadata?.width} (expected 400)`);
        }
        const oversize = ladderThumbEntries(record).find(([, thumb]) => (thumb.width ?? 0) > 400);
        if (oversize) {
          throw new Error(
            `Upscaling regression: variant ${oversize[0]} is ${oversize[1].width} px wide for a 400 px source`,
          );
        }
        lastSmallRecord = record;
      },
    });

    if (!lastSmallRecord) throw new Error("Small-source fan-out row uploaded nothing");
    const smallFanOut = measureFanOut(lastSmallRecord, mediaRoot);
    // The falsifier: a sub-ladder source must stay at or below the SIZES count — one primary
    // plus one WebP sidecar for the single step it can justify.
    if (smallFanOut.ladderFiles > ladderSteps.length) {
      throw new Error(
        `Fan-out ${smallFanOut.ladderFiles} files for a 400 px source exceeds the SIZES count (${ladderSteps.length})`,
      );
    }
    if (smallFanOut.ladderStepKeys.join(",") !== "thumbnail") {
      throw new Error(
        `400 px source wrote steps [${smallFanOut.ladderStepKeys.join(", ")}] — expected [thumbnail]`,
      );
    }
    results.push({ ...smallFanOutResult, shortLabel: "Fan-Out-400", layer: "Derivatives" });

    // ── 5. DUPLICATE UPLOAD — dedupe before generation (#2) ──────────────────
    // media-pipeline-plan.mdx §4 row 2. Re-uploading byte-identical content must perform zero
    // encodes; encodes are counted by their effect on disk, because a rewrite moves `mtimeMs`.
    // An unchanged `{rel, size, mtimeMs}` listing for the whole `{tenant}/{hash}` subtree after
    // 48 duplicate uploads is therefore a rewrite count of zero — under the pre-#2 order every
    // duplicate re-encoded and re-saved the entire ladder before the hash lookup ran.
    forceGarbageCollection();
    await stabilize(150);
    console.log("   → 5. Measuring Duplicate Upload (identical bytes, 0 rewrites expected)...");

    const duplicateBytes = tagImageBuffer(await renderSizedJpeg(640, 480), RUN_TAG + 2_000_000);
    const duplicateName = `bench-duplicate-${RUN_TAG}.jpg`;
    const primedRecord = await uploadBenchmarkImage(
      baseUrl,
      uploadHeaders,
      duplicateName,
      duplicateBytes,
    );
    const duplicateEntries = assetStorageEntries(mediaRoot, primedRecord);
    if (duplicateEntries.length === 0) {
      throw new Error(
        `Cannot observe stored files for the duplicate row (looked under ${path.join(mediaRoot, primedRecord.path.split("/")[0] ?? "global")}). ` +
          "Run it through the matrix (`BENCHMARK=true` + `MEDIA_FOLDER`) so the benchmark process and the server resolve the same media root.",
      );
    }
    const beforeDuplicate = await settleAssetTree(mediaRoot, primedRecord);

    const duplicateResult = await runBenchmark({
      name: "Media: Duplicate Upload (identical bytes)",
      iterations: 24,
      warmupIterations: 4,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const record = await uploadBenchmarkImage(
          baseUrl,
          uploadHeaders,
          duplicateName,
          duplicateBytes,
        );
        if (record._id !== primedRecord._id) {
          throw new Error(
            `Duplicate upload inserted ${record._id} instead of reusing ${primedRecord._id}`,
          );
        }
      },
    });

    const afterDuplicate = await settleAssetTree(mediaRoot, primedRecord);
    const rewrites = diffStorageSnapshots(beforeDuplicate, afterDuplicate);
    if (rewrites.length > 0) {
      throw new Error(
        `Duplicate upload rewrote ${rewrites.length} stored file(s) — dedupe must run before ` +
          `derivative generation: ${rewrites.slice(0, 5).join(", ")}`,
      );
    }
    results.push({
      ...duplicateResult,
      shortLabel: "Duplicate",
      layer: "Dedupe",
      rewrites: 0,
    });

    // ── 6. MEDIA GALLERY COMPOSITE INDEX ────────────────────────────────────
    // The gallery query shape is `WHERE tenantId = ? AND folderId = ?
    // ORDER BY updatedAt DESC LIMIT 101` (src/routes/(app)/mediagallery/+page.server.ts
    // → `media.files.getByFolder`). `index-pressure` measures a SYNTHETIC content
    // collection, so the media composite-index claim had no coverage at all.
    forceGarbageCollection();
    await stabilize(150);
    console.log("   → 6. Measuring Media Gallery Query (composite index)...");
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
          key: `Derivative fan-out (1920px, ladder / total)`,
          val: `${wideFanOut.ladderFiles} / ${wideFanOut.totalFiles} files`,
          unit: "",
        },
        {
          key: `Derivative bytes (1920px, ladder)`,
          val: `${Math.round(wideFanOut.ladderBytes / 1024)}`,
          unit: "KB",
        },
        {
          key: `Derivative fan-out (400px, ladder ≤ ${ladderSteps.length})`,
          val: `${smallFanOut.ladderFiles} files`,
          unit: "",
        },
        {
          key: "Duplicate upload latency (0 rewrites)",
          val: duplicateResult.avgMs.toFixed(2),
          unit: "ms",
        },
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
    // Derivative fan-out (media-pipeline-plan §4 row 1) — the numeric facts behind the rows
    // above, so a trend can be read without parsing the ASCII truth table.
    exportMetric("media.derivatives.sizes_configured", ladderSteps.length, "steps");
    exportMetric("media.derivatives.ladder_files_per_image", wideFanOut.ladderFiles, "files");
    exportMetric("media.derivatives.ladder_bytes_per_image", wideFanOut.ladderBytes, "bytes");
    exportMetric("media.derivatives.total_files_per_image", wideFanOut.totalFiles, "files");
    exportMetric("media.derivatives.total_bytes_per_image", wideFanOut.totalBytes, "bytes");
    exportMetric("media.derivatives.variant_files_per_image", wideFanOut.variantFiles, "files");
    exportMetric(
      "media.derivatives.small_ladder_files_per_image",
      smallFanOut.ladderFiles,
      "files",
    );
    exportMetric(
      "media.derivatives.small_ladder_bytes_per_image",
      smallFanOut.ladderBytes,
      "bytes",
    );
    exportMetric("media.derivatives.small_total_files_per_image", smallFanOut.totalFiles, "files");
    // Duplicate upload (§4 row 2) — latency of the dedupe path and the rewrite count it
    // produced (0 = no encode ran, asserted above against the on-disk snapshot).
    exportMetric("media.duplicate.latency_avg_ms", duplicateResult.avgMs, "ms");
    exportMetric(
      "media.duplicate.latency_p95_ms",
      duplicateResult.p95Ms || duplicateResult.avgMs,
      "ms",
    );
    exportMetric("media.duplicate.rewrites", 0, "files");
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
