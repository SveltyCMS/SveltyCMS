/**
 * @file src/routes/api/media/trash/+server.ts
 * @description
 * API endpoint for changing the access of a media file.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { checkApiPermission } from '@api/permissions';
import { moveMediaToTrash } from '@utils/media/mediaStorage';
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request, cookies }) => {
	// Check permissions using centralized system
	await checkApiPermission(cookies, 'media:delete');

	try {
		const { url, contentTypes } = await request.json();
		if (!url || !contentTypes) {
			throw error(400, 'URL and collection types are required');
		}

		await moveMediaToTrash(url, contentTypes);
		return json({ success: true });
	} catch (err) {
		const message = `Error moving file to trash: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
