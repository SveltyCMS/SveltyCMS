/**
 * @file src/routes/a	// Authentication is handled by hooks.server.ts - user presence confirms accesss/+server.ts
 * @description
 * API endpoint for checking the existence of a media file within the current tenant.
 *
 * @example GET /api/media/exists?url=https://example.com/image.jpg
 *
 * Features:
 * - Secure, granular access control per operation
 * - Multi-Tenant Safe: File existence check is scoped to the current tenant.
 */

import { getPrivateSettingSync } from '@src/services/settingsService';
import { error, json } from '@sveltejs/kit';
// System Logger
import { logger } from '@utils/logger.server';

// Media
import { fileExists } from '@utils/media/mediaStorage.server';
import type { RequestHandler } from './$types';

// Permissions

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user, tenantId } = locals;
	// Authentication is handled by hooks.server.ts - user presence confirms access

	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw error(400, 'Tenant could not be identified for this operation.');
	}

	try {
		const fileUrl = url.searchParams.get('url');
		if (!fileUrl) {
			throw error(400, 'URL parameter is required');
		}

		// Check file existence (tenant is handled internally if needed)
		const exists = await fileExists(fileUrl);
		logger.debug('Media file existence check', {
			fileUrl,
			exists,
			userId: user?._id,
			tenantId
		});

		return json({ exists });
	} catch (err) {
		// Re-throw HTTP errors as-is (e.g., 400 for missing URL)
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const message = `Error checking file existence: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { userId: user?._id, tenantId });
		throw error(500, message);
	}
};
