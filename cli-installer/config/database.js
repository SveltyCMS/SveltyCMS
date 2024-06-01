import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';
import { configureMongoDB } from './mongodbConfig.js';
import { configureMariaDB } from './mariadbConfig.js';
import { text, select, note, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';

function parseConnectionString(connectionString, dbType) {
	const parsed = new URL(connectionString);
	if (dbType === 'mongodb') {
		return {
			DB_HOST: parsed.host,
			DB_NAME: parsed.pathname.slice(1),
			DB_USER: parsed.username,
			DB_PASSWORD: parsed.password
		};
	} else if (dbType === 'mariadb') {
		return {
			DB_HOST: parsed.hostname,
			DB_NAME: parsed.pathname.slice(1),
			DB_USER: parsed.username,
			DB_PASSWORD: parsed.password
		};
	}
	return {};
}

export async function configureDatabase(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Guide Note
	note(
		`${pc.green('Database')} configuration is required. Follow the instructions for your preferred database setup.`,
		pc.green('Database Configuration Instructions:')
	);

	// Configure SvelteCMS
	const projectDatabase = await select({
		message: 'Choose your database option:',
		initialValue: privateConfigData.DB_TYPE || 'mongodb',
		options: [
			{ value: 'mongodb', label: 'MongoDB', hint: 'Recommended - Supports MongoDB Atlas, Docker, and Local' },
			{ value: 'mariadb', label: 'MariaDB', hint: 'In development not Functional Yet- Supports Docker and Local' }
		],
		required: true
	});

	if (isCancel(projectDatabase)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	let connectionString;

	if (projectDatabase === 'mongodb') {
		connectionString = await configureMongoDB(privateConfigData);
	} else if (projectDatabase === 'mariadb') {
		connectionString = await configureMariaDB(privateConfigData);
	}

	// Ask if the user wants to configure advanced settings
	const advanced = await confirm({
		message: 'Would you like to configure advanced settings?'
	});

	if (advanced && projectDatabase === 'mongodb') {
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

		// Update privateConfigData with new settings
		privateConfigData = {
			...privateConfigData,
			DB_RETRY_ATTEMPTS: retryAttempts,
			DB_RETRY_DELAY: retryDelay,
			DB_POOL_SIZE: poolSize
		};
	}

	// Parse connection string
	const parsedConfig = parseConnectionString(connectionString, projectDatabase);

	// Summary note before saving
	note(
		`Connection String: ${connectionString}\n` +
			`DB_TYPE: ${pc.green(projectDatabase)}\n` +
			`DB_HOST: ${pc.green(parsedConfig.DB_HOST)}\n` +
			`DB_NAME: ${pc.green(parsedConfig.DB_NAME)}\n` +
			`DB_USER: ${pc.green(parsedConfig.DB_USER)}\n` +
			`DB_PASSWORD: ${pc.green(parsedConfig.DB_PASSWORD)}\n` +
			`Advanced Configuration:\n` +
			`DB_RETRY_ATTEMPTS: ${pc.green(parsedConfig.DB_RETRY_ATTEMPTS)}\n` +
			`DB_RETRY_DELAY: ${pc.green(parsedConfig.DB_RETRY_DELAY)}\n` +
			`DB_POOL_SIZE: ${pc.green(parsedConfig.DB_POOL_SIZE)}`,
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

	return parsedConfig;
}
