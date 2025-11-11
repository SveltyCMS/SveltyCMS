/**
 * @file src/routes/api/setup/reset/+server.ts
 * @description API endpoint to reset the setup by deleting the config file
 *
 * This allows recovery when config exists but database is empty.
 * Only accessible when:
 * 1. User is authenticated as admin, OR
 * 2. System is in FAILED state (database unavailable)
 */

import { json } from '@sveltejs/kit';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@utils/logger.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	try {
		// Security check: Only allow reset if user is admin OR system is in failed state
		const { getSystemState } = await import('@src/stores/system');
		const systemState = getSystemState();

		const isAdmin = locals.user?.role === 'admin';
		const isSystemFailed = systemState.overallState === 'FAILED';

		if (!isAdmin && !isSystemFailed) {
			logger.warn('Unauthorized setup reset attempt', {
				userRole: locals.user?.role,
				systemState: systemState.overallState
			});
			return json(
				{
					success: false,
					error: 'Unauthorized. Only administrators or users during system failure can reset setup.',
					message: 'You do not have permission to reset the setup.'
				},
				{ status: 403 }
			);
		}

		// Delete config file
		const configPath = join(process.cwd(), 'config', 'private.ts');
		await unlink(configPath);

		logger.info('Setup reset: config/private.ts deleted successfully', {
			by: locals.user?.username || 'system',
			systemState: systemState.overallState
		});

		// Clear any cached config
		const { clearPrivateConfigCache } = await import('@src/databases/db');
		clearPrivateConfigCache();

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
				message: 'Failed to reset setup. You may need to manually delete config/private.ts'
			},
			{ status: 500 }
		);
	}
};
