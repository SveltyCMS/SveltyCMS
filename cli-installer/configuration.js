/** 
@file cli-installer/configuration.js
@description Configuration prompts for the installer

### Features
- Displays a note about the configuration
- Displays existing configuration (password hidden)
- Prompts for configuration using grouped options
*/

import { confirm, isCancel, note, outro, select } from '@clack/prompts'; // Removed unused 'group'
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

import { Title, cancelOperation } from './cli-installer.js';
import { createOrUpdateConfigFile } from './createOrUpdateConfigFile.js';

import { configureDatabase } from './config/database.js';
import { configureEmail } from './config/email.js';
import { configureGoogle } from './config/google.js';
import { configureLanguage } from './config/language.js';
import { configureLLM } from './config/llm.js';
import { configureMapbox } from './config/mapbox.js';
import { configureMedia } from './config/media.js';
import { configureRedis } from './config/redis.js';
import { configureSystem } from './config/system.js';
import { configureTiktok } from './config/tiktok.js';

const REQUIRED_FIELDS = {
	database: 'DB_HOST',
	email: 'SMTP_HOST'
};

// Check if a configuration section has meaningful configuration
function hasCustomConfiguration(sectionKey, configData) {
	// Special cases for sections with specific logic
	switch (sectionKey) {
		case 'system': {
			// System is configured if JWT secret exists or any critical system values are set
			const hasJwtSecret = configData.JWT_SECRET_KEY && configData.JWT_SECRET_KEY.length >= 32;
			const hasSiteName = configData.SITE_NAME && configData.SITE_NAME !== 'SveltyCMS';
			const hasCustomHosts =
				(configData.HOST_DEV && configData.HOST_DEV !== 'http://localhost:5173') ||
				(configData.HOST_PROD && !configData.HOST_PROD.includes('example.com'));
			const hasLogging = configData.LOG_LEVELS && configData.LOG_LEVELS.length > 0;
			const hasArchiving = configData.USE_ARCHIVE_ON_DELETE !== undefined;
			const hasDataExport = !!configData.EXTRACT_DATA_PATH;

			return hasJwtSecret || hasSiteName || hasCustomHosts || hasLogging || hasArchiving || hasDataExport;
		}

		case 'redis':
			// Redis is configured if USE_REDIS is enabled
			return configData.USE_REDIS === true;

		case 'google':
			// Google is configured if OAuth is enabled or API key exists
			return configData.USE_GOOGLE_OAUTH === true || !!configData.GOOGLE_API_KEY;

		case 'mapbox':
			// Mapbox is configured if enabled
			return configData.USE_MAPBOX === true;

		case 'tiktok':
			// TikTok is configured if enabled
			return configData.USE_TIKTOK === true;

		case 'media':
			// Media is configured if folder is set or file size limits are configured
			return !!(configData.MEDIA_FOLDER || configData.MAX_FILE_SIZE || configData.BODY_SIZE_LIMIT);

		case 'language': {
			// Language is configured if non-default languages are set
			const hasContentLang = configData.DEFAULT_CONTENT_LANGUAGE && configData.DEFAULT_CONTENT_LANGUAGE !== 'en';
			const hasSystemLang = configData.DEFAULT_SYSTEM_LANGUAGE && configData.DEFAULT_SYSTEM_LANGUAGE !== 'en';
			const hasAvailableLangs =
				(configData.AVAILABLE_CONTENT_LANGUAGES && configData.AVAILABLE_CONTENT_LANGUAGES.length > 1) ||
				(configData.AVAILABLE_SYSTEM_LANGUAGES && configData.AVAILABLE_SYSTEM_LANGUAGES.length > 1);

			return hasContentLang || hasSystemLang || hasAvailableLangs;
		}

		case 'llm':
			// LLM is configured if LLM_APIS object has any keys
			return configData.LLM_APIS && Object.keys(configData.LLM_APIS).length > 0;

		default:
			// For other sections, return false as they're handled above
			return false;
	}
}

const CONFIG_PATHS = {
	private: path.join(process.cwd(), 'config', 'private.ts'),
	public: path.join(process.cwd(), 'config', 'public.ts')
};

// Restoring the OPTIONS constant
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
	{ value: 'LLM', label: 'LLM', hint: 'Define LLM API' },
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

	// Match string values: KEY: 'value'
	const stringRegex = /(\w+):\s*'([^']*)'/g;
	let match;
	while ((match = stringRegex.exec(content)) !== null) {
		env[match[1]] = match[2];
	}

	// Match boolean values: KEY: true/false
	const boolRegex = /(\w+):\s*(true|false)/g;
	while ((match = boolRegex.exec(content)) !== null) {
		env[match[1]] = match[2] === 'true';
	}

	// Match number values: KEY: 123
	const numberRegex = /(\w+):\s*(\d+)(?:\s*,|\s*}|\s*$)/g;
	while ((match = numberRegex.exec(content)) !== null) {
		env[match[1]] = parseInt(match[2], 10);
	}

	// Match array values: KEY: ["item1", "item2"]
	const arrayRegex = /(\w+):\s*\[\s*([^\]]+)\s*\]/g;
	while ((match = arrayRegex.exec(content)) !== null) {
		// Parse array items (assuming string items for now)
		const items = match[2].split(',').map((item) => item.trim().replace(/['"]/g, ''));
		env[match[1]] = items;
	}

	return env;
}

// Removed unused hasRequiredFields function

function updateConfigData(configData, newConfig) {
	return { ...configData, ...newConfig };
}

// Returns true if the user confirmed exit, false otherwise
async function handleExit(configData) {
	const dbField = REQUIRED_FIELDS.database;
	const emailField = REQUIRED_FIELDS.email;
	const dbMissing = !configData[dbField] || configData[dbField] === '';
	const emailMissing = !configData[emailField] || configData[emailField] === '';

	if (dbMissing || emailMissing) {
		let missingMessage = '';
		if (dbMissing && emailMissing) {
			missingMessage = `Database (${dbField}) and Email (${emailField}) configurations are required`;
		} else if (dbMissing) {
			missingMessage = `Database (${dbField}) configuration is still required`;
		} else {
			// Only email is missing
			missingMessage = `Email (${emailField}) configuration is still required`;
		}
		note(`${missingMessage} before saving and exiting.`, pc.yellow('Missing Required Fields'));
		return false; // Prevent exit, return to menu
	} else {
		// Both required fields are present
		const confirmSave = await confirm({
			message: 'Do you want to save the configuration before exiting?',
			initialValue: true
		});
		if (isCancel(confirmSave)) {
			await cancelOperation();
			return false; // Treat cancel as not exiting
		}

		if (confirmSave) {
			try {
				await createOrUpdateConfigFile(configData);
				console.log(pc.green('Configuration saved successfully.'));
			} catch (error) {
				console.error(pc.red('Error saving configuration:'), error);
				// Ask if they still want to exit despite the save error
				const confirmExitAnyway = await confirm({
					message: 'Failed to save configuration. Do you still want to exit?',
					initialValue: false
				});
				if (isCancel(confirmExitAnyway) || !confirmExitAnyway) {
					return false; // Don't exit if cancelled or they choose not to exit
				}
			}
		} else {
			console.log(pc.yellow('Configuration not saved.'));
		}
		outro('Thank you for using SveltyCMS CLI Installer.');
		process.exit(0); // Exit the process cleanly
		// The following line is technically unreachable due to process.exit, but included for clarity
		return true; // Confirm exit
	}
}

export const configurationPrompt = async () => {
	Title();
	note(
		`${pc.green('Database')} and ${pc.green('Email')} configurations are required.
Other configurations are optional but enhance functionality.

${pc.gray('Legend:')} ${pc.green('Green = Configured')} | ${pc.gray('Gray = Default/Not Configured')}`,
		pc.green('Configuration Menu:')
	);

	let configData = {};
	const privateConfigContent = await readConfigFile(CONFIG_PATHS.private);
	const publicConfigContent = await readConfigFile(CONFIG_PATHS.public);

	const privateConfig = parseConfig(privateConfigContent);
	const publicConfig = parseConfig(publicConfigContent);

	configData = { ...configData, ...privateConfig, ...publicConfig };

	let exitConfirmed = false;
	do {
		// Clear screen and show menu each time user returns to configuration menu
		Title();
		note(
			`${pc.green('Database')} and ${pc.green('Email')} configurations are required.
Other configurations are optional but enhance functionality.

${pc.gray('Legend:')} ${pc.green('Green = Configured')} | ${pc.gray('Gray = Default/Not Configured')}`,
			pc.green('Configuration Menu:')
		);

		// Use the flat OPTIONS array with select
		const selectedOption = await select({
			message: 'Configure SveltyCMS - Pick a Category (* Required)',
			options: OPTIONS.map((option) => {
				const optionKey = option.value.toLowerCase();
				let isConfigured = false;
				let labelColor = option.label; // Default color

				if (option.required) {
					// For required fields, check if the required field exists and has a value
					const requiredField = REQUIRED_FIELDS[optionKey];
					isConfigured = requiredField && configData[requiredField] && String(configData[requiredField]).trim() !== '';
				} else if (optionKey !== 'exit') {
					// For optional fields, check if they have custom configuration
					isConfigured = hasCustomConfiguration(optionKey, configData);
				}

				// Apply green color if configured
				if (isConfigured) {
					labelColor = pc.green(option.label);
				}

				return {
					...option,
					label: labelColor
				};
			})
		});

		// !! IMPORTANT: Check for cancellation immediately after the prompt !!
		if (isCancel(selectedOption)) {
			await cancelOperation(); // cancelOperation now handles exit(1)
			return; // Exit the function immediately
		}

		// Proceed with handling the selected option (now we know it's not the cancel symbol)
		if (selectedOption === 'Exit') {
			const shouldExit = await handleExit(configData);
			if (shouldExit) {
				exitConfirmed = true;
			}
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
					LLM: configureLLM
				}[selectedOption]; // selectedOption is now guaranteed to be a string value

				if (!configureFunction) {
					console.error(pc.red(`Error: No configuration function found for option "${selectedOption}".`));
					continue;
				}

				const result = await configureFunction(configData);

				// Check if the sub-prompt returned a cancellation symbol (it shouldn't if cancelOperation exits)
				if (isCancel(result)) {
					// This path might be unreachable if cancelOperation always exits, but kept for safety.
					await cancelOperation();
					return;
				}

				// Update configData only if the result is not undefined/null
				if (result) {
					configData = updateConfigData(configData, result);
				}
			} catch (error) {
				// Log error but ensure selectedOption is treated as a string
				console.error(pc.red(`Error configuring ${String(selectedOption)}:`), error);
			}
		}
	} while (!exitConfirmed);
};
