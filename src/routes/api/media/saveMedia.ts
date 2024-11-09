/**
 * @file src/route/api/media/saveMedia.svelte
 * @description
 */

import { json } from '@sveltejs/kit';

// Auth
import { auth, dbAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Media Service
import { MediaService } from '@src/utils/media/MediaService';
import type { MediaType, MediaAccess } from '@src/utils/media/mediaModels';
import { Permission } from '@src/utils/media/mediaModels';

// System Logger
import { logger } from '@src/utils/logger';

// Type guard for File objects
function isValidFile(file: unknown): file is File {
	return file !== null && typeof file === 'object' && 'name' in file && 'size' in file && file instanceof File;
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

export async function POST({ request, cookies }) {
	const session_id = cookies.get(SESSION_COOKIE_NAME);
	if (!session_id) {
		logger.warn('No session ID found during file upload');
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	if (!auth) {
		logger.error('Auth service is not initialized');
		return json({ success: false, error: 'Auth service not available' }, { status: 500 });
	}

	try {
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn('Invalid session during file upload');
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const formData = await request.formData();
		const files = formData.getAll('files');

		if (files.length === 0) {
			logger.warn('No files received for upload');
			return json({ success: false, error: 'No files received' }, { status: 400 });
		}

		// Initialize MediaService only when needed
		let mediaService: MediaService;
		try {
			mediaService = getMediaService();
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			logger.error('Failed to initialize MediaService:', error);
			return json({ success: false, error: 'Media service initialization failed' }, { status: 500 });
		}

		const uploadResults: Array<{
			fileName: string;
			success: boolean;
			data?: MediaType;
			error?: string;
		}> = [];

		for (const file of files) {
			if (isValidFile(file)) {
				try {
					// Add default access permissions for the user
					const access: MediaAccess = {
						userId: user._id.toString(),
						permissions: [Permission.Read, Permission.Write, Permission.Delete]
					};

					const result = await mediaService.saveMedia(file, user._id.toString(), access);
					uploadResults.push({
						fileName: file.name,
						success: true,
						data: result
					});
					logger.info(`Successfully saved file: ${file.name}`, {
						userId: user._id,
						fileSize: file.size
					});
				} catch (err) {
					const error = err instanceof Error ? err.message : String(err);
					logger.error(`Error saving file ${file.name}:`, error);
					uploadResults.push({
						fileName: file.name,
						success: false,
						error
					});
				}
			} else {
				const errorMessage = 'Invalid file object received';
				logger.error(errorMessage, { fileType: typeof file });
				uploadResults.push({
					fileName: 'unknown',
					success: false,
					error: errorMessage
				});
			}
		}

		const successCount = uploadResults.filter((r) => r.success).length;
		const failureCount = uploadResults.filter((r) => !r.success).length;

		logger.info(`Processed ${files.length} files for user ${user._id}`, {
			successCount,
			failureCount
		});

		return json({
			success: true,
			results: uploadResults,
			summary: {
				total: files.length,
				successful: successCount,
				failed: failureCount
			}
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error in file upload process:', { error: errorMessage });
		return json(
			{
				success: false,
				error: 'Internal server error during file upload',
				details: errorMessage
			},
			{ status: 500 }
		);
	}
}
