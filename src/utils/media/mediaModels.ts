/**
 * @file utils/media/mediaModels.ts
 * @description Defines media models and interfaces for the CMS
 */

import { publicEnv } from '@root/config/public';

// Enum representing media types
export enum MediaTypeEnum {
	Image = 'image',
	Document = 'document',
	Audio = 'audio',
	Video = 'video',
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
	createdAt: Date;
	createdBy: string;
}

// Represents access permissions for a media item
export interface MediaAccess {
	userId?: string;
	roleId?: string;
	permissions: Permission[];
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

// Image metadata interface
export interface ImageMetadata {
	width: number;
	height: number;
	format: string;
	size: number;
	mimeType: string;
}

// Base interface for all media types
export interface MediaBase {
	_id?: string; // Unique identifier
	type: MediaTypeEnum; // Discriminator
	hash: string;
	filename: string;
	path: string;
	url: string;
	mimeType: string;
	size: number;
	user: string;
	createdAt: Date;
	updatedAt: Date;
	metadata?: MediaMetadata;
	isDeleted?: boolean;
	deletedAt?: Date;
	versions: MediaVersion[];
	access: MediaAccess;
}

// Represents an image media item
export interface MediaImage extends MediaBase {
	type: MediaTypeEnum.Image; // Discriminator
	width: number;
	height: number;
	thumbnail: Thumbnail;
	thumbnails: Record<keyof typeof publicEnv.IMAGE_SIZES, Thumbnail>;
}

// Represents a document media item
export interface MediaDocument extends MediaBase {
	type: MediaTypeEnum.Document; // Discriminator
	pageCount?: number;
	createdBy: string;
}

// Represents an audio media item
export interface MediaAudio extends MediaBase {
	type: MediaTypeEnum.Audio; // Discriminator
	duration?: number;
}

// Represents a video media item
export interface MediaVideo extends MediaBase {
	type: MediaTypeEnum.Video; // Discriminator
	duration?: number;
	thumbnailUrl?: string;
}

// Represents a remote video media item
export interface MediaRemoteVideo extends MediaBase {
	type: MediaTypeEnum.RemoteVideo; // Discriminator
	provider: string;
	externalId: string;
}

// Union type for all media items
export type MediaType = MediaImage | MediaDocument | MediaAudio | MediaVideo | MediaRemoteVideo;

// Type for resized image versions
export interface ResizedImage {
	url: string;
	width: number;
	height: number;
}

// Type for image sizes
export type ImageSizes = Record<string, ResizedImage>;
