/**
 * @file src/routes/api/setup/reset/+server.ts
 * @description API endpoint to reset the setup by deleting the config file
 * 
 * This allows recovery when config exists but database is empty
 */

import { json } from '@sveltejs/kit';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '@utils/logger.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	try {
		// Delete config file
		const configPath = join(process.cwd(), 'config', 'private.ts');
		await unlink(configPath);

		logger.info('Setup reset: config/private.ts deleted successfully');

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
