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

// Config
import { getPrivateSettingSync } from '@src/services/settingsService';

// Auth and permission helpers
import { auth } from '@src/databases/db';

// System logger
import { logger } from '@utils/logger.svelte';

// Media storage
import { cacheService } from '@src/databases/CacheService';
import { saveAvatarImage } from '@utils/media/mediaStorage';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if user is updating their own avatar or has admin permissions
		const formData = await request.formData();
		const targetUserId = (formData.get('userId') as string) || (formData.get('user_id') as string) || locals.user._id; // Default to self if no userId provided

		// Role-based access is handled by hooks.server.ts
		const isEditingSelf = targetUserId === locals.user._id;

		// In multi-tenant mode, ensure target user is in same tenant when editing others
		if (getPrivateSettingSync('MULTI_TENANT') && !isEditingSelf) {
			const tenantId = locals.tenantId;
			const targetUser = await auth.getUserById(targetUserId, tenantId);
			if (!targetUser || targetUser.tenantId !== tenantId) {
				logger.warn('Admin attempted to update avatar for user outside their tenant', {
					adminId: locals.user._id,
					targetUserId,
					tenantId
				});
				return json(
					{
						error: 'Forbidden: You can only update avatars for users within your own tenant.'
					},
					{ status: 403 }
				);
			}
		}

		const avatarFile = formData.get('avatar') as File | null;

		if (!avatarFile) {
			logger.error('No avatar file provided', { userId: locals.user._id, targetUserId });
			throw error(400, 'No avatar file provided');
		}

		// Validate file type on the server as a secondary check
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'];
		if (!allowedTypes.includes(avatarFile.type)) {
			logger.error('Invalid file type for avatar', {
				userId: locals.user._id,
				targetUserId,
				fileType: avatarFile.type
			});
			throw error(400, 'Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.');
		}

		// Before saving a new avatar, move the old one to trash if it exists.
		const currentUser = await auth.getUserById(targetUserId);
		if (currentUser && currentUser.avatar) {
			try {
				const { moveMediaToTrash } = await import('@utils/media/mediaStorage');
				// Clean the avatar path to remove any duplicate media folder prefixes
				let avatarPath = currentUser.avatar;
				if (avatarPath.startsWith('/')) {
					avatarPath = avatarPath.substring(1);
				}
				if (avatarPath.startsWith('mediaFiles/')) {
					avatarPath = avatarPath.substring('mediaFiles/'.length);
				}
				await moveMediaToTrash(avatarPath);
				logger.info('Old avatar moved to trash', { userId: targetUserId, oldAvatar: avatarPath });
			} catch (err) {
				// Log the error but don't block the upload if moving the old file fails.
				logger.warn('Failed to move old avatar to trash. Proceeding with new avatar upload.', { userId: targetUserId, error: err });
			}
		}

		// Save the new avatar image and update the user's profile
		const avatarUrl = await saveAvatarImage(avatarFile, targetUserId);

		// Persist DB with raw media path (typically /mediaFiles/avatars/..)
		await auth.updateUserAttributes(targetUserId, { avatar: avatarUrl }, locals.tenantId);

		// Normalize URL for client consumption to route through /files
		const mediaFolder = getPrivateSettingSync('MEDIA_FOLDER') || 'mediaFiles';
		const normalizedAvatarUrl = avatarUrl.replace(/^https?:\/\/[^/]+/i, '').replace(new RegExp(`^\\/?(?:${mediaFolder}|mediaFiles)\\/`), '/files/');

		// Invalidate any cached session data to reflect the change immediately.
		const session_id = locals.session_id;
		if (session_id) {
			const user = await auth.validateSession(session_id);
			await cacheService.set(session_id, { user, timestamp: Date.now() }, 3600);
		}

		logger.info('Avatar saved successfully', { userId: targetUserId, avatarUrl: normalizedAvatarUrl });

		return json({
			success: true,
			message: 'Avatar saved successfully',
			avatarUrl: normalizedAvatarUrl
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
