/**
 * @file src/routes/api/media/remote/+server.ts
 * @description
 * API endpoint for saving remote media files.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { checkApiPermission } from '@api/permissions';
import { saveRemoteMedia } from '@utils/media/mediaStorage';
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request, cookies }) => {
	// Check permissions using centralized system
	const user = await checkApiPermission(cookies, 'media:create');

	try {
		const { fileUrl, contentTypes } = await request.json();
		if (!fileUrl || !contentTypes) {
			throw error(400, 'File URL and collection types are required');
		}

		const result = await saveRemoteMedia(fileUrl, contentTypes, user._id.toString());
		return json({ success: true, ...result });
	} catch (err) {
		const message = `Error saving remote media: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
