/** 
@file cli-installer/startProcess.js
@description Start Process for the CLI Installer

### Features
- Start SveltyCMS
- Display a note about navigation instructions
- Select a package manager using arrow keys
- Press Enter to select
- Press Ctrl+C to cancel at any time
*/

import { isCancel, select, spinner } from '@clack/prompts';
import { spawnSync } from 'child_process';
import pc from 'picocolors';
import { Title } from './cli-installer.js';

import { main } from './cli-installer.js';

// Detect installed package managers
async function checkPackageManagers() {
	const spin = spinner();
	spin.start('Checking for installed package managers...');
	try {
		const potentialManagers = ['npm', 'pnpm', 'yarn', 'bun'];
		const availableManagers = [];

		for (const manager of potentialManagers) {
			try {
				const result = spawnSync(manager, ['--version'], { stdio: 'pipe' });
				if (result.status === 0) {
					availableManagers.push(manager);
				}
			} catch {
				// Manager not available, continue checking others
			}
		}

		spin.stop('Package managers checked successfully.');
		return availableManagers;
	} catch (error) {
		spin.stop('An error occurred while checking for package managers.');
		console.error('An error occurred while checking for package managers:', error);
		return [];
	}
}

// Function to execute the selected action with the selected package manager
function executeAction(manager, action) {
	if (action === 'exit') {
		console.log(pc.yellow('👋 Exiting installer...'));
		process.exit(0);
	}

	console.log(pc.blue(`🚀 Starting ${action} with ${manager}...`));

	try {
		const result = spawnSync(manager, ['run', action], { stdio: 'inherit' });

		if (result.status !== 0) {
			console.log(pc.red(`❌ Command failed with exit code ${result.status}`));
			console.log(pc.yellow('💡 Please check the error messages above and try again.'));
		} else {
			console.log(pc.green(`✅ Command completed successfully!`));
		}
	} catch (error) {
		console.error(pc.red('❌ An error occurred while executing the command:'), error.message);
		console.log(pc.yellow('💡 Please ensure the package manager is properly installed and try again.'));
	}
}

export async function startProcess() {
	// SveltyCMS Title
	Title();

	// Configuration Title
	console.log(pc.blue('◆  Start SveltyCMS'));

	try {
		const packageManagers = await checkPackageManagers();

		if (!packageManagers || packageManagers.length === 0) {
			console.log(pc.red('❌ No package managers found!'));
			console.log(pc.yellow('💡 Please install one of the following package managers:'));
			console.log(pc.cyan('   • npm (comes with Node.js)'));
			console.log(pc.cyan('   • pnpm (recommended): npm install -g pnpm'));
			console.log(pc.cyan('   • yarn: npm install -g yarn'));
			console.log(pc.cyan('   • bun: curl -fsSL https://bun.sh/install | bash'));
			console.log(pc.yellow('\nThen try running the installer again.'));
			return;
		}

		const options = packageManagers.map((manager) => {
			let hint = '';
			switch (manager) {
				case 'pnpm':
					hint = 'Faster npm alternative with better disk efficiency (recommended)';
					break;
				case 'bun':
					hint = 'Ultra-fast JavaScript toolkit with built-in bundler';
					break;
				case 'yarn':
					hint = 'Fast and secure package manager with workspaces support';
					break;
				case 'npm':
					hint = 'Standard Node.js package manager (comes with Node.js)';
					break;
				default:
					hint = 'Package manager';
			}
			return { value: manager, label: manager, hint };
		});

		// Sort options to prioritize recommended package managers
		options.sort((a, b) => {
			const priority = { pnpm: 1, bun: 2, yarn: 3, npm: 4 };
			return (priority[a.value] || 5) - (priority[b.value] || 5);
		});

		// Select package manager
		const selectedManager = await select({
			message: 'Which package manager would you like to use for your project?',
			options,
			required: true
		});

		if (isCancel(selectedManager)) {
			console.clear(); // Clear the terminal
			await main(); // Restart the configuration process
			return;
		}

		const action = await select({
			message: 'What would you like to do next?',
			options: [
				{ value: 'dev', label: 'Develop project', hint: 'Start SveltyCMS in development' },
				{
					value: 'devv',
					label: 'Develop project (VSCode)',
					hint: 'Start SveltyCMS in development for VSCode'
				},
				{ value: 'build', label: 'Build project', hint: 'Build your SveltyCMS project' },
				{ value: 'check', label: 'Check project', hint: 'Check our SveltyCMS project' },
				{ value: 'exit', label: 'Exit Installer', hint: 'Exit the CLI Installer' }
			],
			required: true
		});

		if (isCancel(action)) {
			console.clear(); // Clear the terminal
			await main(); // Restart the configuration process
			return;
		}

		// Execute the selected action with the selected package manager
		executeAction(selectedManager, action);

		// If action is not 'exit', offer to return to main menu
		if (action !== 'exit') {
			console.log(pc.green('\n🎉 Process completed!'));
			const continueChoice = await select({
				message: 'What would you like to do next?',
				options: [
					{ value: 'main', label: 'Return to main menu', hint: 'Go back to the main installer menu' },
					{ value: 'exit', label: 'Exit installer', hint: 'Exit the CLI installer' }
				],
				required: true
			});

			if (isCancel(continueChoice)) {
				console.clear();
				await main();
				return;
			}

			if (continueChoice === 'main') {
				console.clear();
				await main();
			} else {
				console.log(pc.yellow('👋 Goodbye!'));
				process.exit(0);
			}
		}

		// Add any other initialization steps here
	} catch (error) {
		console.error('An error occurred:', error.message || error);
	}
}
