/**
 * @file utils/media/mediaUtils.ts
 * @description Contains utility functions for media operations.
 */

import mime from 'mime-types';
import urlJoin from 'url-join';
import { publicEnv } from '@root/config/public';
import { sanitize, formatBytes } from '@src/utils/utils'; // Import formatBytes

// Constructs the full media URL based on the environment.
export function constructMediaUrl(mediaItem: MediaBase, size?: keyof typeof SIZES): string {
	if (publicEnv.MEDIASERVER_URL) {
		return `${publicEnv.MEDIASERVER_URL}/${mediaItem.url}`;
	} else {
		const basePath = Path.join(publicEnv.MEDIA_FOLDER, mediaItem.url);
		if (size && 'thumbnails' in mediaItem && mediaItem.thumbnails && mediaItem.thumbnails[size]) {
			return mediaItem.thumbnails[size].url;
		}
		return basePath;
	}
}

// Constructs a URL for a media item based on its path, type, and other parameters
export function constructUrl(path: string, hash: string, fileName: string, format: string, collectionName: string, size?: string): string {
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
		return urlJoin(publicEnv.MEDIASERVER_URL, 'files', urlPath);
	} else {
		// If MEDIA_FOLDER is intended to be a URL path
		return urlJoin(publicEnv.MEDIA_FOLDER, urlPath);

		// If MEDIA_FOLDER is a filesystem path and you need a file path instead:
		// return path.join(publicEnv.MEDIA_FOLDER, urlPath);
	}
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
