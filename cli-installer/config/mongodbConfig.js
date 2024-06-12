import { text, confirm, select, note, isCancel, cancel, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { configurationPrompt } from '../configuration.js';

// Function to test MongoDB connection
async function testMongoDBConnection(host, dbName, user, password) {
	const mongoose = await import('mongoose');
	try {
		const connectionString = `mongodb://${user}:${password}@${host}/${dbName}`;
		await mongoose.default.connect(connectionString);
		await mongoose.default.connection.db.admin().ping();
		return true;
	} catch (error) {
		if (error.message.includes('getaddrinfo')) {
			throw new Error(
				'Unable to resolve the MongoDB host URL. Please check the DB_HOST value and ensure that the hostname or IP address is correct.'
			);
		} else if (error.message.includes('IP access list')) {
			throw new Error('Your IP address is not whitelisted on the MongoDB Atlas cluster. Please whitelist your IP address and try again.');
		} else {
			throw new Error(`Connection Error: ${error.message}`);
		}
	}
}

export async function configureMongoDB(privateConfigData = {}) {
	// Extract the relevant MongoDB configuration
	const { DB_TYPE, DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = privateConfigData;

	// Display existing configuration if present
	if (DB_TYPE && DB_HOST && DB_NAME && DB_USER && DB_PASSWORD) {
		note(
			`DB_TYPE: ${pc.red(DB_TYPE)}\n` +
				`DB_HOST: ${pc.red(DB_HOST)}\n` +
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
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		return {
			DB_HOST,
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

	let dbHost, dbUser, dbPassword, dbName;

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
		const connectionString = await text({
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

		// Parse the connection string to extract the username
		const url = new URL(connectionString);
		dbUser = url.username;

		// Atlas Password
		const password = await text({
			message: `Enter the database password for ${pc.green(dbUser)}:`,
			required: true
		});

		if (isCancel(password)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}

		// Parse missing values from the connection string
		dbHost = url.host;
		dbPassword = password;
		dbName = url.pathname.replace('/', ''); // Extract the database name from the URL
	} else if (mongoOption === 'docker-local') {
		note(
			`To set up Docker or Local MongoDB, you need to have Docker installed and running on your machine if using Docker.\n` +
				`Ensure your Docker container is running with the MongoDB image or your local MongoDB server is running.\n\n` +
				`Here is an example Docker command to run MongoDB:\n` +
				`${pc.green('docker run --name mongodb -d -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=secret mongo')}\n\n` +
				`Here is an example command to start MongoDB locally:\n` +
				`${pc.green('mongod --dbpath /path/to/your/db')}`,
			pc.green('Docker/Local MongoDB Setup Instructions:')
		);

		dbHost = await text({
			message: 'Enter the MongoDB host:',
			placeholder: 'mongodb://localhost:27017',
			initialValue: privateConfigData.DB_HOST,
			required: true
		});

		if (isCancel(dbHost)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}

		dbName = await text({
			message: 'Enter the database name:',
			placeholder: 'SvelteCMS',
			initialValue: privateConfigData.DB_NAME || 'SvelteCMS',
			required: true
		});

		if (isCancel(dbName)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt();
			return;
		}

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

	let isConnectionSuccessful = false;
	const s = spinner();
	try {
		s.start('Testing MongoDB connection...');
		isConnectionSuccessful = await testMongoDBConnection(dbHost, dbName, dbUser, dbPassword);
		s.stop();
	} catch (error) {
		s.stop();
		note(
			`${pc.red('MongoDB connection failed:')} ${error.message}\n` + 'Please check your connection details and try again.',
			pc.red('Connection Error')
		);
	}

	if (isConnectionSuccessful) {
		note(`${pc.green('MongoDB connection successful!')}`, pc.green('Connection Test Result:'));
	} else {
		console.log(pc.red('◆  MongoDB connection test failed.') + ' Please check your connection details and try again.');
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
			return configureMongoDB(privateConfigData);
		}
	}

	note(
		`DB_HOST: ${pc.green(dbHost)}\n` + `DB_NAME: ${pc.green(dbName)}\n` + `DB_USER: ${pc.green(dbUser)}\n` + `DB_PASSWORD: ${pc.green(dbPassword)}`,
		pc.green('Review your MongoDB configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialValue: true
	});

	if (isCancel(action)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt();
		return;
	}

	if (!action) {
		console.log('MongoDB configuration canceled.');
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
			await configurationPrompt();
			return;
		}

		if (restartOrExit === 'restart') {
			return configureMongoDB();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	return {
		DB_HOST: dbHost,
		DB_NAME: dbName,
		DB_USER: dbUser,
		DB_PASSWORD: dbPassword
	};
}
