/**
 * @file src/utils/media/media-service.server.ts
 * @description Standard media service for SveltyCMS.
 *
 * Features:
 * - Media deduplication via hash
 * - URL enrichment with tenant prefixes
 * - Transformation & Manipulation (Sharp)
 * - Batch processing
 */

import { error } from "@sveltejs/kit";
import { logger } from "@src/utils/logger";
import { fileExists, getFile, saveFile } from "./media-storage.server";
import type {
  IDBAdapter,
  DatabaseError,
  DatabaseId,
  DatabaseResult,
  MediaItem as DbMediaItem,
} from "@src/databases/db-interface";
import type { MediaItem } from "./media-models";
import { buildOriginalRelPath, resolveMediaRelPath } from "./media-utils";
import { getUrl } from "./cloud-storage";
import { validateEgressUrl, safeFetch } from "../egress-guard";
import { sniffMimeType } from "./slim-sniffer.server";

/**
 * 🛡️ Lightweight SVG sanitizer — strips dangerous elements and attributes
 * without requiring a DOM parser (zero additional runtime deps).
 *
 * Strips: script, foreignObject, iframe, object, embed tags (with content)
 * Strips: all on* event handlers, javascript:/data: URIs in href/xlink:href
 * Strips: CDATA blocks, XML processing instructions, DOCTYPE declarations
 *
 * Defense-in-depth: the RichText/Sanitize display pipeline also applies DOMPurify client-side
 */
function sanitizeSvg(svg: string): string {
  let cleaned = svg;
  let previous = "";

  // Iterative scrubbing — prevents XML label-nesting bypass attacks
  // (same defense as sanitize-html.ts)
  while (cleaned !== previous) {
    previous = cleaned;

    // 1. Strip dangerous tags (with their content, including self-closing variants)
    const DANGEROUS_TAGS = ["script", "foreignObject", "iframe", "object", "embed"];
    for (const tag of DANGEROUS_TAGS) {
      cleaned = cleaned.replace(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "gi"), "");
      cleaned = cleaned.replace(new RegExp(`<${tag}[\\s>][\\s\\S]*?/>`, "gi"), "");
    }

    // 2. Strip inline event handlers — inside loop for defense-in-depth
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
    cleaned = cleaned.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");
  }

  // 3. Strip javascript: and data: protocols in href/xlink:href attributes
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*"\s*javascript\s*:/gi, '$1="#blocked"');
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*'\s*javascript\s*:/gi, "$1='#blocked'");
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*"\s*data\s*:/gi, '$1="#blocked"');
  cleaned = cleaned.replace(/(href|xlink:href)\s*=\s*'\s*data\s*:/gi, "$1='#blocked'");

  // 4. Strip CDATA-wrapped scripts (potential XSS vectors)
  cleaned = cleaned.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, "");

  // 5. Strip XML processing instructions (potential XXE vectors)
  cleaned = cleaned.replace(/<\?[\s\S]*?\?>/gi, "");

  // 6. Strip DOCTYPE declarations (external entity injection)
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, "");

  return cleaned;
}

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
];

function isSvgFile(mimeType: string, filename: string): boolean {
  return mimeType === "image/svg+xml" || filename.toLowerCase().endsWith(".svg");
}

function validateMime(mimeType: string, filename: string) {
  if (!mimeType) {
    // Fall back to extension-based lookup
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && ["svg", "html", "js", "wasm"].includes(ext)) throw new Error("Blocked: ." + ext);
    return; // Allow through — binary sniffing will run downstream
  }
  if (!ALLOWED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && ["svg", "html", "js", "wasm"].includes(ext)) throw new Error("Blocked: ." + ext);
    throw new Error("MIME not allowed: " + mimeType);
  }
}

export class MediaService {
  private readonly db: IDBAdapter;
  private static hookRegistered = false;

  constructor(db: IDBAdapter) {
    this.db = db;
    if (!this.db) {
      throw error(500, "Database adapter not available");
    }

    // 🚀  Register automatic cleanup hook
    if (!MediaService.hookRegistered && this.db.registerHook) {
      MediaService.hookRegistered = true;
      this.db.registerHook({
        id: "media-cleanup",
        type: "before",
        action: "delete",
        handler: async (collection: string, query: any) => {
          if (
            collection === "media_items" ||
            collection === "mediaItems" ||
            collection === "media"
          ) {
            const id = query?._id;
            if (id) {
              try {
                await this.deleteMedia(id.toString(), (query as any)?.tenantId);
              } catch (e) {
                logger.error(`[Hooks] Media cleanup failed:`, e);
              }
            }
          }
        },
      });
    }
  }

  public get files() {
    return this.db.media.files;
  }

  private async ensureOriginalOnDisk(
    hash: string,
    filename: string,
    data: Buffer | ReadableStream | import("node:stream").Readable,
  ): Promise<string> {
    const relPath = buildOriginalRelPath(hash, filename);
    try {
      await getFile(relPath);
      return relPath;
    } catch {
      // Missing on disk (e.g. after test reset with dedup hit) — re-persist below
    }

    if (data instanceof Buffer) {
      await saveFile(data, relPath);
      return relPath;
    }

    await saveFile(data, relPath);
    if (!(await fileExists(relPath))) {
      throw new Error(`Media file was not persisted to disk: ${relPath}`);
    }
    return relPath;
  }

  /**
   * 🚀 AGNOSTIC CORE: Saves a media item to the database and physical storage.
   */
  public async saveMedia(
    file:
      | File
      | {
          name: string;
          type: string;
          size: number;
          stream: () => ReadableStream;
          arrayBuffer?: () => Promise<ArrayBuffer>;
        },
    _userId: string,
    _access: "public" | "private" = "public",
    tenantId?: DatabaseId | null,
    _basePath?: string,
    _watermarkOptions?: any,
    _userContext?: any,
    _skipResizing?: boolean,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      validateMime(file.type, file.name);
      const { hashFileContent } = await import("./media-processing.server");

      // For large files, we use the stream to avoid OOM
      if (file.size < 5 * 1024 * 1024 && typeof file.arrayBuffer === "function") {
        // Small file: Buffer is fine and faster for small items
        let buffer = Buffer.from(await file.arrayBuffer());

        // Binary MIME sniffing as defense-in-depth
        const sniffed = sniffMimeType(buffer.subarray(0, 2048));
        const effectiveType = file.type || sniffed?.mime || "application/octet-stream";

        // 🛡️ SVG Sanitization: strip scripts, event handlers, and foreignObject before storage
        if (isSvgFile(effectiveType, file.name)) {
          const raw = buffer.toString("utf-8");
          const sanitized = sanitizeSvg(raw);
          buffer = Buffer.from(sanitized, "utf-8");
        }

        const hash = await hashFileContent(buffer);
        const relPath = await this.ensureOriginalOnDisk(hash, file.name, buffer);

        // 1. Check for existing file by hash (Deduplication)
        const existing = await this.files.getByHash(hash, tenantId ?? undefined);
        if (existing.success && existing.data) {
          const record = existing.data as any;
          if (record.path !== relPath) {
            await this.db.crud.update("media_items", record._id, {
              path: relPath,
            } as any);
            record.path = relPath;
          }
          return {
            success: true,
            data: this.enrichMediaWithUrl(record) as unknown as MediaItem,
          };
        }
        return (await this.files.upload(
          {
            filename: file.name,
            originalFilename: file.name,
            mimeType: file.type,
            size: file.size,
            hash,
            path: relPath,
            createdBy: _userId,
            updatedBy: _userId,
            metadata: {},
            thumbnails: {},
            access: _access,
            tenantId: tenantId ?? undefined,
          } as any,
          tenantId ?? undefined,
        )) as any;
      } else {
        // Large file: Stream it!
        // MIME sniffing for large files — read first 2048 bytes for validation
        const headerBuffer =
          typeof (file as any).slice === "function"
            ? Buffer.from(await (file as any).slice(0, 2048).arrayBuffer())
            : null;
        const sniffedLarge = headerBuffer ? sniffMimeType(headerBuffer) : null;
        if (
          sniffedLarge &&
          sniffedLarge.mime !== "application/octet-stream" &&
          file.type &&
          sniffedLarge.mime.split("/")[0] !== file.type.split("/")[0]
        ) {
          throw new Error(
            `MIME type mismatch: client sent "${file.type}", binary signature indicates "${sniffedLarge.mime}"`,
          );
        }

        // We tee the stream: one for hashing, one for uploading
        const { hashStream } = await import("./media-processing.server");

        const stream = file.stream();
        const [s1, s2] = stream.tee();

        // Start hashing in parallel
        const hashPromise = hashStream(s1);

        // We need the hash for deduplication, so we have to wait for it
        // OR we upload to a temp name and then rename.
        // For Performance Tweaks, let's assume we want to avoid double-upload.
        const hash = await hashPromise;
        const relPath = await this.ensureOriginalOnDisk(hash, file.name, s2);

        const existing = await this.files.getByHash(hash, tenantId ?? undefined);
        if (existing.success && existing.data) {
          const record = existing.data as any;
          if (record.path !== relPath) {
            await this.db.crud.update("media_items", record._id, {
              path: relPath,
            } as any);
            record.path = relPath;
          }
          return {
            success: true,
            data: this.enrichMediaWithUrl(record) as unknown as MediaItem,
          };
        }

        return (await this.files.upload(
          {
            filename: file.name,
            originalFilename: file.name,
            mimeType: file.type,
            size: file.size,
            hash,
            path: relPath,
            createdBy: _userId,
            updatedBy: _userId,
            metadata: {},
            thumbnails: {},
            access: _access,
            tenantId: tenantId ?? undefined,
          } as any,
          tenantId ?? undefined,
        )) as any;
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: err as DatabaseError,
      };
    }
  }

  /**
   * Enriches a media item with a full URL including optional tenant prefix.
   */
  public enrichMediaWithUrl(item: any, prefix?: string): any {
    if (!item) return item;

    const rel = resolveMediaRelPath(item);
    const p = rel || item.path || item.url;
    if (p && !p.startsWith("http")) {
      item.url = getUrl(p, prefix);
    }

    // Process thumbnails
    if (item.thumbnails) {
      for (const key in item.thumbnails) {
        const thumb = item.thumbnails[key];
        if (thumb && (thumb.path || thumb.url)) {
          thumb.url = getUrl(thumb.path || thumb.url, prefix);
        }
      }
    }

    // Process versions from metadata
    if (item.metadata && item.metadata.versions) {
      item.versions = item.metadata.versions.map((v: any) => {
        const enriched = { ...v };
        if (enriched.path && (!enriched.url || !enriched.url.startsWith("http"))) {
          enriched.url = getUrl(enriched.path, prefix);
        }
        return enriched;
      });
    } else {
      item.versions = [];
    }

    return item;
  }

  public async saveRemoteMedia(
    url: string,
    userId: string,
    access: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      validateEgressUrl(url, {
        allowHttp: process.env.NODE_ENV === "development",
      });
      const resp = await safeFetch(url, {
        timeoutMs: 30000,
        maxSizeBytes: 100 * 1024 * 1024,
      });
      if (!resp.success || !resp.body || (resp.status && resp.status >= 400))
        throw new Error(`Failed to fetch remote media: ${resp.error || resp.status}`);
      const blob = new Blob([resp.body], { type: "application/octet-stream" });
      const name = url.split("/").pop() || "remote-file";
      const file = new File([blob], name, { type: blob.type });

      return await this.saveMedia(file, userId, access as any, tenantId);
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: err as DatabaseError,
      };
    }
  }

  public async updateMedia(
    mediaId: string,
    data: any,
    tenantId?: DatabaseId | null,
  ): Promise<void> {
    const res = await this.db.crud.update("media", mediaId as DatabaseId, data, {
      tenantId: tenantId ?? undefined,
    });
    if (!res.success) throw new Error(res.message);
  }

  public async deleteMedia(fileId: string, tenantId?: DatabaseId | null): Promise<void> {
    const res = await this.files.delete(fileId as DatabaseId, tenantId ?? undefined);
    if (!res.success) throw new Error(res.message);
  }

  public async manipulateMedia(
    id: string,
    manipulations: any,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaItem> {
    const { hashFileContent } = await import("./media-processing.server");
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default || sharpMod;

    // 1. Load existing record
    const res = await this.db.crud.findOne<DbMediaItem>(
      "media",
      { _id: id as DatabaseId },
      { tenantId: tenantId ?? undefined },
    );
    if (!res.success || !res.data) throw new Error("Media not found");
    const existing = res.data as any;

    // 2. Read original file + get dimensions once (reused by blur/watermark)
    const originalBuffer = await getFile(existing.path);
    const meta = await sharp(originalBuffer).metadata();
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
    } = manipulations;

    // 3. Build Sharp pipeline — order matters: geometry first, then colour, then composites
    let pipeline = sharp(originalBuffer, { failOn: "none" });

    // — Geometry —
    if (rotation) pipeline = pipeline.rotate(rotation);
    if (flipH) pipeline = pipeline.flop();
    if (flipV) pipeline = pipeline.flip();

    // After rotation the canvas dimensions may swap — re-read them from the intermediate buffer
    let postRotW = imgW;
    let postRotH = imgH;
    if (rotation || flipH || flipV) {
      const rotBuf = await pipeline.clone().toBuffer();
      const rotMeta = await sharp(rotBuf).metadata();
      postRotW = rotMeta.width ?? imgW;
      postRotH = rotMeta.height ?? imgH;
    }

    // Clamp crop to the post-rotation canvas so Sharp never gets an out-of-bounds extract
    const cropX =
      crop && crop.width > 0 && crop.height > 0
        ? Math.min(Math.max(0, Math.round(crop.x)), postRotW - 1)
        : 0;
    const cropY =
      crop && crop.width > 0 && crop.height > 0
        ? Math.min(Math.max(0, Math.round(crop.y)), postRotH - 1)
        : 0;

    // Working dimensions after crop (used to clamp/size all composites)
    const workW =
      crop && crop.width > 0 ? Math.min(Math.round(crop.width), postRotW - cropX) : postRotW;
    const workH =
      crop && crop.height > 0 ? Math.min(Math.round(crop.height), postRotH - cropY) : postRotH;

    if (crop && crop.width > 0 && crop.height > 0) {
      pipeline = pipeline.extract({
        left: cropX,
        top: cropY,
        width: workW,
        height: workH,
      });

      if (crop.shape === "circle") {
        // Build circular alpha mask as raw RGBA pixels — no librsvg dependency
        const cx = workW / 2;
        const cy = workH / 2;
        const rx = workW / 2;
        const ry = workH / 2;
        const maskPixels = Buffer.alloc(workW * workH * 4, 0);
        for (let y = 0; y < workH; y++) {
          for (let x = 0; x < workW; x++) {
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            const inside = dx * dx + dy * dy <= 1;
            const idx = (y * workW + x) * 4;
            maskPixels[idx] = maskPixels[idx + 1] = maskPixels[idx + 2] = 255;
            maskPixels[idx + 3] = inside ? 255 : 0;
          }
        }
        const circleMask = await sharp(maskPixels, {
          raw: { width: workW, height: workH, channels: 4 },
        })
          .png()
          .toBuffer();
        pipeline = pipeline.ensureAlpha().composite([{ input: circleMask, blend: "dest-in" }]);
      }
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
      } = filters;

      // Brightness + saturation via modulate
      if (brightness !== 0 || saturation !== 0) {
        pipeline = pipeline.modulate({
          brightness: Math.max(0, 1 + brightness / 100),
          saturation: Math.max(0, 1 + saturation / 100),
        });
      }

      // Contrast via linear transform
      if (contrast !== 0) {
        const f = (259 * (contrast + 255)) / (255 * (259 - contrast));
        pipeline = pipeline.linear(f, -(128 * f) + 128);
      }

      // Grayscale (full desaturate)
      if (grayscale > 0) pipeline = pipeline.grayscale();

      // Sepia via colour matrix blend — partial sepia based on strength (0–100)
      if (sepia > 0) {
        const s = Math.min(sepia, 100) / 100;
        pipeline = pipeline.recomb([
          [0.393 * s + 1 * (1 - s), 0.769 * s, 0.189 * s],
          [0.349 * s, 0.686 * s + 1 * (1 - s), 0.168 * s],
          [0.272 * s, 0.534 * s, 0.131 * s + 1 * (1 - s)],
        ]);
      }

      // Temperature: warm (+) boosts red/reduces blue, cool (-) the reverse
      if (temperature !== 0) {
        const t = temperature / 100;
        pipeline = pipeline.recomb([
          [1 + t * 0.2, 0, 0],
          [0, 1, 0],
          [0, 0, 1 - t * 0.2],
        ]);
      }
    }

    // 4. Collect composites (blur regions + watermarks + annotations rendered as SVG)
    const composites: any[] = [];

    // — Blur regions (coordinates are in original image space — offset by crop origin) —
    if (Array.isArray(blurRegions) && blurRegions.length > 0) {
      for (const region of blurRegions) {
        const rx = Math.max(0, Math.round(region.x));
        const ry = Math.max(0, Math.round(region.y));
        const rw = Math.min(Math.round(region.width), imgW - rx);
        const rh = Math.min(Math.round(region.height), imgH - ry);
        if (rw <= 0 || rh <= 0) continue;
        // Composite position is relative to the post-crop canvas
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

    // — Watermarks —
    const escXml = (s: string) =>
      s.replace(
        /[<>&"]/g,
        (c: string) =>
          (
            ({
              "<": "&lt;",
              ">": "&gt;",
              "&": "&amp;",
              '"': "&quot;",
            }) as Record<string, string>
          )[c] ?? c,
      );

    if (Array.isArray(watermarks) && watermarks.length > 0) {
      for (const wm of watermarks) {
        if (wm.type === "text" && wm.text) {
          const fontSize = Math.round(wm.fontSize ?? 48);
          const color = wm.color ?? "#ffffff";
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
              const wmBuf = await sharp(Buffer.from(wm.imageUrl.split(",")[1] ?? "", "base64"))
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

    // — Annotations rendered as SVG overlay (crop-relative coordinates) —
    if (Array.isArray(annotations) && annotations.length > 0) {
      const shapes = annotations
        .map((a: any) => {
          const stroke = a.stroke ?? "#ff0000";
          const fill = a.fill ?? "none";
          const sw = a.strokeWidth ?? 2;
          const ax = (a.x ?? 0) - cropX;
          const ay = (a.y ?? 0) - cropY;
          switch (a.type) {
            case "rect":
              return `<rect x="${ax}" y="${ay}" width="${a.width ?? 50}" height="${a.height ?? 50}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}"/>`;
            case "circle":
              return `<circle cx="${ax}" cy="${ay}" r="${a.radius ?? 25}" stroke="${stroke}" fill="${fill}" stroke-width="${sw}"/>`;
            case "text":
              return `<text x="${ax}" y="${ay}" font-size="${a.fontSize ?? 20}" fill="${stroke}" font-family="sans-serif">${escXml(String(a.text ?? ""))}</text>`;
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

    // 5. Encode — circular crop forces PNG (needs alpha channel); otherwise preserve original format
    const ext = (existing.filename.split(".").pop() ?? "jpg").toLowerCase();
    const isCircle = crop?.shape === "circle";
    const outputBuffer: Buffer = await (() => {
      if (isCircle || ext === "png") return pipeline.png({ compressionLevel: 8 }).toBuffer();
      if (ext === "webp") return pipeline.webp({ quality: 90 }).toBuffer();
      if (ext === "avif") return pipeline.avif({ quality: 80 }).toBuffer();
      return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    })();

    // 6. Hash, persist, update DB
    // Circular crop outputs PNG — rename file accordingly
    const outputFilename =
      isCircle && !existing.filename.endsWith(".png")
        ? existing.filename.replace(/\.[^.]+$/, ".png")
        : existing.filename;
    const outputMime = isCircle ? "image/png" : existing.mimeType;
    const newHash = await hashFileContent(outputBuffer);
    const relPath = buildOriginalRelPath(newHash, outputFilename);
    await saveFile(outputBuffer, relPath);
    const now = new Date().toISOString();

    if (saveBehavior === "new") {
      const uploadResult = await this.files.upload(
        {
          filename: outputFilename,
          originalFilename: outputFilename,
          mimeType: outputMime,
          size: outputBuffer.byteLength,
          hash: newHash,
          path: relPath,
          createdBy: userId,
          updatedBy: userId,
          metadata: { versions: [] },
          thumbnails: {},
          access: existing.access || "public",
          folderId: existing.folderId ?? undefined,
          originalId: id,
          tenantId: tenantId ?? undefined,
        } as any,
        tenantId ?? undefined,
      );
      if (!uploadResult.success || !uploadResult.data)
        throw new Error("Failed to create new media record");
      return this.enrichMediaWithUrl(uploadResult.data as any) as unknown as MediaItem;
    }

    // overwrite: push current file to version history, update record in place
    const versions = existing.metadata?.versions || [];
    await this.updateMedia(
      id,
      {
        hash: newHash,
        path: relPath,
        size: outputBuffer.byteLength,
        thumbnails: {},
        updatedBy: userId,
        updatedAt: now,
        metadata: {
          ...existing.metadata,
          versions: [
            ...versions,
            {
              version: versions.length + 1,
              url: existing.url || "",
              path: existing.path,
              hash: existing.hash,
              size: existing.size,
              filename: existing.filename,
              mimeType: existing.mimeType,
              createdAt: existing.updatedAt || existing.createdAt || now,
              createdBy: existing.updatedBy || existing.createdBy || userId,
              action: "edit",
            },
          ],
        },
      },
      tenantId,
    );

    const finalRes = await this.db.crud.findOne<DbMediaItem>(
      "media",
      { _id: id as DatabaseId },
      { tenantId: tenantId ?? undefined },
    );
    if (!finalRes.success || !finalRes.data) throw new Error("Failed to retrieve updated media");
    return this.enrichMediaWithUrl(finalRes.data as any) as unknown as MediaItem;
  }

  public async batchProcessImages(
    ids: string[],
    config: any,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<MediaItem[]> {
    const results: MediaItem[] = [];
    for (const id of ids) {
      try {
        const res = await this.manipulateMedia(id, config, userId, tenantId);
        results.push(res);
      } catch (err) {
        logger.error(`Batch processing failed for ${id}:`, err);
      }
    }
    return results;
  }

  /**
   * Determine media category from MIME type.
   */
  public getMediaType(mime: string): "image" | "video" | "audio" | "document" {
    if (!mime) return "document";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "document";
  }

  /**
   * Scans all collection schemas and returns all database entries referencing a specific mediaId.
   */
  public async getMediaReferences(mediaId: string, tenantId?: DatabaseId | null): Promise<any[]> {
    try {
      const { scanCompiledCollections } = await import("@src/content/engine.server");
      const schemas = await scanCompiledCollections();
      const references: any[] = [];

      // Get the media item first to check by path/filename as well
      const mediaRes = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      const mediaPath = mediaRes.success && mediaRes.data ? mediaRes.data.path : "";

      for (const schema of schemas) {
        const collectionName = `collection_${schema._id}`;

        // Fetch all entries in the collection
        const res = await this.db.crud.findMany(
          collectionName,
          {},
          { tenantId: tenantId ?? undefined },
        );

        if (res.success && Array.isArray(res.data)) {
          for (const entry of res.data) {
            const entryAny = entry as any;
            // Scan all fields in this entry
            for (const key of Object.keys(entryAny)) {
              if (
                key === "_id" ||
                key === "createdAt" ||
                key === "updatedAt" ||
                key === "tenantId"
              ) {
                continue;
              }
              const val = entryAny[key];

              // Direct match or embedded match
              const referenced = this.isMediaReferencedInValue(val, mediaId, mediaPath);
              if (referenced) {
                // Find a friendly name/title for the entry if possible
                const entryName =
                  entryAny.name || entryAny.title || entryAny.slug || entryAny._id || "Untitled";
                references.push({
                  collectionId: schema._id,
                  collectionName: schema.name || schema._id,
                  entryId: entryAny._id,
                  entryName,
                  fieldName: key,
                });
              }
            }
          }
        }
      }

      return references;
    } catch (err) {
      logger.error(`[MediaService] Error scanning usage references:`, err);
      return [];
    }
  }

  /**
   * Checks if a media item is referenced by any published content entries.
   * Scans all collection schemas for published entries that reference the given mediaId.
   */
  public async isReferencedByPublishedContent(
    mediaId: string,
    tenantId?: DatabaseId | null,
  ): Promise<{ referenced: boolean; references: any[] }> {
    try {
      const references = await this.getPublishedReferences(mediaId, tenantId);
      return {
        referenced: references.length > 0,
        references,
      };
    } catch (err) {
      logger.error(`[MediaService] Error checking published references:`, err);
      return { referenced: false, references: [] };
    }
  }

  /**
   * Returns all published collection entries that reference a specific mediaId.
   * Filters entries to only those with status "publish".
   */
  public async getPublishedReferences(
    mediaId: string,
    tenantId?: DatabaseId | null,
  ): Promise<
    {
      collectionId: string;
      collectionName: string;
      entryId: string;
      entryName: string;
      fieldName: string;
    }[]
  > {
    try {
      const { scanCompiledCollections } = await import("@src/content/engine.server");
      const schemas = await scanCompiledCollections();
      const references: {
        collectionId: string;
        collectionName: string;
        entryId: string;
        entryName: string;
        fieldName: string;
      }[] = [];

      // Get the media item to check by path/filename as well
      const mediaRes = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      const mediaPath = mediaRes.success && mediaRes.data ? mediaRes.data.path : "";

      for (const schema of schemas) {
        const collectionName = `collection_${schema._id}`;

        // Fetch only PUBLISHED entries in the collection
        const res = await this.db.crud.findMany<any>(collectionName, { status: "publish" } as any, {
          tenantId: tenantId ?? undefined,
        });

        if (res.success && Array.isArray(res.data)) {
          for (const entry of res.data) {
            const entryAny = entry as any;
            // Scan all fields in this entry
            for (const key of Object.keys(entryAny)) {
              if (
                key === "_id" ||
                key === "createdAt" ||
                key === "updatedAt" ||
                key === "tenantId"
              ) {
                continue;
              }
              const val = entryAny[key];

              // Direct match or embedded match
              const referenced = this.isMediaReferencedInValue(val, mediaId, mediaPath);
              if (referenced) {
                // Find a friendly name/title for the entry if possible
                const entryName =
                  entryAny.name || entryAny.title || entryAny.slug || entryAny._id || "Untitled";
                references.push({
                  collectionId: (schema._id ?? "") as string,
                  collectionName: (schema.name ?? schema._id ?? "") as string,
                  entryId: (entryAny._id ?? "") as string,
                  entryName: entryName as string,
                  fieldName: key as string,
                });
              }
            }
          }
        }
      }

      return references;
    } catch (err) {
      logger.error(`[MediaService] Error scanning published references:`, err);
      return [];
    }
  }

  private isMediaReferencedInValue(val: any, mediaId: string, path: string): boolean {
    if (val === mediaId || (path && val === path)) {
      return true;
    }
    if (Array.isArray(val)) {
      return val.some((item) => this.isMediaReferencedInValue(item, mediaId, path));
    }
    if (val && typeof val === "object") {
      if (
        val._id === mediaId ||
        val.id === mediaId ||
        (path && (val.path === path || val.url === path))
      ) {
        return true;
      }
      return Object.values(val).some((item) => this.isMediaReferencedInValue(item, mediaId, path));
    }
    if (typeof val === "string") {
      return val.includes(mediaId) || !!(path && val.includes(path));
    }
    return false;
  }

  /**
   * Uploads a new version of an existing file.
   * Keeps the same mediaId, stores the old file parameters in versions history,
   * uploads the new file to physical storage, and updates the active DB record.
   */
  public async uploadNewVersion(
    mediaId: string,
    file:
      | File
      | {
          name: string;
          type: string;
          size: number;
          stream: () => ReadableStream;
          arrayBuffer?: () => Promise<ArrayBuffer>;
        },
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      // 1. Get the existing media record
      const res = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      if (!res.success || !res.data) {
        throw new Error("Original media item not found");
      }
      const existing = res.data as any;

      // 2. Upload the new file to storage
      // To bypass hash deduplication returning the existing record, we can temporarily save
      // the file under a new hash/path.
      const { hashFileContent } = await import("./media-processing.server");
      let hash = "";
      if (file.size < 5 * 1024 * 1024 && typeof file.arrayBuffer === "function") {
        const buffer = Buffer.from(await file.arrayBuffer());
        hash = await hashFileContent(buffer);
      } else {
        const { hashStream } = await import("./media-processing.server");
        const [s1] = file.stream().tee();
        hash = await hashStream(s1);
      }

      // Check if hash is exactly the same as current: if so, no-op or proceed.
      const uploadRes = await this.files.upload(
        {
          filename: file.name,
          originalFilename: file.name,
          mimeType: file.type,
          size: file.size,
          hash,
          path: buildOriginalRelPath(hash, file.name),
          createdBy: userId,
          updatedBy: userId,
          metadata: {},
          thumbnails: {},
          access: existing.access || "public",
          tenantId: tenantId ?? undefined,
          stream: typeof file.stream === "function" ? file.stream.bind(file) : undefined,
          arrayBuffer:
            typeof file.arrayBuffer === "function" ? file.arrayBuffer.bind(file) : undefined,
        } as any,
        tenantId ?? undefined,
      );

      if (!uploadRes.success || !uploadRes.data) {
        const errMsg =
          !uploadRes.success && uploadRes.error
            ? String(uploadRes.error.message || uploadRes.error)
            : "Failed to upload new version file";
        throw new Error(errMsg);
      }
      const uploadedFile = uploadRes.data as any;

      // 3. Create version record from the OLD properties
      const versions = existing.metadata?.versions || [];
      const newVersionNum = versions.length + 1;
      const oldVersionEntry = {
        version: newVersionNum,
        url: existing.url,
        path: existing.path,
        hash: existing.hash,
        size: existing.size,
        filename: existing.filename,
        mimeType: existing.mimeType,
        createdAt: existing.updatedAt || existing.createdAt || new Date().toISOString(),
        createdBy: existing.updatedBy || existing.createdBy || userId,
        action: "replace",
      };

      // Push old version to the history array
      const updatedVersions = [...versions, oldVersionEntry];

      // 4. Update the existing database record with the new file properties
      const updatedMetadata = {
        ...existing.metadata,
        versions: updatedVersions,
      };

      const updateData = {
        filename: file.name,
        originalFilename: file.name,
        mimeType: file.type,
        size: file.size,
        hash: uploadedFile.hash,
        path: uploadedFile.path,
        thumbnails: uploadedFile.thumbnails || {},
        metadata: updatedMetadata,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await this.updateMedia(mediaId, updateData, tenantId);

      // Return the updated media item enriched
      const finalRes = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      if (finalRes.success && finalRes.data) {
        return {
          success: true,
          data: this.enrichMediaWithUrl(finalRes.data as any) as unknown as MediaItem,
        };
      }
      throw new Error("Failed to retrieve updated media item");
    } catch (err: any) {
      logger.error(`[MediaService] Error uploading new version:`, err);
      return {
        success: false,
        message: err.message,
        error: err as DatabaseError,
      };
    }
  }

  /**
   * Restores an existing file version to be the active one.
   */
  public async restoreVersion(
    mediaId: string,
    versionNumber: number,
    userId: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<MediaItem>> {
    try {
      // 1. Get the media item
      const res = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      if (!res.success || !res.data) {
        throw new Error("Media item not found");
      }
      const existing = res.data as any;

      const versions = existing.metadata?.versions || [];
      const targetVersion = versions.find((v: any) => v.version === versionNumber);
      if (!targetVersion) {
        throw new Error(`Version ${versionNumber} not found`);
      }

      // 2. Create a version entry from the CURRENT active state
      const currentVersionNum = versions.length + 1;
      const currentVersionEntry = {
        version: currentVersionNum,
        url: existing.url,
        path: existing.path,
        hash: existing.hash,
        size: existing.size,
        filename: existing.filename,
        mimeType: existing.mimeType,
        createdAt: existing.updatedAt || existing.createdAt || new Date().toISOString(),
        createdBy: existing.updatedBy || existing.createdBy || userId,
        action: "restore",
      };

      // 3. Update the active record to point back to the restored version
      const updatedVersions = [...versions, currentVersionEntry];
      const updatedMetadata = {
        ...existing.metadata,
        versions: updatedVersions,
      };

      const updateData = {
        filename: targetVersion.filename || existing.filename,
        originalFilename: targetVersion.filename || existing.filename,
        mimeType: targetVersion.mimeType || existing.mimeType,
        size: targetVersion.size || existing.size,
        hash: targetVersion.hash,
        path: targetVersion.path,
        metadata: updatedMetadata,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await this.updateMedia(mediaId, updateData, tenantId);

      const finalRes = await this.db.crud.findOne<DbMediaItem>(
        "media",
        { _id: mediaId as DatabaseId },
        { tenantId: tenantId ?? undefined },
      );
      if (finalRes.success && finalRes.data) {
        return {
          success: true,
          data: this.enrichMediaWithUrl(finalRes.data as any) as unknown as MediaItem,
        };
      }
      throw new Error("Failed to retrieve restored media item");
    } catch (err: any) {
      logger.error(`[MediaService] Error restoring version:`, err);
      return {
        success: false,
        message: err.message,
        error: err as DatabaseError,
      };
    }
  }
}
