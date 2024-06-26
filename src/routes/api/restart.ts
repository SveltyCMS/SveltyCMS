import { json } from '@sveltejs/kit';
import { exec } from 'child_process';

export async function POST() {
	try {
		// Logic to restart the server
		await restartServer();
		return json({ success: true });
	} catch (error) {
		console.error('Error restarting server:', error);
		return json({ success: false, error: 'Failed to restart server' });
	}
}

async function restartServer(): Promise<void> {
	return new Promise((resolve, reject) => {
		exec('your-restart-command', (error, stdout, stderr) => {
			if (error) {
				console.error(`exec error: ${error}`);
				reject(error);
			} else {
				console.log(`stdout: ${stdout}`);
				console.log(`stderr: ${stderr}`);
				resolve();
			}
		});
	});
}
