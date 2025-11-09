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
import { getPrivateSettingSync } from '@src/services/settingsService';

// Media Service
import { MediaService } from '@src/services/MediaService';
import type { MediaAccess } from '@utils/media/mediaModels';
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.server';

// Helper function to get MediaService instance
function getMediaService(): MediaService {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	try {
		const service = new MediaService(dbAdapter);
		return service;
	} catch (err) {
		const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw new Error(message);
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	if (!user) {
		logger.warn('Unauthorized: No user session found during remote media save');
		throw error(401, 'Unauthorized');
	}

	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		logger.error('Tenant ID is missing in a multi-tenant setup.');
		throw error(400, 'Could not identify the tenant for this operation.');
	}

	try {
		const { fileUrl, access = 'public', basePath } = await request.json();
		if (!fileUrl) {
			throw error(400, 'File URL is required');
		}

		// Validate access type
		const validAccess: MediaAccess = ['public', 'private', 'protected'].includes(access) ? access : 'public';

		// Determine base path (use tenantId if multi-tenant, otherwise use provided or 'global')
		const mediaBasePath = tenantId || basePath || 'global';

		// Initialize MediaService and save remote media
		const mediaService = getMediaService();
		const result = await mediaService.saveRemoteMedia(fileUrl, user._id.toString(), validAccess, mediaBasePath);

		logger.info('Remote media saved successfully', { fileUrl, userId: user._id, tenantId, access: validAccess });
		return json({ success: true, media: result });
	} catch (err) {
		const message = `Error saving remote media: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { userId: user._id, tenantId });
		throw error(500, message);
	}
};
