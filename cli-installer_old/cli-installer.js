import { intro, outro, confirm, select, spinner, isCancel, cancel, text } from '@clack/prompts';
import { setTimeout as sleep } from 'node:timers/promises';
import color from 'picocolors';

// Start dev or build process
import { startProcess } from './startProcess.js';
import { setTimeout } from 'node:timers/promises';

import { Title, startOrInstallPrompt, cancelOperation } from './prompts.js';

async function main() {
	// Clear the terminal
	console.clear();

	// Welcome message
	Title();

	// Start installer
	const projectStart = await startOrInstallPrompt();

	if (isCancel(projectStart)) {
		cancelOperation();
	}

	// Handle user input
	if (projectStart === 'install') {
		const configureDatabase = await import('./config/database.js').then((m) => m.configureDatabase);
		const configureEmail = await import('./config/email.js').then((m) => m.configureEmail);

		// Clear the terminal
		console.clear();

		// Welcome message
		Title();

		// Configure SvelteCMS
		const projectConfigure = await select({
			message: 'Configure SvelteCMS - Pick a Category',
			options: [
				{ value: 'Database', label: 'Database', hint: ' Configure Database' },
				{ value: 'Email', label: 'Email', hint: 'Configure Email Server' },
				{ value: 'Language', label: 'Language', hint: 'Configure System and Content Languages' },
				{ value: 'System', label: 'System', hint: 'Configure System settings' },
				{ value: 'Media', label: 'Media', hint: 'Configure Media handling' },
				{ value: 'Google', label: 'Google', hint: 'Configure Google api' },
				{ value: 'Redis', label: 'Redis', hint: 'Configure Redis cache' },
				{ value: 'Mapbox', label: 'Mapbox', hint: 'Configure Mapbox api' },
				{ value: 'Ticktok', label: 'Ticktok', hint: 'Configure Ticktok api' },
				{ value: 'OpenAI', label: 'OpenAI', hint: 'Define OpenAI api' }
			]
		});

		if (isCancel(projectConfigure)) {
			cancelOperation();
		} else if (projectConfigure === 'database') {
			await configureDatabase();
		} else if (projectConfigure === 'email') {
			await configureEmail();
		} else {
			// Handle other chosen configuration categories
		}

		if (isCancel(projectConfigure)) {
			cancel('Operation cancelled');
			return process.exit(0);
		}
	} else if (projectStart === 'start') {
		// Clear the terminal
		console.clear();

		// Welcome message
		intro(`${color.bgRed(color.white(' Welcome to SveltyCMS CLI installer! '))}`);

		const s = spinner();
		s.start('Loading data...');

		await sleep(1000);

		s.stop('Loading data...');

		outro("You're all set!");

		await sleep(1000);

		await startProcess();
	} else if (projectStart === 'exit') {
		outro('Thank you for using SveltyCMS CLI installer.');
		process.exit(0);
	} else {
		console.log('Invalid choice.');
	}

	// Exit
	outro("You're all set!");

	await sleep(1000);
}

main();
