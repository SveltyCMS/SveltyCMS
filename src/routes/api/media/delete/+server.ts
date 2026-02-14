/**
 * @file src/routes/api/media/delete/+server.ts
 * @description
 * API endpoint for deleting a media file within the current tenant.
 *
 * @example DELETE /api/media/delete
 *
 * Features:
 * - Secure, granular access control per operation
 * - Automatic metadata updates on modification (updatedBy)
 * - ModifyRequest support for widget-based data processing
 * - Status-based access control for non-admin users
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Permissions

// Media
import { deleteFile } from '@utils/media/mediaStorage.server';

// System Logger
import { logger } from '@utils/logger.server';

import { dbAdapter } from '@src/databases/db';
import type { MediaItem } from '@src/databases/dbInterface';

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId, roles } = locals;
	// Authentication is handled by hooks.server.ts - user presence confirms access

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');
		throw error(500, 'Database service not available');
	}

	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}

	try {
		const { url } = await request.json();
		if (!url) {
			throw error(400, 'URL is required');
		}

		// 1. Find the media item to check ownership
		const cleanPath = url.replace(/^\/files\//, '').replace(/^files\//, '');
		const findResult = await dbAdapter.crud.findMany<MediaItem>('MediaItem', {
			path: cleanPath
		});

		if (!findResult.success || !findResult.data || findResult.data.length === 0) {
			logger.warn(`Media item not found for deletion: ${url}`);
			throw error(404, 'Media not found');
		}

		const mediaItem = findResult.data[0];

		// 2. Enforce Access Control
		const isAdmin = roles?.some((r) => r.isAdmin);
		const ownerId = mediaItem.createdBy || (mediaItem as any).user;
		const isOwner = ownerId === user._id;

		if (!isAdmin && !isOwner) {
			logger.warn(`Access denied for delete: User ${user._id} attempted to delete media ${mediaItem._id} owned by ${ownerId}`);
			throw error(403, 'Access denied: You can only delete your own uploads.');
		}

		// 3. Delete the file
		await deleteFile(url);

		logger.info('File deleted successfully', {
			url,
			user: user?.email || 'unknown',
			tenantId
		});

		return json({ success: true });
	} catch (err) {
		// Re-throw HTTP errors as-is (e.g., 400 for missing URL)
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const message = `Error deleting file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { user: user?.email || 'unknown', tenantId });
		throw error(500, message);
	}
};
