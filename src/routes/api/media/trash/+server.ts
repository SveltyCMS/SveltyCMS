/**
 * @file src/routes/api/media/trash/+server.ts
 * @description
 * API endpoint for changing the access of a media file
 *
 * @example POST /api/media/trash
 *
 * Features:
 * - Secure, granular access control per operation
 * - Automatic metadata updates on modification (updatedBy)
 * - ModifyRequest support for widget-based data processing
 * - Status-based access control for non-admin users
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// Permission checking
import { checkApiPermission } from '@api/permissions';

// Auth
import { auth } from '@src/databases/db';

// Media Processing
import { moveMediaToTrash } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check permissions for media deletion/trash operations
	const permissionResult = await checkApiPermission(locals.user, {
		resource: 'media',
		action: 'delete'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized media trash operation attempt', {
			userId: locals.user?._id,
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

	try {
		const { url, contentTypes } = await request.json();
		if (!url || !contentTypes) {
			throw error(400, 'URL and collection types are required');
		}

		await moveMediaToTrash(url, contentTypes);
		return json({ success: true });
	} catch (err) {
		const message = `Error moving file to trash: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
