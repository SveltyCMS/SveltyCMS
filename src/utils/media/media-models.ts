/**
 * @file src/utils/media/mediaModels.ts
 * @description Type definitions for media assets in the CMS
 *
 * Features:
 * - Unified base with specific extensions
 * - Storage-agnostic paths/URLs
 * - Flexible metadata & thumbnails
 * - Access control
 */

import type { DatabaseId, ISODateString, CmsMediaMetadata } from "@src/databases/db-interface";
export type { CmsMediaMetadata };

export type StorageType = "local" | "s3" | "r2" | "cloudinary";

export enum MediaType {
  Image = "image",
  Video = "video",
  Audio = "audio",
  Document = "document",
  RemoteVideo = "remoteVideo",
}

export type MediaAccess = "public" | "private" | "protected";

// CmsMediaMetadata is now imported from db-interface.ts to ensure agnosticism compliance

export interface WatermarkOptions {
  position:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "centre"
    | "north"
    | "northeast"
    | "east"
    | "southeast"
    | "south"
    | "southwest"
    | "west"
    | "northwest";
  scale: number;
  url: string;
}

export interface ResizedImage {
  url: string;
  width: number;
  height: number;
  mimeType: string;
  size: number;
}

export interface MediaVersion {
  createdAt: ISODateString;
  createdBy: DatabaseId;
  url: string;
  version: number;
}

export interface MediaBase {
  _id: DatabaseId; // Required for BaseEntity compatibility
  access?: MediaAccess;
  createdAt: ISODateString;
  createdBy: DatabaseId; // For DB agnosticism
  filename: string;
  folderId?: DatabaseId | null;
  hash: string;
  metadata: CmsMediaMetadata; // Mandatory for DB agnosticism
  mimeType: string;
  originalFilename: string; // For DB agnosticism
  originalId?: DatabaseId | null;
  path: string; // storage-relative
  size: number;
  tenantId?: DatabaseId | null; // For multi-tenant support
  thumbnails?: Record<string, { url: string; width: number; height: number } | undefined>; // Aligned with db-interface.ts
  type: MediaType;
  updatedAt: ISODateString;
  updatedBy: DatabaseId; // For DB agnosticism
  url: string; // public URL
  user: DatabaseId;
  versions?: MediaVersion[];
}

export interface MediaImage extends MediaBase {
  height: number;
  type: MediaType.Image;
  width: number;
}

export interface MediaVideo extends MediaBase {
  duration?: number;
  thumbnailUrl?: string;
  type: MediaType.Video;
}

export interface MediaAudio extends MediaBase {
  duration?: number;
  type: MediaType.Audio;
}

export interface MediaDocument extends MediaBase {
  pageCount?: number;
  type: MediaType.Document;
}

export interface MediaRemoteVideo extends MediaBase {
  externalId: string;
  provider: string; // youtube | vimeo | other
  thumbnails?: Record<string, { url: string; width: number; height: number } | undefined>; // Aligned
  type: MediaType.RemoteVideo;
}

export type MediaItem = MediaImage | MediaVideo | MediaAudio | MediaDocument | MediaRemoteVideo;

export { MediaType as MediaTypeEnum };
