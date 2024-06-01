import { text, confirm, select, note, isCancel, cancel, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { configurationPrompt } from '../configuration.js';

function encodeMongoURI(connectionString) {
	const url = new URL(connectionString);
	const username = encodeURIComponent(url.username);
	const password = encodeURIComponent(url.password);
	url.username = username;
	url.password = password;
	return url.toString();
}

// Function to test MongoDB connection
async function testMongoDBConnection(connectionString) {
	const mongoose = await import('mongoose');
	try {
		if (!connectionString) {
			throw new Error('Connection string is undefined.');
		}

		console.log('Connecting to MongoDB with connection string:', connectionString);

		await mongoose.default.connect(connectionString);
		await mongoose.default.connection.db.admin().ping();
		return true;
	} catch (error) {
		console.error('Connection Error:', error);
		return false;
	}
}

export async function configureMongoDB(privateConfigData = {}) {
	let connectionString;

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
			`1. Ensure your Docker container is running with the following configuration:\n` +
				`${pc.green('version: "3.9"')}\n` +
				`${pc.green('services:')}\n` +
				`${pc.green('  mongo:')}\n` +
				`${pc.green('    image: mongo:latest')}\n` +
				`${pc.green('    ports:')}\n` +
				`${pc.green('      - 27017:27017')}\n` +
				`${pc.green('    environment:')}\n` +
				`${pc.green('      MONGO_INITDB_ROOT_USERNAME: <your-username>')}\n` +
				`${pc.green('      MONGO_INITDB_ROOT_PASSWORD: <your-password>')}\n\n` +
				`2. Use the following connection string format:\n` +
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

		console.log('Entered MongoDB Docker connection string:', connectionString);
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

	// Encode the connection string
	connectionString = encodeMongoURI(connectionString);

	// Log the connection string for debugging
	console.log('Final MongoDB connection string:', connectionString);

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
			return configureMongoDB(privateConfigData); // Restart the database configuration
		}
	}

	// Include the database name in the connection string
	const dbName = connectionString.includes('/') ? connectionString.split('/').pop() : 'sveltycms';
	connectionString = connectionString.replace(/\/?$/, `/${dbName}`);

	return connectionString;
}
