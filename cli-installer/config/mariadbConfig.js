import { text, confirm, note, isCancel, cancel, select } from '@clack/prompts';
import pc from 'picocolors';
import { configurationPrompt } from '../configuration.js';

export async function configureMariaDB(privateConfigData = {}) {
	// Notify user about alpha stage
	note(`${pc.red('MariaDB configuration is in alpha stage and not ready for production use.')}`, pc.red('Alpha Stage Notice:'));

	// Extract the relevant MariaDB configuration
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
			pc.red('Existing MariaDB configuration found:')
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
			DB_PORT,
			DB_NAME,
			DB_USER,
			DB_PASSWORD
		};
	}

	// Initial guide note
	note(`Please choose your MariaDB setup option:`, pc.green('MariaDB Setup:'));

	// Choose MariaDB option
	const mariadbOption = await select({
		message: 'Choose your MariaDB option:',
		initialValue: privateConfigData.DB_PROVIDER || 'local',
		options: [
			{ value: 'local', label: 'Use Local MariaDB', hint: 'For Development' },
			{ value: 'docker', label: 'Use Docker MariaDB', hint: 'For Development' }
		],
		required: true
	});

	if (isCancel(mariadbOption)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	// Provide specific instructions based on the chosen option
	if (mariadbOption === 'local') {
		note(
			`To set up a local MariaDB instance, make sure you have MariaDB installed and running on your machine.\n` +
				`You can follow the official installation guide: ${pc.blue('https://mariadb.com/kb/en/getting-installing-and-upgrading-mariadb/')}`,
			pc.green('Local MariaDB Setup Instructions:')
		);
	} else if (mariadbOption === 'docker') {
		note(
			`To set up MariaDB using Docker, make sure you have Docker installed and running on your machine.\n` +
				`You can use the following command to run a MariaDB container:\n\n` +
				`${pc.green('docker run --name mariadb -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mariadb:latest')}\n\n` +
				`Replace ${pc.green('my-secret-pw')} with your desired root password.`,
			pc.green('Docker MariaDB Setup Instructions:')
		);
	}

	// Database Host
	const dbHost = await text({
		message: 'Enter your MariaDB host:',
		placeholder: 'localhost',
		initialValue: privateConfigData.DB_HOST || 'localhost',
		required: true
	});

	if (isCancel(dbHost)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	// Database Port
	const dbPort = await text({
		message: 'Enter your MariaDB port:',
		placeholder: '3306',
		initialValue: privateConfigData.DB_PORT || '3306',
		required: true
	});

	if (isCancel(dbPort)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	// Database User
	const dbUser = await text({
		message: 'Enter your MariaDB user:',
		placeholder: 'demo',
		initialValue: privateConfigData.DB_USER || 'demo',
		required: true
	});

	if (isCancel(dbUser)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	// Database Password
	const dbPassword = await text({
		message: 'Enter your MariaDB password:',
		placeholder: 'password',
		initialValue: privateConfigData.DB_PASSWORD,
		required: true
	});

	if (isCancel(dbPassword)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	// Database Name
	const dbName = await text({
		message: 'Enter your MariaDB database name:',
		placeholder: 'demo',
		initialValue: privateConfigData.DB_NAME || 'demo',
		required: true
	});

	if (isCancel(dbName)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	return {
		DB_HOST: dbHost,
		DB_PORT: dbPort,
		DB_NAME: dbName,
		DB_USER: dbUser,
		DB_PASSWORD: dbPassword
	};
}
