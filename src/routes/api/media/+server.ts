/**
 * @file src/routes/api/media/+server.ts
 * @description API endpoint for media file operations and listings using database-agnostic adapter
 *
 * @example GET /api/media?limit=5
 *
 * Features:
 * - Database-agnostic media file retrieval, scoped to the current tenant
 * - Secure, granular access control per operation
 * - Efficient pagination and sorting
 * - Consistent error handling with DatabaseResult<T>
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { privateEnv } from '@root/config/private';

// Database
import { dbAdapter } from '@src/databases/db';

// Permissions

// System Logger
import { logger } from '@utils/logger.svelte';

// Validation
import * as v from 'valibot';

const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(50)), 5)
});

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user, tenantId } = locals;
	try {
		// Authentication is handled by hooks.server.ts
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		} // Validate query parameters

		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || undefined
		});

		if (!dbAdapter) {
			logger.error('Database adapter not available');
			throw error(500, 'Database connection unavailable');
		}

		// --- MULTI-TENANCY: Scope the query by tenantId ---
		const filter = privateEnv.MULTI_TENANT ? { tenantId } : {}; // Use database-agnostic adapter to get media files

		const result = await dbAdapter.media.files.getByFolder(undefined, {
			page: 1,
			pageSize: query.limit,
			sortField: 'updatedAt',
			sortDirection: 'desc',
			filter
		});

		if (!result.success) {
			logger.error('Failed to fetch media files from database', {
				error: result.error,
				requestedBy: user?._id,
				tenantId
			});
			throw error(500, 'Failed to retrieve media files');
		} // Transform the data to match widget expectations

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
			requestedBy: user?._id,
			tenantId
		});

		return json(mediaFiles);
	} catch (err) {
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching media files:', { error: message, status, tenantId: locals.tenantId });
		throw error(status, message);
	}
};
