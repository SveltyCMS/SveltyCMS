/**
 * @file src/routes/api/user/deleteAvatar/+server.ts
 * @description API endpoint for deleting a user's avatar.
 *
 * This module provides functionality to:
 * - Authenticate the user based on their session
 * - Delete the user's avatar image from storage
 * - Update the user's profile to remove the avatar reference
 *
 * Features:
 * - Session-based authentication
 * - Avatar image deletion (mocked in this version)
 * - User profile update
 * - Error handling and logging
 *
 * Usage:
 * DELETE /api/user/deleteAvatar
 * Body: JSON object with 'hash' property (image hash to be deleted)
 * Requires: Valid session cookie
 *
 * Note: Ensure proper authentication and authorization checks are in place.
 * The actual image deletion logic should be implemented in the deleteImageModel function.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// System Logger
import logger from '@src/utils/logger';

// Mocked function to delete image model
async function deleteImageModel(hash: string): Promise<boolean> {
	// Replace this with actual database logic to delete an image by hash
	logger.info(`Deleting image with hash: ${hash}`);
	// Example placeholder for actual deletion logic
	return true;
}

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	try {
		const session_id = cookies.get(SESSION_COOKIE_NAME);

		if (!session_id) {
			logger.warn('Avatar delete attempt without session cookie');
			return new Response(JSON.stringify({ message: 'Authentication required' }), { status: 401 });
		}

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const user = await auth.validateSession({ session_id });

		if (!user) {
			logger.warn(`Invalid session for avatar delete attempt: ${session_id}`);
			return new Response(JSON.stringify({ message: 'Invalid session' }), { status: 403 });
		}

		const { hash } = await request.json();

		if (!hash) {
			logger.warn(`Avatar delete attempt without hash for user ID: ${user.id}`);
			return new Response(JSON.stringify({ message: 'Image hash is required' }), { status: 400 });
		}

		const deleteResult = await deleteImageModel(hash);

		if (!deleteResult) {
			logger.error(`Failed to delete avatar image with hash: ${hash} for user ID: ${user.id}`);
			return new Response(JSON.stringify({ message: 'Failed to delete avatar image' }), { status: 500 });
		}

		await auth.updateUserAttributes(user.id, { avatar: undefined });

		logger.info(`Avatar deleted successfully for user ID: ${user.id}`);
		return new Response(JSON.stringify({ success: true, message: 'Avatar deleted successfully' }), { status: 200 });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Failed to delete avatar: ${errorMessage}`);
		return new Response(JSON.stringify({ message: 'Failed to delete avatar' }), { status: 500 });
	}
};
