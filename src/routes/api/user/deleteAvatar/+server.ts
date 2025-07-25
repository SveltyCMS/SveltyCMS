/**
 * @file src/routes/api/user/deleteAvatar/+server.ts
 * @description API endpoint for moving a user's avatar image to trash.
 *
 * This module provides functionality to:
 * - Move the current avatar image for a user to the trash folder, within the correct tenant.
 * - Update the user's profile to remove the avatar URL.
 *
 * Features:
 * - **Two-Level Permission System**: Users can delete their own avatar, admins can delete any user's avatar within their tenant.
 * - User profile update to remove avatar reference
 * - Error handling and comprehensive logging
 *
 * Usage:
 * DELETE /api/user/deleteAvatar
 * Body: JSON object with optional 'userId' (defaults to current user)
 */

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { privateEnv } from '@root/config/private';

// Auth and permission helpers
import { auth } from '@src/databases/db';
import { checkApiPermission } from '@api/permissions'; // Import static roles for fallback

// System logger
import { logger } from '@utils/logger.svelte';

// Media storage
import { moveMediaToTrash } from '@utils/media/mediaUtils';

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const { user: currentUser, tenantId } = locals;
	try {
		if (!currentUser) {
			throw error(401, 'Unauthorized');
		}
		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		} // Parse request body to get optional target user ID

		let targetUserId = currentUser._id; // Default to self
		try {
			const body = await request.json();
			if (body.userId) {
				targetUserId = body.userId;
			}
		} catch {
			// If no body or invalid JSON, use default (self)
		} // **TWO-LEVEL PERMISSION SYSTEM**: Check if user is deleting their own avatar or has admin permissions

		const isEditingSelf = currentUser._id === targetUserId;
		let hasPermission = false;

		if (isEditingSelf) {
			// Users can always delete their own avatar
			hasPermission = true;
		} else {
			// To delete another user's avatar, need admin permissions
			const permissionResult = await checkApiPermission(currentUser, {
				resource: 'users',
				action: 'write'
			});
			hasPermission = permissionResult.hasPermission;
		}

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to delete avatar', {
				requestedBy: currentUser?._id,
				targetUserId: targetUserId,
				tenantId
			});
			throw error(403, "Forbidden: You do not have permission to delete this user's avatar.");
		} // Ensure the authentication system is initialized

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		// Fetch the user, ensuring they belong to the current tenant.
		const user = await auth.getUserById(targetUserId, tenantId);

		if (!user) {
			throw error(404, 'User not found');
		}

		if (user.avatar) {
			try {
				// Pass tenantId to correctly locate the file in a tenant-specific directory
				await moveMediaToTrash(user.avatar, tenantId);
				logger.info('Avatar moved to trash successfully', { userId: user._id, avatar: user.avatar, deletedBy: currentUser._id, tenantId });
			} catch (moveError) {
				if (moveError.message.includes('ENOENT')) {
					logger.warn('Avatar file not found, but proceeding to remove it from user profile.', {
						userId: user._id,
						avatar: user.avatar,
						error: moveError.message
					});
				} else {
					logger.error(`Failed to move avatar file to trash: ${moveError.message}`, { userId: user._id });
					throw error(500, `Failed to move avatar to trash: ${moveError.message}`);
				}
			}
		} else {
			logger.info('No avatar to move to trash for user.', { userId: user._id, tenantId });
			return json({ success: true, message: 'No avatar to remove.' });
		} // Remove the avatar URL from the user's profile.

		await auth.updateUserAttributes(targetUserId, { avatar: null }, tenantId);
		logger.info('User avatar attribute removed from profile.', { userId: targetUserId, removedBy: currentUser._id, tenantId });

		return json({ success: true, message: 'Avatar removed successfully' });
	} catch (err) {
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'Internal Server Error';

		logger.error('Error in deleteAvatar API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
			tenantId: locals.tenantId,
			status
		});

		return json(
			{
				success: false,
				message: status === 500 ? 'Internal Server Error' : message
			},
			{ status }
		);
	}
};
