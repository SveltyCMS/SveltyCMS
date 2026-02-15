/**
 * @file src/services/MediaProcessingService.server.ts
 * @description Advanced media processing for enterprise DAM features.
 * Handles deep metadata extraction (EXIF, IPTC, XMP) and technical analysis.
 */

import sharp from 'sharp';
import { logger } from '@utils/logger.server';
import type { MediaMetadata } from '@utils/media/mediaModels';

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
				results.software = e.Software;
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

	/**
	 * Parse raw EXIF buffer into a searchable object
	 * NOTE: In a production environment, use a library like 'exif-reader'
	 * for comprehensive parsing. This is a basic implementation.
	 */
	private parseExif(buffer?: Buffer): Record<string, any> | undefined {
		if (!buffer) return undefined;
		try {
			// Basic extraction - ideally replace with exif-reader
			return {
				_raw: buffer.toString('base64'),
				_length: buffer.length
			};
		} catch {
			return undefined;
		}
	}

	private parseIptc(buffer?: Buffer): Record<string, any> | undefined {
		if (!buffer) return undefined;
		// Placeholder for IPTC parsing
		return { _raw: buffer.toString('base64') };
	}

	private parseXmp(buffer?: Buffer): Record<string, any> | undefined {
		if (!buffer) return undefined;
		try {
			// XMP is usually XML
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
