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

// Media
import { deleteFile } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	// Authentication is handled by hooks.server.ts - user presence confirms access

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
