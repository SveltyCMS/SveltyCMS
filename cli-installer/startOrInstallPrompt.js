/** 
@file cli-installer/startOrInstallPrompt.js
@description Start or Install Prompt for the installer

### Features
- Displays a note about what the user can do/select
- Displays existing configuration (password hidden)
- Prompts for start or install
*/

import { isCancel, note, outro, select } from '@clack/prompts';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { Title } from './cli-installer.js';

export const startOrInstallPrompt = async () => {
	// SveltyCMS Title
	Title();

	// Display a note about what the user can do/select
	note(
		'💡 Tip: Expand your terminal window for the best user experience\n\n' +
			`- Use ${pc.green('arrow keys')} to navigate
- Press ${pc.green('Enter')} to select
- Press ${pc.green('Ctrl+C')} to cancel at any time`,
		pc.green('Navigation Instructions:')
	);

	// Define the paths for the configuration files
	const privateConfigPath = path.join(process.cwd(), 'config', 'private.ts');
	const publicConfigPath = path.join(process.cwd(), 'config', 'public.ts');

	// Check if the required files exist
	const privateExists = fs.existsSync(privateConfigPath);
	const publicExists = fs.existsSync(publicConfigPath);

	// Determine the message and options based on the existence of configuration files
	let message;
	let options;

	// Only add the 'Start' option if both files exist
	if (privateExists && publicExists) {
		// Update Existing Setup
		message = pc.green('Configuration found. What would you like to do?');
		options = [
			{ value: 'install', label: 'Configure SveltyCMS', hint: 'Setup/Configure SveltyCMS' },
			{ value: 'start', label: 'Start SveltyCMS', hint: 'Launch your SveltyCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	} else {
		// Fresh Setup
		message = pc.yellow("No configuration files found. Let's get started with your setup.");
		options = [
			{ value: 'install', label: 'Setup your SveltyCMS', hint: 'Setup/Configure SveltyCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	}

	const selection = await select({ message, options });

	// Handle exit or cancellation
	if (isCancel(selection) || selection === 'exit') {
		outro('👋 Exiting SveltyCMS CLI Installer. Goodbye!');
		process.exit(0); // Exit gracefully with code 0
	}

	// Return the selected action ('install' or 'start')
	return selection;
};
