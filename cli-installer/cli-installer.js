/** 
@file cli-installer/cli-installer.js
@description SveltyCMS CLI Installer

### Features
- Displays a welcome message
- Displays navigation instructions
- Handles user input
*/

import { intro, cancel } from '@clack/prompts';
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
export const cancelOperation = () => {
	// No need for async now
	cancel('Operation cancelled. Exiting installer.');
	process.exit(1); // Exit with code 1 for cancellation
	// The return is now unreachable, but kept for clarity if needed later
	return;
};

export async function main() {
	// Start installer
	const projectStart = await startOrInstallPrompt(); // This handles its own exit/cancel

	// Handle user input
	if (projectStart === 'install') {
		await backupRestorePrompt();

		// configurationPrompt now handles its own cancellations via cancelOperation
		await configurationPrompt();
	} else if (projectStart === 'start') {
		await startProcess();
	}
}

// Render the main function
main();
