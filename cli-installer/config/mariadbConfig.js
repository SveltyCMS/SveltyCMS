import { text, confirm, select, note, isCancel, cancel, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { configurationPrompt } from '../configuration.js';

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

export async function configureMariaDB(privateConfigData = {}) {
	let connectionString;

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
			return configureMariaDB(privateConfigData); // Restart the database configuration
		}
	}

	return connectionString;
}
