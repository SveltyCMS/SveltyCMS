/**
 * @file src/routes/api/media/edit/+server.ts
 * @description API endpoint for editing images using Sharp.js
 *
 * Enterprise default: Save as new file (preserves original for recovery, versioning, audit).
 * Optional: Overwrite original (with audit log); use when storage or workflow requires it.
 *
 * FormData:
 *   - file: The edited image file
 *   - mediaId: (optional) Original media ID; required when saveBehavior=overwrite
 *   - saveBehavior: (optional) 'new' | 'overwrite'; default 'new'
 *   - operations: (optional) JSON string of operations applied
 *   - focalPoint: (optional) JSON string of focal point {x, y}
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import sharp from 'sharp';
import { logger } from '@utils/logger.server';
import { dbAdapter } from '@src/databases/db';
import { hashFileContent } from '@src/utils/media/mediaProcessing.server';
import { MediaType } from '@src/utils/media/mediaModels';
import type { MediaImage } from '@src/utils/media/mediaModels';
import fs from 'fs/promises';
import path from 'path';
import { getPublicSetting } from '@src/services/settingsService';
import type { DatabaseId } from '@src/content/types';
import type { ISODateString } from '@src/content/types';
import { auditLogService, type AuditLogEventInput, AuditEventType } from '@src/services/auditLogService';
import { MediaService } from '@src/services/MediaService.server';
import { saveFileToDisk } from '@src/utils/media/mediaStorage.server';

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
		const saveBehaviorRaw = (formData.get('saveBehavior') as string | null) || 'new';
		const saveBehavior = saveBehaviorRaw === 'overwrite' ? 'overwrite' : 'new';
		const operationsStr = formData.get('operations') as string | null;
		const focalPointStr = formData.get('focalPoint') as string | null;

		if (saveBehavior === 'overwrite' && !mediaId) {
			return json({ success: false, error: 'mediaId is required when saveBehavior is overwrite' }, { status: 400 });
		}

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

		const timestamp = Date.now();
		const hash = await hashFileContent(processedBuffer);
		const processedMetadata = await sharp(processedBuffer).metadata();

		// --- Overwrite path: replace original file and update document ---
		if (saveBehavior === 'overwrite' && mediaId && dbAdapter) {
			try {
				const findResult = await dbAdapter.crud.findOne('MediaItem', { _id: mediaId as DatabaseId });
				if (!findResult.success || !findResult.data) {
					return json({ success: false, error: 'Original media not found' }, { status: 404 });
				}
				const originalMedia = findResult.data as any;
				let relativePath = originalMedia.path as string | undefined;
				if (!relativePath) {
					return json({ success: false, error: 'Original media has no path' }, { status: 400 });
				}

				// Normalise path: strip leading slashes or /files/ prefix if present
				relativePath = String(relativePath)
					.replace(/^\/+/, '')
					.replace(/^files\//, '');

				// Use core media storage helper so overwrite respects MEDIA_FOLDER & cloud/local config
				await saveFileToDisk(processedBuffer, relativePath);

				const updatedMetadata = {
					...(originalMedia.metadata || {}),
					focalPoint: focalPoint || originalMedia.metadata?.focalPoint,
					operations: Object.keys(operations).length > 0 ? operations : originalMedia.metadata?.operations,
					editedBy: userId,
					editedAt: new Date().toISOString()
				};

				const updateResult = await dbAdapter.crud.update(
					'MediaItem',
					mediaId as DatabaseId,
					{
						size: processedBuffer.length,
						hash,
						width: processedMetadata.width || 0,
						height: processedMetadata.height || 0,
						mimeType: file.type,
						metadata: updatedMetadata,
						updatedAt: new Date(timestamp).toISOString() as ISODateString
					} as any
				);

				if (!updateResult.success) throw updateResult.error;

				const overwriteAudit: AuditLogEventInput = {
					eventType: AuditEventType.MEDIA_EDIT_OVERWRITE,
					severity: 'medium',
					actorId: userId as DatabaseId,
					targetId: mediaId as DatabaseId,
					targetType: 'MediaItem',
					action: 'Overwrite original image after edit',
					details: {
						mediaId,
						path: relativePath,
						size: String(processedBuffer.length),
						dimensions: `${processedMetadata.width}x${processedMetadata.height}`
					},
					result: 'success'
				};
				await auditLogService.logEvent(overwriteAudit);

				logger.info(`Edited image overwrote original: ${relativePath}`, {
					mediaId,
					size: processedBuffer.length,
					dimensions: `${processedMetadata.width}x${processedMetadata.height}`
				});

				return json({
					success: true,
					data: { ...originalMedia, ...updateResult.data }
				});
			} catch (overwriteError) {
				logger.error('Overwrite edit failed', { error: overwriteError, mediaId });
				return json(
					{ success: false, error: overwriteError instanceof Error ? overwriteError.message : 'Failed to overwrite image' },
					{ status: 500 }
				);
			}
		}

		// --- Save as new (default): create new file and new MediaItem ---
		if (!dbAdapter) {
			throw new Error('Database adapter not available');
		}

		// Reuse MediaService pipeline so edited images follow the same storage & URL scheme as normal uploads
		const mediaService = new MediaService(dbAdapter);
		const editedFileName = `edited-${timestamp}-${hash}.${file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1]}`;
		const editedFile = new File([processedBuffer], editedFileName, { type: file.type });

		// basePath 'global' matches standard uploadMedia flow
		const saved = await mediaService.saveMedia(editedFile, userId as string, 'public', 'global', undefined, (mediaId as DatabaseId | null) ?? null);

		// Enrich metadata with edit provenance (focal point & operations)
		try {
			const updatedMetadata = {
				...(saved.metadata || {}),
				focalPoint: focalPoint || (saved.metadata as any)?.focalPoint,
				operations: Object.keys(operations).length > 0 ? operations : (saved.metadata as any)?.operations,
				editedBy: userId,
				editedAt: new Date().toISOString()
			};

			await dbAdapter.crud.update(
				'MediaItem',
				saved._id as DatabaseId,
				{
					metadata: updatedMetadata
				} as any
			);
		} catch (metaError) {
			logger.warn('Failed to update metadata for edited media', { metaError, mediaId: saved._id });
		}

		const newFileAudit: AuditLogEventInput = {
			eventType: AuditEventType.MEDIA_EDIT_NEW,
			severity: 'low',
			actorId: userId as DatabaseId,
			targetId: saved._id as DatabaseId,
			targetType: 'MediaItem',
			action: 'Save edited image as new file (original preserved)',
			details: {
				newMediaId: String(saved._id),
				originalId: mediaId || '',
				size: String(processedBuffer.length),
				dimensions: `${processedMetadata.width}x${processedMetadata.height}`
			},
			result: 'success'
		};
		await auditLogService.logEvent(newFileAudit);

		logger.info(`Edited image saved as new via MediaService: ${saved.filename}`, {
			mediaId: saved._id,
			originalId: mediaId,
			size: processedBuffer.length,
			dimensions: `${processedMetadata.width}x${processedMetadata.height}`
		});

		return json({
			success: true,
			data: saved
		});
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
		saveBehavior: { default: 'new', options: ['new', 'overwrite'] },
		operations: ['rotate', 'flip', 'flop', 'crop', 'resize', 'brightness', 'saturation', 'blur', 'sharpen', 'grayscale', 'watermark']
	});
};
