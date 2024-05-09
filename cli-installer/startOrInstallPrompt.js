import { select } from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import { Title } from './cli-installer.js';

export const startOrInstallPrompt = async () => {
	// SveltyCMS Title
	Title();

	// Check if the required files exist
	const privateConfigExists = fs.existsSync('config/private.ts');
	const publicConfigExists = fs.existsSync('config/public.ts');

	let message;
	let options;

	// Only add the 'Start' option if both files exist
	if (privateConfigExists && publicConfigExists) {
		message = pc.green('Configuration found. What would you like to do?');
		options = [
			{ value: 'install', label: 'Configure SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'start', label: 'Start SvelteCMS', hint: 'Launch your SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	} else {
		message = pc.yellow("No configuration files found. Let's get started with your setup.");
		options = [
			{ value: 'install', label: 'Setup your SvelteCMS', hint: 'Setup/Configure SvelteCMS' },
			{ value: 'exit', label: 'Exit', hint: 'Exit the CLI installer' }
		];
	}

	return select({
		message,
		options
	});
};
