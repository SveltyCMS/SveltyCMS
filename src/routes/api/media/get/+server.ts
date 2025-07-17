/**
 * @file src/routes/api/media/get/+server.ts
 * @description
 * API endpoint for retrieving media files.
 *
 * @example GET /api/media/get?url=https://example.com/image.jpg
 *
 * Features:
 * - Centralized permission checking for media access
 * - Requires authentication and media read permissions
 * - Admin override for unrestricted access
 * - Secure file retrieval with proper headers
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Permissions
import { checkApiPermission } from '@api/permissions';

// Media
import { getFile } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ url, locals }) => {
	// Use centralized permission checking
	const permissionResult = await checkApiPermission(locals.user, {
		resource: 'media',
		action: 'read'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized attempt to retrieve media file', {
			userId: locals.user?._id,
			error: permissionResult.error
		});
		throw error(permissionResult.error?.includes('Authentication') ? 401 : 403, permissionResult.error || 'Forbidden');
	}

	try {
		const fileUrl = url.searchParams.get('url');
		if (!fileUrl) {
			throw error(400, 'URL parameter is required');
		}

		const buffer = await getFile(fileUrl);

		logger.debug('Media file retrieved successfully', {
			fileUrl,
			fileSize: buffer.length,
			userId: locals.user?._id
		});

		return new Response(buffer, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="${fileUrl.split('/').pop()}"`,
				'Content-Length': buffer.length.toString()
			}
		});
	} catch (err) {
		const message = `Error retrieving file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, {
			fileUrl: url.searchParams.get('url'),
			userId: locals.user?._id
		});
		throw error(500, message);
	}
};
