/**
 * @file src/routes/api/system/restart/+server.ts
 * @description API endpoint to initiate a server restart.
 * This endpoint is protected and can only be accessed by admin users.
 * It works by creating a `restart.txt` file, which can be watched by a process manager like pm2.
 */

import { json } from '@sveltejs/kit';
import { setRestartNeeded } from '@src/utils/server/restartRequired';
import { promises as fs } from 'fs';
import { logger } from '@utils/logger.server';
import path from 'path';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const POST = apiHandler(async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
	}

	try {
		// Touch a file to signal a restart to a process manager like pm2
		await fs.writeFile(path.join(process.cwd(), 'restart.txt'), new Date().toISOString());

		// Reset the restart needed flag
		setRestartNeeded(false);

		return json({ success: true, message: 'Server restart initiated.' });
	} catch (err) {
		logger.error('Failed to initiate restart', err);
		throw new AppError('Failed to initiate restart.', 500, 'RESTART_FAILED');
	}
});
