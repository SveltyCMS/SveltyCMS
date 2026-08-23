/**
 * @file src/routes/(app)/mediagallery/gallery-list-item.ts
 * @description Slim gallery-row DTO — tiles, search, and details chrome without
 * shipping the full DB media document (versions blobs, advancedMetadata, …).
 *
 * Features:
 * - explicit allowlisted fields for `/mediagallery` SSR
 * - thumbnail set stripped to url/width/height/size
 * - metadata keep-list for focal point, tags, EXIF search, share links
 */

const META_KEEP = new Set([
  "focalPoint",
  "placeholder",
  "dominantColor",
  "tags",
  "aiTags",
  "alt",
  "name",
  "caption",
  "exif",
  "sharedLinks",
  "width",
  "height",
]);

export interface GalleryThumbnail {
  url: string;
  width?: number;
  height?: number;
  size?: number;
}

export interface GalleryListItem {
  _id: string;
  access?: string;
  createdAt?: string;
  createdBy?: string;
  filename: string;
  folderId?: string | null;
  hash: string;
  height?: number;
  metadata: Record<string, unknown>;
  mimeType: string;
  name: string;
  originalFilename?: string;
  path: string;
  size?: number;
  tenantId?: string | null;
  thumbnail: { url: string };
  thumbnails: Record<string, GalleryThumbnail>;
  type: string;
  updatedAt?: string;
  url: string;
  versions?: Array<{ version: number; url: string; createdAt?: string; size?: number }>;
  width?: number;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (
    typeof value === "object" &&
    typeof (value as { toString?: () => string }).toString === "function"
  ) {
    return String((value as { toString: () => string }).toString());
  }
  return String(value);
}

function slimThumbnails(raw: unknown): Record<string, GalleryThumbnail> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, GalleryThumbnail> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const thumb = value as Record<string, unknown>;
    if (typeof thumb.url !== "string" || !thumb.url) continue;
    out[key] = {
      url: thumb.url,
      width: typeof thumb.width === "number" ? thumb.width : undefined,
      height: typeof thumb.height === "number" ? thumb.height : undefined,
      size: typeof thumb.size === "number" ? thumb.size : undefined,
    };
  }
  return out;
}

function slimMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!META_KEEP.has(key) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function slimVersions(raw: unknown): GalleryListItem["versions"] {
  if (!Array.isArray(raw)) return undefined;
  const versions = raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const v = row as Record<string, unknown>;
      if (typeof v.version !== "number" || typeof v.url !== "string") return null;
      return {
        version: v.version,
        url: v.url,
        createdAt: typeof v.createdAt === "string" ? v.createdAt : undefined,
        size: typeof v.size === "number" ? v.size : undefined,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  return versions.length > 0 ? versions : undefined;
}

/**
 * Map a DB media document to the gallery list row. Drops unknown keys so
 * EXIF blobs / advancedMetadata never ride every tile to the browser.
 */
export function toGalleryListItem(item: Record<string, unknown>): GalleryListItem | null {
  const filename = asString(item.filename);
  const hash = asString(item.hash);
  const mimeType = asString(item.mimeType);
  if (!filename || !hash || !mimeType) return null;

  const thumbnails = slimThumbnails(item.thumbnails);
  const thumbnailEntry = thumbnails.thumbnail ?? thumbnails.sm;
  const publicUrl = asString(item.url);
  const widthRaw = item.width ?? (item.metadata as Record<string, unknown> | undefined)?.width;
  const heightRaw = item.height ?? (item.metadata as Record<string, unknown> | undefined)?.height;

  return {
    _id: asString(item._id),
    access: typeof item.access === "string" ? item.access : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    createdBy: item.createdBy != null ? asString(item.createdBy) : undefined,
    filename,
    folderId: item.folderId == null ? null : asString(item.folderId),
    hash,
    height: typeof heightRaw === "number" ? heightRaw : undefined,
    metadata: slimMetadata(item.metadata),
    mimeType,
    name: filename,
    originalFilename: typeof item.originalFilename === "string" ? item.originalFilename : undefined,
    path: asString(item.path) || "global",
    size: typeof item.size === "number" ? item.size : undefined,
    tenantId: item.tenantId == null ? undefined : asString(item.tenantId),
    thumbnail: { url: thumbnailEntry?.url || publicUrl },
    thumbnails,
    type: mimeType.split("/")[0] || "document",
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
    url: publicUrl,
    versions: slimVersions(item.versions),
    width: typeof widthRaw === "number" ? widthRaw : undefined,
  };
}
