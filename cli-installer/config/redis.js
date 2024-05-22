import { confirm, select, text, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureRedis() {
	// SveltyCMS Title
	Title();

	// Configuration Title
	console.log(pc.blue('◆  Redis Configuration:'));

	// Enable Redis Caching (optional - Not yet implemented)
	const USE_REDIS = await confirm({
		message: 'Enable Redis Caching?',
		initialValue: false
	});

	let REDIS_HOST = 'localhost';
	let REDIS_PORT = 6379;
	let REDIS_PASSWORD = '';

	if (USE_REDIS) {
		// Collect Redis host and port
		REDIS_HOST = await text({
			message: 'Enter the Redis host address:',
			placeholder: 'localhost',
			initialValue: 'localhost',
			validate(value) {
				if (value.length === 0) return `Please enter a host`;
			}
		});

		REDIS_PORT = await text({
			message: 'Enter the Redis port:',
			placeholder: '6379',
			initialValue: '6379',
			validate(value) {
				if (value.length === 0) return `Please enter a valid port`;
			}
		});

		// Determine if a password should be used
		const USE_PASSWORD = await confirm({
			message: 'Do you want to set a password for Redis?',
			initialValue: false
		});

		if (USE_PASSWORD) {
			REDIS_PASSWORD = await text({
				message: 'Enter the Redis password:',
				placeholder: 'Secure password'
			});
		}
	}

	// Summary
	note(
		`USE_REDIS: ${USE_REDIS}\n` +
			(USE_REDIS ? `REDIS_HOST: ${pc.green(REDIS_HOST)}\n` : '') +
			(USE_REDIS ? `REDIS_PORT:${pc.green(REDIS_PORT)}\n` : '') +
			(USE_REDIS && REDIS_PASSWORD ? `REDIS_PASSWORD:${pc.green(REDIS_PASSWORD)}\n` : ''),
		pc.green('Review your Redis configuration:')
	);

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initialinitiaValue: true
	});

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
