/**
 * @file src/routes/api/media/exists/+server.ts
 * @description
 * API endpoint for checking the existence of a media file.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { checkApiPermission } from '@api/permissions';

// Media
import { fileExists } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ url, cookies }) => {
	// Check permissions using centralized system
	await checkApiPermission(cookies, 'media:read');

	try {
		const fileUrl = url.searchParams.get('url');
		if (!fileUrl) {
			throw error(400, 'URL parameter is required');
		}

		const exists = await fileExists(fileUrl);
		return json({ exists });
	} catch (err) {
		const message = `Error checking file existence: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
