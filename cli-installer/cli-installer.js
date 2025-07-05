/** 
@file cli-installer/cli-installer.js
@description SveltyCMS CLI Installer

### Features
- Displays a welcome message
- Displays navigation instructions
- Handles user input
*/

import { intro, outro } from '@clack/prompts';
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
	// Complete exit - used for main menu cancellation
	outro('👋 Operation cancelled. Goodbye!');
	process.exit(0); // Exit with code 0 for graceful cancellation
};

// For sub-menu cancellations - returns to main config menu
export const cancelToMainMenu = () => {
	// Just show a message but don't exit - let the calling function handle return
	console.log('\n↩️  Returning to main configuration menu...');
};

export async function main() {
	try {
		// Start installer
		const projectStart = await startOrInstallPrompt(); // This handles its own exit/cancel

		// Handle user input
		if (projectStart === 'install') {
			const backupResult = await backupRestorePrompt();

			// Only proceed to configuration if backupRestorePrompt returns 'configuration'
			if (backupResult === 'configuration') {
				await configurationPrompt();
			}
		} else if (projectStart === 'start') {
			await startProcess();
		}
	} catch (error) {
		// Handle different types of errors
		if (error && error.message && error.message.includes('canceled')) {
			// This is likely a cancellation from @clack/prompts
			outro('👋 Operation cancelled. Goodbye!');
			process.exit(0); // Exit gracefully for cancellation
		} else if (error && typeof error === 'symbol') {
			// This could be a cancellation symbol from @clack/prompts
			outro('👋 Operation cancelled. Goodbye!');
			process.exit(0); // Exit gracefully for cancellation
		} else {
			// This is an actual error
			console.error(pc.red('❌ An error occurred:'), error);
			outro('❌ Installer failed. Please try again.');
			process.exit(1);
		}
	}
}

// Global error handlers for graceful shutdown
process.on('SIGINT', () => {
	outro('👋 Installation cancelled. Goodbye!');
	process.exit(0);
});

process.on('SIGTERM', () => {
	outro('👋 Installation terminated. Goodbye!');
	process.exit(0);
});

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
	console.error(pc.red('❌ Unexpected error:'), error);
	outro('❌ An unexpected error occurred. Please try again.');
	process.exit(1);
});

// Render the main function
main();
