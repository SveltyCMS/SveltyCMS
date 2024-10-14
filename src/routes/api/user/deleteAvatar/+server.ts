/**
 * @file src/routes/api/user/deleteAvatar/+server.ts
 * @description API endpoint for deleting a user's avatar image.
 *
 * This module provides functionality to:
 * - Delete the current avatar image for a user
 * - Update the user's profile to remove the avatar URL
 *
 * Features:
 * - Avatar image deletion
 * - User profile update
 * - Permission checking
 * - Error handling and logging
 *
 * Usage:
 * DELETE /api/user/deleteAvatar
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
import { moveMediaToTrash } from '@utils/media/mediaStorage';

export const DELETE: RequestHandler = async ({ locals }) => {
	try {
		// Check if the user has permission to delete their avatar
		const { hasPermission } = await checkUserPermission(locals.user, {
			contextId: 'user/profile',
			name: 'Delete Avatar',
			action: 'update',
			contextType: 'user'
		});

		if (!hasPermission) {
			throw error(403, 'Unauthorized to delete avatar');
		}

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Get the current user's avatar URL
		const user = await auth.getUserById(locals.user.id);
		if (!user || !user.avatar) {
			throw error(404, 'User or avatar not found');
		}

		// Move the avatar to trash
		await moveMediaToTrash(user.avatar, 'media_images');

		// Update the user's profile to remove the avatar URL
		await auth.updateUserAttributes(locals.user.id, { avatar: null });

		logger.info('Avatar deleted successfully', { userId: locals.user.id });
		return json({
			success: true,
			message: 'Avatar deleted successfully'
		});
	} catch (err) {
		logger.error('Error in deleteAvatar API:', err);
		throw error(500, 'Failed to delete avatar');
	}
};
