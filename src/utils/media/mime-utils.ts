/**
 * @file src/utils/media/mime-utils.ts
 * @description Native MIME type lookup and extension mapping for core enterprise formats.
 * Replaces the 'mime-types' library.
 */

const MIME_DB: Record<string, string> = {
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",

  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",

  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mpeg: "video/mpeg",

  // Documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
  csv: "text/csv",
};

const EXT_DB: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_DB).map(([ext, mime]) => [mime, ext]),
);

/**
 * Returns the MIME type for a given filename or extension.
 */
export function lookup(filename: string): string | false {
  if (!filename) return false;
  const parts = filename.split(".");
  const ext = parts[parts.length - 1].toLowerCase();
  return MIME_DB[ext] || false;
}

/**
 * Returns the extension for a given MIME type.
 */
export function extension(mime: string): string | false {
  if (!mime) return false;
  return EXT_DB[mime] || false;
}

export default { lookup, extension };
