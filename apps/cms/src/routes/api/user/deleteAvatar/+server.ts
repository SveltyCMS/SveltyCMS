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
import { getPrivateSettingSync } from '@src/services/settingsService';

// Auth and permission helpers
import { auth } from '@src/databases/db';

// System logger
import { logger } from '@utils/logger.server';

// Media storage
import { moveMediaToTrash } from '@utils/media/mediaStorage.server';

// Cache service
import { cacheService } from '@src/databases/CacheService';

// Cache service
import { cacheService } from '@src/databases/CacheService';

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const { user: currentUser, tenantId } = locals;
	try {
		if (!currentUser) {
			throw error(401, 'Unauthorized');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		} // Parse request body to get optional target user ID and avatar URL

		let targetUserId = currentUser._id; // Default to self
		let avatarUrlToDelete: string | null = null;

		try {
			const body = await request.json();
			if (body.userId) {
				targetUserId = body.userId;
			}
			if (body.avatarUrl) {
				avatarUrlToDelete = body.avatarUrl;
			}
		} catch {
			// If no body or invalid JSON, use default (self)
		} // **TWO-LEVEL PERMISSION SYSTEM**: Check if user is deleting their own avatar or has admin permissions
		// Role-based access is handled by hooks.server.ts, we just need to check if editing self vs others

		const isEditingSelf = currentUser._id === targetUserId;

		// In multi-tenant mode, ensure target user is in same tenant when editing others
		if (getPrivateSettingSync('MULTI_TENANT') && !isEditingSelf) {
			// Ensure the authentication system is initialized
			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error: Auth system not initialized');
			}

			const targetUser = await auth.getUserById(targetUserId, tenantId);
			if (!targetUser || targetUser.tenantId !== tenantId) {
				logger.warn('Admin attempted to delete avatar for user outside their tenant', {
					adminId: currentUser._id,
					targetUserId,
					tenantId
				});
				throw error(403, 'Forbidden: You can only delete avatars for users within your own tenant.');
			}
		}

		// Ensure the authentication system is initialized

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		// Fetch the user, ensuring they belong to the current tenant.
		const user = await auth.getUserById(targetUserId, tenantId);

		if (!user) {
			throw error(404, 'User not found');
		}

		// Use avatar URL from request body if provided, otherwise use user.avatar from DB
		const avatarToDelete = avatarUrlToDelete || user.avatar;

		if (avatarToDelete && avatarToDelete !== '/Default_User.svg') {
			try {
				// Move avatar to trash
				await moveMediaToTrash(avatarToDelete);
				logger.info('Avatar moved to trash successfully', { userId: user._id, avatar: avatarToDelete, deletedBy: currentUser._id, tenantId });
			} catch (moveError) {
				logger.error('Error in moveMediaToTrash', {
					userId: user._id,
					avatar: avatarToDelete,
					error: moveError,
					errorMessage: moveError instanceof Error ? moveError.message : String(moveError),
					errorStack: moveError instanceof Error ? moveError.stack : undefined
				});
				if (moveError instanceof Error && moveError.message.includes('ENOENT')) {
					logger.warn('Avatar file not found, but proceeding to remove it from user profile.', {
						userId: user._id,
						avatar: avatarToDelete,
						error: moveError.message
					});
				} else {
					const errorMsg = moveError instanceof Error ? moveError.message : String(moveError);
					logger.error(`Failed to move avatar file to trash: ${errorMsg}`, { userId: user._id });
					throw error(500, `Failed to move avatar to trash: ${errorMsg}`);
				}
			}
		} else {
			logger.info('No avatar to move to trash for user.', { userId: user._id, tenantId });
			return json({ success: true, message: 'No avatar to remove.' });
		} // Remove the avatar URL from the user's profile.

		await auth.updateUserAttributes(targetUserId, { avatar: undefined }, tenantId);
		logger.info('User avatar attribute removed from profile.', { userId: targetUserId, removedBy: currentUser._id, tenantId });

		// Invalidate cache for users list so UI updates
		try {
			// Invalidate all user-related caches for all users (since admin user list includes all users)
			await cacheService.clearByPattern('api:*:/api/admin/users*', tenantId);
			logger.debug('Cache invalidated for users list after avatar deletion');
		} catch (cacheError) {
			// Log but don't fail the request if cache invalidation fails
			logger.warn('Failed to invalidate cache after avatar deletion', { error: cacheError });
		}

		// Return normalized default avatar to update UI and allow client refresh
		const defaultUrl = '/Default_User.svg';
		return json({ success: true, message: 'Avatar removed successfully', avatarUrl: defaultUrl });
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
