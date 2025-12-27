/**
 * @file src/utils/media/mediaProcessing.ts
 * @description Client-safe media utilities (filename sanitization)
 *
 * Features:
 * - Safe filename extraction & sanitization
 * - Extension normalization
 * - Client-side compatible (no server deps)
 */

import { sanitize } from '@utils/utils';
import { logger } from '@utils/logger';

/** Sanitize filename for safe upload/storage */
export function sanitizedFilename(original: string): { name: string; ext: string } {
	if (!original || typeof original !== 'string') {
		throw new Error('Invalid filename');
	}

	const dot = original.lastIndexOf('.');
	const name = dot > 0 ? original.slice(0, dot) : original;
	const ext = dot > 0 ? original.slice(dot + 1).toLowerCase() : '';

	logger.trace('Filename sanitized', { original, name, ext });

	return { name: sanitize(name), ext };
}

/** Alias for backward compatibility */
export function getSanitizedFileName(filename: string): { fileNameWithoutExt: string; ext: string } {
	const { name, ext } = sanitizedFilename(filename);
	return { fileNameWithoutExt: name, ext };
}
