/**
 * @file src/routes/api/media/avatar/+server.ts
 * @description
 * API endpoint for saving a user's avatar image.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { checkApiPermission } from '@src/routes/api/permissions';

// Media
import { saveAvatarImage } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check media write permissions (avatars are user-specific but still require media access)
	const permissionResult = await checkApiPermission(locals.user, {
		resource: 'media',
		action: 'write'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized attempt to upload avatar', {
			userId: locals.user?._id,
			error: permissionResult.error
		});
		throw error(permissionResult.error?.includes('Authentication') ? 401 : 403, permissionResult.error || 'Forbidden');
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file');

		if (!file || !(file instanceof File)) {
			throw error(400, 'Valid file is required');
		}

		const avatarUrl = await saveAvatarImage(file);

		logger.info('Avatar uploaded successfully', {
			user: locals.user?.email || 'unknown',
			avatarUrl
		});

		return json({ success: true, url: avatarUrl });
	} catch (err) {
		const message = `Error saving avatar image: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { user: locals.user?.email || 'unknown' });
		throw error(500, message);
	}
};
