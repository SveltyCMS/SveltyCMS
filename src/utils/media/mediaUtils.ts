/**
 * @file utils/media/mediaUtils.ts
 * @description Contains utility functions for media operations.
 */

import mime from 'mime-types';
import Path from 'path';
import { publicEnv } from '@root/config/public';
import { sanitize, formatBytes } from '@utils/utils';
import type { MediaBase } from '@utils/media/mediaModels';
import { removeExtension } from '../utils';

// System Logger
import { logger } from '../logger.svelte';

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
	const startTime = performance.now();

	if (!mediaItem?.url) {
		const message = 'Media item is missing required url property';
		try {
			logger.error(message, {
				mediaItem,
				stack: new Error().stack
			});
		} catch (logError) {
			console.error('Failed to log error:', logError);
		}
		throw new Error(message);
	}

	try {
		let url: string;

		if (publicEnv.MEDIASERVER_URL) {
			url = `${publicEnv.MEDIASERVER_URL}/${mediaItem.url}`;
			try {
				logger.debug('Constructed media server URL', {
					url,
					processingTime: performance.now() - startTime
				});
			} catch (logError) {
				console.error('Failed to log debug info:', logError);
			}
		} else {
			const basePath = Path.posix.join(publicEnv.MEDIA_FOLDER, mediaItem.url);
			if (size && 'thumbnails' in mediaItem && mediaItem.thumbnails && mediaItem.thumbnails[size]) {
				url = mediaItem.thumbnails[size].url;
				try {
					logger.debug('Using thumbnail URL', {
						size,
						url,
						processingTime: performance.now() - startTime
					});
				} catch (logError) {
					console.error('Failed to log debug info:', logError);
				}
			} else {
				url = basePath;
				try {
					logger.debug('Using base media URL', {
						basePath,
						processingTime: performance.now() - startTime
					});
				} catch (logError) {
					console.error('Failed to log debug info:', logError);
				}
			}
		}

		return url;
	} catch (err) {
		const message = `Error constructing media URL: ${err instanceof Error ? err.message : String(err)}`;
		try {
			logger.error(message, {
				mediaItem,
				size,
				stack: new Error().stack
			});
		} catch (logError) {
			console.error('Failed to log error:', logError);
		}
		throw new Error(message);
	}
}

// Constructs a URL for a media item based on its path, type, and other parameters.
export function constructUrl(
	path: string,
	hash: string,
	fileName: string,
	format: string,
	contentTypes: string,
	size?: keyof typeof publicEnv.IMAGE_SIZES
): string {
	// Validate all required parameters with detailed checks
	const missingParams = [];
	if (!path || typeof path !== 'string') missingParams.push('path');
	if (!hash || typeof hash !== 'string' || hash.length !== 32) missingParams.push('hash');
	if (!fileName || typeof fileName !== 'string') missingParams.push('fileName');
	if (!format || typeof format !== 'string') missingParams.push('format');
	if (!contentTypes || typeof contentTypes !== 'string') missingParams.push('contentTypes');

	if (missingParams.length > 0) {
		const message = `Invalid URL construction parameters: Missing or invalid ${missingParams.join(', ')}`;
		try {
			logger.error(message, {
				path: path ?? null,
				hash: hash ?? null,
				fileName: fileName ?? null,
				format: format ?? null,
				contentTypes: contentTypes ?? null,
				stack: new Error().stack
			});
		} catch (logError) {
			console.error('Failed to log error:', logError);
		}
		throw new Error(message);
	}

	let urlPath: string;

	switch (path) {
		case 'global':
			break;
		case 'unique':
			urlPath = `${sanitize(contentTypes)}/original/${sanitize(fileName)}-${hash}.${format}`;
			try {
				logger.debug('Constructed unique path URL', { urlPath });
			} catch (logError) {
				console.error('Failed to log debug info:', logError);
			}
			break;
		default:
			urlPath = `${sanitize(path)}/${size}/${sanitize(fileName)}-${hash}.${format}`;
			try {
				logger.debug('Constructed custom path URL', { urlPath });
			} catch (logError) {
				console.error('Failed to log debug info:', logError);
			}
	}

	if (publicEnv.MEDIASERVER_URL) {
		const url = `${publicEnv.MEDIASERVER_URL}/files/${urlPath}`;
		try {
			logger.debug('Using media server URL', { url });
		} catch (logError) {
			console.error('Failed to log debug info:', logError);
		}
		return url;
	} else {
		const url = `/${publicEnv.MEDIA_FOLDER}/${urlPath}`;
		try {
			logger.debug('Using local media folder URL', { url });
		} catch (logError) {
			console.error('Failed to log debug info:', logError);
		}
		return url;
	}
}

// Returns the URL for accessing a media item.
export function getMediaUrl(mediaItem: MediaBase, contentTypes: string, size?: keyof typeof publicEnv.IMAGE_SIZES): string {
	if (!mediaItem?.path || !mediaItem?.hash || !mediaItem?.filename) {
		throw new Error('Invalid media item: Missing required properties');
	}
	if (!contentTypes) {
		throw new Error('Content types parameter is required');
	}

	try {
		const fileName = removeExtension(mediaItem.filename);
		const format = mediaItem.filename.split('.').slice(-1)[0];
		if (!format) {
			throw new Error('Could not determine file format');
		}
		return constructUrl(mediaItem.path, mediaItem.hash, fileName, format, contentTypes, size);
	} catch (err) {
		throw new Error(`Failed to construct media URL: ${err instanceof Error ? err.message : String(err)}`);
	}
}

// Validates a media file against allowed types and size limits
export function validateMediaFile(
	file: File,
	allowedTypesPattern: RegExp,
	maxSizeBytes: number = 10 * 1024 * 1024 // Default to 10MB
): { isValid: boolean; message?: string } {
	const startTime = performance.now();

	try {
		const fileType = mime.lookup(file.name) || file.type;
		try {
			logger.debug('Validating media file', {
				fileName: file.name,
				fileSize: file.size,
				fileType,
				allowedTypesPattern: allowedTypesPattern.toString(),
				maxSizeBytes
			});
		} catch (logError) {
			console.error('Failed to log debug info:', logError);
		}

		if (!fileType || !allowedTypesPattern.test(fileType)) {
			const message = `Invalid file type (${fileType}). Allowed pattern: ${allowedTypesPattern}`;
			try {
				logger.warn(message, {
					fileName: file.name,
					fileType,
					allowedTypesPattern: allowedTypesPattern.toString()
				});
			} catch (logError) {
				console.error('Failed to log warning:', logError);
			}
			return {
				isValid: false,
				message
			};
		}

		if (file.size > maxSizeBytes) {
			const message = `File size (${formatBytes(file.size)}) exceeds limit of ${formatBytes(maxSizeBytes)}`;
			try {
				logger.warn(message, {
					fileName: file.name,
					fileSize: file.size,
					maxSizeBytes
				});
			} catch (logError) {
				console.error('Failed to log warning:', logError);
			}
			return {
				isValid: false,
				message
			};
		}

		try {
			logger.debug('Media file validation passed', {
				fileName: file.name,
				processingTime: performance.now() - startTime
			});
		} catch (logError) {
			console.error('Failed to log debug info:', logError);
		}
		return { isValid: true };
	} catch (err) {
		const message = `Error validating media file: ${err instanceof Error ? err.message : String(err)}`;
		try {
			logger.error(message, {
				fileName: file?.name,
				stack: new Error().stack
			});
		} catch (logError) {
			console.error('Failed to log error:', logError);
		}
		return {
			isValid: false,
			message
		};
	}
}
