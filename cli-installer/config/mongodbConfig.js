/** 
@file cli-installer/config/mongodbConfig.js
@description Configuration prompts for the MongoDB section

### Features
- Displays a note about the MongoDB configuration
- Displays existing configuration (password hidden)
- Prompts for MongoDB integration
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

export async function configureMongoDB(privateConfigData = {}) {
	// Clear screen for clean interface
	Title();

	// Display existing configuration if present (password hidden)
	if (privateConfigData.DB_TYPE === 'mongodb' && privateConfigData.DB_HOST) {
		note(
			`Current Host: ${pc.cyan(privateConfigData.DB_HOST)}\n` +
				`Current Port: ${pc.cyan(privateConfigData.DB_PORT?.toString() || 'Not set')}\n` +
				`Current DB Name: ${pc.cyan(privateConfigData.DB_NAME || 'Not set')}\n` +
				`Current User: ${pc.cyan(privateConfigData.DB_USER || 'Not set')}`,
			//`DB_PASSWORD: ${pc.red(DB_PASSWORD)}`, // Keep password hidden
			pc.cyan('Existing MongoDB Configuration (Password hidden):')
		);
	}

	// Initial guide note
	note(
		`${pc.green('MongoDB Atlas')} is recommended for production, while\n` +
			`${pc.green('Docker')} and ${pc.green('Local setups')} are suitable for development environments.`,
		pc.green('Please choose your MongoDB setup option:')
	);

	const mongoOption = await select({
		message: 'Choose your MongoDB setup type:',
		initialValue: privateConfigData.DB_PROVIDER || 'atlas',
		options: [
			{ value: 'atlas', label: 'MongoDB Atlas (Cloud)', hint: 'Recommended for Production' },
			{ value: 'docker-local', label: 'Docker / Local Server', hint: 'Recommended for Development' }
		]
	});
	if (isCancel(mongoOption)) {
		cancelToMainMenu();
		return;
	}

	let dbHost, dbPort, dbUser, dbPassword, dbName, connectionString;

	if (mongoOption === 'atlas') {
		note(
			`To set up MongoDB Atlas, follow these steps:\n` +
				`1. Go to your MongoDB Atlas cluster.\n` +
				`2. Click on ${pc.green('Network Access')}.\n` +
				`3. Click on ${pc.green('Add IP Address')} and whitelist your current IP address.\n` +
				`4. Click on ${pc.green('Connect')}.\n` +
				`5. Click on ${pc.green('Connect your application')}.\n` +
				`6. Select ${pc.green('MongoDB Compass')}.\n` +
				`7. Copy the connection string.`,
			pc.green('MongoDB Atlas Setup Instructions:')
		);

		connectionString = await text({
			message: 'Enter your MongoDB Atlas connection string:',
			placeholder: 'mongodb+srv://user:pass@cluster...',
			validate: (value) => {
				if (!value) return 'Connection string is required.';
				if (!value.startsWith('mongodb+srv://')) return 'Atlas connection string should start with mongodb+srv://';
				try {
					new URL(value); // Basic validation if it parses as a URL
				} catch (error) {
					return error.message || 'Invalid connection string format.';
				}
			}
		});
		if (isCancel(connectionString)) {
			cancelToMainMenu();
			return;
		}

		// Attempt to parse connection string, handle errors
		try {
			const url = new URL(connectionString);
			dbUser = decodeURIComponent(url.username);
			dbPassword = decodeURIComponent(url.password);
			// Correctly extract only the hostname part for DB_HOST
			dbHost = `mongodb+srv://${url.hostname}`; // Keep srv protocol for host if present
			dbPort = url.port || '27017'; // Atlas usually doesn't specify port, default needed for connection test
			dbName = url.pathname.substring(1) || privateConfigData.DB_NAME || 'SveltyCMS'; // Get DB name from path or prompt later

			if (!dbUser || !dbPassword) {
				note(
					'Could not automatically extract username or password from the connection string. Please enter them manually.',
					pc.yellow('Parsing Warning')
				);
				// Prompt manually if parsing failed
				dbUser = await text({
					message: 'Enter MongoDB Atlas User:',
					validate: (v) => validateRequired(v, 'User')
				});
				if (isCancel(dbUser)) {
					cancelToMainMenu();
					return;
				}
				dbPassword = await password({
					message: 'Enter MongoDB Atlas Password:',
					validate: (v) => validateRequired(v, 'Password')
				});
				if (isCancel(dbPassword)) {
					cancelToMainMenu();
					return;
				}
			}
		} catch (error) {
			console.error(pc.red('Error parsing connection string:'), error); // Log the actual error
			note(`Failed to parse connection string: ${error.message}. Please enter details manually.`, pc.red('Parsing Error'));
			// Fallback to manual input if parsing fails completely
			dbHost = await text({
				message: 'Enter MongoDB Atlas Host (e.g., clustername.mongodb.net):',
				validate: (v) => validateRequired(v, 'Host')
			});
			if (isCancel(dbHost)) {
				cancelToMainMenu();
				return;
			}
			dbHost = `mongodb+srv://${dbHost}`; // Add prefix manually if needed
			dbPort = '27017'; // Default Atlas port
			dbUser = await text({
				message: 'Enter MongoDB Atlas User:',
				validate: (v) => validateRequired(v, 'User')
			});
			if (isCancel(dbUser)) {
				cancelToMainMenu();
				return;
			}
			dbPassword = await password({
				message: 'Enter MongoDB Atlas Password:',
				validate: (v) => validateRequired(v, 'Password')
			});
			if (isCancel(dbPassword)) {
				cancelToMainMenu();
				return;
			}
		}

		// Prompt for DB name if not found in connection string path
		if (!dbName) {
			dbName = await text({
				message: 'Enter the database name:',
				placeholder: 'SveltyCMS',
				initialValue: privateConfigData.DB_NAME || 'SveltyCMS',
				validate: (value) => {
					if (!value) return 'Database name is required';
					// Return undefined for valid input to show tick
					return undefined;
				}
			});
			if (isCancel(dbName)) {
				cancelToMainMenu();
				return;
			}
		}
	} else if (mongoOption === 'docker-local') {
		note(
			`To set up Docker or Local MongoDB, you need to have Docker installed\n` +
				`and running on your machine if using Docker.\n` +
				`Ensure your Docker container is running with the MongoDB image or\n` +
				`your local MongoDB server is running.`,
			pc.green('Docker/Local MongoDB Setup Instructions:')
		);

		// Database Host
		dbHost = await text({
			message: 'Enter the MongoDB host (e.g., mongodb://localhost or localhost):',
			placeholder: 'mongodb://localhost',
			initialValue: privateConfigData.DB_HOST || 'mongodb://localhost',
			validate: (value) => {
				if (!value) return 'Host is required.';
			}
		});
		if (isCancel(dbHost)) {
			cancelToMainMenu();
			return;
		}

		dbPort = await text({
			message: 'Enter the MongoDB port:',
			placeholder: '27017',
			initialValue: privateConfigData.DB_PORT?.toString() || '27017',
			validate: validatePort
		});
		if (isCancel(dbPort)) {
			cancelToMainMenu();
			return;
		}

		dbName = await text({
			message: 'Enter the database name:',
			placeholder: 'SveltyCMS',
			initialValue: privateConfigData.DB_NAME || 'SveltyCMS',
			validate: (value) => validateRequired(value, 'Database name')
		});
		if (isCancel(dbName)) {
			cancelToMainMenu();
			return;
		}

		dbUser = await text({
			message: 'Enter the MongoDB user (optional):',
			placeholder: 'Leave blank if no authentication',
			initialValue: privateConfigData.DB_USER || ''
		});

		if (isCancel(dbUser)) {
			cancelToMainMenu();
			return;
		}

		// Only ask for password if user is provided
		if (dbUser) {
			dbPassword = await password({
				message: 'Enter the MongoDB password:',
				mask: '*'
				// validate: (value) => validateRequired(value, 'Password')
			});
			if (isCancel(dbPassword)) {
				cancelToMainMenu();
				return;
			}
		} else {
			dbPassword = '';
		}
	}

	// Return the collected configuration
	return {
		DB_TYPE: 'mongodb',
		DB_HOST: dbHost,
		DB_PORT: parseInt(dbPort, 10), // Ensure port is a number
		DB_NAME: dbName,
		DB_USER: dbUser || undefined, // Return undefined if blank
		DB_PASSWORD: dbPassword || undefined // Return undefined if blank
	};
}
