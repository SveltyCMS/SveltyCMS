/**
 * @file src/routes/api/media/get/+server.ts
 * @description
 * API endpoint for retrieving media files.
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Media
import { getFile } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = locals.user;

	if (!user) {
		logger.warn('No authenticated user found during media retrieval');
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const fileUrl = url.searchParams.get('url');
		if (!fileUrl) {
			throw error(400, 'URL parameter is required');
		}

		const buffer = await getFile(fileUrl);

		return new Response(buffer, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="${fileUrl.split('/').pop()}"`,
				'Content-Length': buffer.length.toString()
			}
		});
	} catch (err) {
		const message = `Error retrieving file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
