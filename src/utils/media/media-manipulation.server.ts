/**
 * @file src/utils/media/media-manipulation.server.ts
 * @description Image manipulation pipeline (crop, rotate, filters, watermarks, SVG annotations) for MediaService.
 *
 * Features:
 * - Geometric transforms (crop, circle mask, rotation, horizontal/vertical flip)
 * - Color adjustments and photographic fine-tune filters mapped to Sharp
 * - Dynamic SVG text/image watermarks and multi-shape annotations
 * - Bounded output dimensions and automatic format preservation
 * - High-throughput concurrent batch image processing
 */

import { logger } from "@src/utils/logger";
import { nowISODateString } from "@src/utils/date";
import { getFile, saveFile } from "./media-storage.server";
import {
  processImageWithPresets,
  MAX_OUTPUT_DIMENSION,
  type ImageVariant,
} from "@src/services/media/image-processor";
import type sharp from "sharp";
import type {
  DatabaseId,
  DatabaseResult,
  EntityCreate,
  IDBAdapter,
  MediaItem as DbMediaItem,
} from "@src/databases/db-interface";
import { normalizeFocalPercent } from "./focal-point";
import { MediaProcessingStatus, type MediaItem } from "./media-models";
import { buildOriginalRelPath, clampManipulatedDimensions } from "./media-utils";
import { getSharp, MAX_INPUT_PIXELS, type SharpOverlayOptions } from "./sharp-loader.server";
import {
  buildVersionSnapshot,
  type MediaVersionEntry,
  type VersioningRecord,
} from "./media-versioning.server";

/* -------------------------------------------------------------------------- */
/* Security helpers for SVG attribute injection defense                       */
/* -------------------------------------------------------------------------- */

/** Only allow hex colours (#RGB, #RRGGBB, #RRGGBBAA) in dynamically-built SVG. */
export const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** Only allow plain numeric strings (no expressions, no units) in SVG attributes. */
export const SAFE_NUMBER = /^-?\d+(\.\d+)?$/;

type SharpPipeline = ReturnType<typeof sharp>;

/** One encoder configuration for manipulated output and the optional cap pass. */
export function encodeManipulatedOutput(
  pipeline: SharpPipeline,
  ext: string,
  isCircle: boolean,
): Promise<Buffer> {
  if (isCircle || ext === "png") return pipeline.png({ compressionLevel: 8 }).toBuffer();
  if (ext === "webp") return pipeline.webp({ quality: 90 }).toBuffer();
  if (ext === "avif") return pipeline.avif({ quality: 80 }).toBuffer();
  return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

/**
 * Validate a value against a regex; return a safe fallback when it fails.
 */
export function guardAttr(value: string, pattern: RegExp, fallback: string): string {
  if (pattern.test(value)) return value;
  logger.warn(`[MediaService] Rejected unsafe SVG attribute value: "${value}"`);
  return fallback;
}

/**
 * Like guardAttr but for numeric values.
 */
export function guardNumeric(value: number, fallback: number): number {
  if (SAFE_NUMBER.test(String(value))) return value;
  logger.warn(`[MediaService] Rejected unsafe SVG numeric value: ${value}`);
  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Media manipulation options                                                 */
/* -------------------------------------------------------------------------- */

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: "circle" | "rect";
}

export interface FilterOptions {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  grayscale?: number;
  sepia?: number;
  temperature?: number;
  exposure?: number;
  highlights?: number;
  shadows?: number;
  clarity?: number;
  vibrance?: number;
  tint?: number;
  sharpness?: number;
}

export interface BlurRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  strength?: number;
}

export interface TextWatermark {
  type: "text";
  text: string;
  color?: string;
  fontSize?: number;
  opacity?: number;
  x: number;
  y: number;
}

export interface ImageWatermark {
  type: "image";
  imageUrl: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export type Watermark = TextWatermark | ImageWatermark;

export interface Annotation {
  type: "rect" | "circle" | "text" | "arrow" | "line";
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  fontSize?: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
}

export interface MediaManipulation {
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  crop?: CropOptions;
  resize?: { width?: number; height?: number };
  filters?: FilterOptions;
  blurRegions?: BlurRegion[];
  watermarks?: Watermark[];
  annotations?: Annotation[];
  focalPoint?: { x: number; y: number };
  saveBehavior?: "overwrite" | "new";
}

export interface MediaManipulationContext {
  db: IDBAdapter;
  files: {
    upload(
      item: EntityCreate<DbMediaItem>,
      options?: { tenantId?: DatabaseId | null },
    ): Promise<DatabaseResult<DbMediaItem>>;
  };
  enrichMediaWithUrl(item: Record<string, unknown>, prefix?: string): Record<string, unknown>;
  updateMedia(
    id: string,
    data: Record<string, unknown>,
    tenantId?: DatabaseId | null,
    options?: { internal?: boolean },
  ): Promise<void>;
  buildDerivativeSet(
    buffer: Buffer,
    hash: string,
    filename: string,
    effectiveType: string,
    tenantId?: DatabaseId | null,
  ): Promise<{ metadata: Record<string, unknown>; thumbnails: Record<string, unknown> }>;
}

/**
 * Execute image manipulations on an existing media record.
 */
export async function executeMediaManipulation(
  ctx: MediaManipulationContext,
  id: string,
  manipulations: MediaManipulation,
  userId: string,
  tenantId?: DatabaseId | null,
): Promise<MediaItem> {
  const { hashFileContent } = await import("./media-processing.server");
  const sharp = await getSharp();

  // 1. Load existing record
  const res = await ctx.db.crud.findOne<DbMediaItem>(
    "media",
    { _id: id as DatabaseId },
    { tenantId: tenantId },
  );
  if (!res.success || !res.data) throw new Error("Media not found");
  const existing = res.data;

  // 2. Read original file + get dimensions once
  const originalBuffer = await getFile(existing.path);
  const meta = await sharp(originalBuffer, {
    limitInputPixels: MAX_INPUT_PIXELS,
    failOn: "none",
  }).metadata();
  const imgW = meta.width ?? 1;
  const imgH = meta.height ?? 1;

  const {
    rotation,
    flipH,
    flipV,
    crop,
    filters,
    blurRegions,
    watermarks,
    annotations,
    saveBehavior,
    focalPoint,
  } = manipulations;

  const storedFocal = focalPoint ? normalizeFocalPercent(focalPoint) : undefined;

  // 3. Geometry — crop first, then flip, then rotate
  const cropRect =
    crop && crop.width > 0 && crop.height > 0
      ? (() => {
          const x = Math.min(Math.max(0, Math.round(crop.x)), imgW - 1);
          const y = Math.min(Math.max(0, Math.round(crop.y)), imgH - 1);
          return {
            x,
            y,
            width: Math.min(Math.max(1, Math.round(crop.width)), imgW - x),
            height: Math.min(Math.max(1, Math.round(crop.height)), imgH - y),
          };
        })()
      : null;

  const cropX = cropRect?.x ?? 0;
  const cropY = cropRect?.y ?? 0;
  const workW = cropRect?.width ?? imgW;
  const workH = cropRect?.height ?? imgH;

  const ext = (existing.filename.split(".").pop() ?? "jpg").toLowerCase();
  const isCircle = crop?.shape === "circle";
  const preservesAlpha = isCircle || ext === "png" || ext === "webp" || ext === "avif";

  let preparedBuffer = originalBuffer;
  if (cropRect) {
    let cropped = sharp(originalBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "none",
    }).extract({
      left: cropRect.x,
      top: cropRect.y,
      width: cropRect.width,
      height: cropRect.height,
    });

    if (isCircle) {
      const radius = Math.min(cropRect.width, cropRect.height) / 2;
      const circleSvg = Buffer.from(
        `<svg width="${cropRect.width}" height="${cropRect.height}"><circle cx="${cropRect.width / 2}" cy="${cropRect.height / 2}" r="${radius}" fill="#ffffff"/></svg>`,
      );
      cropped = cropped.ensureAlpha().composite([{ input: circleSvg, blend: "dest-in" }]);
    }

    preparedBuffer = await cropped.png({ compressionLevel: 8 }).toBuffer();
  }

  const effectiveRotation = (rotation ?? 0) * (flipH !== flipV ? -1 : 1);

  let pipeline = sharp(preparedBuffer, {
    limitInputPixels: MAX_INPUT_PIXELS,
    failOn: "none",
  });
  if (flipH) pipeline = pipeline.flop();
  if (flipV) pipeline = pipeline.flip();
  if (rotation) {
    pipeline = pipeline.rotate(effectiveRotation, {
      background: preservesAlpha
        ? { r: 0, g: 0, b: 0, alpha: 0 }
        : { r: 255, g: 255, b: 255, alpha: 1 },
    });
  }

  // — Colour filters —
  if (filters) {
    const {
      brightness = 0,
      contrast = 0,
      saturation = 0,
      grayscale = 0,
      sepia = 0,
      temperature = 0,
      exposure = 0,
      highlights = 0,
      shadows = 0,
      clarity = 0,
      vibrance = 0,
      tint = 0,
      sharpness = 0,
    } = filters;

    let brightnessFactor = 1 + brightness / 100;
    let saturationFactor = 1 + saturation / 100;
    let contrastFactor = 1 + contrast / 100;
    let hueShift = 0;

    if (exposure !== 0) brightnessFactor *= 1 + (exposure * 1.2) / 100;
    if (vibrance !== 0) saturationFactor *= 1 + (vibrance * 0.7) / 100;

    if (clarity !== 0) {
      if (clarity > 0) {
        contrastFactor *= 1 + (clarity * 0.42) / 100;
        saturationFactor *= 1 + (clarity * 0.18) / 100;
        brightnessFactor *= 1 - (clarity * 0.05) / 100;
      } else {
        const softness = Math.abs(clarity);
        contrastFactor *= 1 - (softness * 0.26) / 100;
        brightnessFactor *= 1 + (softness * 0.1) / 100;
        saturationFactor *= 1 - (softness * 0.08) / 100;
      }
    }

    if (highlights !== 0) {
      if (highlights > 0) {
        brightnessFactor *= 1 + (highlights * 0.25) / 100;
        contrastFactor *= 1 - (highlights * 0.08) / 100;
      } else {
        const lift = Math.abs(highlights);
        contrastFactor *= 1 + (lift * 0.12) / 100;
        brightnessFactor *= 1 - (lift * 0.08) / 100;
      }
    }

    if (shadows !== 0) {
      if (shadows > 0) {
        brightnessFactor *= 1 + (shadows * 0.2) / 100;
        contrastFactor *= 1 - (shadows * 0.05) / 100;
      } else {
        const depth = Math.abs(shadows);
        brightnessFactor *= 1 - (depth * 0.18) / 100;
        contrastFactor *= 1 + (depth * 0.1) / 100;
      }
    }

    let temperatureSepia = 0;
    if (temperature > 0) {
      temperatureSepia = Math.min(1, (temperature * 0.3) / 100);
      hueShift -= temperature * 0.2;
    } else if (temperature < 0) {
      hueShift += Math.abs(temperature) * 0.3;
    }

    if (tint !== 0) hueShift += tint * 1.5;

    const brightnessValue = Math.max(0, brightnessFactor);
    const saturationValue = Math.max(0, saturationFactor);
    if (brightnessValue !== 1 || saturationValue !== 1 || hueShift !== 0) {
      pipeline = pipeline.modulate({
        brightness: brightnessValue,
        saturation: saturationValue,
        ...(hueShift !== 0 ? { hue: hueShift } : {}),
      });
    }

    const contrastValue = Math.max(0, contrastFactor);
    if (contrastValue !== 1) {
      pipeline = pipeline.linear(contrastValue, 128 * (1 - contrastValue));
    }

    if (grayscale > 0) pipeline = pipeline.grayscale();

    const sepiaMatrix = (
      strength: number,
    ): [[number, number, number], [number, number, number], [number, number, number]] => {
      const s = Math.min(1, Math.max(0, strength));
      return [
        [0.393 * s + 1 * (1 - s), 0.769 * s, 0.189 * s],
        [0.349 * s, 0.686 * s + 1 * (1 - s), 0.168 * s],
        [0.272 * s, 0.534 * s, 0.131 * s + 1 * (1 - s)],
      ];
    };

    const sepiaStrength = Math.min(1, sepia / 100) + temperatureSepia;
    if (sepiaStrength > 0) pipeline = pipeline.recomb(sepiaMatrix(sepiaStrength));

    const detailStrength = sharpness / 72 + clarity / 92;
    if (detailStrength > 0) {
      pipeline = pipeline.sharpen({ sigma: 0.5 + Math.min(1, detailStrength) * 1.5 });
    } else if (detailStrength < 0) {
      pipeline = pipeline.blur(0.3 + Math.min(1, Math.abs(detailStrength)) * 1.7);
    }
  }

  // 4. Collect composites
  const composites: SharpOverlayOptions[] = [];

  if (Array.isArray(blurRegions) && blurRegions.length > 0) {
    for (const region of blurRegions) {
      const rx = Math.max(0, Math.round(region.x));
      const ry = Math.max(0, Math.round(region.y));
      const rw = Math.min(Math.round(region.width), imgW - rx);
      const rh = Math.min(Math.round(region.height), imgH - ry);
      if (rw <= 0 || rh <= 0) continue;
      const compositeLeft = Math.max(0, rx - cropX);
      const compositeTop = Math.max(0, ry - cropY);
      if (compositeLeft >= workW || compositeTop >= workH) continue;
      const blurBuf = await sharp(originalBuffer)
        .extract({ left: rx, top: ry, width: rw, height: rh })
        .blur(Math.max(0.3, (region.strength ?? 20) * 0.5))
        .toBuffer();
      composites.push({
        input: blurBuf,
        left: compositeLeft,
        top: compositeTop,
        blend: "over",
      });
    }
  }

  const escXml = (s: string) =>
    s.replace(
      /[<>&"]/g,
      (c: string) =>
        (
          {
            "<": "&lt;",
            ">": "&gt;",
            "&": "&amp;",
            '"': "&quot;",
          } as Record<string, string>
        )[c] ?? c,
    );

  if (Array.isArray(watermarks) && watermarks.length > 0) {
    for (const wm of watermarks) {
      if (wm.type === "text" && wm.text) {
        const fontSize = guardNumeric(Math.round(wm.fontSize ?? 48), 48);
        const color = guardAttr(wm.color ?? "#ffffff", SAFE_COLOR, "#ffffff");
        const opacity = Math.round((wm.opacity ?? 0.8) * 255)
          .toString(16)
          .padStart(2, "0");
        const left = Math.max(0, Math.round(wm.x) - cropX);
        const top = Math.max(0, Math.round(wm.y) - cropY);
        const svgText = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${workW}" height="${workH}">` +
            `<text x="${left}" y="${top + fontSize}" font-size="${fontSize}" fill="${color}${opacity}" font-family="sans-serif">${escXml(wm.text)}</text>` +
            `</svg>`,
        );
        composites.push({ input: svgText, top: 0, left: 0, blend: "over" });
      } else if (wm.type === "image" && wm.imageUrl) {
        try {
          const wmLeft = Math.max(0, Math.round(wm.x) - cropX);
          const wmTop = Math.max(0, Math.round(wm.y) - cropY);
          const wmW = Math.min(Math.round(wm.width ?? 100), workW - wmLeft);
          const wmH = Math.min(Math.round(wm.height ?? 100), workH - wmTop);
          if (wmW > 0 && wmH > 0) {
            const wmBuf = await sharp(Buffer.from(wm.imageUrl.split(",")[1] ?? "", "base64"), {
              limitInputPixels: MAX_INPUT_PIXELS,
              failOn: "none",
            })
              .resize(wmW, wmH, { fit: "contain" })
              .ensureAlpha()
              .toBuffer();
            composites.push({
              input: wmBuf,
              left: wmLeft,
              top: wmTop,
              blend: "over",
            });
          }
        } catch {
          logger.warn(`[manipulateMedia] Skipping invalid watermark image`);
        }
      }
    }
  }

  if (Array.isArray(annotations) && annotations.length > 0) {
    const shapes = annotations
      .map((a: Annotation) => {
        const stroke = guardAttr(a.stroke ?? "#ff0000", SAFE_COLOR, "#ff0000");
        const fill = a.fill === "none" ? "none" : guardAttr(a.fill ?? "none", SAFE_COLOR, "none");
        const sw = guardNumeric(a.strokeWidth ?? 2, 2);
        const ax = (a.x ?? 0) - cropX;
        const ay = (a.y ?? 0) - cropY;
        switch (a.type) {
          case "rect":
            return `<rect x="${ax}" y="${ay}" width="${a.width ?? 50}" height="${a.height ?? 50}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}"/>`;
          case "circle":
            return `<circle cx="${ax}" cy="${ay}" r="${a.radius ?? 25}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}"/>`;
          case "text":
            return `<text x="${ax}" y="${ay}" font-size="${guardNumeric(a.fontSize ?? 20, 20)}" fill="${stroke}" font-family="sans-serif">${escXml(String(a.text ?? ""))}</text>`;
          case "arrow":
          case "line":
            return `<line x1="${ax}" y1="${ay}" x2="${ax + (a.width ?? 50)}" y2="${ay + (a.height ?? 0)}" stroke="${stroke}" stroke-width="${sw}"/>`;
          default:
            return "";
        }
      })
      .filter(Boolean)
      .join("\n");

    if (shapes) {
      const svgOverlay = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${workW}" height="${workH}">${shapes}</svg>`,
      );
      composites.push({ input: svgOverlay, top: 0, left: 0, blend: "over" });
    }
  }

  if (composites.length > 0) pipeline = pipeline.composite(composites);

  // 5. Encode
  const encoded = await encodeManipulatedOutput(pipeline, ext, isCircle);

  let outputBuffer: Buffer = encoded;
  let outputW = workW;
  let outputH = workH;

  if (rotation || cropRect) {
    const encodedMeta = await sharp(encoded, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    outputW = encodedMeta.width ?? outputW;
    outputH = encodedMeta.height ?? outputH;
  }

  const requestedResize = manipulations.resize;
  if (requestedResize && (requestedResize.width || requestedResize.height)) {
    const clampDimension = (value: number | undefined) =>
      value === undefined
        ? undefined
        : Math.min(Math.max(Math.round(value), 32), MAX_OUTPUT_DIMENSION);
    const resized = sharp(outputBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "none",
    }).resize({
      width: clampDimension(requestedResize.width),
      height: clampDimension(requestedResize.height),
      fit: "inside",
      withoutEnlargement: true,
    });
    outputBuffer = await encodeManipulatedOutput(resized, ext, isCircle);
    const resizedMeta = await sharp(outputBuffer).metadata();
    outputW = resizedMeta.width ?? outputW;
    outputH = resizedMeta.height ?? outputH;
    logger.debug(`[manipulateMedia] Explicit resize → ${outputW}x${outputH}`);
  }

  const capped = clampManipulatedDimensions(outputW, outputH, MAX_OUTPUT_DIMENSION);
  if (capped.width !== outputW || capped.height !== outputH) {
    const downscaled = sharp(encoded, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "none",
    }).resize({
      width: capped.width,
      height: capped.height,
      fit: "inside",
      withoutEnlargement: true,
    });
    outputBuffer = await encodeManipulatedOutput(downscaled, ext, isCircle);
    logger.debug(
      `[manipulateMedia] Capped output ${outputW}x${outputH} → ${capped.width}x${capped.height} (max ${MAX_OUTPUT_DIMENSION}px)`,
    );
  }

  // 6. Hash, persist, update DB
  const outputFilename =
    isCircle && !existing.filename.endsWith(".png")
      ? existing.filename.replace(/\.[^.]+$/, ".png")
      : existing.filename;
  const outputMime = isCircle ? "image/png" : existing.mimeType;
  const newHash = await hashFileContent(outputBuffer);
  const relPath = buildOriginalRelPath(newHash, outputFilename, tenantId);
  await saveFile(outputBuffer, relPath);
  const now = nowISODateString();

  const { metadata: derivativeMetadata, thumbnails: derivativeThumbnails } =
    await ctx.buildDerivativeSet(outputBuffer, newHash, outputFilename, outputMime, tenantId);
  let editedVariants: ImageVariant[] = [];
  try {
    editedVariants = await processImageWithPresets(
      outputBuffer,
      newHash,
      ["thumbnail", "card", "default"],
      tenantId,
    );
  } catch (variantErr) {
    logger.warn("[Media] Variant generation failed during image edit — original intact", {
      error: variantErr instanceof Error ? variantErr.message : String(variantErr),
    });
  }
  const editedVariantMetadata = editedVariants.map((v) => ({
    preset: v.preset,
    width: v.width,
    height: v.height,
    format: v.format,
    quality: v.quality,
    path: v.path,
    size: v.size,
  }));
  const editedStatus =
    editedVariantMetadata.length > 0 ? MediaProcessingStatus.Ready : MediaProcessingStatus.Failed;

  if (saveBehavior === "new") {
    const uploadResult = await ctx.files.upload(
      {
        filename: outputFilename,
        originalFilename: outputFilename,
        mimeType: outputMime,
        size: outputBuffer.byteLength,
        hash: newHash,
        path: relPath,
        createdBy: userId,
        updatedBy: userId,
        metadata: {
          ...derivativeMetadata,
          versions: [],
          ...(storedFocal ? { focalPoint: storedFocal } : {}),
          imageVariants: editedVariantMetadata,
          processingStatus: editedStatus,
          ...(editedStatus === MediaProcessingStatus.Failed
            ? { processingError: "No variants generated" }
            : {}),
        },
        thumbnails: derivativeThumbnails,
        access: existing.access || "public",
        folderId: existing.folderId ?? undefined,
        originalId: id,
        tenantId: tenantId,
      } as unknown as EntityCreate<DbMediaItem>,
      { tenantId: tenantId },
    );
    if (!uploadResult.success || !uploadResult.data)
      throw new Error("Failed to create new media record");
    return ctx.enrichMediaWithUrl(
      uploadResult.data as unknown as Record<string, unknown>,
    ) as unknown as MediaItem;
  }

  // overwrite: push current file to version history, update record in place
  const existingR = existing as unknown as VersioningRecord;
  const versions = (existingR.metadata?.versions as MediaVersionEntry[] | undefined) || [];
  const overwritePatch = {
    hash: newHash,
    path: relPath,
    size: outputBuffer.byteLength,
    thumbnails: derivativeThumbnails,
    updatedBy: userId,
    updatedAt: now,
    metadata: {
      ...existing.metadata,
      ...derivativeMetadata,
      ...(storedFocal ? { focalPoint: storedFocal } : {}),
      imageVariants: editedVariantMetadata,
      processingStatus: editedStatus,
      ...(editedStatus === MediaProcessingStatus.Failed
        ? { processingError: "No variants generated" }
        : {}),
      versions: [
        ...versions,
        buildVersionSnapshot(existingR, versions.length + 1, userId, "edit", now),
      ],
    },
  };
  await ctx.updateMedia(id, overwritePatch, tenantId, { internal: true });

  return ctx.enrichMediaWithUrl({
    ...existingR,
    ...overwritePatch,
  }) as unknown as MediaItem;
}

/**
 * Concurrent batch image manipulation runner.
 */
export async function executeBatchProcessImages(
  manipulate: (
    id: string,
    config: MediaManipulation,
    userId: string,
    tenantId?: DatabaseId | null,
  ) => Promise<MediaItem>,
  ids: string[],
  config: MediaManipulation,
  userId: string,
  tenantId?: DatabaseId | null,
): Promise<MediaItem[]> {
  if (ids.length === 0) return [];
  const concurrency = Math.min(4, ids.length);
  const ordered: Array<MediaItem | undefined> = Array.from({ length: ids.length }, () => undefined);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < ids.length) {
        const idx = cursor++;
        const id = ids[idx];
        try {
          ordered[idx] = await manipulate(id, config, userId, tenantId);
        } catch (err) {
          logger.error(`Batch processing failed for ${id}:`, err);
        }
      }
    }),
  );

  return ordered.filter((item): item is MediaItem => item !== undefined);
}
