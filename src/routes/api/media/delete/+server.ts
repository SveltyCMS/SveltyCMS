/**
 * @file src/routes/api/media/delete/+server.ts
 * @description
 * API endpoint for changing the access of a media file.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { checkApiPermission } from '@src/routes/api/permissions';

// Media
import { deleteFile } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const DELETE: RequestHandler = async ({ request, locals }) => {
	// Check media delete permissions
	const permissionResult = await checkApiPermission(locals.user, {
		resource: 'media',
		action: 'delete'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized attempt to delete media file', {
			userId: locals.user?._id,
			error: permissionResult.error
		});
		throw error(permissionResult.error?.includes('Authentication') ? 401 : 403, permissionResult.error || 'Forbidden');
	}

	try {
		const { url } = await request.json();
		if (!url) {
			throw error(400, 'URL is required');
		}

		await deleteFile(url);

		logger.info('File deleted successfully', {
			url,
			user: locals.user?.email || 'unknown'
		});

		return json({ success: true });
	} catch (err) {
		const message = `Error deleting file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { user: locals.user?.email || 'unknown' });
		throw error(500, message);
	}
};
