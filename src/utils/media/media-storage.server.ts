/**
 * @file src/utils/media/media-storage.server.ts
 * @description Core media storage operations, delegating to the unified StorageAdapter interface.
 *
 * Features:
 * - Resizing (sharp)
 * - Avatar processing
 * - Video thumbnail capturing (ffmpeg)
 * - PDF thumbnail generation (bundled PDFium)
 * - CSV/TSV spreadsheet previews (sharp)
 * - Office document previews via an optional LibreOffice binary
 * - Bounded LRU for storage existence probes
 */

import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { writeFile, readFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { logger } from "@utils/logger";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { getStorageAdapter, getConfig } from "./storage-adapters";
import { getMimeType } from "./media-utils";
import {
  normalizeDerivativeFormat,
  type DerivativeFormat,
  type ResizedImage,
} from "./media-models";
import { getSharp, MAX_INPUT_PIXELS } from "./sharp-loader.server";
import { FastLRU, generateUUID } from "@utils/native-utils";
import { nowISODateString } from "@src/utils/date";

/**
 * Helper to run a process and wait for completion.
 *
 * `timeoutMs` kills the child and rejects, so a hung external converter can
 * never pin an upload request or a job worker indefinitely.
 */
function spawnAsync(
  command: string,
  args: string[],
  options: { timeoutMs?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    if (options.timeoutMs) {
      timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* process already gone */
        }
        finish(new Error(`${command} timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);
      (timer as { unref?: () => void }).unref?.();
    }

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      finish(err);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        finish();
      } else {
        finish(new Error(`${command} exited with code ${code}: ${stderr.slice(-200)}`));
      }
    });
  });
}

/** Maximum buffer size (500MB) allowed for temp file writes. */
const MAX_TEMP_BUFFER_SIZE = 500 * 1024 * 1024;

// Image sizes
const DEFAULT_SIZES = { sm: 600, md: 900, lg: 1200 } as const;
export const SIZES: Readonly<Record<string, number>> = Object.freeze({
  ...DEFAULT_SIZES,
  ...(getPublicSettingSync("IMAGE_SIZES") as Record<string, number> | undefined),
  original: 0,
  thumbnail: 200,
});

/** Get configured image sizes (returns a frozen, read-only copy). */
export function getImageSizes(): Readonly<typeof SIZES> {
  return SIZES;
}

/** Save buffer or stream to storage using adapter */
export async function saveFile(
  data: Buffer | ReadableStream | import("node:stream").Readable,
  relPath: string,
): Promise<string> {
  return await getStorageAdapter().upload(data, relPath);
}

/** Delete file from storage using adapter */
export async function deleteFile(url: string): Promise<void> {
  let rel = url;

  if (url.startsWith("http")) {
    rel = new URL(url).pathname;
  }

  const cfg = getConfig();
  if (
    cfg &&
    "prefix" in cfg &&
    typeof cfg.prefix === "string" &&
    rel.startsWith(`/${cfg.prefix}/`)
  ) {
    rel = rel.slice(cfg.prefix.length + 1);
  }

  if (rel.startsWith("/files/")) {
    rel = rel.slice(7);
  }
  rel = rel.replace(/^\/+/, "");

  await getStorageAdapter().remove(rel);
}

/** Alias for backward compatibility */
export const moveMediaToTrash = deleteFile;
export const saveAvatarImage = saveAvatar;
export const saveFileToDisk = saveFile;
export const saveResizedImages = saveResized;

/**
 * Bounded positive/negative cache for storage existence probes.
 *
 * A storage `exists()` call per request is expensive, so results are cached for
 * `SVELTY_FILE_EXISTS_CACHE_TTL_MS` (default 10 s). The cache is an LRU with a
 * hard entry cap (`SVELTY_FILE_EXISTS_CACHE_MAX`, default 5000): under a soak that
 * touches many distinct media paths an unbounded Map grows with the number of
 * paths ever probed (each entry keeps the full path string + a timestamp), which
 * shows up as unconditional RSS growth. Cap + LRU ordering bounds it; TTL
 * semantics are unchanged (`refresh: true` bypasses the read and re-stamps).
 */
const FILE_EXISTS_CACHE_TTL_MS = Number(process.env.SVELTY_FILE_EXISTS_CACHE_TTL_MS) || 10_000; // 10 s — stale negatives clear quickly
const FILE_EXISTS_CACHE_MAX = Number(process.env.SVELTY_FILE_EXISTS_CACHE_MAX) || 5_000;
const _fileExistsCache = new FastLRU<string, boolean>({
  max: FILE_EXISTS_CACHE_MAX,
  ttl: FILE_EXISTS_CACHE_TTL_MS,
});

/** Entry count of the existence-probe cache (diagnostics/tests). */
export function fileExistsCacheSize(): number {
  return _fileExistsCache.size;
}

/** Drop every cached existence probe (tests, storage reconfiguration). */
export function resetFileExistsCache(): void {
  _fileExistsCache.clear();
}

export async function fileExists(rel: string, opts?: { refresh?: boolean }): Promise<boolean> {
  if (!opts?.refresh) {
    const cached = _fileExistsCache.get(rel);
    if (cached !== undefined) return cached;
  }
  const exists = await getStorageAdapter().exists(rel);
  _fileExistsCache.set(rel, exists);
  return exists;
}

/** Get file buffer using adapter */
export async function getFile(rel: string): Promise<Buffer> {
  return await getStorageAdapter().download(rel);
}

/**
 * Resize & save image variants with multi-format optimization.
 *
 * Three invariants this function owns (media pipeline plan §3 #3):
 *
 * - **Never upscale.** A ladder step wider than the decoded source is dropped before
 *   any encode, and `withoutEnlargement` backstops the encoder, so a variant file can
 *   never be wider (and therefore taller) than the image it derives from. `metadata()`
 *   is read here anyway, so the clamp costs nothing extra. The recorded `width`/`height`
 *   come from the encoder output, not from the request, so the map never claims a size
 *   the file does not have.
 * - **One output per step in the default format.** The derivative format comes from
 *   `MEDIA_OUTPUT_FORMAT_QUALITY.format` and defaults to **JPEG** — the cheapest encode
 *   of the set (measured 2026-09-27, `docs/reference/architecture/media-system.mdx`).
 *   `webp`/`avif` stay available as opt-ins, an unrecognised value falls back to JPEG,
 *   and `original` keeps the source format. A transparent source keeps WebP: JPEG has no
 *   alpha channel and would leave the transparent area on the encoder's background.
 * - **One write per path.** The primary output and the WebP sidecar resolve to the same
 *   path whenever the primary is itself WebP. That pair is written once instead of twice;
 *   an already-WebP source is therefore charged a single encode per step.
 *
 * `thumbnails` keys are `{key}` for the primary plus `{key}_webp` for the sidecar, which
 * only `original` mode writes (see below); steps dropped by the clamp are simply absent,
 * which `mediaUrl`/`mediaDisplayUrl` already fall back from.
 */
export async function saveResized(
  buffer: Buffer,
  hash: string,
  baseName: string,
  ext: string,
  baseDir: string,
  preDecodedMeta?: { width?: number; height?: number; hasAlpha?: boolean },
): Promise<Record<string, ResizedImage>> {
  const sharp = await getSharp();
  const baseInstance = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "none" });
  const meta = preDecodedMeta ?? (await baseInstance.metadata());

  const formatConfig = getPublicSettingSync("MEDIA_OUTPUT_FORMAT_QUALITY") as
    | { format?: string; quality?: number }
    | undefined;
  const configuredFormat = normalizeDerivativeFormat(formatConfig?.format);
  /**
   * JPEG cannot represent an alpha channel — `jpeg()` drops it and leaves the
   * transparent area on the encoder's background. Sources that carry alpha keep WebP,
   * the smallest format that preserves it.
   */
  const format: DerivativeFormat =
    configuredFormat === "jpeg" && meta.hasAlpha === true ? "webp" : configuredFormat;
  /**
   * The WebP sidecar belongs to `original` mode (source-format primary + modern-format
   * alternative). An explicit `jpeg`/`webp`/`avif` means exactly that format — one encode
   * and one file per step. A per-request WebP alternative is available through
   * `/files/**?fmt=webp` (or `Accept` negotiation) on the delivery route.
   */
  const wantsWebpSidecar = configuredFormat === "original";
  const quality = formatConfig?.quality ?? 80;

  // The format is clamped to the source below (never upscaled). An unknown source width
  // keeps the operator's ladder untouched — dropping every step on a metadata miss would
  // silently produce no derivatives at all.
  const sourceWidth = meta.width ?? 0;
  const variants = Object.entries(SIZES).filter(
    ([, w]) => w > 0 && (sourceWidth === 0 || w <= sourceWidth),
  );

  // Run all thumbnail sizes in parallel — each is an independent sharp pipeline.
  const tasks = variants.map(async ([key, w]) => {
    const baseVariant = baseInstance.clone().resize(w, null, {
      fit: "cover",
      position: "center",
      withoutEnlargement: true,
    });

    // 1. Configured output format (`original` = keep the source format)
    let outExt = ext;
    let mimeType = getMimeType(`file.${ext}`) || "application/octet-stream";
    let instance = baseVariant.clone();

    if (format === "webp") {
      instance = instance.webp({ quality });
      outExt = "webp";
      mimeType = "image/webp";
    } else if (format === "avif") {
      instance = instance.avif({ quality });
      outExt = "avif";
      mimeType = "image/avif";
    } else if (format === "jpeg") {
      instance = instance.jpeg({ quality });
      outExt = "jpg";
      mimeType = "image/jpeg";
    }

    const fileName = `${baseName}-${hash}.${outExt}`;
    const relPath = path.posix.join(baseDir, key, fileName);
    const webpRelPath = path.posix.join(baseDir, key, `${baseName}-${hash}.webp`);
    /** False when the sidecar is not wanted, or the primary IS the sidecar's target path. */
    const sidecarNeeded = wantsWebpSidecar && webpRelPath !== relPath;

    // Fallbacks for a source whose height could not be read; a real encode reports its own.
    const fallbackHeight = meta.height ? Math.round((w / (meta.width ?? w)) * meta.height) : w;

    // 2. Encode primary and webp variant in parallel (independent sharp pipelines)
    const primaryP = instance.toBuffer({ resolveWithObject: true });
    const webpP = sidecarNeeded
      ? baseVariant
          .clone()
          .webp({ quality: Math.max(quality, 75) })
          .toBuffer({ resolveWithObject: true })
      : Promise.resolve(null);

    const [primary, webp] = await Promise.all([primaryP, webpP]);

    // 3. Save files — primary always, WebP if generated
    const url = await saveFile(primary.data, relPath);

    const entries: [string, ResizedImage][] = [
      [
        key,
        {
          url,
          width: primary.info.width ?? w,
          height: primary.info.height ?? fallbackHeight,
          size: primary.info.size,
          mimeType,
        },
      ],
    ];

    if (webp) {
      const webpUrl = await saveFile(webp.data, webpRelPath);
      entries.push([
        `${key}_webp`,
        {
          url: webpUrl,
          width: webp.info.width ?? w,
          height: webp.info.height ?? fallbackHeight,
          size: webp.info.size,
          mimeType: "image/webp",
        },
      ]);
    }

    return entries;
  });

  const nested = await Promise.all(tasks);
  return Object.fromEntries(nested.flat());
}

/** Allowed extensions for avatar uploads */
const AVATAR_EXT_WHITELIST = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);

/** Save avatar (200x200) with extension validation */
export async function saveAvatar(file: File, userId: string): Promise<string> {
  const rawExt = path.extname(file.name).toLowerCase();
  if (!rawExt || !AVATAR_EXT_WHITELIST.has(rawExt)) {
    throw new Error(
      `Invalid avatar file type: "${rawExt || "(none)"}". Allowed: ${[...AVATAR_EXT_WHITELIST].join(", ")}`,
    );
  }
  // Strip leading dot and sanitize (remove any path separators or special chars)
  const ext = "." + rawExt.replace(/^\./, "").replace(/[^a-z0-9]/g, "");

  const buf = Buffer.from(await file.arrayBuffer());
  const sharp = await getSharp();
  const resized = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "none" })
    .resize(200, 200, { fit: "cover", position: "center" })
    .toBuffer();

  const rel = `avatars/${userId}${ext}`;
  return await saveFile(resized, rel);
}

/**
 * Captures a thumbnail from a video at the 1s mark using ffmpeg
 */
export async function captureVideoThumbnail(buffer: Buffer): Promise<Buffer | null> {
  if (buffer.length > MAX_TEMP_BUFFER_SIZE) {
    logger.error("Video buffer too large for thumbnail capture", { size: buffer.length });
    return null;
  }

  const tempInput = path.join(os.tmpdir(), `ffmpeg-input-${generateUUID()}.mp4`);
  const tempOutput = path.join(os.tmpdir(), `ffmpeg-output-${generateUUID()}.jpg`);
  try {
    await writeFile(tempInput, buffer);
    // Capture frame at 1s mark
    await spawnAsync("ffmpeg", [
      "-ss",
      "00:00:01",
      "-i",
      tempInput,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      tempOutput,
      "-y",
    ]);
    return await readFile(tempOutput);
  } catch (err) {
    logger.error("Error capturing video thumbnail", { error: err });
    return null;
  } finally {
    try {
      await unlink(tempInput);
    } catch {
      /* ignore */
    }
    try {
      await unlink(tempOutput);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Generates a thumbnail from the first page of a PDF.
 *
 * Uses PDFium compiled to WebAssembly (`@hyzyla/pdfium/inline`), so previews do
 * not depend on ImageMagick/Ghostscript/Poppler being installed on the host.
 * The library is initialised once per process and reused; the render is capped
 * to the first page at ~108 DPI (scale 1.5), then the ladder downsizes it.
 */
let pdfiumLibraryPromise: Promise<import("@hyzyla/pdfium").PDFiumLibrary> | undefined;

function getPdfiumLibrary(): Promise<import("@hyzyla/pdfium").PDFiumLibrary> {
  pdfiumLibraryPromise ??= import("@hyzyla/pdfium/inline").then(({ PDFiumLibrary }) =>
    PDFiumLibrary.init({ disableBase64Warning: true }),
  );
  return pdfiumLibraryPromise;
}

export async function generatePdfThumbnail(buffer: Buffer): Promise<Buffer | null> {
  if (buffer.length === 0) return null;
  if (buffer.length > MAX_TEMP_BUFFER_SIZE) {
    logger.error("PDF buffer too large for thumbnail generation", { size: buffer.length });
    return null;
  }

  let document: import("@hyzyla/pdfium").PDFiumDocument | undefined;
  try {
    const library = await getPdfiumLibrary();
    document = await library.loadDocument(new Uint8Array(buffer));
    const page = document.getPage(0);
    try {
      const image = await page.render({
        // A4 at scale 2 ≈ 1190 px wide — enough for the `md` (900) ladder step.
        scale: 2,
        render: async (options) => {
          const sharp = await getSharp();
          return sharp(options.data, {
            raw: { width: options.width, height: options.height, channels: 4 },
          })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 88 })
            .toBuffer();
        },
      });
      return Buffer.from(image.data);
    } finally {
      page.close();
    }
  } catch (err) {
    logger.warn("[Media] PDF preview generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    document?.destroy();
  }
}

/** Rows/columns/bytes kept from a delimited text file for its preview tile. */
const CSV_PREVIEW_MAX_BYTES = 256 * 1024;
const CSV_PREVIEW_MAX_ROWS = 10;
const CSV_PREVIEW_MAX_COLS = 6;
const CSV_PREVIEW_WIDTH = 1200;
const CSV_PREVIEW_ROW_HEIGHT = 52;

/** Count delimiter occurrences outside quotes — enough to pick `,` vs `;` vs tab. */
function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === delimiter) count++;
  }
  return count;
}

/** Minimal RFC-4180 reader for a preview (quotes, escaped quotes, CRLF). */
function readDelimitedPreview(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const pushRow = () => {
    row.push(cell);
    if (row.some((value) => value.trim().length > 0)) rows.push(row);
    row = [];
    cell = "";
  };

  for (let i = 0; i < text.length && rows.length < CSV_PREVIEW_MAX_ROWS; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      cell += ch;
    }
  }
  if (rows.length < CSV_PREVIEW_MAX_ROWS && (cell.length > 0 || row.length > 0)) pushRow();

  return rows.map((r) => r.slice(0, CSV_PREVIEW_MAX_COLS));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateCell(value: string, maxChars: number): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > maxChars ? `${singleLine.slice(0, maxChars - 1)}…` : singleLine;
}

/**
 * Render the first rows of a CSV/TSV as a spreadsheet-style preview image.
 *
 * Deliberately dependency-free: a small SVG table is rasterised with the
 * already-loaded sharp, so every host gets a preview without a document
 * converter. The output is a normal image buffer that the ladder resizes.
 */
export async function generateCsvThumbnail(buffer: Buffer): Promise<Buffer | null> {
  if (buffer.length === 0) return null;
  const text = buffer
    .subarray(0, CSV_PREVIEW_MAX_BYTES)
    .toString("utf8")
    .replace(/^\uFEFF/, "");
  if (!text.trim() || text.includes("\u0000")) return null;

  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = ([",", ";", "\t"] as const).reduce((best, candidate) =>
    countDelimiter(firstLine, candidate) > countDelimiter(firstLine, best) ? candidate : best,
  );
  const rows = readDelimitedPreview(text, delimiter);
  if (rows.length === 0) return null;

  const columns = Math.max(...rows.map((row) => row.length), 1);
  const rowNumberGutter = 36;
  const gridWidth = CSV_PREVIEW_WIDTH - 40 - rowNumberGutter;
  const columnWidth = gridWidth / columns;
  const height = 24 + rows.length * CSV_PREVIEW_ROW_HEIGHT + 24;
  const fontSize = 14;
  const maxChars = Math.max(6, Math.floor(columnWidth / (fontSize * 0.62)));
  const fontFamily = "'Cascadia Mono','Consolas','DejaVu Sans Mono','Menlo',monospace";

  const body = rows
    .map((row, rowIndex) => {
      const y = 24 + rowIndex * CSV_PREVIEW_ROW_HEIGHT;
      const header = rowIndex === 0;
      const cells = Array.from({ length: columns }, (_, columnIndex) => {
        const x = 20 + rowNumberGutter + columnIndex * columnWidth;
        const value = escapeXml(truncateCell(row[columnIndex] ?? "", maxChars));
        return `<text x="${x + 8}" y="${y + 31}" font-family="${fontFamily}" font-size="${fontSize}" fill="${header ? "#0f172a" : "#334155"}" font-weight="${header ? 600 : 400}">${value}</text>`;
      }).join("");
      return (
        `<rect x="${20 + rowNumberGutter}" y="${y}" width="${gridWidth}" height="${CSV_PREVIEW_ROW_HEIGHT}" fill="${header ? "#e2e8f0" : "#ffffff"}" stroke="#cbd5e1" stroke-width="1"/>` +
        `<text x="${20 + rowNumberGutter - 8}" y="${y + 31}" text-anchor="end" font-family="${fontFamily}" font-size="12" fill="#94a3b8">${rowIndex + 1}</text>` +
        cells
      );
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CSV_PREVIEW_WIDTH}" height="${height}" viewBox="0 0 ${CSV_PREVIEW_WIDTH} ${height}"><rect width="100%" height="100%" fill="#f8fafc"/>${body}</svg>`;

  try {
    const sharp = await getSharp();
    return await sharp(Buffer.from(svg)).png().toBuffer();
  } catch (err) {
    logger.warn("[Media] CSV preview generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Document previews (PDF, delimited text, Office) ─────────────────────────

/** Document families the gallery can render as a tile preview. */
export type DocumentPreviewKind = "pdf" | "delimited" | "office";

const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"]);

const OFFICE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
]);

/** Hard budget for one LibreOffice conversion — a hung `soffice` must not pin a worker. */
const OFFICE_CONVERT_TIMEOUT_MS = 30_000;

/** `libreoffice` is only tried when `soffice` is absent from PATH. */
const OFFICE_CONVERTERS = ["soffice", "libreoffice"] as const;

let officePreviewWarningLogged = false;

/** Warn once per process: a host without a converter must not log per upload. */
function warnOfficePreviewOnce(message: string, details: Record<string, unknown>): void {
  if (officePreviewWarningLogged) return;
  officePreviewWarningLogged = true;
  logger.warn(message, details);
}

/**
 * Classify a document for preview generation.
 *
 * Extension and MIME are both checked because uploads can arrive with a generic
 * `application/octet-stream` type (remote imports, CLI backfills) or without an
 * extension. Returns `null` for images, audio, video and anything unsupported.
 */
export function detectDocumentPreviewKind(
  filename: string,
  mimeType: string,
): DocumentPreviewKind | null {
  const lower = (filename || "").toLowerCase();
  const ext = path.extname(lower);
  const mime = (mimeType || "").split(";")[0]!.trim().toLowerCase();

  if (mime === "application/pdf" || ext === ".pdf") return "pdf";
  if (
    ext === ".csv" ||
    ext === ".tsv" ||
    mime === "text/csv" ||
    mime === "application/csv" ||
    mime === "text/tab-separated-values"
  ) {
    return "delimited";
  }
  if (OFFICE_EXTENSIONS.has(ext) || OFFICE_MIME_TYPES.has(mime)) return "office";
  return null;
}

/**
 * One converter invocation. `missing` separates "not installed" (try the next
 * candidate) from "installed but failed" (stop and warn).
 */
type OfficeConversionAttempt =
  | { ok: true; pdf: Buffer }
  | { ok: false; missing: boolean; error?: string };

async function runOfficeConverter(
  command: string,
  tempDir: string,
  inputPath: string,
): Promise<OfficeConversionAttempt> {
  try {
    await spawnAsync(
      command,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=${pathToFileURL(path.join(tempDir, "profile")).href}`,
        "--convert-to",
        "pdf",
        "--outdir",
        tempDir,
        inputPath,
      ],
      { timeoutMs: OFFICE_CONVERT_TIMEOUT_MS },
    );
  } catch (err) {
    return {
      ok: false,
      missing: (err as NodeJS.ErrnoException).code === "ENOENT",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    return { ok: true, pdf: await readFile(path.join(tempDir, "source.pdf")) };
  } catch {
    // The binary returned success without writing the PDF (broken install).
    return { ok: false, missing: false, error: "converter produced no PDF" };
  }
}

/**
 * Convert an Office document to PDF with a headless LibreOffice instance.
 *
 * The converter is optional: a missing binary or a failed conversion returns
 * `null` and the operator is warned once per process (never once per upload).
 * Each run gets its own throw-away user profile so concurrent jobs cannot
 * attach to a sibling `soffice` instance and exit without writing the PDF.
 */
async function convertOfficeDocumentToPdf(
  buffer: Buffer,
  filename: string,
): Promise<Buffer | null> {
  if (buffer.length > MAX_TEMP_BUFFER_SIZE) {
    logger.error("Office buffer too large for preview conversion", { size: buffer.length });
    return null;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sveltycms-office-"));
  const ext = path.extname(filename).toLowerCase() || ".bin";
  const inputPath = path.join(tempDir, `source${ext}`);

  try {
    await writeFile(inputPath, buffer);

    // `soffice` first; only a genuinely absent binary falls back to `libreoffice`
    // (a broken install should not be invoked twice under a second name).
    let attempt = await runOfficeConverter(OFFICE_CONVERTERS[0], tempDir, inputPath);
    if (!attempt.ok && attempt.missing) {
      attempt = await runOfficeConverter(OFFICE_CONVERTERS[1], tempDir, inputPath);
    }

    if (attempt.ok) return attempt.pdf;

    warnOfficePreviewOnce(
      attempt.missing
        ? "[Media] LibreOffice (soffice/libreoffice) not found — Office document previews disabled"
        : "[Media] Office document conversion failed",
      { file: filename, error: attempt.error },
    );
    return null;
  } catch (err) {
    warnOfficePreviewOnce("[Media] Office preview could not be prepared", {
      file: filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export interface DocumentPreviewResult {
  metadata: Record<string, unknown>;
  thumbnails: Record<string, ResizedImage>;
}

/**
 * Render a document preview buffer without persisting any derivative files.
 *
 * Used by the backfill CLI's dry run; {@link buildDocumentPreview} wraps this and
 * writes the ladder. Returns `null` when the document is unsupported, malformed,
 * or the optional Office converter is unavailable.
 */
export async function renderDocumentPreview(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<Buffer | null> {
  const kind = detectDocumentPreviewKind(filename, mimeType);
  if (!kind || buffer.length === 0) return null;

  try {
    if (kind === "pdf") return await generatePdfThumbnail(buffer);
    if (kind === "delimited") return await generateCsvThumbnail(buffer);
    const pdf = await convertOfficeDocumentToPdf(buffer, filename);
    return pdf ? await generatePdfThumbnail(pdf) : null;
  } catch (err) {
    logger.warn("[Media] Document preview skipped", {
      file: filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Build the gallery preview for a non-image document (PDF, CSV/TSV, Office).
 *
 * Documents have no source pixels to resize, so one preview buffer is rendered
 * (PDF page 1, spreadsheet rows, or page 1 of a LibreOffice-converted document)
 * and run through the normal `SIZES` ladder. Failure is always non-fatal: an
 * empty result means the tile falls back to its file icon and the upload still
 * succeeds. Shared by the upload pipeline (`MediaService`) and the
 * `process-media` job, so both produce identical derivatives.
 */
export async function buildDocumentPreview(
  buffer: Buffer,
  hash: string,
  filename: string,
  mimeType: string,
  tenantId?: string | null,
): Promise<DocumentPreviewResult> {
  const preview = await renderDocumentPreview(buffer, filename, mimeType);
  if (!preview) return { metadata: {}, thumbnails: {} };

  try {
    const dotIdx = filename.lastIndexOf(".");
    const baseName = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
    const thumbnails = await saveResizedImages(
      preview,
      hash,
      `${baseName}-thumb`,
      "jpg",
      tenantId || "global",
    );
    return { metadata: {}, thumbnails };
  } catch (err) {
    logger.warn("[Media] Document preview skipped", {
      file: filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return { metadata: {}, thumbnails: {} };
  }
}

// ─── Version history ─────────────────────────────────────────────────────────

import type { DatabaseId, ISODateString } from "@src/content/types";

export interface FileVersion {
  _id?: DatabaseId;
  action: "create" | "update" | "replace" | "metadata_update";
  changes: VersionChange[];
  createdAt: ISODateString;
  createdBy: DatabaseId;
  fileId: DatabaseId;
  hash: string;
  metadata?: { reason?: string; automated?: boolean; restorePoint?: boolean };
  path?: string;
  size: number;
  versionNumber: number;
}

export interface VersionChange {
  field: string;
  newValue?: unknown;
  oldValue?: unknown;
  type: "add" | "modify" | "remove";
}

export interface VersionComparison {
  changes: VersionChange[];
  contentChanged: boolean;
  fromVersion: number;
  metadataChanged: boolean;
  sizeDifference: number;
  toVersion: number;
}

export function createVersion(
  fileId: DatabaseId,
  userId: DatabaseId,
  action: FileVersion["action"],
  hash: string,
  size: number,
  changes: VersionChange[] = [],
  options: {
    path?: string;
    reason?: string;
    automated?: boolean;
    restorePoint?: boolean;
    nextVersionNumber?: number;
  } = {},
): FileVersion {
  return {
    fileId,
    versionNumber: options.nextVersionNumber ?? 1,
    createdAt: nowISODateString() as ISODateString,
    createdBy: userId,
    action,
    changes,
    hash,
    size,
    path: options.path,
    metadata: {
      reason: options.reason,
      automated: options.automated,
      restorePoint: options.restorePoint,
    },
  };
}

export function compareMediaVersions(
  fromVersion: FileVersion,
  toVersion: FileVersion,
): VersionComparison {
  const contentChanged = fromVersion.hash !== toVersion.hash;
  const sizeDifference = toVersion.size - fromVersion.size;
  const changes = contentChanged
    ? toVersion.changes
    : toVersion.changes.filter((c) => c.field !== "content");
  const metadataChanged = changes.some((c) => c.field !== "content" && c.field !== "size");
  return {
    fromVersion: fromVersion.versionNumber,
    toVersion: toVersion.versionNumber,
    changes,
    contentChanged,
    metadataChanged,
    sizeDifference,
  };
}

export function detectChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  excludeFields: string[] = ["_id", "updatedAt", "updatedBy", "createdAt", "createdBy"],
): VersionChange[] {
  const changes: VersionChange[] = [];
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of keys) {
    if (excludeFields.includes(key)) continue;
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    if (oldVal === newVal) continue;
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;
    if (oldVal === undefined) changes.push({ field: key, newValue: newVal, type: "add" });
    else if (newVal === undefined) changes.push({ field: key, oldValue: oldVal, type: "remove" });
    else changes.push({ field: key, oldValue: oldVal, newValue: newVal, type: "modify" });
  }
  return changes;
}

export function getVersionStats(versions: FileVersion[]) {
  if (!versions.length) return null;
  let totalSize = 0;
  let contentUpdates = 0;
  const userActivity: Record<string, number> = {};
  for (const v of versions) {
    totalSize += v.size;
    if (["create", "replace", "update"].includes(v.action)) contentUpdates++;
    userActivity[v.createdBy as string] = (userActivity[v.createdBy as string] || 0) + 1;
  }
  const mostActive = Object.entries(userActivity).sort((a, b) => b[1] - a[1])[0];
  return {
    totalVersions: versions.length,
    totalSize,
    avgSize: Math.round(totalSize / versions.length),
    contentUpdates,
    mostActiveUser: mostActive ? mostActive[0] : null,
  };
}
