/**
 * @file src/routes/api/user/saveAvatar/+server.ts
 * @description API endpoint for saving user avatars.
 *
 * This module provides functionality to:
 * - Save a new avatar image for an authenticated user
 * - Update the user's profile with the new avatar URL
 *
 * Features:
 * - Session-based authentication
 * - File upload handling
 * - Avatar image saving
 * - User profile update
 * - Error handling and logging
 *
 * Usage:
 * POST /api/user/saveAvatar
 * Body: FormData with 'avatar' file
 * Requires: Valid session cookie
 *
 * Note: Ensure proper file type and size validation before saving the avatar.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Import logger
import logger from '@src/utils/logger';

// Import saveAvatarImage function
import { saveAvatarImage } from '@src/utils/media/mediaStorage';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const session_id = cookies.get(SESSION_COOKIE_NAME);

		if (!session_id) {
			logger.warn('Avatar save attempt without session cookie');
			return new Response(JSON.stringify({ success: false, message: 'Authentication required' }), { status: 401 });
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const user = await auth.validateSession({ session_id });

		if (!user) {
			logger.warn(`Invalid session for avatar save attempt: ${session_id}`);
			return new Response(JSON.stringify({ success: false, message: 'Invalid session' }), { status: 403 });
		}

		const data = await request.formData();
		const avatarFile = data.get('avatar') as File | null;

		if (!avatarFile) {
			logger.warn('No avatar file provided in the request');
			return new Response(JSON.stringify({ success: false, message: 'No avatar file provided' }), { status: 400 });
		}

		const avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
		await auth.updateUserAttributes(user.id, { avatar: avatarUrl });

		logger.info(`Avatar saved successfully for user ID: ${user.id}`);
		return new Response(JSON.stringify({ success: true, url: avatarUrl }), { status: 200 });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Failed to save avatar: ${errorMessage}`);
		return new Response(JSON.stringify({ success: false, message: 'Failed to save avatar' }), { status: 500 });
	}
};
