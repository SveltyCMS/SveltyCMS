import { select, isCancel, note, outro } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { Title } from './cli-installer.js';

export const startOrInstallPrompt = async () => {
	// SveltyCMS Title
	Title();

	// Display a note about what the user can do/select
	note(
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
			{ value: 'install', label: 'Configure SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'start', label: 'Start SvelteCMS', hint: 'Launch your SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	} else {
		// Fresh Setup
		message = pc.yellow("No configuration files found. Let's get started with your setup.");
		options = [
			{ value: 'install', label: 'Setup your SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	}

	const selection = await select({ message, options });

	if (isCancel(selection) || selection === 'exit') {
		outro('Thank you for using SveltyCMS CLI Installer.');
		process.exit(0); // Exit with code 0
	}

	return selection;
};
