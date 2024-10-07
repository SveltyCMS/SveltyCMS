/** 
@file cli-installer/config/mongodbConfig.js
@description Configuration prompts for the MongoDB section
*/
import { text, note, isCancel, cancel, select, confirm } from '@clack/prompts';
import pc from 'picocolors';
import { configurationPrompt } from '../configuration.js';

export async function configureMongoDB(privateConfigData = {}) {
	// Extract the relevant MongoDB configuration
	const { DB_TYPE, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = privateConfigData;

	// Display existing configuration if present
	if (DB_TYPE && DB_HOST && DB_PORT && DB_NAME && DB_USER && DB_PASSWORD) {
		note(
			`DB_TYPE: ${pc.red(DB_TYPE)}\n` +
				`DB_HOST: ${pc.red(DB_HOST)}\n` +
				`DB_PORT: ${pc.red(DB_PORT)}\n` +
				`DB_NAME: ${pc.red(DB_NAME)}\n` +
				`DB_USER: ${pc.red(DB_USER)}\n` +
				`DB_PASSWORD: ${pc.red(DB_PASSWORD)}`,
			pc.red('Existing MongoDB configuration found:')
		);

		const continueWithExisting = await confirm({
			message: 'Do you want to continue with this configuration?',
			initialValue: true
		});

		if (isCancel(continueWithExisting) || !continueWithExisting) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}

		return {
			DB_TYPE,
			DB_HOST,
			DB_PORT,
			DB_NAME,
			DB_USER,
			DB_PASSWORD
		};
	}

	// Initial guide note
	note(
		`${pc.green('MongoDB Atlas')} is recommended for production, while\n` +
			`${pc.green('Docker')} and ${pc.green('Local setups')} are suitable for development environments.`,
		pc.green('Please choose your MongoDB setup option:')
	);

	// Choose MongoDB option
	const mongoOption = await select({
		message: 'Choose your MongoDB option:',
		initialValue: privateConfigData.DB_PROVIDER || 'atlas',
		options: [
			{ value: 'atlas', label: 'Use MongoDB Atlas', hint: 'Recommended for Production' },
			{ value: 'docker-local', label: 'Use Docker or Local MongoDB', hint: 'Recommended for Development' }
		],
		required: true
	});

	if (isCancel(mongoOption)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt();
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

		// Atlas connection string
		connectionString = await text({
			message: 'Enter your MongoDB Atlas connection string:',
			placeholder: 'mongodb+srv://<username>:<password>@<cluster-name>',
			required: true
		});

		if (isCancel(connectionString)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}

		// Parse the connection string to extract the username and hostname
		const url = new URL(connectionString);
		dbUser = url.username;
		dbPassword = decodeURIComponent(url.password); // Decode the password
		dbHost = `mongodb+srv://${url.hostname}`;
		dbPort = '';

		// Confirm the Atlas password
		const password = await text({
			message: `Is this password correct for ${pc.green(dbUser)}:`,
			initialValue: dbPassword
		});

		if (isCancel(password)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}
		dbPassword = password;

		// Prompt for the database name
		dbName = await text({
			message: 'Enter the database name:',
			placeholder: 'SveltyCMS',
			initialValue: privateConfigData.DB_NAME || 'SveltyCMS',
			required: true
		});

		if (isCancel(dbName)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}
		// MongoDB Atlas does not expose a port in the connection string, default to 27017
		dbPort = '27017';
		dbPassword = password;
		// Reconstruct the connection string with the password
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
			message: 'Enter the MongoDB host:',
			placeholder: 'mongodb://localhost', // Updated placeholder to include the scheme
			initialValue: privateConfigData.DB_HOST || 'mongodb://localhost', // Updated initialValue to match the placeholder
			required: true
		});

		if (isCancel(dbHost)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}

		// Database Port
		dbPort = await text({
			message: 'Enter the MongoDB port:',
			placeholder: '27017',
			initialValue: privateConfigData.DB_PORT || '27017',
			required: true
		});

		if (isCancel(dbPort)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}

		// Database Name
		dbName = await text({
			message: 'Enter the database name:',
			placeholder: 'SveltyCMS',
			initialValue: privateConfigData.DB_NAME || 'SveltyCMS',
			required: true
		});

		if (isCancel(dbName)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}

		// Database User
		dbUser = await text({
			message: 'Enter the MongoDB user:',
			placeholder: 'Username if set, otherwise leave blank',
			initialValue: privateConfigData.DB_USER,
			required: false
		});

		if (isCancel(dbUser)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}

		// Database Password
		dbPassword = await text({
			message: 'Enter the MongoDB password:',
			placeholder: 'Password if set, otherwise leave blank',
			initialValue: privateConfigData.DB_PASSWORD,
			required: false
		});

		if (isCancel(dbPassword)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}
	}

	return {
		DB_TYPE: 'mongodb',
		DB_HOST: dbHost,
		DB_PORT: dbPort,
		DB_NAME: dbName,
		DB_USER: dbUser,
		DB_PASSWORD: dbPassword
	};
}
