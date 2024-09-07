/** 
@file cli-installer/configuration.js
@description Configuration prompts for the installer
*/

import { isCancel, select, confirm, note, outro } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';

import { Title, cancelOperation } from './cli-installer.js';
import { createOrUpdateConfigFile } from './createOrUpdateConfigFile.js';

import { configureDatabase } from './config/database.js';
import { configureEmail } from './config/email.js';
import { configureLanguage } from './config/language.js';
import { configureSystem } from './config/system.js';
import { configureMedia } from './config/media.js';
import { configureGoogle } from './config/google.js';
import { configureRedis } from './config/redis.js';
import { configureMapbox } from './config/mapbox.js';
import { configureTiktok } from './config/tiktok.js';
import { configureOpenAI } from './config/openai.js';

const REQUIRED_FIELDS = {
	database: 'DB_HOST',
	email: 'SMTP_HOST'
};

const CONFIG_PATHS = {
	private: path.join(process.cwd(), 'config', 'private.ts'),
	public: path.join(process.cwd(), 'config', 'public.ts')
};

const OPTIONS = [
	{ value: 'Database', label: 'Database *', hint: 'Configure Database', required: true },
	{ value: 'Email', label: 'Email *', hint: 'Configure Email Server', required: true },
	{ value: 'Language', label: 'Language', hint: 'Configure System & Content Languages' },
	{ value: 'System', label: 'System', hint: 'Configure System settings' },
	{ value: 'Media', label: 'Media', hint: 'Configure Media handling' },
	{ value: 'Google', label: 'Google', hint: 'Configure Google API' },
	{ value: 'Redis', label: 'Redis', hint: 'Configure Redis cache' },
	{ value: 'Mapbox', label: 'Mapbox', hint: 'Configure Mapbox API' },
	{ value: 'Tiktok', label: 'Tiktok', hint: 'Configure Tiktok API' },
	{ value: 'OpenAI', label: 'OpenAI', hint: 'Define OpenAI API' },
	{ value: 'Exit', label: 'Save & Exit', hint: 'Save & Exit the installer' }
];

// Helper function to read the TypeScript file as a text file
async function readConfigFile(filePath) {
	try {
		if (fs.existsSync(filePath)) {
			return fs.readFileSync(filePath, 'utf-8');
		}
	} catch (error) {
		console.error(`Error reading configuration file: ${error.message}`);
	}
	return '';
}

// Function to parse the configuration file content to extract the environment variables
function parseConfig(content) {
	const env = {};
	const regex = /(\w+):\s*'([^']*)'/g;
	let match;
	while ((match = regex.exec(content)) !== null) {
		env[match[1]] = match[2];
	}
	return env;
}

function hasRequiredFields(configData) {
	return Object.values(REQUIRED_FIELDS).every((field) => !!configData[field]);
}

function updateConfigData(configData, newConfig) {
	return { ...configData, ...newConfig };
}

async function handleExit(configData) {
	if (!hasRequiredFields(configData)) {
		const confirmExit = await confirm({
			message: 'Database and Email are required to save the configuration. Do you still want to exit without saving?',
			initialValue: false
		});
		if (confirmExit) {
			outro('Thank you for using SveltyCMS CLI Installer.');
			process.exit(0);
		}
	} else {
		const confirmSave = await confirm({
			message: 'Do you want to save the configuration before exiting?',
			initialValue: true
		});
		if (confirmSave) {
			try {
				await createOrUpdateConfigFile(configData);
				console.log('Configuration saved.');
			} catch (error) {
				console.error('Error saving configuration:', error);
			}
		} else {
			console.log('Configuration not saved.');
		}
		outro('Thank you for using SveltyCMS CLI Installer.');
		process.exit(0);
	}
}

export const configurationPrompt = async () => {
	Title();
	note(
		`${pc.green('Database')} and ${pc.green('Email')} configurations are required.\n` + `Other configurations are optional.`,
		pc.green('Configuration Instructions:')
	);

	let configData = {};
	const privateConfigContent = await readConfigFile(CONFIG_PATHS.private);
	const publicConfigContent = await readConfigFile(CONFIG_PATHS.public);

	const privateConfig = parseConfig(privateConfigContent);
	const publicConfig = parseConfig(publicConfigContent);

	configData = { ...configData, ...privateConfig, ...publicConfig };

	let exitConfirmed = false;
	do {
		const selectedOption = await select({
			message: 'Configure SveltyCMS - Pick a Category (* Required)',
			options: OPTIONS.map((option) => ({
				...option,
				label: configData[REQUIRED_FIELDS[option.value.toLowerCase()]] ? pc.green(option.label) : option.label
			}))
		});

		if (isCancel(selectedOption)) {
			await cancelOperation();
			return;
		}

		if (selectedOption === 'Exit') {
			await handleExit(configData);
			exitConfirmed = true;
		} else {
			try {
				const configureFunction = {
					Database: configureDatabase,
					Email: configureEmail,
					Language: configureLanguage,
					System: configureSystem,
					Media: configureMedia,
					Google: configureGoogle,
					Redis: configureRedis,
					Mapbox: configureMapbox,
					Tiktok: configureTiktok,
					OpenAI: configureOpenAI
				}[selectedOption];

				const result = await configureFunction(configData);
				if (isCancel(result)) {
					await cancelOperation();
					return;
				}
				configData = updateConfigData(configData, result);
			} catch (error) {
				console.error(`Error configuring ${selectedOption}: ${error.message}`);
			}
		}
	} while (!exitConfirmed);

	if (hasRequiredFields(configData)) {
		const confirmSave = await confirm({
			message: 'Do you want to save the configuration?',
			initialValue: true
		});
		if (confirmSave) {
			await createOrUpdateConfigFile(configData);
			console.log('Configuration saved.');
		} else {
			console.log('Configuration not saved.');
		}
	}
};
