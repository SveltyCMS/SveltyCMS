import { logger } from '@utils/logger.svelte';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { MediaService } from '@src/utils/media/MediaService';
import type { MediaAccess } from '@src/utils/media/mediaModels';
import { dbAdapter } from '@src/databases/db';

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

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, permissions } = locals;

	try {
		// Validate database adapter
		if (!dbAdapter) {
			const error = "Database adapter isn't initialized";
			logger.error(error);
			return json({ success: false, error }, { status: 424 });
		}

		// Validate user
		if (!user?._id || !user?.role) {
			const error = 'User is unauthorized';
			logger.warn(error, { userId: user?._id, role: user?.role });
			return json({ success: false, error }, { status: 401 });
		}

		// Process form data
		const formData = await request.formData();
		const files = formData.getAll('files');

		if (files.length === 0) {
			const error = 'No files received for upload';
			logger.warn(error);
			return json({ success: false, error }, { status: 400 });
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

		// Define access permissions
		const access: MediaAccess = {
			userId: user._id,
			roleId: user.role,
			permissions: permissions || []
		};

		// Process files
		const results = [];
		for (const file of files) {
			if (isValidFile(file)) {
				try {
					const result = await mediaService.saveMedia(file, user._id, access);
					results.push({
						fileName: file.name,
						success: true,
						data: result
					});
					logger.info(`Successfully saved file: ${file.name}`, {
						userId: user._id,
						fileSize: file.size,
						mediaId: result._id
					});
				} catch (err) {
					const error = err instanceof Error ? err.message : String(err);
					logger.error(`Error saving file ${file.name}:`, error, {
						userId: user._id,
						fileSize: file instanceof File ? file.size : undefined
					});
					results.push({
						fileName: file instanceof File ? file.name : 'unknown',
						success: false,
						error
					});
				}
			} else {
				const error = 'Invalid file object received';
				logger.error(error, {
					fileType: typeof file,
					userId: user._id
				});
				results.push({
					fileName: 'unknown',
					success: false,
					error
				});
			}
		}

		// Log summary
		const successCount = results.filter((r) => r.success).length;
		const failureCount = results.filter((r) => !r.success).length;
		logger.info(`Processed ${files.length} files for user ${user._id}`, {
			successCount,
			failureCount,
			role: user.role
		});

		return json(
			{
				success: true,
				results,
				summary: {
					total: files.length,
					successful: successCount,
					failed: failureCount
				}
			},
			{ status: 200 }
		);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error('Error in file upload process:', {
			error: errorMessage,
			userId: user?._id,
			role: user?.role
		});
		return json(
			{
				success: false,
				error: 'Internal server error during file upload',
				details: errorMessage
			},
			{ status: 500 }
		);
	}
};
