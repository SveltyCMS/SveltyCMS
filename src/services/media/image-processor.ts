/**
 * @file src/services/media/image-processor.ts
 * @description Upload-time image processing service using Sharp — generates
 * responsive image variants during upload, not on request.
 *
 * ### Design
 * - Variants are generated during upload, not on first request
 * - The original high-resolution file is always preserved
 * - Variant paths are deterministic: `{mediaHash}/{preset}-{width}.{format}`
 * - Variant metadata is stored as JSON alongside the media record in `thumbnails`
 * - Sharp is lazy-loaded (same pattern as existing media code) to avoid cold-path overhead
 * - Processing is **non-blocking** for the upload response: variants are generated
 *   after the original is saved, so failure to generate variants does not lose the upload
 *
 * ### Features:
 * - Configurable width presets (thumbnail, card, default, hero)
 * - Automatic format conversion (WebP primary, JPEG fallback, optional AVIF)
 * - EXIF/GPS metadata stripping for privacy
 * - Auto-orientation via Sharp's rotate()
 * - Aspect-ratio-preserving resize with `sharp.fit.inside`
 * - Per-variant file size tracking
 */

import { logger } from "@utils/logger";
import { saveVariant } from "./image-variant-storage";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ImageVariant {
  /** Preset name (e.g. "thumbnail", "card") */
  preset: string;
  /** Target width in pixels */
  width: number;
  /** Actual height after aspect-ratio-preserving resize */
  height: number;
  /** Output format (e.g. "webp", "jpeg", "avif") */
  format: string;
  /** Encoding quality (1–100) */
  quality: number;
  /** Relative storage path */
  path: string;
  /** File size in bytes */
  size: number;
}

export interface ImageProcessingConfig {
  /** Target widths to generate (e.g. [320, 640, 960, 1280, 1920]) */
  widths: number[];
  /** Output formats (e.g. ["webp", "jpeg"]) */
  formats: string[];
  /** Default encoding quality (1–100, default: 82) */
  quality: number;
  /** Strip EXIF/GPS/private metadata (default: true) */
  stripMetadata: boolean;
}

// ─── Default presets ───────────────────────────────────────────────────────

export interface ImagePreset {
  widths: number[];
  formats: string[];
  quality: number;
}

export const DEFAULT_PRESETS: Record<string, ImagePreset> = {
  thumbnail: { widths: [160, 320], formats: ["webp", "jpeg"], quality: 75 },
  card: { widths: [320, 480, 640, 960], formats: ["webp", "jpeg"], quality: 80 },
  default: { widths: [320, 640, 960, 1280, 1920], formats: ["webp", "jpeg"], quality: 82 },
  hero: { widths: [768, 1280, 1920, 2560], formats: ["webp", "jpeg"], quality: 84 },
};

/** Default config used when no overrides are provided. */
const DEFAULT_CONFIG: ImageProcessingConfig = {
  widths: [320, 640, 960, 1280, 1920],
  formats: ["webp", "jpeg"],
  quality: 82,
  stripMetadata: true,
};

// ─── Lazy Sharp loader ─────────────────────────────────────────────────────

let _sharp: any = null;
async function getSharp(): Promise<any> {
  if (!_sharp) {
    const mod = await import("sharp");
    _sharp = mod.default || mod;
  }
  return _sharp;
}

// ─── Processing ────────────────────────────────────────────────────────────

/**
 * Generate responsive image variants from an uploaded image buffer.
 *
 * @param buffer - The original image file buffer
 * @param hash   - Content hash of the original (used for deterministic variant paths)
 * @param config - Processing configuration overrides
 * @param tenantId - Optional tenant ID for multi-tenant storage paths
 *
 * @returns Array of generated variant metadata
 *
 * @remarks
 * This function is designed to be called **after** the original file is saved.
 * It processes variants in parallel for maximum throughput. If variant generation
 * fails, the error is logged but not thrown — the original upload is unaffected.
 */
export async function processImage(
  buffer: Buffer,
  hash: string,
  config?: Partial<ImageProcessingConfig>,
  tenantId?: string | null,
): Promise<ImageVariant[]> {
  const cfg: ImageProcessingConfig = { ...DEFAULT_CONFIG, ...config };
  const sharp = await getSharp();

  // Validate inputs
  if (!buffer || buffer.length === 0) {
    logger.warn("[ImageProcessor] Empty buffer provided — skipping variant generation");
    return [];
  }

  const meta = await sharp(buffer, { limitInputPixels: 100_000_000, failOn: "none" }).metadata();
  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    logger.warn(
      "[ImageProcessor] Unable to determine image dimensions — skipping variant generation",
    );
    return [];
  }

  // Build the list of (width, format) combinations to generate
  // Deduplicate: skip widths larger than the original (upscaling adds no value)
  const effectiveWidths = cfg.widths.filter((w) => w < originalWidth);

  if (effectiveWidths.length === 0) {
    logger.debug("[ImageProcessor] No variant widths smaller than original — skipping");
    return [];
  }

  // Generate all variants in parallel
  const tasks: Promise<ImageVariant>[] = [];

  for (const targetWidth of effectiveWidths) {
    for (const format of cfg.formats) {
      tasks.push(
        generateVariant(
          sharp,
          buffer,
          hash,
          targetWidth,
          format,
          cfg,
          originalHeight,
          originalWidth,
          tenantId,
        ),
      );
    }
  }

  const results = await Promise.allSettled(tasks);

  const variants: ImageVariant[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      variants.push(result.value);
    } else {
      logger.error("[ImageProcessor] Variant generation failed", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  logger.info("[ImageProcessor] Variant generation complete", {
    originalWidth,
    originalHeight,
    variantsGenerated: variants.length,
    totalFailed: results.length - variants.length,
  });

  return variants;
}

/**
 * Generate variants using preset configurations for common use cases.
 * This is a convenience wrapper around `processImage` that uses named presets.
 *
 * @param buffer   - The original image file buffer
 * @param hash     - Content hash
 * @param presets  - Array of preset names to generate (e.g. ["thumbnail", "card"])
 * @param tenantId - Optional tenant ID
 *
 * @returns Flattened array of all generated variants across all requested presets
 */
export async function processImageWithPresets(
  buffer: Buffer,
  hash: string,
  presets: string[] = ["thumbnail", "card", "default"],
  tenantId?: string | null,
): Promise<ImageVariant[]> {
  const allVariants: ImageVariant[] = [];

  for (const presetName of presets) {
    const preset = DEFAULT_PRESETS[presetName];
    if (!preset) {
      logger.warn(`[ImageProcessor] Unknown preset "${presetName}" — skipping`);
      continue;
    }

    const variants = await processImage(buffer, hash, preset, tenantId);
    // Tag each variant with its preset name
    for (const v of variants) {
      v.preset = presetName;
    }
    allVariants.push(...variants);
  }

  return allVariants;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Generate a single variant at the specified width and format.
 */
async function generateVariant(
  sharp: any,
  buffer: Buffer,
  hash: string,
  targetWidth: number,
  format: string,
  cfg: ImageProcessingConfig,
  originalHeight: number,
  originalWidth: number,
  tenantId?: string | null,
): Promise<ImageVariant> {
  // Calculate height preserving aspect ratio
  const height = Math.round((targetWidth / originalWidth) * originalHeight);
  // The preset name is determined by resolvePresetName below

  // Build the sharp pipeline
  let pipeline = sharp(buffer, { limitInputPixels: 100_000_000, failOn: "none" })
    // Auto-fix orientation from EXIF
    .rotate()
    // Resize preserving aspect ratio
    .resize(targetWidth, null, { fit: "inside", withoutEnlargement: true });

  // Apply format-specific encoding
  // Note: Sharp automatically strips metadata unless .withMetadata() is called.
  switch (format) {
    case "webp":
      pipeline = pipeline.webp({ quality: cfg.quality, effort: 4 });
      break;
    case "jpeg":
    case "jpg":
      pipeline = pipeline.jpeg({ quality: cfg.quality, mozjpeg: true });
      break;
    case "avif":
      pipeline = pipeline.avif({ quality: cfg.quality, effort: 4 });
      break;
    case "png":
      pipeline = pipeline.png({ compressionLevel: 8, palette: targetWidth <= 320 });
      break;
    default:
      pipeline = pipeline.jpeg({ quality: cfg.quality });
  }

  const outputFormat = format === "jpg" ? "jpeg" : format;

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  // Determine preset name for path
  const presetName = resolvePresetName(targetWidth, originalWidth);

  // Save to storage
  const path = await saveVariant(data, hash, presetName, targetWidth, outputFormat, tenantId);

  return {
    preset: presetName,
    width: targetWidth,
    height,
    format: outputFormat,
    quality: cfg.quality,
    path,
    size: info.size,
  };
}

/**
 * Resolve a human-readable preset name from target width.
 */
function resolvePresetName(targetWidth: number, _originalWidth: number): string {
  // Match against known preset width ranges
  if (targetWidth <= 320) return "thumbnail";
  if (targetWidth <= 960) return "card";
  if (targetWidth <= 1920) return "default";
  return "hero";
}
