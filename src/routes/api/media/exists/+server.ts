/**
 * @file src/routes/api/media/exists/+server.ts
 * @description
 * API endpoint for checking the existence of a media file.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Media
import { fileExists } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const session_id = cookies.get(SESSION_COOKIE_NAME);
	if (!session_id) {
		logger.warn('No session ID found during file check');
		throw error(401, 'Unauthorized');
	}

	if (!auth) {
		logger.error('Auth service is not initialized');
		throw error(500, 'Auth service not available');
	}

	try {
		const user = await auth.validateSession({ session_id });
		if (!user) {
			logger.warn('Invalid session during file check');
			throw error(401, 'Unauthorized');
		}

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
