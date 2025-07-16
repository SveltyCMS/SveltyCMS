/**
 * @file src/routes/api/media/avatar/+server.ts
 * @description
 * API endpoint for saving a user's avatar image.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { checkApiPermission } from '@api/permissions';

// Media
import { saveAvatarImage } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request, cookies }) => {
	// Check permissions using centralized system
	await checkApiPermission(cookies, 'media:create');

	try {
		const formData = await request.formData();
		const file = formData.get('file');

		if (!file || !(file instanceof File)) {
			throw error(400, 'Valid file is required');
		}

		const avatarUrl = await saveAvatarImage(file);
		return json({ success: true, url: avatarUrl });
	} catch (err) {
		const message = `Error saving avatar image: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
