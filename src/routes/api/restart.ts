/**
 * @file src/routes/api/restart.ts
 * @description API endpoint for restarting the server.
 *
 * This module provides functionality to:
 * - Trigger a server restart via a POST request
 * - Execute a system command to restart the server
 *
 * Features:
 * - Asynchronous server restart
 * - Error handling and logging
 * - Detailed stdout and stderr logging
 *
 * Usage:
 * POST /api/restart
 * Returns: JSON object with 'success' boolean and optional 'error' message
 *
 * Note: This endpoint performs a critical system operation.
 * Ensure proper authentication, authorization, and security measures are in place.
 * The actual restart command should be properly configured for your specific environment.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import type { RequestHandler } from '@sveltejs/kit';

// System Logger
import logger from '@src/utils/logger';

export const POST: RequestHandler = async () => {
	try {
		await restartServer();
		logger.info('Server restart initiated successfully');
		return json({ success: true });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error restarting server:', { error: errorMessage });
		return json({ success: false, error: 'Failed to restart server' }, { status: 500 });
	}
};

async function restartServer(): Promise<void> {
	return new Promise((resolve, reject) => {
		const restartCommand = 'your-restart-command';
		logger.info(`Executing restart command: ${restartCommand}`);

		exec(restartCommand, (error, stdout, stderr) => {
			if (error) {
				logger.error('Exec error during server restart:', { error: error.message });
				reject(new Error(`Failed to restart server: ${error.message}`));
				return;
			}

			if (stdout) {
				logger.info('Server restart command output:', { stdout });
			}

			if (stderr) {
				logger.warn('Server restart command stderr:', { stderr });
			}

			logger.info('Server restart command executed successfully');
			resolve();
		});
	});
}
