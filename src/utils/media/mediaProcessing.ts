/**
 * @file src/utils/media/mediaProcessing.ts
 * @description Client-safe media processing operations.
 * * ✅ CLIENT-SIDE SAFE
 * This file can be imported into .svelte components.
 */

import { sanitize } from '@utils/utils';
import { logger } from '@utils/logger';

/**
 * Sanitizes a filename by removing unsafe characters and normalizing the extension.
 * Useful for preparing filenames before upload.
 */
export function getSanitizedFileName(fileName: string): {
	fileNameWithoutExt: string;
	ext: string;
} {
	if (!fileName || typeof fileName !== 'string') {
		const message = 'Invalid filename provided';
		logger.error(message, { fileName });
		throw new Error(message);
	}

	const lastDotIndex = fileName.lastIndexOf('.');
	// Handle cases with no extension or dot at the start (hidden files)
	const name = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
	const ext = lastDotIndex > 0 ? fileName.slice(lastDotIndex + 1) : '';

	// Detailed trace for debugging upload issues
	logger.trace('Sanitizing filename', {
		original: fileName,
		nameWithoutExt: name,
		extension: ext
	});

	const sanitized = {
		fileNameWithoutExt: sanitize(name),
		ext: ext.toLowerCase() // Normalize extension to lowercase for consistency
	};

	return sanitized;
}
