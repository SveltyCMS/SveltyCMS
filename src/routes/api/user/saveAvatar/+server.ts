/**
 * @file src/routes/api/user/saveAvatar/+server.ts
 * @description API endpoint for saving a user's avatar image.
 *
 * This module provides functionality to:
 * - Save a new avatar image for a user
 * - Update the user's profile with the new avatar URL
 *
 * Features:
 * - File upload handling
 * - Avatar image processing and storage
 * - User profile update
 * - Permission checking
 * - Error handling and logging
 *
 * Usage:
 * POST /api/user/saveAvatar
 * Body: FormData with 'avatar' file
 *
 * Note: This endpoint is secured with appropriate authentication and authorization.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { checkUserPermission } from '@src/auth/permissionCheck';

// System logger
import { logger } from '@utils/logger';

// Media storage
import { saveAvatarImage } from '@utils/media/mediaStorage';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if the user has permission to update their avatar
		const { hasPermission } = await checkUserPermission(locals.user, {
			contextId: 'user/profile',
			name: 'Update Avatar',
			action: 'update',
			contextType: 'user'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to update avatar');
		}

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const formData = await request.formData();
		const avatarFile = formData.get('avatar') as File | null;

		if (!avatarFile) {
			throw error(400, 'No avatar file provided');
		}

		// Save the avatar image
		const avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
		// Update the user's profile with the new avatar URL
		await auth.updateUserAttributes(locals.user._id, { avatar: avatarUrl });
		logger.info('Avatar saved successfully', { userId: locals.user.id });

		return json({
			success: true,
			message: 'Avatar saved successfully',
			avatarUrl
		});
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		logger.error(`Error in saveAvatar API: ${err.message}`);
		return json({ success: false, message: err.message }, { status: 500 });
	}
};
