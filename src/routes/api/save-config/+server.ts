import { json, type RequestHandler } from '@sveltejs/kit';
import { exec } from 'child_process';
import path from 'path';
//import argon2 from 'argon2';
import { promisify } from 'util';
import { backupConfigFiles } from './backup-utils';

// System Logs
import { logger } from '@src/utils/logger';

const execAsync = promisify(exec);

export const POST: RequestHandler = async ({ request }) => {
	const { configData, isPrivate } = await request.json();

	try {
		// Encrypt configuration data
		const encryptedConfigData = {};
		for (const key in configData) {
			if (Object.prototype.hasOwnProperty.call(configData, key)) {
				encryptedConfigData[key] = ''; //await argon2.hash(configData[key]);
			}
		}

		// Backup the current configuration before saving
		await backupConfigFiles();
		logger.info('Configuration files backed up successfully');

		// Save the config data using the CLI/Script
		await saveConfigFile(encryptedConfigData, isPrivate);

		// Trigger the restart
		await triggerServerRestart();

		logger.info('Configuration saved and server restart triggered successfully');
		return json({ success: true });
	} catch (error) {
		logger.error('Error saving config:', error);
		return json({ success: false, error: 'Failed to save configuration' });
	}
};

async function saveConfigFile(configData: { [key: string]: any }, isPrivate: boolean): Promise<void> {
	const scriptPath = path.join(process.cwd(), 'scripts', 'createOrUpdateConfig.js');
	const configType = isPrivate ? 'private' : 'public';

	try {
		const { stdout, stderr } = await execAsync(`node ${scriptPath} ${JSON.stringify(configData)} ${configType}`);
		logger.info('Configuration script executed successfully', { stdout, stderr });
		if (stderr) {
			logger.warn('Configuration script stderr', { stderr });
		}
	} catch (error) {
		logger.error('Error executing configuration script:', error);
		throw error;
	}
}

async function triggerServerRestart(): Promise<void> {
	try {
		const { stdout, stderr } = await execAsync('your-restart-command');
		logger.info('Server restart command executed successfully', { stdout, stderr });
		if (stderr) {
			logger.warn('Server restart command stderr', { stderr });
		}
	} catch (error) {
		logger.error('Error executing server restart command:', error);
		throw error;
	}
}
