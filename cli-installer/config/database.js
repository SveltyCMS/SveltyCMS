import { text, confirm, select, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import path from 'path';
import fs from 'fs';

// Function to test MongoDB connection
async function testMongoDBConnection(connectionString) {
	const mongoose = await import('mongoose');
	try {
		await mongoose.default.connect(connectionString, { useNewUrlParser: true, useUnifiedTopology: true });
		console.log('MongoDB connection successful!');
		await mongoose.default.connection.db.admin().ping();
		console.log('MongoDB ping successful!');
		return true;
	} catch (error) {
		console.error('MongoDB connection failed:', error);
		return false;
	}
}

// Function to test MariaDB connection
async function testMariaDBConnection(connectionString) {
	const mariadb = await import('mariadb');
	try {
		const connection = await mariadb.createConnection(connectionString);
		console.log('MariaDB connection successful!');
		await connection.end();
		return true;
	} catch (error) {
		console.error('MariaDB connection failed:', error);
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

	// Configure SvelteCMS
	const projectDatabase = await select({
		message: 'Choose your database option:',
		initialValue: privateConfigData.DB_TYPE || 'mongodb',
		options: [
			{ value: 'mongodb', label: 'MongoDB', hint: 'Recommended - Supports MongoDB Atlas, Docker, and Local' },
			{ value: 'mariadb', label: 'MariaDB', hint: 'Supports Docker and Local' }
		],
		required: true
	});

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
		} else if (mongoOption === 'docker') {
			note(
				'1. Create a docker-compose.yml file with the following content:\n' +
					'version: "3.9"\n' +
					'services:\n' +
					'  mongo:\n' +
					'    image: mongo:latest\n' +
					'    ports:\n' +
					'      - 27017:27017\n' +
					'    environment:\n' +
					'      MONGO_INITDB_ROOT_USERNAME: <your-username>\n' +
					'      MONGO_INITDB_ROOT_PASSWORD: <your-password>\n\n' +
					'2. Replace <your-username> and <your-password> with your desired credentials.\n' +
					'3. Save the file and run "docker-compose up" in the same directory.\n' +
					'4. Once the container is running, copy the connection string in the following format:\n' +
					'   mongodb://<your-username>:<your-password>@localhost:27017',
				pc.green('For Docker MongoDB, please follow these steps:')
			);

			connectionString = await text({
				message: 'Enter your MongoDB docker connection string:',
				placeholder: 'mongodb://<your-username>:<your-password>@localhost:27017',
				required: true
			});
		} else if (mongoOption === 'local') {
			connectionString = await text({
				message: 'Enter your MongoDB local connection string:',
				placeholder: 'mongodb://<your-username>:<your-password>@localhost:27017',
				required: true
			});
		}

		// Test MongoDB connection
		const isConnectionSuccessful = await testMongoDBConnection(connectionString);

		if (!isConnectionSuccessful) {
			console.error('MongoDB connection test failed. Please check your connection string and try again.');
			process.exit(1);
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

		if (mariadbOption === 'docker') {
			note(
				'1. Create a docker-compose.yml file with the following content:\n' +
					'version: "3.9"\n' +
					'services:\n' +
					'  mariadb:\n' +
					'    image: mariadb:latest\n' +
					'    ports:\n' +
					'      - 3306:3306\n' +
					'    environment:\n' +
					'      MYSQL_ROOT_PASSWORD: <your-password>\n' +
					'      MYSQL_DATABASE: <your-database>\n' +
					'      MYSQL_USER: <your-username>\n' +
					'      MYSQL_PASSWORD: <your-password>\n\n' +
					'2. Replace <your-username>, <your-password>, and <your-database> with your desired credentials and database name.\n' +
					'3. Save the file and run "docker-compose up" in the same directory.\n' +
					'4. Once the container is running, copy the connection string in the following format:\n' +
					'   mariadb://<your-username>:<your-password>@localhost:3306/<your-database>',
				pc.green('For Docker MariaDB, please follow these steps:')
			);

			connectionString = await text({
				message: 'Enter your MariaDB docker connection string:',
				placeholder: 'mariadb://<your-username>:<your-password>@localhost:3306/<your-database>',
				required: true
			});
		} else if (mariadbOption === 'local') {
			connectionString = await text({
				message: 'Enter your MariaDB local connection string:',
				placeholder: 'mariadb://<your-username>:<your-password>@localhost:3306/<your-database>',
				required: true
			});
		}

		// Test MariaDB connection
		const isConnectionSuccessful = await testMariaDBConnection(connectionString);

		if (!isConnectionSuccessful) {
			console.error('MariaDB connection test failed. Please check your connection string and try again.');
			process.exit(1);
		}
	}

	// Parse connection string
	const parsedConfig = parseConnectionString(connectionString, projectDatabase);

	// Summary note before saving
	note(
		`Connection String: ${connectionString}` +
			`\nDB_TYPE: ${pc.green(projectDatabase)}` +
			`\nDB_HOST: ${pc.green(parsedConfig.DB_HOST)}` +
			`\nDB_NAME: ${pc.green(parsedConfig.DB_NAME)}` +
			`\nDB_USER: ${pc.green(parsedConfig.DB_USER)}` +
			`\nDB_PASSWORD: ${pc.green(parsedConfig.DB_PASSWORD)}`,
		pc.green('Review your Database configuration:')
	);
	const confirmSave = await confirm({
		message: 'Do you want to save the configuration?',
		initialValue: true
	});

	if (!confirmSave) {
		console.log('Configuration not saved.');
		process.exit(0);
	}

	return parsedConfig;
}
