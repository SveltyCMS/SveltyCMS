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
 * - **Defense in Depth**: Specific permission checking within the endpoint.
 * - Error handling and logging
 *
 * Usage:
 * POST /api/user/saveAvatar
 * Body: FormData with 'avatar' file
 */

import { error, json, type HttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Auth and permission helpers
import { auth } from '@src/databases/db';
import { hasPermissionByAction } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// System logger
import { logger } from '@utils/logger.svelte';

// Media storage
import { saveAvatarImage } from '@utils/media/mediaStorage';
import { getCacheStore } from '@src/cacheStore/index.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if user is updating their own avatar or has admin permissions
		const formData = await request.formData();
		const targetUserId = (formData.get('userId') as string) || locals.user._id; // Default to self if no userId provided
		const isEditingSelf = locals.user._id === targetUserId;
		let hasPermission = false;

		if (isEditingSelf) {
			// Users can always update their own avatar
			hasPermission = true;
		} else {
			// To update another user's avatar, need admin permissions
			hasPermission = hasPermissionByAction(locals.user, 'update', 'user', 'any', locals.roles && locals.roles.length > 0 ? locals.roles : roles);
		}

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to update avatar', {
				requestedBy: locals.user?._id,
				targetUserId: targetUserId
			});
			throw error(403, "Forbidden: You do not have permission to update this user's avatar.");
		}

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		const avatarFile = formData.get('avatar') as File | null;

		if (!avatarFile) {
			logger.error('No avatar file provided', { userId: locals.user._id, targetUserId });
			throw error(400, 'No avatar file provided');
		}

		// Validate file type on the server as a secondary check
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
		if (!allowedTypes.includes(avatarFile.type)) {
			logger.error('Invalid file type for avatar', {
				userId: locals.user._id,
				targetUserId,
				fileType: avatarFile.type
			});
			throw error(400, 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
		}

		// Before saving a new avatar, move the old one to trash if it exists.
		const currentUser = await auth.getUserById(targetUserId);
		if (currentUser && currentUser.avatar) {
			try {
				const { moveMediaToTrash } = await import('@utils/media/mediaStorage');
				await moveMediaToTrash(currentUser.avatar);
				logger.info('Old avatar moved to trash', { userId: targetUserId, oldAvatar: currentUser.avatar });
			} catch (err) {
				// Log the error but don't block the upload if moving the old file fails.
				logger.warn('Failed to move old avatar to trash. Proceeding with new avatar upload.', { userId: targetUserId, error: err });
			}
		}

		// Save the new avatar image and update the user's profile
		const avatarUrl = await saveAvatarImage(avatarFile);
		await auth.updateUserAttributes(targetUserId, { avatar: avatarUrl });

		// Invalidate any cached session data to reflect the change immediately.
		const session_id = locals.session_id;
		if (session_id) {
			const user = await auth.validateSession(session_id);
			const cacheStore = getCacheStore();
			await cacheStore.set(session_id, user, new Date(Date.now() + 3600 * 1000));
		}

		logger.info('Avatar saved successfully', { userId: targetUserId, avatarUrl });

		return json({
			success: true,
			message: 'Avatar saved successfully',
			avatarUrl
		});
	} catch (err) {
		const httpError = err as HttpError;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'Internal Server Error';

		logger.error('Error in saveAvatar API:', {
			error: message,
			stack: err instanceof Error ? err.stack : undefined,
			userId: locals.user?._id,
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
