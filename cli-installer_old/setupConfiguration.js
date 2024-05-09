import fs from 'fs/promises';
import path from 'path';

// Check if config exists
export async function checkExistingConfig() {
	const configDir = path.join(process.cwd(), 'config');
	const privateConfigPath = path.join(configDir, 'private.ts');
	const publicConfigPath = path.join(configDir, 'public.ts');

	let privateConfigExists = false;
	let publicConfigExists = false;

	try {
		privateConfigExists = await fs
			.access(privateConfigPath)
			.then(() => true)
			.catch(() => false);
		publicConfigExists = await fs
			.access(publicConfigPath)
			.then(() => true)
			.catch(() => false);
	} catch (error) {
		console.warn('Error checking for existing configuration files:', error);
	}

	return { privateConfigExists, publicConfigExists };
}

// Load existing config
export async function loadExistingConfig() {
	const { privateConfigExists, publicConfigExists } = await checkExistingConfig(); // Define privateConfigExists and publicConfigExists here

	const configDir = path.join(process.cwd(), 'config');
	const privateConfigPath = path.join(configDir, 'private.ts');
	const publicConfigPath = path.join(configDir, 'public.ts');

	let privateConfig = {};
	let publicConfig = {};

	try {
		if (privateConfigExists) {
			privateConfig = require(privateConfigPath);
		}
		if (publicConfigExists) {
			publicConfig = require(publicConfigPath);
		}
	} catch (error) {
		console.warn('Error loading existing configuration files:', error);
	}

	return { privateConfig, publicConfig };
}
