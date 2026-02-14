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

import { json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Database
import { dbAdapter } from '@src/databases/db';

// Permissions

// System Logger
import { logger } from '@utils/logger.server';

// Validation
import * as v from 'valibot';

const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100)), 100)
});

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const GET = apiHandler(async ({ locals, url }) => {
	const { user, tenantId } = locals;
	try {
		// Authentication is handled by hooks.server.ts
		if (!user) {
			throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
		}

		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw new AppError('Tenant could not be identified for this operation.', 400, 'TENANT_MISSING');
		} // Validate query parameters

		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || undefined
		});
		const recursive = url.searchParams.get('recursive') === 'true';

		if (!dbAdapter) {
			logger.error('Database adapter not available');
			throw new AppError('Database connection unavailable', 500, 'DB_UNAVAILABLE');
		}

		// --- MULTI-TENANCY: Scope the query by tenantId ---
		const result = await dbAdapter.media.files.getByFolder(
			undefined,
			{
				page: 1,
				pageSize: query.limit,
				sortField: 'updatedAt',
				sortDirection: 'desc',
				user // Pass user for ownership filtering
			},
			recursive,
			tenantId
		);


		if (!result.success) {
			logger.error('Failed to fetch media files from database', {
				error: result.error,
				requestedBy: user?._id,
				tenantId
			});
			throw new AppError('Failed to retrieve media files', 500, 'FETCH_FAILED');
		} // Transform the data to match widget expectations

		const mediaFiles = result.data.items.map((file) => {
			// Helper to map DB path (mediaFolder/...) to URL path (/files/...)
			const normalizePath = (p: string) => {
				// Strip 'mediaFolder/' or 'files/' prefix if present in the raw path
				let path = p.replace(/^mediaFolder\//, '').replace(/^files\//, '');
				// Ensure no leading slash before prepending /files/
				path = path.replace(/^\/+/, '');
				return `/files/${path}`;
			};

			// Normalize thumbnails if present
			const thumbnails = file.thumbnails
				? Object.entries(file.thumbnails).reduce((acc, [key, val]) => {
						if (val) {
							acc[key] = { ...val, url: normalizePath(val.url) };
						}
						return acc;
					}, {} as any)
				: undefined;

			return {
				...file,
				url: normalizePath(file.path),
				thumbnails
			};
		});

		logger.info('Media files fetched successfully via database adapter', {
			count: mediaFiles.length,
			total: result.data.total,
			requestedBy: user?._id,
			tenantId
		});

		return json(mediaFiles);
	} catch (err) {
		if (err instanceof AppError) throw err;
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching media files:', { error: message, status, tenantId: locals.tenantId });
		throw new AppError(message, status, 'MEDIA_FETCH_ERROR');
	}
});
