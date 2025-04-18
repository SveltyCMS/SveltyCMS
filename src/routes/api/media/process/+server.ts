/**
 * @file src/routes/api/media/process/+server.ts
 * @description
 * API endpoint for processing media files.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { dbAdapter } from '@src/databases/db';

// Media Processing
import { extractMetadata } from '@utils/media/mediaProcessing';
import { MediaService } from '@utils/media/MediaService';
import type { MediaType, MediaAccess } from '@utils/media/mediaModels';
import { Permission } from '@utils/media/mediaModels';

// System Logger
import { logger } from '@utils/logger.svelte';

// Response types
interface ProcessResult {
	success: boolean;
	data?: MediaType | MediaType[];
	error?: string;
}

interface FileProcessResult {
	fileName: string;
	success: boolean;
	data?: MediaType;
	error?: string;
}

// Helper function to get MediaService instance
function getMediaService(): MediaService {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	try {
		const service = new MediaService(dbAdapter);
		logger.info('MediaService initialized successfully');
		return service;
	} catch (err) {
		const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;

	if (!user) {
		logger.warn('No authenticated user found during media processing');
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const formData = await request.formData();
		const file = formData.get('files');
		const processType = formData.get('processType');

		if (!file || !(file instanceof File)) {
			logger.warn('No valid file received for processing');
			return json({ success: false, error: 'No valid file received' }, { status: 400 });
		}

		if (!processType || typeof processType !== 'string') {
			logger.warn('No process type specified');
			return json({ success: false, error: 'Process type not specified' }, { status: 400 });
		}

		// Initialize MediaService
		const mediaService = getMediaService();

		let result: ProcessResult;
		switch (processType) {
			case 'metadata': {
				const file = formData.get('file');
				if (!file || !(file instanceof File)) {
					logger.warn('No valid file received for metadata processing');
					return json({ success: false, error: 'No valid file received' }, { status: 400 });
				}
				const metadata = await extractMetadata(file);
				result = { success: true, data: metadata };
				break;
			}
			case 'save': {
				const files = formData.getAll('files');
				if (files.length === 0 || !files.every((file) => file instanceof File)) {
					logger.warn('No valid files received for saving');
					return json({ success: false, error: 'No valid files received' }, { status: 400 });
				}

				const access: MediaAccess = {
					userId: user._id.toString(),
					permissions: [Permission.Read, Permission.Write]
				};

				logger.debug('user: ', user._id);

				// Process all files
				const results: FileProcessResult[] = [];
				for (const file of files) {
					if (file instanceof File) {
						try {
							const saveResult = await mediaService.saveMedia(file, user._id.toString(), access);
							results.push({
								fileName: file.name,
								success: true,
								data: saveResult
							});
							logger.info(`Successfully saved file: ${file.name}`, {
								userId: user._id,
								fileSize: file.size
							});
						} catch (err) {
							const error = err instanceof Error ? err.message : String(err);
							logger.error(`Error saving file ${file.name}:`, error);
							results.push({
								fileName: file.name,
								success: false,
								error
							});
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
		logger.error(message);
		return json({ success: false, error: message }, { status: 500 });
	}
};
