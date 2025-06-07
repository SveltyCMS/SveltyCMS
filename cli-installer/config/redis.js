/** 
@file cli-installer/config/redis.js
@description Configuration prompts for the Redis section

### Features
- Displays a note about the Redis configuration
- Displays existing configuration (password hidden)
- Prompts for Redis integration
*/

import { confirm, text, note, isCancel, password } from '@clack/prompts';
import pc from 'picocolors';
import { Title, cancelToMainMenu } from '../cli-installer.js';

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

	// Display existing configuration (password hidden)
	if (privateConfigData.REDIS_HOST !== undefined) {
		// Check if key exists
		note(
			`Redis Enabled: ${pc.cyan(privateConfigData.USE_REDIS ? 'Yes' : 'No')}\n` +
				`Redis Host: ${pc.cyan(privateConfigData.REDIS_HOST || 'Not set')}\n` +
				`Redis Port: ${pc.cyan(privateConfigData.REDIS_PORT?.toString() || 'Not set')}`,
			//`REDIS_PASSWORD: ${pc.red(privateConfigData.REDIS_PASSWORD)}`, // Keep password hidden
			pc.cyan('Existing Redis Configuration (Password hidden):')
		);
	}

	const USE_REDIS = await confirm({
		message: 'Enable Redis Caching?',
		initialValue: privateConfigData.USE_REDIS || false
	});
	if (isCancel(USE_REDIS)) {
		cancelToMainMenu();
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
				if (!value || value.length === 0) return { message: `Please enter a host` };
				return undefined;
			}
		});
		if (isCancel(REDIS_HOST)) {
			cancelToMainMenu();
			return;
		}

		REDIS_PORT = await text({
			message: 'Enter the Redis port:',
			placeholder: '6379',
			initialValue: privateConfigData.REDIS_PORT?.toString() || '6379',
			validate(value) {
				if (value === null || value === undefined || value === '') return { message: `Port is required.` };
				const num = Number(value);
				if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 65535) {
					return { message: `Please enter a valid port number (1-65535).` };
				}
				return undefined;
			}
		});
		if (isCancel(REDIS_PORT)) {
			cancelToMainMenu();
			return;
		}
		REDIS_PORT = parseInt(REDIS_PORT, 10); // Convert to number

		// Use password prompt directly
		REDIS_PASSWORD = await password({
			message: 'Enter the Redis password (leave blank if none):'
		});
		if (isCancel(REDIS_PASSWORD)) {
			cancelToMainMenu();
			return;
		}
	} else {
		// Clear Redis details if disabled
		REDIS_HOST = '';
		REDIS_PORT = 0; // Or null/undefined, depending on how config expects it
		REDIS_PASSWORD = '';
	}

	// Summary (Password hidden)
	note(
		`Enable Redis: ${pc.green(USE_REDIS ? 'Yes' : 'No')}\n` +
			(USE_REDIS ? `Redis Host: ${pc.green(REDIS_HOST)}\n` : '') +
			(USE_REDIS ? `Redis Port: ${pc.green(REDIS_PORT)}\n` : '') +
			(USE_REDIS && REDIS_PASSWORD ? `Redis Password: ${pc.green('[Set]')}\n` : ''),
		pc.green('Review Your Redis Configuration:')
	);

	const confirmSave = await confirm({
		message: 'Save this Redis configuration?',
		initialValue: true
	});

	if (isCancel(confirmSave)) {
		cancelToMainMenu();
		return;
	}

	if (!confirmSave) {
		note('Configuration not saved.', pc.yellow('Action Cancelled'));
		cancelToMainMenu(); // Return to main config menu
		return;
	}

	// Compile and return the configuration data
	return {
		USE_REDIS,
		REDIS_HOST: USE_REDIS ? REDIS_HOST : undefined,
		REDIS_PORT: USE_REDIS ? REDIS_PORT : undefined,
		REDIS_PASSWORD: USE_REDIS && REDIS_PASSWORD ? REDIS_PASSWORD : undefined
	};
}
