/**
 * @file utils/media/mediaUtils.ts
 * @description Contains utility functions for media operations
 *
 * @example import { getBrowserMimeType } from '@utils/media/mediaUtils';
 *
 * Features:
 * - getBrowserMimeType: Returns the MIME type of a file based on its name
 * - constructUrl: Constructs a URL for a media file
 * - validateMediaFile: Validates a media file against allowed types and size limits
 * - getSanitizedFileName: Sanitizes a file name to remove special characters
 */

import { publicEnv } from '@root/config/public';
import { sanitize, formatBytes } from '@utils/utils';
import type { MediaBase } from '@utils/media/mediaModels';
import { removeExtension } from '../utils';

// System Logger
import { logger } from '../logger.svelte';

// Browser-compatible MIME type lookup
function getBrowserMimeType(fileName: string): string | null {
	const extension = fileName.toLowerCase().split('.').pop();
	if (!extension) return null;

	const mimeTypes: Record<string, string> = {
		// Images
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		avif: 'image/avif',
		bmp: 'image/bmp',
		ico: 'image/x-icon',

		// Documents
		pdf: 'application/pdf',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		xls: 'application/vnd.ms-excel',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		ppt: 'application/vnd.ms-powerpoint',
		pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		txt: 'text/plain',
		rtf: 'application/rtf',

		// Audio
		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		ogg: 'audio/ogg',
		aac: 'audio/aac',
		flac: 'audio/flac',
		m4a: 'audio/mp4',

		// Video
		mp4: 'video/mp4',
		webm: 'video/webm',
		mkv: 'video/x-matroska',
		avi: 'video/x-msvideo',
		mov: 'video/quicktime',
		wmv: 'video/x-ms-wmv',
		flv: 'video/x-flv',

		// Archives
		zip: 'application/zip',
		rar: 'application/vnd.rar',
		'7z': 'application/x-7z-compressed',
		tar: 'application/x-tar',
		gz: 'application/gzip'
	};

	return mimeTypes[extension] || null;
}

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
	if (!mediaItem?.url) {
		const message = 'Media item is missing required url property';
		try {
			logger.error(message, {
				mediaItem,
				stack: new Error().stack
			});
		} catch (logError) {
			logger.error('Failed to log error:', logError);
		}
		throw new Error(message);
	}

	try {
		let url: string;

		if (publicEnv.MEDIASERVER_URL) {
			url = `${publicEnv.MEDIASERVER_URL}/${mediaItem.url}`;
		} else {
			const basePath = `${publicEnv.MEDIA_FOLDER}/${mediaItem.url}`.replace(/\/+/g, '/');
			if (size && 'thumbnails' in mediaItem && mediaItem.thumbnails && mediaItem.thumbnails[size]) {
				url = mediaItem.thumbnails[size].url;
			} else {
				url = basePath;
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
			logger.error('Failed to log error:', logError);
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
			logger.error('Failed to log error:', logError);
		}
		throw new Error(message);
	}

	let urlPath: string;

	switch (path) {
		case 'global':
			urlPath = size
				? `${sanitize(contentTypes)}/sizes/${size}/${sanitize(fileName)}-${hash}.${format}`
				: `${sanitize(contentTypes)}/original/${sanitize(fileName)}-${hash}.${format}`;
			// logger.debug('Constructed global path URL', { urlPath });
			break;
		case 'unique':
			urlPath = `${sanitize(contentTypes)}/original/${sanitize(fileName)}-${hash}.${format}`;
			try {
				logger.debug('Constructed unique path URL', { urlPath });
			} catch (logError) {
				logger.error('Failed to log debug info:', logError);
			}
			break;
		default:
			urlPath = size
				? `${sanitize(path)}/${size}/${sanitize(fileName)}-${hash}.${format}`
				: `${sanitize(path)}/${sanitize(fileName)}-${hash}.${format}`;
			try {
				logger.debug('Constructed custom path URL', { urlPath });
			} catch (logError) {
				logger.error('Failed to log debug info:', logError);
			}
	}

	if (publicEnv.MEDIASERVER_URL) {
		const url = `${publicEnv.MEDIASERVER_URL}/files/${urlPath}`;
		try {
			logger.debug('Using media server URL', { url });
		} catch (logError) {
			logger.error('Failed to log debug info:', logError);
		}
		return url;
	} else {
		// Use local files route for media serving
		const url = `/files/${urlPath}`;
		try {
			logger.debug('Using local files route URL', { url });
		} catch (logError) {
			logger.error('Failed to log debug info:', logError);
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

// Safe version for use in reactive contexts
export function getMediaUrlSafe(mediaItem: MediaBase, contentTypes: string, size?: keyof typeof publicEnv.IMAGE_SIZES): string {
	try {
		if (!mediaItem?.path || !mediaItem?.hash || !mediaItem?.filename) {
			return ''; // Return empty string instead of throwing
		}
		if (!contentTypes) {
			return '';
		}

		const fileName = removeExtension(mediaItem.filename);
		const format = mediaItem.filename.split('.').slice(-1)[0];
		if (!format) {
			return '';
		}
		return constructUrl(mediaItem.path, mediaItem.hash, fileName, format, contentTypes, size);
	} catch {
		// Don't log errors in reactive context to avoid state mutations
		return ''; // Return empty string instead of throwing
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
		const fileType = getBrowserMimeType(file.name) || file.type;
		try {
			logger.debug('Validating media file', {
				fileName: file.name,
				fileSize: file.size,
				fileType,
				allowedTypesPattern: allowedTypesPattern.toString(),
				maxSizeBytes
			});
		} catch (logError) {
			logger.error('Failed to log debug info:', logError);
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
				logger.error('Failed to log warning:', logError);
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
				logger.error('Failed to log warning:', logError);
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
			logger.error('Failed to log debug info:', logError);
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
			logger.error('Failed to log error:', logError);
		}
		return {
			isValid: false,
			message
		};
	}
}
