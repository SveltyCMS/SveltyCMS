/**
 * @file src/utils/types.ts
 * @description Defines TypeScript types for media-related data structures used in the application.
 *
 * This file contains:
 * - A generic ID type (ID) that can be either string or number.
 * - Specific types for different media categories:
 *   - MediaImage: For image files with different size variations.
 *   - MediaDocument: For document files.
 *   - MediaAudio: For audio files.
 *   - MediaVideo: For video files.
 *   - MediaRemoteVideo: For remotely hosted video files.
 * - A union type (Media) that encompasses all media types.
 *
 * Each media type includes common properties like hash, id, used_by, and type,
 * along with type-specific properties such as size, duration, and lastModified.
 *
 * @requires @utils/utils - For SIZES constant used in MediaImage type
 *
 * @typedef {string | number} ID - Generic identifier type
 * @typedef {Object} MediaImage - Type for image media
 * @typedef {Object} MediaDocument - Type for document media
 * @typedef {Object} MediaAudio - Type for audio media
 * @typedef {Object} MediaVideo - Type for video media
 * @typedef {Object} MediaRemoteVideo - Type for remote video media
 * @typedef {MediaImage | MediaDocument | MediaAudio | MediaVideo | MediaRemoteVideo} Media - Union type for all media
 */

import type { SIZES } from '@utils/utils';

// Generic ID type to replace specific ID creation
export type ID = string | number;

// Media Image
export type MediaImage = {
	hash: string;
	id: ID;
	used_by: ID[];
	type: 'Image';
} & Record<
	keyof typeof SIZES,
	{
		name: string;
		url: string;
		size: number;
		width: number;
		height: number;
		lastModified: Date;
	}
>;

// Media Document
export type MediaDocument = {
	hash: string;
	id: ID;
	used_by: ID[];
	type: 'Document';
	name: string;
	size: number;
	lastModified: Date;
};

// Media Audio
export type MediaAudio = {
	hash: string;
	id: ID;
	used_by: ID[];
	type: 'Audio';
	name: string;
	size: number;
	duration: number;
	lastModified: Date;
};

// Media Video
export type MediaVideo = {
	hash: string;
	id: ID;
	used_by: ID[];
	type: 'Video';
	name: string;
	size: number;
	duration: number;
	lastModified: Date;
};

// Media Remote Video
export type MediaRemoteVideo = {
	hash: string;
	id: ID;
	used_by: ID[];
	type: 'RemoteVideo';
	name: string;
	url: string;
	lastModified: Date;
};

// Union type for all media types
export type Media = MediaImage | MediaDocument | MediaAudio | MediaVideo | MediaRemoteVideo;
