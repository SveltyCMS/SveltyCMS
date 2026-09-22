/**
 * @file src/services/media/image-processor.ts
 * @description Sharp image processing service. Generates responsive variants at
 * upload time AND owns the pure parameter/encoder helpers for the cached on-demand
 * transforms served by `/files/**?w=&h=&q=&fmt=`.
 *
 * ### Design
 * - Upload-time variants: generated after the original is saved, never on request
 * - On-demand variants: parsed/rendered here, but generated + cached by the delivery
 *   route (`src/routes/files/[...path]/+server.ts`) — one encoder configuration for both
 * - The original high-resolution file is always preserved
 * - Variant paths are deterministic: `{tenantId}/{hash}/variants/{preset}-{width}.{format}`
 * - Variant metadata is stored as JSON alongside the media record in `thumbnails`
 * - Sharp is lazy-loaded (same pattern as existing media code) to avoid cold-path overhead
 * - Upload processing is **non-blocking** for the upload response: variants are generated
 *   after the original is saved, so failure to generate variants does not lose the upload
 * - On-demand requests are clamped to a fixed dimension/quality ladder (see
 *   `parseTransformParams`) so a caller can never allocate an arbitrary resolution
 *
 * ### Features:
 * - Configurable width presets (thumbnail, card, default, hero)
 * - Automatic format conversion (WebP primary, JPEG fallback, optional AVIF)
 * - On-demand transform parsing: dimension stride, quality band, explicit/Accept format pick
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

// ─── Constants ────────────────────────────────────────────────────────────

/** Decompression-bomb guard for every Sharp pipeline in this module (100 MP). */
const LIMIT_INPUT_PIXELS = 100_000_000;

/** Maximum output dimension in pixels for any generated variant.
 * Prevents denial-of-wallet attacks via oversized image requests.
 * 6000px can be overridden via environment variables. */
export const MAX_OUTPUT_DIMENSION =
  Number(
    process.env.ASSETS_TRANSFORM_IMAGE_MAX_OUTPUT_DIMENSION ||
      process.env.IMAGE_MAX_OUTPUT_DIMENSION,
  ) || 6000;

// ─── On-demand transform ladder (delivery path) ────────────────────────────

/**
 * Encodable output formats for on-demand transforms (`?fmt=` / `Accept`).
 * Never SVG (keeps its sanitised buffer path) and never GIF (streams unchanged).
 */
export type TransformFormat = "webp" | "avif" | "jpeg" | "png";

/**
 * Allowed output dimensions for `?w` / `?h` — a fixed ladder, never an arbitrary
 * resolution. Requests are snapped DOWN to a step, so the variant cache is bounded
 * and an attacker cannot fill the disk with one file per pixel width.
 * Steps above MAX_OUTPUT_DIMENSION are dropped at load time.
 */
export const TRANSFORM_DIMENSION_STEPS: readonly number[] = (() => {
  const steps = [
    16, 24, 32, 48, 64, 96, 128, 160, 192, 240, 320, 384, 480, 640, 768, 960, 1280, 1600, 1920,
    2560, 3840,
  ];
  const allowed = steps.filter((step) => step <= MAX_OUTPUT_DIMENSION);
  return allowed.length > 0 ? allowed : [Math.max(1, Math.floor(MAX_OUTPUT_DIMENSION))];
})();

/**
 * Allowed quality values for `?q` — snapped to the nearest step, which keeps the
 * variant key space (and therefore disk usage) finite. Band: 50–90.
 */
export const TRANSFORM_QUALITY_STEPS: readonly number[] = [50, 60, 70, 75, 80, 82, 85, 90];

/** Quality used when `?q` is absent or unparseable (matches DEFAULT_CONFIG.quality). */
export const TRANSFORM_DEFAULT_QUALITY = 82;

/**
 * Source MIME types eligible for on-demand transforms: raster formats this module
 * can decode AND re-encode. SVG (sanitised, scriptable), GIF (may be animated),
 * TIFF/BMP/ICO, PDFs and everything else stream unchanged.
 */
export const TRANSFORM_SOURCE_MIME: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

/**
 * Largest source file the delivery path will buffer for a transform. Above this
 * the original is streamed untouched — bounds the one-shot read + Sharp decode.
 */
export const MAX_TRANSFORM_SOURCE_BYTES = 40 * 1024 * 1024;

/**
 * Maximum number of on-demand variants generated concurrently per process.
 * Single-flight collapses duplicate requests for the *same* variant; this caps the
 * aggregate cost of many *different* variants of large sources at once. Requests over
 * the cap stream the original and are transformed on a later request instead.
 */
export const MAX_CONCURRENT_TRANSFORMS = 8;

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

/**
 * Minimal structural view of a Sharp pipeline — keeps new code free of `any`
 * without a compile-time dependency on Sharp's own types.
 */
interface SharpPipeline {
  rotate(): SharpPipeline;
  resize(
    width: number | null,
    height: number | null,
    options?: { fit?: string; withoutEnlargement?: boolean },
  ): SharpPipeline;
  webp(options?: { quality?: number; effort?: number }): SharpPipeline;
  jpeg(options?: { quality?: number; mozjpeg?: boolean }): SharpPipeline;
  avif(options?: { quality?: number; effort?: number }): SharpPipeline;
  png(options?: { compressionLevel?: number; palette?: boolean }): SharpPipeline;
  toBuffer(): Promise<Buffer>;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { size: number } }>;
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

  const meta = await sharp(buffer, {
    limitInputPixels: LIMIT_INPUT_PIXELS,
    failOn: "none",
  }).metadata();
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

  // 🚀 DEDUP: several presets request the same (width, format) pairs
  // (320px/webp ∈ thumbnail ∪ card ∪ default). The old per-preset loop
  // re-decoded/re-encoded/re-wrote the identical storage file for each
  // preset — on a 1080p upload that is 20 variant jobs for 12 unique
  // outputs. Generate each unique pair ONCE and expand the records per
  // referencing preset so the output shape is unchanged.
  const widthPresets = new Map<number, Set<string>>();
  const widthQuality = new Map<number, number>();
  const pairs = new Set<string>();
  for (const presetName of presets) {
    const preset = DEFAULT_PRESETS[presetName];
    if (!preset) {
      logger.warn(`[ImageProcessor] Unknown preset "${presetName}" — skipping`);
      continue;
    }
    for (const w of preset.widths) {
      let set = widthPresets.get(w);
      if (!set) {
        set = new Set();
        widthPresets.set(w, set);
      }
      set.add(presetName);
      // Later presets win for the shared file's encoding quality — matches
      // the old loop's last-write-wins on the identical storage path.
      widthQuality.set(w, preset.quality);
      for (const f of preset.formats) pairs.add(`${w}:${f}`);
    }
  }
  if (pairs.size === 0) return allVariants;

  const sharp = await getSharp();
  const meta = await sharp(buffer, {
    limitInputPixels: LIMIT_INPUT_PIXELS,
    failOn: "none",
  }).metadata();
  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    logger.warn(
      "[ImageProcessor] Unable to determine image dimensions — skipping variant generation",
    );
    return [];
  }

  // Generate each unique (width, format) pair once, in parallel.
  const tasks: Promise<{ variant: ImageVariant; presetNames: Set<string> }>[] = [];
  for (const key of pairs) {
    const sep = key.indexOf(":");
    const targetWidth = Number(key.slice(0, sep));
    const format = key.slice(sep + 1);
    if (targetWidth >= originalWidth) continue; // upscaling adds no value
    const presetNames = widthPresets.get(targetWidth)!;
    tasks.push(
      generateVariant(
        sharp,
        buffer,
        hash,
        targetWidth,
        format,
        {
          ...DEFAULT_CONFIG,
          widths: [targetWidth],
          formats: [format],
          quality: widthQuality.get(targetWidth)!,
        },
        originalHeight,
        originalWidth,
        tenantId,
      ).then((variant) => ({ variant, presetNames })),
    );
  }

  const results = await Promise.allSettled(tasks);

  for (const result of results) {
    if (result.status === "rejected") {
      logger.error("[ImageProcessor] Variant generation failed", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      continue;
    }
    // Expand: one record per referencing preset (same path/size as before),
    // all claiming the shared file's effective quality.
    for (const presetName of result.value.presetNames) {
      allVariants.push({ ...result.value.variant, preset: presetName });
    }
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
  // 🛡️ SECURITY: Cap output dimension to prevent oversized variant generation
  const safeWidth = Math.min(targetWidth, MAX_OUTPUT_DIMENSION);
  // Calculate height preserving aspect ratio
  const height = Math.round((safeWidth / originalWidth) * originalHeight);
  // The preset name is determined by resolvePresetName below

  // Build the sharp pipeline
  const pipeline = applyEncoder(
    sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      // Auto-fix orientation from EXIF
      .rotate()
      // Resize preserving aspect ratio, capped at MAX_OUTPUT_DIMENSION
      .resize(safeWidth, null, { fit: "inside", withoutEnlargement: true }),
    format,
    cfg.quality,
    targetWidth,
  );

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

// ─── On-demand delivery transforms ─────────────────────────────────────────

/**
 * A parsed, clamped on-demand transform request.
 * `width`/`height` are ladder steps (`0` = derive from the other axis); the pair is
 * treated as a bounding box with `sharp.fit.inside`, so aspect ratio is preserved.
 */
export interface TransformPlan {
  width: number;
  height: number;
  format: TransformFormat;
  quality: number;
  /** True when the caller pinned the format via `fmt`/`format` instead of negotiation. */
  explicitFormat: boolean;
}

interface AcceptEntry {
  type: string;
  q: number;
  index: number;
}

/** Map a raster MIME type to an encodable transform format (null = not encodable). */
function rasterFormatFromMime(mime: string | null | undefined): TransformFormat | null {
  switch ((mime ?? "").trim().toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return null;
  }
}

/**
 * Parse an explicit `fmt`/`format` value (`webp`, `image/webp`, `jpg`, …).
 * Wildcards and non-raster formats resolve to null → the transform is rejected.
 */
function parseExplicitFormat(raw: string): TransformFormat | null {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/^image\//, "");
  switch (value) {
    case "webp":
      return "webp";
    case "avif":
      return "avif";
    case "jpeg":
    case "jpg":
      return "jpeg";
    case "png":
      return "png";
    default:
      return null;
  }
}

/** Snap a raw `w`/`h` value down to a ladder step (0 = ignore this axis). */
function snapDimension(raw: string | null): number {
  if (!raw) return 0;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const steps = TRANSFORM_DIMENSION_STEPS;
  const largest = steps[steps.length - 1]!;
  if (value >= largest) return largest;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]! <= value) return steps[i]!;
  }
  return 0; // below the smallest allowed box
}

/** Snap a raw `q` value to the nearest quality step (default when absent). */
function snapQuality(raw: string | null): number {
  if (raw === null) return TRANSFORM_DEFAULT_QUALITY;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return TRANSFORM_DEFAULT_QUALITY;

  let best = TRANSFORM_QUALITY_STEPS[0]!;
  for (const step of TRANSFORM_QUALITY_STEPS) {
    if (Math.abs(step - value) < Math.abs(best - value)) best = step;
  }
  return best;
}

/**
 * Pick the output format from an `Accept` header, honouring `q=` ordering.
 * Only explicit raster types participate: a wildcard range (any `image/…`) or a full
 * wildcard means "no preference" and keeps the source format rather than forcing a
 * re-encode.
 */
export function negotiateTransformFormat(
  accept: string | null,
  sourceFormat: TransformFormat,
): TransformFormat {
  if (!accept) return sourceFormat;

  const entries: AcceptEntry[] = [];
  accept.split(",").forEach((part, index) => {
    const [type, ...params] = part.split(";").map((token) => token.trim());
    if (!type) return;
    let q = 1;
    for (const param of params) {
      const [key, value] = param.split("=").map((token) => token.trim());
      if (key?.toLowerCase() === "q") {
        const parsed = Number.parseFloat(value ?? "1");
        q = Number.isFinite(parsed) ? parsed : 1;
      }
    }
    if (q > 0) entries.push({ type, q, index });
  });

  entries.sort((a, b) => b.q - a.q || a.index - b.index);
  for (const entry of entries) {
    const picked = parseExplicitFormat(entry.type);
    if (picked) return picked;
  }
  return sourceFormat;
}

/**
 * Parse `?w` / `?h` / `?q` / `?fmt|?format` plus the `Accept` header into a clamped
 * transform plan, or null when the request must keep streaming the original.
 *
 * Rejection rules (all resolve to `null` → original bytes, logged at debug level):
 * - no `w`/`h`, or both below the smallest ladder step (≤ 8 px is not a variant)
 * - an explicit `fmt`/`format` that is not an encodable raster format (svg, gif, heic, …)
 * - a source MIME that is not decodable + re-encodable (SVG, GIF, TIFF, PDF, video, …)
 *
 * Normalisation rules:
 * - `w`/`h` snap DOWN to the ladder step (never up), `q` snaps to the nearest of
 *   `TRANSFORM_QUALITY_STEPS`, garbage values fall back to the documented defaults
 *
 * @param searchParams Query of the `/files/**` request
 * @param accept Raw `Accept` header value (null when absent)
 * @param sourceMime MIME type resolved for the stored original
 */
export function parseTransformParams(
  searchParams: URLSearchParams,
  accept: string | null,
  sourceMime: string,
): TransformPlan | null {
  const sourceFormat = rasterFormatFromMime(sourceMime);
  if (!sourceFormat) return null;

  const width = snapDimension(searchParams.get("w"));
  const height = snapDimension(searchParams.get("h"));
  if (width === 0 && height === 0) return null;

  const quality = snapQuality(searchParams.get("q"));
  const rawFormat = searchParams.get("fmt") ?? searchParams.get("format");
  if (rawFormat !== null) {
    const explicit = parseExplicitFormat(rawFormat);
    if (!explicit) return null;
    return { width, height, format: explicit, quality, explicitFormat: true };
  }

  return {
    width,
    height,
    format: negotiateTransformFormat(accept, sourceFormat),
    quality,
    explicitFormat: false,
  };
}

/** Content-Type for a transform output format. */
export function transformFormatToMime(format: TransformFormat): string {
  switch (format) {
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "png":
      return "image/png";
    default:
      return "image/jpeg";
  }
}

/**
 * Detect multi-frame (animated) raster sources from their header bytes.
 * Bounded, conservative header sniff — a false positive only disables the transform
 * (the original animation streams untouched), never the other way round.
 * Animated frames are outside `TRANSFORM_SOURCE_MIME`: resizing a GIF/WebP/AVIF
 * animation would silently drop every frame but the first.
 */
export function isAnimatedRaster(head: Buffer, mime: string): boolean {
  const header = head.subarray(0, 64);
  if (mime === "image/webp") {
    // RIFF/WebP: VP8X flags byte (offset 20) bit 1 = ANIMATION, or an explicit ANIM chunk.
    const isExtended = header.subarray(12, 16).toString("ascii") === "VP8X";
    if (isExtended && header.length >= 21 && (header[20]! & 0x02) !== 0) return true;
    return header.includes("ANIM");
  }
  if (mime === "image/avif") {
    // ftyp brand `avis` = AVIF image sequence (animated).
    return header.toString("latin1").includes("avis");
  }
  return false;
}

/**
 * Render one on-demand variant from the original bytes.
 * Uses the exact encoder settings of the upload-time variants (single source of
 * truth: `applyEncoder`), auto-orients, and never enlarges beyond the source.
 */
export async function renderTransformVariant(source: Buffer, plan: TransformPlan): Promise<Buffer> {
  const sharp = await getSharp();
  const pipeline: SharpPipeline = applyEncoder(
    sharp(source, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .rotate()
      .resize(plan.width || null, plan.height || null, {
        fit: "inside",
        withoutEnlargement: true,
      }),
    plan.format,
    plan.quality,
    plan.width || plan.height,
  );
  return await pipeline.toBuffer();
}

// ─── Encoder settings (shared by upload-time + on-demand variants) ─────────

/**
 * Apply the shared per-format encoder settings.
 * Note: Sharp strips metadata unless `.withMetadata()` is called.
 */
function applyEncoder(
  pipeline: SharpPipeline,
  format: string,
  quality: number,
  targetWidth: number,
): SharpPipeline {
  switch (format) {
    case "webp":
      return pipeline.webp({ quality, effort: 4 });
    case "jpeg":
    case "jpg":
      return pipeline.jpeg({ quality, mozjpeg: true });
    case "avif":
      return pipeline.avif({ quality, effort: 4 });
    case "png":
      return pipeline.png({ compressionLevel: 8, palette: targetWidth > 0 && targetWidth <= 320 });
    default:
      return pipeline.jpeg({ quality });
  }
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
