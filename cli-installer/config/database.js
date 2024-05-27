import { text, confirm, select, note, isCancel, cancel, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';

// Function to test MongoDB connection
async function testMongoDBConnection(connectionString) {
	const mongoose = await import('mongoose');
	try {
		await mongoose.default.connect(connectionString);
		await mongoose.default.connection.db.admin().ping();
		return true;
	} catch (error) {
		return false;
	}
}

// Function to test MariaDB connection
async function testMariaDBConnection(connectionString) {
	const mariadb = await import('mariadb');
	try {
		const connection = await mariadb.createConnection(connectionString);
		await connection.end();
		return true;
	} catch (error) {
		return false;
	}
}

// Function to extract database connection details from connection string
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

	// Configuration Title
	console.log(pc.blue('◆  Database Configuration:'));

	// Configure SvelteCMS
	const projectDatabase = await select({
		message: 'Choose your database option:',
		initialValue: privateConfigData.DB_TYPE || 'mongodb',
		options: [
			{ value: 'mongodb', label: 'MongoDB', hint: 'Recommended - Supports MongoDB Atlas, Docker, and Local' }
			// { value: 'mariadb', label: 'MariaDB', hint: 'In development not Functional - Supports Docker and Local' }
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
		const mongoOption = await select({
			message: 'Choose your MongoDB option:',
			initialValue: privateConfigData.DB_PROVIDER || 'atlas',
			options: [
				{ value: 'atlas', label: 'Use MongoDB Atlas', hint: 'Recommended for Production' },
				{ value: 'docker', label: 'Use Docker MongoDB', hint: 'Recommended for Development' },
				{ value: 'local', label: 'Use Local MongoDB', hint: 'Recommended for Development' }
			],
			required: true
		});

		if (isCancel(mongoOption)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		if (mongoOption === 'atlas') {
			note(
				'1. Go to your MongoDB Atlas cluster\n' +
					`2. Click on "${pc.green('Connect')}"\n` +
					`3. Click on "${pc.green('Connect your application')}"\n` +
					`4. Select "${pc.green('MongoDB Shell')}"\n` +
					'5. Copy the connection string',
				pc.green('For MongoDB Atlas, please follow these steps:')
			);

			connectionString = await text({
				message: 'Enter your MongoDB Atlas connection string:',
				placeholder: 'mongodb+srv://user:password@host/database',
				required: true
			});

			if (isCancel(connectionString)) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			}
		} else if (mongoOption === 'docker') {
			note(
				`1. Create a ${pc.green('docker-compose.yml')} file with the following content:\n` +
					`${pc.green('version: "3.9"')}\n` +
					`${pc.green('services:')}\n` +
					`${pc.green('  mongo:')}\n` +
					`${pc.green('    image: mongo:latest')}\n` +
					`${pc.green('    ports:')}\n` +
					`${pc.green('      - 27017:27017')}\n` +
					`${pc.green('    environment:')}\n` +
					`${pc.green('      MONGO_INITDB_ROOT_USERNAME: <your-username>')}\n` +
					`${pc.green('      MONGO_INITDB_ROOT_PASSWORD: <your-password>')}\n\n` +
					`2. Replace ${pc.green('<your-username>')} and ${pc.green('<your-password>')} with your desired credentials.\n` +
					`3. Save the file and run ${pc.green('"docker-compose up"')} in the same directory.\n` +
					`4. Once the container is running, copy the connection string in the following format:\n` +
					`   ${pc.green('mongodb://<your-username>:<your-password>@localhost:27017')}`,
				pc.green('For Docker MongoDB, please follow these steps:')
			);

			connectionString = await text({
				message: 'Enter your MongoDB docker connection string:',
				placeholder: 'mongodb://<your-username>:<your-password>@localhost:27017',
				required: true
			});

			if (isCancel(connectionString)) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			}
		} else if (mongoOption === 'local') {
			connectionString = await text({
				message: 'Enter your MongoDB local connection string:',
				placeholder: 'mongodb://<your-username>:<your-password>@localhost:27017',
				required: true
			});

			if (isCancel(connectionString)) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			}
		}

		// Test MongoDB connection with spinner
		let isConnectionSuccessful = false;
		const s = spinner();
		try {
			s.start('Testing MongoDB connection...');
			isConnectionSuccessful = await testMongoDBConnection(connectionString);
			s.stop();
		} catch (error) {
			s.stop();
			note(
				`${pc.red('MongoDB connection failed:')} ${error.message}\n` + 'Please check your connection string and try again.',
				pc.red('Connection Error')
			);
		}

		if (!isConnectionSuccessful) {
			console.log(pc.red('◆  MongoDB connection test failed.') + ' Please check your connection string and try again.');
			const retry = await confirm({
				message: 'Do you want to try entering the connection string again?',
				initialValue: true
			});

			if (isCancel(retry) || !retry) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			} else {
				return configureDatabase(privateConfigData); // Restart the database configuration
			}
		}
	} else if (projectDatabase === 'mariadb') {
		const mariadbOption = await select({
			message: 'Choose your MariaDB option:',
			initialValue: privateConfigData.DB_PROVIDER || 'docker',
			options: [
				{ value: 'docker', label: 'Use Docker MariaDB', hint: 'Recommended for Development' },
				{ value: 'local', label: 'Use Local MariaDB', hint: 'Recommended for Development' }
			],
			required: true
		});

		if (isCancel(mariadbOption)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		if (mariadbOption === 'docker') {
			note(
				`1. Create a ${pc.green('docker-compose.yml')} file with the following content:\n` +
					`${pc.green('version: "3.9"')}\n` +
					`${pc.green('services:')}\n` +
					`${pc.green('  mariadb:')}\n` +
					`${pc.green('    image: mariadb:latest')}\n` +
					`${pc.green('    ports:')}\n` +
					`${pc.green('      - 3306:3306')}\n` +
					`${pc.green('    environment:')}\n` +
					`${pc.green('      MYSQL_ROOT_PASSWORD: <your-password>')}\n` +
					`${pc.green('      MYSQL_DATABASE: <your-database>')}\n` +
					`${pc.green('      MYSQL_USER: <your-username>')}\n` +
					`${pc.green('      MYSQL_PASSWORD: <your-password>')}\n\n` +
					`2. Replace ${pc.green('<your-username>')}, ${pc.green('<your-password>')}, and ${pc.green('<your-database>')} with your desired credentials and database name.\n` +
					`3. Save the file and run ${pc.green('"docker-compose up"')} in the same directory.\n` +
					`4. Once the container is running, copy the connection string in the following format:\n` +
					`   ${pc.green('mariadb://<your-username>:<your-password>@localhost:3306/<your-database>')}`,
				pc.green('For Docker MariaDB, please follow these steps:')
			);

			connectionString = await text({
				message: 'Enter your MariaDB docker connection string:',
				placeholder: 'mariadb://<your-username>:<your-password>@localhost:3306/<your-database>',
				required: true
			});

			if (isCancel(connectionString)) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			}
		} else if (mariadbOption === 'local') {
			connectionString = await text({
				message: 'Enter your MariaDB local connection string:',
				placeholder: 'mariadb://<your-username>:<your-password>@localhost:3306/<your-database>',
				required: true
			});

			if (isCancel(connectionString)) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			}
		}

		// Test MariaDB connection with spinner
		let isConnectionSuccessful = false;
		const s = spinner();
		try {
			s.start('Testing MariaDB connection...');
			isConnectionSuccessful = await testMariaDBConnection(connectionString);
			s.stop();
		} catch (error) {
			s.stop();
			note(
				`${pc.red('MariaDB connection failed:')} ${error.message}\n` + 'Please check your connection string and try again.',
				pc.red('Connection Error')
			);
		}

		if (!isConnectionSuccessful) {
			console.log(pc.red('◆  MariaDB connection test failed.') + ' Please check your connection string and try again.');
			const retry = await confirm({
				message: 'Do you want to try entering the connection string again?',
				initialValue: true
			});

			if (isCancel(retry) || !retry) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			} else {
				return configureDatabase(privateConfigData); // Restart the database configuration
			}
		}
	}

	// Ask if the user wants to configure advanced settings
	const advanced = await confirm({
		message: 'Would you like to configure advanced settings?'
	});

	// Handle advanced configuration for MongoDB
	if (advanced && projectDatabase === 'mongodb') {
		const retryAttempts = await text({
			message: 'Enter number of retry attempts for MongoDB:',
			initialValue: privateConfigData.DB_RETRY_ATTEMPTS || '3'
		});

		if (isCancel(configureDatabase)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		const retryDelay = await text({
			message: 'Enter delay between retries in milliseconds:',
			initialValue: privateConfigData.DB_RETRY_DELAY || '3000'
		});
		if (isCancel(configureDatabase)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		const poolSize = await text({
			message: 'Enter the MongoDB connection pool size:',
			initialValue: privateConfigData.DB_POOL_SIZE || '5'
		});
		if (isCancel(configureDatabase)) {
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
