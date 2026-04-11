/**
 * @file src/utils/media/slim-sniffer.server.ts
 * @description Ultra-lightweight binary sniffer for core enterprise media formats.
 * Replaces the 160KB 'file-type' library (~2KB total).
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

  // WebP: RIFF .... WEBP
  if (
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

  // SVG: Check for '<svg' (Very simple check)
  const header = buffer.toString("ascii", 0, 100);
  if (header.includes("<svg")) {
    return { ext: "svg", mime: "image/svg+xml" };
  }

  // --- VIDEO FORMATS ---

  // MP4 / MOV: .... ftyp
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return { ext: "mp4", mime: "video/mp4" };
  }

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
    // Basic ZIP check - could be DOCX/XLSX
    // For an enterprise CMS, we usually treat these as generic zip unless further inspected.
    // But we'll label as DOCX for simplicity if that's the primary use.
    return {
      ext: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }

  return null;
}
