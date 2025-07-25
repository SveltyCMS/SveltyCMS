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
import { privateEnv } from '@root/config/private';

// Permissions
import { checkApiPermission } from '@api/permissions';

// Media
import { deleteFile } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals; // Check media delete permissions
	const permissionResult = await checkApiPermission(user, {
		resource: 'media',
		action: 'delete'
	});

	if (!permissionResult.hasPermission) {
		logger.warn('Unauthorized attempt to delete media file', {
			userId: user?._id,
			tenantId,
			error: permissionResult.error
		});
		throw error(permissionResult.error?.includes('Authentication') ? 401 : 403, permissionResult.error || 'Forbidden');
	}

	if (privateEnv.MULTI_TENANT && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}

	try {
		const { url } = await request.json();
		if (!url) {
			throw error(400, 'URL is required');
		}

		// Pass tenantId to ensure the file is deleted from the correct tenant's storage
		await deleteFile(url, tenantId);

		logger.info('File deleted successfully', {
			url,
			user: user?.email || 'unknown',
			tenantId
		});

		return json({ success: true });
	} catch (err) {
		const message = `Error deleting file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { user: user?.email || 'unknown', tenantId });
		throw error(500, message);
	}
};
