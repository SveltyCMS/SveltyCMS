/**
 * @file src/routes/(app)/imageEditor/+page.server.ts
 * @description Server-side logic for Image Editor page authentication and authorization.
 *
 * Handles user authentication and role-based access control for the Image Editor page.
 * Redirects unauthenticated users to the login page and restricts access based on user permissions.
 *
 * Responsibilities:
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Checks user permissions for media/image editing access.
 * - Returns user data if authentication and authorization are successful.
 * - Handles cases of unauthenticated users or insufficient permissions.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// System Logger
import { logger } from '@utils/logger.server';
import { MediaService } from '@src/services/MediaService.server';
import { dbAdapter } from '@src/databases/db';

export const load: PageServerLoad = async ({ locals, url }) => {
	try {
		const { user, isAdmin, roles: tenantRoles } = locals;

		// If validation fails, redirect the user to the login page
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.trace(`User authenticated successfully for image editor: ${user._id}`);

		// Check user permission for image editor/media editing using cached tenantRoles from locals
		const hasImageEditorPermission = isAdmin || tenantRoles.some((role) => role.permissions?.some((p) => p === 'media:edit' || p === 'media:write'));

		if (!hasImageEditorPermission) {
			const message = `User ${user._id} does not have permission to access image editor`;
			logger.warn(message);
			throw error(403, 'Insufficient permissions to access image editor');
		}

		// Fetch media if mediaId is provided
		const mediaId = url.searchParams.get('mediaId');
		let mediaItem = null;

		if (mediaId) {
			try {
				if (!dbAdapter) {
					logger.error('Database adapter is not initialized');
					throw error(500, 'Internal Server Error');
				}
				const mediaService = new MediaService(dbAdapter);
				// Get user roles for permission check
				const userRoleNames = tenantRoles.map((r) => r.name);
				logger.debug(`Fetching media item ${mediaId} for user roles:`, userRoleNames);
				mediaItem = await mediaService.getMedia(mediaId, user, tenantRoles);
				logger.debug('Media item fetched:', mediaItem ? 'Found' : 'Not Found');
			} catch (err) {
				logger.warn(`Failed to fetch media item ${mediaId} for editor:`, err);
				// We don't throw here to allow the editor to load empty if media is not found/accessible
				// But maybe we should notify the user?
			}
		}

		// Return user data
		const { _id, ...rest } = user;
		const responseData = {
			user: {
				_id: _id.toString(),
				...rest
			},
			isAdmin,
			media: mediaItem ? JSON.parse(JSON.stringify(mediaItem)) : null // Serialize for client
		};
		logger.debug('Returning load data:', { hasMedia: !!responseData.media, mediaUrl: responseData.media?.url });
		return responseData;
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			// This is likely a redirect or an error we've already handled
			throw err;
		}
		const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
