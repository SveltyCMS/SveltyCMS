/**
 * @file src/routes/api/system/preview-secret/+server.ts
 * @description Manage the PREVIEW_SECRET used for live preview handshake.
 *
 * GET  — Retrieve the current preview secret (admin only)
 * POST — Generate a new random preview secret and store it (admin only)
 */

import { randomBytes } from 'node:crypto';
import { dbAdapter } from '@src/databases/db';
import { getPrivateSettingSync, invalidateSettingsCache } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

export const GET = apiHandler(async ({ locals }) => {
	if (!locals.user) {
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}
	if (!locals.isAdmin) {
		throw new AppError('Admin access required', 403, 'FORBIDDEN');
	}

	const secret = getPrivateSettingSync('PREVIEW_SECRET') || '';
	return json({ secret });
});

export const POST = apiHandler(async ({ locals }) => {
	if (!locals.user) {
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}
	if (!locals.isAdmin) {
		throw new AppError('Admin access required', 403, 'FORBIDDEN');
	}

	const secret = randomBytes(32).toString('hex');

	if (!dbAdapter?.system.preferences) {
		throw new AppError('Database adapter not available', 503, 'DB_UNAVAILABLE');
	}

	await dbAdapter.system.preferences.set('PREVIEW_SECRET', secret, 'system');
	invalidateSettingsCache();

	logger.info('Preview secret regenerated', { userId: locals.user._id });

	return json({ secret });
});
