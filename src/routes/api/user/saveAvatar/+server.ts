/**
 * @file src/routes/api/user/saveAvatar/		// Check if the user has permission to update their avatar
		const hasPermission = hasPermissionByAction(
			locals.user, 
			'update', 
			'user', 
			'user/profile'
		);

		if (!hasPermission) {
			logger.error('Unauthorized to update avatar', { userId: locals.user._id });
			throw error(403, 'Unauthorized to update avatar');
		}* @description API endpoint for saving a user's avatar image.
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
import { hasPermissionByAction } from '@src/auth/permissions';

// System logger
import { logger } from '@utils/logger.svelte';

// Media storage
import { saveAvatarImage } from '@utils/media/mediaStorage';
import { getCacheStore } from '@src/cacheStore/index.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if the user has permission to update their avatar
		const hasPermission = hasPermissionByAction(
			locals.user,
			'update',
			'user',
			'user/profile'
		);

		if (!hasPermission) {
			logger.error('Unauthorized to update avatar', { userId: locals.user._id });
			throw error(403, 'Unauthorized to update avatar');
		}

		// Ensure the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}

		const formData = await request.formData();
		const avatarFile = formData.get('avatar') as File | null;

		if (!avatarFile) {
			logger.error('No avatar file provided', { userId: locals.user._id });
			throw error(400, 'No avatar file provided');
		}

		// Validate file type
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
		if (!allowedTypes.includes(avatarFile.type)) {
			logger.error('Invalid file type', {
				userId: locals.user._id,
				fileType: avatarFile.type
			});
			throw error(400, 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
		}

		// Before saving new avatar, move old avatar to trash if it exists
		const currentUser = await auth.getUserById(locals.user._id);
		if (currentUser && currentUser.avatar) {
			try {
				const { moveMediaToTrash } = await import('@utils/media/mediaStorage');
				await moveMediaToTrash(currentUser.avatar);
				logger.info('Old avatar moved to trash', { userId: locals.user._id, oldAvatar: currentUser.avatar });
			} catch (err) {
				logger.warn('Failed to move old avatar to trash', { userId: locals.user._id, error: err });
			}
		}

		// Save the avatar image
		const avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
		// Update the user's profile with the new avatar URL
		await auth.updateUserAttributes(locals.user._id, { avatar: avatarUrl });

		const session_id = locals.session_id;

		const user = await auth.validateSession(session_id);
		locals.user = user;
		const cacheStore = getCacheStore();
		cacheStore.set(session_id, user, new Date(Date.now() + 3600 * 1000));
		logger.info('Avatar saved successfully', { userId: locals.user.id });

		return json({
			success: true,
			message: 'Avatar saved successfully',
			avatarUrl
		});
	} catch (err) {
		const isHttpError = err instanceof Error && typeof (err as { status?: unknown }).status === 'number';
		const status = isHttpError ? (err as { status: number }).status : 500;
		const message = err instanceof Error ? err.message : 'Internal Server Error';

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
