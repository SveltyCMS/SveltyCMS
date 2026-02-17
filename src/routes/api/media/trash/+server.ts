/**
 * @file src/routes/api/media/trash/+server.ts
 * @description
 * API endpoint for moving a media file to the trash within the current tenant.
 *
 * @example POST /api/media/trash
 *
 * Features:
 * - Secure, granular access control per operation
 * - Multi-Tenant Safe: File operations are scoped to the current tenant.
 */

import { dbAdapter } from '@src/databases/db';
import type { MediaItem } from '@src/databases/dbInterface';
import { getPrivateSettingSync } from '@src/services/settingsService';
import { error, json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { moveMediaToTrash } from '@utils/media/mediaStorage.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
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

		if (!(findResult.success && findResult.data) || findResult.data.length === 0) {
			logger.warn(`Media item not found for trash: ${url}`);
			throw error(404, 'Media not found');
		}

		const mediaItem = findResult.data[0];

		// 2. Enforce Access Control
		const isAdmin = roles?.some((r) => r.isAdmin);
		const ownerId = mediaItem.createdBy || (mediaItem as any).user;
		const isOwner = ownerId === user._id;

		if (!(isAdmin || isOwner)) {
			logger.warn(`Access denied for trash: User ${user._id} attempted to trash media ${mediaItem._id} owned by ${ownerId}`);
			throw error(403, 'Access denied: You can only delete your own uploads.');
		}

		// 3. Move media to trash
		await moveMediaToTrash(url);

		logger.info('Media file moved to trash successfully', { url, userId: user?._id, tenantId });
		return json({ success: true });
	} catch (err) {
		// Re-throw HTTP errors as-is (e.g., 400 for missing parameters)
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const message = `Error moving file to trash: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { tenantId });
		throw error(500, message);
	}
};
