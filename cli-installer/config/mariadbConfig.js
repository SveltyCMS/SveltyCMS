/** 
@file cli-installer/config/mariadbConfig.js
@description Configuration prompts for the mariadbConfig section

### Features
- Displays a note about the mariadbConfig configuration
- Displays existing configuration (password hidden)
- Prompts for mariadbConfig integration
*/

import { text, note, isCancel, select, password } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';

// Helper function to validate port number
const validatePort = (value) => {
	if (value === null || value === undefined || value === '') return `Port is required.`;
	const num = Number(value);
	if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 65535) {
		return `Please enter a valid port number (1-65535).`;
	}
};

// Helper function to validate non-empty string
const validateRequired = (value, fieldName) => {
	if (!value || value.trim().length === 0) return `${fieldName} is required.`;
};

export async function configureMariaDB(privateConfigData = {}) {
	// Clear screen for clean interface
	Title();

	let dbPassword = ''; // Initialize empty password for optional auth
	// Notify user about alpha stage
	note(`${pc.yellow('MariaDB support is experimental and not recommended for production.')}`, pc.yellow('Alpha Stage Notice:'));

	// Display existing configuration if present (password hidden)
	if (privateConfigData.DB_TYPE === 'mariadb' && privateConfigData.DB_HOST) {
		note(
			`Current Host: ${pc.cyan(privateConfigData.DB_HOST)}\n` +
				`Current Port: ${pc.cyan(privateConfigData.DB_PORT?.toString() || 'Not set')}\n` +
				`Current DB Name: ${pc.cyan(privateConfigData.DB_NAME || 'Not set')}\n` +
				`Current User: ${pc.cyan(privateConfigData.DB_USER || 'Not set')}`,
			//`DB_PASSWORD: ${pc.red(DB_PASSWORD)}`, // Keep password hidden
			pc.cyan('Existing MariaDB Configuration (Password hidden):')
		);
	}

	// Initial guide note
	note(`Please choose your MariaDB setup option:`, pc.green('MariaDB Setup:'));

	const mariadbOption = await select({
		message: 'Choose your MariaDB setup type:',
		initialValue: privateConfigData.DB_PROVIDER || 'local', // Assuming DB_PROVIDER might store this
		options: [
			{ value: 'local', label: 'Local Server', hint: 'MariaDB installed directly on your machine' },
			{ value: 'docker', label: 'Docker Container', hint: 'MariaDB running inside Docker' }
		]
	});
	if (isCancel(mariadbOption)) {
		cancelToMainMenu();
		return;
	}

	// Provide specific instructions based on the chosen option
	if (mariadbOption === 'local') {
		note(
			`To set up a local MariaDB instance, make sure you have MariaDB installed and running on your machine.\n` +
				`You can follow the official installation guide: ${pc.blue('https://mariadb.com/kb/en/getting-installing-and-upgrading-mariadb/')}`,
			pc.green('Local MariaDB Setup Instructions:')
		);
	} else if (mariadbOption === 'docker') {
		note(
			`To set up MariaDB using Docker, make sure you have Docker installed and running on your machine.\n` +
				`You can use the following command to run a MariaDB container:\n\n` +
				`${pc.green('docker run --name mariadb -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mariadb:latest')}\n\n` +
				`Replace ${pc.green('my-secret-pw')} with your desired root password.`,
			pc.green('Docker MariaDB Setup Instructions:')
		);
	}

	const dbHost = await text({
		message: 'Enter your MariaDB host:',
		placeholder: 'localhost',
		initialValue: privateConfigData.DB_HOST || 'localhost',
		validate: (value) => validateRequired(value, 'Host')
	});
	if (isCancel(dbHost)) {
		cancelToMainMenu();
		return;
	}

	const dbPort = await text({
		message: 'Enter your MariaDB port:',
		placeholder: '3306',
		initialValue: privateConfigData.DB_PORT?.toString() || '3306',
		validate: validatePort
	});
	if (isCancel(dbPort)) {
		cancelToMainMenu();
		return;
	}

	const dbUser = await text({
		message: 'Enter your MariaDB user (optional):',
		placeholder: 'Leave blank if no authentication',
		initialValue: privateConfigData.DB_USER || ''
	});
	if (isCancel(dbUser)) {
		cancelToMainMenu();
		return;
	}

	// Only ask for password if user is provided
	if (dbUser) {
		const dbPassword = await password({
			message: 'Enter your MariaDB password:',
			mask: '*'
			// validate: (v) => validateRequired(v, 'Password')
		});
		if (isCancel(dbPassword)) {
			cancelToMainMenu();
			return;
		}
	} else {
		dbPassword = '';
	}

	const dbName = await text({
		message: 'Enter your MariaDB database name:',
		placeholder: 'sveltycms_db',
		initialValue: privateConfigData.DB_NAME || 'sveltycms_db',
		validate: (v) => {
			if (!v) return 'Database name is required';
			// Return undefined for valid input to show tick
			return undefined;
		}
	});
	if (isCancel(dbName)) {
		cancelToMainMenu();
		return;
	}

	// Return the collected configuration
	return {
		DB_TYPE: 'mariadb', // Ensure DB_TYPE is set
		DB_HOST: dbHost,
		DB_PORT: parseInt(dbPort, 10), // Ensure port is a number
		DB_NAME: dbName,
		DB_USER: dbUser || undefined, // Return undefined if blank
		DB_PASSWORD: dbPassword || undefined // Return undefined if blank
	};
}
