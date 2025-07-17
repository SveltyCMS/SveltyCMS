/**
 * @file src/routes/api/media/+server.ts
 * @description API endpoint for media file operations and listings using database-agnostic adapter
 *
 * @example GET /api/media?limit=5
 *
 * Features:
 * - Database-agnostic media file retrieval
 * - Secure, granular access control per operation
 * - Efficient pagination and sorting
 * - Consistent error handling with DatabaseResult<T>
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Database
import { dbAdapter } from '@src/databases/db';

// Permissions
import { checkApiPermission } from '@api/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

// Validation
import * as v from 'valibot';

const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(50)), 5)
});

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		// Check if user has permission for media access
		const permissionResult = await checkApiPermission(locals.user, {
			resource: 'media',
			action: 'read'
		});

		if (!permissionResult.hasPermission) {
			logger.warn('Unauthorized attempt to access media data', {
				userId: locals.user?._id,
				error: permissionResult.error
			});
			throw error(permissionResult.error?.includes('Authentication') ? 401 : 403, permissionResult.error || 'Forbidden');
		}

		// Validate query parameters
		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || undefined
		});

		if (!dbAdapter) {
			logger.error('Database adapter not available');
			throw error(500, 'Database connection unavailable');
		}

		// Use database-agnostic adapter to get media files
		const result = await dbAdapter.media.files.getByFolder(undefined, {
			page: 1,
			pageSize: query.limit,
			sortField: 'updatedAt',
			sortDirection: 'desc'
		});

		if (!result.success) {
			logger.error('Failed to fetch media files from database', {
				error: result.error,
				requestedBy: locals.user?._id
			});
			throw error(500, 'Failed to retrieve media files');
		}

		// Transform the data to match widget expectations
		const mediaFiles = result.data.items.map((file) => ({
			id: file._id,
			name: file.filename,
			size: file.size,
			modified: file.updatedAt,
			type: file.mimeType.split('/')[1] || 'unknown',
			url: file.path,
			createdBy: file.createdBy
		}));

		logger.info('Media files fetched successfully via database adapter', {
			count: mediaFiles.length,
			total: result.data.total,
			requestedBy: locals.user?._id
		});

		return json(mediaFiles);
	} catch (err) {
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching media files:', { error: message, status });
		throw error(status, message);
	}
};
