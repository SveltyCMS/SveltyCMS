// src/routes/(app)/imageEditor/+page.server.ts

import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { publicEnv } from '@root/config/public';
import path from 'path';
import fs from 'fs/promises';
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import logger from '@src/utils/logger';

export const load: PageServerLoad = async ({ params, cookies }) => {
	// Auth check
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Get session ID from cookie
	const session_id = cookies.get(SESSION_COOKIE_NAME);

	if (!session_id) {
		logger.warn('No session ID found, redirecting to login');
		throw redirect(302, `/login`);
	}

	// Validate the user's session
	const user = await auth.validateSession({ session_id });

	if (!user) {
		logger.warn('Invalid session, redirecting to login');
		throw redirect(302, `/login`);
	}

	// Image loading logic
	try {
		const imageName = decodeURIComponent(params.file ?? '');
		const filePath = path.join(publicEnv.MEDIA_FOLDER, imageName);

		// Check if file exists
		await fs.access(filePath);

		// Get file stats
		const stats = await fs.stat(filePath);

		if (stats.isFile()) {
			return {
				user, // Include user data in the return object
				imageData: {
					name: imageName,
					path: filePath,
					size: stats.size,
					lastModified: stats.mtime
				}
			};
		} else {
			throw error(404, 'Not a file');
		}
	} catch (err) {
		logger.error('Error loading file:', err);
		throw error(404, 'File not found');
	}
};
