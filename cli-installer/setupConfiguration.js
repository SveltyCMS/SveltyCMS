import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';

// Check if config exists
export async function setupConfiguration() {
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

	let privateConfig = {};
	let publicConfig = {};

	if (privateConfigExists || publicConfigExists) {
		const { loadConfig } = await inquirer.prompt({
			type: 'confirm',
			name: 'loadConfig',
			message: 'Existing configuration files found. Do you want to load existing configuration data?',
			default: true
		});

		if (loadConfig) {
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
		} else {
			const { overwriteData } = await inquirer.prompt({
				type: 'confirm',
				name: 'overwriteData',
				message: 'Do you want to overwrite existing data?',
				default: false
			});

			if (!overwriteData) {
				const { exitOrContinue } = await inquirer.prompt({
					type: 'list',
					name: 'exitOrContinue',
					message: 'Do you want to exit or continue?',
					choices: [
						{ name: 'Exit', value: 'exit' },
						{ name: 'Continue', value: 'continue' }
					]
				});

				if (exitOrContinue === 'exit') {
					console.log('Exiting...');
					process.exit(1); // Exit the process
				}
			}
		}
	}

	return { privateConfig, publicConfig };
}
