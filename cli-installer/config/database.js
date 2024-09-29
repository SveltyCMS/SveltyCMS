import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';
import { configureMongoDB } from './mongodbConfig.js';
import { configureMariaDB } from './mariadbConfig.js';
import { text, spinner, select, note, isCancel, cancel, confirm } from '@clack/prompts';
import pc from 'picocolors';

// Helper function to test database connection
async function testDatabaseConnection(dbType, { host, port, user, password, database }) {
	if (dbType === 'mongodb') {
		const mongoose = await import('mongoose');
		try {
			// Construct the MongoDB connection string dynamically
			let connectionString;
			if (host.includes('mongodb.net')) {
				connectionString = `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?retryWrites=true&w=majority`;
			} else {
				// Use the provided host directly
				connectionString =
					user && password ? `${host}:${port}/${database}?retryWrites=true&w=majority` : `${host}:${port}/${database}?retryWrites=true&w=majority`;
			}
			console.log('Connecting to MongoDB with connection string:', connectionString);

			// Connect to MongoDB
			await mongoose.default.connect(connectionString);
			await mongoose.default.connection.db.admin().ping();
			return true;
		} catch (error) {
			throw new Error(`MongoDB connection failed: ${error.message}`);
		}
	} else if (dbType === 'mariadb') {
		const mariadb = await import('mariadb');
		try {
			const connection = await mariadb.createConnection({
				host,
				port,
				user,
				password,
				database
			});
			await connection.end();
			return true;
		} catch (error) {
			throw new Error(`MariaDB connection failed: ${error.message}`);
		}
	}
	return false;
}

export async function configureDatabase(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Guide Note
	note(
		`${pc.green('Database configuration is required for SveltyCMS.')}\n\n` +
			`This setup process will guide you through configuring\n` +
			`your preferred database option.\n\n` +
			`If you need further assistance, please refer to the\n` +
			`documentation: ${pc.blue('https://docs.SveltyCMS.com/database-setup')}`,
		pc.green('Database Configuration:')
	);

	// Configure SveltyCMS
	const projectDatabase = await select({
		message: 'Choose your database option:',
		initialValue: privateConfigData.DB_TYPE || 'mongodb',
		options: [
			{ value: 'mongodb', label: 'MongoDB', hint: 'Recommended - Supports MongoDB Atlas, Docker, and Local' },
			{ value: 'mariadb', label: 'MariaDB (Alpha)', hint: 'Supports Docker and Local - Not ready for production' },
			{ value: 'other', label: 'Other', hint: 'More databases will be available soon' }
		],
		required: true
	});

	if (isCancel(projectDatabase)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
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
		// Set default retry attempts to 3 if not provided
		const retryAttempts = await text({
			message: 'Enter number of retry attempts for MongoDB:',
			initialValue: privateConfigData.DB_RETRY_ATTEMPTS || '3'
		});

		if (isCancel(retryAttempts)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		// Set default retry delay to 3000ms if not provided
		const retryDelay = await text({
			message: 'Enter delay between retries in milliseconds:',
			initialValue: privateConfigData.DB_RETRY_DELAY || '3000'
		});

		if (isCancel(retryDelay)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		// Set default pool size to 5 if not provided
		const poolSize = await text({
			message: 'Enter the MongoDB connection pool size:',
			initialValue: privateConfigData.DB_POOL_SIZE || '5'
		});

		if (isCancel(poolSize)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
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
		s.start(`Testing ${projectDatabase} connection...`);
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
		note(
			`${pc.red(`${projectDatabase} connection failed:`)} ${error.message}\n` + 'Please check your connection details and try again.',
			pc.red('Connection Error')
		);
	}

	if (isConnectionSuccessful) {
		note(`${pc.green(`${projectDatabase} connection successful!`)}`, pc.green('Connection Test Result:'));
	} else {
		console.log(pc.red(`◆  ${projectDatabase} connection test failed.`) + ' Please check your connection details and try again.');
		const retry = await confirm({
			message: 'Do you want to try entering the connection details again?',
			initialValue: true
		});

		if (isCancel(retry) || !retry) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		} else {
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
		message: 'Do you want to save the configuration?',
		initialValue: true
	});

	if (isCancel(confirmSave)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	if (!confirmSave) {
		console.log('Configuration not saved.');
		const restartOrExit = await select({
			message: 'Do you want to restart or exit?',
			options: [
				{ value: 'restart', label: 'Restart', hint: 'Start again' },
				{ value: 'cancel', label: 'Cancel', hint: 'Clear and return to selection' },
				{ value: 'exit', label: 'Exit', hint: 'Quit the installer' }
			]
		});

		if (isCancel(restartOrExit)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		if (restartOrExit === 'restart') {
			return configureDatabase();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

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
