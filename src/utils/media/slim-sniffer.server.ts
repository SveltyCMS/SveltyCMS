/**
 * @file src/utils/media/slim-sniffer.server.ts
 * @description Ultra-lightweight binary sniffer for core enterprise media formats.
 * Replaces the 160KB 'file-type' library (~2KB total).
 *
 * ### Features:
 * - magic-byte detection for images (JPEG, PNG, GIF, WebP, SVG, TIFF, AVIF, HEIC)
 * - video formats (MP4, WebM)
 * - document formats (PDF, ZIP/DOCX/XLSX)
 * - hardened SVG detection via XML namespace regex
 * - serve-path MIME resolve: extension map → stored type → magic bytes → octet-stream
 * - write-time MIME agreement: reject scriptable/family mismatches (polyglots)
 * - remote-asset MIME resolve for importer / saveRemoteMedia
 */

import { open } from "node:fs/promises";
import { AppError } from "@utils/error-handling";
import { getMimeType, isAllowedUploadMime, normalizeMime } from "./media-utils";

export interface SniffResult {
  ext: string;
  mime: string;
}

const OCTET_STREAM = "application/octet-stream";
const SNIFF_HEAD_BYTES = 512;

/** Types that can execute in a browser if we lie about Content-Type. */
const SCRIPTABLE_MIME = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/xml",
  "application/xml",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "image/svg+xml",
]);

function usableMime(mime: string | null | undefined): string | null {
  const trimmed = mime?.trim();
  if (!trimmed || trimmed === OCTET_STREAM) return null;
  return trimmed;
}

/**
 * Sniffs a Buffer to detect its MIME type and extension using binary signatures.
 *
 * @param buffer The input buffer (recommended first 2048 bytes).
 * @returns The detected type or null if unknown.
 */
export function sniffMimeType(buffer: Buffer): SniffResult | null {
  if (!buffer || buffer.length < 4) return null;

  // --- IMAGE FORMATS ---

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: "png", mime: "image/png" };
  }

  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { ext: "gif", mime: "image/gif" };
  }

  // WebP: RIFF .... WEBP (require at least 12 bytes)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { ext: "webp", mime: "image/webp" };
  }

  // TIFF: 49 49 2A 00 (little-endian) or 4D 4D 00 2A (big-endian)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return { ext: "tiff", mime: "image/tiff" };
  }

  // AVIF / HEIC / MP4: ftyp box at offset 4, brand at offset 8-11
  // Must check before the generic SVG text scan since this is a binary format
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = new TextDecoder().decode(buffer.slice(8, 12));
    if (brand === "avif" || brand === "avis") return { ext: "avif", mime: "image/avif" };
    if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("heim")) {
      return { ext: "heic", mime: "image/heic" };
    }
    return { ext: "mp4", mime: "video/mp4" };
  }

  // SVG: Proper XML/SVG namespace detection (not just a loose "<svg" substring)
  // Use TextDecoder with fatal:true on a UTF-8 slice for reliable detection
  try {
    const head = new TextDecoder("utf-8", { fatal: true }).decode(buffer.slice(0, 256));
    if (/<!DOCTYPE\s+html/i.test(head) || /<html[\s>]/i.test(head)) {
      return { ext: "html", mime: "text/html" };
    }
    const hasXmlDeclaration = head.includes("<?xml");
    const hasSvgNamespace = /<svg\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(head);
    if (hasXmlDeclaration || hasSvgNamespace) {
      return { ext: "svg", mime: "image/svg+xml" };
    }
  } catch {
    // Not valid UTF-8 in the first 256 bytes — definitely not SVG/HTML
  }

  // --- VIDEO FORMATS ---

  // WebM / Matroska: 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { ext: "webm", mime: "video/webm" };
  }

  // --- DOCUMENT FORMATS ---

  // PDF: 25 50 44 46
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { ext: "pdf", mime: "application/pdf" };
  }

  // ZIP / DOCX / XLSX: 50 4B 03 04
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    const inner = buffer.toString("ascii", 30, Math.min(buffer.length, 512));
    if (inner.includes("word/")) {
      return {
        ext: "docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }
    if (inner.includes("xl/")) {
      return {
        ext: "xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }
    return { ext: "zip", mime: "application/zip" };
  }

  return null;
}

/**
 * Resolve a response Content-Type without I/O.
 * Order: filename extension → stored MIME (skipping octet-stream) → magic bytes → octet-stream.
 */
export function resolveMimeType(options: {
  name?: string | null;
  storedMime?: string | null;
  buffer?: Buffer | null;
}): string {
  if (options.name) {
    const mapped = getMimeType(options.name);
    if (mapped) return mapped;
  }
  const stored = usableMime(options.storedMime);
  if (stored) return stored;
  if (options.buffer && options.buffer.length >= 4) {
    const sniffed = sniffMimeType(options.buffer)?.mime;
    if (sniffed) return sniffed;
  }
  return OCTET_STREAM;
}

/**
 * Resolve Content-Type for a file on disk. Known extensions skip the head read.
 */
export async function resolveMimeTypeFromPath(
  filePath: string,
  storedMime?: string | null,
  extraNames?: readonly string[],
): Promise<string> {
  const mapped = getMimeType(filePath);
  if (mapped) return mapped;
  if (extraNames) {
    for (const name of extraNames) {
      const extra = getMimeType(name);
      if (extra) return extra;
    }
  }
  const stored = usableMime(storedMime);
  if (stored) return stored;

  try {
    const fh = await open(filePath, "r");
    try {
      const buf = Buffer.allocUnsafe(SNIFF_HEAD_BYTES);
      const { bytesRead } = await fh.read(buf, 0, SNIFF_HEAD_BYTES, 0);
      const sniffed = sniffMimeType(buf.subarray(0, bytesRead))?.mime;
      if (sniffed) return sniffed;
    } finally {
      await fh.close();
    }
  } catch {
    // unreadable — fall through to octet-stream
  }
  return OCTET_STREAM;
}

function mimeFamily(mime: string): string {
  return mime.split("/", 1)[0] ?? "";
}

/**
 * True when claimed and sniffed types are a dangerous mismatch.
 * Same family (jpeg vs png) is allowed; scriptable sniff/claim vs anything else is not.
 */
export function mimeTypesConflict(claimed: string | null, sniffed: string | null): boolean {
  if (!claimed || !sniffed) return false;
  const a = normalizeMime(claimed);
  const b = normalizeMime(sniffed);
  if (!a || !b || a === b) return false;
  if (SCRIPTABLE_MIME.has(a) || SCRIPTABLE_MIME.has(b)) return true;
  return mimeFamily(a) !== mimeFamily(b);
}

/**
 * Reject polyglots at write time (extension/declared vs magic bytes).
 * Known-extension GET path does not sniff — this is the security check.
 */
export function assertMimeAgreement(options: {
  filename?: string | null;
  declaredMime?: string | null;
  sniffedMime?: string | null;
}): void {
  const fromName = options.filename ? getMimeType(options.filename) : null;
  const declared = usableMime(options.declaredMime);
  const sniffed = usableMime(options.sniffedMime);

  if (mimeTypesConflict(fromName, declared)) {
    throw new AppError(
      `MIME type mismatch: file claims "${fromName}", client sent "${declared}"`,
      415,
      "MIME_MISMATCH",
    );
  }
  if (mimeTypesConflict(fromName, sniffed)) {
    throw new AppError(
      `MIME type mismatch: file claims "${fromName}", binary signature indicates "${sniffed}"`,
      415,
      "MIME_MISMATCH",
    );
  }
  if (mimeTypesConflict(declared, sniffed)) {
    throw new AppError(
      `MIME type mismatch: client sent "${declared}", binary signature indicates "${sniffed}"`,
      415,
      "MIME_MISMATCH",
    );
  }
}

/**
 * Resolve MIME for a downloaded remote asset (importer, saveRemoteMedia, S3 mirror).
 * Extension → declared Content-Type → magic bytes, then allowlist. Rejects polyglots.
 */
export function resolveRemoteAssetMime(options: {
  filename: string;
  declaredMime?: string | null;
  buffer: Buffer;
}): string {
  const sniffed = sniffMimeType(options.buffer)?.mime ?? null;
  assertMimeAgreement({
    filename: options.filename,
    declaredMime: options.declaredMime,
    sniffedMime: sniffed,
  });
  const mime = resolveMimeType({
    name: options.filename,
    storedMime: options.declaredMime,
    buffer: options.buffer,
  });
  if (!isAllowedUploadMime(mime)) {
    throw new AppError(`MIME type not allowed: ${mime}`, 415, "MIME_NOT_ALLOWED");
  }
  return mime;
}
