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
	const regex = /(\w+):\s*'([^']*)'/g;
	let match;
	while ((match = regex.exec(content)) !== null) {
		env[match[1]] = match[2];
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
Other configurations are optional but enhance functionality.`,
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
Other configurations are optional but enhance functionality.`,
			pc.green('Configuration Menu:')
		);

		// Use the flat OPTIONS array with select
		const selectedOption = await select({
			message: 'Configure SveltyCMS - Pick a Category (* Required)',
			options: OPTIONS.map((option) => {
				// Check if the option corresponds to a required field and if that field has data
				const requiredFieldKey = option.value.toLowerCase();
				const isRequiredAndSet = REQUIRED_FIELDS[requiredFieldKey] && configData[REQUIRED_FIELDS[requiredFieldKey]];
				return {
					...option,
					label: isRequiredAndSet ? pc.green(option.label) : option.label // Mark green if required and set
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
