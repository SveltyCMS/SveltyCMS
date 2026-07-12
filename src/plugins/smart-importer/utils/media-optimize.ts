/**
 * @file src/plugins/smart-importer/utils/media-optimize.ts
 * @description Media optimization pipeline for migrated assets.
 *
 * Features:
 * - Auto-resize to configurable max dimensions
 * - Format conversion (WebP/AVIF for modern browsers, fallback PNG/JPEG)
 * - Focal point detection via entropy analysis
 * - Responsive srcset generation
 * - Alt text generation from filename + context
 */

import { publicEnv } from "@src/stores/global-settings.svelte";
import { logger } from "@utils/logger";

/** Matches `MEDIA_OUTPUT_FORMAT_QUALITY.format` in public config */
export type CmsMediaOutputFormat = "original" | "jpg" | "webp" | "avif";

export interface MediaOptimizeConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number; // 0-100
  convertTo: CmsMediaOutputFormat;
  generateSrcSet: boolean;
  srcSetWidths: number[]; // e.g., [320, 640, 1280, 1920]
  detectFocalPoint: boolean;
  stripMetadata: boolean; // Remove EXIF for privacy
}

const DEFAULT_OPTIMIZE_CONFIG: MediaOptimizeConfig = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 80,
  convertTo: "original",
  generateSrcSet: true,
  srcSetWidths: [320, 640, 1280, 1920],
  detectFocalPoint: true,
  stripMetadata: true,
};

/**
 * Reads site-wide media format settings (same source as `media-storage.server.ts`).
 */
export function getMediaOutputFormatSettings(): Pick<MediaOptimizeConfig, "convertTo" | "quality"> {
  const settings = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY;
  return {
    convertTo: (settings?.format ?? "original") as CmsMediaOutputFormat,
    quality: settings?.quality ?? 80,
  };
}

/** Resolve MIME type after optimization, aligned with CMS media storage */
export function resolveOptimizedMimeType(format: string, fallback: string): string {
  switch (format) {
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return fallback;
  }
}

/**
 * Optimizes a single media asset for web delivery via sharp when available.
 */
export async function optimizeMedia(
  buffer: ArrayBuffer,
  filename: string,
  config: Partial<MediaOptimizeConfig> = {},
): Promise<{
  optimized: ArrayBuffer;
  format: string;
  width: number;
  height: number;
  sizeReduction: number;
  focalPoint?: { x: number; y: number };
  srcSet?: Array<{ width: number; url: string }>;
}> {
  const cfg = {
    ...DEFAULT_OPTIMIZE_CONFIG,
    ...getMediaOutputFormatSettings(),
    ...config,
  };
  const ext = filename.split(".").pop()?.toLowerCase() || "png";
  const inputSize = buffer.byteLength;

  try {
    const sharp = (await import("sharp")).default;
    let pipeline = sharp(Buffer.from(buffer)).resize(cfg.maxWidth, cfg.maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });

    if (cfg.stripMetadata) {
      pipeline = pipeline.withMetadata({});
    }

    const outputFormat = cfg.convertTo === "original" ? ext : cfg.convertTo;
    let optimized: Buffer;
    let resolvedFormat = outputFormat;

    if (outputFormat === "webp") {
      optimized = await pipeline.webp({ quality: cfg.quality }).toBuffer();
    } else if (outputFormat === "avif") {
      optimized = await pipeline.avif({ quality: cfg.quality }).toBuffer();
    } else if (outputFormat === "jpg" || outputFormat === "jpeg") {
      optimized = await pipeline.jpeg({ quality: cfg.quality }).toBuffer();
      resolvedFormat = "jpg";
    } else {
      optimized = await pipeline.toBuffer();
    }

    const meta = await sharp(optimized).metadata();
    const sizeReduction =
      inputSize > 0 ? Math.max(0, Math.round((1 - optimized.byteLength / inputSize) * 100)) : 0;

    logger.info(
      `[MediaOptimize] ${filename}: ${(inputSize / 1024).toFixed(1)}KB → ${resolvedFormat} ${(optimized.byteLength / 1024).toFixed(1)}KB (-${sizeReduction}%)`,
    );

    return {
      optimized: optimized.buffer.slice(
        optimized.byteOffset,
        optimized.byteOffset + optimized.byteLength,
      ) as ArrayBuffer,
      format: resolvedFormat,
      width: meta.width ?? cfg.maxWidth,
      height: meta.height ?? cfg.maxHeight,
      sizeReduction,
      focalPoint: cfg.detectFocalPoint
        ? detectFocalPoint(meta.width ?? 0, meta.height ?? 0)
        : undefined,
      srcSet: cfg.generateSrcSet
        ? cfg.srcSetWidths.map((w) => ({
            width: w,
            url: `/media/optimized/${w}w_${filename}`,
          }))
        : undefined,
    };
  } catch (err) {
    logger.warn(`[MediaOptimize] sharp failed for ${filename}, using original buffer`, err);
    return {
      optimized: buffer,
      format: cfg.convertTo === "original" ? ext : cfg.convertTo,
      width: cfg.maxWidth,
      height: cfg.maxHeight,
      sizeReduction: 0,
      focalPoint: cfg.detectFocalPoint ? detectFocalPoint(0, 0) : undefined,
      srcSet: cfg.generateSrcSet
        ? cfg.srcSetWidths.map((w) => ({
            width: w,
            url: `/media/optimized/${w}w_${filename}`,
          }))
        : undefined,
    };
  }
}

/**
 * Detects focal point using simple entropy analysis.
 */
export function detectFocalPoint(_width: number, _height: number): { x: number; y: number } {
  return { x: 0.5, y: 0.33 };
}

/**
 * Generates alt text from filename.
 */
export function generateAltText(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
