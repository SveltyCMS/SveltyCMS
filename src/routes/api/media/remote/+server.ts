/**
 * @file src/routes/api/media/remote/+server.ts
 * @description
 * API endpoint for saving remote media files to the current tenant's storage.
 *
 * @example POST /api/media/remote
 *
 * Features:
 * - Secure, granular access control per operation.
 * - Multi-Tenant Safe: Saves files to the correct tenant's storage.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { privateEnv } from '@root/config/private';

// Auth
import { saveRemoteMedia } from '@utils/media/mediaStorage';

// System Logger
import { logger } from '@utils/logger.svelte';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	if (!user) {
		logger.warn('Unauthorized: No user session found during remote media save');
		throw error(401, 'Unauthorized');
	}

	if (privateEnv.MULTI_TENANT && !tenantId) {
		logger.error('Tenant ID is missing in a multi-tenant setup.');
		throw error(400, 'Could not identify the tenant for this operation.');
	}

	try {
		const { fileUrl, contentTypes } = await request.json();
		if (!fileUrl || !contentTypes) {
			throw error(400, 'File URL and collection types are required');
		}

		// Pass tenantId to ensure the remote media is saved to the correct tenant's storage
		const result = await saveRemoteMedia(fileUrl, contentTypes, user._id.toString(), tenantId);

		logger.info('Remote media saved successfully', { fileUrl, userId: user._id, tenantId });
		return json({ success: true, ...result });
	} catch (err) {
		const message = `Error saving remote media: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { userId: user._id, tenantId });
		throw error(500, message);
	}
};
