/**
 * @file src/routes/api/setup/reset/+server.ts
 * @description API endpoint to reset the setup by deleting the config file.
 *
 * Features:
 * - **Cache Invalidation:** Explicitly invalidates the `isSetupComplete` cache so the app reacts immediately.
 * - **Idempotency:** Handles 'ENOENT' (file missing) as success, preventing errors if already reset.
 * - **Consistent Imports:** Uses namespace imports for `fs` and `path`.
 * - **Security:** Only accessible when:
 *   1. User is authenticated as admin, OR
 *   2. System is in FAILED state (database unavailable)
 */

import { json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@utils/logger.server';
import { invalidateSetupCache } from '@utils/setupCheck';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	try {
		// Security check: Only allow reset if user is admin OR system is in failed state
		const { getSystemState } = await import('@src/stores/system/state');
		const systemState = getSystemState();

		const isAdmin = locals.user?.role === 'admin';
		const isSystemFailed = systemState.overallState === 'FAILED';

		const isTestMode = process.env.TEST_MODE === 'true';

		if (!isAdmin && !isSystemFailed && !isTestMode) {
			logger.warn('Unauthorized setup reset attempt', {
				userRole: locals.user?.role,
				systemState: systemState.overallState
			});
			return json(
				{
					success: false,
					error: 'Unauthorized',
					message: 'You do not have permission to reset the setup.'
				},
				{ status: 403 }
			);
		}

		// Delete config file
		const configPath = path.join(process.cwd(), 'config', process.env.TEST_MODE ? 'private.test.ts' : 'private.ts');

		try {
			await fs.unlink(configPath);
			logger.info('Setup reset: config/private.ts deleted successfully', {
				by: locals.user?.username || 'system'
			});
		} catch (fsError: any) {
			// If file doesn't exist, we consider the reset successful (idempotent)
			if (fsError.code !== 'ENOENT') {
				throw fsError;
			}
			logger.debug('Setup reset: config file already missing, proceeding with cache clear');
		}

		// CRITICAL: Invalidate the global setup cache and DB config cache
		// Passing 'true' tells the utility to also clear the private DB config cache
		invalidateSetupCache(true);

		return json({
			success: true,
			message: 'Setup has been reset. Redirecting to setup wizard...'
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Failed to reset setup:', errorMessage);

		return json(
			{
				success: false,
				error: errorMessage,
				message: 'Failed to reset setup. Check server logs.'
			},
			{ status: 500 }
		);
	}
};
