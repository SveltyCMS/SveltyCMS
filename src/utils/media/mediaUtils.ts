/**
 * @file utils/media/mediaUtils.ts
 * @description Contains utility functions for media operations.
 */

import mime from 'mime-types';
import Path from 'path';
import { publicEnv } from '@root/config/public';
import { sanitize, formatBytes } from '@utils/utils';
import type { MediaBase } from '@utils/media/mediaModels';

// Convert IMAGE_SIZES to an array of size configurations
const imageSizes: Array<{ name: string; width: number; height: number }> = Object.keys(publicEnv.IMAGE_SIZES).map((key) => ({
	name: key,
	width: publicEnv.IMAGE_SIZES[key].width,
	height: publicEnv.IMAGE_SIZES[key].height
}));

// Media categories definition
export const mediaCategories = {
	Images: ['Original', 'Thumbnail', ...imageSizes.map((size) => size.name)],
	Audio: [],
	Videos: [],
	Documents: [],
	RemoteVideos: []
} as const;

// Constructs the full media URL based on the environment.
export function constructMediaUrl(mediaItem: MediaBase, size?: keyof typeof publicEnv.IMAGE_SIZES): string {
	if (publicEnv.MEDIASERVER_URL) {
		return `${publicEnv.MEDIASERVER_URL}/${mediaItem.url}`;
	} else {
		const basePath = Path.posix.join(publicEnv.MEDIA_FOLDER, mediaItem.url);
		if (size && 'thumbnails' in mediaItem && mediaItem.thumbnails && mediaItem.thumbnails[size]) {
			return mediaItem.thumbnails[size].url;
		}
		return basePath;
	}
}

// Constructs a URL for a media item based on its path, type, and other parameters.
export function constructUrl(
	path: string,
	hash: string,
	fileName: string,
	format: string,
	collectionName: string,
	size?: keyof typeof publicEnv.IMAGE_SIZES
): string {
	let urlPath: string;

	switch (path) {
		case 'global':
			urlPath = `original/${hash}-${sanitize(fileName)}${size ? `-${size}` : ''}.${format}`;
			break;
		case 'unique':
			urlPath = `${sanitize(collectionName)}/original/${hash}-${sanitize(fileName)}${size ? `-${size}` : ''}.${format}`;
			break;
		default:
			urlPath = `${sanitize(path)}/original/${hash}-${sanitize(fileName)}${size ? `-${size}` : ''}.${format}`;
	}

	if (publicEnv.MEDIASERVER_URL) {
		return `${publicEnv.MEDIASERVER_URL}/files/${urlPath}`;
	} else {
		return urlPath;
	}
}

// Returns the URL for accessing a media item.
export function getMediaUrl(mediaItem: MediaBase, collectionName: string, size?: keyof typeof publicEnv.IMAGE_SIZES): string {
	return constructUrl(mediaItem.path, mediaItem.hash, mediaItem.name, Path.extname(mediaItem.name).slice(1), collectionName, size);
}

// Validates a media file against allowed types and size limits
export function validateMediaFile(file: File, allowedTypes: string[]): { isValid: boolean; message?: string } {
	const fileType = mime.lookup(file.name) || file.type;

	if (!fileType || !allowedTypes.includes(fileType)) {
		return {
			isValid: false,
			message: `Invalid file type. Allowed types are: ${allowedTypes.join(', ')}.`
		};
	}

	const maxFileSize = publicEnv.MAX_FILE_SIZE ?? 100 * 1024 * 1024; // Default to 100MB

	if (file.size > maxFileSize) {
		return {
			isValid: false,
			message: `File size exceeds the limit of ${formatBytes(maxFileSize)}.`
		};
	}

	return { isValid: true, message: 'File is valid' };
}
