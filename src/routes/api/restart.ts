/**
 * @file src/routes/api/restart/+server.ts
 * @description Secure API endpoint to restart the dev server using PM2.
 */

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import type { RequestHandler } from './$types';
import { logger } from '$utils/logger.svelte';

export const POST: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	const token = authHeader?.replace('Bearer ', '').trim();

	if (!token || token !== process.env.ADMIN_RESTART_TOKEN) {
		logger.warn('❌ Unauthorized restart attempt');
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await restartServer();
		logger.info('✅ Server restart initiated');
		return json({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error('❌ Error during restart:', { error: message });
		return json({ success: false, error: message }, { status: 500 });
	}
};

async function restartServer(): Promise<void> {
	return new Promise((resolve, reject) => {
		const restartCommand = 'pm2 restart sveltycms-dev';
		logger.info(`🔁 Executing: ${restartCommand}`);

		exec(restartCommand, (error, stdout, stderr) => {
			if (error) {
				logger.error('❌ Exec error:', { error: error.message });
				return reject(error);
			}

			if (stdout) logger.info('📤 stdout:', { stdout });
			if (stderr) logger.warn('📥 stderr:', { stderr });

			logger.info('✅ Restart command executed');
			resolve();
		});
	});
}
