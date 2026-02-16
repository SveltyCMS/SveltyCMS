/**
 * @file src/routes/api/media/edit/+server.ts
 * @description API endpoint for editing images using Sharp.js
 *
 * This endpoint handles:
 * - Direct file uploads for editing
 * - Editing existing media by mediaId
 * - Server-side image processing with Sharp.js
 * - Saving edited images with proper metadata
 *
 * @example
 * POST /api/media/edit
 * FormData:
 *   - file: The edited image file
 *   - mediaId: (optional) Original media ID to create a variant
 *   - operations: (optional) JSON string of operations applied
 *   - focalPoint: (optional) JSON string of focal point {x, y}
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import sharp from 'sharp';
import { logger } from '@utils/logger.server';
import { dbAdapter } from '@src/databases/db';
import { hashFileContent } from '@src/utils/media/mediaProcessing.server';
import { getPublicSetting } from '@src/services/settingsService';
import { MediaService } from '@src/utils/media/mediaService.server';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Supported image formats
const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'];

// Output formats based on input
const FORMAT_MAP: Record<string, keyof sharp.FormatEnum> = {
	'image/jpeg': 'jpeg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/gif': 'gif'
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const formData = await request.formData();

		// Get user context
		const userId = (locals as any)?.user?._id || 'anonymous';
		const MEDIA_FOLDER = (await getPublicSetting('MEDIA_FOLDER')) || 'mediaFolder';

		// Get the uploaded file
		const file = formData.get('file') as File | null;
		const mediaId = formData.get('mediaId') as string | null;
		const operationsStr = formData.get('operations') as string | null;
		const focalPointStr = formData.get('focalPoint') as string | null;

		// Validate file
		if (!file) {
			return json({ success: false, error: 'No file provided' }, { status: 400 });
		}

		if (!SUPPORTED_FORMATS.includes(file.type)) {
			return json(
				{
					success: false,
					error: `Unsupported file format. Supported: ${SUPPORTED_FORMATS.join(', ')}`
				},
				{ status: 400 }
			);
		}

		if (file.size > MAX_FILE_SIZE) {
			return json({ success: false, error: 'File too large. Maximum size is 50MB' }, { status: 400 });
		}

		// Parse optional data
		let operations: Record<string, any> = {};
		let focalPoint: { x: number; y: number } | null = null;

		if (operationsStr) {
			try {
				operations = JSON.parse(operationsStr);
			} catch {
				logger.warn('Failed to parse operations JSON');
			}
		}

		if (focalPointStr) {
			try {
				focalPoint = JSON.parse(focalPointStr);
			} catch {
				logger.warn('Failed to parse focalPoint JSON');
			}
		}

		// Read file buffer
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Process image with Sharp
		let processedBuffer: Buffer;
		try {
			let sharpInstance = sharp(buffer);

			// Apply operations if specified
			if (operations.rotate) {
				sharpInstance = sharpInstance.rotate(operations.rotate);
			}

			if (operations.flip) {
				sharpInstance = sharpInstance.flip();
			}

			if (operations.flop) {
				sharpInstance = sharpInstance.flop();
			}

			if (operations.crop) {
				const { left, top, width, height } = operations.crop;
				sharpInstance = sharpInstance.extract({
					left: Math.round(left),
					top: Math.round(top),
					width: Math.round(width),
					height: Math.round(height)
				});
			}

			if (operations.resize) {
				sharpInstance = sharpInstance.resize({
					width: operations.resize.width,
					height: operations.resize.height,
					fit: operations.resize.fit || 'inside',
					withoutEnlargement: true
				});
			}

			// Apply color adjustments
			if (operations.brightness !== undefined || operations.saturation !== undefined || operations.lightness !== undefined) {
				sharpInstance = sharpInstance.modulate({
					brightness: operations.brightness !== undefined ? 1 + operations.brightness / 100 : undefined,
					saturation: operations.saturation !== undefined ? 1 + operations.saturation / 100 : undefined,
					lightness: operations.lightness !== undefined ? operations.lightness : undefined
				});
			}

			if (operations.blur && operations.blur > 0) {
				sharpInstance = sharpInstance.blur(operations.blur);
			}

			if (operations.sharpen) {
				sharpInstance = sharpInstance.sharpen();
			}

			// Apply grayscale
			if (operations.grayscale) {
				sharpInstance = sharpInstance.grayscale();
			}

			// Apply watermark if specified
			if (operations.watermark?.buffer) {
				const watermarkBuffer = Buffer.from(operations.watermark.buffer, 'base64');
				const watermarkOptions: sharp.OverlayOptions = {
					input: watermarkBuffer,
					gravity: (operations.watermark.position as any) || 'southeast'
				};

				if (operations.watermark.opacity !== undefined) {
					// Create watermark with opacity using composite
					const watermarkWithOpacity = await sharp(watermarkBuffer)
						.ensureAlpha()
						.composite([
							{
								input: Buffer.from([0, 0, 0, Math.round(operations.watermark.opacity * 255)]),
								raw: { width: 1, height: 1, channels: 4 },
								tile: true,
								blend: 'dest-in'
							}
						])
						.toBuffer();
					watermarkOptions.input = watermarkWithOpacity;
				}

				sharpInstance = sharpInstance.composite([watermarkOptions]);
			}

			// Determine output format
			const outputFormat = FORMAT_MAP[file.type] || 'webp';

			// Set output quality based on format
			switch (outputFormat) {
				case 'jpeg':
					sharpInstance = sharpInstance.jpeg({ quality: 90, mozjpeg: true });
					break;
				case 'png':
					sharpInstance = sharpInstance.png({ compressionLevel: 6 });
					break;
				case 'webp':
					sharpInstance = sharpInstance.webp({ quality: 90 });
					break;
				case 'avif':
					sharpInstance = sharpInstance.avif({ quality: 80 });
					break;
			}

			// Generate processed buffer
			processedBuffer = await sharpInstance.toBuffer();
		} catch (sharpError) {
			logger.error('Sharp processing error:', sharpError);
			return json({ success: false, error: 'Image processing failed' }, { status: 500 });
		}

		// Generate unique filename
		const timestamp = Date.now();
		const hash = await hashFileContent(processedBuffer);
		const sanitizedName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_'); // Basic sanitization
		const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
		const filename = `${sanitizedName}-edited-${timestamp}-${hash}.${extension}`;

		// Use MediaService for saving
		try {
			if (!dbAdapter) throw new Error('Database adapter not available');
			const mediaService = new MediaService(dbAdapter);
			// Buffer to Uint8Array/any to satisfy File constructor
			const editedFile = new File([processedBuffer as any], filename, { type: file.type });

			if (mediaId) {
				// ADD AS NEW VERSION
				logger.info(`Adding new version to media: ${mediaId}`);
				const updatedItem = await mediaService.addVersion(mediaId, editedFile, userId, 'update');

				// Update metadata with operations and focal point
				await mediaService.updateMedia(mediaId, {
					metadata: {
						...updatedItem.metadata,
						focalPoint: focalPoint || updatedItem.metadata?.focalPoint,
						lastOperations: operations
					}
				});

				return json({
					success: true,
					data: updatedItem
				});
			} else {
				// SAVE AS NEW MEDIA
				const savedItem = await mediaService.saveMedia(editedFile, userId, 'public', MEDIA_FOLDER);

				return json({
					success: true,
					data: savedItem
				});
			}
		} catch (dbError) {
			logger.error('Error saving edited image via MediaService:', dbError);
			return json({ success: false, error: 'Failed to save image' }, { status: 500 });
		}
	} catch (error) {
		logger.error('Error in /api/media/edit:', error);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * GET handler to check endpoint status
 */
export const GET: RequestHandler = async () => {
	return json({
		status: 'ok',
		endpoint: '/api/media/edit',
		supportedFormats: SUPPORTED_FORMATS,
		maxFileSize: MAX_FILE_SIZE,
		operations: ['rotate', 'flip', 'flop', 'crop', 'resize', 'brightness', 'saturation', 'blur', 'sharpen', 'grayscale', 'watermark']
	});
};
