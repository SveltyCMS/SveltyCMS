/**
 * @file shared/utils/src/media/mediaProcessing.server.ts
 * @description Server-side media processing (hashing & metadata extraction)
 *
 * Features:
 * - SHA-256 content hashing (first 20 chars)
 * - Sharp-based image metadata
 * - Safe buffer handling
 */

import { error } from '@sveltejs/kit';
import { logger } from '@shared/utils/logger.server';
import { sha256 } from '@shared/utils/utils';

/** Hash file content (SHA-256, 20-char hex) */
export async function hashFileContent(buffer: ArrayBuffer | Buffer): Promise<string> {
	if (!buffer || buffer.byteLength === 0) {
		throw error(400, 'Cannot hash empty buffer');
	}

	try {
		const arr = (buffer instanceof Buffer ? buffer : new Uint8Array(buffer)) as any;
		const hash = await sha256(arr);
		const short = hash.slice(0, 20);

		logger.debug('File hashed', { size: buffer.byteLength, hash: short });

		return short;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error('Hashing failed', { size: buffer.byteLength, error: msg });
		throw error(500, `Hashing error: ${msg}`);
	}
}

/** Extract image metadata with Sharp */
export async function extractMetadata(buffer: Buffer): Promise<import('sharp').Metadata> {
	try {
		const sharp = (await import('sharp')).default;
		const meta = await sharp(buffer).metadata();

		logger.debug('Metadata extracted', {
			format: meta.format,
			size: meta.size,
			width: meta.width,
			height: meta.height
		});

		return meta;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error('Metadata extraction failed', { size: buffer.length, error: msg });
		throw error(500, `Metadata error: ${msg}`);
	}
}
