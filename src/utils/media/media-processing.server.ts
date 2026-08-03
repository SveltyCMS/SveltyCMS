/**
 * @file src/utils/media/media-processing.server.ts
 * @description Server-side media processing — hashing, metadata extraction, deep analysis.
 *
 * ### Design
 * - Sharp for all image operations (metadata, resizing, stats).
 * - EXIF parsing via sharp's built-in metadata + lightweight `exifr` fallback
 *   for camera/date fields. If exifr is unavailable, those fields are simply
 *   omitted rather than silently returning garbage.
 * - Consistent error policy: `extractMetadata` throws on failure (used by upload
 *   pipeline), `getMetadata` swallows errors into `{}` (used by batch/DAM scans).
 * - `limitInputPixels` on all sharp pipelines guards against decompression bombs.
 */

import { error } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import type { CmsMediaMetadata } from "./media-models";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";

// ─── Sharp (lazy, no module-resolution overhead on cold paths) ──────────
let _sharp: any = null;
async function getSharp(): Promise<any> {
  if (!_sharp) {
    const mod = await import("sharp");
    _sharp = mod.default || mod;
  }
  return _sharp;
}

// ─── Hashing ────────────────────────────────────────────────────────────

/** Sync SHA-256 hex hash — fast enough for cache-key derivation (no async overhead). */
function hashFileContentSync(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function hashFileContent(buffer: ArrayBuffer | Buffer): Promise<string> {
  if (!buffer || buffer.byteLength === 0) throw error(400, "Cannot hash empty buffer");
  try {
    const arr = buffer instanceof Buffer ? buffer : new Uint8Array(buffer);
    const hash = createHash("sha256")
      .update(arr as any)
      .digest("hex");
    logger.debug("File hashed", { size: buffer.byteLength, hash: hash.slice(0, 12) });
    return hash;
  } catch (err: any) {
    logger.error("Hashing failed", { size: buffer.byteLength, error: err.message });
    throw error(500, `Hashing error: ${err.message}`);
  }
}

export async function hashStream(stream: ReadableStream | Readable): Promise<string> {
  const hash = createHash("sha256");
  const nodeStream = stream instanceof ReadableStream ? Readable.fromWeb(stream as any) : stream;
  return new Promise((resolve, reject) => {
    nodeStream.on("data", (chunk: Buffer) => hash.update(chunk));
    nodeStream.on("end", () => resolve(hash.digest("hex")));
    nodeStream.on("error", reject);
  });
}

// ─── Metadata extraction (throw-on-fail — upload pipeline) ──────────────

export async function extractMetadata(buffer: Buffer): Promise<any> {
  try {
    const sharp = await getSharp();
    return await sharp(buffer, {
      limitInputPixels: 100_000_000,
      failOn: "none",
    })
      .rotate()
      .metadata();
  } catch (err: any) {
    logger.error("Metadata extraction failed", { size: buffer.length, error: err.message });
    throw error(500, `Metadata error: ${err.message}`);
  }
}

// ─── EXIF parsing ───────────────────────────────────────────────────────

interface ExifData {
  Make?: string;
  Model?: string;
  software?: string;
  DateTimeOriginal?: string;
  DateTime?: string;
  [key: string]: any;
}

/**
 * Parse raw EXIF buffer into named fields.
 * Uses minimal binary extraction (no dependency). Returns `undefined`
 * when no tags are found — **never** returns fake data.
 */
async function parseExif(buffer?: Buffer): Promise<ExifData | undefined> {
  if (!buffer || buffer.length === 0) return undefined;

  try {
    const raw = buffer.toString("binary");
    const result: ExifData = {};
    const getTag = (tag: string) => {
      const idx = raw.indexOf(tag);
      if (idx < 0) return undefined;
      const start = idx + tag.length + 2;
      const end = raw.indexOf("\0", start);
      return end > start ? raw.slice(start, end).trim() : undefined;
    };
    const make = getTag("Make");
    const model = getTag("Model");
    if (make || model) result.Make = make;
    if (model) result.Model = model;
    const sw = getTag("Software");
    if (sw) result.software = sw;
    const dt = getTag("DateTimeOriginal") || getTag("DateTime");
    if (dt) result.DateTimeOriginal = dt;
    return Object.keys(result).length ? result : undefined;
  } catch {
    return undefined;
  }
}

// ─── Deep metadata (swallow errors — batch/DAM scans) ──────────────────

export class MediaProcessingService {
  private static instance: MediaProcessingService;
  private metadataCache = new Map<string, { data: CmsMediaMetadata; expires: number }>();
  private static METADATA_CACHE_TTL = 86_400_000; // 24 hours — metadata is immutable per hash

  private constructor() {}
  static getInstance(): MediaProcessingService {
    return (this.instance ??= new MediaProcessingService());
  }

  /**
   * Extract deep metadata, cached by file hash. Silently returns `{}` on failure.
   * Callers that already computed the hash can pass it via `options.hash` to skip
   * re-hashing (e.g., upload pipeline which hashes files for dedup first).
   */
  async getMetadata(
    buffer: Buffer,
    options: { fastPath?: boolean; hash?: string } = {},
  ): Promise<CmsMediaMetadata> {
    // Use caller-provided hash or compute one from the buffer
    const cacheKey = options.hash ?? hashFileContentSync(buffer);

    // Check cache
    const cached = this.metadataCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return cached.data;
    }

    // Cache miss — run sharp pipeline
    const result = await this._extractMetadata(buffer, options);
    this.metadataCache.set(cacheKey, {
      data: result,
      expires: Date.now() + MediaProcessingService.METADATA_CACHE_TTL,
    });

    // Evict oldest if over 5k entries
    if (this.metadataCache.size > 5_000) {
      const oldest = this.metadataCache.entries().next().value;
      if (oldest) this.metadataCache.delete(oldest[0]);
    }

    return result;
  }

  private async _extractMetadata(
    buffer: Buffer,
    options: { fastPath?: boolean },
  ): Promise<CmsMediaMetadata> {
    try {
      const sharp = await getSharp();
      const instance = sharp(buffer, {
        limitInputPixels: 100_000_000,
        failOn: "none",
      });
      const meta = await instance.metadata();

      if (options.fastPath) {
        return {
          format: meta.format,
          width: meta.width,
          height: meta.height,
          space: meta.space,
          channels: meta.channels,
        };
      }

      const stats = await instance.stats();

      const results: CmsMediaMetadata = {
        format: meta.format,
        width: meta.width,
        height: meta.height,
        space: meta.space,
        channels: meta.channels,
        density: meta.density,
        hasProfile: meta.hasProfile,
        hasAlpha: meta.hasAlpha,
        orientation: meta.orientation,
        exif: await parseExif(meta.exif as Buffer | undefined),
        iptc: this.toRawBase64(meta.iptc as Buffer | undefined),
        xmp: this.toRawBase64(meta.xmp as Buffer | undefined),
        dominantColor: stats.dominant
          ? `rgb(${stats.dominant.r},${stats.dominant.g},${stats.dominant.b})`
          : undefined,
        placeholder: await instance
          .clone()
          .resize(32, 32, { fit: "inside" })
          .webp({ quality: 20 })
          .toBuffer()
          .then((b: Buffer) => `data:image/webp;base64,${b.toString("base64")}`),
      };

      // Populate DAM-friendly fields from real EXIF data
      if (results.exif) {
        const e = results.exif as ExifData;
        if (e.Make || e.Model) results.camera = `${e.Make ?? ""} ${e.Model ?? ""}`.trim();
        if (e.software) results.software = e.software;
        if (e.DateTimeOriginal || e.DateTime)
          results.uploadTimestamp = e.DateTimeOriginal ?? e.DateTime;
      }

      logger.debug("Deep metadata extracted", {
        format: results.format,
        hasExif: !!results.exif,
        camera: results.camera,
        dominantColor: results.dominantColor,
      });

      return results;
    } catch (err) {
      logger.error("Failed to extract deep metadata", err);
      return {};
    }
  }

  private toRawBase64(buffer?: Buffer): Record<string, any> | undefined {
    if (!buffer) return undefined;
    try {
      return { _raw: buffer.toString("base64") };
    } catch {
      return undefined;
    }
  }
}

export const mediaProcessingService = MediaProcessingService.getInstance();

// ─── Sharp pipeline types (consolidated from sharp-pipeline.ts) ──────────────

import type sharp from "sharp";
import type {
  Region,
  ResizeOptions,
  RotateOptions,
  Matrix3x3,
  Matrix4x4,
  BlurOptions,
  OverlayOptions,
  PngOptions,
  WebpOptions,
  AvifOptions,
  JpegOptions,
  OutputInfo,
  Metadata,
} from "sharp";

export interface SharpPipeline {
  resize(width?: number | null, height?: number | null, options?: ResizeOptions): SharpPipeline;
  rotate(angle?: number, options?: RotateOptions): SharpPipeline;
  flip(flip?: boolean): SharpPipeline;
  flop(flop?: boolean): SharpPipeline;
  extract(region: Region): SharpPipeline;
  modulate(options?: {
    brightness?: number;
    saturation?: number;
    hue?: number;
    lightness?: number;
  }): SharpPipeline;
  linear(a?: number | number[] | null, b?: number | number[]): SharpPipeline;
  recomb(inputMatrix: Matrix3x3 | Matrix4x4): SharpPipeline;
  grayscale(grayscale?: boolean): SharpPipeline;
  greyscale(greyscale?: boolean): SharpPipeline;
  ensureAlpha(alpha?: number): SharpPipeline;
  blur(sigma?: number | boolean | BlurOptions): SharpPipeline;
  composite(images: OverlayOptions[]): SharpPipeline;
  png(options?: PngOptions): SharpPipeline;
  webp(options?: WebpOptions): SharpPipeline;
  avif(options?: AvifOptions): SharpPipeline;
  jpeg(options?: JpegOptions): SharpPipeline;
  toBuffer(): Promise<Buffer>;
  toBuffer(options: { resolveWithObject: false }): Promise<Buffer>;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: OutputInfo }>;
  metadata(): Promise<Metadata>;
  clone(): SharpPipeline;
}

export type SharpFactory = typeof sharp;
export type SharpOverlayOptions = OverlayOptions;
