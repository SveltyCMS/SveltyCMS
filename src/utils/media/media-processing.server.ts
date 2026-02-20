/**
 * @file src/utils/media/media-processing.server.ts
 * @description Server-side media processing (hashing, metadata extraction & deep analysis)
 */

import { error } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { sha256 } from '@utils/utils';
import sharp from 'sharp';
import type { MediaMetadata } from './media-models';

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

/** Extract standard image metadata with Sharp */
export async function extractMetadata(buffer: Buffer): Promise<sharp.Metadata> {
	try {
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
		logger.error('Metadata extraction failed', {
			size: buffer.length,
			error: msg
		});
		throw error(500, `Metadata error: ${msg}`);
	}
}

/**
 * Advanced media processing for enterprise DAM features.
 * Handles deep metadata extraction (EXIF, IPTC, XMP) and technical analysis.
 */
export class MediaProcessingService {
	private static instance: MediaProcessingService;

	private constructor() {}

	public static getInstance(): MediaProcessingService {
		if (!MediaProcessingService.instance) {
			MediaProcessingService.instance = new MediaProcessingService();
		}
		return MediaProcessingService.instance;
	}

	/**
	 * Extract deep metadata from an image buffer
	 */
	public async getMetadata(buffer: Buffer): Promise<MediaMetadata> {
		try {
			const meta = await sharp(buffer).metadata();

			const results: MediaMetadata = {
				format: meta.format,
				width: meta.width,
				height: meta.height,
				space: meta.space,
				channels: meta.channels,
				density: meta.density,
				hasProfile: meta.hasProfile,
				hasAlpha: meta.hasAlpha,
				orientation: meta.orientation,
				exif: this.parseExif(meta.exif),
				iptc: this.parseIptc(meta.iptc),
				xmp: this.parseXmp(meta.xmp)
			};

			// Extract common DAM fields for easy searching
			if (results.exif) {
				const e = results.exif as any;
				results.camera = e.Make || e.Model ? `${e.Make || ''} ${e.Model || ''}`.trim() : undefined;
				results.software = e.software;
				results.createdAt = e.DateTimeOriginal || e.DateTime;
			}

			logger.debug('Deep metadata extracted', {
				format: results.format,
				hasExif: !!results.exif,
				camera: results.camera
			});

			return results;
		} catch (err) {
			logger.error('Failed to extract deep metadata', err);
			return {};
		}
	}

	private parseExif(buffer?: Buffer): Record<string, any> | undefined {
		if (!buffer) {
			return undefined;
		}
		try {
			return {
				_raw: buffer.toString('base64'),
				_length: buffer.length
			};
		} catch {
			return undefined;
		}
	}

	private parseIptc(buffer?: Buffer): Record<string, any> | undefined {
		if (!buffer) {
			return undefined;
		}
		return { _raw: buffer.toString('base64') };
	}

	private parseXmp(buffer?: Buffer): Record<string, any> | undefined {
		if (!buffer) {
			return undefined;
		}
		try {
			const xmpString = buffer.toString('utf8');
			return {
				_raw: xmpString,
				isXml: xmpString.includes('<?xpacket')
			};
		} catch {
			return undefined;
		}
	}
}

export const mediaProcessingService = MediaProcessingService.getInstance();
