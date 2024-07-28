import { json } from '@sveltejs/kit';
import { exec } from 'child_process';

// System Logs
import logger from '@src/utils/logger';

export async function POST() {
	try {
		// Logic to restart the server
		await restartServer();
		logger.info('Server restarted successfully');
		return json({ success: true });
	} catch (error) {
		logger.error('Error restarting server:', error as Error);
		return json({ success: false, error: 'Failed to restart server' });
	}
}

async function restartServer(): Promise<void> {
	return new Promise((resolve, reject) => {
		exec('your-restart-command', (error, stdout, stderr) => {
			if (error) {
				logger.error(`exec error: ${error}`);
				reject(error);
			} else {
				logger.info(`stdout: ${stdout}`);
				if (stderr) {
					logger.warn(`stderr: ${stderr}`);
				}
				resolve();
			}
		});
	});
}
