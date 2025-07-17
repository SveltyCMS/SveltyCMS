/**
 * @file src/routes/api/media/exists/+server.ts
 * @description
 * API endpoint for checking the existence of a media file
 *
 * @example GET /api/media/exists?url=https://example.com/image.jpg
 *
 * Features:
 * - Secure, granular access control per operation
 * - Status-based access control for non-admin users
 * - ModifyRequest support for widget-based data processing
 * - Status-based access control for non-admin users
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Media
import { fileExists } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

// Permissions
import { checkApiPermission } from '@api/permissions';

export const GET: RequestHandler = async ({ url, locals }) => {
	// Use centralized permission checking
	const permissionResult = await checkApiPermission(locals.user, {
		resource: 'media',
		action: 'read'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized attempt to check media file existence', {
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

		const exists = await fileExists(fileUrl);
		logger.debug('Media file existence check', {
			fileUrl,
			exists,
			userId: locals.user?._id
		});

		return json({ exists });
	} catch (err) {
		const message = `Error checking file existence: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { userId: locals.user?._id });
		throw error(500, message);
	}
};
