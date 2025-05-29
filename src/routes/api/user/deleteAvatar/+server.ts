/**
 * @file src/routes/api/user/deleteAvatar/+server.ts
 * @description API endpoint for moving a user's avatar image to trash.
 *
 * This module provides functionality to:
 * - Move the current avatar image for a user to the trash folder
 * - Update the user's profile to remove the avatar URL
 * - Prepare the avatar for future deletion (after 30 days in trash)
 *
 * Features:
 * - Avatar image moved to trash instead of immediate deletion
 * - User profile update to remove avatar reference
 * - Permission checking to ensure user authorization
 * - Error handling and comprehensive logging
 * - Integration with trash cleanup system for eventual deletion
 *
 * Usage:
 * DELETE /api/user/deleteAvatar
 *
 * Note:
 * - This endpoint is secured with appropriate authentication and authorization.
 * - Actual deletion of the avatar file occurs after 30 days via a separate cleanup process.
 * - The user's profile is immediately updated to reflect the removal of the avatar.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth
import { auth } from '@src/databases/db';
import { checkUserPermission } from '@src/auth/permissions';

// System logger
import { logger } from '@utils/logger.svelte';

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
		const user = await auth.getUserById(locals.user._id);

		if (!user || !user.avatar) {
			throw error(404, 'User or avatar not found');
		}

		if (user.avatar) {
			try {
				await moveMediaToTrash(user.avatar, 'media_images');
				logger.info('Avatar moved to trash successfully', { userId: user._id });
			} catch (moveError) {
				logger.error(`Failed to move avatar to trash: ${moveError.message}`, { userId: user._id });
				// If the file doesn't exist, we'll just log it and continue
				if (!moveError.message.includes('Source file does not exist')) {
					throw error(500, `Failed to move avatar to trash: ${moveError.message}`);
				}
			}
		} else {
			logger.info('No avatar to move to trash', { userId: user._id });
		}

		// Update the user's profile to remove the avatar URL
		await auth.updateUserAttributes(locals.user._id, { avatar: null });
		return json({ success: true, message: 'Avatar removed successfully' });
	} catch (error) {
		console.error('Error deleting avatar:', error);
		return json({ error: 'Failed to delete avatar' }, { status: 500 });
	}
};
