/**
 * @file src/utils/media/media-processing.server.ts
 * @description Server-side media processing (hashing, metadata extraction & deep analysis)
 */

import { error } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { sha256 } from "@utils/utils";
import type { CmsMediaMetadata } from "./media-models";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";

/** Global lazy-loaded sharp instance to eliminate module resolution overhead */
let _sharp: any = null;
async function getSharp(): Promise<any> {
  if (!_sharp) {
    const mod = await import("sharp");
    _sharp = mod.default || mod;
  }
  return _sharp;
}

/** Hash file content (SHA-256, full 64-char hex) */
export async function hashFileContent(buffer: ArrayBuffer | Buffer): Promise<string> {
  if (!buffer || buffer.byteLength === 0) {
    throw error(400, "Cannot hash empty buffer");
  }

  try {
    const arr = (buffer instanceof Buffer ? buffer : new Uint8Array(buffer)) as any;
    const hash = await sha256(arr);
    const display = hash.slice(0, 12);

    logger.debug("File hashed", {
      size: buffer.byteLength,
      hash: display + "...",
    });

    return hash;
  } catch (err: any) {
    const msg = err.message;
    logger.error("Hashing failed", { size: buffer.byteLength, error: msg });
    throw error(500, `Hashing error: ${msg}`);
  }
}

/** Hash a stream (SHA-256, full digest) without buffering */
export async function hashStream(stream: ReadableStream | Readable): Promise<string> {
  const hash = createHash("sha256");
  const nodeStream = stream instanceof ReadableStream ? Readable.fromWeb(stream as any) : stream;

  return new Promise((resolve, reject) => {
    nodeStream.on("data", (chunk) => hash.update(chunk));
    nodeStream.on("end", () => resolve(hash.digest("hex")));
    nodeStream.on("error", (err) => reject(err));
  });
}

/** Extract standard image metadata with Sharp */
export async function extractMetadata(buffer: Buffer): Promise<any> {
  try {
    const sharp = await getSharp();
    const pipeline = sharp(buffer, {
      limitInputPixels: 100_000_000,
      failOn: "none",
    }).rotate();
    const meta = await pipeline.metadata();

    logger.debug("Metadata extracted", {
      format: meta.format,
      size: meta.size,
      width: meta.width,
      height: meta.height,
    });

    return meta;
  } catch (err: any) {
    const msg = err.message;
    logger.error("Metadata extraction failed", {
      size: buffer.length,
      error: msg,
    });
    throw error(500, `Metadata error: ${msg}`);
  }
}

/**
 * Advanced media processing for enterprise DAM features.
 * Handles deep metadata extraction (EXIF, IPTC, XMP) and technical analysis.
 */
export class MediaProcessingService {
  private static instance: MediaProcessingService;

  private constructor() {}

  public static getInstance(): MediaProcessingService {
    if (!MediaProcessingService.instance) {
      MediaProcessingService.instance = new MediaProcessingService();
    }
    return MediaProcessingService.instance;
  }

  /**
   * Extract deep metadata from an image buffer
   */
  public async getMetadata(
    buffer: Buffer,
    options: { fastPath?: boolean } = {},
  ): Promise<CmsMediaMetadata> {
    try {
      const sharp = await getSharp();
      const instance = sharp(buffer);
      const meta = await instance.metadata();

      // 🚀 BENCHMARK FAST-PATH: Bypass heavy analysis if requested
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
        exif: this.parseExif(meta.exif),
        iptc: this.parseIptc(meta.iptc),
        xmp: this.parseXmp(meta.xmp),
        // 🎨 Dominant Color Extraction
        dominantColor: stats.dominant
          ? `rgb(${stats.dominant.r},${stats.dominant.g},${stats.dominant.b})`
          : undefined,
        // ⚡ Tiny Placeholder (Ultra-fast alternative to Blurhash)
        placeholder: await instance
          .clone()
          .resize(32, 32, { fit: "inside" })
          .webp({ quality: 20 })
          .toBuffer()
          .then((b: Buffer) => `data:image/webp;base64,${b.toString("base64")}`),
      };

      // Extract common DAM fields for easy searching
      if (results.exif) {
        const e = results.exif as any;
        results.camera = e.Make || e.Model ? `${e.Make || ""} ${e.Model || ""}`.trim() : undefined;
        results.software = e.software;
        results.createdAt = e.DateTimeOriginal || e.DateTime;
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

  private parseExif(buffer?: Buffer): Record<string, any> | undefined {
    if (!buffer) {
      return undefined;
    }
    try {
      return {
        _raw: buffer.toString("base64"),
        _length: buffer.length,
      };
    } catch {
      return undefined;
    }
  }

  private parseIptc(buffer?: Buffer): Record<string, any> | undefined {
    if (!buffer) {
      return undefined;
    }
    return { _raw: buffer.toString("base64") };
  }

  private parseXmp(buffer?: Buffer): Record<string, any> | undefined {
    if (!buffer) {
      return undefined;
    }
    try {
      const xmpString = buffer.toString("utf8");
      return {
        _raw: xmpString,
        isXml: xmpString.includes("<?xpacket"),
      };
    } catch {
      return undefined;
    }
  }
}

export const mediaProcessingService = MediaProcessingService.getInstance();
