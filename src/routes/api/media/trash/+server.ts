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

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// Permission checking

// Auth
import { auth } from '@src/databases/db';

// Media Processing
import { moveMediaToTrash } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals; // Check permissions for media deletion/trash operations
	const permissionResult = await checkApiPermission(user, {
		resource: 'media',
		action: 'delete'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized media trash operation attempt', {
			userId: user?._id,
			tenantId,
			error: permissionResult.error
		});
		return json(
			{
				error: permissionResult.error || 'Forbidden'
			},
			{ status: permissionResult.error?.includes('Authentication') ? 401 : 403 }
		);
	}

	if (!auth) {
		logger.error('Auth service is not initialized');
		throw error(500, 'Auth service not available');
	}

	if (privateEnv.MULTI_TENANT && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}

	try {
		const { url, contentTypes } = await request.json();
		if (!url || !contentTypes) {
			throw error(400, 'URL and collection types are required');
		}

		// Move media to trash
		await moveMediaToTrash(url);

		logger.info('Media file moved to trash successfully', { url, userId: user?._id, tenantId });
		return json({ success: true });
	} catch (err) {
		const message = `Error moving file to trash: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { tenantId });
		throw error(500, message);
	}
};
