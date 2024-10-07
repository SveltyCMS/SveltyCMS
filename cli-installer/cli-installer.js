/** 
@file cli-installer/cli-installer.js
@description SveltyCMS CLI Installer
*/

import { intro, outro, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';

// Components
import { startOrInstallPrompt } from './startOrInstallPrompt.js';
import { backupRestorePrompt } from './backupRestore.js';
import { configurationPrompt } from './configuration.js';
import { startProcess } from './startProcess.js';

// Function to display the welcome message and navigation instructions
export const Title = () => {
	console.clear(); // Clear the terminal
	intro(`${pc.bgRed(pc.white(pc.bold(' Welcome to SveltyCMS CLI installer! ')))}`); // Welcome message
};

// Define more prompts here for different configuration sections
export const cancelOperation = async () => {
	cancel('Operation cancelled.');
	console.clear();
	await main(); // Restart the configuration process
	return;
};

export async function main() {
	// Start installer
	const projectStart = await startOrInstallPrompt();

	if (isCancel(projectStart)) {
		await cancelOperation();
		return;
	}

	// Handle user input
	if (projectStart === 'install') {
		await backupRestorePrompt();

		const projectConfigure = await configurationPrompt();

		if (isCancel(projectConfigure)) {
			await cancelOperation();
			return;
		}
	} else if (projectStart === 'start') {
		const projectstartProcess = await startProcess();

		if (isCancel(projectstartProcess)) {
			await cancelOperation();
			return;
		}
	} else if (projectStart === 'exit') {
		outro('Thank you for using SveltyCMS CLI Installer.');
		process.exit(0);
	} else {
		console.log('Invalid choice.');
	}
}

// Render the main function
main();
