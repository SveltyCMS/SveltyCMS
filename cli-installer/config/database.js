/** 
@file cli-installer/config/database.js
@description Configuration prompts for the Database section

### Features
- Displays a note about the Database configuration
- Displays existing configuration (password hidden)
- Prompts for Database integration
*/

import { confirm, isCancel, note, select, spinner, text } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';
import { configureMariaDB } from './mariadbConfig.js';
import { configureMongoDB } from './mongodbConfig.js';

// Helper function to validate numeric input (using new error return)
const validateNumber = (value, fieldName) => {
	if (value === null || value === undefined || value === '') return { message: `${fieldName} is required.` };
	const num = Number(value);
	if (isNaN(num) || !Number.isInteger(num) || num < 0) {
		return { message: `${fieldName} must be a non-negative integer.` };
	}
	// Return undefined if valid (as per clack docs for new error type)
	return undefined;
};

// Helper function to test database connection
async function testDatabaseConnection(dbType, { host, port, user, password, database }) {
	if (dbType === 'mongodb') {
		const mongoose = await import('mongoose');
		try {
			// Log connection parameters for debugging
			//console.log('Connection parameters:', { host, port, user,password, database });

			// Construct the MongoDB connection string dynamically
			let connectionString;
			if (host.startsWith('mongodb+srv://')) {
				// Atlas connection
				connectionString = `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host.replace('mongodb+srv://', '')}/${database}?retryWrites=true&w=majority`;
			} else {
				// Local connection
				if (user && password) {
					connectionString = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host.replace('mongodb://', '')}${port ? `:${port}` : ''}/${database}?authSource=admin&retryWrites=true&w=majority`;
				} else {
					connectionString = `mongodb://${host.replace('mongodb://', '')}${port ? `:${port}` : ''}/${database}?retryWrites=true&w=majority`;
				}
			}
			console.log('Connecting to MongoDB with connection string:', connectionString);

			// Connect to MongoDB
			await mongoose.default.connect(connectionString);
			await mongoose.default.connection.db.admin().ping();
			return true;
		} catch (error) {
			console.error('MongoDB connection error:', error);
			throw Error(`MongoDB connection failed: ${error.message}`);
		}
	} else if (dbType === 'mariadb') {
		const mariadb = await import('mariadb');
		try {
			// Allow empty credentials for localhost connections
			const connectionOptions = {
				host,
				port,
				database
			};

			// Only add user/password if provided or not localhost
			if ((user && password) || host !== 'localhost') {
				connectionOptions.user = user;
				connectionOptions.password = password;
			}

			const connection = await mariadb.createConnection(connectionOptions);
			await connection.end();
			return true;
		} catch (error) {
			throw Error(`MariaDB connection failed: ${error.message}`);
		}
	}
	return false;
}

export async function configureDatabase(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Guide Note
	note(
		`${pc.green('Database configuration is required for SveltyCMS.')}

This setup will guide you through configuring your database connection.
Choose MongoDB for the best experience with SveltyCMS.

Documentation: ${pc.blue('https://docs.SveltyCMS.com/database-setup')}`,
		pc.green('Database Configuration:')
	);

	// Configure SveltyCMS
	const projectDatabase = await select({
		message: 'Choose your database option:',
		initialValue: privateConfigData.DB_TYPE || 'mongodb',
		options: [
			{
				value: 'mongodb',
				label: 'MongoDB',
				hint: 'Recommended - Supports MongoDB Atlas, Docker, and Local'
			}
			// { value: 'mariadb', label: 'MariaDB (Alpha)', hint: 'Supports Docker and Local - Not ready for production' },
			// { value: 'other', label: 'Other', hint: 'More databases will be available soon' }
		],
		required: true
	});

	if (isCancel(projectDatabase)) {
		cancelToMainMenu();
		return; // Return undefined to go back to main menu
	}

	let dbConfig = {};

	if (projectDatabase === 'mongodb') {
		dbConfig = await configureMongoDB(privateConfigData);
	} else if (projectDatabase === 'mariadb') {
		dbConfig = await configureMariaDB(privateConfigData);
	} else if (projectDatabase === 'other') {
		note(
			`We're actively working on adding support for more\n` +
				`database options.\n\n` +
				`Please check back soon or refer to the documentation\n` +
				`for manual setup instructions: ${pc.blue('https://docs.SveltyCMS.com/docs/database-setup')}`,
			pc.green('Database Option Not Available Yet')
		);
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	// Advanced Database Settings
	const advanced = await confirm({
		message: 'Would you like to configure advanced settings?',
		initialValue: false // Set to false by default to streamline the process
	});

	if (advanced && projectDatabase === 'mongodb') {
		const retryAttempts = await text({
			message: 'Enter number of retry attempts for MongoDB:',
			placeholder: '3',
			initialValue: privateConfigData.DB_RETRY_ATTEMPTS || '3',
			validate: (value) => validateNumber(value, 'Retry attempts')
		});
		if (isCancel(retryAttempts)) {
			cancelToMainMenu();
			return;
		}

		const retryDelay = await text({
			message: 'Enter delay between retries in milliseconds:',
			placeholder: '3000',
			initialValue: privateConfigData.DB_RETRY_DELAY || '3000',
			validate: (value) => validateNumber(value, 'Retry delay')
		});
		if (isCancel(retryDelay)) {
			cancelToMainMenu();
			return;
		}

		const poolSize = await text({
			message: 'Enter the MongoDB connection pool size:',
			placeholder: '5',
			initialValue: privateConfigData.DB_POOL_SIZE || '5',
			validate: (value) => validateNumber(value, 'Pool size')
		});
		if (isCancel(poolSize)) {
			cancelToMainMenu();
			return;
		}

		privateConfigData = {
			...privateConfigData,
			DB_RETRY_ATTEMPTS: retryAttempts,
			DB_RETRY_DELAY: retryDelay,
			DB_POOL_SIZE: poolSize
		};
	} else {
		privateConfigData = {
			...privateConfigData,
			DB_RETRY_ATTEMPTS: privateConfigData.DB_RETRY_ATTEMPTS || '3',
			DB_RETRY_DELAY: privateConfigData.DB_RETRY_DELAY || '3000',
			DB_POOL_SIZE: privateConfigData.DB_POOL_SIZE || '5'
		};
	}

	// Test the database connection
	let isConnectionSuccessful = false;
	const s = spinner();
	try {
		s.start(`Testing ${projectDatabase} connection...`, { indicator: 'line' }); // Added indicator
		// Ensure all required parameters are provided
		if (!dbConfig.DB_HOST || !dbConfig.DB_NAME) {
			throw new Error('Missing required database configuration');
		}
		isConnectionSuccessful = await testDatabaseConnection(projectDatabase, {
			host: dbConfig.DB_HOST,
			port: dbConfig.DB_PORT,
			user: dbConfig.DB_USER,
			password: dbConfig.DB_PASSWORD,
			database: dbConfig.DB_NAME
		});
		s.stop();
	} catch (error) {
		s.stop();
		console.error(pc.red('Database connection error:'), error);
		note(
			`${pc.red(`${projectDatabase} connection failed:`)}\n${error.message}\n\nPlease check your connection details (host, port, user, password, database name) and ensure the database server is running and accessible.`,
			pc.red('Connection Error')
		);
	}

	if (isConnectionSuccessful) {
		note(`${pc.green(`${projectDatabase} connection successful!`)}`, pc.green('Connection Test Result'));
	} else {
		// Error message already shown in the catch block
		const retry = await confirm({
			message: 'Connection failed. Do you want to re-enter the connection details?',
			initialValue: true
		});

		if (isCancel(retry) || !retry) {
			cancelToMainMenu();
			return;
		} else {
			// Pass the potentially updated privateConfigData (with advanced settings) back
			return configureDatabase(privateConfigData);
		}
	}

	// Summary note before saving
	note(
		`DB_TYPE: ${pc.green(projectDatabase)}\n` +
			`DB_HOST: ${pc.green(dbConfig.DB_HOST)}\n` +
			`DB_PORT: ${pc.green(dbConfig.DB_PORT)}\n` +
			`DB_NAME: ${pc.green(dbConfig.DB_NAME)}\n` +
			(dbConfig.DB_USER ? `DB_USER: ${pc.green(dbConfig.DB_USER)}\n` : '') +
			(dbConfig.DB_PASSWORD ? `DB_PASSWORD: ${pc.green(dbConfig.DB_PASSWORD)}\n` : '') +
			`\nAdvanced Configuration:\n` +
			`DB_RETRY_ATTEMPTS: ${pc.green(privateConfigData.DB_RETRY_ATTEMPTS)}\n` +
			`DB_RETRY_DELAY: ${pc.green(privateConfigData.DB_RETRY_DELAY)}\n` +
			`DB_POOL_SIZE: ${pc.green(privateConfigData.DB_POOL_SIZE)}`,
		pc.green('Review your Database configuration:')
	);

	const confirmSave = await confirm({
		message: 'Save this database configuration?',
		initialValue: true
	});

	if (isCancel(confirmSave)) {
		cancelToMainMenu();
		return;
	}

	if (!confirmSave) {
		note('Configuration not saved.', pc.yellow('Action Cancelled'));
		cancelToMainMenu();
		return;
	}
	// If confirmed, proceed to return the config object

	return {
		DB_TYPE: projectDatabase,
		DB_HOST: dbConfig.DB_HOST,
		DB_PORT: dbConfig.DB_PORT,
		DB_NAME: dbConfig.DB_NAME,
		DB_USER: dbConfig.DB_USER,
		DB_PASSWORD: dbConfig.DB_PASSWORD,
		DB_RETRY_ATTEMPTS: privateConfigData.DB_RETRY_ATTEMPTS,
		DB_RETRY_DELAY: privateConfigData.DB_RETRY_DELAY,
		DB_POOL_SIZE: privateConfigData.DB_POOL_SIZE
	};
}
