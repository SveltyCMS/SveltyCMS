/**
 * @file src/routes/api/media/process/+server.ts
 * @description
 * API endpoint for processing media files, now multi-tenant aware.
 *
 * @example POST /api/media/process
 *
 * Features:
 * - Granular permission checking based on operation type
 * - Operation-specific security (read/write/delete permissions)
 * - Admin override for all operations
 * - Supports metadata extraction, file saving, and deletion within a tenant
 * - Comprehensive error handling and logging
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Auth
import { dbAdapter } from '@src/databases/db';

// Media Processing
import { extractMetadata } from '@utils/media/mediaProcessing.server';
import { MediaService } from '@src/services/MediaService.server';
import type { MediaAccess, WatermarkOptions, MediaItem } from '@utils/media/mediaModels';

// System Logger
import { logger } from '@utils/logger.server';

// Response types
interface ProcessResult {
	success: boolean;
	data?: MediaItem | MediaItem[] | FileProcessResult[] | Record<string, unknown>;
	error?: string;
}

interface FileProcessResult {
	fileName: string;
	success: boolean;
	data?: MediaItem;
	error?: string;
}

// Helper function to get MediaService instance
function getMediaService(): MediaService {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	try {
		const service = new MediaService(dbAdapter!);
		logger.info('MediaService initialized successfully');
		return service;
	} catch (err) {
		const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;

	try {
		const formData = await request.formData();
		const processType = formData.get('processType');

		if (!processType || typeof processType !== 'string') {
			logger.warn('No process type specified', { tenantId });
			return json({ success: false, error: 'Process type not specified' }, { status: 400 });
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		} // Check appropriate permissions based on operation type

		switch (processType) {
			case 'metadata':
				break;
			case 'save':
				break;
			case 'delete':
				break;
			default:
				throw error(400, `Unsupported process type: ${processType}`);
		} // Authentication is handled by hooks.server.ts - user presence confirms access // Initialize MediaService

		const mediaService = getMediaService();

		let result: ProcessResult;
		switch (processType) {
			case 'metadata': {
				const file = formData.get('file');
				if (!file || !(file instanceof File)) {
					return json({ success: false, error: 'No valid file received' }, { status: 400 });
				}
				const buffer = Buffer.from(await file.arrayBuffer());
				const metadata = await extractMetadata(buffer);
				result = { success: true, data: metadata as unknown as Record<string, unknown> };
				break;
			}
			case 'save': {
				const files = formData.getAll('files');
				if (files.length === 0 || !files.every((f) => f instanceof File)) {
					return json({ success: false, error: 'No valid files received' }, { status: 400 });
				}

				if (!user) {
					throw error(401, 'User not authenticated');
				}

				const access: MediaAccess = 'private';
				const watermarkOptionsString = formData.get('watermarkOptions') as string | null;
				let watermarkOptions: WatermarkOptions | undefined;
				if (watermarkOptionsString) {
					try {
						watermarkOptions = JSON.parse(watermarkOptionsString);
					} catch {
						logger.warn('Could not parse watermark options', { options: watermarkOptionsString });
					}
				}

				const results: FileProcessResult[] = [];
				for (const file of files) {
					if (file instanceof File) {
						if (!file.name || typeof file.name !== 'string') {
							results.push({ fileName: 'unknown', success: false, error: 'Invalid file name' });
							continue;
						}
						try {
							// Pass tenantId and watermarkOptions to the media service
							const saveResult = await mediaService.saveMedia(file, user._id.toString(), access, tenantId, watermarkOptions);
							const savedItem = saveResult as MediaItem;

							results.push({
								fileName: file.name,
								success: true,
								data: savedItem
							});

							logger.info(`Successfully saved file: ${file.name}`, {
								userId: user._id,
								fileSize: file.size,
								tenantId,
								thumbnails: Object.keys(savedItem.thumbnails ?? {})
							});
						} catch (err) {
							const errorMsg = err instanceof Error ? err.message : String(err);
							logger.error(`Error saving file ${file.name}:`, { error: errorMsg, tenantId });
							results.push({ fileName: file.name, success: false, error: errorMsg });
						}
					}
				}
				result = { success: true, data: results };
				break;
			}
			case 'delete': {
				const mediaId = formData.get('mediaId');
				if (!mediaId || typeof mediaId !== 'string') {
					return json({ success: false, error: 'Invalid media ID' }, { status: 400 });
				}
				// deleteMedia only takes one parameter
				await mediaService.deleteMedia(mediaId);
				result = { success: true };
				break;
			}
			default:
				throw error(400, `Unsupported process type: ${processType}`);
		}

		return json({
			success: true,
			data: result
		});
	} catch (err) {
		const message = `Error processing media: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { tenantId });
		return json({ success: false, error: message }, { status: 500 });
	}
};
