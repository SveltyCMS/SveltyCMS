/** 
@file cli-installer/config/redis.js
@description Configuration prompts for the Redis section
*/

import { confirm, select, text, note, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';
import { configurationPrompt } from '../configuration.js';

export async function configureRedis(privateConfigData = {}) {
	// SveltyCMS Title
	Title();

	// Display a note about the Redis configuration
	note(
		`The Redis configuration allows you to set up Redis caching for\n` +
			`your application. Redis can help improve performance by caching\n` +
			`frequently accessed data.`,
		pc.green('Redis Configuration:')
	);

	// Display existing configuration
	note(
		`USE_REDIS: ${pc.red(privateConfigData.USE_REDIS ? 'true' : 'false')}\n` +
			`REDIS_HOST: ${pc.red(privateConfigData.REDIS_HOST)}\n` +
			`REDIS_PORT: ${pc.red(privateConfigData.REDIS_PORT ? privateConfigData.REDIS_PORT.toString() : 'Not set')}\n` +
			`REDIS_PASSWORD: ${pc.red(privateConfigData.REDIS_PASSWORD)}`,
		pc.red('Existing Redis Configuration:')
	);

	// Enable Redis Caching (optional - Not yet implemented)
	const USE_REDIS = await confirm({
		message: 'Enable Redis Caching?',
		placeholder: 'false / true',
		initialValue: privateConfigData.USE_REDIS || false
	});

	if (isCancel(USE_REDIS)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	let REDIS_HOST = 'localhost';
	let REDIS_PORT = 6379;
	let REDIS_PASSWORD = '';

	if (USE_REDIS) {
		// Collect Redis host and port
		REDIS_HOST = await text({
			message: 'Enter the Redis host address:',
			placeholder: 'localhost',
			initialValue: privateConfigData.REDIS_HOST || 'localhost',
			validate(value) {
				if (value.length === 0) return `Please enter a host`;
			}
		});

		if (isCancel(REDIS_HOST)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		REDIS_PORT = await text({
			message: 'Enter the Redis port:',
			placeholder: '6379',
			initialValue: privateConfigData.REDIS_PORT?.toString() || '6379',
			validate(value) {
				if (value.length === 0) return `Please enter a valid port`;
			}
		});

		if (isCancel(REDIS_PORT)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		// Determine if a password should be used
		const USE_PASSWORD = await confirm({
			message: 'Do you want to set a password for Redis?',
			initialValue: privateConfigData.USE_PASSWORD || false
		});

		if (isCancel(USE_PASSWORD)) {
			cancel('Operation cancelled.');
			console.clear();
			await configurationPrompt(); // Restart the configuration process
			return;
		}

		if (USE_PASSWORD) {
			REDIS_PASSWORD = await text({
				message: 'Enter the Redis password:',
				placeholder: 'Secure password',
				initialValue: privateConfigData.REDIS_PASSWORD || ''
			});

			if (isCancel(REDIS_PASSWORD)) {
				cancel('Operation cancelled.');
				console.clear();
				await configurationPrompt(); // Restart the configuration process
				return;
			}
		}
	}

	// Summary
	note(
		`USE_REDIS: ${pc.green(USE_REDIS ? 'true' : 'false')}\n` +
			(USE_REDIS ? `REDIS_HOST: ${pc.green(REDIS_HOST)}\n` : '') +
			(USE_REDIS ? `REDIS_PORT: ${pc.green(REDIS_PORT)}\n` : '') +
			(USE_REDIS && REDIS_PASSWORD ? `REDIS_PASSWORD: ${pc.green(REDIS_PASSWORD)}\n` : ''),
		pc.green('Review your Redis configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialValue: true
	});

	if (isCancel(action)) {
		cancel('Operation cancelled.');
		console.clear();
		await configurationPrompt(); // Restart the configuration process
		return;
	}

	if (!action) {
		console.log('Redis configuration canceled.');
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
			return configureRedis();
		} else if (restartOrExit === 'exit') {
			process.exit(1); // Exit with code 1
		} else if (restartOrExit === 'cancel') {
			process.exit(0); // Exit with code 0
		}
	}

	// Compile and return the configuration data
	return {
		USE_REDIS,
		REDIS_HOST: USE_REDIS ? REDIS_HOST : undefined,
		REDIS_PORT: USE_REDIS ? REDIS_PORT : undefined,
		REDIS_PASSWORD: USE_REDIS && REDIS_PASSWORD ? REDIS_PASSWORD : undefined
	};
}
