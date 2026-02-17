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

import type { DatabaseId, ISODateString } from '@src/content/types';

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
	aiTags?: string[];
	author?: string;
	copyright?: string;
	description?: string;
	exif?: Record<string, unknown>;
	/** Focal point for smart cropping (0-100 for x and y) */
	focalPoint?: { x: number; y: number };
	keywords?: string[];
	location?: {
		latitude?: number;
		longitude?: number;
		altitude?: number;
	};
	tags?: string[];
	title?: string;
	/** Whether a watermark has been applied to this media */
	watermarkApplied?: boolean;
	[key: string]: unknown;
}

export interface WatermarkOptions {
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
	scale: number;
	url: string;
}

export interface ResizedImage {
	height: number;
	mimeType: string;
	size: number;
	url: string;
	width: number;
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
	filename: string;
	folderId?: DatabaseId | null;
	hash: string;
	metadata?: MediaMetadata;
	mimeType: string;
	originalId?: DatabaseId | null;
	path: string; // storage-relative
	size: number;
	thumbnails?: Record<string, ResizedImage>;
	type: MediaType;
	updatedAt: ISODateString;
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
	thumbnails?: Record<string, ResizedImage>;
	type: MediaType.RemoteVideo;
}

export type MediaItem = MediaImage | MediaVideo | MediaAudio | MediaDocument | MediaRemoteVideo;

/** Virtual folder for organization */
export interface SystemVirtualFolder {
	_id: string;
	color?: string;
	icon?: string;
	name: string;
	parentId: string | null;
}

export { MediaType as MediaTypeEnum };
