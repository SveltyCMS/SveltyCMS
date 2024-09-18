/**
 * @file utils/media/mediaModels.ts
 * @description Defines media models and interfaces for the CMS
 */

import { SIZES } from '@utils/utils';

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
	createdAt: number; // Unix timestamp
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

// Base interface for all media types
export interface MediaBase {
	_id?: string; // Unique identifier
	type: MediaTypeEnum; // Discriminator
	hash: string;
	name: string;
	path: string;
	url: string;
	mimeType: string;
	size: number;
	user: string;
	createdAt: number; // Unix timestamp
	updatedAt: number; // Unix timestamp
	metadata?: Record<string, any>;
	isDeleted?: boolean;
	deletedAt?: number; // Unix timestamp
	versions: MediaVersion[];
	access: MediaAccess[];
}

// Represents an image media item
export interface MediaImage extends MediaBase {
	type: MediaTypeEnum.Image; // Discriminator
	width: number;
	height: number;
	thumbnails: Record<keyof typeof SIZES, Thumbnail>; // Dynamic keys based on SIZES
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
