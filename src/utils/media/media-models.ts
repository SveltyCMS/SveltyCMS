/**
 * @file src/utils/media/media-models.ts
 * @description Type definitions & domain helpers for CMS media assets.
 *
 * ### Design
 * - `as const` maps instead of enums → tree-shakable, JSON-safe, erasableSyntaxOnly-proof.
 *   Each map doubles as the runtime valid-value list (no duplicated arrays).
 * - One discriminated union + a type-level lookup map (`MediaItemMap`) — narrowing,
 *   generics, and type guards all derive from a single source of truth.
 * - Stored vs. remote assets separated: `MediaRemoteVideo` no longer carries fake
 *   `path`/`size`/`hash`/`mimeType`.
 * - DB-agnostic: identity/date/metadata shapes come from `db-interface`.
 *
 * ### Migration notes
 * - `MediaType.Image` in TYPE position → use `(typeof MediaType)["Image"]` or `MediaOf<"image">`.
 *   Value usage (`item.type === MediaType.Image`) is unchanged.
 * - `MediaRemoteVideo` lost `path`/`size`/`hash`/`mimeType`. Existing rows with those
 *   fields: migrate or set a `storage` field so the DB adapter can handle the split.
 * - `user` is deprecated → use `createdBy`. Both present for legacy compat.
 */

import type { CmsMediaMetadata, DatabaseId, ISODateString } from "@src/databases/db-interface";

export type { CmsMediaMetadata };

/* -------------------------------------------------------------------------- */
/* Value maps — single source of truth for both types AND runtime lists       */
/* -------------------------------------------------------------------------- */

export const MediaType = {
  Image: "image",
  Video: "video",
  Audio: "audio",
  Document: "document",
  RemoteVideo: "remoteVideo",
} as const;

export type MediaType = (typeof MediaType)[keyof typeof MediaType];

/** Runtime list for validation, select options, iteration. */
export const MEDIA_TYPES: readonly MediaType[] = Object.values(MediaType);

export const MediaAccess = {
  Public: "public",
  Private: "private",
  Protected: "protected",
} as const;

export type MediaAccess = (typeof MediaAccess)[keyof typeof MediaAccess];

export const STORAGE_TYPES = ["local", "s3", "r2", "cloudinary"] as const;
export type StorageType = (typeof STORAGE_TYPES)[number];

export const REMOTE_VIDEO_PROVIDERS = ["youtube", "vimeo"] as const;
export type RemoteVideoProvider = (typeof REMOTE_VIDEO_PROVIDERS)[number] | (string & {});

/* -------------------------------------------------------------------------- */
/* Shared building blocks                                                     */
/* -------------------------------------------------------------------------- */

export interface AuditedEntity {
  _id: DatabaseId;
  createdAt: ISODateString;
  createdBy: DatabaseId;
  updatedAt: ISODateString;
  updatedBy: DatabaseId;
}

export interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

/** Named thumbnails ("sm", "card@2x", …). `undefined` = planned/failed rendition. */
export type ThumbnailSet = Record<string, Thumbnail | undefined>;

export interface ResizedImage extends Thumbnail {
  mimeType: string;
  size: number;
}

export interface MediaVersion {
  version: number;
  url: string;
  createdAt: ISODateString;
  createdBy: DatabaseId;
  size?: number;
  mimeType?: string;
}

/* -------------------------------------------------------------------------- */
/* Base shapes                                                                */
/* -------------------------------------------------------------------------- */

export interface MediaBase extends AuditedEntity {
  type: MediaType;
  filename: string;
  originalFilename: string;
  url: string;

  access?: MediaAccess;
  folderId?: DatabaseId | null;
  tenantId?: DatabaseId | null;

  alt?: string;
  title?: string;

  metadata: CmsMediaMetadata;
  thumbnails?: ThumbnailSet;
  versions?: MediaVersion[];

  /** @deprecated Use `createdBy` (inherited from AuditedEntity). */
  user: DatabaseId;
}

export interface StoredMediaBase extends MediaBase {
  storage?: StorageType;
  path: string;
  size: number;
  hash: string;
  mimeType: string;
}

/* -------------------------------------------------------------------------- */
/* Concrete media kinds                                                       */
/* -------------------------------------------------------------------------- */

export interface MediaImage extends StoredMediaBase {
  type: typeof MediaType.Image;
  width: number;
  height: number;
}

export interface MediaVideo extends StoredMediaBase {
  type: typeof MediaType.Video;
  duration?: number;
  thumbnailUrl?: string;
}

export interface MediaAudio extends StoredMediaBase {
  type: typeof MediaType.Audio;
  duration?: number;
}

export interface MediaDocument extends StoredMediaBase {
  type: typeof MediaType.Document;
  pageCount?: number;
}

export interface MediaRemoteVideo extends MediaBase {
  type: typeof MediaType.RemoteVideo;
  provider: RemoteVideoProvider;
  externalId: string;
  duration?: number;
}

/* -------------------------------------------------------------------------- */
/* Discriminated-union machinery                                              */
/* -------------------------------------------------------------------------- */

export interface MediaItemMap {
  [MediaType.Image]: MediaImage;
  [MediaType.Video]: MediaVideo;
  [MediaType.Audio]: MediaAudio;
  [MediaType.Document]: MediaDocument;
  [MediaType.RemoteVideo]: MediaRemoteVideo;
}

export type MediaItem = MediaItemMap[MediaType];

/** Resolve the concrete interface for a type literal: `MediaOf<"video">` → `MediaVideo`. */
export type MediaOf<T extends MediaType> = MediaItemMap[T];

/** Any media asset whose bytes are stored in a backend (everything but remote video). */
export type StoredMedia = Exclude<MediaItem, MediaRemoteVideo>;

/* -------------------------------------------------------------------------- */
/* Type guards & runtime helpers                                              */
/* -------------------------------------------------------------------------- */

export function isMediaOfType<T extends MediaType>(item: MediaItem, type: T): item is MediaOf<T> {
  return item.type === type;
}

export const isMediaImage = (item: MediaItem): item is MediaImage => item.type === MediaType.Image;
export const isMediaVideo = (item: MediaItem): item is MediaVideo => item.type === MediaType.Video;
export const isMediaAudio = (item: MediaItem): item is MediaAudio => item.type === MediaType.Audio;
export const isMediaDocument = (item: MediaItem): item is MediaDocument =>
  item.type === MediaType.Document;
export const isMediaRemoteVideo = (item: MediaItem): item is MediaRemoteVideo =>
  item.type === MediaType.RemoteVideo;
export const isStoredMedia = (item: MediaItem): item is StoredMedia =>
  item.type !== MediaType.RemoteVideo;

/** Validate untrusted input (API payloads, query params) as a MediaType. */
export function isMediaType(value: unknown): value is MediaType {
  return typeof value === "string" && (MEDIA_TYPES as readonly string[]).includes(value);
}

const TOP_LEVEL_MIMES = new Set<string>([MediaType.Image, MediaType.Video, MediaType.Audio]);

export function mediaTypeFromMime(mimeType: string): MediaType {
  const top = mimeType.split("/", 1)[0]?.toLowerCase() ?? "";
  return TOP_LEVEL_MIMES.has(top) ? (top as MediaType) : MediaType.Document;
}

/** Compile-time exhaustiveness helper — a missed union member fails to compile. */
export function assertNever(value: never, message = "Unhandled media type"): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

/* -------------------------------------------------------------------------- */
/* DTO derivatives — keep client/server payloads honest                       */
/* -------------------------------------------------------------------------- */

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type ServerAssignedKeys = keyof AuditedEntity | "hash" | "path" | "size" | "url" | "versions";

/** What an upload handler assembles before persistence (discrimination preserved). */
export type NewMedia<T extends MediaItem = MediaItem> = DistributiveOmit<T, ServerAssignedKeys>;

export type MediaPatch = Partial<
  Pick<MediaBase, "filename" | "folderId" | "access" | "alt" | "title" | "metadata" | "thumbnails">
>;

/* -------------------------------------------------------------------------- */
/* Processing options                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Sharp-compatible gravities. "top"/"bottom"/"left"/"right" are convenience
 * aliases — map them to "north"/"south"/"west"/"east" before passing to sharp.
 */
export const WATERMARK_POSITIONS = [
  "centre",
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
  "top",
  "bottom",
  "left",
  "right",
] as const;

export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export interface WatermarkOptions {
  position: WatermarkPosition;
  /** 0–1, relative to the shorter image edge. */
  scale: number;
  url: string;
}

/** Map convenience aliases to sharp-compatible compass positions. */
export function normalizeWatermarkPosition(pos: WatermarkPosition): string {
  const MAP: Record<string, string> = {
    top: "north",
    bottom: "south",
    left: "west",
    right: "east",
  };
  return MAP[pos] ?? pos;
}

/* -------------------------------------------------------------------------- */
/* Backwards compatibility                                                    */
/* -------------------------------------------------------------------------- */

export { MediaType as MediaTypeEnum };
