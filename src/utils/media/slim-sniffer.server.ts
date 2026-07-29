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
 */

export interface SniffResult {
  ext: string;
  mime: string;
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
    const hasXmlDeclaration = head.includes("<?xml");
    const hasSvgNamespace = /<svg\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(head);
    if (hasXmlDeclaration || hasSvgNamespace) {
      return { ext: "svg", mime: "image/svg+xml" };
    }
  } catch {
    // Not valid UTF-8 in the first 256 bytes — definitely not SVG
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
