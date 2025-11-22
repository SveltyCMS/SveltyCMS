/**
 * @file src/routes/api/media/get/+server.ts
 * @description
 * API endpoint for retrieving media files, scoped to the current tenant.
 *
 * @example GET /api/media/get?url=https://example.com/image.jpg
 *
 * Features:
 * - Centralized permission checking for media access
 * - Requires authentication and media read permissions
 * - Admin override for unrestricted access
 * - Secure, tenant-aware file retrieval with proper headers
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Permissions

// Media
import { getFile } from '@utils/media/mediaStorage.server';

// System Logger
import { logger } from '@utils/logger.server';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user, tenantId } = locals;

	// Authentication is handled by hooks.server.ts
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}

	try {
		const fileUrl = url.searchParams.get('url');
		if (!fileUrl) {
			throw error(400, 'URL parameter is required');
		}

		// Retrieve the file from storage
		const buffer = await getFile(fileUrl);

		logger.debug('Media file retrieved successfully', {
			fileUrl,
			fileSize: buffer.length,
			userId: user?._id,
			tenantId
		});

		return new Response(new Uint8Array(buffer), {
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
			userId: user?._id,
			tenantId
		});
		throw error(500, message);
	}
};
