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
/* Value-derived types — the runtime maps live in media-values                */
/*                                                                            */
/* MediaTypeEnum is imported as a value so the interfaces below can use        */
/* typeof MediaTypeEnum.Image; every use is a type position, so the runtime    */
/* import is elided at build time.                                            */
/* -------------------------------------------------------------------------- */

import type { MediaAccess, MediaType } from "./media-values";
import { MediaTypeEnum } from "./media-values";

const STORAGE_TYPES = ["local", "s3", "r2", "cloudinary"] as const;
export type StorageType = (typeof STORAGE_TYPES)[number];

const REMOTE_VIDEO_PROVIDERS = ["youtube", "vimeo"] as const;
export type RemoteVideoProvider = (typeof REMOTE_VIDEO_PROVIDERS)[number] | (string & {});

/* -------------------------------------------------------------------------- */
/* Derivative output formats                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Output formats the derivative ladder writes — the runtime list mirrors
 * `MEDIA_OUTPUT_FORMAT_QUALITY.format` in the public config schema.
 *
 * `original` keeps the source format and pairs every step with a WebP sidecar
 * (the pre-2026-09 behaviour, kept as an explicit opt-in).
 */
const DERIVATIVE_FORMATS = ["jpeg", "webp", "avif", "original"] as const;

export type DerivativeFormat = (typeof DERIVATIVE_FORMATS)[number];

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
  type: typeof MediaTypeEnum.Image;
  width: number;
  height: number;
}

export interface MediaVideo extends StoredMediaBase {
  type: typeof MediaTypeEnum.Video;
  duration?: number;
  thumbnailUrl?: string;
}

export interface MediaAudio extends StoredMediaBase {
  type: typeof MediaTypeEnum.Audio;
  duration?: number;
}

export interface MediaDocument extends StoredMediaBase {
  type: typeof MediaTypeEnum.Document;
  pageCount?: number;
}

export interface MediaRemoteVideo extends MediaBase {
  type: typeof MediaTypeEnum.RemoteVideo;
  provider: RemoteVideoProvider;
  externalId: string;
  duration?: number;
}

/* -------------------------------------------------------------------------- */
/* Discriminated-union machinery                                              */
/* -------------------------------------------------------------------------- */

export interface MediaItemMap {
  [MediaTypeEnum.Image]: MediaImage;
  [MediaTypeEnum.Video]: MediaVideo;
  [MediaTypeEnum.Audio]: MediaAudio;
  [MediaTypeEnum.Document]: MediaDocument;
  [MediaTypeEnum.RemoteVideo]: MediaRemoteVideo;
}

export type MediaItem = MediaItemMap[MediaType];

/** Resolve the concrete interface for a type literal: `MediaOf<"video">` → `MediaVideo`. */
export type MediaOf<T extends MediaType> = MediaItemMap[T];

/** Any media asset whose bytes are stored in a backend (everything but remote video). */
export type StoredMedia = Exclude<MediaItem, MediaRemoteVideo>;

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
const WATERMARK_POSITIONS = [
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
