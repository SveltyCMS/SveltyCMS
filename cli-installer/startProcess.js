import { select, cancel } from '@clack/prompts';
import { spawnSync } from 'child_process';
import { Title } from './cli-installer.js';

// Detect installed package managers
async function checkPackageManagers() {
	try {
		const packageManagers = ['pnpm', 'npm', 'yarn'];
		const bunResult = spawnSync('bun', ['--version']);

		if (bunResult.error || bunResult.status !== 0) {
			console.log('Bun is not installed.');
		} else {
			packageManagers.push('bun');
		}

		return packageManagers;
	} catch (error) {
		console.error('An error occurred while checking for package managers:', error);
		return [];
	}
}

// Function to execute the selected action with the selected package manager
function executeAction(manager, action) {
	if (action !== 'exit') {
		spawnSync(manager, ['run', action], { stdio: 'inherit' });
	} else {
		console.log('Exiting installer...');
		process.exit(0);
	}
}

export async function startProcess() {
	// SveltyCMS Title
	Title();
	try {
		const packageManagers = await checkPackageManagers();

		if (!packageManagers || packageManagers.length === 0) {
			console.log('No package managers (npm, pnpm, yarn, or bun) found.');
			console.log('Please install one and try again.');
			return;
		}

		const options = packageManagers.map((manager) => {
			let hint = '';
			switch (manager) {
				case 'npm':
					hint = 'Standard Node.js package manager.';
					break;
				case 'pnpm':
					hint = 'Faster npm alternative. (recommended)';
					break;
				case 'yarn':
					hint = 'Fast and secure package manager.';
					break;
				case 'bun':
					hint = 'Very fast JavaScript toolkit.';
					break;
				default:
					hint = 'No hint available.';
			}
			return { value: manager, label: manager, hint };
		});

		console.log('Start SveltyCMS');

		// Select package manager
		const selectedManager = await select({
			message: 'Which package manager would you like to use for your project?',
			options,
			required: true,
			isCancel: () => {
				cancel('Operation cancelled.');
				process.exit(0);
			}
		});

		const action = await select({
			message: 'What would you like to do next?',
			options: [
				{ value: 'dev', label: 'Develop project', hint: 'Start SveltyCMS in development' },
				{ value: 'build', label: 'Build project', hint: 'Build your SveltyCMS project' },
				{ value: 'check', label: 'Check project', hint: 'Check our SveltyCMS project' },
				{ value: 'exit', label: 'Exit Installer', hint: 'Exit the CLI Installer' }
			],
			required: true,
			isCancel: () => {
				cancel('Operation cancelled.');
				process.exit(0);
			}
		});

		// Execute the selected action with the selected package manager
		executeAction(selectedManager, action);

		// Add any other initialization steps here
	} catch (error) {
		console.error('An error occurred:', error.message || error);
	}
}
