/**
 * @file src/routes/api/save-config/+server.ts
 * @description API endpoint for saving configuration data and triggering server restart.
 *
 * This module provides functionality to:
 * - Save encrypted configuration data (public or private)
 * - Backup existing configuration files before saving
 * - Execute a server restart after saving configuration
 *
 * Features:
 * - Encryption of configuration data (currently commented out)
 * - Execution of external scripts for saving configuration
 * - Backup mechanism for configuration files
 * - Server restart triggering
 * - Comprehensive error handling and logging
 *
 * Usage:
 * POST /api/save-config
 * Body: JSON object with 'configData' and 'isPrivate' fields
 *
 * Note: This endpoint performs sensitive operations and should be
 * properly secured with authentication and authorization checks.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { backupConfigFiles } from './backup-utils';

// System Logger
import logger from '@src/utils/logger';

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
		return json({ success: true }, { status: 200 });
	} catch (error) {
		logger.error('Error saving config:', error);
		return json({ success: false, error: 'Failed to save configuration' }, { status: 500 });
	}
};

// Saver configuration File
async function saveConfigFile(configData: { [key: string]: any }, isPrivate: boolean): Promise<void> {
	const scriptPath = path.join(process.cwd(), 'scripts', 'createOrUpdateConfig.js');
	const configType = isPrivate ? 'private' : 'public';

	try {
		const { stdout, stderr } = await execAsync(`node ${scriptPath} ${JSON.stringify(configData)} ${configType}`);
		logger.info('Configuration script executed successfully', { stdout });
		if (stderr) {
			logger.warn('Configuration script stderr', { stderr });
		}
	} catch (error) {
		logger.error('Error executing configuration script:', error);
		throw error;
	}
}

// Trigger Server Restart
async function triggerServerRestart(): Promise<void> {
	try {
		const { stdout, stderr } = await execAsync('your-restart-command');
		logger.info('Server restart command executed successfully', { stdout });
		if (stderr) {
			logger.warn('Server restart command stderr', { stderr });
		}
	} catch (error) {
		logger.error('Error executing server restart command:', error);
		throw error;
	}
}
