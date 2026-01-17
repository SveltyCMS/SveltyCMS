/**
 * @file shared/utils/src/media/mediaModels.ts
 * @description Type definitions for media assets in the CMS
 *
 * Features:
 * - Unified base with specific extensions
 * - Storage-agnostic paths/URLs
 * - Flexible metadata & thumbnails
 * - Access control
 */

import type { ISODateString, DatabaseId } from '@cms-types/content';

export type StorageType = 'local' | 's3' | 'r2' | 'cloudinary';

export enum MediaType {
	Image = 'image',
	Video = 'video',
	Audio = 'audio',
	Document = 'document',
	RemoteVideo = 'remoteVideo'
}

export type MediaAccess = 'public' | 'private' | 'protected';

export interface MediaMetadata {
	title?: string;
	description?: string;
	keywords?: string[];
	tags?: string[];
	aiTags?: string[];
	copyright?: string;
	author?: string;
	/** Focal point for smart cropping (0-100 for x and y) */
	focalPoint?: { x: number; y: number };
	/** Whether a watermark has been applied to this media */
	watermarkApplied?: boolean;
	location?: {
		latitude?: number;
		longitude?: number;
		altitude?: number;
	};
	exif?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface WatermarkOptions {
	url: string;
	scale: number;
	position:
		| 'top'
		| 'bottom'
		| 'left'
		| 'right'
		| 'centre'
		| 'north'
		| 'northeast'
		| 'east'
		| 'southeast'
		| 'south'
		| 'southwest'
		| 'west'
		| 'northwest';
}

export interface ResizedImage {
	url: string;
	width: number;
	height: number;
	size: number;
	mimeType: string;
}

export interface MediaVersion {
	version: number;
	url: string;
	createdAt: ISODateString;
	createdBy: DatabaseId;
}

export interface MediaBase {
	_id: DatabaseId; // Required for BaseEntity compatibility
	type: MediaType;
	hash: string;
	filename: string;
	path: string; // storage-relative
	url: string; // public URL
	mimeType: string;
	size: number;
	user: DatabaseId;
	createdAt: ISODateString;
	updatedAt: ISODateString;
	thumbnails?: Record<string, ResizedImage>;
	folderId?: DatabaseId | null;
	originalId?: DatabaseId | null;
	metadata?: MediaMetadata;
	versions?: MediaVersion[];
	access?: MediaAccess;
}

export interface MediaImage extends MediaBase {
	type: MediaType.Image;
	width: number;
	height: number;
}

export interface MediaVideo extends MediaBase {
	type: MediaType.Video;
	duration?: number;
	thumbnailUrl?: string;
}

export interface MediaAudio extends MediaBase {
	type: MediaType.Audio;
	duration?: number;
}

export interface MediaDocument extends MediaBase {
	type: MediaType.Document;
	pageCount?: number;
}

export interface MediaRemoteVideo extends MediaBase {
	type: MediaType.RemoteVideo;
	provider: string; // youtube | vimeo | other
	externalId: string;
	thumbnails?: Record<string, ResizedImage>;
}

export type MediaItem = MediaImage | MediaVideo | MediaAudio | MediaDocument | MediaRemoteVideo;

/** Virtual folder for organization */
export interface SystemVirtualFolder {
	_id: string;
	name: string;
	parentId: string | null;
	icon?: string;
	color?: string;
}

export { MediaType as MediaTypeEnum };
