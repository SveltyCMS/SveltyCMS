import { text, confirm, select, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import mongoose from 'mongoose';

// Function to test database connection
async function testDatabaseConnection(connectionString) {
	try {
		await mongoose.connect(connectionString, { useNewUrlParser: true, useUnifiedTopology: true });
		console.log('Database connection successful!');
		await mongoose.connection.db.admin().ping();
		console.log('Database ping successful!');
		return true;
	} catch (error) {
		console.error('Database connection failed:', error);
		return false;
	}
}

// Function to extract database connection details from connection string
function parseConnectionString(connectionString) {
	const parsed = new URL(connectionString);
	return {
		DB_HOST: parsed.host,
		DB_NAME: parsed.pathname.slice(1),
		DB_USER: parsed.username,
		DB_PASSWORD: parsed.password,
		DB_COMPRESSOR: 'none' // Default compressor, can be extracted if provided in the connection string
	};
}

export async function configureDatabase(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Configure SvelteCMS
	const projectDatabase = await select({
		message: 'Choose your database option:',
		initialValue: privateConfigData.SMTP_PROVIDER || 'atlas',
		options: [
			{ value: 'atlas', label: 'Use MongoDB Atlas', hint: 'Recommended for Production' },
			{ value: 'docker', label: 'Use Docker MongoDB', hint: 'Recommended for Development' },
			{ value: 'local', label: 'Use Local MongoDB', hint: 'Recommended for Development' }
		],
		required: true
	});

	// Get connection string
	let connectionString;

	if (projectDatabase === 'atlas') {
		// Steps for MongoDB Atlas setup
		note(
			'1. Go to your MongoDB Atlas cluster\n' +
				`2. Click on "${pc.green('Connect')}"\n` +
				`3. Click on "${pc.green('Connect your application')}"\n` +
				`4. Select "${pc.green('MongoDB Shell')}"\n` +
				'5. Copy the connection string',
			pc.green('For MongoDB Atlas, please follow these steps:')
		);

		// Configure MongoDB Atlas
		const ConnectionString = await text({
			message: 'Enter your MongoDB Atlas connection string:',
			placeholder: 'mongodb+srv://user:password@host/database',
			required: true
		});
		return ConnectionString;
	} else if (projectDatabase === 'docker') {
		// Steps for Docker MongoDB setup
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
				'   mongodb://<your-username>:<your-password>@localhost:27017'
		),
			pc.green('For Docker MongoDB, please follow these steps:');

		const ConnectionString = await text({
			message: 'Enter your MongoDB docker connection string:',
			placeholder: 'mongodb://<your-username>:<your-password>@localhost:27017',
			validate: (value) => {
				if (!value) return 'Please enter Connection String.';
				if (value[0] !== '.') return 'Please enter Connection String.';
			}
		});
		return ConnectionString;
	} else if (projectDatabase === 'local') {
		const ConnectionString = await text({
			message: 'Enter your MongoDB local connection string:',
			placeholder: 'mongodb://<your-username>:<your-password>@localhost:27017',
			required: true
		});
		return ConnectionString;
	}

	// Parse connection string
	const parsedConfig = parseConnectionString(connectionString);

	// Test database connection
	const isConnectionSuccessful = await testDatabaseConnection(connectionString);

	if (!isConnectionSuccessful) {
		// Handle connection failure
		console.error('Database connection test failed. Please check your connection string and try again.');
		process.exit(1); // Exit the process
	}
	// Summary note before saving
	note(
		`Connection String: ${connectionString}` +
			`\nDB_HOST: ${pc.green(parsedConfig.DB_HOST)}` +
			`\nDB_NAME: ${pc.green(parsedConfig.DB_NAME)}` +
			`\nDB_USER: ${pc.green(parsedConfig.DB_USER)}` +
			`\nDB_PASSWORD: ${pc.green(parsedConfig.DB_PASSWORD)}` +
			`\nDB_COMPRESSOR: ${pc.green(parsedConfig.DB_COMPRESSOR)}`,
		pc.green('Review your Database configuration:')
	);
	const confirmSave = await confirm({
		message: 'Do you want to save the configuration?',
		initial: true
	});

	if (!confirmSave) {
		console.log('Configuration not saved.');
		process.exit(0); // Exit the process
	}

	return parsedConfig;
}
