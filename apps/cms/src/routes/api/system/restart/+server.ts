/**
 * @file src/routes/api/system/restart/+server.ts
 * @description API endpoint to initiate a server restart.
 * This endpoint is protected and can only be accessed by admin users.
 * It works by creating a `restart.txt` file, which can be watched by a process manager like pm2.
 */

import { json, error } from '@sveltejs/kit';
import { setRestartNeeded } from '@shared/utils/server/restartRequired';
import { promises as fs } from 'fs';
import path from 'path';

export const POST = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Insufficient permissions');
	}

	try {
		// Touch a file to signal a restart to a process manager like pm2
		await fs.writeFile(path.join(process.cwd(), 'restart.txt'), new Date().toISOString());

		// Reset the restart needed flag
		setRestartNeeded(false);

		return json({ success: true, message: 'Server restart initiated.' });
	} catch {
		return json({ success: false, error: 'Failed to initiate restart.' }, { status: 500 });
	}
};
