/**
 * @file utils/media/mediaModels.ts
 * @description Defines media models and interfaces for the CMS
 */

import type { ISODateString, DatabaseId } from '@src/content/types';

// Storage type for media files
export type StorageType = 'local' | 's3' | 'r2' | 'cloudinary';

// Enum representing media types
export enum MediaTypeEnum {
	Image = 'image',
	Video = 'video',
	Audio = 'audio',
	Document = 'document',
	RemoteVideo = 'remoteVideo'
}

// Enum representing permission types
export enum Permission {
	Read = 'read',
	Write = 'write',
	Delete = 'delete'
}

// Represents a version of a media item
export interface MediaVersion {
	version: number;
	url: string;
	createdAt: ISODateString;
	createdBy: string; // Should be DatabaseId
}

// Represents a thumbnail for an image
export interface Thumbnail {
	url: string;
	width: number;
	height: number;
}

// Metadata interface for media items
export interface MediaMetadata {
	title?: string;
	description?: string;
	keywords?: string[];
	copyright?: string;
	author?: string;
	dimensions?: {
		width?: number;
		height?: number;
		depth?: number;
	};
	location?: {
		latitude?: number;
		longitude?: number;
		altitude?: number;
	};
	[key: string]: unknown;
}

// Image metadata interface (for extraction)
export interface ImageMetadata {
	width: number;
	height: number;
	format: string;
	size: number;
	mimeType: string;
}

// Base interface for all media types
export type MediaAccess = 'public' | 'private' | 'protected';

// Type for resized image versions
export interface ResizedImage {
	url: string;
	width: number;
	height: number;
	size: number;
	mimeType: string;
}

// Base interface for all media types
export interface MediaBase {
	_id?: DatabaseId;
	type: MediaTypeEnum;
	hash: string;
	filename: string; // Original filename
	path: string; // Relative path in storage (e.g., "global/original/image-hash.jpg")
	url: string; // Publicly accessible URL (e.g., "https://cdn.com/..." or "/files/...")
	mimeType: string;
	size: number;
	user: string; // DatabaseId of user who uploaded
	createdAt: ISODateString;
	updatedAt: ISODateString;
	metadata?: MediaMetadata;
	versions?: MediaVersion[];
	access?: MediaAccess;
}

export interface MediaImage extends MediaBase {
	type: MediaTypeEnum.Image;
	width: number;
	height: number;
	thumbnails?: Record<string, ResizedImage>;
}

export interface MediaVideo extends MediaBase {
	type: MediaTypeEnum.Video;
	duration?: number;
	thumbnailUrl?: string;
}

export interface MediaAudio extends MediaBase {
	type: MediaTypeEnum.Audio;
	duration?: number;
}

export interface MediaDocument extends MediaBase {
	type: MediaTypeEnum.Document;
	pageCount?: number;
}

export interface MediaRemoteVideo extends MediaBase {
	type: MediaTypeEnum.RemoteVideo;
	provider: 'youtube' | 'vimeo' | 'other' | string; // Made provider more flexible
	externalId: string;
	thumbnails?: Record<string, ResizedImage>;
}

export type MediaType = MediaImage | MediaVideo | MediaAudio | MediaDocument | MediaRemoteVideo;
